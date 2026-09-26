// =====================================================================
// 纪律编号的守卫(260927) —— 「纪律 N」是跨文件的稳定 ID, 但它只靠人肉记性撑着
//
// 病灶: `src/knives/audit.ts` / `src/shapes/embed.ts` / `templates/sequence.ts` / `ROADMAP.md` /
//   `QUICKREF.md` … 十来处散文引用都写成「纪律 9」「纪律 11」这种**位置型**引用。它们点不过去,
//   所以条数一改、条目一插, 引用就静默失真 —— 而这份全表恰好是"动手前必读"的那类文档,
//   失真意味着有人拿着错的条文改 core。散文纪律的存活率是 0(P1), 所以把它焊成判决。
//
// 判据两条, 各对应一种真实漂法:
//   ① 编号连续且从 1 起 —— 插入 / 重排 / 合并会把后面的编号整体推走(改条文可以, 改编号不行)
//   ② 全仓出现的每个「纪律 N」都必须存在 —— 删条 / 改号会让引用悬空
//
// ⚠ 扫描面是"散文", 不是"链接": 这些引用全在注释与文档正文里, 没有超链接可点 —— 所以只能扫文本。
//   计数式说法(「13 条纪律」/「纪律全表 13 条」)不会被误伤: 正则要求"纪律"后**紧跟**数字。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const POLICIES = join(ROOT, 'docs/internals/policies.md');

/** 扫到哪儿为止: 产物 / 依赖 / pi 的会话输出都不算"仓内散文" */
const SKIP = new Set(['node_modules', 'dist', '.git', '.pi', 'public']);
const TEXT = new Set(['.md', '.ts', '.tsx']);

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (TEXT.has(extname(e.name))) out.push(p);
  }
  return out;
}

/** 表里的条目编号 —— 只认 `N. \`[硬|换|味]\`` 这种行(表外的编号列表不会被误收) */
function policyIds(): number[] {
  return readFileSync(POLICIES, 'utf8')
    .split('\n')
    .map((l) => /^(\d+)\. `\[[硬换味]\]`/.exec(l)?.[1])
    .filter((x): x is string => x !== undefined)
    .map(Number);
}

describe('docs/internals/policies.md · 纪律编号是稳定 ID(引用它的人靠这两条兜着)', () => {
  it('编号连续且从 1 起 —— 加新条只许追加, 不许插入 / 重排 / 合并', () => {
    const ids = policyIds();
    expect(ids.length, '一条纪律都没解析出来 —— 条目行的格式变了?').toBeGreaterThan(0);
    expect(ids).toEqual(ids.map((_, i) => i + 1));
  });

  it('全仓每个「纪律 N」都落在表内(删条 / 改号会让引用悬空)', () => {
    const ids = new Set(policyIds());
    const dangling: string[] = [];
    for (const f of walk(ROOT)) {
      const text = readFileSync(f, 'utf8');
      for (const m of text.matchAll(/纪律\s?(\d+)/g)) {
        const n = Number(m[1]);
        if (!ids.has(n)) dangling.push(`${relative(ROOT, f)} → 纪律 ${n}`);
      }
    }
    expect(dangling, '这些引用指向表里不存在的编号 —— 要么补条文, 要么把引用改对').toEqual([]);
  });
});
