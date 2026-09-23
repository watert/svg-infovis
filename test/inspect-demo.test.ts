// =====================================================================
// inspect 内置演示场景的判据 —— 从 `scripts/inspect.ts` 里搬出来的那一段
//
// 为什么单独成文件: 那段断言过去长在 CLI 内部, 只有"人真的跑一次 inspect"时才生效。它守的是一条
// 很容易被无声破坏的约定 —— **门禁缺省值 / 阈值改了, 内置示范场景仍必须全绿**(示范代码即规范)。
// 判据归 test 之后, `bun test` 每次都看它, 而示例脚本只负责"给人看"。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { DEMO } from '../scripts/inspect';
import { audit } from '../src/knives/audit';
import { deriveGroupRect } from '../src/scene';

describe('inspect · 内置演示场景必须全绿', () => {
  it('standard 与 showcase 两档都零诊断', () => {
    for (const level of ['standard', 'showcase'] as const) {
      const r = audit(DEMO, { level });
      expect(r.diagnostics.map((d) => `${d.code}@${d.subject.id}`)).toEqual([]);
      expect(r.pass).toBe(true);
    }
  });

  it('组框刻意写成"成员并集 + GROUP_FIT_PAD": 派生框与手写 rect 逐字相同', () => {
    // 这条守 demo 的自我一致性 —— 框比成员大或小, 读数里 derived 那行就会与 rect 分岔
    const box = DEMO.groups?.[0];
    expect(box).toBeDefined();
    expect(deriveGroupRect(DEMO, box!.id)).toEqual(box!.rect);
  });
});
