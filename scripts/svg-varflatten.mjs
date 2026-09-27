#!/usr/bin/env node
// =====================================================================
// scripts/svg-varflatten.mjs · bin `svg-varflatten` 的入口 —— 栅格化的可选前置
//
//   svg-varflatten <in.svg> [out.svg]
//
// 把 CSS 自定义属性(var(--…))代入内联属性: rsvg-convert / qlmanage 都不认 var(), 原样喂
// 会渲成黑底黑块**且退出码 0**。它与 `svg2png` 是一对, 但**不是必经步骤** —— svg-infovis 自产 /
// echarts SSR / matplotlib / Mermaid / railroad 五家产物属性全内联, 直接喂 svg2png 即可;
// 只有靠 CSS 变量上色的外来产物(典型如 archify viewer 的导出)才要先展平。
//
// 为什么转发 dist 产物而不是 spawn `bun scripts/svg-varflatten.ts`: bin 的消费方是 npm 用户,
// 他们手上没有 TS 运行时(而 bun 用户也不该被要求装 bun)。编译产物是纯 JS, `process.execPath`
// 直接带得动 —— 于是这个 bin 在「只有 node」与「只有 bun」两种宿主下都能跑, 与 `svginfo` 同一原则。
//
// ⚠ 依赖 `dist/`(派生产物, gitignored): 从 git 装而不构建的场合拿不到它, 那时给明确文案而不是
// 抛 ENOENT —— 补救是 `bun run build`(或直接 npx 装发布版)。
// =====================================================================

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 包根 = 向上第一个 `name === '@watert/svg-infovis'` 的 package.json 所在目录(判据同 `cli.ts`) */
function findRoot(from) {
  for (let dir = from; ; ) {
    const pkg = join(dir, 'package.json');
    if (existsSync(pkg)) {
      try {
        if (JSON.parse(readFileSync(pkg, 'utf8')).name === '@watert/svg-infovis') return dir;
      } catch { /* 不是合法 JSON 的 package.json 不算锚, 继续往上 */ }
    }
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

const root = findRoot(dirname(fileURLToPath(import.meta.url)));
const entry = root && join(root, 'dist/scripts/svg-varflatten.js');

if (!entry || !existsSync(entry)) {
  console.error('✗ 找不到 dist/scripts/svg-varflatten.js —— 派生产物不在(从 git 装且没构建时会这样)');
  console.error('  补救: cd <svg-infovis 仓> && bun run build   ·   或直接用发布版: npm i -g @watert/svg-infovis');
  process.exit(1);
}

const argv = process.argv.slice(2);
if (argv.length === 0) {
  console.error('用法: svg-varflatten <in.svg> [out.svg]');
  console.error('  把 var(--…) 代入内联属性 —— rsvg-convert / qlmanage 都不认它, 原样栅格化会出黑底黑块且不报错');
  console.error('  不是必经步骤: svg-infovis / echarts SSR / matplotlib / Mermaid / railroad 的产物直接喂 svg2png 即可');
  process.exit(1);
}

const r = spawnSync(process.execPath, [entry, ...argv], { stdio: 'inherit' });
process.exit(r.status ?? 1);
