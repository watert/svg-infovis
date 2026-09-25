// =====================================================================
// semantic-slots · `shape` / `edge.tone` / **标签字色**进 scene(语义槽最后一公里, 260919 → 260925)
//
// 三条症状完全同族("作者写了却不上屏"第五、六、七次):
//   · `SceneNode` 没有 `shape` → 菱形 / 圆柱只能靠 `nodeStyles[id].shape` 逃生口进图,
//     于是"作者在数据表里声明形状"的写法里, 形状是死数据(与 `tone` 当年一模一样);
//   · `SceneEdge` 没有 `tone` → `edgeShape` 只认 `color`, 复刻脚本里的 `edgeStyles: { tone }`
//     同样是死数据(实测 `refs/build-arch-v2.ts` 的 violet 虚线边画出来还是灰的);
//   · `SceneLabel` 没有 `tone` → 边有肤色而标签的字永远是中性灰, 于是"这块标签属于哪一族"
//     只能靠逐条 `labelBoxShape` 手塞色值(260925 补上: `edgeLabel` 构建期烘焙, 出口按文字槽取色)。
//
// 口径与 `SceneNode.tone` 一致: 形状 / 肤色是**语义**(这一格在图上是什么角色), 不是可派生的
// 几何量 —— 语义进 scene, 覆盖表退到逐 id 逃生口(优先级更高)。本文件钉五件事:
//   ① 能力: 数据表里写的 shape / tone **真上屏**(几何或色值确实变了)
//   ② 反面: 缺省不给 → 与"覆盖表显式给缺省值"逐字节相同(新路径的缺省落在旧路径同一点上)
//   ③ 覆盖优先级: `nodeStyles` / `edgeStyles` 显式给值就赢; 表里没表态(undefined)不算覆盖
//   ④ 端到端: 产物 SVG 里能直接读到形态标与色值(不看描述符, 看真产出的字符串)
//   ⑤ 标签: 遮罩缺省隐形(画布色)/ chip 仍显形 / 字色随 `tone` 走**文字槽** —— 三条各自钉死
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { type Scene } from '../src/knives/audit';
import { exportScene, sceneChildren } from '../src/export';
import { THEMES } from '../src/theme';
import { edgeLabel } from '../src/shapes/edge';
import { labelChip } from '../src/shapes/text';
import { measureText } from '../src/knives/measure';
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

describe('semantic-slots · shape / tone / 标签字色从 scene 上屏, 覆盖表仍是逃生口', () => {
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

  // --- 260925: 遮罩隐形 + 标签字色跟随 tone(标签这一族的语义槽) ---------

  /** label-box 那块遮罩矩形 / 那行文字 —— 直接读描述符, 不去整串 SVG 里猜 */
  const labelBox = (children: Descriptor[]) => {
    const el = groupEls(children, 'label-box')[0];
    if (!el) throw new Error('scene 里没有 label-box');
    const r = el.children.find((c) => c.kind === 'rect');
    const t = el.children.find((c) => c.kind === 'text');
    if (!r || r.kind !== 'rect' || !t || t.kind !== 'text') throw new Error('label-box 应当是 rect + text');
    return { mask: r.attrs?.fill, textFill: t.attrs?.fill };
  };

  /** 一条 violet 的边 + 它自己那条标签(标签要不要跟色, 由用例决定) */
  const labelScene = (o: { tone?: boolean } = {}): Scene => {
    const points = [{ x: 40, y: 60 }, { x: 260, y: 60 }];
    const tone = o.tone ? ('violet' as const) : undefined;
    return {
      width: 300, height: 160, nodes: [],
      edges: [{ id: 'e', points, tone }],
      labels: [edgeLabel({ id: 'e', points, ...(tone ? { tone } : {}) }, 'Flown By')],
    };
  };

  it('① 遮罩默认隐形: 缺省底色 = 画布色(只剩"切断穿过的线"), 显式 `bg` 才显形', () => {
    expect(labelBox(sceneChildren(labelScene())).mask).toBe(THEMES.light.canvas);
    const explicit = labelScene();
    explicit.labels![0].bg = '#fef3c7'; // 出口的逃生口: 显式底色照旧最高
    expect(labelBox(sceneChildren(explicit)).mask).toBe('#fef3c7');
  });

  it('② chip 是**徽章**语义: `labelChip` 的缺省底色仍是 `theme.labelBg`(遮罩改色不许带上它)', () => {
    // 深色主题: `canvas` 与 `labelBg` 是两个色, 所以"补没补回 labelBg"在断言里分得清
    const chip = labelChip({ x: 60, y: 40, content: 'v1', width: measureText('v1', { fontSize: 11 }).width, theme: THEMES.dark });
    expect(labelBox([chip]).mask).toBe(THEMES.dark.labelBg);
    expect(THEMES.dark.labelBg).not.toBe(THEMES.dark.canvas);
  });

  it('③ tone 走**文字槽**: 字色取 `tones[tone].text`(不是边线那个 border); `color` 最高; 无 tone 仍 `theme.label`', () => {
    const toned = labelBox(sceneChildren(labelScene({ tone: true })));
    expect(toned.textFill).toBe(T.violet.text);
    expect(toned.textFill).not.toBe(T.violet.border); // 浅色系 border 当字色看不清 —— 各吃各槽
    // 旧标签(无 tone/bg/color)字色一个字节都不变, 只有遮罩底色换了
    expect(labelBox(sceneChildren(labelScene())).textFill).toBe(THEMES.light.label);
    const forced = labelScene({ tone: true });
    forced.labels![0].color = '#dc2626';
    expect(labelBox(sceneChildren(forced)).textFill).toBe('#dc2626');
  });

  it('④ `edgeLabel` 构建期烘焙 tone: 边带 tone 则继承, options 顶掉, 都没表态就不写该字段', () => {
    const points = [{ x: 0, y: 0 }, { x: 120, y: 0 }];
    const inherit = edgeLabel({ id: 'e', points, tone: 'violet' }, 'x');
    expect(inherit.tone).toBe('violet');
    expect(inherit.bg).toBeUndefined();
    expect(inherit.color).toBeUndefined();
    // 继承不是"只有一层": options 显式给的赢
    expect(edgeLabel({ id: 'e', points, tone: 'violet' }, 'x', { tone: 'rose' }).tone).toBe('rose');
    // 都不表态 ⇒ 字段本身不写(出口按"没有 tone"走 `theme.label`, 老产物字节不变)
    const bare = edgeLabel({ id: 'e', points }, 'x');
    expect('tone' in bare).toBe(false);
    expect('bg' in bare).toBe(false);
    expect(edgeLabel({ id: 'e', points }, 'x', { bg: '#fff', color: '#000' })).toMatchObject({ bg: '#fff', color: '#000' });
  });
});
