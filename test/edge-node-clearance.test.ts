// =====================================================================
// edge_node_clearance · 边不许穿过节点盒 (门禁⑧)
//
// 260917 手排实测挖出的盲区: 一条直线横穿盒子 → `pass=true / errors=0 / diagnostics=(无)`。
// 最显眼的几何事故却完全不在门禁范围 —— 本文件既验"会喊疼", 也验"照修法真能修好"与
// "不许误伤"(贴边 / 自有端节点 / 端口落在盒边上 都不该算穿)。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { type Diagnostic, audit } from '../src/knives/audit';

const codes = (r: { diagnostics: Diagnostic[] }) => r.diagnostics.map((d) => d.code);
const only = (r: { diagnostics: Diagnostic[] }, c: string) => r.diagnostics.filter((d) => d.code === c);

/** a → c 一条直线, 中间横着 b —— 线必然从 b 身上穿过去 */
const through = {
  width: 620, height: 220,
  nodes: [
    { id: 'a', rect: { x: 40, y: 80, w: 100, h: 60 }, label: 'A' },
    { id: 'b', rect: { x: 250, y: 80, w: 100, h: 60 }, label: 'B' },
    { id: 'c', rect: { x: 460, y: 80, w: 100, h: 60 }, label: 'C' },
  ],
  edges: [{ id: 'e', from: 'a', to: 'c', points: [{ x: 140, y: 110 }, { x: 460, y: 110 }] }],
};

/** 同样三块盒, 但折线从上方绕过去 */
const around = {
  ...through,
  height: 220,
  edges: [{ id: 'e', from: 'a', to: 'c', points: [{ x: 140, y: 110 }, { x: 140, y: 40 }, { x: 460, y: 40 }, { x: 460, y: 110 }] }],
};

