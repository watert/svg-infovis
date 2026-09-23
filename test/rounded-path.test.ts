// =====================================================================
// rounded-path 单测 · 圆角半径钳制 / 凹凸判定 / 折线磨圆 / 端点几何与内缩
// 只吃 core 的纯几何出口, 不碰 descriptor 与 SVG 序列化。
// 坐标一律用 y-down 屏幕坐标系, "顺时针"指屏幕视角顺时针(signedArea > 0)。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import {
  type MarkerStyle,
  analyzeVertices,
  endpointTrim,
  radiusPolygonPath,
  radiusPolylinePath,
  trimPolyline,
} from '../src/geometry/rounded-path';
import { type Pt, fmt } from '../src/geometry/vec';

/** 顺时针(屏幕)矩形四角 */
const rectPts = (w: number, h: number): Pt[] => [
  { x: 0, y: 0 },
  { x: w, y: 0 },
  { x: w, y: h },
  { x: 0, y: h },
];

/** L 形多边形(屏幕顺时针), 其中 (20,20) 是凹角 */
const lPts = (): Pt[] => [
  { x: 0, y: 0 },
  { x: 60, y: 0 },
  { x: 60, y: 20 },
  { x: 20, y: 20 },
  { x: 20, y: 60 },
  { x: 0, y: 60 },
];

/** 按出现顺序抽出 path d 里的全部数值(用于核对端点坐标) */
const nums = (d: string): number[] => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

describe('rounded-path · 圆角解算与端点几何', () => {
  it('半径被邻段钳制: 40x40 盒子给 radius 30, 实际半径小于理想值且 tDist 不超邻边一半', () => {
    const { tangents } = radiusPolygonPath(rectPts(40, 40), 30);
    expect(tangents).toHaveLength(4);
    for (const t of tangents) {
      expect(t.idealRadius).toBe(30);
      // 理想半径 30 > 邻边一半 20, 必须被钳制
      expect(t.actualRadius).toBeLessThan(t.idealRadius);
      expect(t.actualRadius).toBeCloseTo(20, 6);
      expect(t.tDist).toBeLessThanOrEqual(40 / 2);
      expect(t.tDist).toBeCloseTo(20, 6);
    }
  });

  it('analyzeVertices: 顺时针矩形四角 isConvex 全 true', () => {
    const A = analyzeVertices(rectPts(100, 60));
    expect(A).toHaveLength(4);
    expect(A.every((a) => a.isCW)).toBe(true);
    expect(A.map((a) => a.isConvex)).toEqual([true, true, true, true]);
    // 直角的内角 = π/2
    expect(A[0].angle).toBeCloseTo(Math.PI / 2, 6);
  });

  it('analyzeVertices: 凹多边形(L 形)至少一个角 isConvex false', () => {
    const A = analyzeVertices(lPts());
    expect(A).toHaveLength(6);
    expect(A.filter((a) => !a.isConvex).length).toBeGreaterThanOrEqual(1);
    // 凹角出现在 L 的内折点 (20,20) 上
    expect(A[3].curr).toEqual({ x: 20, y: 20 });
    expect(A[3].isConvex).toBe(false);
  });

  it('radiusPolygonPath: d 以 M 开头 / 以 Z 结尾 / 含 A 命令, 矩形 tangents 长度 4', () => {
    const { d, analyses, tangents } = radiusPolygonPath(rectPts(100, 60), 12);
    expect(d.startsWith('M ')).toBe(true);
    expect(d.endsWith(' Z')).toBe(true);
    expect(d).toContain(' A ');
    expect(tangents).toHaveLength(4);
    expect(analyses).toHaveLength(4);
    expect(tangents.every((t) => t.skipped === false)).toBe(true);
  });

  it('radiusPolylinePath: 起终点坐标与输入完全一致, 只磨内部顶点', () => {
    const pts: Pt[] = [
      { x: 1.5, y: 2.25 },
      { x: 50, y: 2.25 },
      { x: 50, y: 80 },
    ];
    const { d, tangents } = radiusPolylinePath(pts, 8);
    const n = nums(d);
    expect(n.slice(0, 2)).toEqual([1.5, 2.25]); // 起点原样
    expect(n.slice(-2)).toEqual([50, 80]); // 终点原样
    expect(tangents).toHaveLength(1); // 只有 1 个内部顶点被磨
    expect(tangents[0].index).toBe(1);
    // 内部顶点被切成两个不重合的切点, 顶点本身不再是折点
    expect(tangents[0].t1).not.toEqual(tangents[0].t2);
    expect(tangents[0].actualRadius).toBeGreaterThan(0);
  });

  it('radiusPolylinePath: 2 点折线不产生 A 命令', () => {
    const { d, tangents } = radiusPolylinePath(
      [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
      8,
    );
    expect(d).not.toContain('A');
    expect(tangents).toHaveLength(0);
    expect(d).toBe(`M ${fmt(0)} ${fmt(0)} L ${fmt(10)} ${fmt(10)}`);
  });

  it('endpointTrim: dot 类返回 size/2, arrow-triangle 返回 size, arrow-line 返回 1', () => {
    const size = 8;
    expect(endpointTrim('dot-hollow', size)).toBe(size / 2);
    expect(endpointTrim('dot-solid', size)).toBe(size / 2);
    expect(endpointTrim('arrow-triangle', size)).toBe(size);
    expect(endpointTrim('arrow-line', size)).toBe(1);
    expect(endpointTrim('none', size)).toBe(0);
    // 未给 style 时同样不内缩
    expect(endpointTrim(undefined as unknown as MarkerStyle, size)).toBe(0);
  });

  it('trimPolyline: 两端沿邻段内缩, 内部点不变', () => {
    const pts: Pt[] = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 50 },
    ];
    const out = trimPolyline(pts, 5, 5);
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({ x: 5, y: 0 }); // 起点沿首段内缩 5
    expect(out[1]).toEqual(pts[1]); // 内部点原样
    expect(out[2]).toEqual({ x: 50, y: 45 }); // 终点沿末段内缩 5
    // 纯函数: 不改动入参
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[2]).toEqual({ x: 50, y: 50 });
  });
});
