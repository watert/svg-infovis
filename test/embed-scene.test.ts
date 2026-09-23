// =====================================================================
// shapes/embed · 素材怎么进图(嵌套 `<svg>` / markup 原样 / z 序在底)
//
// 四条判据, 每条钉一个容易悄悄坏掉的地方:
//   ① **markup 逐字未变** —— 素材内部被重新缩进 / 插换行, 图上看不出但文字会偏一格
//      (拿真样本的 `<text …>Q1</text>` 整行做证: 它在产物里必须**连成一行**)
//   ② **z 序**: 素材在节点 / 边之前(它是底板, 压住节点就没法看了)
//   ③ **渲染面 = 审计面**: `contentBounds` / `fit` / `translateScene` / `single_svg` 都要认它
//      (少了任何一处, 素材就会被 auto-fit 裁掉或越界放行 —— 缺一块的图没人看得出)
//   ④ **真样本走完全链**: `embedAsset → scene → tryExport` 出来仍是 `clipPath` / `url(#…)` 完好的图
//
// 真样本 = `assets/embeds/echarts-line.svg`(压力样本: `<g clip-path>` + `<defs><clipPath>` +
// `matrix(…)` + 内联 `<text>`)。示例场景判据也在这里(示例只负责展示, 判据归 test)。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type DEmbed, svg as svgRoot } from '../src/descriptor';
import { embedAsset } from '../src/embed/svg-asset';
import { embedShape } from '../src/shapes/embed';
import { serialize, toSVG } from '../src/serialize';
import { ShapeInputError } from '../src/guard';
import { audit, type Scene } from '../src/knives/audit';
import { describeScene } from '../src/knives/describe';
import { contentBounds, fitScene, sceneChildren, translateScene, tryExport } from '../src/export';
import { routeOrthogonal } from '../src/knives/route';
import { scene as galleryScene } from '../examples/gallery/embed-panel';

/** 真样本(echarts SSR 产物): 420×260, 内部有 clipPath / matrix / 内联文字 */
const LINE_SVG = readFileSync(fileURLToPath(new URL('../assets/embeds/echarts-line.svg', import.meta.url)), 'utf8');
const asset = embedAsset(LINE_SVG, { name: 'chart' });

const RECT = { x: 100, y: 80, w: 456, h: 282 };

const asEmbed = (d: unknown): DEmbed => {
  if (!d || (d as DEmbed).kind !== 'embed') throw new Error('期望 embed descriptor');
  return d as DEmbed;
};

const throws = (fn: () => unknown): ShapeInputError => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ShapeInputError);
    return e as ShapeInputError;
  }
  throw new Error('本该抛 ShapeInputError, 却没有');
};

/** 素材占一块地方, 四周再摆两个节点 + 一条边 —— 够用来看 z 序与包围盒 */
const sceneWith = (embedRect = RECT): Scene => {
  const a = { x: 100, y: 420, w: 160, h: 48 };
  const b = { x: 380, y: 420, w: 160, h: 48 };
  const r = routeOrthogonal({ from: a, fromPort: { side: 'right' }, to: b, toPort: { side: 'left' } });
  return {
    width: 800, height: 600,
    nodes: [{ id: 'a', rect: a, label: 'A' }, { id: 'b', rect: b, label: 'B' }],
    edges: [{ id: 'e', from: 'a', to: 'b', points: r.points }],
    embeds: [{ id: 'chart', rect: embedRect, asset }],
  };
};

