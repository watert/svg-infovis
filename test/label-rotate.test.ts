// =====================================================================
// 旋转标签 · `labelAngle` / `SceneLabel.rotate` / `labelRect` 三者的同一份几何
//
// 由来(260920 ontology 图): 竖向的 "Flown By"、斜向的 "Hub For" 要**沿线旋转**才读得顺。
// 标记一进产物, 立刻撞上本仓的老问题: **门禁量的是哪个矩形**?
//   · 渲染面画的是那块**旋转后**的遮罩片(`labelBoxShape` 挂 `transform: rotate(...)`)
//   · 门禁只认**轴对齐**矩形
// 于是修法不是"两边各算一遍", 而是收成一处: `labelRect(l)` 返回旋转后矩形的轴对齐包围盒,
// 渲染面与审计面**读同一个函数**(第三次处理"双源", 前两次是 group 标题与边标签的落位)。
//
// 归一化口径值得点名(它是"读得顺"的全部秘密): 角度归到 `[-90, 90)`, 落在下半圈就翻 180° ——
// **文字永远不倒着写**; 竖线(±90°)一律归到 **-90°**, 于是一对平行线(一条向上一条向下)的标签
// 得到同一个角度, 看起来是同一套排法。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { labelAngle } from '../src/shapes/edge';
import { labelRect } from '../src/knives/audit';
import { type Scene, audit } from '../src/knives/audit';
import { edgeLabel } from '../src/shapes/edge';
import { labelBoxShape } from '../src/shapes/text';
import { svg } from '../src/descriptor';
import { toSVG } from '../src/serialize';
import { contentBounds } from '../src/export';
import { round1 } from '../src/geometry/vec';
import type { Pt } from '../src/geometry/vec';

const P = (x: number, y: number): Pt => ({ x, y });

describe('labelAngle · 归一化到 [-90, 90)', () => {
  const CASES: Array<[string, Pt[], number]> = [
    ['竖线(自上而下)', [P(0, 0), P(0, 100)], -90],
    ['竖线(自下而上)', [P(0, 100), P(0, 0)], -90], // 差 180° 的两条线必须同角
    ['横线(向右)', [P(0, 0), P(100, 0)], 0],
    ['横线(向左)', [P(100, 0), P(0, 0)], 0],
    ['45° 斜线', [P(0, 0), P(100, 100)], 45],
    ['-45° 斜线', [P(0, 100), P(100, 0)], -45],
    ['陡斜线(向右下)', [P(0, 0), P(10, 100)], 84.3], // 只差一点没到竖直 ⇒ 仍落在 [-90, 90) 内
    ['退化(所有点重合)', [P(5, 5), P(5, 5)], 0],
  ];
  for (const [name, pts, want] of CASES) {
    it(`${name} → ${want}°`, () => {
      const got = labelAngle(pts);
      expect(got).toBeCloseTo(want, 6);
      expect(got).toBeGreaterThanOrEqual(-90);
      expect(got).toBeLessThan(90);
    });
  }

  it('多段折线看**中点所在的那一段**(与 `labelAnchor` 共用 `midSegment`, 走法只许有一份)', () => {
    // 竖向 stub + 横向主体: 中点落在横段上 ⇒ 角度 0, 而不是竖段的 -90
    const pts = [P(0, 0), P(0, 20), P(200, 20)];
    expect(labelAngle(pts)).toBe(0);
  });
});

describe('labelRect · 旋转后矩形的轴对齐包围盒', () => {
  const l = edgeLabel({ id: 'l', points: [P(0, 0), P(0, 200)] }, 'Flown By', { rotate: -90 });

  it('不旋转时就是原位外框(尺寸来自 labelBoxSize)', () => {
    expect(l.rotate).toBe(-90); // edgeLabel 把角度烘进 SceneLabel
    // 去掉角度后: 以 at 为中心的原框。宽 63.6 / 高 23.6 —— 260923 起高走行块口径(旧值是 19,
    // 按 `fontSize + 2×padY` 的近似给的, 比真行盒矮)
    expect(labelRect({ ...l, rotate: undefined })).toEqual({ x: -31.8, y: 88.2, w: 63.6, h: 23.6 });
  });

  it('90° 整数倍下宽高互换(这就是它的真矩形)', () => {
    expect(labelRect(l)).toEqual({
      x: round1(l.at.x - l.height / 2), y: round1(l.at.y - l.width / 2), w: l.height, h: l.width,
    });
    expect(labelRect(l)).toEqual({ x: -11.8, y: 68.2, w: 23.6, h: 63.6 });
  });

  it('任意角度下是外接矩形(保守: 门禁宁可多报)', () => {
    const r = labelRect({ ...l, rotate: -45 });
    const c = Math.abs(Math.cos((-45 * Math.PI) / 180));
    expect(r.w).toBe(round1(l.width * c + l.height * c));
    expect(r.h).toBe(r.w); // 45° 下外接矩形是正方形
    // 中心不变 —— 旋转绕的是 `at`。容差就是 `round1` 的半格(0.05): 外接宽高各收口一次, 中心
    // 因此带 ≤0.05 的量化残差(收口的固有代价, 不是漂移; 旧口径下宽高和恰是整数, 才曾用 6 位)
    expect(Math.abs(r.x + r.w / 2 - l.at.x)).toBeLessThanOrEqual(0.05 + 1e-9);
    expect(Math.abs(r.y + r.h / 2 - l.at.y)).toBeLessThanOrEqual(0.05 + 1e-9);
  });

  it('浮点噪声被 `round1` 收口(不然 evidence 里会冒出 30.000000000000004)', () => {
    const r = labelRect({ ...l, rotate: 90 });
    expect(String(r.w)).not.toContain('0000000');
    expect(r.w).toBe(l.height);
  });
});

