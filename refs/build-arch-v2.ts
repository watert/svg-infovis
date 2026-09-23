// =====================================================================
// 架构图 **v2** —— 按双阶段流程重画 (操作清单现收在 QUICKREF「动手前」, 当时的全文在 refs/aesthetics.md)
//   v1: refs/build-arch.ts  → refs/architecture.svg
//   v2: 本文件             → refs/architecture-v2.svg
//   bun run refs/build-arch-v2.ts > refs/architecture-v2.svg
//
// ── 前置设计清单（提问式 · 动笔前落字，收尾环的白名单依据）─────────────
// 1 **主路径**：HTML骨架 → scene缓存 → core.route → audit → export → 出厂产物 → 分发。
//   v1 的病根：主链在 core 段被"三刀横排"打断成 Z 形 —— scene 从 x=300 下到 route(x=191)，
//   横穿到 export(x=726)，再折回 out 中心(x=300)；出口那条 `export → out` 更是一条从右侧
//   下来的左上折线。**够直吗？不够。** v2 让主链走一条中轴竖线：6 条边里 5 条纯竖直、
//   1 条是 blink 的水平虚线 —— 零弯折、零交叉（Purchase 实证里影响最大的两条）。
//   ▸ 顺带修一个**语义**错：route→audit→export 是串行流水线，v1 的横排把它暗示成"并列三选一"。
//     竖排才是真相 —— 版式与语义在这里同向，不是牺牲一个换另一个。
// 2 **方向**：自上而下，全图一致。
// 3 **分层**：五层 —— 决策 / 缓存 / 内核 / 出口 / 分发，走**左侧层标签列**（2 字，右对齐贴主轴）。
//   不画层带框：层是阅读辅助而非语义边界，画成框就是"装饰性分组"（Gestalt 共同区域的反面教材）。
//   blink 原属"度量层"，v2 把它降级为旁路插件，见 4。
// 4 **分组**：只有 core 一个组框 —— 它是真语义边界（零运行时依赖的纯函数内核）。
//   孤儿检查：组内 route/audit/export 三节点全在主轴链上，**零孤儿** ✓
//   ▸ blink 从"链上必经一环"改成**旁路**：它不在场时 core 照跑（走 measure 估算），把它画成
//     链上一环是误导。现在是右侧一个虚线盒 + 一条水平虚线指回 scene，语义即"量框 → 写回 bounds"。
// 5 **主角**：① 决策唯一源（HTML，蓝 solid）② 门禁（audit，琥珀 solid）—— 两处，不再多。
//   其余一律 outline：满图实色等于没有重点。
// 6 **规模预算**：9 节点，单层最多 2（fan 层），组内 3 —— 远低于 7±2 ✓
// 7 **画布形状**：656×756（≈0.87）—— 拓扑是"单列深链 + 右侧旁挂列"，这是它的自然形状；
//   硬拉成细长条会让纵向呼吸散架（8pt 栅格节奏优先于纵横比执念）。
//   ▸ **有意项**：主轴靠左、不居中于画布 —— 左边只有 2 字层标签，右边是盒 + 注解，左右等宽才是浪费。
//
// ── 有意项白名单（收尾环读警示时直接豁免这些）────────────────────────
// · 层标签列 / 右侧注解列的留白 = 有意节奏，不是"没排满"
// · core 组框标题字号(12) **小于**节点主标签(13.5) —— 架构图的主角是节点不是容器，
//   有意不服从 guizang 那条"组框标题 > 节点标签"的阶梯
// · 主轴偏左 = 见第 7 问
// · 边标签 `决策 → 几何 · 单向` 走 dy=+20 **侧挂**而不骑线：该边全长只有 48px，骑线遮罩
//   会把线切成两截 14px 的短头，比侧挂更糟
//
// ── 与 v1 的继承关系 ────────────────────────────────────────────────
// 不变的三条设计纪律照抄 v1：① 渲染与审计**同一份 scene**（走 sceneChildren，不手拼 children）；
// ② 文本包围盒走 textFit 而非手估（门禁量错净空比没有门禁更糟）；
// ③ 出图前先过 showcase 级 audit，不过即 exit 1。
// =====================================================================

import {
  type GroupLabelPlacement, type Pt, type Rect, type Scene, type Tone, type Variant,
  THEMES, audit, edgeLabel, groupLabelRect,
  routeOrthogonal, sceneChildren, svg, textFit, toSVG,
} from '../src/index.ts';

