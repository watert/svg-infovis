// =====================================================================
// semantic-slots · `shape` 与 `edge.tone` 进 scene(语义槽最后一公里, 260919)
//
// 两条症状完全同族("作者写了却不上屏"第五、六次):
//   · `SceneNode` 没有 `shape` → 菱形 / 圆柱只能靠 `nodeStyles[id].shape` 逃生口进图,
//     于是"作者在数据表里声明形状"的写法里, 形状是死数据(与 `tone` 当年一模一样);
//   · `SceneEdge` 没有 `tone` → `edgeShape` 只认 `color`, 复刻脚本里的 `edgeStyles: { tone }`
//     同样是死数据(实测 `refs/build-arch-v2.ts` 的 violet 虚线边画出来还是灰的)。
//
// 口径与 `SceneNode.tone` 一致: 形状 / 肤色是**语义**(这一格在图上是什么角色), 不是可派生的
// 几何量 —— 语义进 scene, 覆盖表退到逐 id 逃生口(优先级更高)。本文件钉四件事:
//   ① 能力: 数据表里写的 shape / tone **真上屏**(几何或色值确实变了)
//   ② 反面: 缺省不给 → 与"覆盖表显式给缺省值"逐字节相同(新路径的缺省落在旧路径同一点上)
//   ③ 覆盖优先级: `nodeStyles` / `edgeStyles` 显式给值就赢; 表里没表态(undefined)不算覆盖
//   ④ 端到端: 产物 SVG 里能直接读到形态标与色值(不看描述符, 看真产出的字符串)
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { type Scene } from '../src/knives/audit';
import { exportScene, sceneChildren } from '../src/export';
import { THEMES } from '../src/theme';
import type { DGroup, Descriptor } from '../src/descriptor';

const T = THEMES.light.tones;

/** 某一类元素(data-shape)的 group 描述符 —— 断言直接读描述符, 不去整串 SVG 里猜 */
const groupEls = (children: Descriptor[], shape: string): DGroup[] =>
  children.filter((d): d is DGroup => d.kind === 'group' && d.attrs?.['data-shape'] === shape);

/** group 里的第一条 path(节点的壳 / 边的线都是它) */
const firstPath = (el: DGroup) => {
  const p = el.children.find((c) => c.kind === 'path');
  if (!p || p.kind !== 'path') throw new Error('第一个 child 应当是 path');
  return p;
};

const edgeStrokes = (children: Descriptor[]): unknown[] => groupEls(children, 'edge').map((el) => firstPath(el).attrs?.stroke);

/** 菱形 + 圆柱各一个(盒尺寸相同, 便于与"矩形同盒"的路径逐字符比对) */
const SHAPED: Scene = {
  width: 420, height: 200,
  nodes: [
    { id: 'd', rect: { x: 40, y: 60, w: 120, h: 60 }, label: '判定', shape: 'diamond' },
    { id: 'c', rect: { x: 240, y: 60, w: 120, h: 60 }, label: '存储', shape: 'cylinder' },
  ],
  edges: [],
};

/** 两条同长水平边: 上面那条点 violet, 下面那条不表态(缺省应仍是主题中性线色) */
const TONED_EDGES: Scene = {
  width: 300, height: 200, nodes: [],
  edges: [
    { id: 'e1', points: [{ x: 40, y: 60 }, { x: 260, y: 60 }], tone: 'violet' },
    { id: 'e2', points: [{ x: 40, y: 120 }, { x: 260, y: 120 }] },
  ],
};

