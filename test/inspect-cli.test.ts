// =====================================================================
// scripts/inspect.ts 的判据 —— CLI 面的三条出口纪律, 每条都有对应的坏结果
//
// 为什么值得起一个真实进程来测(本仓第一个 spawn 型测试): 这个文件的失败模式**全在进程边界上**,
// 纯函数测试碰不到:
//   · 退出码分档(0 通过 / 1 门禁不过 / 2 用法错) —— shell 里 `&&` 链全靠它
//   · **读数走 stdout、工具的话走 stderr** —— 本仓已因 `2>&1` 把诊断写进产物头部一次
//   · 目标模块顶层往 stdout 吐东西时**改道** —— 不测的话它会静默混进产物(同族事故)
//   · `--fit` 是**审计次序**的开关(先 fitScene 再审) —— 开/关两态的退出码与 single_svg 都在这测:
//     它错一点, 读数板就会把 `0×0 + fit` 的场景误判成"内容越界"(或反过来把真越界洗白)
// =====================================================================

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SKILL = join(import.meta.dir, '..');
const CLI = join(SKILL, 'scripts', 'inspect.ts');
const AUDIT = join(SKILL, 'src/knives/audit.ts');

let dir = '';

const SCENE_OK = `
import type { Scene } from '${AUDIT}';
const scene: Scene = {
  width: 400, height: 300,
  nodes: [{ id: 'a', rect: { x: 40, y: 40, w: 120, h: 50 }, label: 'A' },
          { id: 'b', rect: { x: 240, y: 40, w: 120, h: 50 }, label: 'B' }],
  edges: [{ id: 'e', from: 'a', to: 'b', points: [{ x: 160, y: 65 }, { x: 240, y: 65 }] }],
};
export default scene;
`;

/** 顶层就往上吐的模块 —— 出图脚本的形态。它吐的东西**不许进读数** */
const SCENE_SHOUTY = `console.log('NOISE-TOP-LEVEL');\n${SCENE_OK}`;

/** 门禁不过的场景(两盒互叠) —— 退出码 1, 但读数必须照打全("拦带病出厂, 不是不让你看") */
const SCENE_FAIL = `
import type { Scene } from '${AUDIT}';
const scene: Scene = {
  width: 400, height: 300,
  nodes: [{ id: 'a', rect: { x: 40, y: 40, w: 120, h: 50 }, label: 'A' },
          { id: 'b', rect: { x: 40, y: 70, w: 120, h: 50 }, label: 'B' }],
  edges: [],
};
export default scene;
`;

/** `0×0 + fit` 那一族的形态(画布交给出口按内容重定): 直接 audit 就是"全员越出画布" */
const SCENE_ZERO = `
import type { Scene } from '${AUDIT}';
const scene: Scene = {
  width: 0, height: 0,
  nodes: [{ id: 'a', rect: { x: 40, y: 40, w: 120, h: 50 }, label: 'A' },
          { id: 'b', rect: { x: 240, y: 40, w: 120, h: 50 }, label: 'B' }],
  edges: [{ id: 'e', from: 'a', to: 'b', points: [{ x: 160, y: 65 }, { x: 240, y: 65 }] }],
};
export default scene;
`;

/** 同上 + **作者声明的 fit 口径**(与出口 `runScene(scene, { fit: FIT })` 是同一个字面量) */
const SCENE_ZERO_FIT = `${SCENE_ZERO}\nexport const FIT = { padding: 60 };\n`;

type Run = { code: number; out: string; err: string };

function run(args: string[]): Run {
  const p = Bun.spawnSync({ cmd: [process.execPath, 'run', CLI, ...args], cwd: SKILL, stdout: 'pipe', stderr: 'pipe' });
  return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
}

const fixture = (name: string, body: string): string => {
  const p = join(dir, name);
  writeFileSync(p, body, 'utf8');
  return p;
};

beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'md-inspect-')); });
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

