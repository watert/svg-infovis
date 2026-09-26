// =====================================================================
// 架构图 **v3** —— 现行**模块分层** + 依赖方向 (v1/v2 讲的是产品管线五层, 已降级存档)
//   v1: refs/build-arch.ts      → refs/architecture.svg
//   v2: refs/build-arch-v2.ts   → refs/architecture-v2.svg
//   v3: 本文件                   → refs/architecture-v3.svg
//   bun run refs/build-arch-v3.ts > refs/architecture-v3.svg
//
// ⚠ 与 v2 的切法不同: v2 的五层是"一次出图经过几道工序"(决策/缓存/内核/出口/分发), 其中决策层
// (HTML 骨架) 与 blink 旁路已废弃。v3 分的是"代码按什么职责摆" —— 七层与三条边界轴, 权威在
// refs/layering.md。组框 = **零依赖纯函数区**(shapes/blocks/templates/knives/geometry/
// serialize/export), 组外只有「作者声明」与「产物」两件事。
//
// ── 前置设计清单(提问式 · 动笔前落字)────────────────────────────────────
// 1 **主路径**: 作者声明 → shapes → blocks → serialize → export → out, **六盒单列竖排**。
//   6 条主干边全是纯竖直直线, 零弯折零交叉。
//   ⚠ **geometry 不在主链上**。首版把它排进链里, 门禁 0 error / 0 warning 一路绿到底, 但栅格化
//   一眼就看出语义是错的: 链被读成"blocks 的输出流进 geometry 再流进 serialize", 而 serialize
//   根本不依赖 geometry —— **版式暗示了一个假的依赖**。这正是 v1"横排 route/audit/export 暗示并列
//   三选一"那个病的复发。故 geometry 改**旁挂**(右列, 与 serialize 同带), 只保留一条
//   `blocks → geometry` 折线边: 它的三处折点是**拓扑要求**(底座不是流水线一环), 不是没排好。
//   shapes 同样依赖 geometry, 不另画一条(会与它平行打架) —— 关系写在 geometry 的 sub 里。
// 2 **方向**: 自上而下, 全图一致; 依赖永远从上层指向下层原语, 没有反向箭头。
// 3 **分层**: 左侧层标签列(声明 / 组件 / 序列化 / 出口 / 产出), **不画层带框** —— 层是阅读辅助,
//   画成框就是装饰性分组(沿用 v2 结论)。geometry 是右列旁挂, 不占主轴层标签。
// 4 **分组**: 只一个组框 `core · 零依赖纯函数`。孤儿检查: 组内 7 盒全在主链或旁挂链上, **零孤儿** ✓
// 5 **主角**: 两处实色 —— ①「作者声明」(蓝 solid, 决策唯一源) ②「export fail-closed」(琥珀 solid,
//   门禁)。其余一律 outline: 满图实色等于没有重点。
// 6 **规模预算**: 9 节点, 单带最多 2(右列旁挂) —— 远低于 7±2 ✓
// 7 **画布形状**: 760×824 —— 拓扑是"单列深链 + 右列旁挂", 这是它的自然形状。
//   ▸ **有意项**: 右列只放旁挂盒与注解, 与主轴逐带水平对齐 —— 空白拆成节奏, 不聚成角落
//   (v2 首跑"右下角一整片空旷"就是聚出来的)。
//
// ── 有意项白名单(收尾环读警示时直接豁免这些)────────────────────────────
// · 右列与主轴的带间空档是节奏; 门禁三档注解压进 export 带下方的 60px 空档
// · 组框标题(12) 小于节点主标签(13) —— 主角是节点不是容器(沿用 v2 豁免)
// · 组框用 **outer**: inner 会与主轴抢道(260918 实跑: 标题被主轴边竖直穿过, text_clearance 报 0)。
//   判据是**标题必须整段落在主轴 x 的左侧(含 8px 线宽)**: 标题 "core · 零依赖纯函数" 实测
//   143px + 框左 140 = 右端 283, 故主轴须 ≥ 296 —— 首版主轴 280 被 e1 穿过, 右移到 300 才过。
//   **约束版式的不是格子大小, 是那条不能弯的主轴**。
// · `blocks → geometry` 是全图唯一的折线边(三折), 见第 1 问
// =====================================================================

