// =====================================================================
// 架构图 **v1**（横排 core 版）—— 用 core 自己画自己, 并且**自己审自己**
//   ⚠ 已有重排过的 v2: `build-arch-v2.ts` → `refs/architecture-v2.svg`
//     （主链捋成中轴竖线 / blink 降为旁路 / 右侧注解轨; README 与 md 现在引的是 v2）。
//     本文件保留为 v1 存档, 重跑只用于对照。
//   bun run refs/build-arch.ts > refs/architecture.svg
//   然后 ./scripts/svg2png.sh refs/architecture.svg /tmp/arch.png 看一眼
//
// 两件事在这里同时成立:
//   ① 主题用法示范 —— 默认 light + outline, solid 只留给"要人盯住的那一格"
//      (决策唯一源 = 实色蓝; 门禁 = 实色琥珀), 其余全是描边。
//   ② **图和审计同源** —— NODES / EDGES / TEXTS 既用来渲染, 也被组装成 Scene 送 audit。
//      文本包围盒走 `textFit` 而不是手估, 所以净空检查量的是真实尺寸。
//      审计不过就 exit 1 —— 这张图从此不可能带着"折线穿过文字"出厂(260917 就是这么漏的)。
// =====================================================================

import {
  type GroupLabelPlacement, type Pt, type Rect, type Scene, type Tone, type Variant,
  THEMES, audit, groupLabelRect, routeOrthogonal, sceneChildren, svg, textFit, toSVG,
} from '../src/index.ts';

const theme = THEMES.light;
const FONT = 'ui-sans-serif, system-ui, "PingFang SC", sans-serif';
const W = 880;
const H = 700;
const LEVEL = 'showcase' as const;

const box = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });
/** 竖直主干: 端口约束交给 route, 不手写折点; lane = 指定腰线(转角)位置, 缺省取两端中点 */
const down = (a: Rect, b: Rect, lane?: number, stub?: number) =>
  routeOrthogonal({ from: a, fromPort: { side: 'bottom' }, to: b, toPort: { side: 'top' }, lane, stub }).points;

const CX = 300;
const NW = 280;
const NH = 46;
const x0 = CX - NW / 2;

// 分层坐标(自上而下: 决策 → 度量 → 缓存 → 内核 → 出口 → 分发)
const Y = { html: 56, blink: 156, scene: 256, core: 366, out: 540, fan: 636 };
const coreH = 118;

// ── 几何与渲染参数(一份数据, 既出图也送审) ------------------------------

const R = { html: box(x0, Y.html, NW, NH), blink: box(x0, Y.blink, NW, NH), scene: box(x0, Y.scene, NW, NH) };
const OUT = box(x0, Y.out, NW, NH);
const ROUTE = box(96, Y.core + 44, 190, 46);
const AUDIT = box(316, Y.core + 44, 190, 46);
const EXPORT = box(536, Y.core + 44, 190, 46);
const FAN_A = box(120, Y.fan, 240, NH);
const FAN_B = box(430, Y.fan, 240, NH);
const CORE_GROUP = box(56, Y.core, W - 112, coreH);

type NodeSpec = {
  id: string; rect: Rect; label: string; sub?: string;
  tone?: Tone; variant?: Variant; fontSize?: number; dash?: string;
};

const NODES: NodeSpec[] = [
  // 决策层: 唯一权威 —— 用 solid 蓝把"要人盯住的那一格"顶出来
  { id: 'html', rect: R.html, label: 'HTML 骨架 · 决策唯一源', sub: '层 / 层内顺序 / 分组', tone: 'blue', variant: 'solid', fontSize: 13 },
  // 度量层(M2, 虚线表示尚未落地)
  { id: 'blink', rect: R.blink, label: 'blink 量框', sub: 'bounds 写回 scene', tone: 'violet', fontSize: 12.5, dash: '6 5' },
  { id: 'scene', rect: R.scene, label: 'scene · 几何缓存', sub: 'bounds + 边表 + bounds_source', fontSize: 12.5 },
  // core 三把刀
  { id: 'route', rect: ROUTE, label: 'route', sub: '盒子+端口 → 折点列', fontSize: 12 },
  { id: 'audit', rect: AUDIT, label: 'audit', sub: '十九项门禁 · 不过即拒出图', tone: 'amber', variant: 'solid', fontSize: 12 },
  { id: 'export', rect: EXPORT, label: 'export', sub: 'fail-closed 出图', fontSize: 12 },
  // 出口与分发
  { id: 'out', rect: OUT, label: '烘焙 SVG / 自包含 HTML', sub: '深色主题自带 canvasLayer 底', tone: 'emerald', fontSize: 12.5 },
  { id: 'fan-readme', rect: FAN_A, label: 'README 冻结图', sub: '坐标进 git', fontSize: 12 },
  { id: 'fan-html', rect: FAN_B, label: 'HTML 看板 / deck', sub: '走 blink 重排', fontSize: 12 },
];

