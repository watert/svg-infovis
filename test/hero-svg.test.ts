// =====================================================================
// hero-svg · README 首图的**字节守卫**(260926)
//
// 为什么值得进 test: README 首图从 PNG 快照换成 committed 的 `assets/hero.svg` 之后, 它唯一的失效
// 方式是**静默过时** —— 内核改了字节、hero 还是旧图, 而图照样渲染、文档照样好看, 没有任何东西会响。
// 过去这一档靠"快照已出"的肉眼对账(PNG 像素还得人去看); 现在靠一次字节相等 —— 字节确定性
// 头一回当**守卫**用: 文件与 `full-chain` 的当前导出逐字节一致, 对不上当场红。
//
// 重生命令(hero 过时时跑这一行; 图走 stdout、诊断只走 stderr —— **别 2>&1**,
// 合并会把诊断灌进 SVG 头部, 而文件照样以 `</svg>` 收尾、exit 照样 0: 失败长得像成功):
//
//   bun run examples/start/full-chain.ts > assets/hero.svg
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const HERO = join(ROOT, 'assets', 'hero.svg');
const ENTRY = 'examples/start/full-chain.ts';

describe('assets/hero.svg · README 首图的字节守卫', () => {
  it('与 full-chain 的当前导出逐字节一致(过时了按文件头那一行重出)', () => {
    // 走**文档里那条命令本身**(不是 in-process 复算): 守住的是"照文档跑一遍就能重出这张图"
    const r = spawnSync('bun', ['run', ENTRY], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'buffer' });
    expect(r.status, `bun run ${ENTRY} 退出码 ${r.status}\n${r.stderr.toString('utf8')}`).toBe(0);
    const fresh = r.stdout.toString('utf8');
    expect(fresh.startsWith('<?xml'), 'stdout 不是一张 SVG —— 检查有没有把 stderr 也收进来').toBe(true);
    expect(fresh).toBe(readFileSync(HERO, 'utf8'));
  });

  it('README 首图引的就是它 —— 别让文档指回已退役的 examples/images/', () => {
    const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
    expect(readme).toContain('(assets/hero.svg)');
    expect(readme).not.toContain('examples/images');
  });
});
