#!/usr/bin/env bun
// =====================================================================
// cli · `svginfo` —— 本仓能力的**唯一命令行面**(260923)
//
// 一条原则: **薄壳**。每个命令都不把底下那件事重写一遍, 而是把参数整理好, 交给**已经存在的那一处
// 出口**(它自己带着纪律与判据), 自己只管两件事 —— 产物落到哪儿、判决怎么变成 exit code:
//
//   run      → **文件自己的出口优先**: 原样跑它自己(`bun run <file>`, 它的门禁档 / 读数 / 退出码说了算)
//              它没吐图 ⇒ 当成纯场景模块, 交 `runner.ts` 的 `runScene`(门禁 / 诊断 / 草稿 / 退出码都在那里)
//   inspect  → `inspect.ts` 的 `main`(读数表; 不给路径就跑它的内置演示场景)
//   render   → 上面那条链 + `svg2png.sh` 栅格化(单张出 PNG)
//   new      → 拷 `templates/sequence.ts`
//   icons    → `src/icons/lucide.ts` 的 `findIcon`(按概念找名字)
//
// ⚠ 曾经的 `render --all`(按清单批量出 PNG 到 `examples/images/`)随 `scripts/build-example-pngs.sh`
// 与 PNG 快照一起于 260926 退役 —— 一次删干净, 不留半兼容的过渡档(过渡层 = 第二权威)。
// 全量出图现在归网站管线(`website/scripts/prerender.ts`, 产物 `website/public/svg/`, 不上 git)。
//
// 出口纪律(与仓内其余出口同一条):
//   · 图走 stdout / 文件, 工具自己的话**只走 stderr** —— 别 `2>&1`(混进来会烂在 SVG 头部)
//   · `-o` / `--png` 一律**由本进程落盘**, 不指望调用方重定向
//   · 退出码三段: **0** 过 / **1** 图有病或跑失败 / **2** 命令写错(与 `inspect.ts` 同一约定)
// =====================================================================

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findIcon, iconNames } from '../src/icons/lucide';
import { type Scene } from '../src/knives/audit';
import { loadRedirecting, main as inspectMain } from './inspect';
import { runScene } from './runner';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SVG2PNG = join(ROOT, 'scripts/svg2png.sh');

const USAGE = `svginfo · svg-infovis 命令行入口

用法: svginfo <命令> [参数]

  run <scene.ts> [-o out.svg] [--golden] [转发参数…]
        出一张图。两种入口都认: ① 出图脚本(顶层在 import.meta.main 里调 runScene)
        ② 场景模块(export default scene / export const scene ← 这种走门禁出口)
        -o 不给则图走 stdout; 诊断一律走 stderr(别 2>&1)

  inspect <scene.ts> [--fit] [--metrics] [--showcase] [--rows=N] [--notes=N]
        不出图, 只 dump 一张读数表(与 \`bun run scripts/inspect.ts\` 同一个实现)
        --fit: 先按内容定画布再审(与出口 exportScene 同一次序) —— 抹平 \`0×0 + fit\` 场景在读数里
        的"内容越出画布"(single_svg)误红; 缺省关, 因为"不 fit 会不会越界"只有关着才回答得了

  render <scene.ts> [--png out.png] [--max 1400] [转发参数…]
        SVG + 本地栅格化成 PNG(走 scripts/svg2png.sh)
        批量出图不在这里 —— 那归网站管线: bun run --cwd website prerender

  new <name> [--force]
        脚手架: 拷 templates/sequence.ts 起手, 写成 ./<name>.ts

  icons list [关键词] [--limit=N]
        按概念找 lucide 图标名(名字命中在前, 再是上游 tags 命中)

  -h / --help · -v / --version`;

/** 用法错: 与 `inspect.ts` 同一条约定 —— 2 = 命令写错, 与 1(图有病)在 shell 里分得开 */
function fail(msg: string, code = 2): never {
  console.error(`✗ ${msg}`);
  console.error(USAGE);
  process.exit(code);
}

