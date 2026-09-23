// =====================================================================
// port_crowding 单测 · 门禁⑩(260918 第四轮, Mermaid 对账)
//
// 三档同一个病: 两条边在同一节点上"看起来同源"。断言钉住的是**三档的分工边界**:
//   ≤2px 且同向 → same_port_departure
//   ≤3px(不问方向) → shared_attachment_point
//   >3px 但**clamp 回节点盒后重合** → shared_projected_port  ← 只有这一档能抓 nudge 推离
// 以及不该误伤的三处: 不同节点 / 同一条边的两端 / 投影后不重合。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { type Diagnostic, type Scene, type SceneEdge, audit } from '../src/knives/audit';

const HITS = (diags: Diagnostic[]): Diagnostic[] => diags.filter((d) => d.code === 'port_crowding');
const kindOf = (d: Diagnostic): string => d.evidence.kind as unknown as string;

/** 一个盒子 + 若干条边; 盒子居中留足画布, 免得别的门禁插嘴 */
const scene = (edges: SceneEdge[]): Scene => ({
  width: 400,
  height: 300,
  nodes: [{ id: 'hub', rect: { x: 100, y: 100, w: 100, h: 60 } }],
  edges,
});

describe('port_crowding · 端口拥挤三档', () => {
  it('① 同一节点上附着点相距 ≤2px 且首段同向 → same_port_departure', () => {
    // 两条边都从 hub 左边 (100,120) 附近出发向东(进入盒子方向), 相距 1px
    const r = audit(scene([
      { id: 'a', from: 'hub', points: [{ x: 100, y: 120 }, { x: 60, y: 120 }, { x: 60, y: 60 }] },
      { id: 'b', from: 'hub', points: [{ x: 101, y: 120 }, { x: 40, y: 120 }, { x: 40, y: 60 }] },
    ]));
    const hit = HITS(r.diagnostics);
    expect(hit).toHaveLength(1);
    expect(kindOf(hit[0])).toBe('same_port_departure');
    expect(hit[0].evidence.node).toBe('hub');
    expect(hit[0].subject.id).toBe('a'); // 排序后取 id 小的那条作主语
    expect(hit[0].evidence.other).toBe('b');
  });

  it('② 附着点重合但朝外方向不同(一个往西走、一个往北走)→ shared_attachment_point', () => {
    // 语义说明: "同向"指的是**朝外(离开节点)的方向**相同 —— 无论这条边是把该节点当起点还是终点。
    // 所以一进一出但都往西走, 仍算 ①; 只有朝外方向不同了, 才降到第二档。
    const r = audit(scene([
      { id: 'a', from: 'hub', points: [{ x: 100, y: 100 }, { x: 60, y: 100 }, { x: 60, y: 60 }] },
      { id: 'b', to: 'hub', points: [{ x: 100, y: 60 }, { x: 100, y: 100 }] },
    ]));
    const hit = HITS(r.diagnostics);
    expect(hit).toHaveLength(1);
    expect(kindOf(hit[0])).toBe('shared_attachment_point');
  });

  it('一进一出但从同一点朝同一边离去 → 仍是 ①(第①档只问"朝外方向"是否相同)', () => {
    const r = audit(scene([
      { id: 'a', from: 'hub', points: [{ x: 100, y: 130 }, { x: 60, y: 130 }, { x: 60, y: 60 }] },
      { id: 'b', to: 'hub', points: [{ x: 40, y: 60 }, { x: 40, y: 130 }, { x: 102, y: 130 }] },
    ]));
    const hit = HITS(r.diagnostics);
    expect(hit).toHaveLength(1);
    expect(kindOf(hit[0])).toBe('same_port_departure');
  });

  it('③ 端点被 nudge 推离节点(原始相距 7px)→ clamp 回盒后重合 → shared_projected_port', () => {
    // 两条边的端点都在 hub 左侧外面、y 相同、离盒远近不同: raw 相距 7px, 投影回盒都是 (100,140)
    const r = audit(scene([
      { id: 'a', from: 'hub', points: [{ x: 90, y: 140 }, { x: 60, y: 140 }, { x: 60, y: 60 }] },
      { id: 'b', from: 'hub', points: [{ x: 97, y: 140 }, { x: 40, y: 200 }, { x: 40, y: 60 }] },
    ]));
    const hit = HITS(r.diagnostics);
    expect(hit).toHaveLength(1);
    expect(kindOf(hit[0])).toBe('shared_projected_port');
    expect(hit[0].evidence.gap).toBe(7);
    expect(hit[0].supportedFixes.some((f) => f.kind === 'offset-port')).toBe(true);
  });

  it('反证: 端点同样被推离但不在同一条水平线上 → 投影后不重合, 不报(第三档不能虚报)', () => {
    const r = audit(scene([
      { id: 'a', from: 'hub', points: [{ x: 90, y: 110 }, { x: 60, y: 110 }, { x: 60, y: 60 }] },
      { id: 'b', from: 'hub', points: [{ x: 97, y: 170 }, { x: 40, y: 170 }, { x: 40, y: 60 }] },
    ]));
    expect(HITS(r.diagnostics)).toHaveLength(0);
  });

  it('不许误伤: 端点在两个不同节点上挨得再近也不算(端口拥挤是"同一节点"的病)', () => {
    const r = audit({
      width: 400,
      height: 300,
      nodes: [
        { id: 'left', rect: { x: 60, y: 100, w: 100, h: 60 } },
        { id: 'right', rect: { x: 162, y: 100, w: 100, h: 60 } },
      ],
      edges: [
        { id: 'a', from: 'left', points: [{ x: 160, y: 130 }, { x: 20, y: 130 }, { x: 20, y: 60 }] },
        { id: 'b', from: 'right', points: [{ x: 162, y: 130 }, { x: 380, y: 130 }, { x: 380, y: 60 }] },
      ],
    });
    expect(HITS(r.diagnostics)).toHaveLength(0);
  });

  it('不许误伤: 同一条边的两端落在同一节点上(自环)不算两条边挤一个点', () => {
    const r = audit(scene([
      { id: 'loop', from: 'hub', to: 'hub', points: [{ x: 100, y: 120 }, { x: 60, y: 120 }, { x: 60, y: 140 }, { x: 100, y: 140 }] },
    ]));
    expect(HITS(r.diagnostics)).toHaveLength(0);
  });

  it('反证: 相距 4px(越过前两档)且投影不重合 → 三档都不报, 不能靠调阈值硬凑', () => {
    const r = audit(scene([
      { id: 'a', from: 'hub', points: [{ x: 100, y: 120 }, { x: 60, y: 120 }, { x: 60, y: 60 }] },
      { id: 'b', from: 'hub', points: [{ x: 100, y: 124 }, { x: 40, y: 124 }, { x: 40, y: 60 }] },
    ]));
    expect(HITS(r.diagnostics)).toHaveLength(0);
  });

  it('metrics: 有成对端口时给最小附着点间距实数; 只有一条边时给 -1(不是 0)', () => {
    const paired = audit(scene([
      { id: 'a', from: 'hub', points: [{ x: 100, y: 120 }, { x: 60, y: 120 }, { x: 60, y: 60 }] },
      { id: 'b', from: 'hub', points: [{ x: 100, y: 160 }, { x: 40, y: 160 }, { x: 40, y: 60 }] },
    ]));
    expect(paired.metrics.min_port_attach_gap).toBe(40);
    expect(paired.metrics.port_crowding).toBe(0);

    const single = audit(scene([
      { id: 'a', from: 'hub', points: [{ x: 100, y: 120 }, { x: 60, y: 120 }, { x: 60, y: 60 }] },
    ]));
    expect(single.metrics.min_port_attach_gap).toBe(-1);
    expect(single.metrics.port_crowding).toBe(0);
  });

  it('反证(参考语义): 两个端点都在盒内时不报 —— clamp 对盒内点是恒等映射, 不许硬推到最近边', () => {
    // 端点 (150,115) 与 (153,113) 都在 hub 盒内, raw 距离 3.6 > 3; 参考实现只做 bbox clamp → 投影后距离不变
    const r = audit(scene([
      { id: 'a', from: 'hub', points: [{ x: 150, y: 115 }, { x: 150, y: 60 }, { x: 90, y: 60 }] },
      { id: 'b', from: 'hub', points: [{ x: 153, y: 113 }, { x: 153, y: 40 }, { x: 90, y: 40 }] },
    ]));
    expect(HITS(r.diagnostics)).toHaveLength(0);
  });

  it('不刷屏: 四条边挤同一个端口 → 每个 (边, 节点) 只出一条, 不是 C(4,2)=6 条', () => {
    const same = (id: string): SceneEdge => ({ id, from: 'hub', points: [{ x: 100, y: 120 }, { x: 60, y: 120 }, { x: 60, y: 60 }] });
    const r = audit(scene([same('a'), same('b'), same('c'), same('d')]));
    const hit = HITS(r.diagnostics);
    // 6 个两两组合 → 按 (边, 节点) 去重后每条边最多当一次主语 → 3 条
    expect(hit).toHaveLength(3);
    expect(hit.map((d) => d.subject.id)).toEqual(['a', 'b', 'c']);
  });

  it('确定性: 打乱 nodes 顺序, diagnostics 与 metrics 逐字节相同(并列时按 id 码点序破平)', () => {
    // 端点距两盒等距(28px 间隙的中点), 谁都不"更近" —— 靠 id 码点序定归属
    const mk = (nodes: Scene['nodes']): Scene => ({
      width: 400, height: 300, nodes,
      edges: [
        { id: 'a', from: 'n1', points: [{ x: 113, y: 200 }, { x: 113, y: 60 }] },
        { id: 'b', to: 'n1', points: [{ x: 114, y: 40 }, { x: 114, y: 202 }] },
      ],
    });
    const one = audit(mk([{ id: 'n1', rect: { x: 60, y: 100, w: 40, h: 60 } }, { id: 'n2', rect: { x: 128, y: 100, w: 40, h: 60 } }]));
    const two = audit(mk([{ id: 'n2', rect: { x: 128, y: 100, w: 40, h: 60 } }, { id: 'n1', rect: { x: 60, y: 100, w: 40, h: 60 } }]));
    expect(JSON.stringify(two.metrics)).toBe(JSON.stringify(one.metrics));
    expect(JSON.stringify(two.diagnostics)).toBe(JSON.stringify(one.diagnostics));
  });

  it('metrics.unresolved_port_ends: from/to 是组 id 且端点离任何盒都远 → 计数暴露差集(不许静默丢弃)', () => {
    const r = audit({
      width: 400, height: 300,
      nodes: [{ id: 'n', rect: { x: 300, y: 240, w: 60, h: 40 } }],
      edges: [{ id: 'orphan', from: 'grp', points: [{ x: 20, y: 20 }, { x: 60, y: 20 }] }],
    });
    expect(r.metrics.unresolved_port_ends).toBe(2); // 两端都没归属
    expect(r.metrics.min_port_attach_gap).toBe(-1);
  });

  it('诊断顺序与输入序无关: 交换两条边的数组顺序, diagnostics 逐字节相同', () => {
    const a: SceneEdge = { id: 'a', from: 'hub', points: [{ x: 90, y: 140 }, { x: 60, y: 140 }, { x: 60, y: 60 }] };
    const b: SceneEdge = { id: 'b', from: 'hub', points: [{ x: 97, y: 140 }, { x: 40, y: 200 }, { x: 40, y: 60 }] };
    const one = audit(scene([a, b]));
    const two = audit(scene([b, a]));
    expect(JSON.stringify(two.diagnostics)).toBe(JSON.stringify(one.diagnostics));
    expect(JSON.stringify(two.metrics)).toBe(JSON.stringify(one.metrics));
  });
});