type EdgeSpec = { id: string; points: Pt[]; radius: number; markerSize?: number };

const EDGES: EdgeSpec[] = [
  { id: 'e-html-blink', points: down(R.html, R.blink), radius: 8 },
  { id: 'e-blink-scene', points: down(R.blink, R.scene), radius: 8 },
  // scene → route: 标题在 outer(底≈365.6), 缺省腰线 356 正好从它身上过 —— 把腰线压到 380。
  // 约束: 380 < 入口 stub 点 b1.y(410-18=392), 否则 route 先走到 lane 再折回去(折点列多一个 V 字)
  { id: 'e-scene-route', points: down(R.scene, ROUTE, 380), radius: 8 },
  {
    id: 'e-route-audit',
    points: routeOrthogonal({ from: ROUTE, fromPort: { side: 'right' }, to: AUDIT, toPort: { side: 'left' }, stub: 10 }).points,
    radius: 6, markerSize: 6,
  },
  {
    id: 'e-audit-export',
    points: routeOrthogonal({ from: AUDIT, fromPort: { side: 'right' }, to: EXPORT, toPort: { side: 'left' }, stub: 10 }).points,
    radius: 6, markerSize: 6,
  },
  { id: 'e-export-out', points: down(EXPORT, OUT), radius: 8 },
  // 扇出两条边从 OUT 底边不同位置出(t 0.35 / 0.65)。历史口径已变: 260918 时门禁会抓"都走底边中心"
  // (port_crowding / edge_overlap 同源), 但 260920 起这两条边只共享 OUT 一个节点 = 分叉拓扑,
  // 「分叉 / 汇合」豁免放行同点出发 —— 现在摊开是本图的版式选择(两目标左右分列), 不再是门禁逼的; 画法判据见 refs/recipes.md §4
  {
    id: 'e-out-readme',
    points: routeOrthogonal({ from: OUT, fromPort: { side: 'bottom', t: 0.35 }, to: FAN_A, toPort: { side: 'top' } }).points,
    radius: 8,
  },
  {
    id: 'e-out-html',
    points: routeOrthogonal({ from: OUT, fromPort: { side: 'bottom', t: 0.65 }, to: FAN_B, toPort: { side: 'top' } }).points,
    radius: 8,
  },
];

type GroupSpec = {
  id: string; rect: Rect; label: string;
  /** 成员声明(membership 声明制, 260918): 这个框装了谁 —— 门禁据此审"声明与几何是否自洽" */
  contains?: string[];
  labelPlacement?: GroupLabelPlacement; labelInset?: [number, number]; fontSize?: number;
};

const GROUPS: GroupSpec[] = [
  // 标题走 **outer**(框上方外侧): inner 是结构性地与组内主杆抢道 ——
  // route 框整个躺在标题的 x 区间里, 垂直段无论怎么绕腰线都会穿字。挪出框外才是根治。
  // dy = -12 让文字底(≈363.6)落在框顶(366)上方, 不压框线。
  { id: 'core', rect: CORE_GROUP, label: 'core · 零运行时依赖 · bun 直跑', labelPlacement: 'outer', contains: ['route', 'audit', 'export'] },
];

/** `at` 是文本**基线左端**(svg 的 x/y 语义); 包围盒由 measure 反推 */
type TextSpec = { id: string; at: Pt; content: string; size: number };

const TEXTS: TextSpec[] = [
  { id: 'note-html', at: { x: x0 + NW + 22, y: Y.html + 18 }, content: '唯一权威: 改序只改这里', size: 11 },
  { id: 'note-blink', at: { x: x0 + NW + 22, y: Y.blink + 18 }, content: 'M2 · 需要浏览器(CDP 量框)', size: 11 },
  { id: 'note-scene', at: { x: x0 + NW + 22, y: Y.scene + 18 }, content: '可重建缓存 · 带 html_rev / scene_rev', size: 11 },
  { id: 'note-predicates', at: { x: 96, y: Y.core + coreH - 10 }, content: 'geometry · shapes · theme · serialize · predicates   (纯函数, 字节确定)', size: 10.5 },
  // 260918: `text_overlap` 门禁抓到这行**戳出 core 组框右缘 44.5px**(536+332.5=868.5 > 824)。
  // 修法不是缩字, 是把它挪回框内 —— 右端对齐到框右缘留 24px 呼吸位。
  { id: 'note-audit', at: { x: 824 - 24 - 332.5, y: Y.core + 26 }, content: 'audit 不过 → 拒出图(除显式 force, 产物打 data-draft)', size: 10.5 },
];

