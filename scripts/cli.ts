#!/usr/bin/env node
// =====================================================================
// cli · `svginfo` —— 本仓能力的**唯一命令行面**(260923; 260926 跨运行时化)
//
// 一条原则: **薄壳**。每个命令都不把底下那件事重写一遍, 而是把参数整理好, 交给**已经存在的那一处
// 出口**(它自己带着纪律与判据), 自己只管两件事 —— 产物落到哪儿、判决怎么变成 exit code:
//
//   run      → **文件自己的出口优先**: 原样跑它自己(在可用运行时下, 它的门禁档 / 读数 / 退出码说了算)
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
// 两处**跨运行时**的机关(260926 起本文件不再绑 bun):
//   · 包根 ROOT 从本文件所在目录**逐级向上**找 `name: '@watert/svg-infovis'` 的 `package.json` ——
//     源码态(`scripts/cli.ts`)与 `tsc` 产物态(`dist/scripts/cli.js`)都落在包根底下, 于是
//     `templates/` 与 `scripts/svg2png.sh` 这两份**住包根的资源**在两种形态下算出同一个路径
//     (只按 `..` 猜层级的话, 产物态会指到 `dist/` 里那个不存在的 templates/)
//   · 跑用户的 `.ts` 场景文件按**可用性探测**, 见 `spawnTs`
//
// 出口纪律(与仓内其余出口同一条):
//   · 图走 stdout / 文件, 工具自己的话**只走 stderr** —— 别 `2>&1`(混进来会烂在 SVG 头部)
//   · `-o` / `--png` 一律**由本进程落盘**, 不指望调用方重定向
//   · 退出码三段: **0** 过 / **1** 图有病或跑失败 / **2** 命令写错或环境不成立(与 `inspect.ts` 同一约定)
// =====================================================================

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ShapeInputError } from '../src/guard.js';
import { findIcon, iconNames } from '../src/icons/lucide.js';
import { isMainModule } from '../src/runtime.js';
import { main as inspectMain } from './inspect.js';

/**
 * 包根 = 从本文件所在目录向上找到的第一个 `name === '@watert/svg-infovis'` 的 package.json 所在目录。
 * 校验 name 而不是"第一个 package.json"是刻意的: 产物态 `dist/` 底下若混进别的 package.json
 * (打包/复制出来的), 只认"第一个"会当场指错包根, 而这里的错法全是静默的路径错。
 */
function findRoot(from: string): string {
  for (let dir = from; ; ) {
    const pkg = join(dir, 'package.json');
    if (existsSync(pkg)) {
      try {
        if ((JSON.parse(readFileSync(pkg, 'utf8')) as { name?: string }).name === '@watert/svg-infovis') return dir;
      } catch { /* 不是合法 JSON 的 package.json 不算锚, 继续往上 */ }
    }
    const up = dirname(dir);
    if (up === dir) {
      throw new Error(`从 ${from} 向上找不到 name 为 @watert/svg-infovis 的 package.json —— `
        + '本 CLI 要用包根下的 templates/ 与 scripts/svg2png.sh, 装到别处就先确认包根还在');
    }
    dir = up;
  }
}

const ROOT = findRoot(dirname(fileURLToPath(import.meta.url)));
const SVG2PNG = join(ROOT, 'scripts/svg2png.sh');

