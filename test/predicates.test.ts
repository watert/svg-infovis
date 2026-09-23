// =====================================================================
// predicates 单测 · 线段相交 / 净空 / 折点规范化 / 交叉计数
// 这些谓词是 audit 门禁的原子判据, 判错会让"通过"变成假阳性。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import {
  normalizeRoutePoints,
  polylineCrossings,
  segmentRectClearance,
  segmentsIntersect,
} from '../src/geometry/predicates';
import type { Rect } from '../src/geometry/vec';

/** 100x100 的测试矩形(左上角在原点) */
const box: Rect = { x: 0, y: 0, w: 100, h: 100 };

describe('predicates · 几何判据', () => {
  it('segmentsIntersect: 十字相交 true / 平行不交 false / 共线重叠 true / 端点相触 true', () => {
    // 十字相交: 横线 y=50 与竖线 x=50
    expect(segmentsIntersect({ x: 0, y: 50 }, { x: 100, y: 50 }, { x: 50, y: 0 }, { x: 50, y: 100 })).toBe(true);
    // 平行(不共线)不相交
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 10 }, { x: 100, y: 10 })).toBe(false);
    // 共线重叠
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 0 }, { x: 150, y: 0 })).toBe(true);
    // 共线但完全分离
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 0 })).toBe(false);
    // 端点相触(首尾对接)
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 })).toBe(true);
    // 端点相触(T 形: 对方端点落在线段中部)
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 })).toBe(true);
  });

  it('segmentRectClearance: 穿过矩形 = 0; 距矩形 10px 的平行线段 ≈ 10', () => {
    // 从矩形左外侧横穿到右外侧
    expect(segmentRectClearance({ x: -10, y: 50 }, { x: 110, y: 50 }, box)).toBe(0);
    // 贴着矩形上边(y=0)走, 也属于相触 → 0
    expect(segmentRectClearance({ x: 0, y: 0 }, { x: 100, y: 0 }, box)).toBe(0);
    // 上边外侧 10px 处平行: 点到矩形距离与边到边距离都是 10
    expect(segmentRectClearance({ x: 0, y: -10 }, { x: 100, y: -10 }, box)).toBeCloseTo(10, 9);
    // 斜线段: 端点距角点 10px(3-4-5 的 6/8 组合)
    expect(segmentRectClearance({ x: 106, y: 108 }, { x: 300, y: 300 }, box)).toBeCloseTo(10, 9);
  });

  it('normalizeRoutePoints: 去零长重复点 + 去共线中间点 + 保序', () => {
    // 零长重复点(含 eps 内的近重合点)
    expect(normalizeRoutePoints([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0.005, y: 0.005 }, { x: 50, y: 0 }])).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
    ]);
    // 三点共线压成两点, 首尾不变
    const collinear = normalizeRoutePoints([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }]);
    expect(collinear).toHaveLength(2);
    expect(collinear[0]).toEqual({ x: 0, y: 0 });
    expect(collinear[1]).toEqual({ x: 100, y: 0 });
    // 保序: 真实拐点一个不少, 首尾坐标原样
    const orth = normalizeRoutePoints([
      { x: 10, y: 10 },
      { x: 60, y: 10 },
      { x: 60, y: 90 },
      { x: 100, y: 90 },
    ]);
    expect(orth).toEqual([
      { x: 10, y: 10 },
      { x: 60, y: 10 },
      { x: 60, y: 90 },
      { x: 100, y: 90 },
    ]);
  });

  it('polylineCrossings: 两条正交折线交叉 1 次; 同一端点分叉不计', () => {
    // 横折线 + 竖折线, 交叉点 (50, 0)
    expect(polylineCrossings([{ x: 0, y: 0 }, { x: 100, y: 0 }], [{ x: 50, y: -50 }, { x: 50, y: 50 }])).toBe(1);
    // 从同一端点分叉: 共享端点段被跳过
    expect(polylineCrossings([{ x: 0, y: 0 }, { x: 100, y: 0 }], [{ x: 0, y: 0 }, { x: 0, y: 100 }])).toBe(0);
    // 竖折线穿过 U 形折线的上下两段 → 2 次
    expect(
      polylineCrossings(
        [
          { x: 0, y: 0 },
          { x: 40, y: 0 },
          { x: 40, y: 40 },
          { x: 0, y: 40 },
        ],
        [
          { x: 20, y: -20 },
          { x: 20, y: 60 },
        ],
      ),
    ).toBe(2);
    // 完全分离 → 0
    expect(polylineCrossings([{ x: 0, y: 0 }, { x: 10, y: 0 }], [{ x: 0, y: 50 }, { x: 10, y: 50 }])).toBe(0);
  });
});
