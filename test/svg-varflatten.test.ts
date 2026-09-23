// =====================================================================
// scripts/svg-varflatten.ts 的判据 —— 为什么起真进程测: 它的失败模式全在**进/出口**上
//   · 产物走 stdout / 诊断走 stderr(本仓已因 `2>&1` 把诊断写进产物头一次)
//   · 退出码分档: 2 用法错 / 1 "这份输入展平不了" / 0 正常(含 no-op 与带残留)
//   · **残留不失败** —— 否则 `flatten && svg2png` 会在运行期变量上断链
//   · no-op 必须逐字节相同 —— 它是链上的一环, 不许偷偷改产物
// =====================================================================

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const TOOL = join(ROOT, 'scripts', 'svg-varflatten.ts');

const HEAD = '<svg xmlns="http://www.w3.org/2000/svg">';
const SINGLE = `${HEAD}<style>:root, svg { --bg: #020617; --frontend-stroke: #22d3ee; }</style>` +
  '<rect fill="var(--bg)"/><path stroke="var(--frontend-stroke)"/></svg>';
/** 双主题: 基础档深色 + light 媒体查询档白色 —— 与 archify 缺省输出的形状同构 */
const DUAL = `${HEAD}<style>
:root, svg { --bg: #020617; --text: #ffffff; }
@media (prefers-color-scheme: light) { :root, svg { --bg: #f8fafc; --text: #0f172a; } }
</style><rect fill="var(--bg)"/><text fill="var(--text)">x</text></svg>`;
const FALLBACK = `${HEAD}<style>:root { --bg: #020617; }</style>` +
  '<rect fill="var(--bg)"/><path stroke="var(--nope, #00ff00)"/><path stroke="var(--gone)"/></svg>';
const NOVARS = `${HEAD}<rect fill="#ff0000"/></svg>`;
const REFS_ONLY = `${HEAD}<rect fill="var(--x)"/></svg>`;

let dir = '';

type Run = { code: number; out: string; err: string };

function run(args: string[]): Run {
  const p = Bun.spawnSync({ cmd: [process.execPath, 'run', TOOL, ...args], cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });
  return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
}

const fixture = (name: string, body: string): string => {
  const p = join(dir, name);
  writeFileSync(p, body, 'utf8');
  return p;
};

beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'svg-varflatten-')); });
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

describe('svg-varflatten · 展平与三条出口纪律', () => {
  it('单套定义: 引用代成字面值, 代入数报出来', () => {
    const r = run([fixture('single.svg', SINGLE)]);
    expect(r.code).toBe(0);
    expect(r.out).toContain('fill="#020617"');
    expect(r.out).toContain('stroke="#22d3ee"');
    expect(r.out).not.toContain('var(--');
    expect(r.err).toContain('代入 2 处');
    expect(r.err).toContain('本文件只有一套定义');
    expect(r.err).toContain('无残留');
  });

  it('双主题: 默认取深色档, --theme light 换另一套', () => {
    const dark = run([fixture('dual.svg', DUAL)]);
    expect(dark.code).toBe(0);
    expect(dark.out).toContain('fill="#020617"');        // 只认**属性上的**取值: 定义块里两套都在, 不能按色值出现与否判
    expect(dark.out).toContain('fill="#ffffff"');
    expect(dark.err).toContain('dark 档');

    const light = run([fixture('dual.svg', DUAL), '--theme', 'light']);
    expect(light.code).toBe(0);
    expect(light.out).toContain('fill="#f8fafc"');
    expect(light.out).toContain('fill="#0f172a"');
    expect(light.err).toContain('light 档');
  });

  it('fallback 算代入; 未定义又无 fallback 的留原样 + 报残留, 但**退出码仍 0**(链不断)', () => {
    const r = run([fixture('fb.svg', FALLBACK)]);
    expect(r.code).toBe(0);
    expect(r.out).toContain('fill="#020617"');
    expect(r.out).toContain('stroke="#00ff00"');          // var(--nope, #00ff00) → 取 fallback
    expect(r.out).toContain('var(--gone)');               // 无 fallback → 原地不动
    expect(r.err).toContain('残留 1 处');
    expect(r.err).toContain('--gone');
  });

  it('本来就没有变量定义: no-op, 逐字节相同 + 退出码 0(可直接串进栅格化链)', () => {
    const r = run([fixture('novars.svg', NOVARS)]);
    expect(r.code).toBe(0);
    expect(r.out).toBe(NOVARS);
    expect(r.err).toContain('无需处理');
  });

  it('给 out 文件: 产物落盘, stdout 一个字节都不吐(诊断全在 stderr)', () => {
    const out = join(dir, 'flat.svg');
    const r = run([fixture('single.svg', SINGLE), out]);
    expect(r.code).toBe(0);
    expect(r.out).toBe('');
    expect(readFileSync(out, 'utf8')).toContain('fill="#020617"');
  });

  it('有 var() 引用却一处定义都没有 ⇒ 展平不了, 退出码 1(与"我命令写错"的 2 分开)', () => {
    const r = run([fixture('refs-only.svg', REFS_ONLY)]);
    expect(r.code).toBe(1);
    expect(r.err).toContain('展平不了');
    expect(r.out).toBe('');
  });

  it('用法错一律退出码 2: 路径不存在 / --theme 值坏 / 不认识的参数 / 没给输入', () => {
    for (const args of [[join(dir, 'nope.svg')], ['--theme', 'blue', fixture('single.svg', SINGLE)], ['--nope'], []]) {
      const r = run(args);
      expect(r.code).toBe(2);
      expect(r.out).toBe('');
    }
  });
});
