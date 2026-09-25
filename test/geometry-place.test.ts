// =====================================================================
// geometry/place · 锚点糖面(把盒摆到另一个盒的某侧)
//
// 糖面最容易"看着对、差一个盒尺寸"。这份测试钉四件事:
//   ① **方向与交叉轴三档**: 四个方向各贴 ref 的哪条边、朝哪边挪 gap、start / center / end 落
//      在哪条对齐线上 —— 全摊平写成显式坐标(循环里全对、单看不对的那种错在这里无处藏)
//   ② **缺省是 `center`**(与 `pack` 的 `start` 不同, 故意的): 面中点是每一步的缺省
//   ③ **同源**: 每个糖面必须等于 `rectFace + placeRect` 的组合 —— 糖面若自己算一遍坐标, 就会与
//      端口 / 落位两处分叉, 而没有任何门禁看得见(与 `box.test` 里 `rectFace ≡ portPoint` 同条)
//   ④ **守卫**: 负 gap / 非有限 gap / 坏尺寸 / 坏 ref / 词表外的 align 当场抛(与 guard 同口径)
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { type PlaceAlign, type PlaceOptions, above, below, centeredOn, leftOf, rightOf } from '../src/geometry/place';
import { type AnchorName, type Size, placeRect, rectAnchor, rectFace } from '../src/geometry/box';
import { type Rect, rectBottom, rectCenter, rectRight } from '../src/geometry/vec';
import { type Side } from '../src/knives/route';
import { packCol } from '../src/geometry/pack';
import { ShapeInputError } from '../src/guard';

/** 四边都不整的盒(任何"把中间当角"的错都会露馅) */
const REF: Rect = { x: 100, y: 50, w: 200, h: 80 };
const S: Size = { w: 40, h: 20 };
const GAP = 20;

/** 取出守卫抛的那个错(比 toThrow 更能断言"抛的是哪一种 + 说清了哪个字段") */
const guardErr = (fn: () => unknown): ShapeInputError => {
  try {
    fn();
  } catch (e) {
    if (e instanceof ShapeInputError) return e;
    throw e;
  }
  throw new Error('本该抛 ShapeInputError, 却没抛 —— 守卫漏了');
};

