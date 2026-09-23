// =====================================================================
// knives/route-pair · 成对连线(双线)
//
// 由来(260920 ontology 图): `Flight --Departed From--> Airport` 与
// `Flight --Arrived To--> Airport` 是**同一对实体上的两条关系**, 版式上是两条平行线,
// 每条各带自己的沿线标签。
//
// 本刀唯一的机制: **一条权威几何, 两条平移拷贝** ——
//   · 中线交给单线那条路(`routeOrthogonal`: 端口协议 / stub / lane / via 全照旧)
//   · 成对关系只做一件事: 沿**成对法线**把中线整体平移 ±gap/2
// 为什么不是"给两个端口各路由一次": 后者在两条线拓扑不同(一条 L 形、一条 Z 形)时会给出
// **不平行**的一对 —— 而平行正是"这是一对"的唯一视觉信号。平移出来的两条线拓扑恒相同, 凭构造平行。
//
// 本文件钉住五件事:
//   ① 平行性(逐点等距 + 方向相同), 且这个性质**不靠运气**: 中线是 Z 形时照样平行
//   ② 主轴判定(竖向为主 → 法线走 x; 横向为主 → 法线走 y)
//   ③ 中线只此一份(`midline`), 不伪造两份"看起来独立"的路由结果
//   ④ `onFace`: 端点滑出面时报 false —— **报而不改**(端口是作者决策)
//   ⑤ 标签落自己那条线的**外侧**, 且两条线角度相同(排法一致)
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { PAIR_GAP, PAIR_LABEL_GAP, pairLabels, routePair } from '../src/knives/route-pair';
import { routeOrthogonal } from '../src/knives/route';
import { edgePairShape } from '../src/shapes/edge';
import { audit } from '../src/knives/audit';
import { ShapeInputError } from '../src/guard';
import type { Attrs, DGroup, Descriptor } from '../src/descriptor';
import type { Pt } from '../src/geometry/vec';

/** 竖向为主的一对: a 在上, b 在下 */
const A = { x: 0, y: 0, w: 100, h: 100 };
const B = { x: 0, y: 400, w: 100, h: 100 };
const vertical = (gap?: number) =>
  routePair({ from: A, fromPort: { side: 'bottom' }, to: B, toPort: { side: 'top' }, ...(gap === undefined ? {} : { gap }) });

/** 横向为主的一对: a 在左, b 在右 */
const horizontal = (gap?: number) =>
  routePair({
    from: { x: 0, y: 0, w: 100, h: 100 }, fromPort: { side: 'right' },
    to: { x: 400, y: 0, w: 100, h: 100 }, toPort: { side: 'left' },
    ...(gap === undefined ? {} : { gap }),
  });

const dist = (p: Pt, q: Pt) => Math.hypot(p.x - q.x, p.y - q.y);

/** 断言并窄化成一个 group(测试里到处要读 `.children` / `.attrs`, 手写 `if` 太吵) */
const groupOf = (d: Descriptor): DGroup => {
  if (d.kind !== 'group') throw new Error(`期望 group, 拿到 ${d.kind}`);
  return d;
};
/** 断言并窄化出 `.attrs`(path / circle / rect 这一档) */
const desc = (d: Descriptor): { attrs?: Attrs } => {
  if (!('attrs' in d)) throw new Error(`期望带 attrs 的 descriptor, 拿到 ${d.kind}`);
  return d as { attrs?: Attrs };
};

describe('route-pair · 平行性', () => {
  it('两条线逐点等距 = gap, 且方向逐段相同(凭构造平行)', () => {
    const pair = vertical(26);
    expect(pair.points[0]).toHaveLength(pair.points[1].length);
    pair.points[0].forEach((p, i) => {
      expect(dist(p, pair.points[1][i])).toBeCloseTo(26, 6);
    });
    // 方向: 逐段向量相等
    for (let i = 1; i < pair.points[0].length; i++) {
      const d0 = { x: pair.points[0][i].x - pair.points[0][i - 1].x, y: pair.points[0][i].y - pair.points[0][i - 1].y };
      const d1 = { x: pair.points[1][i].x - pair.points[1][i - 1].x, y: pair.points[1][i].y - pair.points[1][i - 1].y };
      expect(d1).toEqual(d0);
    }
  });

  it('中线是 **Z 形**(四个折点)时照样平行 —— 这正是"不做两次独立路由"的理由', () => {
    // 端口贴在盒角: 单线给出 stub + lane 的 Z 形走法
    const pair = routePair({ from: A, fromPort: { side: 'bottom', t: 0 }, to: B, toPort: { side: 'top' }, gap: 26 });
    expect(pair.midline.points.length).toBeGreaterThan(2);
    pair.points[0].forEach((p, i) => expect(dist(p, pair.points[1][i])).toBeCloseTo(26, 6));
  });

  it('gap 缺省走 PAIR_GAP; gap ≤ 0 当场抛(两条线重合等于一条线)', () => {
    expect(vertical().gap).toBe(PAIR_GAP);
    expect(dist(vertical().points[0][0], vertical().points[1][0])).toBeCloseTo(PAIR_GAP, 6);
    expect(() => vertical(0)).toThrow(ShapeInputError);
    expect(() => vertical(-4)).toThrow(ShapeInputError);
  });
});

