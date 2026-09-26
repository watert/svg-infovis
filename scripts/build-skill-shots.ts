// =====================================================================
// build-skill-shots · 出 skill 自带的参考图与源码副本(260926)
//
// 干什么: 把**仓内三份活体示例**连图带代码搬进 `skills/svg-infovis/examples/`, 让"只装了本 skill、
//   没有 clone 也没有 src/"的 agent 也能对着**一张真图 + 一份真代码**校准(这是它唯一的用途)。
//
// 产物三件一套, 每个 key 各一份:
//   · `<key>.ts`      仓内源文件的**逐字节副本**(不重排、不改 import —— 见下)
//   · `<key>.svg`     不出盘; 它是中间态(`bun run <source>` 的 stdout), 只用来算指纹与栅格化
//   · `<key>.png`     栅格化结果(渲染宽度见下), 给 agent 的**眼睛**读
//   · `shots.json`    机读清单: 每个 key 的源路径 / 副本路径 / PNG 路径 / 渲染宽度 / **导出指纹**
//
// 三条设计取舍(改这个脚本前先认下):
//   · **副本逐字节, 不重写 import**。这三份的 import 是**仓根视角**的相对路径(`../../src/index`),
//     搬进 skill 目录后**不能跑** —— 这是有意的: 它是"读本", 不是"可运行副本"。重写 import 就得
//     同时造出口样板, 而那份样板已经在 QUICKREF「30 秒起手」里有一份(第二份必然漂)。
//     ⚠ 因此**别**把 `skills/` 加进 tsconfig 的 include: 那份相对 import 在 skill 目录下解析不到。
//   · **PNG 不做字节守卫**。栅格化器随机器而变(rsvg / qlmanage, 版本不同字节就不同), 拿它当基线
//     会在别人机器上假红。守卫改钉**导出指纹**(`renderSha256` = `bun run <source>` stdout 的 sha256):
//     内核一改字节, 指纹即过期 → 提醒重出; 而 PNG 是不是"对着这一版图"出的, 由指纹这一条兜住。
//   · **渲染宽度**: `max(1200, 自然宽)`。图是矢量, 放大重渲不糊; 统一到 1200 是为了让 agent 读得清
//     (交付尺寸仍看根 `<svg>` 的 `width` —— PNG 只是给人看的渲染, 不是交付件)。
//
// 用法(改了内核 / 改了这三份示例之后):
//   bun run scripts/build-skill-shots.ts
// 判据: `test/skill-shots.test.ts`(副本逐字节 / 指纹 / PNG 头与尺寸 / README 表一致)
// =====================================================================

import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { isMainModule } from '../src/runtime.js';

const ROOT = resolve(import.meta.dir, '..');
/** skill 里的参考图目录 —— 与 npm 包同一份(`files` 白名单里有 `skills`) */
export const SHOTS_DIR = 'skills/svg-infovis/examples';
/** PNG 宽度下限: 低于它 agent 读不清; 自然宽更宽时以自然宽为准(只放大不缩) */
const RENDER_MIN_WIDTH = 1200;

/** 三个 key 与它们的**仓根相对**源路径 —— 顺序即产物顺序, 别按字母重排(diff 要稳) */
export const SHOTS = [
  { key: 'sequence-archify-style', source: 'templates/sequence-archify-style.ts' },
  { key: 'lifecycle-agent-run', source: 'examples/gallery/lifecycle-agent-run.ts' },
  { key: 'academic-figure', source: 'examples/gallery/academic-figure.ts' },
] as const;

export type Shot = {
  key: string;
  /** 仓根相对: 真身(示例源) */
  source: string;
  /** skill 相对: 逐字节副本 */
  copy: string;
  /** skill 相对: 渲染图 */
  png: string;
  /** PNG 的像素宽 / 高(守卫拿它核对 PNG 头) */
  pngWidth: number;
  pngHeight: number;
  /** `bun run <source>` stdout 的 sha256 —— 产物字节的指纹, 唯一那条"图过没过期"的判据 */
  renderSha256: string;
};

