// =====================================================================
// predicates 回归单测 · 与 Archify 对账后钉住的边界语义
//
// 与 predicates.test.ts 的分工: 那份测常规判据(十字相交 / 常规净空 / 常规折点),
// 这份只钉边界 —— 回折不许被吃 / 非法输入不许静默成 0 / gap 符号不许被糊成布尔。
// 每条断言背后都是一个"改错了会静默通过"的口子, 不是覆盖率填充。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import {
  isOrthogonalPolyline,
  isOrthogonalSegment,
  normalizeRoutePoints,
  orthogonalDeviation,
  pointInRect,
  polylineCrossings,
  polylineLength,
  polylineRectsClearance,
  properSegmentIntersection,
  rectsOverlap,
  segmentIntersectsRect,
  segmentRectClearance,
  segmentRectIntersectionLength,
} from '../src/geometry/predicates';
import { type Pt, type Rect, dirIndex } from '../src/geometry/vec';

/** 100x50 的参考矩形(左上角在原点), 用来钉"横穿长度 / 1px 净空 / 3px 外点" */
const wide: Rect = { x: 0, y: 0, w: 100, h: 50 };
/** 10x10 的小方块, 用来钉 gap 的符号语义 */
const sq: Rect = { x: 0, y: 0, w: 10, h: 10 };