describe('shapes/embed · 嵌套 svg / markup / z 序 / 全链', () => {
  // --- ① descriptor 与序列化 ------------------------------------------
  it('embedShape 吐一个嵌套 <svg>: 位置尺寸 + 素材自己的 viewBox + 固定的 contain 策略', () => {
    const d = asEmbed(embedShape({ ...RECT, asset }));
    expect(d.viewBox).toEqual({ x: 0, y: 0, w: 420, h: 260 });
    expect(d.attrs?.['data-shape']).toBe('embed');
    const out = serialize(d);
    expect(out.startsWith(
      '<svg x="100.00" y="80.00" width="456.00" height="282.00" viewBox="0.00 0.00 420.00 260.00" preserveAspectRatio="xMidYMid meet" data-shape="embed">',
    )).toBe(true);
    expect(out.endsWith('</svg>')).toBe(true);
  });

  it('opacity 写在嵌套 <svg> 上(不写就没有这一位; 数值照全仓规矩过 round1)', () => {
    expect(asEmbed(embedShape({ ...RECT, asset, opacity: 0.4 })).attrs?.opacity).toBe(0.4);
    expect('opacity' in (asEmbed(embedShape({ ...RECT, asset })).attrs ?? {})).toBe(false);
    expect(serialize(asEmbed(embedShape({ ...RECT, asset, opacity: 0.4 })))).toContain(' opacity="0.4"');
  });

  it('markup **逐字**进产物: 内联 `<text>` 整行连成一行, 没有为了好看的缩进 / 换行', () => {
    const out = serialize(asEmbed(embedShape({ ...RECT, asset })));
    expect(out).toContain(
      '<text dominant-baseline="central" text-anchor="middle" style="font-size:11px;font-family:sans-serif;" y="5.5" transform="translate(44 236)" fill="#6E7079">Q1</text>',
    );
    // 素材内部不许出现"文字被折进第二行"的形状(那会把居中标签推偏一格)
    expect(out).not.toMatch(/<text[^>]*>[^<]*\n[^<]*<\/text>/);
    // 内部标记整体原样(加的只有外面那对 `<svg>` 与它的属性)
    expect(out).toContain(asset.markup);
  });

  it('完整文档里同一条: 嵌套 <svg> 落在宿主 <svg> 之内, 且 clipPath 与引用都还活着', () => {
    const doc = toSVG(svgRoot(800, 600, sceneChildren(sceneWith())), { declaration: false });
    expect(doc).toContain(' preserveAspectRatio="xMidYMid meet"');
    expect(doc).toContain('<clipPath id="chart-zr1-c0">');
    expect(doc).toContain('clip-path="url(#chart-zr1-c0)"');
    expect(doc).toContain('transform="matrix(3,0,0,3,44,146.4)"');
  });

  it('入口守卫: w/h 必须为正 / asset 必须是素材 / viewBox 必须是有限数(坏数会写出 NaN 而门禁扫不到)', () => {
    expect(throws(() => embedShape({ ...RECT, w: 0, asset })).field).toBe('w');
    expect(throws(() => embedShape({ ...RECT, h: 0, asset })).field).toBe('h');
    expect(throws(() => embedShape({ ...RECT, w: NaN, asset })).shape).toBe('embedShape');
    expect(throws(() => embedShape({ ...RECT, asset: undefined as never })).field).toBe('asset');
    expect(throws(() => embedShape({ ...RECT, asset: '<svg/>' as never })).field).toBe('asset');
    expect(throws(() => embedShape({ ...RECT, asset: { ...asset, viewBox: { x: NaN, y: 0, w: 1, h: 1 } } })).shape).toBe('embedShape');
  });

  // --- ② z 序 ----------------------------------------------------------
  it('z 序: 素材画在画布/网格之后、组框与节点之前(底板不许压住节点)', () => {
    const children = sceneChildren(sceneWith());
    const embedAt = children.findIndex((c) => c.kind === 'embed');
    const nodeAts = children.flatMap((c, i) => (c.kind === 'group' && c.attrs?.['data-shape'] === 'node' ? [i] : []));
    const edgeAt = children.findIndex((c) => c.kind === 'group' && c.attrs?.['data-shape'] === 'edge');
    expect(embedAt).toBeGreaterThan(0); // 0 是画布底
    expect(nodeAts.length).toBe(2);
    expect(embedAt).toBeLessThan(Math.min(...nodeAts));
    expect(embedAt).toBeLessThan(edgeAt);
  });

  // --- ③ 渲染面 = 审计面 -----------------------------------------------
  it('contentBounds / fit 把素材一起算进去(auto-fit 不许裁掉它)', () => {
    const scene = sceneWith({ x: -50, y: -40, w: 456, h: 282 });
    const b = contentBounds(scene);
    expect(b).not.toBeNull();
    expect(b!.x).toBeLessThanOrEqual(-51);
    expect(b!.y).toBeLessThanOrEqual(-41);
    expect(b!.w).toBeGreaterThan(506); // 内容右缘 = max(540, 406…) 之一, 光节点算不出这个宽
    // fit 是"先平移再审": 平移量 = padding − 内容原点, 素材跟着走
    const fitted = fitScene(scene, { padding: 10 });
    const moved = fitted.embeds![0].rect;
    expect(moved.x).toBe(10 + 1); // bleed 缺省 1 ⇒ 内容原点落在 padding − bleed
    expect(moved.y).toBe(10 + 1);
    expect(moved.w).toBe(456);
  });

  it('translateScene 一起挪(素材的 rect 是它唯一的几何)', () => {
    const moved = translateScene(sceneWith(), 25, -15).embeds![0];
    expect(moved.rect).toEqual({ x: 125, y: 65, w: 456, h: 282 });
    expect(moved.asset).toBe(asset); // 素材本体不动(纯数据, 只搬坐标)
  });

  it('`single_svg` 认它: 素材越出画布照样报(它是画布内的元素, 没有越界特权)', () => {
    const ok = audit(sceneWith(), { level: 'showcase' });
    expect(ok.diagnostics.filter((d) => d.code === 'single_svg')).toEqual([]);
    const out = audit(sceneWith({ x: 700, y: 80, w: 456, h: 282 }), { level: 'showcase' });
    const svg = out.diagnostics.find((d) => d.code === 'single_svg');
    expect(svg).toBeDefined();
    expect(svg!.evidence.offenders).toContain('embed:chart');
  });

  it('素材不进任何净空门禁: 边从它身上穿过去, 门禁一声不响(这条缺口登记在 ROADMAP.md「后续方向」)', () => {
    // 把素材摆到那条边的正下方 —— 边横穿它, 仍必须 0 error(素材不在净空判据的适用面里)
    const crossing: Scene = { ...sceneWith(), embeds: [{ id: 'chart', rect: { x: 240, y: 420, w: 300, h: 48 }, asset }] };
    const r = audit(crossing, { level: 'showcase' });
    expect(r.pass).toBe(true);
    expect(r.diagnostics.filter((d) => d.code === 'edge_node_clearance')).toEqual([]);
  });

  // --- ④ 读数板与全链 --------------------------------------------------
  it('describeScene 列出它: rect + R/B / 素材名 / viewBox / markup 字节数 / 构建期丢掉的东西', () => {
    const text = describeScene(sceneWith());
    expect(text).toContain('## embeds (1)');
    expect(text).toContain('chart  rect x    100 y     80 w    456 h    282');
    expect(text).toContain('R    556 B    362');
    expect(text).toContain('asset=chart');
    expect(text).toContain('viewBox 0 0 420 260');
    expect(text).toContain(`markup ${Buffer.byteLength(asset.markup)}B`);
    expect(text).toContain('构建期有意丢掉 1 项');
    // 没有素材的场景照旧给一节"(无)", 且不填"丢掉 0 项"这种废话
    expect(describeScene({ width: 100, height: 100, nodes: [], edges: [] })).toContain('## embeds (0)');
    expect(describeScene({ width: 100, height: 100, nodes: [], edges: [] })).not.toContain('构建期有意丢掉');
  });

  it('全链: 真样本 → scene → tryExport 出图, 门禁过且产物里 clipPath / url(#) 完好', () => {
    const { svg, report, draft } = tryExport(sceneWith(), { level: 'showcase', fit: true });
    expect(report.pass).toBe(true);
    expect(draft).toBe(false);
    expect(svg).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(svg).toContain('<clipPath id="chart-zr1-c0">');
    expect(svg).toContain('clip-path="url(#chart-zr1-c0)"');
    expect(svg).not.toContain('NaN');
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
  });

  // --- 示例场景(数据只有一份: 示例具名导出, 判据在这里) -------------------
  it('示例 `examples/gallery/embed-panel.ts` 在 showcase 档零 error 出厂', () => {
    // ⚠ 示例的 scene 宽高是 0(交给 `fit` 按内容重定) —— 审计必须吃 **fit 之后**那份,
    // 否则量的是 0×0 的画布(与出口同一个次序: 先 fit 再审)
    const { report, draft } = tryExport(galleryScene, { level: 'showcase', fit: { padding: 48 } });
    expect(report.metrics.errors).toBe(0);
    expect(report.pass).toBe(true);
    expect(draft).toBe(false);
    // 已知缺口: 面板里最大的占位是素材, 而素材不进 cluster/density 的度量 ⇒ 空走廊是**假信号**
    expect(report.diagnostics.map((d) => d.code)).toEqual(['cluster_corridor']);
  });
});