/** PNG 的 IHDR 尺寸(纯字节读, 零依赖: 签名 8 字节 + 长度 4 + 类型 4, 宽高各 4 字节大端) */
export function readPngSize(buf: Buffer): { width: number; height: number } | null {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 24 || !buf.subarray(0, 8).equals(sig)) return null;
  if (buf.subarray(12, 16).toString('latin1') !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const sha256 = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex');

/** 根 `<svg>` 的声明宽度(取第一个 `width="…"`; 认小数, 序列化器写的是两位小数) */
const declaredWidth = (svg: string): number => {
  const m = /<svg[^>]*\bwidth="([0-9.]+)"/.exec(svg) ?? /\bwidth="([0-9.]+)"/.exec(svg);
  if (!m) throw new Error('产物里找不到 width 声明 —— 不是一张自产的 SVG?');
  return Math.ceil(Number(m[1]));
};

/** 出一张图: 只收 stdout(stderr 是诊断, 混进来会烂在 SVG 头部 —— 别 2>&1) */
function exportSvg(file: string): Buffer {
  const r = spawnSync('bun', ['run', file], { cwd: ROOT, encoding: 'buffer' });
  const head = r.stdout.subarray(0, 200).toString('utf8').replace(/^\uFEFF/, '').trim();
  if (r.status !== 0) {
    throw new Error(`bun run ${file} 退出码 ${r.status}\n${r.stderr.toString('utf8')}`);
  }
  if (!head.startsWith('<svg') && !head.startsWith('<?xml')) {
    throw new Error(`bun run ${file} 的 stdout 不是 SVG(头部: ${head.slice(0, 60)})`);
  }
  return r.stdout;
}

function build(): Shot[] {
  const dir = join(ROOT, SHOTS_DIR);
  mkdirSync(dir, { recursive: true });
  const tmp = mkdtempSync(join(tmpdir(), 'skill-shots-'));
  const out: Shot[] = [];
  try {
    for (const { key, source } of SHOTS) {
      const src = readFileSync(join(ROOT, source));
      const svg = exportSvg(source);
      const width = Math.max(RENDER_MIN_WIDTH, declaredWidth(svg.toString('utf8')));

      writeFileSync(join(dir, `${key}.ts`), src); // 逐字节副本
      const svgPath = join(tmp, `${key}.svg`);
      writeFileSync(svgPath, svg);
      const pngPath = join(dir, `${key}.png`);
      const r = spawnSync(join(ROOT, 'scripts/svg2png.sh'), [svgPath, pngPath, String(width)], {
        cwd: ROOT, encoding: 'utf8',
      });
      if (r.status !== 0) throw new Error(`svg2png.sh 失败: ${r.stderr}`);

      const size = readPngSize(readFileSync(pngPath));
      if (!size) throw new Error(`${key}.png 不是合法 PNG`);
      if (size.width !== width) console.error(`⚠ ${key}: 栅格化器没按声明宽出图(${size.width} ≠ ${width})`);
      out.push({
        key, source, copy: `${SHOTS_DIR}/${key}.ts`, png: `${SHOTS_DIR}/${key}.png`,
        pngWidth: size.width, pngHeight: size.height, renderSha256: sha256(svg),
      });
      console.error(`✓ ${key}: ${size.width}×${size.height} · ${sha256(src).slice(0, 8)} → ${sha256(svg).slice(0, 8)}`);
    }
    const json = {
      note: '机读清单 —— 由 `bun run scripts/build-skill-shots.ts` 生成, 别手改; 守卫在 test/skill-shots.test.ts',
      shots: out,
    };
    writeFileSync(join(dir, 'shots.json'), JSON.stringify(json, null, 2) + '\n');
    console.error(`\n共 ${out.length} 张 → ${SHOTS_DIR}/(.ts .png + shots.json)`);
    return out;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (isMainModule(import.meta.url)) {
  try {
    build();
  } catch (e) {
    console.error(`✗ ${(e as Error).message}`);
    process.exitCode = 1;
  }
}
