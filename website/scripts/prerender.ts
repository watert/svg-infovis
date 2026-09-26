// =====================================================================
// prerender · 示例预渲染管线(网站侧) 260926
//
// 干什么: 逐条跑 `examples/manifest.ts` 里的**全部出图入口**(条数以清单为准, 现 23 条),
//   把 stdout 的 SVG 落成 `website/public/svg/<key>.svg`, 汇总成 `website/src/generated/examples.json`
//   (给网站 UI 查: 图在哪 / 过没过门禁 / 字节数 / 指纹)。
//
// 两条硬规矩(踩过就懂):
//   · **出图命令永不加 2>&1** —— 诊断走 stderr, 合并会把诊断灌进 SVG 头部。
//     一律 `Bun.spawn` 分开捕获 stdout / stderr / exitCode, 谁也不许进对方的口袋。
//   · **汇总顺序 = 清单顺序** —— 并发只为提速, 结果按 `EXAMPLES` 原序落盘:
//     同一份清单必须产出同一串字节(本仓信仰, 故 JSON 里**没有**时间戳)。
//
// 退出码判据: 只有「用法错(exitCode=2)」或「stdout 不是合法 SVG」才判脚本失败。
//   exitCode=1 是**门禁没过** —— 草稿图照样收下, 如实记进 JSON 的 exitCode / draft。
//   有硬失败则**整体不落盘**(半成品比没产物更难查), 先把失败清单打全再 exit 1。
//
// SVG 合法性: 去 BOM / 空白后须以 `<svg` 起(允许前面有一条 `<?xml ...?>` 声明)、
//   以 `</svg>` 收。落盘内容 = 原样 stdout(含 XML 声明) + 一个结尾换行。
//
// ⚠ 产物(`public/svg/` 与 `src/generated/examples.json`)**勿手改** —— 每次跑都整体重生成。
// =====================================================================

import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { EXAMPLES, GROUP_LABEL, type ExampleEntry } from '../../examples/manifest.ts';

/** 仓根: 本文件在 `website/scripts/` 下, 往上两级 —— 示例路径与 cwd 都以仓根为准 */
const ROOT = resolve(import.meta.dir, '../..');
const WEBSITE = join(ROOT, 'website');
const SVG_DIR = join(WEBSITE, 'public/svg');
const OUT_JSON = join(WEBSITE, 'src/generated/examples.json');

/** 并发路数: 示例是纯 CPU 出图, 4 路够用又不至于把机器摁死 */
const CONCURRENCY = 4;

const XML_PROLOG = /^<\?xml[^>]*\?>\s*/;

type Prerendered = {
  entry: ExampleEntry;
  exitCode: number;
  /** 落盘正文(含 XML 声明 + 结尾换行); 校验没过则为 null */
  content: string | null;
  failed: string | null;
  stderr: string;
};

/** 校验 stdout 是不是一张自包含 SVG; 通过返回落盘正文, 否则 null */
function toSvg(raw: string): string | null {
  const body = raw.replace(/^\uFEFF/, '').trim();
  if (!body) return null;
  // 序列化器可能带 XML 声明, 门禁只管「第一个元素是不是 svg」
  const head = body.replace(XML_PROLOG, '');
  if (!head.startsWith('<svg')) return null;
  if (!body.endsWith('</svg>')) return null;
  return body + '\n';
}

async function runOne(entry: ExampleEntry): Promise<Prerendered> {
  const argv = ['bun', 'run', entry.file, ...(entry.arg ? [entry.arg] : [])];
  const proc = Bun.spawn(argv, { cwd: ROOT, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  const content = toSvg(stdout);
  let failed: string | null = null;
  if (exitCode === 2) failed = `用法错(exitCode=2): ${stderr.trim().split('\n').slice(-1)[0] ?? ''}`;
  else if (!content) failed = `stdout 不是合法 SVG(${stdout.length} 字节): ${JSON.stringify(stdout.slice(0, 120))}`;

  return { entry, exitCode, content, failed, stderr };
}

// ── 跑: 4 路并发, 结果写回各自下标 —— 顺序即清单顺序 ──────────────────────
await rm(SVG_DIR, { recursive: true, force: true });
await mkdir(SVG_DIR, { recursive: true });
await mkdir(dirname(OUT_JSON), { recursive: true });

const results = new Array<Prerendered>(EXAMPLES.length);
let cursor = 0;
await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, EXAMPLES.length) }, async () => {
    for (let i = cursor++; i < EXAMPLES.length; i = cursor++) results[i] = await runOne(EXAMPLES[i]);
  }),
);

const broken = results.filter((r) => r.failed);
if (broken.length) {
  console.error(`✗ ${broken.length} 个示例不可收:\n`);
  for (const r of broken) console.error(`  · ${r.entry.key} (${r.entry.file})\n    ${r.failed}`);
  console.error('\n硬失败 → 整体不落盘, 先修上面的入口。');
  process.exit(1);
}

// ── 落盘 + 汇总(一律按清单顺序) ─────────────────────────────────────────
type Row = {
  key: string;
  group: string;
  file: string;
  arg: string;
  what: string;
  svg: string;
  draft: boolean;
  exitCode: number;
  bytes: number;
  sha256: string;
};

const rows: Row[] = [];
for (const r of results) {
  const content = r.content!;
  const draft = content.includes('data-draft="1"');
  await writeFile(join(SVG_DIR, `${r.entry.key}.svg`), content);
  rows.push({
    key: r.entry.key,
    group: r.entry.group,
    file: r.entry.file,
    // 无 arg 记空串(不记 null): 消费侧 `src/components/Gallery.tsx` 把 `arg` 声明成
    // `arg?: string`, 空串能直接赋值过去, null 不能
    arg: r.entry.arg ?? '',
    what: r.entry.what,
    svg: `svg/${r.entry.key}.svg`,
    draft,
    exitCode: r.exitCode,
    bytes: Buffer.byteLength(content),
    sha256: createHash('sha256').update(content).digest('hex').slice(0, 12),
  });
  // 门禁没过却不见草稿标 = 序列化侧的契约破了, 值得吱一声(不拦)
  if (r.exitCode !== 0 && !draft) console.warn(`! ${r.entry.key}: exitCode=${r.exitCode} 但 SVG 无 data-draft="1"`);
}

await writeFile(OUT_JSON, JSON.stringify({ groups: GROUP_LABEL, examples: rows }, null, 2) + '\n');

// ── 人读的收尾账 ────────────────────────────────────────────────────────
let group = '';
for (const row of rows) {
  if (row.group !== group) {
    group = row.group;
    console.log(`\n## ${group}`);
  }
  const flag = row.exitCode === 0 ? 'ok  ' : row.draft ? 'draft' : `exit${row.exitCode}`;
  console.log(`  ${flag}  ${row.key.padEnd(22)} ${String(row.bytes).padStart(7)}B  ${row.sha256}  ${row.svg}`);
}
const drafts = rows.filter((r) => r.draft).length;
console.log(`\n✓ ${rows.length} 张 SVG → ${SVG_DIR}`);
console.log(`✓ examples.json → ${OUT_JSON} (draft ${drafts} 张, 非零 exitCode ${rows.filter((r) => r.exitCode !== 0).length} 条)`);
