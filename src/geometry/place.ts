// =====================================================================
// place · 锚点糖面(把盒摆到另一个盒的某侧)
//
// 由来(260925 examples 调研): 手写坐标里反复出现两件事, 每件只有一个意思, 却每个客户各写一遍 ——
//   · `{ x: BOX_W + CORRIDOR, y: TITLE_ZONE + BOX_H + CORRIDOR, ... }`(port-folds 的 REL_B
//     260925 前就是这一串, 现在改写成 `below(rightOf(...))` 了):
//     想说的其实是"B 在 A 右边 70px、再往下 70px"
//   · 缝中点 `(a + b) / 2`(basic.ts 的标签 / 回环标签): 那是 `vec` 的 `mid`, 仓内**已有**
//     (别为它再造一个 `midpoint` —— 一处事实一处; 260925 起重写后的 basic.ts 已改用 `mid`)
// 第一种收成本文件的五个入口: 四方向 `rightOf` / `leftOf` / `below` / `above` + `centeredOn`。
//
// ── 这是**糖面**, 不是第二个几何层 ─────────────────────────────────────
//   内部一次都不自己算坐标: 面上的点走 `box.rectFace`(它走 `geometry/port` 的 `portPoint`), 落点走
//   `box.placeRect` —— 面上的点与锚点定义全仓各只有一份。本文件只加两样东西:
//   ① 方向 →(面, 面上的 `t`, 交叉轴锚)的映射表 ② 入参守卫(仓内"当场抛"那一档)。
//   与 `box` 的分工: `box` 查**一个**盒(面 / 锚 / 内缩 / 并集 / 摆放), 本文件说**两个**盒的关系。
//
// ── 缺省 `align: 'center'`(与 `pack` 的 `start` 不同, 故意的) ──────────
//   糖面吃的是"**面**", 而面的中点就是每一步的缺省(route 的端口缺省也是面中点); `pack` 是
//   "次序堆叠", 对齐线由作者声明, 在那里 `start` 才是无需声明的那一档。
//
// ⚠ `gap` 是**两个盒之间**的空档(面到面), 不是节距 —— 节距那种"前缘到前缘、含整个盒"的心智
// 归 `pack` 的 `pitch`, 两个词别互相代用(那是"差一个盒尺寸"的错法, 图上门禁看不出来)。
// =====================================================================

import { type AnchorName, type Size, placeRect, rectAnchor, rectFace } from './box';
import type { Rect } from './vec';
import type { Side } from './port';
import { HINT_KNOB_SIZE, ShapeInputError, assertFiniteNumber, assertFiniteRect, assertOneOf } from '../guard';

/** 交叉轴对齐三档(与 `pack` 同一套词): `start` 贴交叉轴起点侧 · `center` 骑中线 · `end` 贴终点侧 */
export type PlaceAlign = 'start' | 'center' | 'end';

/** 缺省 `center` = 与 `ref` 同心(参考点就是那个面的中点) */
export type PlaceOptions = { align?: PlaceAlign };

const ALIGNS = ['start', 'center', 'end'] as const;

/**
 * 方向 → 面 + 交叉轴三档锚。查表只给两样, **坐标一个不写**:
 *   · `side` 给 `rectFace` —— offset 正数本来就是**朝外**法线, 四个方向同号(不必各自定方向)
 *   · `anchors` 给 `placeRect`(盒的哪一点落在那个参考点上): 起点侧贴交叉轴的**头**, 终点侧贴**尾**
 *   · 面上的**哪一点**由 `T` 给 `t` —— 缺它就只有面中点, "顶边与 ref 顶边齐"就落不出来
 */
const FACES = {
  rightOf: { side: 'right', anchors: { start: 'nw', center: 'w', end: 'sw' } },
  leftOf: { side: 'left', anchors: { start: 'ne', center: 'e', end: 'se' } },
  below: { side: 'bottom', anchors: { start: 'nw', center: 'n', end: 'ne' } },
  above: { side: 'top', anchors: { start: 'sw', center: 's', end: 'se' } },
} as const satisfies Record<string, { side: Side; anchors: Record<PlaceAlign, AnchorName> }>;

