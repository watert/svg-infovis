// =====================================================================
// geometry/box · 盒查询的语义判据
//
// 这份测试钉的不是"函数能跑", 而是两件容易悄悄漂的事:
//   ① **符号方向** —— offset / pad / expandRect 三套口径方向各不相同, 拿错方向就是图上一像素不差的
//      错位(而且门禁照样全绿)。所以 pad 那一条拿 `expandRect(R, -24)` 当期望值: 两套一旦漂开就红。
//   ② **同源** —— `rectFace` 必须与 `portPoint` 逐字一致。它若自己算一遍面上的点, 边端点与查询点
//      就会各说各话, 而没有任何门禁看得见这种分叉。
//
// 另有一条不变量单独钉: `placeRect(size, rectAnchor(r, a), { anchor: a })` 对九个锚都还原出 `r`
// —— 查询与摆放互为逆函数; 漂开就意味着"算出来的落点不是我以为的那个角"。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { type AnchorName, bounds, insetRect, placeRect, rectAnchor, rectFace } from '../src/geometry/box';
import { portPoint, sideDir } from '../src/knives/route';
import { type Rect, expandRect, rectCenter } from '../src/geometry/vec';

/** 四边都不整的盒: 任何"把中间当角"的错都会露馅 */
const R: Rect = { x: 100, y: 50, w: 200, h: 80 };
const SIDES = ['top', 'right', 'bottom', 'left'] as const;
const ANCHORS: AnchorName[] = ['nw', 'n', 'ne', 'w', 'center', 'e', 'sw', 's', 'se'];

