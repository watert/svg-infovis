// =====================================================================
// lanes-fanout · 一源多目标的 fan-out 有两种画法, 选错了要么丑要么出不来
//
//   bun run examples/checks/lanes-fanout.ts > /tmp/lanes-fanout.svg
//   bun run examples/checks/lanes-fanout.ts --audit     (只打印三态对照, 不出图)
//
// ---------------------------------------------------------------------
// ① **共享端点模式**(默认, 零手工): 所有边吃源盒的**同一个端口点**。
//    自动中线(两 stub 中点)对所有边都相同 ⇒ 自然长出「主干 + 水平总线」——
//    而这两段共线是**拓扑本身**: 读者沿主干走、到某个分叉点拐出去, 就是那条边。
//    门禁的「分叉 / 汇合」豁免认得它(见 audit.ts `sharedTopologyOwner` / `sharedPrefixEnd`),
//    于是**一个字都不用声明**, 一棵树就出来了。这是 fan-out 该有的样子。
//
// ② **端口摊开模式**(每条边有自己的端口, 例如端口按目标 x 比例分布):
//    此时共线**是真的丢信息** —— N 条平行线在中途汇到同一条水平线上再分开, 谁也看不出
//    哪条进哪条出。门禁照旧喊 `edge_overlap`, 得交给 `assignLanes` 各自错开。
//    什么时候需要这一支: 边要从**不同端口**出发(端口本身就是语义, 如"上/下行分口"),
//    或者目标是 `right`/`left` 这类侧向面、主干讲不通。
//
// 判据归 `test/route-lanes.test.ts`(端口摊开那一支的前红后绿)与 `test/trunk-split.test.ts`
// (共享端点那一支的豁免边界, 含"中段并轨不许豁免"的反证); 示例只展示对照, 不自己写断言。
//
// 顶层是**纯几何**: 不打印、不写流, `import` 它拿 `scene` 是安全的(inspect / web 都能直接读)。
// =====================================================================

import { type Scene } from '../../src/knives/audit';
import { routeAll, type RouteRequest } from '../../src/knives/route';
import { assignLanes } from '../../src/knives/lanes';
import { audit } from '../../src/knives/audit';
import { packRow } from '../../src/geometry/pack';
import { THEMES } from '../../src/theme';
import { runScene } from '../../scripts/runner';
import { isMainModule } from '../../src/runtime';

const W = 1200;
const H = 520;

// 源节点在左上, 5 个目标在右下横排 —— 单侧扇出(所有水平段都朝右, 于是必然有一段共享走廊)
const src = { x: 60, y: 40, w: 220, h: 60 };
// 5 个目标横排: 节距 130 = 盒宽 110 + 缝 20 —— 排布走 packRow(只有起点与那一行的 y 是作者决策)
const targets = packRow({ items: Array.from({ length: 5 }, () => ({ w: 110, h: 60 })), pitch: 130, y: 300, x0: 420, align: 'start' }).rects;

/** 折点列 → 一张能 audit 的 scene */
const sceneOf = (pts: Array<{ x: number; y: number }[]>): Scene => ({
  width: W, height: H,
  nodes: [
    { id: 'src', rect: src, label: 'root' },
    ...targets.map((r, i) => ({ id: `t${i}`, rect: r, label: `child-${i}` })),
  ],
  edges: pts.map((p, i) => ({ id: `e${i}`, from: 'src', to: `t${i}`, points: p })),
});

// ---- ① 共享端点: 都吃 bottom 面中点, 零手工 --------------------------------------
const shared = sceneOf(routeAll(targets.map((t): RouteRequest => ({
  from: src, fromPort: { side: 'bottom' }, to: t, toPort: { side: 'top' },
}))).map((r) => r.points));

// ---- ② 端口摊开: 端口按目标分布, **不给** lane ⇒ 中途并轨 --------------------------
const spreadReqs: RouteRequest[] = targets.map((t, i) => ({
  from: src, fromPort: { side: 'bottom', t: i / 4 }, to: t, toPort: { side: 'top' },
}));
const spread = sceneOf(routeAll(spreadReqs).map((r) => r.points));

// ---- ③ 端口摊开 + assignLanes: 各自错开 -----------------------------------------
const { reqs: laned, plan } = assignLanes(spreadReqs);
const spaced = sceneOf(routeAll(laned).map((r) => r.points));

/** 具名导出: 主推的 ① 共享端点那张 —— `scripts/inspect.ts` 与 web 展示都能直接读 */
export const scene: Scene = shared;
/** 另两张留给外部对账(反例 / 分配后), 不想读就当它不存在 */
export const referenceScenes = { spread, spaced } as const;

if (isMainModule(import.meta.url)) {
  // 诊断走 stderr —— 产物才走 stdout(见 SKILL「出口纪律」: 别让诊断混进 SVG)
  const report = (s: Scene) => audit(s, { level: 'showcase' });
  const overlap = (s: Scene) => report(s).diagnostics.filter((d) => d.code === 'edge_overlap');
  const line = (tag: string, s: Scene) => {
    const r = report(s);
    console.error(`  ${tag.padEnd(30)} edge_overlap ${String(overlap(s).length).padStart(2)} 条 · `
      + `pass=${String(r.pass).padEnd(5)} (errors=${r.metrics.errors} warnings=${r.metrics.warnings})`);
  };

  console.error('fan-out 的三种画法(同一份节点、同一批目标):');
  line('① 共享端点, 零手工', shared);
  line('② 端口摊开, 不给 lane', spread);
  line('③ 端口摊开 + assignLanes', spaced);
  console.error(`\n  assignLanes 分配: lanes=${JSON.stringify(plan.lanes)} · bands=${plan.bands.length}`);
  for (const d of plan.diagnostics) console.error(`  [${d.severity}] ${d.code}: ${d.message}`);
  console.error('  ①②③ 每边都是 4 个折点(2 折); 判据不在水平段落哪条 y —— ① 与 ② 的水平段'
    + '同样都落在 y=200 上。真正的差别是**起点**: ① 五条边同端口同起点(共享前缀是一条线),'
    + ' ② 的起点被摊到 5 个不同 x(垂直线段各自独立), 却在 y=200 上汇到同一条线再分开 ——'
    + '那种共线是真的丢信息, 门禁只放行前者。');

  // 出口 fail-closed(见 SKILL「出口纪律」): 不过即抛, 但异常带草稿图; 判决落到 exit code。
  // ② 是**故意留的反例**, 不进 exit code —— "反例必须真红 / 分配前必须真共线"这两条判据归
  // `test/trunk-split.test.ts` 与 `test/route-lanes.test.ts`(断言长在示例内部时, 只有人真的
  // 跑那一次它才生效)。
  if (!process.argv.includes('--audit')) {
    // 出图走 `scripts/runner.ts`(260920): 摘要 / 诊断 / 草稿 / exit code 都在那一处(见该文件头注)
    runScene(shared, { level: 'showcase', theme: THEMES.light, fit: true, title: 'fan-out · 共享端点模式' });
  } else if (!report(shared).pass) {
    process.exitCode = 1;
  }
}