describe('inspect CLI · 三条出口纪律', () => {
  it('不给路径: 跑内置演示场景, 退出码 0, 读数进 stdout / 提示进 stderr', () => {
    const r = run([]);
    expect(r.code).toBe(0);
    expect(r.out).toContain('# svg-infovis 场景读数');
    expect(r.out).toContain('## nodes (3)');
    expect(r.err).toContain('内置演示场景');
    expect(r.err).toContain('✓ 门禁通过(standard)');
  });

  it('指向 scene 模块: 读出真实坐标, --metrics 展开 47 项', () => {
    const r = run([fixture('ok.ts', SCENE_OK)]);
    expect(r.code).toBe(0);
    expect(r.out).toContain('nodes 2 · edges 1');
    expect(r.out).toContain('(160,65) (240,65)');
    expect(r.out).not.toContain('## metrics (');     // 缺省关
    const m = run([fixture('ok.ts', SCENE_OK), '--metrics']);
    expect(m.out).toContain('## metrics (');
    expect(m.out).toContain('  nodes = 2');
  });

  it('目标模块顶层往 stdout 吐东西: 改道 stderr, 产物一个字节都不混', () => {
    const r = run([fixture('shouty.ts', SCENE_SHOUTY)]);
    expect(r.code).toBe(0);
    expect(r.out).not.toContain('NOISE-TOP-LEVEL');   // ← 这条挂了就说明产物被污染
    expect(r.err).toContain('NOISE-TOP-LEVEL');       // 看得见, 但在 stderr
    expect(r.err).toContain('已改道 stderr');
  });

  it('门禁不过: 退出码 1, 读数照样全量打出 + stderr 给出判决', () => {
    const r = run([fixture('fail.ts', SCENE_FAIL)]);
    expect(r.code).toBe(1);
    expect(r.out).toContain('node_overlap[error]');
    expect(r.out).toContain('## 修法 (');
    expect(r.err).toContain('✗ 门禁不过(standard)');
  });

  it('用法错一律退出码 2(与"图有病"的 1 分开): 路径不存在 / 没有 scene 导出 / 参数坏', () => {
    const missing = run([join(dir, 'nope.ts')]);
    expect(missing.code).toBe(2);
    expect(missing.err).toContain('加载失败');
    expect(missing.out).toBe('');

    const empty = run([fixture('empty.ts', 'export const nothing = 1;\n')]);
    expect(empty.code).toBe(2);
    expect(empty.err).toContain('没找到场景');
    expect(empty.err).toContain('nothing');            // 报出它到底导出了什么, 不让人猜
    expect(empty.out).toBe('');

    expect(run(['--rows=0', fixture('ok.ts', SCENE_OK)]).code).toBe(2);
    expect(run(['--nope']).code).toBe(2);
    expect(run(['--fit=1', fixture('ok.ts', SCENE_OK)]).code).toBe(2);   // `--fit` 是开关, 不带值
  });

  it('--showcase 改档: 判决行跟着档位走', () => {
    expect(run([fixture('ok.ts', SCENE_OK), '--showcase']).out).toContain('# audit(showcase)');
  });

  // --- --fit: 与出口同一次序(先 fitScene 再审) ------------------------------
  it('--fit 抹平 `0×0 + fit` 的越界误红; 缺省仍是老行为(直接审原 scene → exit 1)', () => {
    const zero = fixture('zero.ts', SCENE_ZERO);

    const off = run([zero, '--showcase']);
    expect(off.code).toBe(1);                          // ← 老行为: 0×0 画布装不下任何东西
    expect(off.out).toContain('single_svg[error]');
    expect(off.out).not.toContain('--fit:');           // 没开就一行都不许打(免得读者以为读数被 fit 过)

    const on = run([zero, '--showcase', '--fit']);
    expect(on.code).toBe(0);
    expect(on.out).not.toContain('[error]');           // ← 这条挂了 = fit 没接到审计前面
    expect(on.out.startsWith('# --fit:')).toBe(true);  // 说明行在读数**头部**: 读者先知道"这份是 fit 后的"
    expect(on.out).toContain('场景读数 · 354×84 ·');    // describeScene 吃的是 fit 后那份(322+16*2 × 52+16*2)
    expect(on.err).toContain('✓ 门禁通过(showcase)');
  });

  it('--fit 会平移原点(坐标读数跟着走), 但声明画布的场景两态判决一致', () => {
    const ok = fixture('ok.ts', SCENE_OK);
    const plain = run([ok]);                           // full-chain 那一族: 自己把画布算准, 不靠 fit
    expect(plain.code).toBe(0);
    expect(plain.out).toContain('x     40 y     40');  // 作者摆的坐标

    const fitted = run([ok, '--fit']);
    expect(fitted.code).toBe(0);                       // 判决不变(差集只有原点)
    expect(fitted.out).toContain('x     17 y     17'); // 内容左缘贴到 padding 16 + bleed 1: 40 → 17
    expect(plain.out).not.toContain('x     17 y     17');
  });

  it('--fit 的参数取**模块导出的 FIT**(作者声明的口径), 没声明才走 export 缺省', () => {
    const r = run([fixture('zero-fit.ts', SCENE_ZERO_FIT), '--fit']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('fit 参数 {"padding":60}(模块导出的 FIT)');
    expect(r.out).toContain('x     61 y     61');      // padding 60: 平移 60 - 39 = 21 → 40 → 61
    expect(run([fixture('zero.ts', SCENE_ZERO), '--fit']).out).toContain('fit 参数 {}(export 缺省)');
  });
});
