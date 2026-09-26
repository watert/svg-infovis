// =====================================================================
// gallery/anim-progress · 数值长出来 —— 条宽 0 → 声明比例 + 阵列逐格点亮(SMIL, 零 JS)
//   bun run examples/gallery/anim-progress.ts > /tmp/anim-progress.svg
//
// 这张图证明什么:
//   · **非继承属性只能指名道姓** —— `width` 挂在 `<rect>` 自己身上, 而 `<animate>` 缺 href 时
//     目标是**它的父元素**(= 那个 `<g>`, 它没有 width) ⇒ 图上静默不动。所以条的填充段走
//     `attrs: { href: '#grow-fill' }` 指着那个 rect —— 这就是 href 逃生舱的示范位
//   · **静态态 = 末态**: 那个 rect 的 width 写的就是**声明比例**的宽, 动画只负责把"到达"演一遍。
//     于是产物离开 SMIL(rsvg 快照 / 静态消费 / 塞进文档)仍是一张**完整的图**, 不是一张空轨道
//   · **另一条轨: 逐格 visibility** —— 阵列的染色层每格一个 `visibility` 时间轴, 靠 `keyTimes`
//     错峰(不是靠 begin 错峰: ① begin 之前的静态值会露出来 —— 那一格会先亮一下再灭)。
//     `visibility` 是可继承属性, 但"点亮某一格"仍得**逐格包组**: 挂在阵列那个大组上只会整片亮
//   · 全图的 SMIL 值都是**静态字符串字面量**, 一帧都不算在构建期 ⇒ 产物字节确定(golden 那一套不变)
//
// 动起来什么样(浏览器打开产物; PNG 快照只有第一帧 = 静态末态):
//   ① 条的实墨从 0 长到 68%(1.6s, ease-out-cubic), 长满就冻住(fill="freeze")
//   ② 阵列 15 格里前 10 格**自左向右逐格亮**起来(0.4s 起, 每格 0.4s) —— 淡态打底, 染色层在上
//
// 版式(坐标全派生): 条与阵列的盒走块契约(`progressBlock.bounds` / `pictogramFit`)· 纵向靠
// `below` 从上一块底边推 · 阵列与右侧说明列走 `rightOf` · 格位走 `grid.cell`(与块内同一份格距)·
// 画布 = 墨迹并集 + 四边同值留白。宽高比的算术见文件末「画布」一段。
//
// ⚠ **地基缺口(如实记账, 不顺手改内核)**: `blocks/progress` 交出的填充段**没有 id / attrs 通道**,
// 所以那段"会长出来的墨"只能由本文件画 —— 盒仍从块解出来(同一份输入再解一次, 是同一份结果),
// 圆角读块声明的两个数。要收口的话, 该给 `ProgressProps` 加一个 id 出口(或让块收 `fillAttrs`),
// 但那属于 kernel 的公共面变更, 不在这张示例的范围内。
// ⚠ 另一半是 href 本身的性质: 它按 id 在整篇文档里找**第一个** —— 同页内联两份同一张产物时,
// 第二份的 width 动画会落在第一份那个 rect 上(并排多份要由宿主给 id 加实例前缀)。
//
// 它是**描述符层**示例(与 `start/basic.ts` / `infograph/progress.ts` 同档): 直出 descriptor,
// 不经 scene、不过门禁 —— 条与阵列都是压在版式上的墨迹(与图标 / 网格底纹同族, 不进净空审计)。
// =====================================================================

import {
  type DSvg, type Descriptor, animate, group, rect, svg,
} from '../../src/descriptor';
import { toSVG } from '../../src/serialize';
import { DEFAULT_THEME, canvasLayer, toneStyle } from '../../src/theme';
import { bounds, placeRect } from '../../src/geometry/box';
import { grid } from '../../src/geometry/grid';
import { below, rightOf } from '../../src/geometry/place';
import { type Pt, type Rect, round1 } from '../../src/geometry/vec';
import { measureText } from '../../src/knives/measure';
import { textShape } from '../../src/shapes/text';
import { iconShape } from '../../src/shapes/icon';
import { iconAsset } from '../../src/icons/lucide';
import { PROGRESS_LAYOUT, progressBlock } from '../../blocks/progress';
import { pictogramFit, pictogramShape } from '../../blocks/pictogram';