const USAGE = `svginfo · svg-infovis 命令行入口

用法: svginfo <命令> [参数]

  run <scene.ts> [-o out.svg] [--golden] [转发参数…]
        出一张图。两种入口都认: ① 出图脚本(顶层在 \`isMainModule(import.meta.url)\` 里调 runScene)
        ② 场景模块(export default scene / export const scene ← 这种走门禁出口)
        -o 不给则图走 stdout; 诊断一律走 stderr(别 2>&1)
        跑 .ts 要一个能跑 TS 的运行时: 有 bun 用 bun, 否则 node ≥22.18(22.6–22.17 要给**本 CLI** 也带
        --experimental-strip-types, 否则「场景模块」那条回退路加载不了 .ts)

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

/** node 那一档的门槛(见 `nodeCanRunTs`) */
const NODE_STRIP_MIN = [22, 6] as const;      // `--experimental-strip-types` 自 22.6 起有
const NODE_STRIP_ALWAYS = [22, 18] as const;  // 22.18 起类型剥离默认开, 不给 flag 也带得动

/** node 这一档能不能给用户的 `.ts` 当宿主 —— 门槛就一条: 它得带得动类型剥离 */
function nodeCanRunTs(): boolean {
  const [maj, min] = process.versions.node.split('.').map(Number);
  if (maj > NODE_STRIP_ALWAYS[0] || (maj === NODE_STRIP_ALWAYS[0] && min >= NODE_STRIP_ALWAYS[1])) return true;
  return maj === NODE_STRIP_MIN[0] && min >= NODE_STRIP_MIN[1]
    && process.execArgv.includes('--experimental-strip-types');
}

type TsRuntime = { cmd: string; pre: string[]; note?: string };
let tsRuntimeCache: TsRuntime[] | null = null;

/**
 * 能给用户 `.ts` 当宿主的运行时, **探测一次、全程复用**, 顺序不许反:
 *
 *   ① `bun` —— 本仓主运行时, 快路径。探测靠真起一次 `bun --version`: 它的 `ENOENT` 就是
 *      "PATH 里没有 bun", 比自己拆 PATH 可靠(Windows 的 `.cmd` 垫片 / 版本管理器都不用特判)
 *   ② 没有 bun ⇒ node 的 `process.execPath` + `--experimental-strip-types`(`nodeCanRunTs` 判门槛)。
 *      用户的场景文件不在 `node_modules` 里, 类型剥离这一档可用; 22.18 起默认开, 带 flag 不变行为
 *      (实测 22.18 也不打 ExperimentalWarning), 图仍只走 stdout(出口纪律没松)
 *   ③ 两样都不可用 ⇒ 空表, 由 `spawnTs` 退 2 并把三条出路写清
 */
function tsRuntimes(): TsRuntime[] {
  if (tsRuntimeCache) return tsRuntimeCache;
  const out: TsRuntime[] = [];
  const noBun = (spawnSync('bun', ['--version'], { stdio: 'ignore' }).error as { code?: string } | undefined)?.code === 'ENOENT';
  if (!noBun) out.push({ cmd: 'bun', pre: ['run'] });
  if (nodeCanRunTs()) {
    out.push({
      cmd: process.execPath,
      pre: ['--experimental-strip-types'],
      note: `# PATH 里没有 bun, 改用 node ${process.versions.node} 的类型剥离档跑它(工具自己的话只走 stderr)`,
    });
  }
  tsRuntimeCache = out;
  return out;
}

/**
 * 用探得的运行时跑一个文件。**用户文件本身跑失败不算探测失败**(那时退出码是它的判决)——
 * 只有"运行时根本不在"(ENOENT)才落到下一个候选; 一个都不剩 ⇒ 退 2 + 三条出路, 不静默。
 */
function spawnTs(file: string, passthrough: string[]): { stdout: Uint8Array; status: number | null; error?: Error } {
  const io = { stdio: ['ignore', 'pipe', 'inherit'] as ('ignore' | 'pipe' | 'inherit')[] };
  for (const rt of tsRuntimes()) {
    const r = spawnSync(rt.cmd, [...rt.pre, file, ...passthrough], io);
    if ((r.error as { code?: string } | undefined)?.code === 'ENOENT') continue;
    if (rt.note) console.error(rt.note);
    return r;
  }
  fail(`${file} 要一个能跑 TS 的运行时, 但 PATH 里没有 bun, 本机 node ${process.versions.node} 也带不动 TS`
    + ` —— 三条路: 装 bun, 换 node ≥${NODE_STRIP_ALWAYS.join('.')},`
    + ` 或用 node ≥${NODE_STRIP_MIN.join('.')} 并给**本 CLI** 也加上 --experimental-strip-types`, 2);
  return { stdout: new Uint8Array(), status: 2 };
}

/** 同目录的兄弟模块: 源码态是 `.ts`、产物态是 `.js`(node 的剥离档不做 `.js → .ts` 改写, 得自己挑) */
function sibling(name: string): string {
  const js = new URL(`./${name}.js`, import.meta.url);
  return existsSync(fileURLToPath(js)) ? js.href : new URL(`./${name}.ts`, import.meta.url).href;
}

/**
 * 场景模块探针 —— 在**能跑 TS 的进程**里 import 用户的模块, 拿到 scene 就交给 `runner` 出图。
 *
 * ⚠ 它必须走**子进程**, 这是本 CLI 最贵的一个教训: `export default scene` 那条回退路要在某个进程里
 * `import` 用户的 `.ts`, 而 CLI 的宿主(bin 是 `#!/usr/bin/env node`)可能是**带不动 TS 的 node(<22.6)**。
 * 旧写法在 CLI 进程内 import, 抛出的异常被 `catch {}` 吞掉 —— 于是 node 20 宿主 + 纯场景模块
 * = `exit 0` 却**不产图**, 还给出"golden / 自落盘那一档"的归因。判断权必须交给跑得动 TS 的进程。
 *
 * 退出码: **0 / 1** 是 `runScene` 自己的判决; **3** = 它不是场景模块(交给调用方说那句差集诊断)。
 */
const SCENE_PROBE = [
  'const [url, runnerUrl, out, golden] = process.argv.slice(2);',
  '// 加载期顶层的日志改道 stderr —— 混进产物就是脏图(与 inspect 的 loadRedirecting 同一条纪律)',
  'const sink = (...a) => process.stderr.write(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ") + "\\n");',
  'for (const k of ["log", "info", "warn", "debug"]) console[k] = sink;',
  'const { runScene } = await import(runnerUrl);',
  'const m = await import(url);',
  'const s = m.default ?? m.scene;',
  'if (!s || typeof s !== "object" || !Array.isArray(s.nodes)) process.exit(3);',
  'runScene(s, { out, golden: golden === "1" });',
  'process.exit(typeof process.exitCode === "number" ? process.exitCode : 0);',
  '',
].join('\n');

