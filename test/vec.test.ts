// =====================================================================
// vec 回归单测 · 确定性数值出口 + 矩形原语 + 轴向原语
//
// 与 serialize.test.ts 的分工: 那边测文档级字节确定性(键序 / round1 落盘 / 转义),
// 这份只钉数值格式化与矩形原语本身的语义 —— 重点是"坏值必须可见":
// fmt 曾把非有限值静默写成 0.00, 等于让 finite 门禁扫自己的输出永远通过。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { rect, svg, text } from '../src/descriptor';
import { serialize, toSVG } from '../src/serialize';
import {
  type Pt,
  dirIndex,
  expandRect,
  fmt,
  mid,
  perpL,
  perpR,
  rectBottom,
  rectCenter,
  rectFromPoints,
  rectRight,
  round1,
} from '../src/geometry/vec';

describe('vec · 确定性数值与矩形原语', () => {
  it('fmt: 正常值 2 位小数; NaN / Infinity 输出字符串 "NaN", 绝不静默成 "0.00"', () => {
    expect(fmt(0)).toBe('0.00');
    expect(fmt(1.2)).toBe('1.20');
    expect(fmt(1.2345)).toBe('1.23');
    expect(fmt(-3.4561)).toBe('-3.46');
    // 修过的静默掩盖 bug: 非有限值必须原样暴露成 "NaN"(肉眼可见 + finite 门禁扫得到)
    expect(fmt(NaN)).toBe('NaN');
    expect(fmt(Infinity)).toBe('NaN');
    expect(fmt(-Infinity)).toBe('NaN');
    expect(fmt(NaN)).not.toBe('0.00');
    expect(fmt(Infinity)).not.toBe('0.00');
    expect(fmt(-Infinity)).not.toBe('0.00');
  });

  it('toSVG 含非法坐标时产物里出现 NaN, 坏值不被 0.00 掩盖', () => {
    const out = toSVG(svg(200, 100, [rect(NaN, 10, 50, 20)]));
    expect(out).toContain('x="NaN"');
    expect(out).not.toContain('x="0.00"');
    // 同一行里合法坐标照常 2 位小数 —— 说明不是整串退化, 只有坏值那一位变成 NaN
    expect(out).toContain('width="50.00"');
    // 根尺寸 / text 坐标 / Infinity 同样走这条通道
    expect(toSVG(svg(NaN, 100, []), { declaration: false })).toContain('width="NaN"');
    expect(serialize(text(10, NaN, 'hi'))).toBe('<text x="10.00" y="NaN">hi</text>');
    expect(serialize(rect(Infinity, 0, 1, 1))).toContain('x="NaN"');
  });

  it('round1: 1 位小数取整, 负数同规则', () => {
    // 故意不用 .x5 半值(1.25 / 2.35 这种): 半值舍入方向受浮点表示影响, 钉它等于钉实现细节
    expect(round1(1.23)).toBe(1.2);
    expect(round1(1.26)).toBe(1.3);
    expect(round1(2.999)).toBe(3);
    expect(round1(0)).toBe(0);
    expect(round1(-1.23)).toBe(-1.2);
    expect(round1(-1.26)).toBe(-1.3);
    expect(round1(-2.999)).toBe(-3);
  });

  it('rectFromPoints / expandRect / rectCenter / rectRight / rectBottom 的基本行为', () => {
    const pts: Pt[] = [
      { x: 30, y: 50 },
      { x: 10, y: 20 },
      { x: 20, y: 90 },
    ];
    const r = rectFromPoints(pts); // 包围盒: 与输入顺序无关
    expect(r).toEqual({ x: 10, y: 20, w: 20, h: 70 });
    expect(rectFromPoints([...pts].reverse())).toEqual(r);
    // by > 0 四边外扩, by < 0 即收缩(宽高各减 2|by|)
    expect(expandRect(r, 5)).toEqual({ x: 5, y: 15, w: 30, h: 80 });
    expect(expandRect(r, -5)).toEqual({ x: 15, y: 25, w: 10, h: 60 });
    expect(expandRect(r, 0)).toEqual(r);
    expect(rectCenter({ x: 0, y: 0, w: 10, h: 20 })).toEqual({ x: 5, y: 10 });
    expect(rectRight({ x: 10, y: 0, w: 5, h: 5 })).toBe(15);
    expect(rectBottom({ x: 0, y: 10, w: 5, h: 5 })).toBe(15);
    // 单点: 退化但可算, 宽高为 0(不是 NaN)
    expect(rectFromPoints([{ x: 3, y: 4 }])).toEqual({ x: 3, y: 4, w: 0, h: 0 });
  });

  it('perpL / perpR 互为反向且不改长度; dirIndex 四轴向 0=E 1=S 2=W 3=N', () => {
    const v = { x: 3, y: -2 };
    expect(perpL(v)).toEqual({ x: 2, y: 3 });
    expect(perpR(v)).toEqual({ x: -2, y: -3 });
    // 互为反向 = 两者相加为 0
    expect(perpL(v)).toEqual({ x: -perpR(v).x, y: -perpR(v).y });
    // 90° 旋转保长
    expect(Math.hypot(perpL(v).x, perpL(v).y)).toBeCloseTo(Math.hypot(v.x, v.y), 12);
    expect(dirIndex({ x: 1, y: 0 })).toBe(0);
    expect(dirIndex({ x: 0, y: 1 })).toBe(1);
    expect(dirIndex({ x: -1, y: 0 })).toBe(2);
    expect(dirIndex({ x: 0, y: -1 })).toBe(3);
    // 非正交方向被量化到最近轴向 —— 有损, 所以它不能当"是否正交"的判据(见 predicates-parity 的正交用例)
    expect(dirIndex({ x: 100, y: 0.5 })).toBe(0);
    expect(dirIndex({ x: 0.5, y: 100 })).toBe(1);
  });

  it('mid: 两点中点(缝中点 / 回环标签落位那条公式的**唯一一份**实现), 不取整', () => {
    expect(mid({ x: 0, y: 0 }, { x: 10, y: 20 })).toEqual({ x: 5, y: 10 });
    // 与参数顺序无关(中点是集合的, 不是有序的)
    expect(mid({ x: 10, y: 20 }, { x: 0, y: 0 })).toEqual(mid({ x: 0, y: 0 }, { x: 10, y: 20 }));
    // .5 照实给 —— 取整是落盘那一层 `round1` 的口径, 这里四舍五入会自己制造半像素误差
    expect(mid({ x: 1, y: 1 }, { x: 2, y: 2 })).toEqual({ x: 1.5, y: 1.5 });
    expect(mid({ x: 100, y: 50 }, { x: 100, y: 50 })).toEqual({ x: 100, y: 50 });
    // 与 `rectCenter` 同口径: 盒心就是两条对边的中点
    expect(mid({ x: 0, y: 0 }, { x: 10, y: 20 })).toEqual(rectCenter({ x: 0, y: 0, w: 10, h: 20 }));
  });
});