/** `-o x` 与 `--out=x` 两种写法都收; 返回取值 + 被剩下的参数(**顺序原样**, 转发给目标脚本) */
function takeFlag(args: string[], ...names: string[]): { value?: string; rest: string[] } {
  const rest: string[] = [];
  let value: string | undefined;
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    const hit = names.find((n) => a === n || a.startsWith(`${n}=`));
    if (!hit) { rest.push(a); continue; }
    if (a.startsWith(`${hit}=`)) value = a.slice(hit.length + 1);
    else { value = args[i + 1]; i += 1; }
    if (!value) fail(`${hit} 后面要给一个值`);
  }
  return { value, rest };
}

const positive = (flag: string, raw: string | undefined): number => {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) fail(`${flag} 要给正数, 收到 ${raw}`);
  return n;
};

/** 第一个非选项参数 = 目标文件(其余位置参数一律转发, 如 style-lab 的 `light`) */
const targetOf = (rest: string[], cmd: string): string =>
  rest.find((a) => !a.startsWith('-')) ?? fail(`${cmd} 要给一个文件路径`);

/** 产物落盘: 文件路径写死由**本进程**做(不指望调用方重定向), stdout 才走管道 */
function emit(bytes: Uint8Array, to: 'stdout' | string): void {
  if (to === 'stdout') { process.stdout.write(bytes); return; }
  try {
    writeFileSync(to, bytes);
  } catch (e) {
    fail(`写不进 ${to}(${(e as Error).message})`, 1);
  }
}

/**
 * 一份**出图入口** → 图落到 `out`(`'stdout'` 或文件路径)。**文件自己的出口优先**:
 *
 *   ① 原样跑它自己(`bun run <file>`)。出图脚本的门禁档 / 额外读数 / 退出码都是它自己定的 ——
 *      CLI 不替它做第二遍决定(同一份文件跑出两种图, 是比"跑不动"更坏的事)
 *   ② 它一个字节都没吐 ⇒ 它是**纯场景模块**(`export default scene`), 那就由 CLI 出图:
 *      走 `runner.ts` 的 `runScene` —— 门禁 / 诊断 / 草稿 / 退出码全在那一处守着
 *
 * 图经本进程转发而不是直连 fd: 为了拿到"到底吐没吐"这个信号(空手 = 换一条路),
 * 字节仍是原样的(不重编码); 诊断走 stderr 原样继承, 不掺进产物。
 * 差集可见: 两条路都不成立时明说"既没吐图也没导出场景", 退出码取它自己那个。
 */
async function emitSvg(file: string, passthrough: string[], out: 'stdout' | string): Promise<number> {
  if (!existsSync(file)) fail(`找不到文件: ${file}`, 1);
  const r = spawnSync('bun', ['run', file, ...passthrough], { stdio: ['ignore', 'pipe', 'inherit'] });
  if (r.error) fail(`跑不起来: bun run ${file}(${r.error.message})`, 1);
  const svg = r.stdout;
  if (svg.length) {
    emit(svg, out);
    return r.status ?? 1;
  }

  let scene: Scene | null = null;
  try {
    // 加载期顶层输出被改道 stderr, 混不进产物; 加载期抛 ⇒ 它本来就不是场景模块
    const { mod } = await loadRedirecting(new URL(file, `file://${process.cwd()}/`).href);
    const got = (mod.default ?? mod.scene) as Scene | undefined;
    if (got && typeof got === 'object' && Array.isArray(got.nodes)) scene = got;
  } catch { /* 见上: 静静落到下面那句诊断 */ }

  if (scene) {
    runScene(scene, { out, golden: passthrough.includes('--golden') });
    return typeof process.exitCode === 'number' ? process.exitCode : 0;
  }
  // 空手退 0: golden 档(只对 sha256)/ 产物由它自己落盘的脚本都长这样 —— 退出码就是判决, 不是错
  if (!r.status) {
    console.error(`# ${file} 退出 0 但 stdout 没有字节 —— golden / 自落盘那一档; 产物在它自己说的位置(判决见上)`);
    return 0;
  }
  console.error(`✗ ${file} 既没吐出图, 也没导出场景对象 —— 出图脚本要在 \`import.meta.main\` 里调 runScene,`);
  console.error('  场景模块要 `export default <scene>`; 只读坐标不出图请用 `svginfo inspect <file>`(诊断见上)');
  return r.status;
}

async function cmdRun(args: string[]): Promise<number> {
  const { value: out, rest } = takeFlag(args, '-o', '--out');
  const file = targetOf(rest, 'run');
  return emitSvg(file, rest.filter((a) => a !== file), out ?? 'stdout');
}

