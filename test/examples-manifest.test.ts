// =====================================================================
// `examples/manifest.ts` 的判据 —— "只有一份清单"这句承诺的托底
//
// 为什么值得进 test: 这次分桶重组的**全部收益**就是"清单只有一份", 而这句话本身若不设门禁,
// 就只是散文里的一句好话。合并前三份清单(脚本的 ITEMS 表 / SKILL 文件地图一串逗号 / 人脑子里)
// 已经漂过一次 —— 新增示例忘了登记, 就跑不到快照, 而且**没有任何东西会响**。
//
// 四条判据, 每条都对应一种真实漂法:
//   ① key 唯一      —— `key` 就是 PNG 名; 同义两名会让 `build-example-pngs.sh <key>` 语义含糊
//   ② file 落盘     —— 登记了一个不存在的路径, 出图时才炸(而那时人已经离开了)
//   ③ 桶表 ≡ 清单   —— 人读面(README 桶表)与机读面(manifest)必须同一次改, 否则又长回"三份"
//   ④ 快照落盘      —— "登记了但没出图" 是最容易漏的一步, 且后果是**静默的**(旧 PNG 还在, 看着正常)
//
// ③ 是这里最值钱的一条: 它把"两处必须同一次改"从 SOP 的一句话变成一次 `bun test` 的判决。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXAMPLES, GROUP_LABEL } from '../examples/manifest';

const SKILL = join(import.meta.dir, '..');
const README = join(SKILL, 'examples', 'README.md');
const BUILD = join(SKILL, 'scripts', 'build-example-pngs.sh');

/** README 桶表每行形如 `| `basic` | `start/basic.ts` | 描述… |` —— 只认第一列，够用且不易误伤 */
const readmeKeys = (): string[] =>
  readFileSync(README, 'utf8')
    .split('\n')
    .map((l) => /^\|\s*`([a-z0-9-]+)`\s*\|/.exec(l)?.[1])
    .filter((k): k is string => k !== undefined);

describe('examples/manifest · 清单的单一来源', () => {
  it('key 唯一 —— key 就是 PNG 名, 不许同义两名', () => {
    const keys = EXAMPLES.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('每条登记的文件都真实落盘', () => {
    const missing = EXAMPLES.filter((e) => !existsSync(join(SKILL, e.file))).map((e) => e.file);
    expect(missing).toEqual([]);
  });

  it('每条都有一句"这张图证明什么", 且桶名在册', () => {
    for (const e of EXAMPLES) {
      expect(e.what.length, `${e.key} 缺 what`).toBeGreaterThan(0);
      expect(GROUP_LABEL[e.group], `${e.key} 的 group 不在 GROUP_LABEL 里`).toBeTruthy();
    }
  });

  it('examples/README.md 的桶表与清单**逐键一致**(两处必须同一次改)', () => {
    const fromReadme = [...new Set(readmeKeys())].sort();
    const fromManifest = [...new Set(EXAMPLES.map((e) => e.key))].sort();
    // 差集自己说出来, 别只给一个 toEqual 的失败(读的人要的是"漏了哪个/多了哪个")
    const onlyManifest = fromManifest.filter((k) => !fromReadme.includes(k));
    const onlyReadme = fromReadme.filter((k) => !fromManifest.includes(k));
    expect({ onlyManifest, onlyReadme }).toEqual({ onlyManifest: [], onlyReadme: [] });
  });

  it('每条登记的都已有 PNG 快照 —— "登记了没出图"是静默的', () => {
    const missing = EXAMPLES.filter((e) => !existsSync(join(SKILL, 'examples', 'images', `${e.key}.png`)))
      .map((e) => e.key);
    expect(missing).toEqual([]);   // 补法: `scripts/build-example-pngs.sh <key>`
  });

  it('build-example-pngs.sh 里没有第二份 ITEMS 表(清单只许有一处)', () => {
    const src = readFileSync(BUILD, 'utf8');
    expect(/ITEMS\s*=\s*\(/.test(src), '脚本又自己带了一份清单 —— 请改回问 examples/manifest.ts').toBe(false);
    expect(src).toContain('examples/manifest.ts --tsv');
  });
});
