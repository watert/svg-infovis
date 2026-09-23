// =====================================================================
// 谓词 spec 形态 · 四走向 × 非整数中心 × toBeCloseTo(…, 9)
//
// 为什么单开一份: 现有 predicates*.test.ts 用的是**整数坐标 + 单走向**(左→右 / 只横穿),
// 而 mermaid `intersect-line.js:46-76` 的事故证明这种形态测不出**轴相关位移** —— 它把交点按
// `0.5·sign(num)·sign(denom)` 挪半像素, 方向随轴与符号变, 于是"同一几何反向走 / 换个轴走向"
// 给出不同长度, 在正交链路上放大成"小斜开段 + 贴点掉进盒内", 眼睛看不出来。
//
// 本文件只钉这一族谓词(求交 / 吸附投影 / 同轴重叠 / 近平行 / 朝向), 断言形态统一:
//   ① 四走向(左右 · 右左 · 上下 · 下上)必须同值
//   ② 坐标全非整数(0.125 步长, 二进制精确) —— 半像素级偏差无处藏
//   ③ 不变性: 反向 / x↔y 转置 / 整体平移(0.25,0.375) 都不改变判据数值
//   ④ 数值一律 toBeCloseTo(x, 9); 只有布尔与枚举用 toBe
// 只加测试不改 src —— 补测时挖出的疑似缺陷写进回报, 不在本文件里"钉住"它。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import {
  clampPointToRect,
  parallelSegmentGap,
  pointSegmentDistance,
  projectedPortsCoincide,
  sameAxisOverlapLength,
  segmentAxis,
  segmentDistance,
  segmentIntersectsRect,
  segmentRectClearance,
  segmentRectIntersectionLength,
} from '../src/geometry/predicates';
import { type Pt, type Rect } from '../src/geometry/vec';

/** 非整数中心参考矩形: x∈[12.5,73.75] y∈[24.25,68.0], 中心 (43.125, 46.125) */
const R: Rect = { x: 12.5, y: 24.25, w: 61.25, h: 43.75 };
const CX = R.x + R.w / 2;
const CY = R.y + R.h / 2;

/** x↔y 转置: 同一几何换成另一个轴的走向(轴相关位移的照妖镜) */
const swap = (p: Pt): Pt => ({ x: p.y, y: p.x });
const swapRect = (r: Rect): Rect => ({ x: r.y, y: r.x, w: r.h, h: r.w });
/** 整体平移 0.25 / 0.375px: 判据数值不许与"落在栅格哪一格"耦合 */
const shift = (p: Pt): Pt => ({ x: p.x + 0.25, y: p.y + 0.375 });
const shiftRect = (r: Rect): Rect => ({ ...r, x: r.x + 0.25, y: r.y + 0.375 });

