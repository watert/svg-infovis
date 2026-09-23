// =====================================================================
// pack · 摆放列 / 摆放行(构建期把一串盒摞起来或铺开)
//
// 由来(260920 评估 §2.3): "把 N 个盒依次摞 / 排"这件事此前散成手写算术 —— `y + h + 40`、
// `(w1 - w2) / 2`、`156 + i * STEP`。它们全是**纯加法与取中**, 却每个客户各写一遍。本文件收成
// 两个入口: `packCol`(竖排)与 `packRow`(横排), 输入是尺寸列(`nodeFit` / `cardFit` 的返回),
// 输出是摆好的绝对坐标 `rects` + 并集 `bounds`(直接喂 `bounds()` 加 pad 就是组框)。
//
// ── 分工(三条边界, 别越) ──────────────────────────────────────────────
//   · **与 `grid` 分工**: 两轴都等距的规则格子 → `grid`; 只在**一个轴**上等距(尺寸参差也行)
//     → `pack`。有机图(层内视觉重量不等距)不许硬套 grid, 但一个轴上 pack 是安全的
//   · **与 `nudge` 分工**: pack 是**构建期造 rect**(造出来就是最终坐标); nudge 是**已有 rect
//     事后微移**(align / distribute / snap 一条边)。两件事, 不合并 —— 合并会让"这个坐标是哪来的"
//     失去单一答案
//   · **与旧 TODO 的 `pack_row` 无关**: 那个名字是 blink 时代的"冻结图进 CI 的 HTML 行打包",
//     撞名而已(评估文 §五 明写: 另开, 不复活)
//
// 明确不做: flex / grid 规范式 API(justify / minmax / auto-flow / wrap) —— `align` 只有三档,
// 量词只有一个 `gap`。嵌套坐标系同样不做(输出全是绝对坐标, 与 `box` / `grid` 同一立场)。
//
// 依赖: `vec`(Rect / round1)与 `box` 的 `bounds`(并集只许一份公式; 于是与 `grid` 一样继承
// README 分层段记的那条"有意例外" —— pack 自己不碰 route)。
// =====================================================================

import { type Rect, round1 } from './vec';
import { type Size, bounds } from './box';

/** 交叉轴对齐三档: `start` 贴对齐线的起点侧 · `center` 骑在对齐线上 · `end` 贴终点侧 */
export type PackAlign = 'start' | 'center' | 'end';

export type PackColOptions = {
  /** 尺寸列(顺序即次序); 只读 `w/h` —— `nodeFit` / `cardFit` 的返回直接丢进来 */
  items: readonly Size[];
  /** 相邻两项的缝(px) */
  gap: number;
  /** 交叉轴的**对齐线**: `align` 决定它是每项的左边 / 中心线 / 右边 */
  x: number;
  /** 主轴起点 = 第一项的**顶边** */
  y0: number;
  /** 交叉轴对齐(缺省 `start` = 左对齐) */
  align?: PackAlign;
};

export type PackRowOptions = {
  /** 尺寸列(顺序即次序); 只读 `w/h` */
  items: readonly Size[];
  /** 相邻两项的缝(px) */
  gap: number;
  /** 交叉轴的**对齐线**: `align` 决定它是每项的顶边 / 中心线 / 底边 */
  y: number;
  /** 主轴起点 = 第一项的**左边** */
  x0: number;
  /** 交叉轴对齐(缺省 `start` = 顶对齐) */
  align?: PackAlign;
};

export type PackResult = {
  /** 摆好的绝对坐标(与 `items` 同序、同长) */
  rects: Rect[];
  /** 这些 rect 的并集(**不 pad**) —— 组框走 `bounds(rects, { pad })`; 空 `items` → `null` */
  bounds: Rect | null;
};

/** 对齐三档 → 比例: 落点 = 对齐线 − 尺寸 × k */
const ALIGN_K: Record<PackAlign, number> = { start: 0, center: 0.5, end: 1 };

/**
 * 竖排: 各项按**次序**自上而下摞, 间距同一份 `gap`; 交叉轴按 `align` 对齐到 `x`。
 *
 * ```ts
 * const col = packCol({ items: [sceneFit, diaFit, dbFit], gap: 40, x: 277, y0: 30, align: 'center' });
 * col.rects[1]                                  // 第二项的绝对坐标
 * bounds(col.rects, { pad: [30, 26] })          // 整列的组框(框在列外 30 / 26)
 * ```
 * ⚠ `x` 是**对齐线**不是左缘: `align: 'center'` 时它是每项中心线, `'end'` 时是右边。
 * 尺寸参差时只有 `center` 能保证"同轴"(菱形 / 圆柱与矩形同心 —— 直连边的端口才对称)。
 */
export function packCol(o: PackColOptions): PackResult {
  const k = ALIGN_K[o.align ?? 'start'];
  const rects: Rect[] = [];
  let y = o.y0;
  for (const it of o.items) {
    rects.push({ x: round1(o.x - it.w * k), y: round1(y), w: it.w, h: it.h });
    y += it.h + o.gap;
  }
  return { rects, bounds: bounds(rects) };
}

/**
 * 横排: 各项按**次序**自左而右铺开, 间距同一份 `gap`; 交叉轴按 `align` 对齐到 `y`。
 *
 * ⚠ `y` 是**对齐线**不是顶边(同 `packCol` 的 `x`)。列宽 / 行高由 items 自己说了算 ——
 * 这里不提供"等宽列"(要等宽就先把尺寸列统一, 那是作者决策)。
 */
export function packRow(o: PackRowOptions): PackResult {
  const k = ALIGN_K[o.align ?? 'start'];
  const rects: Rect[] = [];
  let x = o.x0;
  for (const it of o.items) {
    rects.push({ x: round1(x), y: round1(o.y - it.h * k), w: it.w, h: it.h });
    x += it.w + o.gap;
  }
  return { rects, bounds: bounds(rects) };
}