import {
  type GroupLabelPlacement, type Pt, type Rect, type Scene, type Tone, type Variant,
  THEMES, audit, groupLabelRect, routeOrthogonal, sceneChildren, svg, textFit, toSVG,
} from '../src/index.ts';

const theme = THEMES.light;
const FONT = 'ui-sans-serif, system-ui, "PingFang SC", sans-serif';
const LEVEL = 'showcase' as const;

// ── 画布与栅格(间距节奏走 8pt grid)────────────────────────────────────
const W = 760, H = 824;
const CX = 300;               // 主轴中轴。**右移到 300 是被组框标题逼出来的**(见白名单那条判据)
const NW = 220, NH = 60;      // 主轴节点(label + sub 两行)
const X0 = CX - NW / 2;       // 190
const GX = 140, GW = 572;     // core 组框(140..712)。右缘由 cluster_border_clearance 逼出来:
                              // 右列盒 448..688 离框线要 ≥24px
const RX = 456, RXW = 240;    // 右列旁挂盒 448..688 / 注解 456 起
const LBL_END = 52;           // 层标签右对齐位(距组框左缘 88)

const box = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });
/** 竖直主干: 端口约束交给 route, 不手写折点 */
const down = (a: Rect, b: Rect) =>
  routeOrthogonal({ from: a, fromPort: { side: 'bottom' }, to: b, toPort: { side: 'top' } }).points;

const Y = { author: 48, shapes: 196, blocks: 312, serialize: 428, export: 544, out: 724 };
const R = {
  author: box(X0, Y.author, NW, 52),
  shapes: box(X0, Y.shapes, NW, NH),
  blocks: box(X0, Y.blocks, NW, NH),
  serialize: box(X0, Y.serialize, NW, NH),
  export: box(X0, Y.export, NW, NH),
  out: box(X0, Y.out, NW, 52),
  // 右列旁挂: templates 吃块 / geometry 是底座 / knives 的判决被 export 消费
  templates: box(448, Y.blocks, RXW, NH),
  geometry: box(448, Y.serialize, RXW, NH),
  knives: box(448, Y.export, RXW, NH),
};
const GROUP = box(GX, 148, GW, 520);   // 148..668, 把 shapes..export 与三个旁挂全框进去

type NodeSpec = {
  id: string; rect: Rect; label: string; sub: string;
  tone?: Tone; variant?: Variant; fontSize?: number;
};

const NODES: NodeSpec[] = [
  // 组外唯一: 决策。core 没有任何写决策的入口(P2) —— "决策唯一源"是几何事实, 不是约定
  { id: 'author', rect: R.author, label: '作者声明 · 决策唯一源', sub: '坐标 / 比例 / 计数 / 折点 / 间距', tone: 'blue', variant: 'solid', fontSize: 13 },
  { id: 'shapes', rect: R.shapes, label: 'shapes/ 无数值语义排版件', sub: 'node · edge · stat · badge · heading', fontSize: 12.5 },
  { id: 'blocks', rect: R.blocks, label: 'blocks/ 数值语义块', sub: '{ shape, bounds } · 可嵌套', fontSize: 12.5 },
  { id: 'templates', rect: R.templates, label: 'templates/ 场景骨架', sub: '槽位吃块 · 仓内按路径引', fontSize: 12 },
  { id: 'serialize', rect: R.serialize, label: 'serialize 唯一字符串出口', sub: '属性键 codepoint 序 · 禁 Date.now', fontSize: 12.5 },
  // 旁挂: **底座不是流水线一环** —— 与 serialize 同高只是排版, 依赖方向是 blocks 指向它
  { id: 'geometry', rect: R.geometry, label: 'geometry/ 纯几何原语', sub: 'shapes 与 blocks 的共同底座', fontSize: 12 },
  { id: 'export', rect: R.export, label: 'export · fail-closed', sub: 'tryExport 草稿 / exportScene 拒出图', tone: 'amber', variant: 'solid', fontSize: 12.5 },
  { id: 'knives', rect: R.knives, label: 'knives/ 推导与判决', sub: 'route 折点 · fit 反算 · audit', fontSize: 12 },
  { id: 'out', rect: R.out, label: '烘焙 SVG · 自包含单文件', sub: '属性内联 · 零 marker · 零 CSS 变量', tone: 'emerald', fontSize: 12.5 },
];

