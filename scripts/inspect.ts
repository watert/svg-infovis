// =====================================================================
// inspect · 把任意 scene 模块 dump 成一张读数表(describeScene 的 CLI 面)
//
//   bun run scripts/inspect.ts path/to/my-scene.ts           # 只读一张表
//   bun run scripts/inspect.ts path/to/my-scene.ts --metrics # 连 47 个 metrics 一起
//   bun run scripts/inspect.ts path/to/my-scene.ts --showcase --rows=80
//   bun run scripts/inspect.ts path/to/my-scene.ts --fit     # 先按内容定画布再审(出口那一步)
//
// 260920 从 `examples/inspect.ts` 搬到 `scripts/`: 它是**读数 CLI**(往 stdout 吐一张表, 不是 SVG),
// 与"出图示例"不同族 —— 留在 examples/ 里, "示例清单"就得为它写一条"这项不出图"的例外。
//
// 与别处的分工: `full-chain` / `harness-arch` 这些是**画出图来看**, 本文件是**不出图先看清坐标** ——
// 迭代时先用它定位"框为什么叠上了 / 门禁在说哪一条", 定位完再出 SVG(那一步仍要人眼看)。
// 存在的理由见 `src/knives/describe.ts` 头注释(agent 自己写 debug 脚本 dump rect 那一段)。
//
// 三条出口纪律:
//   · 读数走 **stdout**, 工具自己的话走 stderr —— 别 `2>&1`(本仓已因它把诊断写进 SVG 文件头一次)
//   · **audit 只跑一遍**: 拿同一份报告出读数 + 定退出码, 不给"退出码与读数依据不同"的机会
//   · 判决可见: 门禁不过 → 退出码 1(读数照样打全, 拦的是"带病算过", 不是"不让你看")
//
// 用法错误(scene 文件不存在 / 没导出 scene / 参数不认识)→ 退出码 2, 与"门禁不过的 1"分开 ——
// 调用方在 shell 里能一眼区分"图有病"和"我命令写错了"。
//
// 输入文件的约定: **导出场景对象的模块**, 两种写法都认:
//     export default scene;        // 或
//     export const scene = {...};
// ⚠ 它会被 `import` 执行顶层代码 —— 别指着一个"出图脚本"(如 `refs/build-arch.ts`)跑本命令,
//   那种文件的顶层会往 stdout 吐 SVG, 把读数冲成混合产物。
// =====================================================================

import { type Rect } from '../src/geometry/vec';
import { bounds } from '../src/geometry/box';
import { GROUP_FIT_PAD } from '../src/knives/cluster';
import { routeOrthogonal } from '../src/knives/route';
import { type Scene, audit } from '../src/knives/audit';
import { describeScene } from '../src/knives/describe';
import { type FitOptions, fitScene } from '../src/export';

const USAGE = `用法: bun run scripts/inspect.ts [<scene-module.ts>] [--fit] [--metrics] [--showcase] [--rows=N] [--notes=N]

  <scene-module.ts>  导出场景对象的 TS 模块(export default 或 export const scene); 不给则跑内置演示场景
  --fit              先按内容重定画布, 再 audit —— **与出口 exportScene 同一次序**(先 fit 再审),
                     于是 \`0×0 + fit\` 那类场景不会再被报成"内容越出画布"(\`single_svg\`)。
                     缺省**关**: 不给才回答得了"不 fit 直接交付会不会越界"。
                     fit 参数取模块导出的 \`FIT\`(没有则走 export 的缺省), 读数板不自带一套数字。
                     ⚠ fit 会**平移原点**(内容贴住 padding), 于是坐标读数跟着平移 —— 加不加 --fit
                     读数不同是预期, 不是门禁变松
  --metrics          连 metrics 段一起打(缺省只报条数)
  --showcase         用 showcase 档审计(缺省 standard)
  --rows=N           每段最多 N 行(缺省 40)
  --notes=N          每个对象下最多 N 条诊断(缺省 3)`;

// --- 内置演示场景: 只有版式是手写的, 几何一律现算 ----------------------------------

// 三格的盒尺寸与位置是**作者决策**(演示场景的版式: 左列上下两格 + 右侧一格)
const BOX = { w: 160, h: 56 };
const IN: Rect = { x: 60, y: 60, ...BOX };
const MID: Rect = { x: 60, y: 156, ...BOX };
const OUT: Rect = { x: 420, y: 130, ...BOX };

// 折点一个都不手写: 两条边各跑一次 route, 拿回的点列就是 scene 里那一份
// (e-1 直连两格上下; e-2 从 mid 右边出、绕腰线进 out 左边)
const E1 = routeOrthogonal({ from: IN, fromPort: { side: 'bottom' }, to: MID, toPort: { side: 'top' } });
const E2 = routeOrthogonal({ from: MID, fromPort: { side: 'right' }, to: OUT, toPort: { side: 'left' } });

