// =====================================================================
// density · 门禁第二轮的三项度量 (组内空白走廊 / 混组层 / 长边)
//
// 这一刀是 §十 实验逼出来的: 六项几何门禁在 8 张真实图上只喊 3 声, 而肉眼 14 处想改。
// 所以本文件的重心在两处**反证**:
//   ① 长边必须是**相对本图**的 —— 首版只比绝对值, 在"两节点一条边"的图上必然假警报;
//   ② 组内空白必须按**走廊**量而不是面积比 —— 面积比在层带型图上系统性误报(3 节点装一条
//      带, 带窄节点小, 面积比自然高, 但那条带是合适的)。两项口径都是换了之后的。
// ③ 三项全是启发式, **一律 warning, 不参与 fail-closed**(否则用审美否决正确排版)。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { type Diagnostic, audit } from '../src/knives/audit';
import { clusterDensity, clusterMembers, density, sceneRows, unionArea } from '../src/knives/density';

const codes = (r: { diagnostics: Diagnostic[] }) => r.diagnostics.map((d) => d.code);
const only = (r: { diagnostics: Diagnostic[] }, code: string): Diagnostic[] => r.diagnostics.filter((d) => d.code === code);
const node = (id: string, x: number, y: number, w = 100, h = 50, label?: string) => ({ id, rect: { x, y, w, h }, label });

