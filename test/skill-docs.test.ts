// =====================================================================
// skill-docs · skill 正文与源码的**对账守卫**(260927)
//
// 由来: skill 正文里的码表与数字是**手写**的(它们的"含义"是人的经验, 不像值那样能从源码生成),
//   而手写清单必然与真值漂开。260927 实测: 24 个门禁码里有 6 个(`finite_svg` / `node_overlap` /
//   `edge_degenerate` / `cluster_member_outside` / `cluster_frame_cross` /
//   `cluster_nesting_contradiction`)**从未在 skill 正文出现过** —— 只装了 skill 的 agent 报出
//   这几个码时, 手上既没有 `src/` 也没有全表, 只能猜。
//
// 判据: `refs/diagnostics.md` 的三张门禁码表与 `src/knives/codes.ts` 的注册表**一一对应**
//   (不多不少不重)。内核加码而表没补 / 表里留着已删的码, `bun run verify` 当场红。
//
// 为什么这里不做"生成器 + `--check` 孪生"(archify 那种做法): 那一套的前提是产物**纯派生**
//   —— 本仓那份的范例是 `scripts/build-skill-shots.ts`(副本 + PNG + 清单全从源码算出来)。
//   码表的"含义 / 往哪修"两列要人写, 整份生成不了; 能派生的那半(码集合)用对账守卫钉住, 就是本文件。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AUDIT_CODES, CLUSTER_CODES, DENSITY_CODES, DIAGNOSTIC_CODES } from '../src/knives/codes';

const ROOT = join(import.meta.dir, '..');
const DOC = join(ROOT, 'skills/svg-infovis/refs/diagnostics.md');

/**
 * 表里首列 = 反引号包的码。只认**表格行**(行首是 `| \`code\` |`)—— 正文里顺口提到的码不算"登记",
 * 否则「口径」那节写一句 `node_gap` / `node_overlap` 就会把它算成表里的一行。
 */
const listedCodes = (md: string): string[] => [...md.matchAll(/^\| `([a-z][a-z0-9_]*)` \|/gm)].map((m) => m[1]);

/** 取某一节(`## 一、…` 到下一个 `## ` 之前) */
function section(md: string, title: string): string {
  const i = md.indexOf(title);
  if (i < 0) throw new Error(`diagnostics.md 里找不到小节「${title}」—— 标题改了就把守卫一起改`);
  const j = md.indexOf('\n## ', i + 1);
  return md.slice(i, j < 0 ? undefined : j);
}

describe('skill 正文 · 与源码对账', () => {
  it('门禁码全表与注册表一一对应(不多不少不重)', () => {
    const codes = listedCodes(readFileSync(DOC, 'utf8'));
    expect(codes.length, 'diagnostics.md 的码表里有重复行').toBe(new Set(codes).size);
    // 差集两边都要可见: 少一个 / 多一个都点名 —— 只钉一向会留下"永远绿"的缺口
    expect([...new Set(codes)].sort(), '门禁码表与 DIAGNOSTIC_CODES 对不上(缺的 / 多的都在这份差集里)')
      .toEqual([...DIAGNOSTIC_CODES].sort());
  });

  it('三张表各自只装自己那一组(码不串门)', () => {
    const md = readFileSync(DOC, 'utf8');
    for (const [title, table] of [
      ['## 一、audit', AUDIT_CODES],
      ['## 二、cluster', CLUSTER_CODES],
      ['## 三、density', DENSITY_CODES],
    ] as const) {
      expect(listedCodes(section(md, title)).sort(), `「${title}」这一段与它对应的注册表对不上`)
        .toEqual([...Object.values(table)].sort());
    }
  });

  it('判据自检: 表里塞一个未注册的码, 差集当场现形(否则这条守卫只是绿的摆设)', () => {
    const real = listedCodes(readFileSync(DOC, 'utf8'));
    expect([...real].sort()).toEqual([...DIAGNOSTIC_CODES].sort()); // 真表干净
    // 合成一份"内核加了码、表忘了补"的输入 —— 这正是缺口发生的那个瞬间
    const stale = [...real, 'brand_new_gate'].sort();
    expect(stale).not.toEqual([...DIAGNOSTIC_CODES].sort());
    // 反向: 表里留着一个已删的码
    const leftover = real.filter((c) => c !== 'finite_svg');
    expect(leftover).not.toEqual([...DIAGNOSTIC_CODES].sort());
  });
});
