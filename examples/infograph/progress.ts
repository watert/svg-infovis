// =====================================================================
// infograph/progress · v0.2 排版层: 两条单值进度条 + 一条三段堆叠条(blocks/ 层的第一个示例)
//   bun run examples/infograph/progress.ts > /tmp/progress.svg
//
// 这张图证明四件事:
//   · **块契约落地** —— 三条块的盒全由组件自己给出(`bounds`), 位置由 `packCol` 摆: 脚本里没有
//     一个手写的条坐标, 手写的只有三条文案与三个版式常量。摆完之后把**摆好的盒摊回 props**
//     (`{ ...声明, ...摆好的盒 }`)画一次, 画出来的墨迹与摆的盒逐位相同(blocks 层的核心承诺)
//   · **反比例尺口子** —— `ratio` / `ratios` 是**作者算好的数**(这里是"读盘 68%"这类声明的比例),
//     组件不推、不归一化、也不替你算百分比。内核一旦从数据推几何, 就是 chart 库的活(走
//     `assets/embeds/` 的 echarts 底板)
//   · **两档标签位置**都画出来: `above`(条上方、左对齐条左缘)与 `inside`(骑条心 —— 条本身要够高,
//     装不下时组件当场抛, 不给你一块压在轨道边上的字)
//   · **`tone × variant` 是一条深浅阶梯**: outline(该 tone 的浅色档) / solid(实色档); 而**轨道
//     不随档位变**(轨道是"100% 的界", 让某一档去染它就得不出"进度"这个读法)
//
// 它是**描述符层**示例(与 `start/basic.ts` / `infograph/stat.ts` 同档): 直出 descriptor, 不经
// scene、不过门禁 —— 进度条是**压在版式上的墨迹**(与图标 / 网格底纹同档), 没有可审计的拓扑。
// 块与块的距离靠作者的 `GAP` 留位, 别指望门禁替你喊。
// =====================================================================

import { svg } from '../../src/descriptor';
import { toSVG } from '../../src/serialize';
import { bounds } from '../../src/geometry/box';
import { packCol } from '../../src/geometry/pack';
import { type Pt, type Rect, round1 } from '../../src/geometry/vec';
import type { Tone, Variant } from '../../src/theme';
import { type ProgressProps, progressBlock, stackedBarBlock } from '../../blocks/progress';
import { isMainModule } from '../../src/runtime';

// --- 作者决策: 只有这一段的数是手写的 ---------------------------------------

const BAR_W = 480;   // 条的满额宽(它同时是这一列块宽 —— 版心宽是作者决策, 不是内容的函数)
const GAP = 34;      // 块缝(缝的节奏是作者决策, 不是推导)
const PAD = 40;      // 画布四边留白
const NATURAL_MAX = 900; // 交付尺寸经验档: 自然宽超了该减文案, 不是加宽画布(QUICKREF「交付尺寸」)

/** 一条单值条的**声明**: 文案 + 比例 + 档位。**位置一个都不写** —— 那是 `packCol` 的活 */
type SingleDecl = Omit<ProgressProps, 'x' | 'y' | 'w'>;

const SINGLES: SingleDecl[] = [
  // 主用例: 实底档 + 条上方标签(进度条的默认观感)
  { ratio: 0.68, label: '读盘 68%', tone: 'blue', variant: 'solid' },
  // 第二档: 中档色 + 条内标签(条更高, 字才装得下 —— 条内那一档的代价就在这里)
  { ratio: 0.42, label: '42%', labelAt: 'inside', barH: 24, tone: 'emerald', variant: 'outline' },
];

/** 三段堆叠: 逐段一个 tone, 合计 = 1(合计 < 1 的余量也是合法写法, 见 blocks/README.md) */
const STACK = {
  ratios: [0.55, 0.28, 0.17],
  tones: ['blue', 'emerald', 'slate'] as Tone[],
  barH: 16,
  variant: 'solid' as Variant,
};

// --- 块: 尺寸由组件给 → 位置由 packCol 摆 → 画布由内容并集定 --------------------

const probes: Rect[] = [
  ...SINGLES.map((s) => progressBlock({ ...s, x: 0, y: 0, w: BAR_W }).bounds),
  stackedBarBlock({ ...STACK, x: 0, y: 0, w: BAR_W }).bounds,
];
const col = packCol({ items: probes, gap: GAP, x: 0, y0: 0, align: 'start' });
const ink = bounds(col.rects)!;
const W = round1(ink.w + 2 * PAD);
const H = round1(ink.h + 2 * PAD);
/** 内容坐标系 → 画布: 并集左上角挪到 (PAD, PAD) —— 与 `start/basic.ts` 同一份平移 */
const O: Pt = { x: round1(PAD - ink.x), y: round1(PAD - ink.y) };
const move = (r: Rect): Rect => ({ ...r, x: round1(r.x + O.x), y: round1(r.y + O.y) });

// 摆好的盒**摊回声明**(`{ ...声明, ...盒 }`)再画一次: 盒高不是旋钮(`barH` 才是), 所以摊回来之后
// 逐位相同才是真闭环 —— 这条判据住在 `blocks/progress.test.ts`
const singles = SINGLES.map((s, i) => progressBlock({ ...s, ...move(col.rects[i]) }));
const stack = stackedBarBlock({ ...STACK, ...move(col.rects[2]) });
const content = [...singles.map((b) => b.shape), stack.shape];

if (isMainModule(import.meta.url)) {
  // 自检只走 stderr(诊断不污染图): 满额 / 逐段宽 / 块高 —— 逐段宽应与"比例 × 条内区宽"对得上
  const segW = stack.segments.map((s) => s.w);
  console.error(`单值条: 满额 ${BAR_W} → 填充 ${singles.map((b) => b.fill!.w).join(' / ')}`);
  console.error(`堆叠条: ${segW.join(' + ')} = ${round1(segW.reduce((a, b) => a + b, 0))}(比例 ${STACK.ratios.join(' / ')})`);
  console.error(`块高 ${probes.map((b) => b.h).join(' / ')} · 自然尺寸 ${W} × ${H}(交付经验档宽 ≤${NATURAL_MAX})`);
  if (W > NATURAL_MAX) console.error(`警告: 自然宽 ${W} > ${NATURAL_MAX} —— 进帖 / README 会被缩到读不动(QUICKREF「交付尺寸」)`);

  process.stdout.write(toSVG(svg(W, H, content, { 'font-family': 'ui-sans-serif, system-ui, "PingFang SC", sans-serif' })));
}