describe('旋转标签 · 门禁与渲染同拍', () => {
  /** 200×200 画布, 一个竖标签: 不旋转时正好装下, 转 90° 后外接矩形探出左沿 */
  const scene = (rotate?: number): Scene => ({
    width: 200, height: 200, nodes: [], edges: [],
    labels: [{ id: 'A', at: P(25, 30), width: 19, height: 60, text: 'Flown By', ...(rotate === undefined ? {} : { rotate }) }],
  });

  it('同一个标签: 不旋转过门禁, 转 -90° 后外接矩形探出画布 ⇒ 被拦', () => {
    expect(audit(scene()).diagnostics.filter((d) => d.code === 'single_svg')).toEqual([]);
    const rotated = audit(scene(-90));
    const d = rotated.diagnostics.find((x) => x.code === 'single_svg');
    expect(d).toBeDefined();
    expect(d?.evidence.offenders).toEqual(['label:A']);
    // 判决确实来自**旋转后的** AABB: 手算 x = 25 - 60/2 = -5
    expect(labelRect(scene(-90).labels![0]).x).toBe(-5);
  });

  it('渲染面做同一件事: 挂 `transform: rotate(角度 x y)`, 中心就是 `at`', () => {
    const out = toSVG(svg(200, 200, [labelBoxShape({ x: 25, y: 30, w: 19, h: 60, content: 'Flown By', rotate: -90 })]));
    expect(out).toContain('transform="rotate(-90 25 30)"');
    // 内层那块盒子仍按**原位**坐标画, 旋转整块包在外层 —— 与 `labelRect` 的"中心不变"是同一件事
    expect(out).toContain('<rect x="15.50" y="0.00" width="19.00" height="60.00"');
  });

  it('不旋转时**不挂** transform(多包一层 rotate(0) 会改字节)', () => {
    const out = toSVG(svg(200, 200, [labelBoxShape({ x: 25, y: 30, w: 19, h: 60, content: 'Flown By' })]));
    expect(out).not.toContain('transform');
  });

  it('`contentBounds` 认旋转后的包围盒(fit 才不会把竖标签裁掉)', () => {
    const rotated = contentBounds(scene(-90));
    const flat = contentBounds(scene());
    // 旋转后的 AABB 左沿 = 25 - 60/2 = -5(减 1px bleed); 不旋转时左沿 = 25 - 19/2 = 15.5
    expect(rotated!.x).toBe(-6);
    expect(flat!.x).toBe(14.5);
    expect(rotated!.x).toBeLessThan(flat!.x); // 换过宽高之后, 探出去的方向也换了
    expect(rotated!.w).toBe(62); // 60 + 2×bleed(旋转后宽高互换)
    expect(rotated!.h).toBe(21); // 19 + 2×bleed
  });

  it('旋转把宽高换过之后, 该留的余量换了位置(端到端: 横标签在矮画布里转一下反而装不下)', () => {
    // 画布 200×40: 横标签(60×19)装得下; 转 -90° 后变成 19×60 ⇒ 高度探出
    const base = { id: 'A', at: P(100, 20), width: 60, height: 19, text: 'Hub For' };
    const flatNarrow: Scene = { width: 200, height: 40, nodes: [], edges: [], labels: [base] };
    const rotated: Scene = { ...flatNarrow, labels: [{ ...base, rotate: -90 }] };
    expect(audit(flatNarrow).diagnostics.some((d) => d.code === 'single_svg')).toBe(false);
    const d = audit(rotated).diagnostics.find((x) => x.code === 'single_svg');
    expect(d?.evidence.offenders).toEqual(['label:A']);
  });
});