describe('semantic-slots · shape 与 edge.tone 从 scene 上屏, 覆盖表仍是逃生口', () => {
  it('① SceneNode.shape 上屏: 数据表里写的 diamond / cylinder 真出对应形态', () => {
    const [d, c] = groupEls(sceneChildren(SHAPED), 'node');
    expect(d.attrs?.['data-form']).toBe('diamond');
    expect(c.attrs?.['data-form']).toBe('cylinder');
    // `rect` 是缺省形态: 不给那属性(多一个属性就多一处字节扰动), 所以它只靠几何区分
    const [r] = groupEls(sceneChildren({ ...SHAPED, nodes: [{ id: 'r', rect: { x: 40, y: 60, w: 120, h: 60 }, label: '判定' }] }), 'node');
    expect(r.attrs?.['data-form']).toBeUndefined();
    // 几何确实变了, 不是只挂了一条属性: 同盒的菱形路径与矩形路径不是同一条
    const sameBox = groupEls(sceneChildren({ ...SHAPED, nodes: [{ id: 'r', rect: { x: 40, y: 60, w: 120, h: 60 }, label: '判定' }] }), 'node');
    expect(firstPath(d).d).not.toBe(firstPath(sameBox[0]).d);
  });

  it('③ 覆盖优先级: scene.shape 是缺省, nodeStyles[id].shape 顶掉它; 未表态不算覆盖', () => {
    const byTable = groupEls(sceneChildren(SHAPED, { nodeStyles: { d: { shape: 'cylinder' } } }), 'node');
    expect(byTable[0].attrs?.['data-form']).toBe('cylinder'); // d 在 scene 里是 diamond, 被覆盖表改成圆柱
    expect(byTable[1].attrs?.['data-form']).toBe('cylinder'); // 覆盖只动被点名的那一格
    // 表里没表态(`shape: undefined`)不算覆盖 —— 不许把 scene 的形状抹回缺省 rect
    const vague = groupEls(sceneChildren(SHAPED, { nodeStyles: { d: { shape: undefined } } }), 'node');
    expect(vague[0].attrs?.['data-form']).toBe('diamond');
  });

  it('② 缺省落位: scene 不给 shape 与"覆盖表显式给 rect"逐字节相同', () => {
    const bare: Scene = { width: 300, height: 160, nodes: [{ id: 'n', rect: { x: 40, y: 50, w: 120, h: 50 }, label: 'A' }], edges: [] };
    const explicit = exportScene(bare, { skipAudit: true, nodeStyles: { n: { shape: 'rect' } } }).svg;
    expect(explicit).toBe(exportScene(bare, { skipAudit: true }).svg);
  });

  it('① SceneEdge.tone 上屏: 点 violet 的那条出 violet 线, 不表态的仍是主题中性线色', () => {
    const [e1, e2] = edgeStrokes(sceneChildren(TONED_EDGES));
    expect(e1).toBe(T.violet.border);
    // 缺省走 `theme.edge` 而不是 slate.border —— 既有产物的默认线色一个字节都不许变
    expect(e2).toBe(THEMES.light.edge);
  });

  it('③ 覆盖优先级: edgeStyles[id].tone 顶掉 scene.tone; 未表态不算覆盖; `color` 仍最高优先', () => {
    const byTable = edgeStrokes(sceneChildren(TONED_EDGES, { edgeStyles: { e1: { tone: 'rose' } } }));
    expect(byTable[0]).toBe(T.rose.border);
    expect(byTable[1]).toBe(THEMES.light.edge);
    const vague = edgeStrokes(sceneChildren(TONED_EDGES, { edgeStyles: { e1: { tone: undefined } } }));
    expect(vague[0]).toBe(T.violet.border);
    // 单点样式例外(违规红)照旧压过语义槽
    const forced = edgeStrokes(sceneChildren(TONED_EDGES, { edgeStyles: { e1: { color: '#dc2626' } } }));
    expect(forced[0]).toBe('#dc2626');
  });

  it('④ 端到端: 两份 scene 都过 audit 并出图, 产物里直接读得到形态标与 violet 色值', () => {
    const shapes = exportScene(SHAPED);
    expect(shapes.report.pass).toBe(true); // 语义槽不该把门禁搅乱
    expect(shapes.svg).toContain('data-form="diamond"');
    expect(shapes.svg).toContain('data-form="cylinder"');
    const edges = exportScene(TONED_EDGES);
    expect(edges.report.pass).toBe(true);
    expect(edges.svg).toContain(T.violet.border);
    expect(edges.svg).toContain(THEMES.light.edge); // 中性那条仍在
  });
});