// --- 作者决策: 只有这一段是手写的数 -----------------------------------------

const PAD = 40;           // 画布四边留白(四边同值)
const HEAD_GAP = 10;      // 标题与副题的缝
const LINE_GAP = 10;      // 同一个块里两行字的缝
const BLOCK_GAP = 44;     // 副题 → 条(换话题)
const CAP_GAP = 22;       // 条 → 条下面那行说明
const BAND_GAP = 36;      // 说明 → 阵列那一带
const FOOT_GAP = 34;      // 带底 → 页脚
const COL_GAP = 28;       // 阵列与右侧说明列的缝
const BAR_W = 560;        // 条的满额宽(= 100% 的界; 版心宽是作者决策, 不是内容的函数)
const BAR_RATIO = 0.68;   // 声明的比例(**作者算好的数**: 内核不从数据推几何)
const ICON_SIZE = 34;     // 单图标边长(比块缺省 24 大一档: 15 个图标要撑住这一版)
const TOTAL = 15;         // 阵列格数(声明)
const COLS = 5;           // 每行几格
const LIT = 10;           // 染色格数 k(阅读序**前 k 格**)—— 恰两行满, 末行留淡态
const REVEAL_LEAD = 0.4;  // 第一格等多久点亮(s)
const REVEAL_STEP = 0.4;  // 每格隔多久(s)
const REVEAL_DUR = 4;     // 阵列这条时间轴多长(s): 末格恰落在 4.0s 上(前 10 格 = 0.4 + 9×0.4)
const GROW_DUR = 1600;    // 条长满要多久(ms)
const TITLE_SIZE = 18;
const SUB_SIZE = 12;

const BAR_TONE = 'blue' as const;
const PICT_TONE = 'emerald' as const;
/** 染色墨 / 条的填充墨 —— 与块内部**同一个语义槽**(solid 档的实底槽), 不另立色值 */
const BAR_INK = toneStyle(DEFAULT_THEME, BAR_TONE, 'solid').fill;
const PICT_INK = toneStyle(DEFAULT_THEME, PICT_TONE, 'solid').fill;
/** 填充段的圆角: 块的圆角减一圈轨道线宽(块自己那两个声明的数, 不在这里另立半径) */
const FILL_R = Math.max(0, PROGRESS_LAYOUT.radius - PROGRESS_LAYOUT.trackWidth);

const TITLE = '构建进度 · 长出来';
const SUB = '轨道是 100% 的界, 实墨从 0 长到声明的 68% —— 静态帧即末态, 动画只演"到达"';
const BAR_LABEL = '编译 68%';
const BAR_CAP = 'href 指着下面那个 rect 的 width: 0 → 声明宽(非继承属性, 只能指名道姓)';
const ARRAY_CAPS = [
  `任务阵列 ${TOTAL} 格: 前 ${LIT} 格已完成`,
  '淡态打底, 染色层逐格点亮',
  `每 ${REVEAL_STEP}s 一格(visibility)`,
] as const;
const FOOT = '两处动法: 条宽 = href 指 rect 的 width · 阵列 = 逐格 visibility 错峰';

const TASK = iconAsset('package-check');   // 构建期读一次盘(名字 → 纯数据), 之后上屏只吃数据

// --- 两行字的盒: 尺寸走 `measureText`(与画字同一把尺子), 落位交给作者 / `below` --------

type TextBox = Rect & { content: string; size: number; weight: number };
const caption = (content: string, at: Pt, size: number, weight: number): TextBox => {
  const m = measureText(content, { fontSize: size, weight });
  return { ...at, w: m.width, h: m.height, content, size, weight };
};
/** 一列同类文字: 第一行的顶边由作者给, 之后每行从上一行底边加缝推(`below`) */
const stack = (lines: readonly string[], at: Pt, size: number, weight: number, gap: number): TextBox[] => {
  const out: TextBox[] = [];
  for (const content of lines) {
    const prev = out[out.length - 1];
    out.push(caption(content, { x: at.x, y: prev ? below(prev, { w: 0, h: 0 }, gap).y : at.y }, size, weight));
  }
  return out;
};
const line = (b: TextBox, color: string) =>
  textShape({ x: b.x, y: round1(b.y + b.h / 2), content: b.content, size: b.size, weight: b.weight, baseline: 'central', color });