// 组框 = 成员(in / mid 两格)并集 + `GROUP_FIT_PAD`(常量从 `knives/cluster` 引, 不抄数字)——
// 与 audit / describe 的派生同一份口径, 所以读数里 derived 那行与 rect **必然**逐字相同
const GROUP_RECT = bounds([IN, MID], { pad: GROUP_FIT_PAD })!;

/**
 * 内置演示场景: 左列上下两格 + 右侧一格, 两条边(一直一折) + 一个组框, **全部门禁通过** ——
 * 不给路径时跑它(示范代码必须能自己跑起来)。"它仍然全绿"这件事由 `test/inspect-demo.test.ts` 守着
 * —— 判据归 test, 本文件不再自带断言: 断言长在 CLI 里时, 不真的跑一次就**没有任何机器在看着它**。
 *
 * 除版式之外一律派生(260925): 折点走 `routeOrthogonal`、组框走 `bounds(成员, { pad })` ——
 * 于是读数里 derived 那行与 rect 逐字相同是**算出来的**, 不是手抄了一份同值坐标。
 */
export const DEMO: Scene = {
  width: 640, height: 420,
  nodes: [
    { id: 'in', rect: IN, label: '输入' },
    { id: 'mid', rect: MID, label: '处理' },
    { id: 'out', rect: OUT, label: '产物' },
  ],
  edges: [
    { id: 'e-1', from: 'in', to: 'mid', points: E1.points },
    { id: 'e-2', from: 'mid', to: 'out', points: E2.points },
  ],
  groups: [{ id: 'g-box', rect: GROUP_RECT, label: '本地', contains: ['in', 'mid'] }],
};

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  console.error(USAGE);
  process.exit(2);
}

/**
 * 导入期间把 stdout 整个改道 stderr, 返回"被改道了多少字节"与模块本体。
 *
 * 为什么需要: 目标模块会被 `import` 执行顶层代码 —— 指着一个"出图脚本"跑本命令的话, 它的顶层会往
 * stdout 吐 SVG, 把读数冲成混合产物(与 `> x.svg 2>&1` 那次事故同族: **产物被别的东西混进来, 而且
 * 长得像成功**)。改道后混进来看得见, 但绝进不了产物。
 *
 * 覆盖两条路: `process.stdout.write`(显式写)与 `console.log/info/debug`(**实测 Bun 的 console 不走
 * `process.stdout.write`, 只补前者会漏掉 `console.log`**)—— 这条是测试 `inspect-cli.test.ts` 逼出来的:
 * 只改 process.stdout 时, 顶层 `console.log` 照样混进读数。
 * 拦不住的: 直接往 fd 1 写的东西(子进程输出 / native 打印) —— 那已经不属于"本进程的输出"了。
 *
 * 导出给 `scripts/cli.ts` 用: `svginfo run / render` 也要"先看看这份文件是不是场景模块",
 * 那段 import 同样会撞上顶层输出 —— 同一件事只许有一处实现。
 */
export async function loadRedirecting(path: string): Promise<{ mod: Record<string, unknown>; redirected: number }> {
  const realWrite = process.stdout.write.bind(process.stdout);
  const realLog = console.log;
  const realInfo = console.info;
  const realDebug = console.debug;
  let redirected = 0;
  const acc = (c: string): void => { redirected += c.length; };

  process.stdout.write = ((c: unknown) => {
    if (typeof c === 'string') acc(c);
    return process.stderr.write(c as never);
  }) as typeof process.stdout.write;
  for (const k of ['log', 'info', 'debug'] as const) {
    (console as unknown as Record<string, unknown>)[k] = (...args: unknown[]) => {
      acc(args.map(String).join(' ') + '\n');
      console.error(...(args as never[]));
    };
  }

  try {
    return { mod: (await import(path)) as Record<string, unknown>, redirected };
  } finally {
    process.stdout.write = realWrite;
    console.log = realLog;
    console.info = realInfo;
    console.debug = realDebug;
  }
}

/**
 * `--fit` 打开时读数表挂在最前面的那一行: 说清"**这份读数是 fit 之后的**", 免得读者把
 * "single_svg 怎么不报了" 读成"门禁被放松了"。fit 参数原样打出来(模块导出的 `FIT` 还是 export 缺省),
 * 因为"这份读数凭什么长这样"要能一眼对账 —— 但读数板不替出口复述那几个缺省数字(一处事实一处)。
 */