const theme = THEMES.light;
const FONT = 'ui-sans-serif, system-ui, "PingFang SC", sans-serif';
const LEVEL = 'showcase' as const;

// ── 画布与栅格（全部 8 的倍数 —— 间距节奏走 8pt grid，aesthetics 第三圈半）──────
const W = 688, H = 756;
const CX = 236;               // 主轴中轴。**左移还是右移由组框标题逼出来**：标题 143px 必须整段
                              // 落在主轴某一侧，而「框左缘→主轴」= padding + NW/2 —— 只有把主轴右移
                              // 才腾得出第二列，光缩标题是治标
const NW = 232, NH = 52;      // 主轴节点
const X0 = CX - NW / 2;       // 96
const GX = 84, GW = 304;      // core 组框（主轴节点左右各 36 padding）
const RX = 436, RW = 220;     // 右侧列（旁路盒 / 注解）
const LBL_END = 44;           // 层标签右对齐位。上界由 **fan 层盒子**逼出来：fan 左盒左缘 52,
                              // 曾经用 56 —— 文字右端压在框边上(门禁不管这种"字压框")
                              // (距组框左缘 40、距主轴 52)

const box = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });
/** 竖直主干：端口约束交给 route，不手写折点 */
const down = (a: Rect, b: Rect, at?: number) =>
  routeOrthogonal({
    from: a, fromPort: { side: 'bottom', at },
    to: b, toPort: { side: 'top', at },
  }).points;

// 纵向：48 / 48 / 44→248 / 48 / 48，组内 24·32·32·24
const Y = { html: 48, scene: 148, core: 248, out: 564, fan: 664 };
const coreH = 268;
const R = {
  html: box(X0, Y.html, NW, NH),
  blink: box(RX, Y.scene, RW, NH),
  scene: box(X0, Y.scene, NW, NH),
};
const ROUTE = box(X0, Y.core + 24, NW, NH);          // 272..324
const AUDIT = box(X0, Y.core + 108, NW, NH);         // 356..408
const EXPORT = box(X0, Y.core + 192, NW, NH);        // 440..492
const OUT = box(X0, Y.out, NW, NH);
const FAN_A = box(52, Y.fan, 168, NH);               // 52..220
const FAN_B = box(252, Y.fan, 168, NH);              // 252..420
const CORE_GROUP = box(GX, Y.core, GW, coreH);

type NodeSpec = {
  id: string; rect: Rect; label: string; sub?: string;
  tone?: Tone; variant?: Variant; fontSize?: number; dash?: string;
};

const NODES: NodeSpec[] = [
  // 决策层：唯一权威 —— solid 蓝把"要人盯住的那一格"顶出来
  { id: 'html', rect: R.html, label: 'HTML 骨架 · 决策唯一源', sub: '层 / 序 / 分组 —— 只此一处可改', tone: 'blue', variant: 'solid', fontSize: 13 },
  // 度量层（M2 旁路，虚线 = 尚未落地）
  { id: 'blink', rect: R.blink, label: 'blink 量框 · M2 可选', sub: 'CDP 量框 → 写回 scene.bounds', tone: 'violet', fontSize: 12, dash: '6 5' },
  { id: 'scene', rect: R.scene, label: 'scene · 几何缓存', sub: 'bounds + 边表 + bounds_source', fontSize: 12.5 },
  // core 三把刀：**竖排**，因为它们是串行流水线
  { id: 'route', rect: ROUTE, label: 'route', sub: '盒子 + 端口 → 折点列', fontSize: 12.5 },
  { id: 'audit', rect: AUDIT, label: 'audit', sub: '十九项门禁 · 不过即拒出图', tone: 'amber', variant: 'solid', fontSize: 12.5 },
  { id: 'export', rect: EXPORT, label: 'export', sub: 'fail-closed 出图', fontSize: 12.5 },
  // 出口与分发
  { id: 'out', rect: OUT, label: '烘焙 SVG / 自包含 HTML', sub: '深色主题自带 canvasLayer 底', tone: 'emerald', fontSize: 12.5 },
  { id: 'fan-readme', rect: FAN_A, label: 'README 冻结图', sub: '坐标进 git', fontSize: 12 },
  { id: 'fan-html', rect: FAN_B, label: 'HTML 看板 / deck', sub: '重排走 blink', fontSize: 12 },
];

type EdgeSpec = { id: string; points: Pt[]; radius: number; tone?: Tone; dash?: string; markerSize?: number };