describe('route-pair · 主轴与法线', () => {
  it('竖向为主 ⇒ 法线走 x(两条线左右分开), normalAxis = "x"', () => {
    const pair = vertical();
    expect(pair.normal).toEqual({ x: 1, y: 0 });
    expect(pair.normalAxis).toBe('x');
    // 线 0 在 -normal 侧(靠左), 线 1 在 +normal 侧(靠右)
    expect(pair.points[0][0].x).toBeLessThan(pair.points[1][0].x);
    expect(pair.points[0][0].y).toBe(pair.points[1][0].y);
  });

  it('横向为主 ⇒ 法线走 y(两条线上下分开), normalAxis = "y"', () => {
    const pair = horizontal();
    expect(pair.normal).toEqual({ x: 0, y: 1 });
    expect(pair.normalAxis).toBe('y');
    expect(pair.points[0][0].y).toBeLessThan(pair.points[1][0].y);
    expect(pair.points[0][0].x).toBe(pair.points[1][0].x);
  });

  it('中线只此一份: `midline` 就是**单线路由**的那份结果, 两条线的中点落在它身上', () => {
    const req = { from: A, fromPort: { side: 'bottom' } as const, to: B, toPort: { side: 'top' } as const };
    const pair = routePair(req);
    const single = routeOrthogonal(req);
    expect(pair.midline.points).toEqual(single.points);
    // 两条线是中线沿法线的 ±gap/2 平移 ⇒ 逐点平均回到中线
    pair.midline.points.forEach((m, i) => {
      const p0 = pair.points[0][i];
      const p1 = pair.points[1][i];
      expect((p0.x + p1.x) / 2).toBeCloseTo(m.x, 6);
      expect((p0.y + p1.y) / 2).toBeCloseTo(m.y, 6);
    });
  });
});

describe('route-pair · onFace: 端点滑出面时报, 不替作者挪端口', () => {
  it('端口居中时两条线的端点都还贴在那个面上', () => {
    expect(vertical(26).onFace).toEqual([true, true]);
    expect(horizontal(26).onFace).toEqual([true, true]);
  });

  it('端口贴角 + gap 一大, 平移后的端点滑出那个面 ⇒ 报 false', () => {
    const pair = routePair({ from: A, fromPort: { side: 'bottom', t: 0 }, to: B, toPort: { side: 'top' }, gap: 26 });
    // 线 0 被左移 13, 端点 x = -13 < 盒左沿 ⇒ 不在 bottom 面上
    expect(pair.points[0][0].x).toBeLessThan(A.x);
    expect(pair.onFace).toEqual([false, true]);
    // 中线本身仍然合法(端口在原面上) —— 报的是"平移的后果", 不是"路由失败"
    expect(pair.midline.points[0].x).toBe(A.x);
  });
});

describe('route-pair · pairLabels', () => {
  const pair = vertical(26);
  const labels = pairLabels(pair, ['Departed From', 'Arrived To'], { offset: 16 });

  it('每条线一个, 顺序与 `points` 一一对应', () => {
    expect(labels.map((l) => l.id)).toEqual(['L-pair0', 'L-pair1']);
    expect(labels.map((l) => l.text)).toEqual(['Departed From', 'Arrived To']);
  });

  it('落在**自己那条线的外侧**: 线 0 的字更靠 -normal(左), 线 1 的更靠 +normal(右)', () => {
    const outward = pair.gap / 2 + 16;
    labels.forEach((l, i) => {
      const [p, q] = pair.points[i];
      const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
      const sign = i === 0 ? -1 : 1;
      expect(l.at.x).toBe(mid.x + sign * outward);
      expect(l.at.y).toBe(mid.y);
    });
    expect(labels[0].at.x).toBeLessThan(labels[1].at.x);
  });

  it('两条线的标签**角度相同**(排法一致 —— 一对线看起来是一套排法)', () => {
    expect(labels[0].rotate).toBe(-90);
    expect(labels[1].rotate).toBe(-90);
  });

  it('offset 缺省走 PAIR_LABEL_GAP; 负值抛(标签离线的距离是尺寸不是增量)', () => {
    const def = pairLabels(pair, ['a', 'b'])[0];
    expect(pair.points[0][0].x - def.at.x).toBe(pair.gap / 2 + PAIR_LABEL_GAP);
    // 给了更大的 offset 就更靠外(方向: 离开线, 不是压上线)
    const off = pairLabels(pair, ['a', 'b'], { offset: 16 })[0];
    expect(def.at.x).toBeGreaterThan(off.at.x);
    expect(() => pairLabels(pair, ['a', 'b'], { offset: -1 })).toThrow(ShapeInputError);
  });
});

