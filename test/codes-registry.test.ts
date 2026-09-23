// =====================================================================
// codes-registry · 门禁码注册表的**单向判据**(260919)
//
// 由来: 门禁码过去只以字面量活在发射点里, 消费方(demo 的覆盖表)只能手抄一份 —— 手抄清单
// 迟早与真值漂开, 于是"门禁加了、覆盖表不知道"是迟早的事, 而覆盖表的信用一破, 它证明的
// "全绿"就全是假证据。修法是 `src/knives/codes.ts` 做单一来源; **本文件是它的判据**。
//
// 判据两条(差集必须可见, 本仓惯用手法):
//   ① 三把刀在样本 scene 上**实际产出的码 ⊆ 注册表** —— 新码不登记, 这里当场点名它;
//   ② 注册表里的每个码都**被样本真跑出来过** —— 空集合 ⊆ 任何集合, 只做 ① 会留下一个
//      "永远绿"的缺口; 所以反面也要钉: 少一个码就红, 并点名是谁。
//      副作用是刻意的: **加码要交两样东西 —— 登记, 和一个能把它喊出来的样本**。
//      没有样本的码等于没验过, 那就等于回到"手抄一份清单"的老路。
//
// 码集一律取自 `audit()` / `clusterAudit()` / `density()` 的**真实产物**, 不写期望值
// (期望值就是手抄清单, 正是本文件要杀的那件事)。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { type Scene, audit } from '../src/knives/audit';
import { clusterAudit, type ClusterTier } from '../src/knives/cluster';
import { density } from '../src/knives/density';
import { AUDIT_CODES, CLUSTER_CODES, DENSITY_CODES, DIAGNOSTIC_CODES } from '../src/knives/codes';

// --- 判据工具 ----------------------------------------------------------

/** 注册表(判据只跟它比; 表本身来自 core, 不在这里重抄一遍 code 字面量) */
const REGISTRY = new Set<string>(DIAGNOSTIC_CODES);

/** 产出码里**没登记**的那些 —— 差集就是判据本身: 空 = 登记表跟得上代码 */
const unregistered = (codes: Iterable<string>): string[] =>
  [...new Set(codes)].filter((c) => !REGISTRY.has(c)).sort();

/** 三把刀在同一份 scene 上的产出码(去重排序; audit 内部也调 cluster, 重合不算问题) */
const producedCodes = (s: Scene, tier: ClusterTier = 'set'): string[] =>
  [...new Set([
    ...audit(s, { clusterTier: tier }).diagnostics.map((d) => d.code),
    ...clusterAudit(s, { tier }).diags.map((d) => d.code),
    ...density(s).diagnostics.map((d) => d.code),
  ])].sort();

// --- 样本(每个只负责喊出它那几条) -------------------------------------

const S = (over: Partial<Scene>): Scene => ({ width: 400, height: 300, nodes: [], edges: [], ...over });
const node = (id: string, x: number, y: number, w = 100, h = 40) => ({ id, rect: { x, y, w, h } });

