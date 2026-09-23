// =====================================================================
// node-forms · 节点形状三态(圆角矩形 / 菱形 / 圆柱)
//
// 这个文件的重点有三条, 都不是"形状画得像不像"那种没法断言的命题:
//   ① **零回归**: 不写 `shape` 时产物与加形状之前逐字节相同(缺省形态不进产物、不加属性)
//   ② **文字可用区**: 菱形 / 圆柱的可用区比同尺寸矩形小得多, 换算与几何必须同源
//      —— 且门禁 `label_fit` 量的是 `rect`, 它**看不见形状**(拿矩形口径的盒照样放行, 属漏报)
//   ③ **反解是紧解**: `nodeFit({shape})` 的 ×2 不是拍的系数, 是内接约束 `W/w + H/h ≤ 1` 的取等处
// =====================================================================

import { describe, expect, it } from 'bun:test';
import {
  type NodeProps, CYLINDER_CAP_RATIO, NODE_SHAPE_KINDS,
  nodeGeometry, nodeOuterSize, nodeShape, nodeTextArea,
} from '../src/shapes/node';
import { nodeFit } from '../src/knives/fit';
import { THRESHOLDS, audit } from '../src/knives/audit';
import { ShapeInputError } from '../src/guard';
import { type DGroup, type DPath, type DText, svg as svgRoot } from '../src/descriptor';
import { toSVG } from '../src/serialize';

const LABEL = 'Auth Provider';
const SUB = 'OAuth 2.0';
const INSET = THRESHOLDS.standard.labelInset;

/** 断言直接读描述符, 不去整串 SVG 里猜(同 test/scene-tone 的做法) */
const groupOf = (d: ReturnType<typeof nodeShape>): DGroup => {
  if (d.kind !== 'group') throw new Error('nodeShape 必须返回 group');
  return d;
};
const pathsOf = (d: ReturnType<typeof nodeShape>): DPath[] => groupOf(d).children.filter((c): c is DPath => c.kind === 'path');
const textsOf = (d: ReturnType<typeof nodeShape>): DText[] => groupOf(d).children.filter((c): c is DText => c.kind === 'text');
/** d 里所有圆弧的 (rx, ry) —— 断言的数是几何的真数, 不是抄来的字面量 */
const arcParams = (d: string): Array<[number, number]> =>
  [...d.matchAll(/A ([\d.]+) ([\d.]+) /g)].map((m) => [Number(m[1]), Number(m[2])]);
/** 单节点 scene(只喂 label_fit 要看的那几个字段) */
const nodeScene = (rect: { x: number; y: number; w: number; h: number }) => ({
  width: 900, height: 400, edges: [],
  nodes: [{ id: 'n', rect, label: LABEL, sub: SUB }],
});
const fitDiags = (rect: { x: number; y: number; w: number; h: number }) =>
  audit(nodeScene(rect)).diagnostics.filter((d) => d.code === 'label_fit');