describe('predicates · 与 Archify 对账后的边界回归', () => {
  it('normalizeRoutePoints: 180° 回折必须保留 —— 3 个点, 折线长度 15(被吃掉中间点就只剩 5)', () => {
    const pts = normalizeRoutePoints([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 0 },
    ]);
    // 走 10 再退回 5: 回折点 (10,0) 是折线的"实体", 不是共线冗余点
    expect(pts).toHaveLength(3);
    expect(pts).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 0 },
    ]);
    // 长度即判据: 10 去 + 5 回 = 15; 旧实现把回折当共线中间点吃掉后只剩 |0→5| = 5
    expect(polylineLength(pts)).toBe(15);
    expect(polylineLength(pts)).not.toBe(5);
  });

  it('normalizeRoutePoints: NaN / Infinity 点先剔除, 一个都不剩且不抛异常', () => {
    const raw: Pt[] = [
      { x: NaN, y: 0 },
      { x: 0, y: NaN },
      { x: Infinity, y: 5 },
      { x: -Infinity, y: 5 },
      { x: 5, y: 5 },
      { x: 10, y: 10 },
    ];
    let out: Pt[] = [];
    expect(() => {
      out = normalizeRoutePoints(raw);
    }).not.toThrow();
    expect(out).toEqual([
      { x: 5, y: 5 },
      { x: 10, y: 10 },
    ]);
    // 逐个复核: 返回值里没有一个分量是非有限的
    for (const p of out) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
    // 全非法 → 空数组(坏点被丢掉, 不是原样留着让下游谓词吃 NaN)
    expect(normalizeRoutePoints([{ x: NaN, y: NaN }])).toEqual([]);
  });

  it('normalizeRoutePoints: 同向共线仍要吃 —— 三点压成两点', () => {
    const pts = normalizeRoutePoints([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ]);
    expect(pts).toHaveLength(2);
    expect(pts).toEqual([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
    ]);
    expect(polylineLength(pts)).toBe(20);
  });

  it('segmentRectClearance / polylineRectsClearance: 非法输入走 null 通道(不是 NaN, 也不是 0)', () => {
    // NaN 端点
    expect(segmentRectClearance({ x: NaN, y: 0 }, { x: 0, y: 0 }, wide)).toBeNull();
    // Infinity 端点
    expect(segmentRectClearance({ x: 0, y: 0 }, { x: 0, y: Infinity }, wide)).toBeNull();
    // 非法矩形(h 非有限)
    expect(segmentRectClearance({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0, w: 100, h: Infinity })).toBeNull();
    // null 不等于 NaN: 若返回 NaN, `Number.isNaN(null as number)` 为 false 说明是真 null
    expect(Number.isNaN(segmentRectClearance({ x: NaN, y: 0 }, { x: 0, y: 0 }, wide) as number)).toBe(false);

    // 折线: 非有限点 → 整条判"不知道"
    expect(polylineRectsClearance([{ x: NaN, y: 0 }, { x: 10, y: 0 }], [wide])).toBeNull();
    // 折线: 非法矩形(且是唯一矩形) → null
    expect(polylineRectsClearance([{ x: 0, y: 0 }, { x: 10, y: 0 }], [{ x: 0, y: 0, w: 100, h: NaN }])).toBeNull();
    // 全部被 skip 掉 → 一个测量值都没有 → null(不是 0 "通过")
    expect(polylineRectsClearance([{ x: 0, y: 0 }, { x: 10, y: 0 }], [wide], () => true)).toBeNull();
  });

  it('clearance 的 null 语义: 未知道 ≠ 通过 —— null 不许进裸数值比较', () => {
    const raw: number | null = segmentRectClearance({ x: NaN, y: 0 }, { x: 0, y: 0 }, wide);
    expect(raw).toBeNull();
    expect(raw === null).toBe(true);

    // 陷阱就在这行(注意: JS 里 "null < 4 为 false" 这个直觉不成立, predicates.ts 文件头
    // 「⚠ 调用方必读」段也写明了同一条纪律):
    // 关系比较会 ToNumber(null) = 0, 所以 `null < 4` 为 **true**, `null >= 4` 为 **false**。
    // 门禁若写 `clearance < minGap → 报违规`, "不知道"会被误报成违规;
    // 若写 `clearance >= minGap → 通过`, "不知道"永远进不了通过分支(门禁假阴性/卡死)。
    expect(raw! < 4).toBe(true);
    expect(raw! >= 4).toBe(false);

    // 唯一正确的读法: 先 === null 分流, 未知道单独走一路, 绝不与数值混算
    const verdict = raw === null ? 'unknown' : raw >= 4 ? 'pass' : 'fail';
    expect(verdict).toBe('unknown');
    expect(verdict === 'pass').toBe(false);
    // 对照: 真的测得 0 净空时才该判 fail(相交 = 0 是"确知为 0", 与 null 完全不同)
    const touching = segmentRectClearance({ x: -50, y: 0 }, { x: 150, y: 0 }, wide);
    expect(touching).toBe(0);
    expect(touching === null ? 'unknown' : touching >= 4 ? 'pass' : 'fail').toBe('fail');
  });

  it('rectsOverlap: 非法矩形(h: Infinity)返回 false —— 不许假碰撞', () => {
    expect(rectsOverlap(sq, { x: 9, y: 0, w: 10, h: Infinity })).toBe(false);
    expect(rectsOverlap({ x: NaN, y: 0, w: 10, h: 10 }, sq)).toBe(false);
    // 对照: 同一对方程把 h 换成有限值就真重叠 —— 说明上面 false 来自 finite 守卫, 不是碰巧不重叠
    expect(rectsOverlap(sq, { x: 9, y: 0, w: 10, h: 10 })).toBe(true);
  });

  it('rectsOverlap 的 gap 符号: >0 放成间距检查(相距 5px, gap 8 → true) / <0 收紧成容差(重叠 1px, gap -2 → false)', () => {
    const apart = { x: 15, y: 0, w: 10, h: 10 }; // 与 sq 相距 5px
    expect(rectsOverlap(sq, apart, 0)).toBe(false);
    expect(rectsOverlap(sq, apart, 8)).toBe(true); // 5px < 8px → 算"贴太近"
    const overlap1 = { x: 9, y: 0, w: 10, h: 10 }; // 与 sq 只重叠 1px
    expect(rectsOverlap(sq, overlap1, 0)).toBe(true);
    expect(rectsOverlap(sq, overlap1, -2)).toBe(false); // 重叠不足 |gap|=2 → 当噪声容差放行
  });

  it('segmentIntersectsRect 的 gap 膨胀: 距矩形 1px 的线段 gap=0 → false, gap=2 → true', () => {
    const a = { x: 0, y: -1 };
    const b = { x: 100, y: -1 };
    expect(segmentIntersectsRect(a, b, wide, 0)).toBe(false);
    expect(segmentIntersectsRect(a, b, wide, 2)).toBe(true);
    // 膨胀后的边界是闭区间: gap 正好等于 1px 时贴边也算相交(与 pointInRect 的含边界语义一致)
    expect(segmentIntersectsRect(a, b, wide, 1)).toBe(true);
  });

  it('segmentRectIntersectionLength: 横穿 100x50 矩形 ≈ 宽度 100; 完全在外为 0; 非法输入为 null', () => {
    // 水平线横穿: 交点区间 [0,100] → 长度 = 矩形宽 100
    expect(segmentRectIntersectionLength({ x: -50, y: 25 }, { x: 150, y: 25 }, wide)).toBeCloseTo(100, 9);
    // 竖直线横穿: 长度 = 矩形高 50
    expect(segmentRectIntersectionLength({ x: 50, y: -5 }, { x: 50, y: 75 }, wide)).toBeCloseTo(50, 9);
    // 完全在矩形外 1px: 确知无交 → 0(不是 null)
    expect(segmentRectIntersectionLength({ x: -50, y: -1 }, { x: 150, y: -1 }, wide)).toBe(0);
    // 非法输入 → null
    expect(segmentRectIntersectionLength({ x: NaN, y: 0 }, { x: 10, y: 0 }, wide)).toBeNull();
    expect(segmentRectIntersectionLength({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 0, w: 100, h: Infinity })).toBeNull();
  });

  it('零长线段落在矩形外: 相交长度 0(合法退化输入不进"不知道"通道)', () => {
    // 输入全有限、只是退化成一个点 —— 确知无交, 必须给 0 而不是 null
    expect(segmentRectIntersectionLength({ x: 200, y: 200 }, { x: 200, y: 200 }, wide)).toBe(0);
    expect(segmentRectIntersectionLength({ x: 10, y: 10 }, { x: 10, y: 10 }, wide)).toBe(0);
  });

  it('properSegmentIntersection: T 形相触 false / 真穿越 true / 共享端点 false', () => {
    // T 形: 竖线端点搭在横线中间(相交长度 0, 视觉上是接上而非穿过)
    expect(properSegmentIntersection({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 })).toBe(false);
    // 真穿越: 竖线两端跨到横线两侧
    expect(properSegmentIntersection({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: -50 }, { x: 50, y: 50 })).toBe(true);
    // 首尾对接(共享端点)
    expect(properSegmentIntersection({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 50 })).toBe(false);
    // 非有限输入 → false(不知道 ≠ 相交)
    expect(properSegmentIntersection({ x: 0, y: 0 }, { x: NaN, y: 0 }, { x: 50, y: -50 }, { x: 50, y: 50 })).toBe(false);
  });

  it('polylineCrossings: T 形相触不计 / 共线重叠不计 / 真穿越计 1', () => {
    const horizontal: Pt[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    // T 形相触: 竖线端点落在 (50,0), 正交路由里是常态, 计进去等于虚报
    expect(polylineCrossings(horizontal, [{ x: 50, y: 0 }, { x: 50, y: 50 }])).toBe(0);
    // 共线重叠 50px: segmentsIntersect 会判 true, proper 判 false —— 这里必须按 proper 算
    expect(polylineCrossings(horizontal, [{ x: 50, y: 0 }, { x: 150, y: 0 }])).toBe(0);
    // 真穿越: 竖线两端各跨到一侧
    expect(polylineCrossings(horizontal, [{ x: 50, y: -50 }, { x: 50, y: 50 }])).toBe(1);
  });

  it('正交判定: 水平/垂直线段 true, 1° 斜线 false; 且没有退回 atan2 量化的恒真式', () => {
    expect(isOrthogonalSegment({ x: 0, y: 0 }, { x: 100, y: 0 })).toBe(true);
    expect(isOrthogonalSegment({ x: 0, y: 0 }, { x: 0, y: 100 })).toBe(true);
    expect(isOrthogonalSegment({ x: 0, y: 0 }, { x: 100, y: 1.745 })).toBe(false); // tan 1° ≈ 0.01745
    // 偏离量: 严格正交 = 0
    expect(orthogonalDeviation({ x: 0, y: 0 }, { x: 0, y: 100 })).toBe(0);
    expect(orthogonalDeviation({ x: 0, y: 0 }, { x: 100, y: 0 })).toBe(0);
    // 折线: 只要有一段斜, 整条不正交
    expect(isOrthogonalPolyline([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 150, y: 100 }])).toBe(true);
    expect(isOrthogonalPolyline([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 150, y: 101 }])).toBe(false);

    // 0.5px 偏移的"近似竖直"段: dirIndex 量化后就是 S 轴(1) —— 判据若写成方向量化比较,
    // 任何段都会被算成正交(恒真式)。谓词走的是 |dx| <= 0.01px 的绝对容差, 必须判 false。
    const nearVertical: Pt = { x: 0.5, y: 100 };
    expect(dirIndex(nearVertical)).toBe(1); // 量化视角: "竖直"
    expect(isOrthogonalSegment({ x: 0, y: 0 }, nearVertical)).toBe(false); // 谓词视角: 不正交
  });

  it('pointInRect 的 gap: 矩形外 3px 的点 gap=0 → false, gap=4 → true', () => {
    const outside = { x: 103, y: 25 }; // 距右边界 3px
    expect(pointInRect(outside, wide, 0)).toBe(false);
    expect(pointInRect(outside, wide, 4)).toBe(true);
    // 反向(gap < 0 收缩 = 容差): 贴边 1px 内的点在 gap=-2 下算"不在内"
    expect(pointInRect({ x: 1, y: 25 }, wide, 0)).toBe(true);
    expect(pointInRect({ x: 1, y: 25 }, wide, -2)).toBe(false);
    // 非法输入 → false
    expect(pointInRect({ x: NaN, y: 25 }, wide)).toBe(false);
  });

  it('polylineRectsClearance 混入非法矩形 → 整体 null(不知道不许被静默跳过)', () => {
    // 曾经的写法用 forEach + return: 那只能结束当前回调, 非法矩形被跳过,
    // 其余合法矩形的测量值照样返回 —— 等于把"不知道"降级成"只看了一部分"。
    // 现在改 for 循环, 任一非法矩形直接让整个函数返回 null。
    const pts: Pt[] = [{ x: 0, y: 200 }, { x: 10, y: 200 }];
    const good: Rect = { x: 0, y: 0, w: 100, h: 50 };
    const bad: Rect = { x: 0, y: 0, w: 100, h: Infinity };
    expect(polylineRectsClearance(pts, [good, bad])).toBeNull();
    expect(polylineRectsClearance(pts, [bad, good])).toBeNull();
    expect(polylineRectsClearance(pts, [bad])).toBeNull();
    // 对照: 全是合法矩形时照常给数(避免"修成永远 null"这种假通过)
    expect(polylineRectsClearance(pts, [good])).toBeCloseTo(150, 9);
  });
});
