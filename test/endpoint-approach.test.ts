// =====================================================================
// endpoint_approach 单测 · 门禁⑪(260918 第四轮, Mermaid 对账)
//
// stub 从"造型偏好"升级成门禁: ① 首/末段 < 10px(折弯会顶在箭头底下);
// ② 倒数第二段平行贴着本端节点盒蹭过来(距离 ≤18px 且投影重叠过半)。
//
// 两条最容易写坏的地方, 这里各钉一个:
//   · 量长度前**必须先归一化** —— 否则"起点重复点"这种常见产物会被读成 stub=0 而虚报
//   · ② 要投影重叠过半 —— 只是路过旁边不算"蹭着进"
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { type Diagnostic, type Scene, type SceneEdge, audit } from '../src/knives/audit';

const HITS = (diags: Diagnostic[]): Diagnostic[] => diags.filter((d) => d.code === 'endpoint_approach');
const kindOf = (d: Diagnostic): string => d.evidence.kind as unknown as string;

/** 一个目标节点(right), 边从画布左侧进来; 具体折点由调用方给 */
const intoRight = (points: SceneEdge['points']): Scene => ({
  width: 400,
  height: 300,
  nodes: [{ id: 'right', rect: { x: 200, y: 200, w: 100, h: 60 } }],
  edges: [{ id: 'e', to: 'right', points }],
});

