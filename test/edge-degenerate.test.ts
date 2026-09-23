// =====================================================================
// edge_degenerate 单测 · 门禁⑬(260918 第四轮补, 原"候选第十项")
//
// 这道门禁存在的理由有点特殊: 其余边级门禁**全都**以 `pts.length >= 2` 为前提,
// 于是"这条边根本画不出来"恰好落在所有门禁的缝里。两盒左右紧贴时 route 会吐 1 个点
// (`[{x:200,y:130}]`, 端口并成一个), 产物上无长度无箭头而审计全绿 —— 这个用例就是它的现场。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { type Diagnostic, type Scene, type SceneEdge, audit } from '../src/knives/audit';
import { routeOrthogonal } from '../src/knives/route';

const HITS = (diags: Diagnostic[]): Diagnostic[] => diags.filter((d) => d.code === 'edge_degenerate');
const kindOf = (d: Diagnostic): string => d.evidence.kind as unknown as string;

/** 一个空场景 + 若干条边(节点不是本门禁的重点, 这里不放节点免得别的门禁插手) */
const bare = (edges: SceneEdge[]): Scene => ({ width: 400, height: 300, nodes: [], edges });

describe('edge_degenerate · 看不见的边', () => {
  it('① 只有 1 个折点 → missing_points: 老门禁全跳过它, 这条边画出来什么都没有', () => {
    const r = audit(bare([{ id: 'ghost', points: [{ x: 40, y: 40 }] }]));
    const hit = HITS(r.diagnostics);
    expect(hit).toHaveLength(1);
    expect(kindOf(hit[0])).toBe('missing_points');
    expect(hit[0].evidence.points).toBe(1);
    expect(r.pass).toBe(false);
    expect(r.metrics.degenerate_edges).toBe(1);
  });

  it('② 折点列是空数组 → missing_points(不是"干净", 是"没东西可画")', () => {
    const hit = HITS(audit(bare([{ id: 'empty', points: [] }])).diagnostics);
    expect(hit).toHaveLength(1);
    expect(kindOf(hit[0])).toBe('missing_points');
    expect(hit[0].evidence.points).toBe(0);
  });

  it('③ 折点列根本不是数组 → missing_points, 且**不抛**(审计不许变成报错)', () => {
    const bad = { id: 'not-array', points: undefined } as unknown as SceneEdge;
    const scene = bare([bad]);
    const r = audit(scene);
    const hit = HITS(r.diagnostics);
    expect(hit).toHaveLength(1);
    expect(kindOf(hit[0])).toBe('missing_points');
    // 纯函数: 读侧兜底不许改写入参
    expect((scene.edges[0] as { points?: unknown }).points).toBeUndefined();
  });

  it('④ 两点完全重合 → collapsed(归一化后塌成一个点)', () => {
    const hit = HITS(audit(bare([{ id: 'dot', points: [{ x: 40, y: 40 }, { x: 40, y: 40 }] }])).diagnostics);
    expect(hit).toHaveLength(1);
    expect(kindOf(hit[0])).toBe('collapsed');
  });

  it('⑤ 半像素以下 → zero_length; 越过阈值就放行(判据是严格小于 0.5px)', () => {
    const at = (len: number): Diagnostic[] =>
      HITS(audit(bare([{ id: 'tiny', points: [{ x: 40, y: 40 }, { x: 40 + len, y: 40 }] }])).diagnostics);
    expect(at(0.3)).toHaveLength(1);
    expect(kindOf(at(0.3)[0])).toBe('zero_length');
    expect(at(0.3)[0].evidence.length).toBe(0.3);
    expect(at(0.5)).toHaveLength(0); // 恰好 0.5px 算过
    expect(at(2)).toHaveLength(0);
  });

  it('反证: 正常的 2 点直连边不报 —— 这条门禁只抓"看不见", 不抓"短"', () => {
    const r = audit(bare([{ id: 'ok', points: [{ x: 40, y: 40 }, { x: 240, y: 40 }] }]));
    expect(HITS(r.diagnostics)).toHaveLength(0);
    expect(r.metrics.min_edge_length).toBe(200);
  });

  it('集成(现场复现): 两盒左右紧贴时 route 吐出 1 个点 —— 这条隐形边必须被点名', () => {
    const A = { x: 100, y: 100, w: 100, h: 60 };
    const B = { x: 200, y: 100, w: 100, h: 60 }; // 与 A 共享 x=200 那条边 → 端口并成一个点
    const routed = routeOrthogonal({ from: A, fromPort: { side: 'right' }, to: B, toPort: { side: 'left' } });
    expect(routed.points).toHaveLength(1); // 工具自己吐的退化折点列
    const r = audit({
      width: 500,
      height: 300,
      nodes: [{ id: 'A', rect: A }, { id: 'B', rect: B }],
      edges: [{ id: 'e', from: 'A', to: 'B', points: routed.points }],
    });
    const hit = HITS(r.diagnostics);
    expect(hit).toHaveLength(1);
    expect(kindOf(hit[0])).toBe('missing_points');
    // 修法必须诚实: 这是几何的必然结果, 先拉开间距(而不是"调参数")
    expect(hit[0].supportedFixes.some((f) => f.kind === 'gap-nodes')).toBe(true);
    expect(r.pass).toBe(false);
  });

  it('metrics: min_edge_length 无值时给 -1; finite 短路时两项都给 -1(不用 0 冒充)', () => {
    const onlyGhost = audit(bare([{ id: 'ghost', points: [{ x: 10, y: 10 }] }]));
    expect(onlyGhost.metrics.min_edge_length).toBe(-1);

    const nanEdge = audit({ width: 200, height: 200, nodes: [], edges: [{ id: 'n', points: [{ x: NaN, y: 10 }, { x: 40, y: 10 }] }] });
    expect(nanEdge.metrics.degenerate_edges).toBe(-1);
    expect(nanEdge.metrics.min_edge_length).toBe(-1);
    expect(nanEdge.diagnostics.map((d) => d.code)).toEqual(['finite_svg']);
  });
});
