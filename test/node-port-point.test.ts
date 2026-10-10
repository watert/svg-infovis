// nodePortPoint: 边挂点要落在**可见轮廓**上 —— 矩/柱与 portPoint 逐字同源, 菱形回缩圆角内缩。
// 261009 事故: 端点停在数学顶点, 宽菱形锐顶点的可见尖端被圆角内缩 ~19px, 水平边全悬空。
import { describe, expect, it } from 'bun:test';
import { ShapeInputError } from '../src/guard';
import { nodeGeometry, nodePortPoint } from '../src/shapes/node';
import { portPoint } from '../src/geometry/port';
import { len, sub } from '../src/geometry/vec';

const R = { x: 100, y: 50, w: 300, h: 110 };
const SIDES = ['top', 'right', 'bottom', 'left'] as const;

// 菱形顶点内角的一半: 锐顶点(左右) sin(half) = (h/2)/L, 钝顶点(上下) = (w/2)/L, L = 半边长
const L = Math.sqrt((R.w / 2) ** 2 + (R.h / 2) ** 2);
const inset = (r: number, sinHalf: number) => r * (1 / sinHalf - 1);

describe('nodePortPoint', () => {
  it('rect / cylinder: 四面与 portPoint **逐字同源**(圆角够不到面中点)', () => {
    for (const shape of ['rect', 'cylinder'] as const) {
      for (const side of SIDES) {
        expect({ shape, side, p: nodePortPoint(shape, R, side) }).toEqual({ shape, side, p: portPoint(R, { side }) });
      }
    }
  });

  it('diamond 锐顶点(左右): 端点回缩 r·(1/sin(half)−1), 不再停在数学顶点', () => {
    const expectInset = inset(10, (R.h / 2) / L); // ≈ 19.05px —— 就是那道看得见的缝
    const left = nodePortPoint('diamond', R, 'left');
    expect(left.x).toBeCloseTo(R.x + expectInset, 6);
    expect(left.y).toBe(R.y + R.h / 2);
    const right = nodePortPoint('diamond', R, 'right');
    expect(right.x).toBeCloseTo(R.x + R.w - expectInset, 6);
  });

  it('diamond 钝顶点(上下): 内缩 <1px —— 解释了为什么竖边看起来一直没事', () => {
    const expectInset = inset(10, (R.w / 2) / L); // ≈ 0.65px
    expect(expectInset).toBeLessThan(1);
    const top = nodePortPoint('diamond', R, 'top');
    expect(top.x).toBe(R.x + R.w / 2);
    expect(top.y).toBeCloseTo(R.y + expectInset, 6);
  });

  it('回缩量随半径线性缩放: 节点用什么半径画, 挂点按什么半径算', () => {
    const sinHalf = (R.h / 2) / L;
    const p = nodePortPoint('diamond', R, 'left', { radius: 20 });
    expect(p.x).toBeCloseTo(R.x + inset(20, sinHalf), 6);
  });

  it('回缩后的挂点落在圆弧上: 到圆心距离 = 实际半径(与 nodeGeometry 的解算闭环)', () => {
    const g = nodeGeometry({ ...R, shape: 'diamond' });
    const corner = g.corners[3]; // left
    const tip = nodePortPoint('diamond', R, 'left');
    expect(len(sub(tip, corner.center!))).toBeCloseTo(corner.actualRadius, 6);
  });

  it('形状词写错当场抛(静默回落成矩形会让挂点漂移到角上)', () => {
    expect(() => nodePortPoint('diamand' as never, R, 'left')).toThrow(ShapeInputError);
  });
});