describe('node-forms · 菱形与圆柱(形状 = 语义槽, 出入口仍只有 nodeShape 一个)', () => {
  it('零回归: 不写 shape 时与显式 rect 逐字节相同, 且缺省形态不往产物里挂属性', () => {
    const box = { x: 20, y: 30, w: 200, h: 56, label: LABEL, sub: SUB };
    const bare = toSVG(svgRoot(300, 120, [nodeShape(box)], { 'font-family': 'x' }));
    const rect = toSVG(svgRoot(300, 120, [nodeShape({ ...box, shape: 'rect' })], { 'font-family': 'x' }));
    expect(bare).toBe(rect);
    expect(bare).not.toContain('data-form');
    expect(nodeShape({ ...box, shape: 'diamond' }).attrs?.['data-form']).toBe('diamond');
    expect(nodeShape({ ...box, shape: 'cylinder' }).attrs?.['data-form']).toBe('cylinder');
    // 几何侧同样恒等: shape 缺省 = 'rect', 且角解算三件套照旧
    const g = nodeGeometry(box);
    expect(g.shape).toBe('rect');
    expect(g.details).toEqual([]);
    expect(g.textRect).toEqual({ x: 20, y: 30, w: 200, h: 56 });
    expect(g.d).toBe(nodeGeometry({ ...box, shape: 'rect' }).d);
  });

  it('菱形: 四顶点落在盒的四边中点 —— 几何 bbox 恒等于 rect(边路由 / 穿盒门禁 / auto-fit 全吃 rect)', () => {
    const r = { x: 10, y: 20, w: 200, h: 136 };
    const sharp = nodeGeometry({ ...r, shape: 'diamond', radius: 0 });
    expect(sharp.d).toContain('M 110.00 20.00'); // 上顶点
    expect(sharp.d).toContain('L 210.00 88.00'); // 右
    expect(sharp.d).toContain('L 110.00 156.00'); // 下
    expect(sharp.d).toContain('L 10.00 88.00'); // 左
    // 圆角版仍走 radiusPolygonPath 那套解算(切点全在盒内, 于是 bbox 不会被圆角顶出 rect 外)
    const rounded = nodeGeometry({ ...r, shape: 'diamond', radius: 10 });
    expect(rounded.corners).toHaveLength(4);
    expect(rounded.clamped).toEqual([]);
    for (const t of rounded.corners) {
      for (const p of [t.t1, t.t2]) {
        expect(p.x).toBeGreaterThanOrEqual(r.x);
        expect(p.x).toBeLessThanOrEqual(r.x + r.w);
        expect(p.y).toBeGreaterThanOrEqual(r.y);
        expect(p.y).toBeLessThanOrEqual(r.y + r.h);
      }
    }
  });

  it('菱形文字可用区 = 中央半宽 × 中央半高(面积只有盒的 1/4)—— 这是几何, 不是排版', () => {
    const r = { x: 10, y: 20, w: 200, h: 136 };
    expect(nodeTextArea('diamond', r)).toEqual({ x: 60, y: 54, w: 100, h: 68 });
    expect(nodeGeometry({ ...r, shape: 'diamond' }).textRect).toEqual(nodeTextArea('diamond', r));
    // 内接关系的自证: 文字区**四角**恰好落在菱形的两条边上(|x|/a + |y|/b = 1)
    const a = r.w / 2, b = r.h / 2;
    const area = nodeTextArea('diamond', r);
    const corner = { x: area.x - (r.x + a), y: area.y - (r.y + b) }; // 左上角, 相对菱心
    expect(Math.abs(corner.x) / a + Math.abs(corner.y) / b).toBeCloseTo(1, 12);
  });

  it('菱形与 label_fit 的口径: 门禁只量 rect(看不见斜边)→ 矩形口径的盒过门禁却装不下字', () => {
    const rectFit = nodeFit({ label: LABEL, sub: SUB });
    const diaFit = nodeFit({ label: LABEL, sub: SUB, shape: 'diamond' });
    // ① 门禁的漏报: 用矩形口径的盒当菱形盒 —— audit 全过, 而文字区只有盒的一半
    expect(fitDiags({ x: 0, y: 0, w: rectFit.w, h: rectFit.h })).toEqual([]);
    const tightArea = nodeTextArea('diamond', { x: 0, y: 0, w: rectFit.w, h: rectFit.h });
    expect(tightArea.w).toBeLessThan(rectFit.labelWidth + 2 * INSET); // 装不下(靠门禁是发现不了的)
    // ② 按形状给盒: 门禁照旧过, 且文字区真装得下两行
    expect(fitDiags({ x: 0, y: 0, w: diaFit.w, h: diaFit.h })).toEqual([]);
    const area = nodeTextArea('diamond', { x: 0, y: 0, w: diaFit.w, h: diaFit.h });
    expect(area.w).toBeGreaterThanOrEqual(rectFit.labelWidth + 2 * INSET);
    expect(area.h).toBeGreaterThanOrEqual(rectFit.contentH);
    // ③ 紧: 反解出来的盒不浪费 —— 盒宽正好 2× 矩形解(见下一条的紧解证明), 一个字都不多给
    expect(diaFit.w).toBe(Math.ceil(2 * (rectFit.labelWidth + 2 * INSET)));
  });

  it('×2 是内接约束的紧解: W/w + H/h = 1 恰好取等(文字块四角落在菱形边上), 两轴同比例', () => {
    const fit = nodeFit({ label: LABEL, sub: SUB, shape: 'diamond' });
    const W = fit.labelWidth + 2 * INSET;
    const H = fit.contentH + 2 * INSET;
    const outer = nodeOuterSize('diamond', W, H);
    expect(W / outer.w + H / outer.h).toBeCloseTo(1, 12); // 取等 = 紧
    expect(outer.w / outer.h).toBeCloseTo(W / H, 12); // 盒与文字块同宽高比(不是随手拉扁)
    // 取整后的盒只会更松(≤1), 不会更紧
    expect(W / fit.w + H / fit.h).toBeLessThanOrEqual(1);
    // 反向对照: 圆柱不吃宽(侧边是直的), 高度也恰好 ×2
    const cyl = nodeFit({ label: LABEL, sub: SUB, shape: 'cylinder' });
    const solid = nodeFit({ label: LABEL, sub: SUB });
    expect(cyl.w).toBe(solid.w);
    expect(cyl.h).toBe(Math.ceil(2 * (solid.contentH + 2 * INSET)));
  });

  it('圆柱: 上下两条半椭圆弧 + 两条侧边 + 一条只描不填的前缘弧', () => {
    const r = { x: 0, y: 0, w: 200, h: 136 };
    const g = nodeGeometry({ ...r, shape: 'cylinder' });
    const ry = r.h * CYLINDER_CAP_RATIO;
    expect(arcParams(g.d)).toEqual([[r.w / 2, ry], [r.w / 2, ry]]);
    expect(g.d.endsWith('Z')).toBe(true);
    expect(g.d).toContain(`L 200.00 ${136 - ry}`); // 右侧边
    expect(g.details).toHaveLength(1);
    expect(arcParams(g.details[0])).toEqual([[r.w / 2, ry]]);
    // 三条弧同起终点、前缘那条 sweep 取反(sweep=0 = 鼓向盒内)
    expect(g.d.startsWith('M 0.00 17.00 A 100.00 17.00 0 0 1')).toBe(true);
    expect(g.details[0].startsWith('M 0.00 17.00 A 100.00 17.00 0 0 0')).toBe(true);
    // 前缘弧是上屏的第二条 path, 且必须只描不填(实底变体下填了会把前缘糊掉)
    const [outline, rim] = pathsOf(nodeShape({ ...r, label: LABEL, shape: 'cylinder', variant: 'solid' }));
    expect(outline.attrs?.fill).not.toBe('none'); // 轮廓吃主题的 fill(这里是实底色)
    expect(rim.attrs?.['fill']).toBe('none');
    expect(rim.attrs?.stroke).toBe(outline.attrs?.stroke);
  });

  it('圆柱顶弧净空有数: 文字区上沿 = 前缘弧的最低点(盒顶下 2·ry), 缺省下文字带恰是中央一半', () => {
    const r = { x: 0, y: 0, w: 200, h: 136 };
    const g = nodeGeometry({ ...r, shape: 'cylinder' });
    const ry = g.capRadius;
    expect(ry).toBeCloseTo(r.h * CYLINDER_CAP_RATIO, 12);
    // 前缘弧的最高/最低点: 椭圆心下 ry(经 cx 处) —— 用弧参数与盒顶核算净空
    expect(g.textRect.y - r.y).toBeCloseTo(2 * ry, 12);
    expect(r.y + r.h - (g.textRect.y + g.textRect.h)).toBeCloseTo(2 * ry, 12);
    expect(g.textRect.h).toBeCloseTo(r.h - 4 * ry, 12);
    // 缺省比例下 4·ry = h/2 → 文字带 = 盒的中央一半(与菱形同一条口径)
    expect(g.textRect.h).toBeCloseTo(r.h / 2, 12);
  });

  it('圆柱盖高: 作者值直接生效 / 超上限被钳并报一声 / 负值与 NaN 当场抛', () => {
    const r = { x: 0, y: 0, w: 100, h: 40 };
    expect(nodeGeometry({ ...r, shape: 'cylinder', capRadius: 5 }).capRadius).toBe(5);
    expect(nodeGeometry({ ...r, shape: 'cylinder', capRadius: 5 }).capClamped).toBe(false);
    const clamped = nodeGeometry({ ...r, shape: 'cylinder', capRadius: 30 });
    expect(clamped.capRadius).toBe(20); // 上限 h/2
    expect(clamped.capClamped).toBe(true);
    expect(clamped.textRect.h).toBe(0); // 盖吃满 = 没有文字位(不是负数)
    // 盖高覆盖后文字区跟着挪 —— 盒高要自己补回来, nodeFit 给了同一条口径
    const fit = nodeFit({ label: LABEL, sub: SUB, shape: 'cylinder', capRadius: 20 });
    expect(fit.h).toBe(Math.ceil(fit.contentH + 2 * INSET + 4 * 20));
    const err = (v: number) => {
      try { nodeGeometry({ ...r, shape: 'cylinder', capRadius: v }); } catch (e) { return e as ShapeInputError; }
      throw new Error('本该抛 ShapeInputError');
    };
    expect(err(-1).field).toBe('capRadius');
    expect(err(-1).message).toContain('为负');
    expect(err(Number.NaN).field).toBe('capRadius');
  });

  it('形状词表守卫: 写错的形状词当场抛, 不静默回落成矩形(三个入口各自守一道)', () => {
    const box: NodeProps = { x: 0, y: 0, w: 100, h: 40, label: 'x' };
    for (const [owner, fn] of [
      ['nodeShape', () => nodeShape({ ...box, shape: 'diamon' as never })],
      ['nodeGeometry', () => nodeGeometry({ ...box, shape: 'diamon' as never })],
      ['nodeFit', () => nodeFit({ label: 'x', shape: 'diamon' as never })],
    ] as const) {
      try {
        fn();
        throw new Error(`${owner}: 本该抛 ShapeInputError`);
      } catch (e) {
        expect(e).toBeInstanceOf(ShapeInputError);
        expect((e as ShapeInputError).shape).toBe(owner);
        expect((e as ShapeInputError).field).toBe('shape');
        expect((e as ShapeInputError).message).toContain(NODE_SHAPE_KINDS.join(' / '));
      }
    }
    expect(() => nodeShape(box)).not.toThrow(); // 没写 = 走缺省, 不算错
    expect(NODE_SHAPE_KINDS).toEqual(['rect', 'diamond', 'cylinder']);
  });

  it('退化盒不出 NaN: 零尺寸 / 极扁的菱形与圆柱照样写出有限坐标(finite_svg 的源头守在这里)', () => {
    const cases: NodeProps[] = [
      { x: 0, y: 0, w: 0, h: 0, shape: 'diamond', label: 'x' },
      { x: 0, y: 0, w: 0, h: 0, shape: 'cylinder', label: 'x' },
      { x: 5, y: 5, w: 400, h: 8, shape: 'diamond', label: 'x' }, // 极扁: 顶点角趋 0, 圆角必被钳
      { x: 5, y: 5, w: 8, h: 400, shape: 'cylinder', label: 'x' },
    ];
    for (const c of cases) {
      const svg = toSVG(svgRoot(500, 500, [nodeShape(c)], { 'font-family': 'x' }));
      expect(svg).not.toContain('NaN');
      expect(Number.isFinite(nodeGeometry(c).textRect.h)).toBe(true);
    }
  });

  it('文本段与形状无关: 三种形态的 label / sub 坐标、字号、字重完全一致(形状只换 d)', () => {
    const box = { x: 30, y: 40, w: 240, h: 120, label: LABEL, sub: SUB };
    const strip = (p: NodeProps) => textsOf(nodeShape(p)).map((t) => ({ ...t, attrs: { ...t.attrs } }));
    const rect = strip({ ...box, shape: 'rect' });
    expect(strip({ ...box, shape: 'diamond' })).toEqual(rect);
    expect(strip({ ...box, shape: 'cylinder' })).toEqual(rect);
    // 两行仍在盒中心对称(与 nodeShape 的老口径一字不差)
    expect(rect.map((t) => t.content)).toEqual([LABEL, SUB]);
    expect(rect[0].attrs?.['font-weight']).toBe(600);
    expect(rect[1].attrs?.['font-size'] as number).toBeLessThan(rect[0].attrs?.['font-size'] as number);
  });
});