const EDGES: EdgeSpec[] = [
  // 主轴：全部纯竖直 ── 零弯折、零交叉
  { id: 'e-html-scene', points: down(R.html, R.scene), radius: 8 },
  { id: 'e-scene-route', points: down(R.scene, ROUTE), radius: 8 },
  {
    id: 'e-route-audit',
    points: routeOrthogonal({ from: ROUTE, fromPort: { side: 'bottom' }, to: AUDIT, toPort: { side: 'top' } }).points,
    radius: 8,
  },
  {
    id: 'e-audit-export',
    points: routeOrthogonal({ from: AUDIT, fromPort: { side: 'bottom' }, to: EXPORT, toPort: { side: 'top' } }).points,
    radius: 8,
  },
  { id: 'e-export-out', points: down(EXPORT, OUT), radius: 8 },
  // 扇出：出线点直接对齐两个 fan 盒的顶中点 → 两条边仍是纯竖直直线
  { id: 'e-out-readme', points: down(OUT, FAN_A, 136), radius: 6, markerSize: 7 },
  { id: 'e-out-html', points: down(OUT, FAN_B, 336), radius: 6, markerSize: 7 },
  // blink 旁路：水平虚线指回 scene（语义 = 量框结果写回几何缓存）
  {
    id: 'e-blink-scene',
    points: routeOrthogonal({ from: R.blink, fromPort: { side: 'left' }, to: R.scene, toPort: { side: 'right' } }).points,
    radius: 6, tone: 'violet', dash: '6 5', markerSize: 7,
  },
];

const GROUPS: { id: string; rect: Rect; label: string; labelPlacement?: GroupLabelPlacement; fontSize?: number }[] = [
  // 标题走 **outer**（框外上方）: inner 是结构性地与组内主杆抢道, 挪出框外才是根治。
  // ⚠ 但 outer 只是把标题挪出了**组框内**，主轴边照样从这里竖直穿过 —— 260918 v2 首跑
  // 就被 `text_clearance` 抓到(净空 0)。真正的判据是**标题必须整段落在主轴 x 的某一侧**:
  // 主轴在 x=212，标题左起 72，所以文字宽度必须 ≤ 140px。于是标题砍到 "core · 零运行时依赖"
  // (~126px)，其余细节挪去右侧注解 —— **约束版式的不是格子大小，是那条不能弯的主轴**。
  { id: 'core', rect: CORE_GROUP, label: 'core · 零运行时依赖', labelPlacement: 'outer' },
];

/** 层标签（左列，右对齐贴主轴）/ 右侧注解。`at` = 文本锚点，包围盒由 measure 反推 */
type TextSpec = { id: string; x: number; y: number; content: string; size: number; anchor: 'start' | 'end' };

const TEXTS: TextSpec[] = [
  { id: 'lay-html', x: LBL_END, y: Y.html + NH / 2, content: '决策', size: 11, anchor: 'end' },
  { id: 'lay-scene', x: LBL_END, y: Y.scene + NH / 2, content: '缓存', size: 11, anchor: 'end' },
  { id: 'lay-core', x: LBL_END, y: Y.core + coreH / 2, content: '内核', size: 11, anchor: 'end' },
  { id: 'lay-out', x: LBL_END, y: Y.out + NH / 2, content: '出口', size: 11, anchor: 'end' },
  { id: 'lay-fan', x: LBL_END, y: Y.fan + NH / 2, content: '分发', size: 11, anchor: 'end' },
  // 右侧注解：只放**图里读不出来**的约定，不重复节点 sub。
  // 260918 首跑后补: 初版只有 3 条注解 —— 门禁全绿, 但栅格化一眼就看出**右下角一整片空旷**
  // (aesthetics 第四圈: 大空白聚在角落是事故, 均匀散布才是呼吸)。现在沿全高铺成一条
  // "第二轨", 每条与主轴某一带水平对齐 —— 主轴与注解列一一对照, 空白也被拆成节奏。
  { id: 'note-src', x: RX, y: Y.html + NH / 2, content: '坐标: 作者 / agent 给, 或 measure 估', size: 10.5, anchor: 'start' },
  { id: 'note-route', x: RX, y: Y.core + 24 + NH / 2, content: '折点列不手写 —— 手写就丢了工具算像素', size: 10.5, anchor: 'start' },
  { id: 'note-core-1', x: RX, y: Y.core + coreH / 2 - 10, content: '纯函数 · bun 直跑 · 字节确定', size: 10.5, anchor: 'start' },
  { id: 'note-core-2', x: RX, y: Y.core + coreH / 2 + 10, content: 'core ← react 薄壳 (v0.2): 永不反向', size: 10.5, anchor: 'start' },
  { id: 'note-export', x: RX, y: Y.core + 218, content: '陈旧缓存 / 越界内容不许静默出厂', size: 10.5, anchor: 'start' },
  { id: 'note-out', x: RX, y: Y.out + NH / 2, content: '自包含单文件 · 不写 dominant-baseline', size: 10.5, anchor: 'start' },
  { id: 'note-fan', x: RX, y: Y.fan + NH / 2, content: '冻结图坐标进 git; 看板重排走 blink', size: 10.5, anchor: 'start' },
];