async function cmdRender(args: string[]): Promise<number> {
  const png = takeFlag(args, '--png');
  const max = takeFlag(png.rest, '--max');
  const size = positive('--max', max.value ?? '1400');
  const rest = max.rest;

  const file = targetOf(rest, 'render');
  const passthrough = rest.filter((a) => a !== file);
  const out = png.value ?? `${basename(file, extname(file))}.png`;
  const tmp = mkdtempSync(join(tmpdir(), 'svginfo-'));
  const svg = join(tmp, 'out.svg');
  try {
    const code = await emitSvg(file, passthrough, svg);           // 门禁没过也照样给草稿图
    const raster = spawnSync('bash', [SVG2PNG, svg, out, String(size)], { stdio: 'inherit' });
    return code !== 0 ? code : (raster.status ?? 1);             // 两条判决都得看得见
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function cmdNew(args: string[]): number {
  const force = args.includes('--force');
  const name = targetOf(args.filter((a) => a !== '--force'), 'new');
  const target = name.endsWith('.ts') ? name : `${name}.ts`;
  if (existsSync(target) && !force) fail(`${target} 已存在 —— 要覆盖请加 --force`, 1);

  // 只改一处: 模板在仓内用相对路径 import 内核, 起手文件可能落在仓外 ⇒ 认包名(仓内也解析得到自己)
  const body = readFileSync(join(ROOT, 'templates/sequence.ts'), 'utf8').replace("'../src/index'", "'svg-infovis'");
  try {
    writeFileSync(target, body, 'utf8');
  } catch (e) {
    fail(`写不出 ${target}(${(e as Error).message}) —— 目标目录要先存在`, 1);
  }
  const stem = basename(target, '.ts');
  console.error(`✓ 起手文件: ${target}(拷自 templates/sequence.ts —— 决策表在文件尾部, 照它改)`);
  console.error(`  跑: bun run ${target} --out=${stem}.svg   或   svginfo render ${target} --png ${stem}.png`);
  console.error('  ⚠ 落在仓外时先让包可解析(bun link / npm i -g svg-infovis), 否则 import 不到内核');
  return 0;
}

/** 名字逐行吐 stdout; 下游提前关管道(`… | head`)不算错 —— 静默收摊, 别甩一坨 EPIPE 栈 */
function listNames(names: string[]): void {
  try {
    for (const n of names) process.stdout.write(`${n}\n`);
  } catch { /* 下游已经看够了 */ }
}

function cmdIcons(args: string[]): number {
  const [sub, ...rest] = args;
  if (sub !== 'list') fail(`icons 只有 list 一个子命令, 收到 ${sub ?? '(空)'}`);
  const lim = takeFlag(rest, '--limit');
  const hit = positive('--limit', lim.value ?? '12');
  if (!Number.isInteger(hit)) fail(`--limit 要给整数, 收到 ${lim.value}`);
  const query = lim.rest.find((a) => !a.startsWith('-'));
  const total = iconNames().length;

  if (!query) {                                   // 不给关键词 = 把名字全集吐出来(交给 grep)
    listNames(iconNames());
    console.error(`# 素材库共 ${total} 个名字; \`svginfo icons list <关键词>\` 按概念找`);
    return 0;
  }
  const names = findIcon(query, hit);
  if (!names.length) {
    console.error(`✗ 没有命中 "${query}" 的名字 —— 换个概念词(素材库共 ${total} 个; 不给关键词可列全集)`);
    return 1;
  }
  listNames(names);
  console.error(`# "${query}" 命中 ${names.length} 个(名字命中在前, 再是上游 tags 命中; --limit=N 可放宽)`);
  return 0;
}

function version(): string {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string };
  return pkg.version;
}

async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  if (cmd === '-v' || cmd === '--version') { console.log(version()); return 0; }
  if (!cmd || cmd === '-h' || cmd === '--help') { console.log(USAGE); return cmd ? 0 : 2; }

  switch (cmd) {
    case 'run': return cmdRun(rest);
    case 'inspect': return inspectMain(rest);
    case 'render': return cmdRender(rest);
    case 'new': return cmdNew(rest);
    case 'icons': return cmdIcons(rest);
    default: fail(`不认识的命令: ${cmd}`);
  }
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2));