describe('route-pair · edgePairShape(组合, 不是第二份实现)', () => {
  const pair = vertical(26);
  const lines: [{ points: Pt[] }, { points: Pt[] }] = [{ points: pair.points[0] }, { points: pair.points[1] }];

  it('恰好两条: 一个组, 两条线, 组上挂 data-shape 供对账', () => {
    const d = groupOf(edgePairShape({ lines, width: 1.5 }));
    expect(d.attrs?.['data-shape']).toBe('edge-pair');
    expect(d.children).toHaveLength(2);
    expect(d.children.every((c) => c.kind === 'group')).toBe(true);
  });

  it('共享属性铺到两条线上(同色 / 同粗细), 逐线显式给的值仍然赢', () => {
    const d = edgePairShape({ lines, color: '#334155', width: 2, dash: '4 3' });
    const pair = groupOf(d);
    for (const line of pair.children) {
      const inner = groupOf(line).children[0];
      expect(desc(inner).attrs?.stroke).toBe('#334155');
      expect(desc(inner).attrs?.['stroke-width']).toBe(2);
      expect(desc(inner).attrs?.['stroke-dasharray']).toBe('4 3');
    }
    const overridden = groupOf(edgePairShape({ lines: [{ ...lines[0], color: '#f00' }, lines[1]], color: '#334155' }));
    expect(desc(groupOf(overridden.children[0]).children[0]).attrs?.stroke).toBe('#f00');
    expect(desc(groupOf(overridden.children[1]).children[0]).attrs?.stroke).toBe('#334155');
  });

  it('不是两条就抛(成对连线的定义就是两条; 三条以上请用 `assignLanes`)', () => {
    expect(() => edgePairShape({ lines: [lines[0]] as unknown as typeof lines })).toThrow(ShapeInputError);
    expect(() => edgePairShape({ lines: [lines[0], lines[1], lines[0]] as unknown as typeof lines })).toThrow(ShapeInputError);
  });
});

describe('route-pair · 端到端: 双线那一对进 scene 过门禁', () => {
  it('两条平行线 + 两个外侧标签, 画布装得下 ⇒ 零诊断', () => {
    // 实体居中摆: 外侧标签各自还需要 ~30px 的横向余量(这正是参照图左右留白的作用)
    const top = { x: 150, y: 0, w: 100, h: 100 };
    const bottom = { x: 150, y: 400, w: 100, h: 100 };
    const pair = routePair({ from: top, fromPort: { side: 'bottom' }, to: bottom, toPort: { side: 'top' }, gap: 26 });
    const labels = pairLabels(pair, ['Departed From', 'Arrived To'], { offset: 16 });
    const report = audit({
      width: 400, height: 600,
      nodes: [{ id: 'a', rect: top }, { id: 'b', rect: bottom }],
      edges: pair.points.map((points, i) => ({ id: `e${i}`, from: 'a', to: 'b', points })),
      labels,
    });
    expect(report.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(report.pass).toBe(true);
  });

  it('反证: 把实体贴到画布左沿, 外侧标签会被如实指出来 —— 门禁真在读它们', () => {
    const pair = routePair({ from: A, fromPort: { side: 'bottom' }, to: B, toPort: { side: 'top' }, gap: 26 });
    const report = audit({
      width: 400, height: 600,
      nodes: [{ id: 'a', rect: A }, { id: 'b', rect: B }],
      edges: pair.points.map((points, i) => ({ id: `e${i}`, from: 'a', to: 'b', points })),
      labels: pairLabels(pair, ['Departed From', 'Arrived To'], { offset: 16 }),
    });
    const d = report.diagnostics.find((x) => x.code === 'single_svg');
    expect(d?.evidence.offenders).toContain('label:L-pair0');
  });
});
