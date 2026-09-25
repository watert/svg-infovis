// =====================================================================
// audit-demo 那份脏样本的判据 —— 从 `examples/checks/audit-demo.ts` 里搬出来的自检
//
// 为什么搬: 那段自检长在示例脚本内部, 只有"人真的跑一次"才生效, 而它守的是门禁最核心的一条契约
// —— **该抓的抓到、该放的放过**。搬进 test/ 之后每次 `bun test` 都看它, 示例只负责把诊断打给人看。
// 场景数据仍只有一份(`examples/checks/audit-demo.ts` 具名导出), 判据与展示不各写一遍。
//
// ⚠ 判据是**集合相等**不是"包含那四条": 埋四类违例的样本多冒出一条(曾经的 `no_backtrack` —— 手写
// 斜段夹在中间时相邻两段点积为负, 顺带就犯了)不算"四类都抓到了", 而是口径漂了。沉默的旁观者同样
// 要红: 这张图就是拿诊断清单当教材的, 多一条读者就会去问"第五类是哪一类"。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { clean, dirty } from '../examples/checks/audit-demo';
import { audit } from '../src/knives/audit';

/** 埋在 dirty 里的四类违例 —— 与 README / manifest 的「四类违例」同一口径 */
const BURIED = ['label_clearance', 'node_gap', 'node_overlap', 'orthogonal_edges'];

const codesOf = (level: 'standard' | 'showcase') =>
  [...new Set(audit(dirty, { level }).diagnostics.map((d) => d.code))].sort();

describe('audit-demo · 脏样本埋的违例必须逐条命中', () => {
  const std = audit(dirty, { level: 'standard' });
  const loose = audit(dirty, { level: 'showcase' });

  it('两档的诊断 code 集都**恰好**是埋的那四类, 且判 FAIL', () => {
    expect(codesOf('standard')).toEqual([...BURIED].sort());
    expect(codesOf('showcase')).toEqual([...BURIED].sort());
    expect(std.pass).toBe(false);
    expect(loose.pass).toBe(false);
  });

  it('showcase 不比 standard 松', () => {
    expect(loose.diagnostics.length).toBeGreaterThanOrEqual(std.diagnostics.length);
    expect(loose.metrics.errors).toBeGreaterThanOrEqual(std.metrics.errors);
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