const title = caption(TITLE, { x: PAD, y: PAD }, TITLE_SIZE, 700);
const sub = caption(SUB, { x: PAD, y: below(title, { w: 0, h: 0 }, HEAD_GAP).y }, SUB_SIZE, 400);

// --- 条: 轨道 + 标签走块, 会长的那段墨由本文件画(缺口见文件头)-------------------

const barY = below(sub, { w: 0, h: 0 }, BLOCK_GAP).y;
/** 条的声明: 位置由 `below` 推, 宽与比例是作者给的, 档位走语义槽 */
const BAR_DECL = {
  x: PAD, y: barY, w: BAR_W, ratio: BAR_RATIO, label: BAR_LABEL,
  tone: BAR_TONE, variant: 'solid',
} as const;
// ratio: 0 = 合法状态(条内区还没有墨) ⇒ 块只画轨道与标签; 末态那一份只当**几何 oracle** 用
const track = progressBlock({ ...BAR_DECL, ratio: 0 });
const goal = progressBlock(BAR_DECL).fill!;
const barCap = caption(BAR_CAP, { x: PAD, y: below(track.bounds, { w: 0, h: 0 }, CAP_GAP).y }, SUB_SIZE, 400);

// --- 阵列: 淡态打底(块给的)+ 染色层逐格(本文件搭的, 只为一格一条时间轴)-------------

const bandY = below(barCap, { w: 0, h: 0 }, BAND_GAP).y;
const fit = pictogramFit({ total: TOTAL, cols: COLS, size: ICON_SIZE });
const arrayBox = placeRect({ w: fit.w, h: fit.h }, { x: PAD, y: bandY }, { anchor: 'nw' });
const rest = pictogramShape({ ...fit, total: TOTAL, x: arrayBox.x, y: arrayBox.y, filled: 0, asset: TASK });
// 格位 = 块的格距公式(`grid.cell` 是同一份): 阅读序走两层循环(逐行、行内自左向右), 不是背公式
const cells = grid({
  origin: { x: arrayBox.x, y: arrayBox.y }, cols: fit.cols, rows: fit.rows,
  cell: { w: fit.size, h: fit.size }, gap: { x: fit.gapX, y: fit.gapY },
});
// 右侧说明列: 顶边与阵列齐(块契约的盒直接喂 `rightOf`)
const colAt = rightOf(arrayBox, { w: 0, h: 0 }, COL_GAP, { align: 'start' });
const arrayCaps = stack(ARRAY_CAPS, { x: colAt.x, y: colAt.y }, SUB_SIZE, 400, LINE_GAP);

// 染色层: **逐格一个组** —— 组的 `visibility` 由它自己那条时间轴错峰点亮。错峰走 keyTimes
// (不用 begin 错峰: 动画开始前那一格会先按静态值露一下 —— 静态值就是末态那个"visible")
const inkCells: Descriptor[] = [];
for (let row = 0; row < fit.rows; row++) {
  for (let col = 0; col < fit.cols; col++) {
    const i = row * fit.cols + col;
    if (i >= LIT) break;   // 前 k 格才有染色层, 其余交给淡态那一层
    inkCells.push(group([
      iconShape({ ...cells.cell(col, row), asset: TASK, color: PICT_INK, theme: DEFAULT_THEME }),
      animate({
        attributeName: 'visibility', values: 'hidden;visible',
        dur: `${REVEAL_DUR}s`, begin: '0s',
        // 第 i 格在 (LEAD + i×STEP) 那个时刻翻面: 一个 s 精度的小数, 位不进浮点尾巴
        attrs: { calcMode: 'discrete', keyTimes: `0;${round1((REVEAL_LEAD + i * REVEAL_STEP) / REVEAL_DUR)}`, fill: 'freeze' },
      }),
    ], { id: `ink-${i}` }));
  }
}