describe('density · 组内空白走廊 / 混组层 / 长边三项度量', () => {
  it('unionArea: 不相交 = 面积和, 相交 = 并集(不重复计)', () => {
    expect(unionArea([])).toBe(0);
    expect(unionArea([{ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 10, h: 10 }])).toBe(200);
    expect(unionArea([{ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 0, w: 10, h: 10 }])).toBe(150);
  });

  it('sceneRows / clusterMembers: 层按 y 区间重叠聚类; 归属按几何包含推断(Scene 没有 wraps 字段)', () => {
    const s = {
      width: 600, height: 400,
      nodes: [node('a', 40, 40), node('b', 200, 44), node('c', 40, 200)],
      edges: [],
      groups: [{ id: 'g', rect: { x: 20, y: 20, w: 400, h: 100 } }],
    };
    expect(sceneRows(s)).toEqual([0, 0, 1]); // a/b 同层(a 高 50, b 顶 44 与它重叠过半), c 另起一层
    expect(clusterMembers(s)).toEqual([[0, 1]]); // c 在组框外
  });

  it('组内空白走廊: 空框报"一个节点都没有"; 框远大于内容 → 报出走廊宽度与主轴占比', () => {
    const empty = { width: 600, height: 400, nodes: [], edges: [], groups: [{ id: 'g', rect: { x: 20, y: 20, w: 200, h: 100 } }] };
    const e = only(density(empty), 'cluster_corridor')[0];
    expect(e.message).toContain('一个节点都没有');
    expect(e.evidence.nodes).toBe(0);

    // 100x50 的节点贴在 600x400 框的左上角 → 右侧一条 466px 的长走廊
    const huge = { width: 900, height: 700, nodes: [node('a', 60, 60)], edges: [], groups: [{ id: 'big', rect: { x: 40, y: 40, w: 600, h: 400 } }] };
    const d = clusterDensity(huge)[0];
    expect(d.corridor).toBeGreaterThan(300);
    expect(d.nodes).toBe(1);
    const diag = only(density(huge), 'cluster_corridor')[0];
    expect(diag.severity).toBe('warning');
    expect(diag.evidence.corridor).toBe(d.corridor);
    expect(diag.evidence.ratio).toBe(d.corridorRatio);
    // 修法第一顺位是"把框收紧", 不是"挪节点" —— 框是派生量
    expect(diag.supportedFixes[0].kind).toBe('tighten-group');
  });

  it('走廊反证(旧口径的系统病): 层带型"3 节点装一条带"**不得**报警 —— 旧面积比在这里误报 60%+', () => {
    // 组框 = 成员包围盒 + 36px padding, 这是"正确的层带型"画法
    const pad = 36;
    const band = {
      width: 1000, height: 400,
      nodes: [node('a', 200, 100), node('b', 400, 100), node('c', 600, 100)],
      edges: [],
      groups: [{ id: 'band', rect: { x: 200 - pad, y: 100 - pad, w: 500 + 2 * pad, h: 50 + 2 * pad } }],
    };
    const r = density(band);
    expect(only(r, 'cluster_corridor')).toEqual([]);
    expect(r.metrics.cluster_corridor_px_max).toBe(72); // 只剩节点间隙 72, 首尾空隙各 22
    expect(r.metrics.cluster_corridor_max).toBeLessThan(0.25);
  });

  it('走廊正证: 中间一道大沟 → 报(面积比分不清"三格挤一条带"与"一道大沟", 走廊能分)', () => {
    // 同层两个节点被拉到框两端: 中间 500px 空着
    const s = {
      width: 900, height: 300,
      nodes: [node('a', 60, 100), node('b', 700, 100)],
      edges: [],
      groups: [{ id: 'split', rect: { x: 40, y: 60, w: 800, h: 130 } }],
    };
    const diag = only(density(s), 'cluster_corridor')[0];
    expect(diag.evidence.axis).toBe('x');
    expect(diag.evidence.corridor).toBeGreaterThan(400);
    expect(diag.evidence.ratio as number).toBeGreaterThan(0.5);
  });

  it('混组层: 同层挤了两个分组的成员 → 报出层号与组名(实验里 3 处真痛中 2 处靠它抓到)', () => {
    const s = {
      width: 900, height: 300,
      nodes: [node('a', 40, 40), node('b', 400, 44), node('c', 40, 200)],
      edges: [],
      groups: [
        { id: 'g1', rect: { x: 20, y: 20, w: 300, h: 100 } },
        { id: 'g2', rect: { x: 380, y: 20, w: 300, h: 100 } },
      ],
    };
    const diag = only(density(s), 'mixed_cluster_row');
    expect(diag.length).toBe(1);
    expect(diag[0].evidence.row).toBe(0);
    expect(diag[0].evidence.clusters).toEqual(['g1', 'g2']);
    expect(density(s).metrics.mixed_cluster_rows).toBe(1);
  });

  it('长边反证: 单边图**不得**报警(首版正是在这里假警报 —— "长"只能是相对本图而言的)', () => {
    const single = { width: 500, height: 300, nodes: [node('a', 20, 20), node('b', 380, 220)], edges: [{ id: 'e', points: [{ x: 120, y: 45 }, { x: 380, y: 45 }, { x: 380, y: 220 }] }] };
    const m = density(single).metrics;
    expect(m.edge_med_rel).toBe(m.edge_max_rel); // 独苗: 中位数 = 最大值
    expect(only(density(single), 'long_edge')).toEqual([]);
    expect(m.long_edges).toBe(0);

    // 六条短边 + 一条横扫边 → 只报那一条, 并带出中位数基线(诊断自解释)
    const many = {
      width: 1000, height: 400,
      nodes: [node('a', 20, 20), node('b', 140, 20), node('c', 260, 20), node('d', 20, 180), node('e', 140, 180), node('f', 900, 20)],
      edges: [
        { id: 's1', points: [{ x: 120, y: 45 }, { x: 140, y: 45 }] },
        { id: 's2', points: [{ x: 240, y: 45 }, { x: 260, y: 45 }] },
        { id: 's3', points: [{ x: 70, y: 70 }, { x: 70, y: 180 }] },
        { id: 's4', points: [{ x: 190, y: 70 }, { x: 190, y: 180 }] },
        { id: 's5', points: [{ x: 310, y: 45 }, { x: 340, y: 45 }] },
        { id: 'long', points: [{ x: 120, y: 45 }, { x: 900, y: 45 }] },
      ],
    };
    const l = only(density(many), 'long_edge');
    expect(l.length).toBe(1);
    expect(l[0].subject).toEqual({ kind: 'edge', id: 'long' });
    expect(l[0].evidence.median).toBeLessThan(l[0].evidence.ratio as number);
    expect(l[0].supportedFixes[0].kind).toBe('reorder'); // 长边根因九成是两端排到画布两侧
  });

  it('组框互叠: 合法嵌套**不再**警示(260918 消误报), 成员互不相干的交叠仍警示', () => {
    // 合法嵌套(对照组): 框包含 + 成员同向包含 → 过去在这里误报"若非刻意嵌套", 现在必须安静
    const nested = {
      width: 600, height: 400,
      nodes: [node('a', 90, 90)],
      edges: [],
      groups: [{ id: 'outer', rect: { x: 40, y: 40, w: 400, h: 300 } }, { id: 'inner', rect: { x: 60, y: 60, w: 220, h: 140 } }],
    };
    expect(only(density(nested), 'cluster_overlap')).toEqual([]);
    expect(density(nested).metrics.cluster_overlap).toBe(0);

    // 反证(留下的那档): 框交叠而两边成员互不相干 —— 几何上说不过去又没人管, 这才是要警示的
    const alien = {
      width: 700, height: 400,
      nodes: [node('a', 60, 60), node('c', 340, 140)],
      edges: [],
      groups: [{ id: 'g1', rect: { x: 30, y: 30, w: 280, h: 140 } }, { id: 'g2', rect: { x: 180, y: 100, w: 300, h: 150 } }],
    };
    expect(only(density(alien), 'cluster_overlap').length).toBe(1);
    expect(density(alien).metrics.cluster_overlap).toBe(1);
    expect(density(alien).diagnostics.every((d) => d.severity === 'warning')).toBe(true);
  });

  it('接进 audit: 指标齐全, 且**只有 warning 时 pass 仍为 true**(启发式不许否决正确排版)', () => {
    const s = {
      width: 900, height: 400,
      nodes: [node('a', 70, 70, 100, 50, 'A'), node('b', 400, 70)],
      edges: [{ id: 'e', points: [{ x: 160, y: 85 }, { x: 400, y: 85 }] }],
      groups: [{ id: 'big', rect: { x: 30, y: 30, w: 730, h: 340 } }],
    };
    const r = audit(s);
    expect(codes(r)).toContain('cluster_corridor');
    expect(r.metrics.errors).toBe(0);
    expect(r.metrics.warnings).toBeGreaterThan(0);
    expect(r.pass).toBe(true); // ← 关键: 密度问题不拦出口
    for (const k of ['cluster_corridor_max', 'cluster_corridor_avg', 'cluster_corridor_px_max', 'cluster_coverage', 'cluster_overlap', 'rows', 'mixed_cluster_rows', 'edge_max_rel', 'edge_avg_rel', 'edge_med_rel', 'long_edges'])
      expect(typeof r.metrics[k]).toBe('number');
  });

  it('无分组 / 无边时给 -1 而不是 0(不用"零"冒充"没得测")', () => {
    const r = audit({ width: 300, height: 200, nodes: [node('a', 40, 40)], edges: [] });
    expect(r.metrics.cluster_corridor_max).toBe(-1);
    expect(r.metrics.edge_med_rel).toBe(-1);
    expect(r.metrics.cluster_coverage).toBe(0); // 这个 0 是真的零: 组框并集确实是 0
    // 坐标非有限时(短路分支)密度度量同样全 -1
    const bad = audit({ width: 300, height: 200, nodes: [{ id: 'a', rect: { x: NaN, y: 0, w: 1, h: 1 } }], edges: [] });
    expect(bad.metrics.cluster_corridor_max).toBe(-1);
    expect(bad.metrics.rows).toBe(-1);
  });
});
