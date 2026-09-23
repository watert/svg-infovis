// =====================================================================
// edge_overlap 单测 · 门禁⑫(260918 第四轮, Mermaid 对账)
//
// 两种都是"看起来是一条线": ① 同向共线重叠 ≥8px; ② 同向近平行(投影重叠 ≥8px 且 0<垂距<7px)。
// 断言钉住四件事:
//   · 共线与近平行的分界(垂距 = 0 归共线那条, > 0 才是近平行)
//   · 垂距 ≥7px 放行 —— 分得清就是两条线, 不该报
//   · 十字交叉 / 不同朝向 不算重叠(那是 crossings 的事)
//   · 去重: **同一对边只出一条**, 但不许把另外两对也吞掉
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { type Diagnostic, type Scene, type SceneEdge, audit } from '../src/knives/audit';

const HITS = (diags: Diagnostic[]): Diagnostic[] => diags.filter((d) => d.code === 'edge_overlap');
const kindOf = (d: Diagnostic): string => d.evidence.kind as unknown as string;
const pairOf = (d: Diagnostic): string[] => [d.subject.id, d.evidence.other as string];

/** 无边节点的纯边场景: 只测重叠, 不让端口/贴合门禁插嘴 */
const bare = (edges: SceneEdge[]): Scene => ({ width: 400, height: 300, nodes: [], edges });