const SAMPLES: Array<{ id: string; scene: Scene; tier?: ClusterTier }> = [
  // audit 十五项
  { id: 'finite', scene: S({ labels: [{ id: 'L', at: { x: 200, y: 150 }, width: 40, height: NaN }] }) },
  { id: 'outside', scene: S({ nodes: [node('wide', 360, 20)] }) },
  { id: 'slant', scene: S({ edges: [{ id: 'slant', points: [{ x: 40, y: 40 }, { x: 140, y: 40 }, { x: 146, y: 90 }] }] }) },
  {
    id: 'crowded',
    // h=50: a 占 y 20..70, b 从 74 起 → 间距 4px(node_gap); c 骑在 a 上(node_overlap)
    scene: S({
      nodes: [
        { id: 'a', rect: { x: 20, y: 20, w: 100, h: 50 } },
        { id: 'b', rect: { x: 20, y: 74, w: 100, h: 50 } },
        { id: 'c', rect: { x: 30, y: 40, w: 100, h: 50 } },
      ],
    }),
  },
  {
    id: 'label-on-edge',
    scene: S({
      edges: [{ id: 'e', points: [{ x: 200, y: 20 }, { x: 200, y: 280 }] }],
      labels: [{ id: 'L', at: { x: 200, y: 150 }, width: 60, height: 20 }],
    }),
  },
  {
    id: 'text-on-edge',
    scene: S({
      edges: [{ id: 'e', points: [{ x: 200, y: 20 }, { x: 200, y: 280 }] }],
      texts: [{ id: 't', rect: { x: 170, y: 140, w: 60, h: 20 }, text: '旁注' }],
    }),
  },
  {
    id: 'text-on-node',
    scene: S({ nodes: [node('n', 160, 60, 120, 60)], texts: [{ id: 't', rect: { x: 170, y: 80, w: 80, h: 20 }, text: '旁注' }] }),
  },
  {
    // ⑲ owner_ref(260923): 归属引用的**幽灵** —— 指向一条不存在的边。位置挑在空处, 免得顺手再喊别的
    id: 'owner-ref',
    scene: S({
      edges: [{ id: 'e', points: [{ x: 40, y: 260 }, { x: 360, y: 260 }] }],
      texts: [{ id: 't', rect: { x: 60, y: 60, w: 80, h: 20 }, text: '旁注', owner: { kind: 'edge', id: 'gone' } }],
    }),
  },
  { id: 'label-fit', scene: S({ nodes: [{ ...node('n', 40, 40, 60, 40), label: '装不下的长标签文案' }] }) },
  {
    id: 'pierce',
    scene: S({ nodes: [node('n', 180, 120, 80, 60)], edges: [{ id: 'e', points: [{ x: 0, y: 150 }, { x: 400, y: 150 }] }] }),
  },
  {
    id: 'backtrack',
    scene: S({ width: 1200, height: 800, edges: [{ id: 'e', points: [{ x: 841, y: 277 }, { x: 859, y: 277 }, { x: 390, y: 277 }, { x: 390, y: 620 }] }] }),
  },
  { id: 'degenerate', scene: S({ edges: [{ id: 'ghost', points: [{ x: 40, y: 40 }] }] }) },
  {
    id: 'port-crowd',
    scene: S({
      nodes: [node('hub', 100, 100)],
      edges: [
        { id: 'a', from: 'hub', points: [{ x: 100, y: 120 }, { x: 60, y: 120 }, { x: 60, y: 60 }] },
        { id: 'b', from: 'hub', points: [{ x: 101, y: 120 }, { x: 40, y: 120 }, { x: 40, y: 60 }] },
      ],
    }),
  },
  {
    id: 'short-stub',
    scene: S({
      nodes: [node('left', 20, 100, 60, 60), node('right', 200, 200)],
      edges: [{ id: 'e', from: 'left', to: 'right', points: [{ x: 80, y: 140 }, { x: 196, y: 140 }, { x: 196, y: 220 }, { x: 200, y: 220 }] }],
    }),
  },
  {
    id: 'edge-overlap',
    scene: S({
      edges: [
        { id: 'a', points: [{ x: 20, y: 100 }, { x: 300, y: 100 }] },
        { id: 'b', points: [{ x: 40, y: 100 }, { x: 100, y: 100 }, { x: 100, y: 200 }] },
      ],
    }),
  },
  // cluster 四项
  {
    id: 'cluster-member-outside',
    scene: S({ width: 800, height: 500, nodes: [node('a', 60, 60), node('b', 400, 300)], groups: [{ id: 'g', rect: { x: 40, y: 40, w: 240, h: 120 }, contains: ['a', 'b'] }] }),
  },
  {
    id: 'cluster-cross',
    scene: S({
      width: 800, height: 500,
      nodes: [node('a', 60, 60), node('b', 260, 160), node('c', 400, 250)],
      groups: [
        { id: 'A', rect: { x: 40, y: 40, w: 300, h: 200 }, contains: ['a', 'b'] },
        { id: 'B', rect: { x: 240, y: 140, w: 300, h: 200 }, contains: ['b', 'c'] },
      ],
    }),
  },
  {
    id: 'cluster-nesting(tree)',
    tier: 'tree',
    scene: S({
      width: 800, height: 500,
      nodes: [node('a', 120, 120, 80, 40), node('b', 400, 120, 80, 40)],
      groups: [
        { id: 'outer', rect: { x: 40, y: 40, w: 600, h: 400 }, contains: ['a'] },
        { id: 'inner', rect: { x: 100, y: 100, w: 160, h: 100 }, contains: ['b'] },
      ],
    }),
  },
  {
    id: 'cluster-overlap',
    scene: S({
      width: 800, height: 500,
      nodes: [node('a', 60, 60), node('c', 400, 300)],
      groups: [
        { id: 'A', rect: { x: 40, y: 40, w: 300, h: 200 }, contains: ['a'] },
        { id: 'B', rect: { x: 240, y: 140, w: 300, h: 200 }, contains: ['c'] },
      ],
    }),
  },
  // density 四项
  {
    id: 'corridor',
    scene: S({
      width: 1200, height: 600,
      nodes: [node('a', 60, 100), node('b', 900, 100)],
      groups: [{ id: 'g', rect: { x: 40, y: 80, w: 1000, h: 100 }, contains: ['a', 'b'] }],
    }),
  },
  {
    id: 'mixed-row',
    scene: S({
      width: 800, height: 500,
      nodes: [node('a', 60, 60), node('b', 400, 60)],
      groups: [
        { id: 'A', rect: { x: 40, y: 40, w: 200, h: 120 }, contains: ['a'] },
        { id: 'B', rect: { x: 380, y: 40, w: 200, h: 120 }, contains: ['b'] },
      ],
    }),
  },
  {
    id: 'long-edge',
    scene: S({
      edges: [
        { id: 's1', points: [{ x: 40, y: 40 }, { x: 90, y: 40 }] },
        { id: 's2', points: [{ x: 40, y: 80 }, { x: 90, y: 80 }] },
        { id: 's3', points: [{ x: 40, y: 120 }, { x: 90, y: 120 }] },
        { id: 's4', points: [{ x: 40, y: 160 }, { x: 90, y: 160 }] },
        { id: 'long', points: [{ x: 100, y: 260 }, { x: 350, y: 260 }] },
      ],
    }),
  },
];

