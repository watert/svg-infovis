// =====================================================================
// infograph/pictogram · 图标阵列(ISOTYPE): 单行 10 染 7 + 4×5 网格 20 染 13
//   bun run examples/infograph/pictogram.ts > /tmp/pictogram.svg
//
// 这张图证明什么:
//   · **阵列里没有一个手写坐标** —— 两块尺寸由 `pictogramFit` 反算, 位置由 `below` 从上一块的
//     底边加缝推出来(`place` 吃的就是块交出的 `bounds`), 逐个图标的落位全在 `pictogramShape` 里
//   · **N 与 k 是作者声明的** —— 脚本里只有 `{ total: 10, filled: 7 }` 这样的声明; 没有数组、没有
//     比例尺、没有轴(要"从数据推几何"那是 chart: 走 `assets/embeds/` 的 echarts 底板)
//   · **两档墨的对比就是这一格的读法** —— 染了的走 tone 的实底槽, 没染的走 slate 的描边槽;
//     单行用 blue、网格用 emerald, 证明肤色是**语义槽**(换一个词就换一族, 不是一个色值)
//   · **素材链的构建期那一半** —— `iconAsset('user')` 在这里读一次盘(名字 → 纯数据), 之后
//     `blocks/pictogram` 只吃数据; 块自己不引 `node:fs`, 于是浏览器路径照样能用它(与
//     `shapes/icon` / barrel 不收 `lucide.ts` 是同一条纪律)
//
// 它是**描述符层**示例(与 `start/basic.ts` / `infograph/stat.ts` 同档): 直接拼 `svg()` 出图,
// 不经 scene、不过门禁 —— 图标与阵列都是**压在版式上的墨迹**(与网格底纹同档, 不进净空审计),
// 所以这条路径就是它的正路。要先看门禁那一路, 读 `start/full-chain.ts`。
// =====================================================================

import { svg } from '../../src/descriptor';
import { toSVG } from '../../src/serialize';
import { bounds } from '../../src/geometry/box';
import { below } from '../../src/geometry/place';
import { type Pt, round1 } from '../../src/geometry/vec';
import { measureText } from '../../src/knives/measure';
import { textShape } from '../../src/shapes/text';
import type { Tone } from '../../src/theme';
import { iconAsset } from '../../src/icons/lucide';
import { type PictogramFitOptions, pictogramFit, pictogramShape } from '../../blocks/pictogram';
import { isMainModule } from '../../src/runtime';

// --- 作者决策: 只有这一段是手写的数 ------------------------------------------

const PAD = 40;         // 画布四边留白(四边同值: 与内容缩到多大无关)
const SEAM = 14;        // 说明行与阵列之间的缝
const BLOCK_GAP = 48;   // 两块之间的缝(比 SEAM 大: 它们是两个话题, 不是一个话题的两行)
const ICON_SIZE = 26;   // 单图标边长(比块缺省 24 大一档: 22 个图标要撑住这一版的版面)
const CAP_SIZE = 13;    // 说明行字号
const CAP_WEIGHT = 600;
const NATURAL_MAX = 900; // 交付尺寸经验档: 自然宽超了该减图标 / 减文案, 不是加宽画布

/** 两块**全部**的数值语义就这两行 —— N 与 k 是声明的, 没有数组、没有比例尺 */
const ROW: PictogramFitOptions & { filled: number; tone: Tone } =
  { total: 10, filled: 7, tone: 'blue' };                       // 单行: 10 个人里 7 个
const GRID: PictogramFitOptions & { filled: number; tone: Tone } =
  { total: 20, cols: 4, filled: 13, tone: 'emerald' };          // 4×5 网格: 第 3 行满, 第 4 行只填到第 1 个

const CAP1 = '单行: 10 个里 7 个染色(blue), 其余走 slate 淡态';
const CAP2 = '4×5 网格: 20 个里 13 个(emerald) —— 染色断在第 4 行';

// --- 素材: 构建期读一次盘(名字 → 纯数据), 之后块只吃数据 ----------------------

const PERSON = iconAsset('user');     // 一个人 = 一个图标(ISOTYPE 的老规矩: 数量画成可数的东西)
const BOX = iconAsset('package');     // 网格换一套素材, 证明阵列与图标内容无关

// --- 排布: 尺寸反算 → 位置由 `below` / `above` 从邻块推出来 --------------------

const fits = {
  row: pictogramFit({ total: ROW.total, size: ICON_SIZE }),
  grid: pictogramFit({ total: GRID.total, cols: GRID.cols, size: ICON_SIZE }),
};

/** 一行说明: 盒尺寸走 `measureText`(与画字同一把尺子), 位置交给作者 */
const caption = (text: string, at: Pt) => {
  const m = measureText(text, { fontSize: CAP_SIZE, weight: CAP_WEIGHT });
  return { x: at.x, y: at.y, w: m.width, h: m.height };
};

const cap1 = caption(CAP1, { x: PAD, y: PAD });
const row = pictogramShape({ ...below(cap1, fits.row, SEAM, { align: 'start' }), ...ROW, size: ICON_SIZE, asset: PERSON });
// 第二块接在第一块**交出的墨迹盒**下面 —— `bounds` 是块契约的那一半, 这里就是在用它
const cap2 = caption(CAP2, { x: PAD, y: below(row.bounds, { w: 0, h: 0 }, BLOCK_GAP).y });
const grid = pictogramShape({ ...below(cap2, fits.grid, SEAM, { align: 'start' }), ...GRID, size: ICON_SIZE, asset: BOX });

// --- 画布: 由画出来的东西的并集定(两块墨迹 + 两行说明), 四边同值留白 ------------
//
// 说明行比阵列还宽是完全可能的(两条短文案就够), 所以并集要把它们一起收进来 ——
// 只按阵列算宽, 说明行会探出画布外, 而这一路**没有任何门禁**会喊(描述符层不过 `single_svg`)。
const INK = bounds([cap1, row.bounds, cap2, grid.bounds])!;
const W = round1(INK.x + INK.w + PAD);
const H = round1(INK.y + INK.h + PAD);

/** 说明行: 基线走行盒中心(`central` 折算在 `baselineY` 那一处) */
const capLine = (box: { x: number; y: number; w: number; h: number }, content: string) =>
  textShape({ x: box.x, y: round1(box.y + box.h / 2), content, size: CAP_SIZE, weight: CAP_WEIGHT, baseline: 'central' });

if (isMainModule(import.meta.url)) {
  // 自检走 stderr(图走 stdout): 两块各自的格数与墨迹盒, 顺带量一眼自然宽
  console.error(`单行 ${fits.row.cols}×${fits.row.rows} 格 · 墨迹 ${fits.row.w}×${fits.row.h}`);
  console.error(`网格 ${fits.grid.cols}×${fits.grid.rows} 格 · 墨迹 ${fits.grid.w}×${fits.grid.h}`);
  if (W > NATURAL_MAX) console.error(`警告: 自然宽 ${W} > ${NATURAL_MAX} —— 进帖 / README 会被缩到读不动(QUICKREF「交付尺寸」)`);
  console.error(`自然尺寸 ${W} × ${H}`);

  process.stdout.write(toSVG(svg(W, H, [
    capLine(cap1, CAP1),
    row.shape,
    capLine(cap2, CAP2),
    grid.shape,
  ], { 'font-family': 'ui-sans-serif, system-ui, "PingFang SC", sans-serif' })));
}