/**
 * 文本包围盒: 宽高走 `textFit`(**不手估**, 与渲染 `scene.texts` 上屏同一份口径);
 * `at.y` 是行中心, 盒顶 = `t.y - size * 0.625`。
 * 手估宽度会让 audit 量错净空 —— 那样门禁本身就是错的, 比没有门禁更糟。
 */
const textRect = (t: TextSpec): Rect => {
  const fit = textFit({ content: t.content, fontSize: t.size });
  // `t.y` 是**行中心**(= 盒心): 盒顶直接由 `fit.h` 反推 —— 不再经 `size * 0.625`
  // (那是旧盒高 `size × 1.25` 的一半)那层近似, 否则盒高换代会把文字带着漂 ~1px
  return { x: t.anchor === 'end' ? t.x - fit.w : t.x, y: t.y - fit.h / 2, w: fit.w, h: fit.h };
};

// ── 审计用的 scene（与渲染同一份数据）────────────────────────────────

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
  // 边标签也进 scene —— 出口画的与审计审的是同一份（走 edgeLabel，不手写坐标）
  labels: [
    edgeLabel(
      { id: 'e-html-scene', points: EDGES[0].points },
      '决策 → 几何 · 单向',
      { dy: 22, fontSize: 10.5 },
    ),
  ],
};

// ── 渲染：**直接吃 sceneChildren**（渲染面与审计面只有一个来源）──────────

const children = sceneChildren(scene, {
  theme,
  nodeStyles: Object.fromEntries(NODES.map((n) => [n.id, {
    sub: n.sub, tone: n.tone, variant: n.variant, fontSize: n.fontSize, dash: n.dash, radius: 12,
  }])),
  groupStyles: Object.fromEntries(GROUPS.map((g) => [g.id, {
    labelPlacement: g.labelPlacement, fontSize: g.fontSize, radius: 16,
  }])),
  edgeStyles: Object.fromEntries(EDGES.map((e) => [e.id, {
    radius: e.radius, markerSize: e.markerSize, tone: e.tone, dash: e.dash, end: 'arrow-triangle' as const,
  }])),
});

// ── 出图前先过门禁（build 阶段就喊疼，别等人眼在图里找）────────────────

const report = audit(scene, { level: LEVEL });
const m = report.metrics;
process.stderr.write(
  `[build-arch-v2] audit ${LEVEL}: ${report.pass ? 'pass' : 'FAIL'} · ` +
    `${m.errors} error / ${m.warnings} warning · ` +
    `crossings=${m.crossings} min_text_clearance=${m.min_text_clearance} ` +
    `min_label_clearance=${m.min_label_clearance} max_ortho_dev=${m.max_orthogonal_deviation} ` +
    `phantom=${m.phantom_labels}/${m.phantom_texts}\n`,
);
process.stderr.write(
  `[build-arch-v2] density: corridor_max=${m.cluster_corridor_max}(${m.cluster_corridor_px_max}px) ` +
    `coverage=${m.cluster_coverage} mixed_rows=${m.mixed_cluster_rows} ` +
    `long_edges=${m.long_edges} edge_max_rel=${m.edge_max_rel}\n`,
);
for (const d of report.diagnostics) {
  process.stderr.write(`  [${d.severity}] ${d.code} @ ${d.subject.kind}:${d.subject.id} — ${d.message}\n`);
  for (const f of d.supportedFixes.slice(0, 1)) process.stderr.write(`      ↳ ${f.kind}: ${f.hint}\n`);
}
if (!report.pass) process.exitCode = 1;

if (import.meta.main) process.stdout.write(toSVG(svg(W, H, children, { 'font-family': FONT })));
