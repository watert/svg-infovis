// =====================================================================
// audit-demo 那份脏样本的判据 —— 从 `examples/audit-demo.ts` 里搬出来的自检
//
// 为什么搬: 那段自检长在示例脚本内部, 只有"人真的跑一次"才生效, 而它守的是门禁最核心的一条契约
// —— **该抓的抓到、该放的放过**。搬进 test/ 之后每次 `bun test` 都看它, 示例只负责把诊断打给人看。
// 场景数据仍只有一份(`examples/audit-demo.ts` 具名导出), 判据与展示不各写一遍。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { clean, dirty } from '../examples/checks/audit-demo';
import { audit } from '../src/knives/audit';

describe('audit-demo · 脏样本埋的违例必须逐条命中', () => {
  const std = audit(dirty, { level: 'standard' });
  const loose = audit(dirty, { level: 'showcase' });
  const codes = new Set(std.diagnostics.map((d) => d.code));

  it('四类埋的违例都被抓出来, 且判 FAIL', () => {
    for (const code of ['node_gap', 'node_overlap', 'orthogonal_edges', 'label_clearance']) {
      expect(codes.has(code)).toBe(true);
    }
    expect(std.pass).toBe(false);
  });

  it('showcase 不比 standard 松', () => {
    expect(loose.diagnostics.length).toBeGreaterThanOrEqual(std.diagnostics.length);
  });

  it('干净场景全过 —— 该放的放过', () => {
    expect(audit(clean, { level: 'showcase' }).pass).toBe(true);
  });

  it('每条诊断都带 evidence 与可执行修法(纪律 11: 没旋钮托底的报错不许立项)', () => {
    expect(std.diagnostics.every((d) => d.evidence !== undefined)).toBe(true);
    expect(std.diagnostics.every((d) => d.supportedFixes.length > 0)).toBe(true);
  });

  it('自家边的标签被豁免: label_clearance 只报跨界那一条', () => {
    expect(std.diagnostics.filter((d) => d.code === 'label_clearance').length).toBe(1);
  });
});
