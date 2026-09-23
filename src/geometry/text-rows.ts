// =====================================================================
// geometry/text-rows · 行块几何(n 行居中堆叠) —— 唯一一份
//
// 由来(260920): 「盒子按 1 行给、字按 N 行画」。260920 给 `nodeShape` 还了多行渲染的欠账
// (label 支持 `\n`), 但**同一套行装配公式当时写在三个地方**(`shapes/node.ts` 的节点标签 /
// `export.ts` 的旁注文本 / `knives/fit.ts` 的 `nodeFit`), 其中第三份漂在了旧口径(整串当一行)——
// 于是 3 行泳道名按 39px 的盒画进 51px 的字, 而 `label_fit` 只判**宽** ⇒ 门禁全绿出厂。
//
// 教训与 `NODE_TEXT_LAYOUT` 那条同源但更狠一层: 常量写多份会漂, **公式写多份也会漂**,
// 而且漂掉的那份不会有任何提示(常量至少有"两个数看着不一样"这种显式信号)。
//
// 定位: **纯几何, 零依赖**(与 `vec.ts` 同层同纪律, 不 import 任何东西)。
// 它只回答一件事: n 个**行盒**以行块中心对称堆叠时, 每行的行心落在哪、整块占多高。
// **行距 / 字号 / 字重 / 要不要拆行 / 主次标签的字号差, 全是调用方的口径**, 本文件一个都不猜 ——
// 节点内两行是 `NODE_TEXT_LAYOUT.lineGapEm × 主字号`, 旁注是它自己的字号, 这些差异留在各自那一层;
// 只有"怎么堆"收在这里。
//
// 为什么不是又一道门禁: 它不判任何事 —— 不返回 pass/fail、不抛错、不持有阈值, 只产两个数。
// 门禁问"能不能出", 它回答"这些行落在哪、要多大地方", 是**读数**层。
//
// 与 `knives/fit.ts` 的分工(别把这两件事混起来):
//   · 本文件 —— 给定"有几行、行距多少、每行多高", 算偏移与并集高。纯算术。
//   · `nodeFit` —— 决定"有几行"(`\n` 拆几行 + 要不要次标签)、行距取哪份常量、每行行盒多高
//     (`measureText`), 再拿本文件的输出反解盒尺寸。**它负责口径, 本文件负责堆法。**
// =====================================================================

/** 一个行块: 行数 + 行心间距 → 每行偏移 + 整块并集高 */
export type RowBlock = {
  /** 行数(0 = 空块, 偏移为空数组、高为 0) */
  count: number;
  /** 相邻两行**行心**的间距(px)。由调用方的口径给(节点内 = 主字号 × `lineGapEm`) */
  gap: number;
  /**
   * 每行**行心**相对行块中心的 y 偏移(升序)。**中心对称**: 奇数行正中那行为 0,
   * 偶数行为 `±gap/2`、`±3gap/2`… —— 整块的重心恒为 0, 所以调用方拿框中心一加就落位,
   * 不必按行数分奇偶写两套公式。
   */
  offsets: number[];
  /**
   * 行块**并集高**(px) = `max(行心 + 半行盒) − min(行心 − 半行盒)`。
   * 不传 `rowHeights` 时退化成 `(count − 1) × gap` —— 那是"零厚度的行",
   * 只够算偏移, **别拿它当盒高**(那正是 260920 那个事故的算式)。
   */
  height: number;
};

/**
 * 把 `count` 行按行心间距 `gap` 居中堆叠。
 *
 * @param count  行数(0 是合法退化: 没有行 = 不占高)
 * @param gap    相邻行心的间距(px)。**同一块内所有行共用一个间距** —— 主/次标签字号不同也共用,
 *               这不是近似而是渲染事实(`nodeShape` 与 `export.ts` 都是这么画的)
 * @param rowHeights 每行的行盒高(px), 长度必须等于 `count`。传了才算并集高;
 *               不传则 `height = (count − 1) × gap`(见 `RowBlock.height` 的警告)
 *
 * 有限性不在这里守(与 `vec.ts` 同纪律): 输入非有限会算出非有限, 由 API 边界
 * (`nodeShape` / `exportScene` / `nodeFit` 的 assert)与 `finite_svg` 门禁兜。
 */
export function rowBlock(count: number, gap: number, rowHeights?: readonly number[]): RowBlock {
  const offsets: number[] = [];
  for (let i = 0; i < count; i += 1) offsets.push((i - (count - 1) / 2) * gap);
  if (!offsets.length) return { count, gap, offsets, height: 0 };
  if (!rowHeights || !rowHeights.length) {
    // 零厚度行: 只有首个行心与末个行心之间有距离
    return { count, gap, offsets, height: offsets[offsets.length - 1] - offsets[0] };
  }
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < offsets.length; i += 1) {
    const half = (rowHeights[i] ?? 0) / 2;
    lo = Math.min(lo, offsets[i] - half);
    hi = Math.max(hi, offsets[i] + half);
  }
  return { count, gap, offsets, height: hi - lo };
}
