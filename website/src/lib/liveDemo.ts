// =====================================================================
// liveDemo · hero 的浏览器内实时渲染
//
// 这张图**不是**图片文件: 本模块直接 import 仓内核(相对路径 ../../../src/index), 在浏览器里
// 现场算坐标 → 序列化成 SVG 字符串 —— 内核对"零运行时依赖、能跑在浏览器里"的自证。
// 走的正是仓根 README 首图那条链(scene → route → audit → export), 只是换成四站的小图。
//
// 纪律: 手写的只有**作者决策**(文案 / 画布估值 / 主题), 坐标全从内核派生 ——
// 盒宽 `nodeFit` / 格位 `grid` / 格距 `labelBoxSize` / 折点 `routeOrthogonal`,
// 画布由出口按内容重算(`fit: true`)。
//
// 纯函数, 不碰 React / DOM / node:* —— 所以它也能被 bun 直跑(自检脚本 / 栅格化对账)。
// 顶层 memo 一次: 同一次会话里重复渲染逐字节相同。
// =====================================================================

import {
  THEMES, edgeLabel, grid, labelBoxSize, nodeFit, round1, routeOrthogonal, tryExport,
  type AuditLevel, type Scene, type Tone, type Variant,
} from '../../../src/index';

/** 交付档门禁(showcase): hero 上的盒子按这一档反算, 出图也按这一档审 —— 两边同源 */
const LEVEL: AuditLevel = 'showcase';

/** 画布估值: 内容并集外各留这么点(真画布由 `fit` 按内容重算, 这两位只是给 Scene 一个同量级的数) */
const MARGIN = 40;

/** 链路四站(TL → TR → BR → BL 蛇形), 内容即语义 */
type NodeSpec = { id: string; label: string; sub: string; tone: Tone; variant?: Variant };
const NODES: NodeSpec[] = [
  { id: 'scene', label: 'scene', sub: '节点 · 边 · 声明', tone: 'slate' },
  { id: 'route', label: 'route', sub: '端口 → 折点列', tone: 'blue' },
  { id: 'audit', label: 'audit', sub: '十九项门禁', tone: 'emerald' },
  { id: 'export', label: 'export', sub: '字节确定的 SVG', tone: 'violet', variant: 'solid' },
];

/** 链路上的四句话(下标与下面的 `edges` 同序) */
const LABELS = ['routeOrthogonal()', 'audit()', 'exportScene()', '不过 → 回改'] as const;

/** 盒: 四条反算结果取大 —— 盒齐整, 且每条内容都装得下(盒是内容驱动的下限) */
const fits = NODES.map((n) => nodeFit({ label: n.label, sub: n.sub, level: LEVEL }));
const CELL = { w: Math.max(...fits.map((f) => f.w)), h: Math.max(...fits.map((f) => f.h)) };

/** 格距: 横向缝要装得下骑在上面的标签, 纵向缝只需装标签高(下界 56 是呼吸位) */
const GAP = {
  x: round1(Math.max(labelBoxSize(LABELS[0]).width, labelBoxSize(LABELS[2]).width) + 28),
  y: round1(Math.max(56, labelBoxSize(LABELS[1]).height + 40)),
};

const g = grid({ origin: { x: 0, y: 0 }, cols: 2, rows: 2, cell: CELL, gap: GAP });
/** 蛇形: 上排左 → 右, 下排右 → 左 */
const R = { scene: g.cell(0, 0), route: g.cell(1, 0), audit: g.cell(1, 1), export: g.cell(0, 1) };

// 折点列全部由 route 生成: 三跳直连 + 一条左绕回环(回环的竖线走盒列外的走廊)
const hops = [
  routeOrthogonal({ from: R.scene, fromPort: { side: 'right' }, to: R.route, toPort: { side: 'left' } }),
  routeOrthogonal({ from: R.route, fromPort: { side: 'bottom' }, to: R.audit, toPort: { side: 'top' } }),
  routeOrthogonal({ from: R.audit, fromPort: { side: 'left' }, to: R.export, toPort: { side: 'right' } }),
  // 回环: 两端从左面出, 竖线落位由 route 自己取最小可行值(盒列外一个 stub)。
  // ⚠ 别给它 `lane` 调宽: 平行 stub 的可行域边界就是这个值, 给出去的值会被投影回来(实测);
  // 想更宽的走廊得整条改走 `via` 声明 —— 那需要按 viaRoute 的拼接口径重排折点, 这张小图不值当
  routeOrthogonal({ from: R.export, fromPort: { side: 'left' }, to: R.scene, toPort: { side: 'left' } }),
];

const NODE_IDS = NODES.map((n) => n.id);
const edges: Scene['edges'] = hops.map((h, i) => ({
  id: `e${i + 1}`,
  from: NODE_IDS[i],
  to: NODE_IDS[(i + 1) % NODE_IDS.length],
  points: h.points,
}));

const scene: Scene = {
  // 画布由出口按内容重算(`fit: true`), 这两位数不参与 —— 给个与内容同量级的估值即可
  width: round1(g.bounds.w + 2 * MARGIN),
  height: round1(g.bounds.h + 2 * MARGIN),
  nodes: NODES.map((n) => ({ ...n, rect: R[n.id as keyof typeof R], radius: 12 })),
  edges,
  // 标签位置与遮罩尺寸在构建期烘进 scene(渲染与审计读同一份); 颜色跟节点的族走
  labels: edges.map((e, i) => edgeLabel(e, LABELS[i])),
};

export type HeroRender = {
  svg: string;
  /** 现场跑的门禁读数(这张图自己过的审) */
  level: AuditLevel;
  pass: boolean;
  errors: number;
  warnings: number;
  nodes: number;
  edges: number;
  /** 逐条诊断(`[severity] code: message`) —— 空数组 = 干净; 页面上照着打, 坏掉当场看得见 */
  problems: string[];
  /** 产物字节数 + fnv32 指纹 —— 同输入同字节, 换一次会话也认得出"还是那份" */
  bytes: number;
  fingerprint: string;
};

/** fnv32(逐字节): 只做"同一份产物"的比对, 不是密码学哈希 —— 别拿它当签名 */
const fnv32 = (s: string): string => {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(s)) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
};

const build = (): HeroRender => {
  // 出口走 `tryExport`(迭代回路: 门禁不过也给草稿, 永不抛) —— 它在浏览器里跑得动, 这就是全部论点
  const { svg, report } = tryExport(scene, { level: LEVEL, theme: THEMES.dark, fit: true });
  return {
    svg,
    level: report.level,
    pass: report.pass,
    errors: report.metrics.errors,
    warnings: report.metrics.warnings,
    nodes: scene.nodes.length,
    edges: scene.edges.length,
    problems: report.diagnostics.map((d) => `[${d.severity}] ${d.code}: ${d.message}`),
    bytes: new TextEncoder().encode(svg).length,
    fingerprint: fnv32(svg),
  };
};

let hero: HeroRender | null = null;

/** 现场算一次, 之后吃 memo */
export const renderHero = (): HeroRender => (hero ??= build());

/** 只要字符串(内联上屏用) */
export const renderHeroSvg = (): string => renderHero().svg;
