// =====================================================================
// audit-demo · 门禁脏样本: 故意埋四类违例, 把诊断逐条打出来给人看(含 evidence 与 supportedFixes)
//   bun run examples/checks/audit-demo.ts > /tmp/dirty.svg     (违例元素描红, 方便肉眼对账)
//
// 它**不自带判据** —— "违例真的被抓住 / 修法真的给得出来 / 两档判分真的分得开"由
// `test/audit-demo.test.ts` 守着(judgment 归 test, 示例只管展示; 详见 SKILL「出口纪律」)。
// 两个场景**具名导出**, 就是为了让那份测试与这份展示读同一份数据。
// ⚠ 它是**非出口示例**: 出图走裸 `toSVG`, 不过门禁 —— 故意画的违例本来就过不了门禁。
// =====================================================================

import { type Scene, audit } from '../../src/knives/audit';
import { sceneChildren } from '../../src/export';
import { svg } from '../../src/descriptor';
import { toSVG } from '../../src/serialize';

/** 一份"看起来没问题、其实埋了四类违例"的 scene */
export const dirty: Scene = {
  width: 560,
  height: 340,
  nodes: [
    { id: 'a', rect: { x: 60, y: 30, w: 120, h: 46 }, label: 'A · 正常' },
    { id: 'b', rect: { x: 60, y: 170, w: 120, h: 46 }, label: 'B · 正常' },
    // 违例①: 与 b 垂直间距只有 4px(标准档要 ≥8, showcase 要 ≥12)
    { id: 'crowd', rect: { x: 62, y: 220, w: 120, h: 46 }, label: 'C · 贴太近' },
    // 违例②: 完全压在 b 上(重叠)
    { id: 'overlap', rect: { x: 70, y: 178, w: 100, h: 30 }, label: 'D · 重叠' },
  ],
  edges: [
    { id: 'ok', from: 'a', to: 'b', points: [{ x: 120, y: 76 }, { x: 120, y: 120 }, { x: 320, y: 120 }, { x: 320, y: 170 }] },
    // 违例③: 斜段(第 2 段 x 从 320 到 326, 偏离 6px)
    { id: 'skew', from: 'b', to: 'crowd', points: [{ x: 320, y: 216 }, { x: 326, y: 243 }, { x: 180, y: 243 }] },
  ],
  labels: [
    { id: 'L-own', at: { x: 220, y: 120 }, width: 58, height: 19, ownerEdge: 'ok', text: '自家标签' }, // 自家边 → 豁免
    // 违例④: 这个标签压在 ok 边的竖段上(净空 0), 而它属于 skew 边 → 不豁免
    { id: 'L-cross', at: { x: 320, y: 150 }, width: 56, height: 19, ownerEdge: 'skew', text: '跨界标签' },
  ],
};

export const clean: Scene = {
  width: 420,
  height: 260,
  nodes: [
    { id: 'x', rect: { x: 40, y: 30, w: 110, h: 44 }, label: 'X' },
    { id: 'y', rect: { x: 250, y: 170, w: 110, h: 44 }, label: 'Y' },
  ],
  edges: [{ id: 'e', from: 'x', to: 'y', points: [{ x: 95, y: 74 }, { x: 95, y: 120 }, { x: 305, y: 120 }, { x: 305, y: 170 }] }],
  labels: [{ id: 'L', at: { x: 200, y: 120 }, width: 44, height: 19, ownerEdge: 'e', text: 'route' }],
};

const show = (title: string, scene: Scene, level: 'standard' | 'showcase') => {
  const r = audit(scene, { level });
  console.error(`\n=== ${title} · ${level} → ${r.pass ? 'PASS' : 'FAIL'} ===`);
  console.error('metrics:', Object.entries(r.metrics).map(([k, v]) => `${k}=${v}`).join('  '));
  for (const d of r.diagnostics) {
    console.error(`  [${d.severity.toUpperCase()}] ${d.code} @ ${d.subject.kind}:${d.subject.id} — ${d.message}`);
    console.error(`      evidence: ${JSON.stringify(d.evidence)}`);
    for (const f of d.supportedFixes) console.error(`      fix: ${f.kind} — ${f.hint}`);
  }
  if (!r.diagnostics.length) console.error('  (无诊断)');
  return r;
};

const r1 = show('dirty scene', dirty, 'standard');
show('dirty scene', dirty, 'showcase');
show('clean scene', clean, 'showcase');

// 断言式自检已搬进 `test/audit-demo.test.ts`(同一份 `dirty` / `clean` 数据, 逐条断言"该抓的抓到、
// 该放的放过、两档判分分得开、每条诊断都带 supportedFixes")。本文件只负责把诊断打出来给人看。

// 出图: 把 dirty scene 画出来, 违例元素描红(方便肉眼对账)
// **渲染面直接吃 sceneChildren** —— 不再手拼 children, 否则又是一处"渲染与审计漂开"的入口
if (import.meta.main) {
  const red = new Set(r1.diagnostics.map((d) => d.subject.id));
  const overrides = <T,>(ids: string[], patch: T) => Object.fromEntries(ids.map((id) => [id, patch]));
  const children = sceneChildren(dirty, {
    nodeStyles: overrides([...red].filter((id) => dirty.nodes.some((n) => n.id === id)), { stroke: '#dc2626' }),
    edgeStyles: overrides([...red].filter((id) => dirty.edges.some((e) => e.id === id)), { color: '#dc2626' }),
  });
  process.stdout.write(toSVG(svg(dirty.width, dirty.height, children, { 'font-family': 'ui-sans-serif, system-ui, sans-serif' }), { declaration: false }));
}
