// =====================================================================
// gallery/swot · 四象限: "svg-infovis 内核的 SWOT"(浅色, 密铺四格 + 带轴的十字 + 极标签)
//   bun run examples/gallery/swot.ts > /tmp/swot.svg
//
// 这张图证明什么: 四象限这一族的图 —— 版式骨架由 `quadrantShape` 一次交清, 内容不手搓坐标:
//   · 格尺寸由内容反算(`nodeFit` 四份取 max) → 区域 = 格 × 分区数(密铺) → 四格位置全走
//     `quadrantGeometry().cell()` —— 图里没有一个手写的格子 x/y
//   · 轴 = 画在缝中线上的分区线(2×2 的中线就是轴), `arrows` 给四端加箭头(自画 path) ——
//     "哪边是 Helpful / 哪边是 Internal"这件事由**轴向 + 极标签**一起说, 不靠读者猜
//   · 极标签: `left` 逐行一个(行 = Helpful / Harmful)、`bottom` 逐列一个(列 = Internal / External) ——
//     上下边的逐格标签按格心对齐、左右边贴边右对齐, 对齐与偏移全在 `pole()` 里算好
//
// 内容是内核自己的 SWOT(与 `ROADMAP.md` / `AGENTS.md` 的口径对得上), 不是占位符 ——
// 四象限图的值全在"哪一格说什么", 空话样板会把它降级成一张色块图。
//
// 走**描述符层**(直出 descriptor, 不经 scene / 不过门禁), 与 `infograph/*` 五件同档:
// 象限框架与格里卡片都是"压在版式上的墨迹", 没有可审计的拓扑(轴线不是关系边, 不与谁相连)。
// 要看走门禁的主路径读 `start/full-chain.ts`。
// =====================================================================

import { type Descriptor, svg } from '../../src/descriptor';
import { toSVG } from '../../src/serialize';
import { type Rect, round1 } from '../../src/geometry/vec';
import { bounds } from '../../src/geometry/box';
import { headingGeometry, headingShape } from '../../src/shapes/heading';
import { nodeShape } from '../../src/shapes/node';
import { QUADRANT_LAYOUT, quadrantGeometry, quadrantShape } from '../../src/shapes/quadrant';
import { nodeFit } from '../../src/knives/fit';
import { measureText } from '../../src/knives/measure';
import { type Tone, THEMES } from '../../src/theme';
import { isMainModule } from '../../src/runtime';

// --- 作者决策: 内容 + 几个版式常量 ------------------------------------------

type Cell = { title: string; tone: Tone; items: string[] };

/**
 * 四格按 `(c, r)` 排: (0,0) 左上 Strengths · (1,0) 右上 Opportunities ·
 * (0,1) 左下 Weaknesses · (1,1) 右下 Threats —— 行 = 有益 / 有害(两色分), 列 = 内部 / 外部(轴分)。
 */
const CELLS: Cell[] = [
  { title: 'Strengths', tone: 'emerald', items: [
    '零运行时依赖, 零构建负担', '字节确定: 同输入同字节, 可 diff',
    '门禁 fail-closed: 几何不过不出图', '盒宽 / 折点 / 摆位全反算',
  ] },
  { title: 'Opportunities', tone: 'emerald', items: [
    'agent 画图: 写 TS 直出, 可校验', '文档 / 评测流水线要配图',
    '精度要求高时草图工具不够', 'echarts 底板 + 结构标注',
  ] },
  { title: 'Weaknesses', tone: 'rose', items: [
    '排布全手写, 没有自动布局', '概念多: 入口 / 语义槽 / 档位',
    '只出静态 SVG, 没有交互 viewer', '上手先读文档再动手',
  ] },
  { title: 'Threats', tone: 'rose', items: [
    'Mermaid / d2 的心智占位', '大模型直接生成 SVG',
    '单人维护 + 零依赖约束', '低精度草图场景轮不到它',
  ] },
];

const COLS = 2;
const ROWS = 2;
const PAD = 40;                 // 画布四边留白
const SEAM = 34;                // 标题块与象限区域的缝
const CELL_PAD: [number, number] = [18, 16];  // 格内边距(反算进 cell, 于是"字不贴格边")
const FS = 13;                  // 格标题字号
const POLE_FS = QUADRANT_LAYOUT.poleFontSize;

// --- ① 尺寸账: 内容 → 格 → 区域(全程不落坐标) ------------------------------

