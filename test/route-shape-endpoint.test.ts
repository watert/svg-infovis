// routeOrthogonal 的 fromShape/toShape: 菱形端点回缩到可见尖端(261009 悬边事故的一体化修法)。
// 缺省路径(不声明形状)必须逐字不变 —— 既有 route 测试全不传形状, 已由它们兜底。
import { describe, expect, it } from 'bun:test';
import { ShapeInputError } from '../src/guard';
import { firstBacktrackIndex } from '../src/geometry/predicates';
import { portPoint, routeOrthogonal } from '../src/knives/route';
import { nodePortPoint } from '../src/shapes/node';
import { sub } from '../src/geometry/vec';

const D = { x: 100, y: 50, w: 300, h: 110 };   // 宽菱形: 左右锐顶点内缩 ≈ 19px
const T = { x: 600, y: 80, w: 100, h: 60 };

describe('routeOrthogonal 的形状端点', () => {
  it('fromShape: diamond → 端点 = 可见尖端, 出线方向 = 面的朝外法线', () => {
    const r = routeOrthogonal({ from: D, fromPort: { side: 'right' }, fromShape: 'diamond', to: T, toPort: { side: 'left' }, stub: 18 });
    expect(r.from).toEqual(nodePortPoint('diamond', D, 'right'));
    expect(r.points[0]).toEqual(r.from);
    const seg = sub(r.points[1], r.points[0]);
    expect(seg.y).toBe(0);           // 水平出线(右法线)
    expect(seg.x).toBeGreaterThan(0);
  });

  it('toShape: diamond → 终点同样回缩, 入线逆着朝外法线进来', () => {
    const r = routeOrthogonal({ from: T, fromPort: { side: 'left' }, to: D, toPort: { side: 'right' }, toShape: 'diamond', stub: 18 });
    expect(r.to).toEqual(nodePortPoint('diamond', D, 'right'));
    const n = r.points.length;
    expect(r.points[n - 1]).toEqual(r.to);
    const seg = sub(r.points[n - 1], r.points[n - 2]);
    expect(seg.y).toBe(0);
    expect(seg.x).toBeLessThan(0);   // 从右往左进(逆 right 法线)
  });

  it('折线仍然合法: 无回折, 且所有折点收在两端点之间的走廊里', () => {
    const r = routeOrthogonal({ from: D, fromPort: { side: 'right' }, fromShape: 'diamond', to: T, toPort: { side: 'left' }, stub: 18 });
    expect(firstBacktrackIndex(r.points)).toBe(-1);
    const [lo, hi] = [r.from.x, r.to.x].sort((a, b) => a - b);
    for (const p of r.points) {
      expect(p.x).toBeGreaterThanOrEqual(lo - 1e-9);
      expect(p.x).toBeLessThanOrEqual(hi + 1e-9);
    }
  });

  it('fromRadius 与节点绘制半径同源: 半径翻倍, 回缩量翻倍', () => {
    const tip10 = nodePortPoint('diamond', D, 'right', { radius: 10 });
    const r = routeOrthogonal({ from: D, fromPort: { side: 'right' }, fromShape: 'diamond', fromRadius: 20, to: T, toPort: { side: 'left' } });
    const v = portPoint(D, { side: 'right' });
    expect(v.x - r.from.x).toBeCloseTo(2 * (v.x - tip10.x), 6);
  });

  it("fromShape: 'rect' 是透传 —— t/at 照吃, 与旧行为逐字一致", () => {
    const r = routeOrthogonal({ from: D, fromPort: { side: 'right', t: 0.25 }, fromShape: 'rect', to: T, toPort: { side: 'left' } });
    expect(r.from).toEqual(portPoint(D, { side: 'right', t: 0.25 }));
  });

  it('菱形端口给 t/at 当场抛(不静默吞参数 —— 作者以为摊在面上, 实际只会悬空)', () => {
    expect(() => routeOrthogonal({ from: D, fromPort: { side: 'right', t: 0.3 }, fromShape: 'diamond', to: T, toPort: { side: 'left' } }))
      .toThrow(ShapeInputError);
  });
});
