// =====================================================================
// `examples/manifest.ts` 的判据 —— "只有一份清单"这句承诺的托底
//
// 为什么值得进 test: 这次分桶重组的**全部收益**就是"清单只有一份", 而这句话本身若不设门禁,
// 就只是散文里的一句好话。合并前三份清单(脚本的 ITEMS 表 / SKILL 文件地图一串逗号 / 人脑子里)
// 已经漂过一次 —— 新增示例忘了登记, 就跑不到图(网站画廊里少一张卡), 而且**没有任何东西会响**。
//
// 四条判据, 每条都对应一种真实漂法:
//   ① key 唯一      —— `key` 是这张图的**产物名**(`website/public/svg/<key>.svg`); 同义两名会让产物名含糊
//   ② file 落盘     —— 登记了一个不存在的路径, 出图时才炸(而那时人已经离开了)
//   ③ 桶表 ≡ 清单   —— 人读面(README 桶表)与机读面(manifest)必须同一次改, 否则又长回"三份"
//   ④ 网站不带清单  —— 站点管线自带一份 key 表 = 又一处分叉, 而它出的图没人对账
//
// ③ 是这里最值钱的一条: 它把"两处必须同一次改"从 SOP 的一句话变成一次 `bun test` 的判决。
// ④ 盯的是 260926 之后的新形态: PNG 快照与 `scripts/build-example-pngs.sh` 已退役(仓库不囤二进制
// 生成物), 全量出图归网站管线 —— 而它必须**问清单**, 不许自己列一遍 key: `AGENTS.md` 那句
// "新增示例只要登记 manifest, 站点自动多一张卡"就靠这条兜着。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXAMPLES, GROUP_LABEL } from '../examples/manifest';

const SKILL = join(import.meta.dir, '..');
const README = join(SKILL, 'examples', 'README.md');
const PRERENDER = join(SKILL, 'website', 'scripts', 'prerender.ts');

/** README 桶表每行形如 `| `basic` | `start/basic.ts` | 描述… |` —— 只认第一列，够用且不易误伤 */
const readmeKeys = (): string[] =>
  readFileSync(README, 'utf8')
    .split('\n')
    .map((l) => /^\|\s*`([a-z0-9-]+)`\s*\|/.exec(l)?.[1])
    .filter((k): k is string => k !== undefined);

describe('examples/manifest · 清单的单一来源', () => {
  it('key 唯一 —— key 就是产物名(website/public/svg/<key>.svg), 不许同义两名', () => {
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

  it('网站管线里没有第二份 key 表 —— 它必须问清单(清单只许有一处)', () => {
    const src = readFileSync(PRERENDER, 'utf8');
    expect(src, '站点管线自带清单了 —— 请改回 import examples/manifest.ts').toContain('examples/manifest.ts');
    // 硬编码任何一个 key 都是"第二份清单"的开头(产物路径那条模板串 `svg/<key>.svg` 不含具体 key, 不算)
    const hardcoded = EXAMPLES.map((e) => e.key).filter((k) => src.includes(`'${k}'`));
    expect(hardcoded, '这些 key 被写死在网站管线里了').toEqual([]);
  });
});