/**
 * align → 面上的 `t`(0 / 0.5 / 1)。四方向共用一份: `t` 在顶 / 底面上从**左**数起, 在左 / 右面上
 * 从**顶**数起 —— 正是四个方向各自的交叉轴, 于是"起点侧"永远是同一档。
 */
const T: Record<PlaceAlign, number> = { start: 0, center: 0.5, end: 1 };

/** 四方向入口名(表在 `FACES`) */
export type PlaceDir = keyof typeof FACES;

/** 尺寸守卫: `w/h` 的"有限 + 非负" —— 与 `assertFiniteRect` 对宽高那条**逐字同源**(那边四元, 这边只有尺寸) */
function assertSize(shape: string, s: Size): void {
  for (const k of ['w', 'h'] as const) {
    assertFiniteNumber(shape, k, s[k]);
    if (s[k] < 0) throw new ShapeInputError(shape, k, `为负(${s[k]})`, '宽高是尺寸不是增量; 传绝对值, 方向交给 x/y');
  }
}

/** 四方向的共用实现: 守卫 → 查表 → `rectFace` + `placeRect`(本文件不含任何坐标公式) */
function beside(kind: PlaceDir, ref: Rect, size: Size, gap: number, opts: PlaceOptions): Rect {
  assertFiniteRect(kind, ref);
  assertSize(kind, size);
  assertFiniteNumber(kind, 'gap', gap);
  if (gap < 0) throw new ShapeInputError(kind, 'gap', `为负(${gap})`, HINT_KNOB_SIZE);
  assertOneOf(kind, 'align', opts.align, ALIGNS);
  const align = opts.align ?? 'center';
  const f = FACES[kind];
  const at = rectFace(ref, f.side, { t: T[align], offset: gap });
  return placeRect(size, at, { anchor: f.anchors[align] });
}

/**
 * `ref` 的**右边**隔 `gap` 摆 `size`; 交叉轴按 `align` 对齐(缺省 `center` = 两盒中线同高)。
 *
 * ```ts
 * rightOf(a, fitB, CORRIDOR)                                     // B 在 A 右侧 70px, 中线同高
 * rightOf(a, fitB, 70, { align: 'start' })                       // 顶边对齐(左对齐的竖排里更常见)
 * below(rightOf(a, fitB, 70, { align: 'start' }), fitB, 70, { align: 'start' })    // 右下斜邻位
 * ```
 */
export function rightOf(ref: Rect, size: Size, gap: number, opts: PlaceOptions = {}): Rect {
  return beside('rightOf', ref, size, gap, opts);
}

/** `ref` 的**左边**隔 `gap` 摆 `size`(交叉轴对齐同 `rightOf`; 左中 = `align: 'center'` 缺省) */
export function leftOf(ref: Rect, size: Size, gap: number, opts: PlaceOptions = {}): Rect {
  return beside('leftOf', ref, size, gap, opts);
}

/** `ref` 的**下边**隔 `gap` 摆 `size`(`align: 'start'` = 左对齐, `'end'` = 右对齐 —— 竖排链的一列就用它) */
export function below(ref: Rect, size: Size, gap: number, opts: PlaceOptions = {}): Rect {
  return beside('below', ref, size, gap, opts);
}

/** `ref` 的**上边**隔 `gap` 摆 `size`(交叉轴对齐同 `below`, 方向朝上) */
export function above(ref: Rect, size: Size, gap: number, opts: PlaceOptions = {}): Rect {
  return beside('above', ref, size, gap, opts);
}

/**
 * 两轴对心: `size` 的盒心落在 `ref` 的**心**上(= `rectAnchor(ref, 'center')` 接着 `placeRect`)。
 * 叠图元的落位(图标压在色块中央 / 徽标骑在卡片上)就是它。
 */
export function centeredOn(ref: Rect, size: Size): Rect {
  assertFiniteRect('centeredOn', ref);
  assertSize('centeredOn', size);
  return placeRect(size, rectAnchor(ref, 'center'));
}