const fits = CELLS.map((c) => nodeFit({
  label: `**${c.title}**`, sub: c.items.join('\n'), fontSize: FS, level: 'showcase', padding: CELL_PAD,
}));
/** 四格统一尺寸 = 内容最大那一份(与 `stat` / `grid` 同款取舍: 参差格会让"格位"读成"内容长度") */
const cell = { w: Math.max(...fits.map((f) => f.w)), h: Math.max(...fits.map((f) => f.h)) };
const plotSize = { w: cell.w * COLS, h: cell.h * ROWS };   // 密铺: 格界就是轴, 没有缝

// --- ② 布局: 标题在下、区域在上, 一切从 (0, 0) 排起 --------------------------

const HEAD = {
  x: 0, y: 0,
  kicker: 'SWOT · 四象限',
  title: 'svg-infovis 内核',
  sub: '零运行时依赖的 diagram 几何内核: 强在约束与确定性, 短在排布仍是人的活',
};
const headBlock = headingGeometry(HEAD).block;
const plotAt = { x: 0, y: round1(headBlock.h + SEAM) };
const g = quadrantGeometry({
  rect: { x: plotAt.x, y: plotAt.y, w: plotSize.w, h: plotSize.h }, cols: COLS, rows: ROWS,
});

/** 极标签: 行 = Helpful / Harmful(贴左), 列 = Internal / External(贴底) */
const POLES = {
  left: ['Helpful', 'Harmful'] as const,
  bottom: ['Internal', 'External'] as const,
};

/** 一条极标签的墨迹盒(仅供包围盒用: 位置与 `quadrantShape` 内部走同一个 `pole()`) */
const poleBox = (side: 'left' | 'bottom', i: number, content: string): Rect => {
  const a = g.pole(side, i);
  const m = measureText(content, { fontSize: POLE_FS });
  const x = a.anchor === 'end' ? a.at.x - m.width : a.anchor === 'start' ? a.at.x : a.at.x - m.width / 2;
  return { x, y: round1(a.at.y - m.height / 2), w: m.width, h: m.height };
};

// --- ③ 画布: 一切墨迹的并集 + 四边同值留白, 再把原点搬过去 -------------------

const ink = [
  headBlock, g.bounds,
  ...POLES.left.map((t, i) => poleBox('left', i, t)),
  ...POLES.bottom.map((t, i) => poleBox('bottom', i, t)),
];
const box = bounds(ink, { pad: PAD })!;
const O = { x: round1(-box.x), y: round1(-box.y) };          // 平移量: 并集左上角挪到 (PAD, PAD)
const at = (r: Rect): Rect => ({ ...r, x: round1(r.x + O.x), y: round1(r.y + O.y) });

// --- ④ 生成: 格底 → 轴(线 + 箭头 + 极标签) → 标题 ----------------------------

const plot = at(g.bounds);
const content: Descriptor[] = [
  // 密铺的格底(无描边)先落, 轴线后压 —— 倒过来轴会被格底盖掉
  ...CELLS.map((c, i) => nodeShape({
    ...at(g.cell(i % COLS, Math.floor(i / COLS))),
    label: `**${c.title}**`, sub: c.items.join('\n'),
    // 密铺格: 直角 + 不描边 —— 圆角会在格界上露出白缝, 描边会与轴线画成两条
    fontSize: FS, radius: 0, tone: c.tone, variant: 'tint', stroke: 'none',
  })),
  quadrantShape({
    rect: plot, cols: COLS, rows: ROWS,
    // 轴是这张图的骨架: 比组框线深一档(走主题的 edge 槽), 才压得住两侧的色底
    rules: { arrows: true, color: THEMES.light.edge },
    poles: { left: [...POLES.left], bottom: [...POLES.bottom] },
  }),
  headingShape({ ...HEAD, x: round1(HEAD.x + O.x), y: round1(HEAD.y + O.y) }),
];

const W = round1(box.w);
const H = round1(box.h);

if (isMainModule(import.meta.url)) {
  // 自检走 stderr(诊断不污染图): 格 / 区域 / 画布三笔账
  console.error(`SWOT · 格 ${cell.w}×${cell.h} · 区域 ${plotSize.w}×${plotSize.h} · 画布 ${W}×${H}`);
  process.stdout.write(toSVG(svg(W, H, content, { 'font-family': 'ui-sans-serif, system-ui, "PingFang SC", sans-serif' })));
}