describe('geometry/box · 面 / 锚 / 内缩 / 并集 / 摆放', () => {
  it('rectFace 缺省 = 面中点, 与 portPoint **逐字同源**(不含 offset 时不算第二位)', () => {
    for (const side of SIDES) {
      expect({ side, p: rectFace(R, side) }).toEqual({ side, p: portPoint(R, { side }) });
    }
  });

  it('rectFace 的 t / at 语义照抄 portPoint: at 是**绝对坐标**且优先, t 缺省 0.5', () => {
    expect(rectFace(R, 'bottom', { t: 0.25 })).toEqual({ x: 150, y: 130 });
    expect(rectFace(R, 'right', { t: 0 })).toEqual({ x: 300, y: 50 });
    expect(rectFace(R, 'top', { t: 0.9, at: 120 })).toEqual({ x: 120, y: 50 });
  });

  it('rectFace 的 offset: 正 = 沿**朝外**法线(底面向下 / 顶面向上), 负 = 朝内', () => {
    for (const side of SIDES) {
      const d = sideDir(side);
      const mid = portPoint(R, { side });
      const at = (off: number) => ({ x: mid.x + off * d.x, y: mid.y + off * d.y });
      expect({ side, p: rectFace(R, side, { offset: 18 }) }).toEqual({ side, p: at(18) });
      expect({ side, p: rectFace(R, side, { offset: -12 }) }).toEqual({ side, p: at(-12) });
    }
    // 摊平写一遍四方向, 免得"循环里全对、单看不对"
    expect(rectFace(R, 'bottom', { offset: 18 })).toEqual({ x: 200, y: 148 });
    expect(rectFace(R, 'top', { offset: 18 })).toEqual({ x: 200, y: 32 });
    expect(rectFace(R, 'left', { offset: -12 })).toEqual({ x: 112, y: 90 });
    expect(rectFace(R, 'right', { offset: -12 })).toEqual({ x: 288, y: 90 });
  });

  it('rectAnchor 九点: 四角 / 四边中点 / 心; `center` 就是 `rectCenter` 那个数', () => {
    expect(ANCHORS.map((a) => [a, rectAnchor(R, a)])).toEqual([
      ['nw', { x: 100, y: 50 }], ['n', { x: 200, y: 50 }], ['ne', { x: 300, y: 50 }],
      ['w', { x: 100, y: 90 }], ['center', { x: 200, y: 90 }], ['e', { x: 300, y: 90 }],
      ['sw', { x: 100, y: 130 }], ['s', { x: 200, y: 130 }], ['se', { x: 300, y: 130 }],
    ]);
    expect(rectAnchor(R, 'center')).toEqual(rectCenter(R));
  });

  it('rectAnchor 的比例式: {h, v} 与锚名同义; 越界即落在盒外(是查询不是门禁)', () => {
    expect(rectAnchor(R, { h: 0.5, v: 1 })).toEqual(rectAnchor(R, 's'));
    expect(rectAnchor(R, { h: 0, v: 0 })).toEqual(rectAnchor(R, 'nw'));
    expect(rectAnchor(R, { h: 0.25, v: 0.75 })).toEqual({ x: 150, y: 110 });
    expect(rectAnchor(R, { h: 1, v: 2 })).toEqual({ x: 300, y: 210 });
  });

  it('insetRect: pad 正数内缩(单值 / [x,y]); 与 expandRect **反号**(两套符号不许漂)', () => {
    expect(insetRect(R, 24)).toEqual({ x: 124, y: 74, w: 152, h: 32 });
    expect(insetRect(R, [10, 20])).toEqual({ x: 110, y: 70, w: 180, h: 40 });
    expect(insetRect(R, 24)).toEqual(expandRect(R, -24));
    // pad 过大 → 负宽高的退化盒(**不 clamp**: 静默夹成 0 会把"pad 明显过大"藏起来)
    expect(insetRect({ x: 0, y: 0, w: 10, h: 10 }, 8)).toEqual({ x: 8, y: 8, w: -6, h: -6 });
  });

  it('bounds: 并集(与输入顺序无关) + pad **外扩**(框把 children 包住)', () => {
    const a: Rect = { x: 0, y: 0, w: 100, h: 40 };
    const b: Rect = { x: 200, y: 120, w: 50, h: 60 };
    expect(bounds([a, b])).toEqual({ x: 0, y: 0, w: 250, h: 180 });
    expect(bounds([b, a])).toEqual(bounds([a, b]));
    expect(bounds([a, b], { pad: 28 })).toEqual({ x: -28, y: -28, w: 306, h: 236 });
    expect(bounds([a, b], { pad: [10, 20] })).toEqual({ x: -10, y: -20, w: 270, h: 220 });
    // 单盒 + pad = 那个盒外扩一圈; 负 pad 反向(收缩) —— 与 insetRect 同一套语义
    expect(bounds([a], { pad: 5 })).toEqual(expandRect(a, 5));
    expect(bounds([a, b], { pad: -10 })).toEqual(insetRect({ x: 0, y: 0, w: 250, h: 180 }, 10));
    // 空数组 → null(**不是** 0×0 的空盒: 那会静默混进 scene 与门禁)
    expect(bounds([])).toBeNull();
  });

  it('placeRect: at 是**锚点要落的位置**, 缺省锚 = 心(与 placeCard 同口径)', () => {
    const size = { w: 60, h: 20 };
    const at = { x: 300, y: 200 };
    const box = placeRect(size, at);
    expect(box).toEqual({ x: 270, y: 190, w: 60, h: 20 });
    expect(placeRect(size, at, { anchor: 'center' })).toEqual(box);
    expect(rectAnchor(box, 'center')).toEqual(at); // 心回到了 at
    // size 只借 w/h: 把一个盒当 size 传进来, 它的 x/y 不参与
    expect(placeRect(R, at, { anchor: 'nw' })).toEqual({ x: 300, y: 200, w: 200, h: 80 });
  });

  it('placeRect 与 rectAnchor **互为逆**: 九个锚摆完都还原出原盒', () => {
    for (const a of ANCHORS) {
      expect({ a, r: placeRect(R, rectAnchor(R, a), { anchor: a }) }).toEqual({ a, r: R });
    }
  });

  it('组合用法(示例里的那种): 盒 → 段并集 → 面上点定走廊 / 分隔线', () => {
    const head: Rect = { x: 64, y: 0, w: 192, h: 56 };
    const tail: Rect = { x: 64, y: 160, w: 192, h: 56 };
    // 出盒 stub 起点 / 该段的分隔线与段底走廊 —— 全由盒推, 不手写 y 的加减
    expect(rectFace(head, 'bottom', { offset: 18 }).y).toBe(74);
    const band = bounds([head, tail])!;
    expect(rectFace(band, 'top', { offset: 40 }).y).toBe(-40);
    expect(rectFace(band, 'bottom', { offset: 18 }).y).toBe(234);
    // 段落标签: 左边槽 x = 0, 纵向以"段顶面往上 64"为心 ⇒ 锚 'w'
    expect(placeRect({ w: 120, h: 16 }, { x: 0, y: rectFace(band, 'top', { offset: 64 }).y }, { anchor: 'w' }))
      .toEqual({ x: 0, y: -72, w: 120, h: 16 });
  });
});
