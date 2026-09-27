#!/usr/bin/env node
// =====================================================================
// scripts/svg2png.mjs · bin `svg2png` 的入口 —— 只做「定位包根 + 转交」, 不含栅格化逻辑
//
//   svg2png <in.svg> [out.png] [maxSize]
//
// 为什么是 shim 而不把 shell 重写成 TS: 栅格化有四段不能重来的东西 —— ① 完整 SVG 守卫
// (拦「stderr 混进 stdout」那种文件照样 14KB、exit 照样 0 的假成功); ② CSS 变量守卫(拦
// var(--…) 黑底黑块, 同样 exit 0); ③ rsvg-convert > qlmanage 的优先级; ④ qlmanage 恒输出正方形
// 画布, 得按声明宽高裁掉底部留白。shell 那一版是**唯一事实**, 这里与 cli.ts 的 `render`
// 调的是同一个文件 —— 谁都不重写第二遍。
//
// 为什么需要它(260927): 栅格化早已是跨仓的公共出口(画图 skill 的「导出」一节、echarts 出图
// 脚本的自动提示、cli 的 render, 三个互不相干的消费方), 但此前只以「包内文件路径」暴露 ——
// 消费方必须知道包根在哪(于是文档里出现一串 `~/github/svg-infovis/scripts/svg2png.sh` 硬编码,
// 而那串路径一旦失效没有任何自检会喊), 且 `npx` 完全够不着它。升成 bin 之后消费方只需记
// 一条命令, 路径这件事归包自己解决。
// =====================================================================

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 包根 = 向上第一个 `name === '@watert/svg-infovis'` 的 package.json 所在目录。
 * 认 name 而不是「第一个 package.json」: 产物态 `dist/` 底下若混进别的 package.json,
 * 只认「第一个」会当场指错包根, 而这种错法全是静默的路径错。与 `cli.ts` 同一条判据。
 */
function findRoot(from) {
  for (let dir = from; ; ) {
    const pkg = join(dir, 'package.json');
    if (existsSync(pkg)) {
      try {
        if (JSON.parse(readFileSync(pkg, 'utf8')).name === '@watert/svg-infovis') return dir;
      } catch { /* 不是合法 JSON 的 package.json 不算锚, 继续往上 */ }
    }
    const up = dirname(dir);
    if (up === dir) return null;          // 走到根还没找到
    dir = up;
  }
}

const root = findRoot(dirname(fileURLToPath(import.meta.url)));
const script = root && join(root, 'scripts/svg2png.sh');

if (!script || !existsSync(script)) {
  console.error('✗ 找不到包内 scripts/svg2png.sh —— 这个包装坏了(它该在 files 白名单里, 见 package.json)');
  process.exit(1);
}

// 零参数拦在这里, 别让 shell 的 `${1:?...}` 把包内绝对路径连同脚本名一起吐给用户
// (那是实现细节, 而调用方该看到的是命令怎么写)。缺参的退出码沿用 shell 原样 = 1。
const argv = process.argv.slice(2);
if (argv.length === 0) {
  console.error('用法: svg2png <in.svg> [out.png] [maxSize]');
  console.error('  out 缺省 = in 换 .png 后缀 · max 缺省 1400 · 走 rsvg-convert, 没装则退 qlmanage(WebKit)');
  console.error('  没装本包时: npx -p @watert/svg-infovis svg2png <in.svg>');
  process.exit(1);
}

// 有参数才转交 —— 判据只有"有没有参数", 语义规则一律由 shell 那侧出(它是唯一事实)
const r = spawnSync('bash', [script, ...argv], { stdio: 'inherit' });
process.exit(r.status ?? 1);