describe('geometry/place · 四方向糖面(面到面 gap · 交叉轴三档 · 守卫)', () => {
  it('四个方向 × 三档: 贴哪条边、朝哪边挪 gap 全部摊平写一遍', () => {
    // 右边: 盒的**左缘**落在 ref 右缘 + 20
    expect(rightOf(REF, S, GAP)).toEqual({ x: 320, y: 80, w: 40, h: 20 });
    expect(rightOf(REF, S, GAP, { align: 'start' })).toEqual({ x: 320, y: 50, w: 40, h: 20 });
    expect(rightOf(REF, S, GAP, { align: 'end' })).toEqual({ x: 320, y: 110, w: 40, h: 20 });
    // 左边: 盒的**右缘**落在 ref 左缘 − 20
    expect(leftOf(REF, S, GAP)).toEqual({ x: 40, y: 80, w: 40, h: 20 });
    expect(leftOf(REF, S, GAP, { align: 'start' })).toEqual({ x: 40, y: 50, w: 40, h: 20 });
    expect(leftOf(REF, S, GAP, { align: 'end' })).toEqual({ x: 40, y: 110, w: 40, h: 20 });
    // 下边: 盒的**顶边**落在 ref 下缘 + 20(start = 左对齐, end = 右对齐)
    expect(below(REF, S, GAP)).toEqual({ x: 180, y: 150, w: 40, h: 20 });
    expect(below(REF, S, GAP, { align: 'start' })).toEqual({ x: 100, y: 150, w: 40, h: 20 });
    expect(below(REF, S, GAP, { align: 'end' })).toEqual({ x: 260, y: 150, w: 40, h: 20 });
    // 上边: 盒的**底边**落在 ref 上缘 − 20
    expect(above(REF, S, GAP)).toEqual({ x: 180, y: 10, w: 40, h: 20 });
    expect(above(REF, S, GAP, { align: 'start' })).toEqual({ x: 100, y: 10, w: 40, h: 20 });
    expect(above(REF, S, GAP, { align: 'end' })).toEqual({ x: 260, y: 10, w: 40, h: 20 });
  });

  it('gap 是**面到面**的空档(不是节距), 三档只动交叉轴', () => {
    // 主轴: 四方向的"最近距离"恒等于 gap
    expect(rightOf(REF, S, GAP).x - rectRight(REF)).toBe(GAP);
    expect(REF.x - rectRight(leftOf(REF, S, GAP))).toBe(GAP);
    expect(below(REF, S, GAP).y - rectBottom(REF)).toBe(GAP);
    expect(REF.y - rectBottom(above(REF, S, GAP))).toBe(GAP);
    // 交叉轴: start 贴起点边 / end 贴终点边 / center 骑中线(四方向各自量一遍)
    const cross: Array<[Rect, 'x' | 'y', number]> = [
      [rightOf(REF, S, GAP, { align: 'start' }), 'y', REF.y],
      [rightOf(REF, S, GAP, { align: 'end' }), 'y', rectBottom(REF) - S.h],
      [leftOf(REF, S, GAP, { align: 'end' }), 'y', rectBottom(REF) - S.h],
      [below(REF, S, GAP, { align: 'start' }), 'x', REF.x],
      [below(REF, S, GAP, { align: 'end' }), 'x', rectRight(REF) - S.w],
      [above(REF, S, GAP, { align: 'start' }), 'x', REF.x],
    ];
    for (const [r, axis, want] of cross) expect(r[axis]).toBe(want);
    // 缺省 = center(与 pack 的缺省 start 不同) —— 显式写 center 与不写逐字同结果
    expect(rightOf(REF, S, GAP)).toEqual(rightOf(REF, S, GAP, { align: 'center' }));
    expect(rectCenter(rightOf(REF, S, GAP)).y).toBe(rectCenter(REF).y);
    expect(rectCenter(below(REF, S, GAP)).x).toBe(rectCenter(REF).x);
    expect(rectCenter(above(REF, S, GAP)).x).toBe(rectCenter(REF).x);
  });

  it('gap = 0 退化成共边(不是"间距不明的 0"): 摆完仍紧贴 ref 的那条边', () => {
    expect(rightOf(REF, S, 0)).toEqual({ x: 300, y: 80, w: 40, h: 20 });
    expect(leftOf(REF, S, 0).x + S.w).toBe(100);
    expect(below(REF, S, 0).y).toBe(130);
    expect(above(REF, S, 0).y + S.h).toBe(50);
  });

  it('同源: 四个方向 × 三档逐字等于 `rectFace(..., { t, offset }) + placeRect(...)`', () => {
    // align → 面上的 `t`(0 / 0.5 / 1): 交叉轴的起点侧就是该面的起点端(t 从顶 / 从左数起)
    const T: Record<PlaceAlign, number> = { start: 0, center: 0.5, end: 1 };
    const TABLE: ReadonlyArray<
      [string, (r: Rect, s: Size, g: number, o?: PlaceOptions) => Rect, Side, Record<PlaceAlign, AnchorName>]
    > = [
      ['rightOf', rightOf, 'right', { start: 'nw', center: 'w', end: 'sw' }],
      ['leftOf', leftOf, 'left', { start: 'ne', center: 'e', end: 'se' }],
      ['below', below, 'bottom', { start: 'nw', center: 'n', end: 'ne' }],
      ['above', above, 'top', { start: 'sw', center: 's', end: 'se' }],
    ];
    for (const [name, fn, side, anchors] of TABLE) {
      for (const align of ['start', 'center', 'end'] as const) {
        const at = rectFace(REF, side, { t: T[align], offset: GAP });   // offset 正 = 朝外法线, 四方向同号
        expect({ name, align, rect: fn(REF, S, GAP, { align }) }).toEqual({
          name, align, rect: placeRect(S, at, { anchor: anchors[align] }),
        });
      }
    }
  });

  it('centeredOn: 两轴对心(盒心 = `rectAnchor(ref, "center")`), 尺寸参差同样对心', () => {
    const c = centeredOn(REF, S);
    expect(c).toEqual({ x: 180, y: 80, w: 40, h: 20 });
    expect({ x: c.x + c.w / 2, y: c.y + c.h / 2 }).toEqual(rectAnchor(REF, 'center'));
    // 参差尺寸(菱形压在矩形上那种): 心不动, 落点跟着尺寸走
    expect(centeredOn(REF, { w: 161, h: 107 })).toEqual({ x: 119.5, y: 36.5, w: 161, h: 107 });
    // 尺寸原样带出(糖面不反算尺寸, 那是 fit 的活)
    expect(centeredOn(REF, S)).toEqual({ ...S, ...{ x: 180, y: 80 } });
  });

  it('守卫: 负 / 非有限 gap, 坏尺寸, 坏 ref, 词表外的 align —— 当场抛且指向那个入口', () => {
    const neg = guardErr(() => rightOf(REF, S, -1));
    expect(neg.shape).toBe('rightOf');
    expect(neg.field).toBe('gap');
    expect(neg.message).toContain('为负(-1)');
    expect(guardErr(() => below(REF, S, NaN)).field).toBe('gap');
    expect(guardErr(() => leftOf(REF, S, Infinity)).field).toBe('gap');
    expect(guardErr(() => above(REF, S, GAP, { align: 'middle' as PlaceAlign })).field).toBe('align');
    expect(guardErr(() => rightOf(REF, { w: NaN, h: 10 }, GAP)).field).toBe('w');
    expect(guardErr(() => rightOf(REF, { w: -5, h: 10 }, GAP)).message).toContain('为负(-5)');
    expect(guardErr(() => rightOf({ ...REF, x: NaN }, S, GAP)).field).toBe('x');
    expect(guardErr(() => centeredOn(REF, { w: 10, h: Infinity })).shape).toBe('centeredOn');
    expect(guardErr(() => centeredOn({ ...REF, h: -1 }, S)).field).toBe('h');
  });

  it('只读入参: ref / size 一个数都没动(尺寸常是共享的 fit 对象)', () => {
    const ref = { ...REF };
    const size = { ...S };
    const snapshot = JSON.stringify({ ref, size });
    rightOf(ref, size, GAP, { align: 'end' });
    below(ref, size, 5);
    centeredOn(ref, size);
    expect(JSON.stringify({ ref, size })).toEqual(snapshot);
  });

  it('与 `pack` 说同一件事: 竖链 `below(align: start)` ≡ `packCol` 的 `pitch`(同尺寸)', () => {
    const BOX: Size = { w: 150, h: 46 };
    const top: Rect = { x: 250, y: 40, w: BOX.w, h: BOX.h };
    const mid = below(top, BOX, 54, { align: 'start' });     // 54 = 节距 100 − 盒高
    const low = below(mid, BOX, 54, { align: 'start' });
    expect([top, mid, low]).toEqual(packCol({ items: [BOX, BOX, BOX], pitch: 100, x: 250, y0: 40, align: 'start' }).rects);
  });
});