/** 所有样本的产出码合起来(判据的输入就是这个集合) */
const ALL_PRODUCED = SAMPLES.flatMap((s) => producedCodes(s.scene, s.tier ?? 'set'));

// --- 判据 --------------------------------------------------------------

describe('codes-registry · 三把刀的码与注册表单向对齐', () => {
  it('注册表自洽: 键即值, 三张表两两不交, 汇总表无重复且条数 = 各表之和', () => {
    for (const [group, table] of [['AUDIT', AUDIT_CODES], ['CLUSTER', CLUSTER_CODES], ['DENSITY', DENSITY_CODES]] as const) {
      // 键写成码本身: `grep <code> src/` 能同时命中注册行与发射点, 否则码字面量只剩一处、搜不到谁在用
      expect(Object.entries(table).filter(([k, v]) => k !== v), `${group} 表里键与值不一致`).toEqual([]);
    }
    // 显式标 `string[][]`: 三张表的字面量元组类型互不相同, 联合起来会让 `includes` 的入参收成 never
    const groups: string[][] = [Object.values(AUDIT_CODES), Object.values(CLUSTER_CODES), Object.values(DENSITY_CODES)];
    expect([...new Set(DIAGNOSTIC_CODES)].length).toBe(DIAGNOSTIC_CODES.length); // 汇总表无重复
    expect(DIAGNOSTIC_CODES.length).toBe(groups.reduce((n, g) => n + g.length, 0));
    // 一个码只归一把刀 —— 两边都登记会让"谁在喊"这件事失去分辨力
    const overlap = groups.flatMap((a, i) => groups.slice(i + 1).flatMap((b) => a.filter((c) => b.includes(c))));
    expect(overlap).toEqual([]);
  });

  it('① 三把刀在样本上实际产出的码 ⊆ 注册表(差集必须可见)', () => {
    expect(unregistered(ALL_PRODUCED)).toEqual([]);
  });

  it('② 反向: 注册表里的每个码都被某个样本真跑出来过(空集 ⊆ 任何集合, 只做 ① 会留缺口)', () => {
    const covered = new Set(ALL_PRODUCED);
    // 差集为空 + 点名: 加了码却没交样本时, 这条会直接报出缺的是谁
    expect(DIAGNOSTIC_CODES.filter((c) => !covered.has(c))).toEqual([]);
  });

  it('判据自检: 往真实产出里塞一个未登记的码, 差集当场现形(否则这条判据只是绿的摆设)', () => {
    const real = producedCodes(SAMPLES[0].scene);
    expect(unregistered(real)).toEqual([]); // 真实产出干净
    // 合成输入: 门禁加了、注册表忘了登记 —— 这正是"覆盖表不知道"的那个瞬间
    expect(unregistered([...real, 'brand_new_gate'])).toEqual(['brand_new_gate']);
  });

  it('注册表可被消费方直接遍历(demo 拿它做覆盖表, 不必再手抄)', () => {
    expect([...DIAGNOSTIC_CODES]).toEqual([...Object.values(AUDIT_CODES), ...Object.values(CLUSTER_CODES), ...Object.values(DENSITY_CODES)]);
    expect(DIAGNOSTIC_CODES.length).toBe(24); // 19 项门禁(16 个 code) + 组语义 4 + 密度 4 —— 见 codes.ts 的口径说明
  });
});