describe('predicate spec · 四走向 / 非整数中心 / 精度', () => {
  it('fixture 自检: 参考矩形中心确实非整数 —— 否则这组测试退化成整数形态, 白搭', () => {
    expect(CX).toBeCloseTo(43.125, 9);
    expect(CY).toBeCloseTo(46.125, 9);
    expect(Number.isInteger(CX)).toBe(false);
    expect(Number.isInteger(CY)).toBe(false);
  });

  it('segmentRectIntersectionLength · 四走向穿同一盒: 横穿 = 宽 61.25 / 竖穿 = 高 43.75', () => {
    const x0 = R.x - 8.5, x1 = R.x + R.w + 8.5; // 4.0 / 82.25
    const y0 = R.y - 7.25, y1 = R.y + R.h + 7.25; // 17.0 / 75.25
    expect(segmentRectIntersectionLength({ x: x0, y: CY }, { x: x1, y: CY }, R)).toBeCloseTo(61.25, 9); // 左右
    expect(segmentRectIntersectionLength({ x: x1, y: CY }, { x: x0, y: CY }, R)).toBeCloseTo(61.25, 9); // 右左
    expect(segmentRectIntersectionLength({ x: CX, y: y0 }, { x: CX, y: y1 }, R)).toBeCloseTo(43.75, 9); // 上下
    expect(segmentRectIntersectionLength({ x: CX, y: y1 }, { x: CX, y: y0 }, R)).toBeCloseTo(43.75, 9); // 下上
  });

  it('segmentRectIntersectionLength · 45° 斜穿(进左出下) = 25.5√2, 反向 / 转置 / 平移都不改长度', () => {
    const a: Pt = { x: 0.5, y: 30.5 };
    const b: Pt = { x: 60.5, y: 90.5 };
    const want = 25.5 * Math.SQRT2; // 交点 (12.5,42.5) → (38,68): 两轴各走 25.5
    expect(segmentRectIntersectionLength(a, b, R)).toBeCloseTo(want, 9);
    expect(segmentRectIntersectionLength(b, a, R)).toBeCloseTo(want, 9);
    // 转置后同一条几何换个轴走向: 轴相关位移会让这两个数差出半像素, 9 位精度必须一致
    expect(segmentRectIntersectionLength(swap(a), swap(b), swapRect(R))).toBeCloseTo(want, 9);
    expect(segmentRectIntersectionLength(shift(a), shift(b), shiftRect(R))).toBeCloseTo(want, 9);
  });

  it('segmentRectIntersectionLength · 端点在盒内的段不再恒返 0(折线在盒内拐弯即整条边穿盒)', () => {
    const box: Rect = { x: 100, y: 80, w: 100, h: 60 };
    // 盒内拐点 (150,110): 进入段左进 50px(100→150), 离开段顶出 30px(110→80)
    const a: Pt = { x: 0, y: 110 }, mid: Pt = { x: 150, y: 110 }, c: Pt = { x: 150, y: 0 };
    expect(segmentRectIntersectionLength(a, mid, box)).toBeCloseTo(50, 9);
    expect(segmentRectIntersectionLength(mid, c, box)).toBeCloseTo(30, 9);
    // 整段落在盒内: 全长都算
    expect(segmentRectIntersectionLength({ x: 110, y: 90 }, { x: 190, y: 130 }, box)).toBeCloseTo(Math.hypot(80, 40), 9);
    // 一端在盒内一端在盒外: 也不是 0
    expect(segmentRectIntersectionLength({ x: 120, y: 90 }, { x: 400, y: 300 }, box)).toBeGreaterThan(0);
    // 端点贴盒外沿 0.25px 仍是确知无交 —— 修"端点进候选"不许把盒外擦边也算成交
    expect(segmentRectIntersectionLength({ x: 100, y: 79.75 }, { x: 9, y: 79.75 }, box)).toBe(0);
  });

  it('求交/净空 · 贴边(相触)与 0.25px 外沿分得开: 压边段按盒内区间计长, 0.25px 外确知无交', () => {
    const onEdgeA: Pt = { x: R.x, y: R.y }, onEdgeB: Pt = { x: R.x + R.w, y: R.y };
    const outA: Pt = { x: R.x, y: R.y - 0.25 }, outB: Pt = { x: R.x + R.w, y: R.y - 0.25 };
    expect(segmentRectIntersectionLength(onEdgeA, onEdgeB, R)).toBeCloseTo(61.25, 9);
    expect(segmentRectClearance(onEdgeA, onEdgeB, R)).toBe(0); // 相触 = 确知 0, 不是 null
    expect(segmentRectIntersectionLength(outA, outB, R)).toBe(0); // 0.25px 外 = 确知无交
    expect(segmentRectClearance(outA, outB, R)).toBeCloseTo(0.25, 9);
    // gap 的闭区间语义卡在 0.25px 这一点上, 半像素位移会把"擦边"误判成"贴上"
    expect(segmentIntersectsRect(outA, outB, R, 0)).toBe(false);
    expect(segmentIntersectsRect(outA, outB, R, 0.25)).toBe(true);
  });

  it('clampPointToRect · 四方向越界点各自落到对应边; 盒内与边界是恒等映射', () => {
    // 有限入参必非 null: 这里收口一次, 免得每条断言都写 null 分支(非有限那档见文件末的 null 用例)
    const clamp = (p: Pt, r: Rect): Pt => {
      const c = clampPointToRect(p, r);
      if (c === null) throw new Error('有限入参不该返回 null');
      return c;
    };
    const left = clamp({ x: -5.25, y: CY }, R);
    expect(left).toEqual({ x: 12.5, y: 46.125 });
    const right = clamp({ x: 120.5, y: CY }, R);
    expect(right.x).toBeCloseTo(73.75, 9);
    expect(right.y).toBeCloseTo(CY, 9);
    const above = clamp({ x: CX, y: -9.5 }, R);
    expect(above.x).toBeCloseTo(CX, 9);
    expect(above.y).toBeCloseTo(24.25, 9);
    const below = clamp({ x: CX, y: 200.25 }, R);
    expect(below.y).toBeCloseTo(68, 9);
    // 角落越界 → 落到对角点(两轴各 clamp 一次, 不是沿某条轴整体位移)
    expect(clamp({ x: -5.25, y: -9.5 }, R)).toEqual({ x: 12.5, y: 24.25 });
    // 盒内与边界: 不动点不动(边界点尤其重要 —— 它决定下面 projectedPortsCoincide 的语义)
    expect(clamp({ x: CX, y: CY }, R)).toEqual({ x: CX, y: CY });
    expect(clamp({ x: 12.5, y: CY }, R)).toEqual({ x: 12.5, y: CY });
    expect(clamp({ x: 73.75, y: 68 }, R)).toEqual({ x: 73.75, y: 68 });
    // 转置不变性: clamp 是逐轴 min/max, 换个轴走向结果必须镜像同值
    expect(clamp(swap({ x: -5.25, y: CY }), swapRect(R))).toEqual(swap({ x: 12.5, y: 46.125 }));
  });

  it('projectedPortsCoincide · 同侧远近两点投影后重合; eps=3 卡在 3 与 3.125 之间', () => {
    expect(projectedPortsCoincide({ x: -5.25, y: CY }, { x: -19.75, y: CY }, R)).toBe(true); // 左侧深浅两点
    expect(projectedPortsCoincide({ x: CX, y: -9.5 }, { x: CX, y: -40.25 }, R)).toBe(true); // 上方深浅两点
    expect(projectedPortsCoincide({ x: 13.5, y: CY }, { x: 5.25, y: CY }, R)).toBe(true); // 盒内点不动 + 盒外点落到边界
    // 边界点是不动点 → 判据退化回原始距离: 恰好 3px 算重合, 3.125px 不算
    expect(projectedPortsCoincide({ x: 12.5, y: CY }, { x: 12.5, y: CY + 3 }, R)).toBe(true);
    expect(projectedPortsCoincide({ x: 12.5, y: CY }, { x: 12.5, y: CY + 3.125 }, R)).toBe(false);
    expect(projectedPortsCoincide({ x: -5.25, y: CY }, { x: 120.5, y: CY }, R)).toBe(false); // 分居两侧
    // 非法输入 → false(不知道 ≠ 重合)
    expect(projectedPortsCoincide({ x: NaN, y: CY }, { x: 120.5, y: CY }, R)).toBe(false);
    expect(projectedPortsCoincide({ x: -5.25, y: CY }, { x: 120.5, y: CY }, { x: 0, y: 0, w: Infinity, h: 1 })).toBe(false);
  });

  it('sameAxisOverlapLength · H/H 与 V/V 四走向组合同值(22.25 / 30)', () => {
    const h1: Pt = { x: 10.25, y: CY }, h2: Pt = { x: 52.75, y: CY };
    const g1: Pt = { x: 30.5, y: CY }, g2: Pt = { x: 80, y: CY };
    const combos: [Pt, Pt, Pt, Pt][] = [
      [h1, h2, g1, g2], [h2, h1, g1, g2], [h1, h2, g2, g1], [h2, h1, g2, g1], [g1, g2, h1, h2],
    ];
    for (const [p, q, s, t] of combos) expect(sameAxisOverlapLength(p, q, s, t)).toBeCloseTo(22.25, 9);
    // V/V: 同一条竖线上 40.5 → 70.5 重叠 = 30
    const v1: Pt = { x: CX, y: 20.5 }, v2: Pt = { x: CX, y: 70.5 };
    const w1: Pt = { x: CX, y: 40.5 }, w2: Pt = { x: CX, y: 90.5 };
    expect(sameAxisOverlapLength(v1, v2, w1, w2)).toBeCloseTo(30, 9);
    expect(sameAxisOverlapLength(v2, v1, w2, w1)).toBeCloseTo(30, 9);
    expect(sameAxisOverlapLength(v1, v2, { x: v1.x + 0.5, y: w1.y }, { x: v1.x + 0.5, y: w2.y })).toBeCloseTo(30, 9); // 轴差 0.5 ≤ eps
    // 转置不变性: H 的 22.25 转到 V 仍是 22.25
    expect(sameAxisOverlapLength(swap(h1), swap(h2), swap(g1), swap(g2))).toBeCloseTo(22.25, 9);
    expect(sameAxisOverlapLength(shift(h1), shift(h2), shift(g1), shift(g2))).toBeCloseTo(22.25, 9);
  });

  it('sameAxisOverlapLength · 不同轴 / 斜段 / 零长 / 只相触 → 0; 轴差在 eps=0.5 处翻转', () => {
    const h1: Pt = { x: 10.25, y: CY }, h2: Pt = { x: 52.75, y: CY };
    const v1: Pt = { x: 30.5, y: 10.25 }, v2: Pt = { x: 30.5, y: 90.5 };
    expect(sameAxisOverlapLength(h1, h2, v1, v2)).toBe(0); // 不同轴
    expect(sameAxisOverlapLength(h1, h2, { x: 30.5, y: 20.5 }, { x: 60.75, y: 30.25 })).toBe(0); // 斜段
    expect(sameAxisOverlapLength(h1, h2, { x: 30.5, y: CY }, { x: 30.5, y: CY })).toBe(0); // 零长段
    expect(sameAxisOverlapLength(h1, h2, { x: 50.75, y: CY }, { x: 80, y: CY })).toBeCloseTo(2, 9); // 真重叠那一段
    expect(sameAxisOverlapLength({ x: 10.25, y: CY }, { x: 30.5, y: CY }, { x: 30.5, y: CY }, { x: 80, y: CY })).toBe(0); // 只相触
    expect(sameAxisOverlapLength(h1, h2, { x: 90.5, y: CY }, { x: 120, y: CY })).toBe(0); // 完全分离
    // 轴差: 0.5 之内算同轴(重叠照给), 0.625 出界 → 0
    expect(sameAxisOverlapLength(h1, h2, { x: 30.5, y: CY + 0.5 }, { x: 80, y: CY + 0.5 })).toBeCloseTo(22.25, 9);
    expect(sameAxisOverlapLength(h1, h2, { x: 30.5, y: CY + 0.625 }, { x: 80, y: CY + 0.625 })).toBe(0);
    expect(sameAxisOverlapLength({ x: NaN, y: CY }, h2, h1, h2)).toBe(0); // 非法输入 → 0(不是 null, 更不是 NaN)
  });

  it('parallelSegmentGap · H/H 与 V/V 的 (gap, overlap); 端点序 / 转置 / 平移都不改数值', () => {
    const h1: Pt = { x: 10.25, y: CY }, h2: Pt = { x: 52.75, y: CY };
    const g1: Pt = { x: 20.5, y: 52.125 }, g2: Pt = { x: 70, y: 52.125 };
    const hg = parallelSegmentGap(h1, h2, g1, g2);
    expect(hg?.gap).toBeCloseTo(6, 9); // 52.125 - 46.125
    expect(hg?.overlap).toBeCloseTo(32.25, 9); // 52.75 - 20.5
    for (const g of [
      parallelSegmentGap(h2, h1, g2, g1),
      parallelSegmentGap(g1, g2, h1, h2),
      parallelSegmentGap(swap(h1), swap(h2), swap(g1), swap(g2)),
      parallelSegmentGap(shift(h1), shift(h2), shift(g1), shift(g2)),
    ]) {
      expect(g?.gap).toBeCloseTo(6, 9);
      expect(g?.overlap).toBeCloseTo(32.25, 9);
    }
    // V/V: gap 是横向差, overlap 沿 y
    const vg = parallelSegmentGap({ x: 10.25, y: 20.5 }, { x: 10.25, y: 70.5 }, { x: 16.75, y: 40.5 }, { x: 16.75, y: 90.5 });
    expect(vg?.gap).toBeCloseTo(6.5, 9);
    expect(vg?.overlap).toBeCloseTo(30, 9);
    // 共轴: gap = 0 但**不是 null**(共线那档归 sameAxisOverlapLength, 由调用方过滤)
    const co = parallelSegmentGap(h1, h2, { x: 30.5, y: CY }, { x: 80, y: CY });
    expect(co).not.toBeNull();
    expect(co?.gap).toBeCloseTo(0, 9);
    expect(co?.overlap).toBeCloseTo(22.25, 9);
  });

  it('parallelSegmentGap · 朝向不同 / 非有限 → null; 投影不重叠时 gap 照给、overlap = 0', () => {
    const h1: Pt = { x: 10.25, y: CY }, h2: Pt = { x: 52.75, y: CY };
    expect(parallelSegmentGap(h1, h2, { x: 30.5, y: 10.25 }, { x: 30.5, y: 90.5 })).toBeNull(); // H vs V
    expect(parallelSegmentGap(h1, h2, { x: 30.5, y: 20.5 }, { x: 60.75, y: 30.25 })).toBeNull(); // 斜段不参与
    expect(parallelSegmentGap({ x: NaN, y: CY }, h2, h1, h2)).toBeNull();
    const apart = parallelSegmentGap(h1, h2, { x: 70, y: 52.125 }, { x: 90, y: 52.125 });
    expect(apart?.gap).toBeCloseTo(6, 9); // 分开的两个量: 垂距仍在
    expect(apart?.overlap).toBeCloseTo(0, 9); // 投影不重叠
    // eps 内微斜(0.25px)仍算平行 —— 但 gap 取**首端点**, 反转端点序最多差 eps(不冻结具体值, 只钉上界)
    const tilt = parallelSegmentGap({ x: 10.25, y: CY }, { x: 52.75, y: CY + 0.25 }, { x: 30.5, y: 52.125 }, { x: 80, y: 52.125 });
    const tiltRev = parallelSegmentGap({ x: 52.75, y: CY + 0.25 }, { x: 10.25, y: CY }, { x: 30.5, y: 52.125 }, { x: 80, y: 52.125 });
    expect(tilt).not.toBeNull();
    expect(Math.abs((tilt?.gap ?? 0) - (tiltRev?.gap ?? 0))).toBeLessThanOrEqual(0.5);
    expect(tilt?.overlap).toBeCloseTo(22.25, 9);
    expect(tiltRev?.overlap).toBeCloseTo(22.25, 9);
    expect(parallelSegmentGap({ x: 10.25, y: CY }, { x: 52.75, y: CY + 0.625 }, { x: 30.5, y: 52.125 }, { x: 80, y: 52.125 })).toBeNull();
  });

  it('segmentAxis · 四走向 → 1/2; 转置互换; 斜段 / 零长 / 亚像素段 → 0; eps=0.5 是分界', () => {
    const h1: Pt = { x: 10.25, y: CY }, h2: Pt = { x: 60.75, y: CY };
    const v1: Pt = { x: CX, y: 20.5 }, v2: Pt = { x: CX, y: 70.75 };
    expect(segmentAxis(h1, h2)).toBe(1); // 左右
    expect(segmentAxis(h2, h1)).toBe(1); // 右左
    expect(segmentAxis(v1, v2)).toBe(2); // 上下
    expect(segmentAxis(v2, v1)).toBe(2); // 下上
    expect(segmentAxis(swap(h1), swap(h2))).toBe(2);
    expect(segmentAxis(swap(v1), swap(v2))).toBe(1);
    expect(segmentAxis(h1, { x: 60.75, y: CY + 0.625 })).toBe(0); // 斜段
    expect(segmentAxis(h1, h1)).toBe(0); // 零长
    expect(segmentAxis({ x: 10.25, y: CY }, { x: 10.5, y: CY + 0.25 })).toBe(0); // 亚像素微段(两轴都在 eps 内)
    expect(segmentAxis({ x: 10.25, y: 20.5 }, { x: 10.75, y: 60.25 })).toBe(2); // dx 恰好 0.5 ≤ eps → 算竖直
    expect(segmentAxis({ x: 10.25, y: 20.5 }, { x: 10.875, y: 60.25 })).toBe(0); // dx 0.625 > eps → 非轴
    expect(segmentAxis({ x: 10.25, y: 20.5 }, { x: 60.25, y: 20.75 })).toBe(1); // dy 0.25 ≤ eps → 算水平
    expect(segmentAxis({ x: NaN, y: CY }, h2)).toBe(0);
    expect(segmentAxis(shift(h1), shift(h2))).toBe(1);
  });

  it('segmentDistance / pointSegmentDistance · 四走向相交恒 0; 非整数距离精确; 非法输入走 null 通道', () => {
    const h1: Pt = { x: 4.25, y: CY }, h2: Pt = { x: 82.75, y: CY };
    const v1: Pt = { x: CX, y: 17 }, v2: Pt = { x: CX, y: 75.25 };
    expect(segmentDistance(h1, h2, v1, v2)).toBe(0);
    expect(segmentDistance(h2, h1, v1, v2)).toBe(0);
    expect(segmentDistance(h1, h2, v2, v1)).toBe(0);
    expect(segmentDistance(h2, h1, v2, v1)).toBe(0);
    // 平行不相交: 垂距 6.75
    expect(segmentDistance({ x: 10.25, y: CY }, { x: 52.75, y: CY }, { x: 20.5, y: CY + 6.75 }, { x: 70, y: CY + 6.75 })).toBeCloseTo(6.75, 9);
    // 点到线段: 垂足落在段内 = 垂距本身(15.375); 落到段外 = 到端点的距离
    expect(pointSegmentDistance({ x: 30.5, y: 30.75 }, { x: 20.5, y: CY }, { x: 60.75, y: CY })).toBeCloseTo(15.375, 9);
    expect(pointSegmentDistance({ x: 30.5, y: 30.75 }, { x: 20.5, y: CY }, { x: 20.5, y: CY })).toBeCloseTo(Math.hypot(10, 15.375), 9);
    expect(segmentDistance({ x: NaN, y: CY }, h2, v1, v2)).toBeNull();
    expect(segmentDistance(h1, h2, { x: 0, y: 0 }, { x: Infinity, y: 0 })).toBeNull();
  });

  it('pointSegmentDistance · 非有限入参走 null 通道(与 segmentDistance 同口径, 不许吐 NaN)', () => {
    const a: Pt = { x: 20.5, y: CY }, b: Pt = { x: 60.75, y: CY };
    expect(pointSegmentDistance({ x: 30.5, y: 30.75 }, a, b)).toBeCloseTo(15.375, 9); // 有限入参照旧给数
    expect(pointSegmentDistance({ x: NaN, y: 30.75 }, a, b)).toBeNull();
    expect(pointSegmentDistance({ x: 30.5, y: CY }, { x: Infinity, y: CY }, b)).toBeNull();
    expect(pointSegmentDistance({ x: 30.5, y: CY }, a, { x: 60.75, y: NaN })).toBeNull();
    // 转置 / 平移不变性对 null 通道同样成立(守卫只问"是否有限", 与走向无关)
    expect(pointSegmentDistance(swap({ x: 30.5, y: 30.75 }), swap(a), swap(b))).toBeCloseTo(15.375, 9);
    expect(pointSegmentDistance(shift({ x: 30.5, y: 30.75 }), shift(a), shift(b))).toBeCloseTo(15.375, 9);
  });

  it('segmentDistance · 任一参非有限一律 null(不再靠子谓词的 NaN 静默穿透)', () => {
    const h1: Pt = { x: 4.25, y: CY }, h2: Pt = { x: 82.75, y: CY };
    const v1: Pt = { x: CX, y: 17 }, v2: Pt = { x: CX, y: 75.25 };
    expect(segmentDistance(h1, h2, v1, v2)).toBe(0); // 相交仍是 0(确知的零, 不是 null)
    expect(segmentDistance(h1, h2, { x: NaN, y: 17 }, v2)).toBeNull();
    expect(segmentDistance(h1, { x: 82.75, y: Infinity }, v1, v2)).toBeNull();
    expect(segmentDistance({ x: -Infinity, y: CY }, h2, v1, { x: CX, y: 75.25 })).toBeNull();
  });

  it('clampPointToRect · 非有限点或非有限矩形 → null(不许把"不知道"伪装成一个坐标)', () => {
    expect(clampPointToRect({ x: -5.25, y: CY }, R)).toEqual({ x: 12.5, y: 46.125 }); // 有限照旧
    expect(clampPointToRect({ x: NaN, y: CY }, R)).toBeNull();
    expect(clampPointToRect({ x: -5.25, y: Infinity }, R)).toBeNull();
    expect(clampPointToRect({ x: -5.25, y: CY }, { x: 0, y: 24.25, w: NaN, h: 43.75 })).toBeNull();
    expect(clampPointToRect({ x: CX, y: CY }, { x: 12.5, y: 24.25, w: 61.25, h: Infinity })).toBeNull();
    // 传播到消费者: 投影不出坐标就说"不重合", 不许拿 null 当"距离 0"
    expect(projectedPortsCoincide({ x: NaN, y: CY }, { x: -19.75, y: CY }, R)).toBe(false);
    expect(projectedPortsCoincide({ x: -5.25, y: CY }, { x: -19.75, y: CY }, { x: 12.5, y: 24.25, w: Infinity, h: 43.75 })).toBe(false);
  });
});