const fitNote = (opts: FitOptions, declared: boolean): string =>
  '# --fit: 读数基于 fit 后场景(先 fitScene 再 audit, 与出口 exportScene 同一次序) —— 坐标已整体平移,'
  + ` "内容越出画布"(\`single_svg\`)那类误红由 fit 抹平, 门禁判据一条没松; fit 参数 ${JSON.stringify(opts)}`
  + (declared ? '(模块导出的 FIT)' : '(export 缺省)');

/**
 * 命令体。**导出**(`export`)给 `scripts/cli.ts` 的 `svginfo inspect` 直接调用 ——
 * 读数的三条出口纪律(读数 stdout / 工具话 stderr / 退出码 1 与 2 分开)全在这里守着,
 * CLI 那一层不再复述一遍。`bun run scripts/inspect.ts` 与 `svginfo inspect` 是同一个实现。
 */
export async function main(argv: string[]): Promise<number> {
  const positional: string[] = [];
  let metrics = false;
  let fit = false;
  let level: 'standard' | 'showcase' = 'standard';
  let maxRows: number | undefined;
  let maxNotes: number | undefined;

  for (const arg of argv) {
    if (arg === '--metrics') metrics = true;
    else if (arg === '--fit') fit = true;
    else if (arg === '--showcase') level = 'showcase';
    else if (arg.startsWith('--rows=')) maxRows = Number(arg.slice(7));
    else if (arg.startsWith('--notes=')) maxNotes = Number(arg.slice(8));
    else if (arg === '-h' || arg === '--help') { console.log(USAGE); return 0; }
    else if (arg.startsWith('-')) fail(`不认识的参数: ${arg}`);
    else positional.push(arg);
  }
  if (positional.length > 1) fail(`最多给一个 scene 模块路径, 收到 ${positional.length} 个`);
  for (const [flag, v] of [['--rows', maxRows], ['--notes', maxNotes]] as const) {
    if (v !== undefined && (!Number.isFinite(v) || v <= 0)) fail(`${flag} 要给正数, 收到 ${v}`);
  }

  let scene: Scene;
  /** 模块导出的 `FIT`(作者声明的 fit 口径) —— `--fit` 用它, 读数板不另猜一个 padding */
  let declaredFit: FitOptions | undefined;
  if (positional.length === 0) {
    scene = DEMO;
    console.error('# (没给路径, 跑内置演示场景 —— 指一个 scene 模块路径进来才是正用)');
  } else {
    const target = positional[0];
    const spec = target.startsWith('/') ? target : new URL(target, `file://${process.cwd()}/`).href;
    let loaded: { mod: Record<string, unknown>; redirected: number };
    try {
      loaded = await loadRedirecting(spec);
    } catch (e: unknown) {
      fail(`加载失败: ${target}\n  ${e instanceof Error ? e.message : String(e)}`);
    }
    const { mod, redirected } = loaded;
    if (redirected) console.error(`⚠ ${target} 在加载时往 stdout 写了 ${redirected} 字节, 已改道 stderr —— 它更像出图脚本, 不是 scene 模块`);

    const got = (mod.default ?? mod.scene) as Scene | undefined;
    if (!got || typeof got !== 'object' || !Array.isArray((got as Scene).nodes)) {
      const names = Object.keys(mod).filter((k) => k !== 'default');
      fail(`${target} 里没找到场景: 期望 export default <scene> 或 export const scene = <scene>\n  该模块导出的是: ${names.length ? names.join(', ') : '(没有具名导出)'}`);
    }
    scene = got;
    // `FIT` 是**作者声明的 fit 口径**(与出口 `runScene(scene, { fit: FIT })` 同一个字面量) ——
    // 不认别的形状: 不是对象就当没声明, 走 export 缺省, 免得读到一个不是 fit 的东西
    declaredFit = mod.FIT && typeof mod.FIT === 'object' ? (mod.FIT as FitOptions) : undefined;
  }

  // `--fit` = **出口那一步先做一遍**(先 fitScene 再审, 同一对象 / 同一份报告)。缺省关是刻意的:
  // "不 fit 直接交付会不会越界" 只有关着才回答得了; 开了才回答"内容贴住 padding 后长什么样"
  const fitOpts: FitOptions = declaredFit ?? {};
  const prepared = fit ? fitScene(scene, fitOpts) : scene;
  const report = audit(prepared, { level });     // 只跑一遍, 读数与退出码共用它
  if (fit) process.stdout.write(`${fitNote(fitOpts, declaredFit !== undefined)}\n`);
  process.stdout.write(describeScene(prepared, { report, include: { metrics }, maxRows, maxNotes }));
  console.error(report.pass
    ? `✓ 门禁通过(${level})`
    : `✗ 门禁不过(${level}): ${report.metrics.errors} error / ${report.metrics.warnings} warning —— 读数已全量打出`);
  return report.pass ? 0 : 1;
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2));