describe('edge_node_clearance · 边穿节点盒', () => {
  it('反证: 老代码的盲区 —— 线穿盒子以前全绿, 现在必须喊疼', () => {
    const r = audit(through, { level: 'showcase' });
    expect(r.pass).toBe(false);
    expect(r.metrics.errors).toBe(1);
    const d = only(r, 'edge_node_clearance')[0];
    expect(d.severity).toBe('error');
    expect(d.subject).toEqual({ kind: 'edge', id: 'e' });
    expect(d.message).toContain('从节点 b 身上穿过');
    // 穿透长度 = b 的宽(100), 因为线正好横穿整块
    expect(d.evidence.node).toBe('b');
    expect(d.evidence.through).toBe(100);
    expect(r.metrics.edge_node_pierce).toBe(1);
    expect(r.metrics.min_edge_node_clearance).toBe(0);
    // 四个修法方向齐全(绕线 / 换序 / 挪节点 / 换端口)
    expect(d.supportedFixes.map((f) => f.kind)).toEqual(['lane-shift', 'reorder', 'move-node', 'move-port']);
  });

  it('修法闭环: 按 lane-shift 的思路把线绕到盒子上方走, 门禁立刻过', () => {
    const fixed = audit(around, { level: 'showcase' });
    expect(only(fixed, 'edge_node_clearance')).toEqual([]);
    expect(fixed.pass).toBe(true);
    expect(fixed.metrics.edge_node_pierce).toBe(0);
    // 绕开之后最近净空是个正数(40 - 10 = 30 左右), 不再压线
    expect(fixed.metrics.min_edge_node_clearance).toBeGreaterThan(20);
  });

  it('不许误伤: 自己的端节点不算穿 —— 哪怕折线起点正好落在盒边上', () => {
    // 单条竖边从 a 的底边出发到 c 的顶边; a/c 都是端节点, 必须豁免
    const scene = {
      width: 400, height: 300,
      nodes: [
        { id: 'a', rect: { x: 150, y: 40, w: 100, h: 60 }, label: 'A' },
        { id: 'c', rect: { x: 150, y: 200, w: 100, h: 60 }, label: 'C' },
      ],
      edges: [{ id: 'e', from: 'a', to: 'c', points: [{ x: 200, y: 100 }, { x: 200, y: 200 }] }],
    };
    expect(audit(scene, { level: 'showcase' }).pass).toBe(true);
  });

  it('`from`/`to` 是组 id 时匹配不上 → 按端点就近兜底(照样豁免自己的端节点)', () => {
    const scene = {
      width: 400, height: 300,
      nodes: [
        { id: 'a', rect: { x: 150, y: 40, w: 100, h: 60 }, label: 'A' },
        { id: 'c', rect: { x: 150, y: 200, w: 100, h: 60 }, label: 'C' },
      ],
      groups: [{ id: 'g', rect: { x: 100, y: 10, w: 200, h: 280 }, label: 'G' }],
      // from/to 指的是组(跨层边常这么写)
      edges: [{ id: 'e', from: 'g', to: 'c', points: [{ x: 200, y: 100 }, { x: 200, y: 200 }] }],
    };
    expect(only(audit(scene), 'edge_node_clearance')).toEqual([]);
  });

  it('折点在盒内拐弯照样算穿: 进入段 / 离开段各自"半截"的老 bug 已堵', () => {
    // 折点 (300,110) 落在 b 盒里面 —— 折线从 b 的左边界进(250)、顶边出(80)
    // 老谓词只拿"与边界线的交点"当候选: 两段各自只剩一个候选点 → 双段皆返 0
    // → 整条边穿盒而 audit 全绿(260918 挖出的假阴性, 谓词层已修)
    const scene = {
      ...through,
      edges: [{
        id: 'e', from: 'a', to: 'c',
        points: [{ x: 140, y: 110 }, { x: 300, y: 110 }, { x: 300, y: 40 }, { x: 460, y: 40 }, { x: 460, y: 110 }],
      }],
    };
    const d = only(audit(scene, { level: 'showcase' }), 'edge_node_clearance');
    expect(d.length).toBe(1);
    expect(d[0].evidence.node).toBe('b');
    expect(d[0].evidence.through).toBe(80); // 盒内两段: 250→300 (50) + 110→80 (30)
  });

  it('整段躺在盒里也算穿: 两端点都在盒内的段不再被沉默', () => {
    const scene = {
      ...through,
      edges: [{
        id: 'e', from: 'a', to: 'c',
        points: [{ x: 140, y: 110 }, { x: 270, y: 110 }, { x: 270, y: 130 }, { x: 460, y: 130 }, { x: 460, y: 110 }],
      }],
    };
    const d = only(audit(scene, { level: 'showcase' }), 'edge_node_clearance');
    expect(d.length).toBe(1);
    expect(d[0].evidence.node).toBe('b');
    expect(d[0].evidence.through).toBe(120); // 250→270 (20) + 盒内竖段 (20) + 270→350 (80)
  });

  it('擦边不算穿: 半像素以内的重叠放行(折线贴着盒边走是允许的)', () => {
    const scene = {
      ...through,
      edges: [{ id: 'e', from: 'a', to: 'c', points: [{ x: 140, y: 110 }, { x: 200, y: 110 }, { x: 200, y: 60 }, { x: 460, y: 60 }] }],
    };
    // y=60 从 b 上方掠过(b 顶边 y=80) → 净空 20, 不该报
    expect(only(audit(scene), 'edge_node_clearance')).toEqual([]);
    expect(audit(scene).metrics.min_edge_node_clearance).toBeGreaterThan(15);
  });

  it('指标口径: 无节点可测(只有边) → min 给 -1 而不是 0; 计数与诊断自洽', () => {
    const bare = audit({ width: 200, height: 100, nodes: [], edges: [{ id: 'e', points: [{ x: 10, y: 10 }, { x: 90, y: 10 }] }] });
    expect(bare.metrics.edge_node_pierce).toBe(0);
    expect(bare.metrics.min_edge_node_clearance).toBe(-1);
    const r = audit(through);
    expect(r.metrics.edge_node_pierce).toBe(only(r, 'edge_node_clearance').length);
    expect(codes(r)).toContain('edge_node_clearance');
  });
});