describe('edge_overlap · 边重叠双查', () => {
  it('① 两条边有 60px 画在同一条线上 → collinear', () => {
    const r = audit(bare([
      { id: 'a', points: [{ x: 20, y: 100 }, { x: 300, y: 100 }] },
      { id: 'b', points: [{ x: 40, y: 100 }, { x: 100, y: 100 }, { x: 100, y: 200 }] },
    ]));
    const hit = HITS(r.diagnostics);
    expect(hit).toHaveLength(1);
    expect(kindOf(hit[0])).toBe('collinear');
    expect(pairOf(hit[0])).toEqual(['a', 'b']);
    expect(hit[0].evidence.overlap).toBe(60);
  });

  it('反证 ①: 共线但只重叠 5px(< 8px)→ 放行, 不许把"擦肩而过"当叠线', () => {
    const r = audit(bare([
      { id: 'a', points: [{ x: 20, y: 100 }, { x: 100, y: 100 }, { x: 100, y: 200 }] },
      { id: 'b', points: [{ x: 95, y: 100 }, { x: 300, y: 100 }] },
    ]));
    expect(HITS(r.diagnostics)).toHaveLength(0);
  });

  it('② 两条边平行相距 3px、投影重叠 40px → near_parallel(看得见但分不清)', () => {
    const r = audit(bare([
      { id: 'a', points: [{ x: 20, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 200 }] },
      { id: 'b', points: [{ x: 20, y: 103 }, { x: 240, y: 103 }, { x: 240, y: 260 }] },
    ]));
    const hit = HITS(r.diagnostics);
    expect(hit).toHaveLength(1);
    expect(kindOf(hit[0])).toBe('near_parallel');
    expect(hit[0].evidence.gap).toBe(3);
    expect(hit[0].evidence.overlap).toBe(180);
  });

  it('反证 ②: 相距 7px 及以上就放行 —— 分得清就是两条线', () => {
    // 注意拐点 x 也要错开(否则两条竖段会在同一个 x 上真重叠, 那是另一码事)
    const atGap = (gap: number): number =>
      HITS(audit(bare([
        { id: 'a', points: [{ x: 20, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 200 }] },
        { id: 'b', points: [{ x: 20, y: 100 + gap }, { x: 240, y: 100 + gap }, { x: 240, y: 260 }] },
      ])).diagnostics).length;
    expect(atGap(6.5)).toBe(1);
    expect(atGap(7)).toBe(0); // 判据是严格小于 7
    expect(atGap(20)).toBe(0);
  });

  it('反证 ②: 平行但投影完全不重叠(前后错开)不算 —— 重叠是沿轴算的', () => {
    const r = audit(bare([
      { id: 'a', points: [{ x: 20, y: 100 }, { x: 100, y: 100 }, { x: 100, y: 200 }] },
      { id: 'b', points: [{ x: 200, y: 103 }, { x: 300, y: 103 }, { x: 300, y: 200 }] },
    ]));
    expect(HITS(r.diagnostics)).toHaveLength(0);
  });

  it('反证: 十字交叉 / 朝向不同不算重叠(那是 crossings 与 orthogonal 的事)', () => {
    const r = audit(bare([
      { id: 'a', points: [{ x: 20, y: 150 }, { x: 300, y: 150 }] },
      { id: 'b', points: [{ x: 160, y: 40 }, { x: 160, y: 260 }] },
    ]));
    expect(HITS(r.diagnostics)).toHaveLength(0);
    expect(r.metrics.crossings).toBe(1); // 交叉照旧计进 metrics, 只是不判违例
  });

  it('去重: 同一对边有多处叠线, 只出一条诊断, 且取重叠最狠的那处', () => {
    // a 与 b 在 y=100 上有两处共线: x 60..120(叠 60px) 与 x 220..320(叠 100px)
    const r = audit(bare([
      { id: 'a', points: [{ x: 20, y: 100 }, { x: 120, y: 100 }, { x: 120, y: 60 }, { x: 220, y: 60 }, { x: 220, y: 100 }, { x: 320, y: 100 }] },
      { id: 'b', points: [{ x: 60, y: 100 }, { x: 120, y: 100 }, { x: 120, y: 140 }, { x: 220, y: 140 }, { x: 220, y: 100 }, { x: 320, y: 100 }] },
    ]));
    const hit = HITS(r.diagnostics);
    expect(hit).toHaveLength(1);
    expect(hit[0].evidence.overlap).toBe(100);
  });

  it('不许连坐: 三对边两两相叠 → 出三条诊断(每对一条), 不是一条也不是九条', () => {
    const r = audit(bare([
      { id: 'a', points: [{ x: 20, y: 100 }, { x: 300, y: 100 }] },
      { id: 'b', points: [{ x: 20, y: 160 }, { x: 300, y: 160 }] },
      { id: 'c', points: [{ x: 20, y: 220 }, { x: 300, y: 220 }] },
    ]));
    expect(HITS(r.diagnostics)).toHaveLength(0); // 三条各自相距 60px, 互不重叠

    const overlapping = audit(bare([
      { id: 'a', points: [{ x: 20, y: 100 }, { x: 300, y: 100 }] },
      { id: 'b', points: [{ x: 20, y: 100 }, { x: 300, y: 100 }] },
      { id: 'c', points: [{ x: 20, y: 100 }, { x: 300, y: 100 }] },
    ]));
    expect(HITS(overlapping.diagnostics)).toHaveLength(3); // a-b / a-c / b-c
    expect([...HITS(overlapping.diagnostics).map((d) => pairOf(d).join('|'))].sort()).toEqual(['a|b', 'a|c', 'b|c']);
  });

  it('V/V 分支: 两条竖直边在同一个 x 上重叠 → collinear(全部用例都是 H/H 会漏掉这条分支)', () => {
    const r = audit(bare([
      { id: 'a', points: [{ x: 120, y: 20 }, { x: 120, y: 260 }, { x: 200, y: 260 }] },
      { id: 'b', points: [{ x: 120, y: 80 }, { x: 120, y: 240 }] },
    ]));
    const hit = HITS(r.diagnostics);
    expect(hit).toHaveLength(1);
    expect(kindOf(hit[0])).toBe('collinear');
    expect(hit[0].evidence.overlap).toBe(160);
    expect(hit[0].evidence.at).toEqual([120, 80]); // 重叠区间起点(不是段起点 y=20)
  });

  it('近平行是 warning(可读性)而不是 error —— 5~6px 的平行长轨不该被判死', () => {
    const r = audit(bare([
      { id: 'a', points: [{ x: 20, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 200 }] },
      { id: 'b', points: [{ x: 20, y: 105 }, { x: 240, y: 105 }, { x: 240, y: 260 }] },
    ]));
    const hit = HITS(r.diagnostics);
    expect(hit).toHaveLength(1);
    expect(hit[0].severity).toBe('warning');
    expect(r.pass).toBe(true);
    expect(r.metrics.edge_collinear).toBe(0);
  });

  it('共线重叠是 error(信息丢失: 两条边画成一条)', () => {
    const r = audit(bare([
      { id: 'a', points: [{ x: 20, y: 100 }, { x: 300, y: 100 }] },
      { id: 'b', points: [{ x: 20, y: 100 }, { x: 300, y: 100 }] },
    ]));
    expect(HITS(r.diagnostics)[0].severity).toBe('error');
    expect(r.pass).toBe(false);
    expect(r.metrics.edge_collinear).toBe(1);
  });

  it('metrics: 共线重叠不计 min_parallel_gap; 有近平行时给最小垂距; 都没有时 -1', () => {
    const collinearOnly = audit(bare([
      { id: 'a', points: [{ x: 20, y: 100 }, { x: 300, y: 100 }] },
      { id: 'b', points: [{ x: 20, y: 100 }, { x: 300, y: 100 }] },
    ]));
    expect(collinearOnly.metrics.edge_overlap).toBe(1);
    expect(collinearOnly.metrics.min_parallel_gap).toBe(-1);

    const parallel = audit(bare([
      { id: 'a', points: [{ x: 20, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 200 }] },
      { id: 'b', points: [{ x: 20, y: 103 }, { x: 200, y: 103 }, { x: 200, y: 260 }] },
    ]));
    expect(parallel.metrics.min_parallel_gap).toBe(3);
  });
});
