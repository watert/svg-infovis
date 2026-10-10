// =====================================================================
// gallery/dnd-alignment · 九宫格: "D&D 阵营图"(浅色, 密铺九格 + 井字 + 行列头)
//   bun run examples/gallery/dnd-alignment.ts > /tmp/dnd.svg
//
// 这张图证明什么: 同一件 `quadrantShape` 从四象限扩到 3×3 —— 骨架不变, 变的只是分区数:
//   · 分区线从"十字"变成"井字"(`cols-1 + rows-1` 条, 全自动), 外框用 `rules.frame` 补上
//   · 极标签从"整边一个维度名"换成"逐格一个": `top` 三列头(Lawful / Neutral / Chaotic)与
//     `left` 三行头(Good / Neutral / Evil) —— 数组 = 逐格, 长度与格位数不符当场抛
//   · `arrows` 在这里**打不开**(3×3 没有中轴线, 开了当场抛) —— 九宫格的方向感靠行列头说,
//     不靠轴箭头: 这是四象限与九宫格在版式上的真正分野
//
// 三行按阵营色谱分色(善良 emerald / 中立 slate / 邪恶 rose), 列的分界交给井字线 ——
// 颜色只用来说"善恶", 不重复说"守序混乱"(那是列头的活)。
//
// 走**描述符层**(直出 descriptor, 不经 scene / 不过门禁), 与 `infograph/*` 五件同档:
// 九宫格的格底 / 井字 / 行列头都是压在版式上的墨迹, 没有可审计的拓扑。
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

// --- 作者决策: 九格内容 + 几个版式常量 --------------------------------------

/** 一行 = 一条价值轴上的档位(Good / Neutral / Evil), 顺序即 `left` 行头的顺序 */
type Row = { tone: Tone; cells: { en: string; zh: string; desc: string }[] };

const ROWS: Row[] = [
  { tone: 'emerald', cells: [
    { en: 'Lawful Good', zh: '守序善良', desc: '有原则地守护他人' },
    { en: 'Neutral Good', zh: '中立善良', desc: '尽力行善, 不问出身' },
    { en: 'Chaotic Good', zh: '混乱善良', desc: '按良心行事, 反抗暴政' },
  ] },
  { tone: 'slate', cells: [
    { en: 'Lawful Neutral', zh: '守序中立', desc: '秩序与规则高于一切' },
    { en: 'True Neutral', zh: '绝对中立', desc: '不站边, 只求平衡' },
    { en: 'Chaotic Neutral', zh: '混乱中立', desc: '自由至上, 随机应变' },
  ] },
  { tone: 'rose', cells: [
    { en: 'Lawful Evil', zh: '守序邪恶', desc: '以秩序之名行私欲' },
    { en: 'Neutral Evil', zh: '中立邪恶', desc: '无原则, 只为一己之利' },
    { en: 'Chaotic Evil', zh: '混乱邪恶', desc: '以混乱与毁灭为乐' },
  ] },
];
/** 列头(守序 ↔ 混乱)与行头(善良 ↔ 邪恶) —— 数组 = 逐格一个, 长度必须与分区数一致 */
const COLS_HEAD = ['Lawful', 'Neutral', 'Chaotic'] as const;
const ROWS_HEAD = ['Good', 'Neutral', 'Evil'] as const;

const COLS = 3;
const ROWS_N = 3;
const PAD = 40;                 // 画布四边留白
const SEAM = 34;                // 标题块与九宫格的缝
const CELL_PAD: [number, number] = [18, 16];
const FS = 13;
const POLE_FS = QUADRANT_LAYOUT.poleFontSize;

// --- ① 尺寸账: 内容 → 格 → 区域(全程不落坐标) ------------------------------

const fits = ROWS.flatMap((row) => row.cells.map((c) => nodeFit({
  label: `**${c.en}**`, sub: `${c.zh}\n${c.desc}`, fontSize: FS, level: 'showcase', padding: CELL_PAD,
})));
const cell = { w: Math.max(...fits.map((f) => f.w)), h: Math.max(...fits.map((f) => f.h)) };
const plotSize = { w: cell.w * COLS, h: cell.h * ROWS_N };   // 密铺: 井字线画在格界上

// --- ② 布局: 标题在上、网格在下, 一切从 (0, 0) 排起 --------------------------

const HEAD = {
  x: 0, y: 0,
  kicker: 'ALIGNMENT · 九宫格',
  title: 'D&D 阵营九宫格',
  sub: '两条轴: 守序 ↔ 混乱 × 善良 ↔ 邪恶 —— 九个格位就是九种道德立场',
};
const headBlock = headingGeometry(HEAD).block;
const plotAt = { x: 0, y: round1(headBlock.h + SEAM) };
const g = quadrantGeometry({
  rect: { x: plotAt.x, y: plotAt.y, w: plotSize.w, h: plotSize.h }, cols: COLS, rows: ROWS_N,
});

/** 一条极标签的墨迹盒(仅供包围盒用: 位置与 `quadrantShape` 内部走同一个 `pole()`) */
const poleBox = (side: 'top' | 'left', i: number, content: string): Rect => {
  const a = g.pole(side, i);
  const m = measureText(content, { fontSize: POLE_FS });
  const x = a.anchor === 'end' ? a.at.x - m.width : a.anchor === 'start' ? a.at.x : a.at.x - m.width / 2;
  return { x, y: round1(a.at.y - m.height / 2), w: m.width, h: m.height };
};

// --- ③ 画布: 一切墨迹的并集 + 四边同值留白, 再把原点搬过去 -------------------

const ink = [
  headBlock, g.bounds,
  ...COLS_HEAD.map((t, i) => poleBox('top', i, t)),
  ...ROWS_HEAD.map((t, i) => poleBox('left', i, t)),
];
const box = bounds(ink, { pad: PAD })!;
const O = { x: round1(-box.x), y: round1(-box.y) };
const at = (r: Rect): Rect => ({ ...r, x: round1(r.x + O.x), y: round1(r.y + O.y) });

// --- ④ 生成: 格底 → 井字 + 外框 + 行列头 → 标题 ------------------------------

const cellsAt = ROWS.flatMap((row, r) => row.cells.map((c, ci) => ({ ...c, tone: row.tone, c: ci, r })));
const content: Descriptor[] = [
  // 密铺的格底(直角 + 不描边)先落, 井字线后压
  ...cellsAt.map((c) => nodeShape({
    ...at(g.cell(c.c, c.r)),
    label: `**${c.en}**`, sub: `${c.zh}\n${c.desc}`,
    fontSize: FS, radius: 0, tone: c.tone, variant: 'tint', stroke: 'none',
  })),
  quadrantShape({
    rect: at(g.bounds), cols: COLS, rows: ROWS_N,
    rules: { frame: true, color: THEMES.light.edge },
    poles: { top: COLS_HEAD, left: ROWS_HEAD },
  }),
  headingShape({ ...HEAD, x: round1(HEAD.x + O.x), y: round1(HEAD.y + O.y) }),
];

const W = round1(box.w);
const H = round1(box.h);

if (isMainModule(import.meta.url)) {
  console.error(`DND 九宫格 · 格 ${cell.w}×${cell.h} · 区域 ${plotSize.w}×${plotSize.h} · 画布 ${W}×${H}`);
  process.stdout.write(toSVG(svg(W, H, content, { 'font-family': 'ui-sans-serif, system-ui, "PingFang SC", sans-serif' })));
}