/**
 * 一份**出图入口** → 图落到 `out`(`'stdout'` 或文件路径)。**文件自己的出口优先**:
 *
 *   ① 原样跑它自己(在探得的运行时下)。出图脚本的门禁档 / 额外读数 / 退出码都是它自己定的 ——
 *      CLI 不替它做第二遍决定(同一份文件跑出两种图, 是比"跑不动"更坏的事)
 *   ② 它一个字节都没吐 ⇒ 再问一次"它是不是**纯场景模块**(`export default scene`)": 是就由 `runner`
 *      出图(门禁 / 诊断 / 草稿 / 退出码全在那一处守着)。这一步为什么必须换进程, 见 `SCENE_PROBE`
 *
 * 图经本进程转发而不是直连 fd: 为了拿到"到底吐没吐"这个信号(空手 = 换一条路), 字节仍是原样的
 * (不重编码); 诊断走 stderr 原样继承, 不掺进产物。两条路都不成立时明说"既没吐图也没导出场景"。
 */
function emitSvg(file: string, passthrough: string[], out: 'stdout' | string): number {
  if (!existsSync(file)) fail(`找不到文件: ${file}`, 1);
  const r = spawnTs(file, passthrough);
  if (r.error) fail(`跑不起来: ${file}(${r.error.message})`, 1);
  if (r.stdout.length) {
    emit(r.stdout, out);
    return r.status ?? 1;
  }

  const tmp = mkdtempSync(join(tmpdir(), 'svginfo-probe-'));
  const probe = join(tmp, 'scene-probe.mjs');
  let probeStatus: number | null;
  try {
    writeFileSync(probe, SCENE_PROBE);
    const p = spawnTs(probe, [
      new URL(file, `file://${process.cwd()}/`).href, sibling('runner'), out,
      passthrough.includes('--golden') ? '1' : '0',
    ]);
    probeStatus = p.status;
    if (out === 'stdout' && p.stdout.length) emit(p.stdout, out);   // 场景那条路也把图交回本进程转发
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  if (probeStatus !== 3) return probeStatus ?? 1;   // 它是场景模块: 判决与产物都由那一路给了

  // 空手退 0: golden 档(只对 sha256)/ 产物由它自己落盘的脚本都长这样 —— 退出码就是判决, 不是错
  if (!r.status) {
    console.error(`# ${file} 退出 0 但 stdout 没有字节 —— golden / 自落盘那一档; 产物在它自己说的位置(判决见上)`);
    return 0;
  }
  console.error(`✗ ${file} 既没吐出图, 也没导出场景对象 —— 出图脚本要在 \`isMainModule(import.meta.url)\` 里调 runScene,`);
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

  // 模板在仓内用相对路径 import 内核, 起手文件可能落在仓外 ⇒ 一律改认包名(仓内也解析得到自己)。
  // 两处都要换: `../src/index` → 包出口, `../src/runtime` → 同名的 `./runtime` 子路径
  const body = readFileSync(join(ROOT, 'templates/sequence.ts'), 'utf8')
    .replaceAll("'../src/index'", "'@watert/svg-infovis'")
    .replaceAll("'../src/runtime'", "'@watert/svg-infovis/runtime'");
  try {
    writeFileSync(target, body, 'utf8');
  } catch (e) {
    fail(`写不出 ${target}(${(e as Error).message}) —— 目标目录要先存在`, 1);
  }
  const stem = basename(target, '.ts');
  console.error(`✓ 起手文件: ${target}(拷自 templates/sequence.ts —— 决策表在文件尾部, 照它改)`);
  console.error(`  跑: svginfo run ${target} -o ${stem}.svg   或   svginfo render ${target} --png ${stem}.png`);
  console.error('  ⚠ 起手文件 import 的是包名 svg-infovis —— 落在仓外时先让包可解析(bun link / npm i -g svg-infovis)');
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
  // 图标素材是 **optional 依赖**, 它缺席是预期状态而不是"异常" —— 与 `run` 的"没有运行时"同一条纪律:
  // 一行出路 + 明确退出码, 不许把栈喷给用户(这条曾经是未捕获异常 + 退出码 1, 看着像 CLI 自己坏了)
  let namesAll: string[];
  try {
    namesAll = iconNames();
  } catch (e) {
    if (e instanceof ShapeInputError) fail(e.message, 2);
    throw e;
  }
  const total = namesAll.length;

  if (!query) {                                   // 不给关键词 = 把名字全集吐出来(交给 grep)
    listNames(namesAll);
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

if (isMainModule(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
