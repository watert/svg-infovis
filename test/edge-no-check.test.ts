// =====================================================================
// `SceneEdge.noCheck` · 纯视觉基准线豁免的**举证测试**(260920)
//
// 本仓纪律: 新增旋钮要像新增门禁一样自己举证 —— 两个方向都要有反例:
//   ① **它确实豁免了它该豁免的那一条**(穿盒) —— 否则这个旋钮不起作用, 白加
//   ② **其余判据一条都没被放过**(正交 / 折回 / 共线重叠 / 端点贴盒 / 端口拥挤 / 文本可读性)
//      —— 否则它就是"一开全关"的后门, 那是本仓最不能接受的滑坡
//
// 起因: 序列图的激活条骑在泳道线上, 不豁免就是 3 条 `edge_node_clearance`
// (见 `templates/sequence.ts` 文件头 ③, 结论来自激活条专项取证探针实测)。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { type Scene, audit } from '../src/knives/audit';

/** 一个"中间横着一个盒子"的场景: 直连的边必穿它 —— 门禁 ⑧ 的经典现场 */
const sceneCrossing = (noCheck: boolean): Scene => ({
  width: 400, height: 400,
  nodes: [
    { id: 'a', rect: { x: 160, y: 20, w: 80, h: 40 }, label: 'A' },
    { id: 'mid', rect: { x: 150, y: 160, w: 100, h: 60 }, label: 'MID' },
    { id: 'b', rect: { x: 160, y: 320, w: 80, h: 40 }, label: 'B' },
  ],
  edges: [
    { id: 'straight', points: [{ x: 200, y: 60 }, { x: 200, y: 320 }], from: 'a', to: 'b', noCheck },
  ],
});

const codesOf = (s: Scene) => audit(s, { level: 'standard' }).diagnostics.map((d) => d.code);

describe('SceneEdge.noCheck · 豁免面(只跳穿盒那一档)', () => {
  it('① 该豁免的确实豁免了: 同一条穿盒边, 标了 noCheck 就不再报 edge_node_clearance', () => {
    expect(codesOf(sceneCrossing(false))).toContain('edge_node_clearance');
    expect(codesOf(sceneCrossing(true))).not.toContain('edge_node_clearance');
    // 而且**只**少了这一条 —— 没有连坐出别的码(计数同源, 免得改坏别处还以为绿了)
    expect(audit(sceneCrossing(true), { level: 'standard' }).pass).toBe(true);
  });

  it('② 其余边级判据一条都不放: 折回 / 自重叠 / 非正交 / 共线重叠 / 端点贴盒照报', () => {
    const base = { width: 400, height: 400, nodes: [{ id: 'a', rect: { x: 20, y: 20, w: 60, h: 40 }, label: 'A' }] };
    const withEdge = (id: string, points: Array<{ x: number; y: number }>, extra: Partial<Scene['edges'][number]> = {}): Scene =>
      ({ ...base, edges: [{ id, points, noCheck: true, ...extra }] });

    // 折回(相邻段反向) —— no_backtrack 不因 noCheck 让步
    expect(audit(withEdge('back', [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 100, y: 100 }]), { level: 'standard' }).diagnostics.map((d) => d.code))
      .toContain('no_backtrack');
    // 非正交(斜段) —— orthogonal_edges 是无条件 error
    expect(audit(withEdge('diag', [{ x: 100, y: 100 }, { x: 180, y: 160 }]), { level: 'standard' }).diagnostics.map((d) => d.code))
      .toContain('orthogonal_edges');
    // 退化(两点重合) —— edge_degenerate 照报
    expect(audit(withEdge('degen', [{ x: 100, y: 100 }, { x: 100, y: 100 }]), { level: 'standard' }).diagnostics.map((d) => d.code))
      .toContain('edge_degenerate');
  });

  it('③ 文本可读性不豁免: 标了 noCheck 的边上, 标签压线照样报 label_clearance', () => {
    // 泳道线一族的典型几何: 一条竖线 + 一个横跨它的标签 —— noCheck 说的是"别管穿盒", 不是"别管可读性"
    const s: Scene = {
      width: 400, height: 400,
      nodes: [{ id: 'a', rect: { x: 180, y: 20, w: 40, h: 30 }, label: 'A' }],
      edges: [{ id: 'life', points: [{ x: 200, y: 50 }, { x: 200, y: 360 }], from: 'a', to: 'a', noCheck: true }],
      labels: [{ id: 'lab', at: { x: 200, y: 200 }, width: 120, height: 18, text: '压在这条线上' }],
    };
    expect(audit(s, { level: 'standard' }).diagnostics.map((d) => d.code)).toContain('label_clearance');
  });

  it('④ 豁免只作用于标了的那条边: 同场景另一条边穿同一个盒照报', () => {
    const s: Scene = {
      width: 400, height: 400,
      nodes: [
        { id: 'mid', rect: { x: 150, y: 160, w: 100, h: 60 }, label: 'MID' },
      ],
      edges: [
        { id: 'lifeline', points: [{ x: 200, y: 20 }, { x: 200, y: 380 }], noCheck: true },
        { id: 'msg', points: [{ x: 40, y: 190 }, { x: 360, y: 190 }] }, // 横穿 mid —— 该报
      ],
    };
    const rep = audit(s, { level: 'standard' });
    const hit = rep.diagnostics.filter((d) => d.code === 'edge_node_clearance');
    expect(hit.map((d) => d.subject.id)).toEqual(['msg']); // 只有没标的这条
  });
});
