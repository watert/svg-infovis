// =====================================================================
// skill 参考图 · 副本 / 指纹 / 清单的守卫(260926)
//
// 背景: skill 里那三张「真图 + 真代码」是给**只装了 skill 的 agent**校准用的样本 —— 一旦静默过时,
// 它比没有更坏(agent 会照着一张旧图学出一个旧写法)。而它过时的路子有三条, 每条都要有人看着:
//
//   ① **源改了, 副本没重出** —— 副本是逐字节拷贝, 直接比字节(免重算)
//   ② **内核改了字节 / 示例改了图, PNG 没重出** —— 比 `renderSha256`(导出指纹)
//   ③ **清单里有、README 表里没有**(或反过来) —— 又长回"两份清单"那个老毛病
//
// ⚠ **PNG 的字节不做基线**: 栅格化器随机器而变(rsvg-convert / qlmanage, 版本不同字节就不同),
//    拿它当基线会在别人机器上假红 —— 这是"字节确定性"那条纪律的**边界**(它约束 core 产物,
//    不约束别人机器上的栅格化器)。钉住的是**产物字节**那一层(指纹), PNG 是不是对着这一版出的,
//    由指纹这一条兜住。
// 重生命令(红了的正解, 别手改产物):
//   bun run scripts/build-skill-shots.ts
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SHOTS, SHOTS_DIR, readPngSize, type Shot } from '../scripts/build-skill-shots';

const ROOT = join(import.meta.dir, '..');
const DIR = join(ROOT, SHOTS_DIR);
const README = join(DIR, 'README.md');
const manifest = (
  JSON.parse(readFileSync(join(DIR, 'shots.json'), 'utf8')) as { note: string; shots: Shot[] }
).shots;

const sha256 = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex');

describe('skill 参考图 · 副本 / 指纹 / 清单的守卫', () => {
  it('shots.json 与生成器的 SHOTS 逐键同序(清单不许手改, 也不许有人只改一边)', () => {
    expect(manifest.map((s) => s.key)).toEqual(SHOTS.map((s) => s.key));
    expect(manifest.map((s) => s.source)).toEqual(SHOTS.map((s) => s.source));
  });

  it('副本与仓内源逐字节相同(读本过时 = agent 学一个旧写法)', () => {
    const drifted = manifest
      .filter((s) => !readFileSync(join(ROOT, s.copy)).equals(readFileSync(join(ROOT, s.source))))
      .map((s) => s.copy);
    expect(drifted, '副本与源不一致 —— 跑 bun run scripts/build-skill-shots.ts 重出').toEqual([]);
  });

  it('导出指纹没过期(内核改了字节 / 示例改了图, 图就得重出)', () => {
    const stale = manifest
      .filter((s) => {
        const r = spawnSync('bun', ['run', s.source], { cwd: ROOT, encoding: 'buffer' });
        return r.status !== 0 || sha256(r.stdout) !== s.renderSha256;
      })
      .map((s) => `${s.key}(${s.source})`);
    expect(stale, '图与指纹对不上 —— 跑 bun run scripts/build-skill-shots.ts 重出').toEqual([]);
  });

  it('PNG 是合法 PNG, 且尺寸与清单一致(空文件 / 半截图 / 栅格化器没按声明宽出图)', () => {
    for (const s of manifest) {
      const p = join(ROOT, s.png);
      expect(existsSync(p), `缺 PNG: ${s.png}`).toBe(true);
      const size = readPngSize(readFileSync(p));
      expect(size, `${s.png} 不是合法 PNG`).not.toBeNull();
      expect({ w: size!.width, h: size!.height }, `${s.png} 的尺寸与 shots.json 对不上`)
        .toEqual({ w: s.pngWidth, h: s.pngHeight });
    }
  });

  it('examples/README.md 的表与清单逐键一致(两处必须同一次改)', () => {
    const fromReadme = [...new Set(
      readFileSync(README, 'utf8').split('\n')
        .map((l) => /^\|\s*`([a-z0-9-]+)`\s*\|/.exec(l)?.[1])
        .filter((k): k is string => k !== undefined),
    )].sort();
    const fromManifest = [...new Set(manifest.map((s) => s.key))].sort();
    expect({
      onlyManifest: fromManifest.filter((k) => !fromReadme.includes(k)),
      onlyReadme: fromReadme.filter((k) => !fromManifest.includes(k)),
    }).toEqual({ onlyManifest: [], onlyReadme: [] });
  });

  it('三张图各自的 ts / png 都真在 skill 目录里(清单指向不存在的文件 = 安装后读不到)', () => {
    const missing = manifest
      .flatMap((s) => [s.copy, s.png])
      .filter((p) => !existsSync(join(ROOT, p)));
    expect(missing).toEqual([]);
  });
});