type EdgeSpec = { id: string; points: Pt[]; radius: number; tone?: Tone; markerSize?: number };

const EDGES: EdgeSpec[] = [
  // 主干: 六条**纯竖直直线**, 零弯折零交叉
  { id: 'e1', points: down(R.author, R.shapes), radius: 8 },
  { id: 'e2', points: down(R.shapes, R.blocks), radius: 8 },
  { id: 'e3', points: down(R.blocks, R.serialize), radius: 8 },
  { id: 'e4', points: down(R.serialize, R.export), radius: 8 },
  { id: 'e5', points: down(R.export, R.out), radius: 8 },
  // 旁挂: templates 与 blocks 同带、knives 与 export 同带, 各一条**纯水平直线**
  {
    id: 'e-blocks-templates',
    points: routeOrthogonal({ from: R.blocks, fromPort: { side: 'right' }, to: R.templates, toPort: { side: 'left' } }).points,
    radius: 8, markerSize: 7,
  },
  {
    id: 'e-export-knives',
    points: routeOrthogonal({ from: R.export, fromPort: { side: 'right' }, to: R.knives, toPort: { side: 'left' } }).points,
    radius: 8, markerSize: 7,
  },
  // 全图唯一折线边: blocks → geometry。竖段走主轴与右列之间的空廊(x≈432), 不穿任何盒;
  // shapes 同样依赖 geometry, 不另画平行第二条(会与它重合打架) —— 关系在 geometry 的 sub 里
  {
    id: 'e-blocks-geometry',
    points: routeOrthogonal({
      from: R.blocks, fromPort: { side: 'right' },
      to: R.geometry, toPort: { side: 'left' },
    }).points,
    radius: 6, markerSize: 7,
  },
];

const GROUPS: { id: string; rect: Rect; label: string; labelPlacement?: GroupLabelPlacement; fontSize?: number }[] = [
  { id: 'core', rect: GROUP, label: 'core · 零依赖纯函数', labelPlacement: 'outer', fontSize: 12 },
];

/** 层标签(左列)与右列注解。`at.y` 是行中心, 包围盒由 measure 反推 —— 不手估 */
type TextSpec = { id: string; x: number; y: number; content: string; size: number; anchor: 'start' | 'end' };

const TEXTS: TextSpec[] = [
  // 左列: 层标签(每组带一个, 垂直居中)
  { id: 'lay-1', x: LBL_END, y: R.author.y + 26, content: '声明', size: 11, anchor: 'end' },
  { id: 'lay-2', x: LBL_END, y: (R.shapes.y + R.blocks.y + NH) / 2, content: '组件', size: 11, anchor: 'end' },
  { id: 'lay-3', x: LBL_END, y: R.serialize.y + 30, content: '序列化', size: 11, anchor: 'end' },
  { id: 'lay-4', x: LBL_END, y: R.export.y + 30, content: '出口', size: 11, anchor: 'end' },
  { id: 'lay-5', x: LBL_END, y: R.out.y + 26, content: '产出', size: 11, anchor: 'end' },
  // 右列: 只放**图里读不出来**的约定, 与主轴逐带对齐(第二轨), 不重复节点 sub
  { id: 'note-1', x: RX, y: R.shapes.y + 30, content: 'props → descriptor; 留白归作者', size: 10.5, anchor: 'start' },
  { id: 'note-2', x: RX, y: 400, content: '≥2 个消费者才上提 core', size: 10.5, anchor: 'start' },
  // 门禁三档: 压进 export 带下方的 60px 空档, 三行
  { id: 'note-3a', x: RX, y: 622, content: '门禁三档 —— fail-closed 挡出口,', size: 10.5, anchor: 'start' },
  { id: 'note-3b', x: RX, y: 638, content: 'warning 只是读数; 块 / 图标 / 底纹', size: 10.5, anchor: 'start' },
  { id: 'note-3c', x: RX, y: 654, content: '/ embed 不进净空门禁, 靠作者留位', size: 10.5, anchor: 'start' },
  { id: 'note-4', x: RX, y: R.out.y + 26, content: '不写 dominant-baseline · 不用 marker', size: 10.5, anchor: 'start' },
];

