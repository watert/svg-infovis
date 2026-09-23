// =====================================================================
// shapes/node 单测 · node descriptor 出口与几何解算
// 关注两点: descriptor 的形状契约(group + path 打头), 以及标准盒不该被钳制。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { nodeGeometry, nodeShape } from '../src/shapes/node';

describe('shapes/node · descriptor 出口', () => {
  it('nodeShape 返回 kind 为 group, children 首个是 path', () => {
    const d = nodeShape({ x: 0, y: 0, w: 200, h: 56, label: 'HTML 骨架' });
    expect(d.kind).toBe('group');
    expect(d.attrs?.['data-shape']).toBe('node');
    if (d.kind !== 'group') throw new Error('nodeShape 必须返回 group');
    expect(d.children.length).toBeGreaterThan(0);
    expect(d.children[0].kind).toBe('path');
    if (d.children[0].kind !== 'path') throw new Error('首个 child 必须是 path');
    expect(d.children[0].d.startsWith('M ')).toBe(true);
    expect(d.children[0].d.endsWith(' Z')).toBe(true);
  });

  it('nodeGeometry 对标准盒(200x56, r=10) 的 clamped 为空', () => {
    const g = nodeGeometry({ x: 0, y: 0, w: 200, h: 56, radius: 10 });
    expect(g.clamped).toEqual([]);
    expect(g.minActualRadius).toBeCloseTo(10, 6);
    expect(g.corners).toHaveLength(4);
    expect(g.rect).toEqual({ x: 0, y: 0, w: 200, h: 56 });
  });

  it('nodeGeometry 对小盒子(40x40, r=30) 报出被钳制的角', () => {
    // 与上一条对照: clamped 不是恒空 —— 半径超过邻边一半时必须被点名
    const g = nodeGeometry({ x: 0, y: 0, w: 40, h: 40, radius: 30 });
    expect(g.clamped).toEqual([0, 1, 2, 3]);
    expect(g.minActualRadius).toBeLessThan(30);
  });
});