// --- 页脚: 从带底再往下推一行 -------------------------------------------------

const foot = caption(FOOT, { x: PAD, y: below(bounds([arrayBox, ...arrayCaps])!, { w: 0, h: 0 }, FOOT_GAP).y }, SUB_SIZE, 400);

// --- 画布: 墨迹并集 + 四边同值留白 ------------------------------------------
//
// 并集收的是**真墨迹**: 五行文字 / 条的盒(含条上标签)/ 阵列盒 / 右侧说明列。留白同一个数四份。
// 比例算术(实测于 stderr): 墨迹 560×377.4 ⇒ 画布 640×457.4 ≈ **1.4** —— 宽度**正好**是条的满额声明
// (BAR_W 560)+ 两侧 PAD(它把说明行都比下去了, 所以画的与量的同宽); 高度由五层缝加出来
// (头两行 / 44 / 条 34 / 22 / 说明 16 / 36 / 阵列 118 / 34 / 页脚 16)。两者都**不靠垫白**凑。
const INK = bounds([title, sub, track.bounds, barCap, arrayBox, rest.bounds, ...arrayCaps, foot])!;
const W = round1(INK.x + INK.w + PAD);
const H = round1(INK.y + INK.h + PAD);

/** 会长的那段墨: 盒是**同一个块按声明比例解出来的** fill 盒(同一份输入 ⇒ 同一份结果) */
const growRect = rect(goal.x, goal.y, goal.w, goal.h, FILL_R, { id: 'grow-fill', fill: BAR_INK });

const content: Descriptor[] = [
  canvasLayer(DEFAULT_THEME, W, H),
  line(title, DEFAULT_THEME.tones.slate.text),
  line(sub, DEFAULT_THEME.label),
  // 条的轨道 + 标签(块的产物), 上面压着"会长的那段墨" + 它那条 href 时间轴
  track.shape,
  group([
    growRect,
    animate({
      attributeName: 'width', from: '0', to: String(goal.w), dur: `${GROW_DUR}ms`, begin: '0s',
      easing: 'ease-out-cubic',
      attrs: { href: '#grow-fill', fill: 'freeze' },   // ⚠ 逃生舱: 目标 = 这个 rect 自己(不是它父元素)
    }),
  ]),
  line(barCap, DEFAULT_THEME.label),
  // 阵列: 淡态一层(块), 染色层逐格压在上面 —— 两层同格位, 于是"点亮"只是换墨不是搬家
  rest.shape,
  ...inkCells,
  ...arrayCaps.map((b) => line(b, DEFAULT_THEME.label)),
  line(foot, DEFAULT_THEME.label),
];

/** 出口: 顶层只持**纯数据**(测试 / 读数板 / 网站 import 它都不会吐图), 序列化留在 `import.meta.main` */
export const doc: DSvg = svg(W, H, content, { 'font-family': 'ui-sans-serif, system-ui, "PingFang SC", sans-serif' });

if (import.meta.main) {
  // 自检走 stderr(图走 stdout): 条的几何 / 阵列格数 / 时间的错峰读数
  console.error(`条: 满额 ${BAR_W} → 声明 ${BAR_RATIO} 实墨 ${goal.w}(块解的盒) · 圆角 ${FILL_R}(块声明的两数之差)`);
  console.error(`阵列 ${fit.cols}×${fit.rows} 格(边长 ${fit.size})· 染色 ${LIT}/${TOTAL} 格 · 格位 ${cells.cell(0, 0).x},${cells.cell(0, 0).y}`);
  console.error(`墨迹 ${INK.w}×${INK.h} → 画布 ${W}×${H} · 比例 ${round1(W / H)}(画廊带 1.3~1.7)`);
  console.error(`时间轴: 条 ${GROW_DUR}ms(0→末态) · 阵列 ${REVEAL_DUR}s(keyTimes 0.1 → 1.0, 每格 ${REVEAL_STEP}s)`);
  process.stdout.write(toSVG(doc));
}
