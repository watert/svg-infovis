// =====================================================================
// trunk-split-probe · 「分叉 / 合并」在现门禁下会怎么判 —— 复现用户报的场景
//
//   bun run test/trunk-split-probe.ts
//
// 拓扑:
//   ov ──┬──► ful      分叉: 两条边从 ov 右面**同一点**出发, 共用一段主干后分开
//        └──► state
//   state ──────► ful  合并: 两条边**同一点**进 ful 左面
//
// 想证明的: 共享主干/汇合点在**总线式画法**里是正常拓扑, 不是"两条边画重了"。
// 本探针只报数, 不修不改 —— 判决归 audit。
// =====================================================================

import { type Scene, audit } from '../src/knives/audit';
import { routeOrthogonal } from '../src/knives/route';

const ov = { x: 320, y: 140, w: 130, h: 54 };
const state = { x: 640, y: 250, w: 130, h: 54 };
const ful = { x: 880, y: 140, w: 130, h: 54 };

const r1 = routeOrthogonal({ from: ov, fromPort: { side: 'right' }, to: state, toPort: { side: 'left' } });
const r2 = routeOrthogonal({ from: ov, fromPort: { side: 'right' }, to: ful, toPort: { side: 'left' } });
const r3 = routeOrthogonal({ from: state, fromPort: { side: 'right' }, to: ful, toPort: { side: 'left' } });

export const scene: Scene = {
  width: 1100,
  height: 400,
  nodes: [
    { id: 'ov', rect: ov, label: 'Order Validate' },
    { id: 'state', rect: state, label: 'Order State' },
    { id: 'ful', rect: ful, label: 'Fulfillment' },
  ],
  edges: [
    { id: 'ov→state', from: 'ov', to: 'state', points: r1.points },
    { id: 'ov→ful', from: 'ov', to: 'ful', points: r2.points },
    { id: 'state→ful', from: 'state', to: 'ful', points: r3.points },
  ],
};

if (import.meta.main) {
  for (const e of scene.edges) {
    console.error(`${e.id.padEnd(12)} ${JSON.stringify(e.points.map((p) => [p.x, p.y]))}`);
  }
  console.error('');
  for (const level of ['standard', 'showcase'] as const) {
    const rep = audit(scene, { level });
    console.error(`=== ${level} → ${rep.pass ? 'PASS' : 'FAIL'} (errors=${rep.metrics.errors} warnings=${rep.metrics.warnings}) ===`);
    for (const d of rep.diagnostics) {
      console.error(`  [${d.severity}] ${d.code} @ ${d.subject.kind}:${d.subject.id} — ${d.message}`);
      console.error(`      evidence: ${JSON.stringify(d.evidence)}`);
    }
    if (rep.diagnostics.length === 0) console.error('  (无诊断)');
  }
  console.error('\n\n########## 反证: 放宽不许把真缺陷一起放走 ##########');
  process.exitCode = 0; // 本探针是**取证**, 不是出口 —— 判据在 test/ 里
}

// --- 反证三例 ---------------------------------------------------------
// 每例都只该报它那一类; 报 0 条 = 放宽过头, 报别的 = 判据串台。

type Case = { name: string; want: string[]; scene: Scene };
const box = (id: string, x: number, y: number, label: string) => ({ id, rect: { x, y, w: 120, h: 50 }, label });
const N1 = { x: 300, y: 120, w: 120, h: 50 };
const N2 = { x: 300, y: 260, w: 120, h: 50 };
const N3 = { x: 700, y: 120, w: 120, h: 50 };