/**
 * 文本包围盒: 宽高走 `textFit`(**不手估**, 与渲染同一份口径); `t.y` 是行中心(= 盒心)。
 * 手估宽度会让 audit 量错净空 —— 那样**门禁本身就是错的, 比没有门禁更糟**。
 */
const textRect = (t: TextSpec): Rect => {
  const fit = textFit({ content: t.content, fontSize: t.size });
  return { x: t.anchor === 'end' ? t.x - fit.w : t.x, y: t.y - fit.h / 2, w: fit.w, h: fit.h };
};

// ── 审计用的 scene(与渲染同一份数据)──────────────────────────────────
const scene: Scene = {
  width: W,
  height: H,
  nodes: NODES.map(({ id, rect, label }) => ({ id, rect, label })),
  edges: EDGES.map(({ id, points }) => ({ id, points })),
  groups: GROUPS.map((g) => ({
    id: g.id,
    rect: g.rect,
    label: g.label,
    // 组框标题也登记包围盒 —— 只给字符串等于没给 audit 看
    labelRect: groupLabelRect({
      ...g.rect, label: g.label, labelPlacement: g.labelPlacement, fontSize: g.fontSize, radius: 16,
    }) ?? undefined,
  })),
  texts: TEXTS.map((t) => ({ id: t.id, rect: textRect(t), text: t.content, fontSize: t.size, anchor: t.anchor })),
};

// ── 渲染: **直接吃 sceneChildren**(渲染面与审计面只有一个来源)─────────
const children = sceneChildren(scene, {
  theme,
  nodeStyles: Object.fromEntries(NODES.map((n) => [n.id, {
    sub: n.sub, tone: n.tone, variant: n.variant, fontSize: n.fontSize, radius: 12,
  }])),
  groupStyles: Object.fromEntries(GROUPS.map((g) => [g.id, {
    labelPlacement: g.labelPlacement, fontSize: g.fontSize, radius: 16,
  }])),
  edgeStyles: Object.fromEntries(EDGES.map((e) => [e.id, {
    radius: e.radius, markerSize: e.markerSize, end: 'arrow-triangle' as const,
  }])),
});

// ── 出图前先过门禁(build 阶段就喊疼, 别等人眼在图里找)──────────────────
const report = audit(scene, { level: LEVEL });
const m = report.metrics;
process.stderr.write(
  `[build-arch-v3] audit ${LEVEL}: ${report.pass ? 'pass' : 'FAIL'} · ` +
    `${m.errors} error / ${m.warnings} warning · ` +
    `crossings=${m.crossings} min_text_clearance=${m.min_text_clearance} ` +
    `min_label_clearance=${m.min_label_clearance} max_ortho_dev=${m.max_orthogonal_deviation} ` +
    `phantom=${m.phantom_labels}/${m.phantom_texts}\n`,
);
process.stderr.write(
  `[build-arch-v3] density: corridor_max=${m.cluster_corridor_max}(${m.cluster_corridor_px_max}px) ` +
    `coverage=${m.cluster_coverage} mixed_rows=${m.mixed_cluster_rows} ` +
    `long_edges=${m.long_edges} edge_max_rel=${m.edge_max_rel}\n`,
);
for (const d of report.diagnostics) {
  process.stderr.write(`  [${d.severity}] ${d.code} @ ${d.subject.kind}:${d.subject.id} — ${d.message}\n`);
  for (const f of d.supportedFixes.slice(0, 1)) process.stderr.write(`      ↳ ${f.kind}: ${f.hint}\n`);
}
if (!report.pass) process.exitCode = 1;

if (import.meta.main) process.stdout.write(toSVG(svg(W, H, children, { 'font-family': FONT })));