describe('endpoint_approach · 折点贴端点', () => {
  it('① 首段只有 6px → 报 short_stub, 且点名是起点那一侧', () => {
    const r = audit(intoRight([{ x: 0, y: 100 }, { x: 6, y: 100 }, { x: 6, y: 230 }, { x: 250, y: 230 }]));
    const hit = HITS(r.diagnostics);
    expect(hit).toHaveLength(1);
    expect(kindOf(hit[0])).toBe('short_stub');
    expect(hit[0].evidence.ends).toEqual(['start']);
    expect(hit[0].evidence.startStub).toBe(6);
    expect(hit[0].supportedFixes.some((f) => f.kind === 'grow-stub')).toBe(true);
  });

  it('① 末段只有 4px → 报 short_stub, 且点名是终点那一侧', () => {
    // 进入 right 左端前 4px 才拐弯: 折弯正好落在箭头（末段最后 10px）底下
    const r = audit({
      width: 400,
      height: 300,
      nodes: [
        { id: 'left', rect: { x: 20, y: 100, w: 60, h: 60 } },
        { id: 'right', rect: { x: 200, y: 200, w: 100, h: 60 } },
      ],
      edges: [{ id: 'e', from: 'left', to: 'right', points: [{ x: 80, y: 140 }, { x: 196, y: 140 }, { x: 196, y: 220 }, { x: 200, y: 220 }] }],
    });
    const hit = HITS(r.diagnostics);
    expect(hit).toHaveLength(1);
    expect(kindOf(hit[0])).toBe('short_stub');
    expect(hit[0].evidence.ends).toEqual(['end']);
    expect(hit[0].evidence.endStub).toBe(4);
    // 同一张图里不能又拿 end_band 重复报同一处(投影重叠 20 < 盒高 30 的一半)
    expect(kindOf(hit[0])).toBe('short_stub');
  });

  it('反证(归一化): 起点重复点(0 长段)不许被读成 stub=0 而虚报', () => {
    // 420 与 360 两段共线合并后首段是 60px —— 归一化前 raw 首段会是 0
    const r = audit(intoRight([
      { x: 0, y: 100 }, { x: 0, y: 100 }, { x: 60, y: 100 }, { x: 60, y: 230 }, { x: 250, y: 230 },
    ]));
    expect(HITS(r.diagnostics)).toHaveLength(0);
    expect(audit(intoRight([{ x: 0, y: 100 }, { x: 60, y: 100 }, { x: 60, y: 230 }, { x: 250, y: 230 }])).metrics.min_stub).toBe(60);
  });

  it('反证: 首末段都够长(≥10px)时放行 —— 恰好等于阈值也算过(判据是严格小于)', () => {
    const exactly = audit(intoRight([{ x: 0, y: 100 }, { x: 10, y: 100 }, { x: 10, y: 230 }, { x: 250, y: 230 }]));
    expect(HITS(exactly.diagnostics)).toHaveLength(0);
    expect(exactly.metrics.min_stub).toBe(10);
    const barely = audit(intoRight([{ x: 0, y: 100 }, { x: 9, y: 100 }, { x: 9, y: 230 }, { x: 250, y: 230 }]));
    expect(HITS(barely.diagnostics)).toHaveLength(1);
  });

  it('② 进 right 前那一段平行贴着盒边(距离 10px、投影重叠过半)→ 报 end_band', () => {
    // 倒数第二段 y=190, right 顶边 y=200 → 距离 10 ≤18; x 从 0 到 250 与 [200,300] 重叠 50 = 盒宽一半
    const r = audit(intoRight([{ x: 0, y: 190 }, { x: 250, y: 190 }, { x: 250, y: 200 }]));
    const hit = HITS(r.diagnostics);
    expect(hit).toHaveLength(1);
    expect(kindOf(hit[0])).toBe('end_band');
    expect(hit[0].evidence.node).toBe('right');
    expect(hit[0].evidence.clearance).toBe(10);
  });

  it('反证 ②: 恰好 18px 算过(阈值取严格小于, 对齐 Mermaid "closer than 18" 的语义)', () => {
    // 倒数第二段 y=182, right 顶边 y=200 → 距离正好 18px
    const r = audit(intoRight([{ x: 0, y: 182 }, { x: 250, y: 182 }, { x: 250, y: 200 }]));
    expect(HITS(r.diagnostics)).toHaveLength(0);
    const justInside = audit(intoRight([{ x: 0, y: 182.5 }, { x: 250, y: 182.5 }, { x: 250, y: 200 }]));
    expect(HITS(justInside.diagnostics)).toHaveLength(1); // 17.5px < 18
  });

  it('反证 ②: 同样平行但离得远(30px > 18px)不报', () => {
    const r = audit(intoRight([{ x: 0, y: 170 }, { x: 250, y: 170 }, { x: 250, y: 200 }]));
    expect(HITS(r.diagnostics)).toHaveLength(0);
  });

  it('反证 ②: 贴得近但只是路过(投影重叠不到盒宽一半)不报 —— "蹭着进"与"从旁边过"要分得开', () => {
    // 倒数第二段 x 只到 210, 与 [200,300] 重叠 10 < 50
    const r = audit(intoRight([{ x: 0, y: 190 }, { x: 210, y: 190 }, { x: 210, y: 200 }]));
    expect(HITS(r.diagnostics)).toHaveLength(0);
  });

  it('反证(参考前置): 无折弯的 2 点直连边不判短 stub —— 否则与 node_gap(8px 放行)互相打架', () => {
    // 两盒相距 8px, 一条直连边(无折弯): headStub=tailStub=8 < 10, 但它没有折弯可"顶在箭头下面"
    const r = audit({
      width: 300,
      height: 300,
      nodes: [
        { id: 'a', rect: { x: 40, y: 100, w: 60, h: 40 } },
        { id: 'b', rect: { x: 108, y: 100, w: 60, h: 40 } },
      ],
      edges: [{ id: 'e', from: 'a', to: 'b', points: [{ x: 100, y: 120 }, { x: 108, y: 120 }] }],
    });
    expect(HITS(r.diagnostics)).toHaveLength(0);
    expect(r.pass).toBe(true);
    expect(r.metrics.min_stub).toBe(8); // 仍然量出来, 只是不判违例
  });

  it('route→audit 集成: 两盒只隔 30px 时 route 自己的 Z 形输出不许被拦(端带只给 warning, 且修法要诚实)', async () => {
    const { routeOrthogonal } = await import('../src/knives/route');
    const A = { x: 100, y: 100, w: 100, h: 60 };
    const B = { x: 400, y: 190, w: 100, h: 60 };
    const routed = routeOrthogonal({ from: A, fromPort: { side: 'bottom' }, to: B, toPort: { side: 'top' } });
    const r = audit({
      width: 700, height: 400,
      nodes: [{ id: 'A', rect: A }, { id: 'B', rect: B }],
      edges: [{ id: 'e', from: 'A', to: 'B', points: routed.points }],
    });
    expect(r.pass).toBe(true); // 曾经这里被判 error 而拦死出口(端带 15px < 18px)
    expect(r.metrics.errors).toBe(0);
    const band = HITS(r.diagnostics);
    expect(band.every((d) => d.severity === 'warning')).toBe(true);
    // 修法必须承认"间距小是几何必然": 有 gap-nodes 这一条, 且 stub 提示写明了 route 会钳半
    expect(band[0].supportedFixes.some((f) => f.kind === 'gap-nodes')).toBe(true);
    const stubFix = HITS(r.diagnostics)[0].supportedFixes.find((f) => f.kind === 'lane-shift');
    expect(String(stubFix?.hint)).toContain('投影');
  });

  it('metrics: min_stub 给最短那一段的实数; 没有可测段(单点边)时给 -1', () => {
    const r = audit(intoRight([{ x: 0, y: 100 }, { x: 40, y: 100 }, { x: 40, y: 230 }, { x: 250, y: 230 }]));
    expect(r.metrics.min_stub).toBe(40);
    expect(r.metrics.endpoint_approach).toBe(0);
    const degenerate = audit({ width: 200, height: 200, nodes: [], edges: [{ id: 'p', points: [{ x: 10, y: 10 }] }] });
    expect(degenerate.metrics.min_stub).toBe(-1);
    // 单点边本门禁量不出来(min_stub=-1), 但**不再静默**: 它由 edge_degenerate 点名(260918 补)
    expect(degenerate.diagnostics.map((d) => d.code)).toEqual(['edge_degenerate']);
  });
});