/**
 * 文本包围盒: 宽高走 `textFit`(**不手估**, 与渲染 `scene.texts` 上屏同一份口径);
 * `at.y` 是基线, 盒顶 = `at.y - size * 0.8`(ascender 的常用近似)。
 * 手估宽度会让 audit 量错净空 —— 那样门禁本身就是错的, 比没有门禁更糟。
 */
const textRect = (t: TextSpec): Rect => {
  const fit = textFit({ content: t.content, fontSize: t.size });
  // 换 `textFit` 口径时把**盒心钉住**: 旧盒高是 `size * 1.25` 的近似(正在被替换的那一条),
  // 盒顶若仍直接用 `at.y - 0.8×size`, 文字会随盒高变化下漂 ~1px —— 文字位置是视觉事实,
  // 不该被量尺换代带着走。`1.25` 只作**一次性迁移项**活着, 不是第二权威。
  const y = t.at.y - t.size * 0.8 + (t.size * 1.25 - fit.h) / 2;
  return { x: t.at.x, y, w: fit.w, h: fit.h };
};

// ── 审计用的 scene(与渲染同一份数据) -----------------------------------

const scene: Scene = {
  width: W,
  height: H,
  nodes: NODES.map(({ id, rect, label }) => ({ id, rect, label })),
  edges: EDGES.map(({ id, points }) => ({ id, points })),
  // 组框标题也登记包围盒 —— 只给字符串等于没给 audit 看
  groups: GROUPS.map((g) => ({
    id: g.id,
    rect: g.rect,
    label: g.label,
    contains: g.contains,
    labelRect:
      groupLabelRect({
        ...g.rect,
        label: g.label,
        labelPlacement: g.labelPlacement,
        labelInset: g.labelInset,
        fontSize: g.fontSize,
        radius: 16,
      }) ?? undefined,
  })),
  texts: TEXTS.map((t) => ({ id: t.id, rect: textRect(t), text: t.content, fontSize: t.size, anchor: 'start' as const })),
};

// ── 渲染 ---------------------------------------------------------------

// ── 渲染: **直接吃 sceneChildren** ────────────────────────────────────────
// 这里曾经是手拼的 nodeShape/groupShape/edgeShape/textShape —— 那意味着"渲染面"与"审计面"
// 各写一份, 靠作者记得展开 rect 来对齐(两次 NaN 事故都出在这里)。现在渲染面只有一个来源:
// scene 本身; 肤色 / 字号 / 圆角这类不进 scene 的渲染参数走 styles 覆盖表(260917 ③)。
const children = sceneChildren(scene, {
  theme,
  nodeStyles: Object.fromEntries(NODES.map((n) => [n.id, {
    sub: n.sub, tone: n.tone, variant: n.variant, fontSize: n.fontSize, dash: n.dash, radius: 12,
  }])),
  groupStyles: Object.fromEntries(GROUPS.map((g) => [g.id, {
    labelPlacement: g.labelPlacement, labelInset: g.labelInset, fontSize: g.fontSize, radius: 16,
  }])),
  edgeStyles: Object.fromEntries(EDGES.map((e) => [e.id, {
    radius: e.radius, markerSize: e.markerSize, end: 'arrow-triangle' as const,
  }])),
});

// ── 出图前先过门禁(build 阶段就把问题喊出来, 别等人眼在图里找) ----------

const report = audit(scene, { level: LEVEL });
const m = report.metrics;
process.stderr.write(
  `[build-arch] audit ${LEVEL}: ${report.pass ? 'pass' : 'FAIL'} · ` +
    `${m.errors} error / ${m.warnings} warning · ` +
    `min_text_clearance=${m.min_text_clearance} min_label_clearance=${m.min_label_clearance} ` +
    `max_ortho_dev=${m.max_orthogonal_deviation}\n`,
);
for (const d of report.diagnostics) {
  process.stderr.write(`  [${d.severity}] ${d.code} @ ${d.subject.kind}:${d.subject.id} — ${d.message}\n`);
  for (const f of d.supportedFixes.slice(0, 1)) process.stderr.write(`      ↳ ${f.kind}: ${f.hint}\n`);
}
if (!report.pass) process.exitCode = 1;

if (import.meta.main) process.stdout.write(toSVG(svg(W, H, children, { 'font-family': FONT })));