export const CASES: Case[] = [
  {
    // 同一对节点之间的两条边画在一条线上 —— 两端全共享, 没有"分叉"可解释 → 照旧报
    name: 'N1 同对节点的重复边',
    want: ['edge_overlap', 'port_crowding'],
    scene: {
      width: 1000, height: 400,
      nodes: [box('a', N1.x, N1.y, 'A'), box('b', N3.x, N3.y, 'B')],
      edges: [
        { id: 'ab#1', from: 'a', to: 'b', points: routeOrthogonal({ from: N1, fromPort: { side: 'right' }, to: N3, toPort: { side: 'left' } }).points },
        { id: 'ab#2', from: 'a', to: 'b', points: routeOrthogonal({ from: N1, fromPort: { side: 'right' }, to: N3, toPort: { side: 'left' } }).points },
      ],
    },
  },
  {
    // 先各走各的、中途并到同一条轨上再分开 —— 读者追不出哪条进哪条出 → 照旧报
    name: 'N2 中段并轨',
    want: ['edge_overlap'],
    scene: {
      width: 1000, height: 400,
      nodes: [box('a', N1.x, N1.y, 'A'), box('b', N1.x, N2.y, 'B'), box('c', N3.x, N1.y, 'C'), box('d', N3.x, N2.y, 'D')],
      edges: [
        // a→d 与 b→c 走同一条中线, 重叠段在**两者中段**(既不是 a/b 的端口, 也不是 c/d 的端口)
        { id: 'a→d', from: 'a', to: 'd', points: routeOrthogonal({ from: N1, fromPort: { side: 'right' }, to: { x: N3.x, y: N2.y, w: 120, h: 50 }, toPort: { side: 'left' }, lane: 560 }).points },
        { id: 'b→c', from: 'b', to: 'c', points: routeOrthogonal({ from: N2, fromPort: { side: 'right' }, to: { x: N3.x, y: N1.y, w: 120, h: 50 }, toPort: { side: 'left' }, lane: 560 }).points },
      ],
    },
  },
  {
    // 有一端没写 to / 端点悬浮 —— 不受"分叉/汇合"豁免保护 → 照旧报
    name: 'N3 悬浮端点同点出发',
    want: ['port_crowding', 'edge_overlap'],
    scene: {
      width: 1000, height: 400,
      nodes: [box('hub', N1.x, N1.y, 'HUB')],
      edges: [
        { id: 'x', from: 'hub', points: [{ x: 420, y: 145 }, { x: 200, y: 145 }] },
        { id: 'y', from: 'hub', points: [{ x: 421, y: 145 }, { x: 200, y: 145 }, { x: 200, y: 300 }] },
      ],
    },
  },
  {
    // 这一例钉的是豁免的**几何条件**(「重叠段必须盖住公共前缀末端点」), 不是身份条件:
    // 两条边确实从 S 的同一个端口出发、也确实共享了一小段主干(公共前缀末端点 P = (190,160)),
    // 所以"有拓扑解释"那一关过得去 —— 但它们随后各走各的, 又在 y=300 上叠到同一条线,
    // 而那段重叠**不盖住 P** ⇒ 读者追不出哪条进哪条出, 必须照旧报。
    // (去掉那条几何条件 = 这一例静默通过, 变异可验: 见 test/trunk-split.test.ts 的「N4」)
    name: 'N4 同端口出发后在别处重新并轨',
    want: ['edge_overlap'],
    scene: {
      width: 1100, height: 520,
      nodes: [
        { id: 'S', rect: { x: 160, y: 40, w: 60, h: 60 }, label: 'src' },   // bottom 中点 (190,100)
        { id: 'A', rect: { x: 670, y: 380, w: 60, h: 60 }, label: 'A' },    // top 中点 (700,380)
        { id: 'B', rect: { x: 870, y: 380, w: 60, h: 60 }, label: 'B' },    // top 中点 (900,380)
      ],
      edges: [
        { id: 'e1', from: 'S', to: 'A', points: [{ x: 190, y: 100 }, { x: 190, y: 160 }, { x: 400, y: 160 }, { x: 400, y: 300 }, { x: 700, y: 300 }, { x: 700, y: 380 }] },
        { id: 'e2', from: 'S', to: 'B', points: [{ x: 190, y: 100 }, { x: 190, y: 160 }, { x: 250, y: 160 }, { x: 250, y: 300 }, { x: 900, y: 300 }, { x: 900, y: 380 }] },
      ],
    },
  },
];

function negativeCases(): void {
  for (const c of CASES) {
    const rep = audit(c.scene, { level: 'standard' });
    const codes = [...new Set(rep.diagnostics.map((d) => d.code))];
    const hit = codes.length > 0;
    console.error(`\n[${hit ? '报了 ✓' : '静默 ✗'}] ${c.name} (期望 ${c.want.join(' + ')}) → ${hit ? codes.join(' + ') : '(无诊断)'}`);
    for (const d of rep.diagnostics) console.error(`    ${d.code} @ ${d.subject.kind}:${d.subject.id} — ${d.message}`);
  }
}


// 反证放在文件末尾调用 —— `import.meta.main` 块在模块求值期跑, 而 CASES 是其后的 const(TDZ)
if (import.meta.main) negativeCases();
