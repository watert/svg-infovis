// 探针: fan-out 的几种「共享端点」形态各长出什么折点列 / 过什么门禁
//   bun run test/shared-trunk-probe.ts
//
// 结论(260920): 豁免的关键不是"共享了端点", 而是**重叠段盖住公共前缀末端点** ——
//   A 主干+总线(公共前缀 (170,100)→(170,200), 重叠段是它后面的水平段)  ⇒ 豁免 ✓ 这是树形图该有的样子
//   C 端口摊开+同 lane(公共前缀只剩端口一个点, 重叠段离它十万八千里)    ⇒ 不豁免 ✓ 那是真中段并轨
// 顶层纯几何(不打印), import 它拿 sceneA / sceneB 是安全的。

import { type Scene } from '../src/knives/audit';
import { audit } from '../src/knives/audit';
import { routeOrthogonal, type RouteRequest } from '../src/knives/route';
import { assignLanes } from '../src/knives/lanes';

const W = 1300, H = 620;
const src = { x: 60, y: 40, w: 220, h: 60 };
const targets = [0, 1, 2, 3, 4].map((i) => ({ x: 420 + i * 130, y: 300, w: 110, h: 60 }));

const sceneOf = (pts: Array<{ x: number; y: number }[]>): Scene => ({
  width: W, height: H,
  nodes: [{ id: 'src', rect: src, label: 'root' }, ...targets.map((r, i) => ({ id: `t${i}`, rect: r, label: `child-${i}` }))],
  edges: pts.map((p, i) => ({ id: `e${i}`, from: 'src', to: `t${i}`, points: p })),
});

// A: 同端口(bottom 中点) + 不给 lane —— 都从同一个点出发, 自动中线全相同
const A: RouteRequest[] = targets.map((t) => ({
  from: src, fromPort: { side: 'bottom' as const }, to: t, toPort: { side: 'top' as const },
}));
// B: 同端口 + assignLanes
const { reqs: laned, plan } = assignLanes(A);
// C: 端口摊开 + **同一个** lane(模拟"故意的主干")
const Cbase: RouteRequest[] = targets.map((t, i) => ({
  from: src, fromPort: { side: 'bottom' as const, t: i / 4 }, to: t, toPort: { side: 'top' as const },
}));
const C = Cbase.map((r) => ({ ...r, lane: 200 }));
// D: 端口摊开 + 各自 lane(lanes-fanout 的"端口摊开"那一支)
const D = assignLanes(Cbase).reqs;

const CASES: Array<{ tag: string; reqs: RouteRequest[] }> = [
  { tag: 'A 同端口 + 自动中线(全相同)', reqs: A },
  { tag: 'B 同端口 + assignLanes', reqs: laned },
  { tag: 'C 端口摊开 + 同一条 lane', reqs: C },
  { tag: 'D 端口摊开 + assignLanes', reqs: D },
];

/** 具名导出: 临时渲染脚本读这两份看观感; 判据在 `test/trunk-split.test.ts` 直接读 sceneA / sceneC */
export const sceneA: Scene = sceneOf(A.map((r) => routeOrthogonal(r).points));
export const sceneB: Scene = sceneOf(laned.map((r) => routeOrthogonal(r).points));
export const sceneC: Scene = sceneOf(C.map((r) => routeOrthogonal(r).points));
export const plans = plan;

if (import.meta.main) {
  console.error(`B 的分配: lanes=${JSON.stringify(plan.lanes)} bands=${plan.bands.length}`);
  for (const { tag, reqs } of CASES) {
    const res = reqs.map((r) => routeOrthogonal(r));
    const rep = audit(sceneOf(res.map((r) => r.points)), { level: 'standard' });
    console.error(`\n########## ${tag} ##########`);
    res.forEach((r, i) => console.error(`  e${i}: ${JSON.stringify(r.points.map((p) => [p.x, p.y]))}`));
    console.error(`  → ${rep.pass ? 'PASS' : 'FAIL'} errors=${rep.metrics.errors} warnings=${rep.metrics.warnings}`);
    for (const d of rep.diagnostics) {
      console.error(`     [${d.severity}] ${d.code} @${d.subject.kind}:${d.subject.id} — ${d.message}`);
    }
  }
  process.exitCode = 0; // 探针是取证, 不是出口 —— 判据在 test/trunk-split.test.ts
}
