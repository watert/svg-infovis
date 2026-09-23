// =====================================================================
// scene-render-parity · 审计面 = 渲染面(③ 号结构约束)
//
// 260917 之前 `exportScene` 的 children 只有 canvas/groups/nodes/edges —— `Scene.labels` 与
// `Scene.texts` **根本不上屏**, 而 audit 在逐条审它们(给幽灵判定); 边标签更阴: 上屏位置由
// `edgeShape` 现算 `labelAnchor`, 审计读的却是 `SceneLabel.at` —— 两个来源。同族三次事故
// (NaN 静默丢元素 / fit 与审计不同源 / labels·texts 不上屏)的病根都是同一件事:
// **渲染面不是 scene 的满射**。修法不是第三处补丁, 而是把渲染面收成 `sceneChildren` 唯一一份。
//
// 本文件钉住四件事(每条都是"把 bug 放回去会红"):
//   ① 有内容的标签/文本**必须上屏**; 没内容的(占位)不上屏但要在 metrics 里可见
//   ② 渲染矩形 = 审计矩形(同一份 width/height, 不是两处各算一遍)
//   ③ 边标签只有一条上屏路径 —— `SceneEdge.label` 不再自己画(双源当场消灭)
//   ④ 端到端: exportScene 的产物里真能看到这些话
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { type Scene, type SceneEdge, audit, labelRect } from '../src/knives/audit';
import { exportScene, sceneChildren } from '../src/export';
import { edgeLabel, labelAnchor, labelBoxSize } from '../src/shapes/edge';
import type { Descriptor } from '../src/descriptor';

/** 展平 descriptor 树, 便于按 data-shape / kind 找元素 */
const flat = (ds: Descriptor[]): Descriptor[] => ds.flatMap((d) => (d.kind === 'group' ? [d, ...flat(d.children)] : [d]));
const byShape = (ds: Descriptor[], shape: string) =>
  ds.filter((d): d is Extract<Descriptor, { kind: 'group' }> => d.kind === 'group' && d.attrs?.['data-shape'] === shape);

const edge: SceneEdge = {
  id: 'e',
  from: 'a',
  to: 'b',
  // 折线中点落在 (200,150) 那段水平线上
  points: [{ x: 100, y: 70 }, { x: 100, y: 150 }, { x: 300, y: 150 }, { x: 300, y: 230 }],
  label: '只该当语义用的标签',
};

const scene: Scene = {
  width: 400, height: 320,
  nodes: [
    { id: 'a', rect: { x: 40, y: 20, w: 120, h: 50 } },
    { id: 'b', rect: { x: 240, y: 230, w: 120, h: 50 } },
  ],
  edges: [edge],
  labels: [
    edgeLabel(edge, 'route'),
    // 幽灵: 有位置没文字 —— 旧实现里它照样参与净空审计, 却永远不上屏
    { id: 'ghost', at: { x: 200, y: 290 }, width: 40, height: 19 },
  ],
  texts: [{ id: 'note', rect: { x: 20, y: 280, w: 80, h: 16 }, text: '旁注', fontSize: 11 }],
};

describe('scene-render-parity · 审计面必须是渲染面的满射', () => {
  it('edgeLabel: 位置与 labelAnchor 同源(构建期落位), 外层尺寸含内边距', () => {
    const l = edgeLabel(edge, 'route');
    expect(l.at).toEqual(labelAnchor(edge.points, 0)); // 同一把尺子, 渲染期不再现算
    expect(l.ownerEdge).toBe('e');
    expect(l.text).toBe('route');
    expect(l.width).toBeGreaterThan(0);
    // 高 = 行块并集 + 2 × padY(缺省 4) —— 260923 起与 `labelBoxSize` 同源, 不再写死 `11 + 8`
    expect(l.height).toBe(labelBoxSize('route').height);
    // dy 走法线偏移: 竖直段(第一段)上偏移的是 x
    const off = edgeLabel(edge, 'route', { dy: 6 });
    expect(off.at.x).toBe(l.at.x);
    expect(off.at.y).toBe(l.at.y + 6);
  });

  it('标签与旁注**上屏**, 幽灵不上屏但计数在 metrics 里(差集必须可见)', () => {
    const kids = flat(sceneChildren(scene));
    const boxes = byShape(kids, 'label-box');
    expect(boxes).toHaveLength(1); // 只有带 text 的那条 label 上屏
    expect(kids.filter((d) => d.kind === 'text').map((d) => d.content)).toEqual(['route', '旁注']);

    const r = audit(scene);
    expect(r.metrics.phantom_labels).toBe(1); // ghost
    expect(r.metrics.phantom_texts).toBe(0);
    // 幽灵仍进审计的几何口径(它有位置) —— 但作者从 metrics 一眼看得见它没上屏
    expect(r.metrics.labels).toBe(2);
  });

  it('渲染矩形 = 审计矩形(逐像素): 遮罩片就是 labelRect, 不是"另一个来源"', () => {
    const l = edgeLabel(edge, 'route');
    const chip = byShape(flat(sceneChildren(scene)), 'label-box')[0].children.find((c) => c.kind === 'rect');
    // 审计的检测矩形(缩窄到 rect 分支, 便于直接比 x/y/w/h)
    if (!chip || chip.kind !== 'rect') throw new Error('label-box 的第一个 child 应当是 rect');
    expect({ x: chip.x, y: chip.y, w: chip.w, h: chip.h }).toEqual(labelRect(l));
  });

  it('双源消灭: SceneEdge.label 不再自己上屏(旧实现会多画一条现算位置的标签)', () => {
    const contents = flat(sceneChildren(scene)).filter((d) => d.kind === 'text').map((d) => d.content);
    expect(contents).not.toContain(edge.label);
    // 反证: 去掉 scene.labels, 只剩边的 label 字段 → 一个文字都不该出现
    const bare = flat(sceneChildren({ ...scene, labels: [], texts: [] })).filter((d) => d.kind === 'text');
    expect(bare).toEqual([]);
  });

  it('端到端: exportScene 的产物里真能看到标签与旁注, 且产物无 NaN', () => {
    const { svg } = exportScene(scene, { level: 'showcase', fit: true });
    expect(svg).toContain('>route<');
    expect(svg).toContain('>旁注<');
    expect(svg).not.toContain('只该当语义用的标签');
    expect(svg).not.toContain('NaN');
  });
});
