// =====================================================================
// svg-varflatten · 把外来 SVG 里已解析的 CSS 变量展平成字面值
//
//   bun run scripts/svg-varflatten.ts <in.svg> [out.svg] [--theme dark|light]
//
// 为什么有它: 本地那批**毫秒级、零浏览器**的栅格化路径(rsvg-convert / qlmanage)不认
// CSS 自定义属性。遇到整张图靠 `var(--x)` 上色的外来产物(archify 的 viewer 导出就是),
// rsvg 会把填充与描边一并丢掉 —— 出来是"深底黑块", 而文件照样完整、退出码照样 0, 看着
// 像成功。展平之后它就归 `scripts/svg2png.sh` 那一档管, 不必为它常起 Chrome。
//
// 只做**文本代入**, 不解析 SVG 结构: 变量值里的引号 / 括号 / 逗号原样带过。
//
// 双主题产物里同一变量有多套定义(archify 缺省输出: 基础档 + `@media (prefers-color-scheme:
// light)` 档)。默认取**深色**那套 —— 与那份产物的缺省一致(它自己的注释原话: "Dark is the
// default, so hosts without prefers-color-scheme still render"); `--theme light` 换另一套。
// 深浅按每组 `--bg` 的明度判; 本文件里只有一套定义时没有可挑的, --theme 给什么都不影响。
//
// 三条出口纪律(与 inspect.ts 同源):
//   · 产物走 out 文件(不给则 stdout), 工具自己的话走 stderr —— 别 `2>&1`
//   · 代入了几处 / 剩几处没代一律报数, 不静默
//   · 用法错(含输入路径不存在)→ 退出码 2; **有 var() 引用却一处定义都没有** → 1
//
// ⚠ 残留(引用了但本文件没定义, 如动画用的运行期变量 `--step`)= **警告而非失败** ——
//   那种变量对静态出图本来就没影响, 不该让 `flatten && svg2png` 这条链断在半路。
// =====================================================================

import { readFileSync, writeFileSync } from 'node:fs';
import { isMainModule } from '../src/runtime.js';

const USAGE = `用法: bun run scripts/svg-varflatten.ts <in.svg> [out.svg] [--theme dark|light]
  不给 out.svg 则写 stdout。产物走 stdout / 诊断走 stderr, 别 2>&1。
  本来就没有变量定义的 SVG 是 no-op(退出码 0) —— 可以直接串进栅格化链。`;

/** 一条 `--x: 值;` 声明; 同一规则里连续出现的算一组(两处之间出现 `{` / `}` 即换组)。 */
type VarGroup = { decls: Map<string, string>; bgLum: number | null };

const DECL = /(--[a-zA-Z0-9-]+)\s*:\s*([^;{}]+);/g;
/** 变量引用; fallback 允许**一层**括号嵌套(`var(--x, rgba(0, 0, 0, .5))`)。 */
const VAR_USE = /var\(\s*(--[a-zA-Z0-9-]+)\s*(?:,\s*((?:[^()]|\([^()]*\))*))?\)/g;

function fail(msg: string, code = 2): never {
  console.error(`✗ ${msg}`);
  console.error(USAGE);
  process.exit(code);
}

/** `#rgb` / `#rrggbb` / `rgb()` / `rgba()` → 0..1 相对明度; 认不出来返回 null(不猜)。 */
function luminance(color: string): number | null {
  const c = color.trim().toLowerCase();
  const chans = (r: number, g: number, b: number): number => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(c);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].replace(/./g, (ch) => ch + ch) : hex[1];
    return chans(parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16));
  }
  const fn = /^rgba?\(([^)]*)\)$/.exec(c);
  if (fn) {
    const parts = fn[1].split(/[,/\s]+/).filter((s) => s !== '').slice(0, 3);
    if (parts.length < 3) return null;
    const nums = parts.map((p) => (p.endsWith('%') ? (Number.parseFloat(p) * 255) / 100 : Number.parseFloat(p)));
    if (!nums.every((v) => Number.isFinite(v))) return null;
    return chans(nums[0], nums[1], nums[2]);
  }
  return null;
}

function collectGroups(src: string): VarGroup[] {
  const groups: VarGroup[] = [];
  let cur: Map<string, string> | null = null;
  let lastEnd = 0;
  DECL.lastIndex = 0;
  for (let m = DECL.exec(src); m !== null; m = DECL.exec(src)) {
    if (cur === null || /[{}]/.test(src.slice(lastEnd, m.index))) {
      cur = new Map();
      groups.push({ decls: cur, bgLum: null });
    }
    cur.set(m[1], m[2].trim());
    lastEnd = m.index + m[0].length;
  }
  for (const g of groups) {
    const bg = g.decls.get('--bg') ?? g.decls.get('--text');   // 没 --bg 就退一步看文字色
    g.bgLum = bg === undefined ? null : luminance(bg);
  }
  return groups;
}

function emit(svg: string, outPath: string | undefined): void {
  if (outPath === undefined) process.stdout.write(svg);
  else writeFileSync(outPath, svg);
}

function main(argv: string[]): number {
  const positional: string[] = [];
  let theme = 'dark';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--theme') {
      const v = argv[++i];
      if (v !== 'dark' && v !== 'light') fail(`--theme 只认 dark / light, 收到 ${v ?? '(缺值)'}`);
      theme = v;
    } else if (a.startsWith('--theme=')) {
      const v = a.slice('--theme='.length);
      if (v !== 'dark' && v !== 'light') fail(`--theme 只认 dark / light, 收到 ${v}`);
      theme = v;
    } else if (a === '-h' || a === '--help') {
      console.log(USAGE);
      return 0;
    } else if (a.startsWith('-')) fail(`不认识的参数: ${a}`);
    else positional.push(a);
  }
  if (positional.length === 0) fail('没给输入 SVG');
  if (positional.length > 2) fail(`最多给 <in.svg> [out.svg], 收到 ${positional.length} 个路径`);

  const [inPath, outPath] = positional;
  let src: string;
  try {
    src = readFileSync(inPath, 'utf8');
  } catch (e: unknown) {
    fail(`读不到 ${inPath}: ${e instanceof Error ? e.message : String(e)}`);
  }

  const groups = collectGroups(src);
  const refs = (src.match(/var\(--/g) ?? []).length;
  // 有引用却一处定义都没有 ⇒ 定义在别处(外部样式表 / 运行期注入), 本工具无能为力
  if (groups.length === 0) {
    if (refs > 0) fail(`${inPath} 有 ${refs} 处 var() 引用, 但本文件里一处 \`--x: 值;\` 定义都没有 —— 定义不在这份产物里, 展平不了`, 1);
    emit(src, outPath);
    console.error('展平: 本文件没有变量定义, 无需处理(产物与输入逐字节相同)');
    return 0;
  }

  const wantDark = theme === 'dark';
  const picked =
    groups.find((g) => g.bgLum !== null && (g.bgLum < 0.5) === wantDark) ??
    groups.find((g) => g.decls.has('--bg')) ??
    groups[0];
  const pickIdx = groups.indexOf(picked);

  let hits = 0;
  const misses = new Set<string>();
  const out = src.replace(VAR_USE, (full: string, name: string, fallback?: string) => {
    const v = picked.decls.get(name);
    if (v !== undefined) {
      hits++;
      return v;
    }
    const fb = fallback?.trim();
    if (fb !== undefined && fb !== '') {
      hits++;
      return fb;
    }
    misses.add(name);
    return full;
  });
  emit(out, outPath);

  const leftover = (out.match(/var\(--/g) ?? []).length;
  const bg = picked.decls.get('--bg');
  const tag = groups.length === 1 ? '本文件只有一套定义' : `第 ${pickIdx + 1}/${groups.length} 组 = ${theme} 档`;
  const warn = picked.bgLum === null ? ' (明度认不出, 按定义顺序取的)' : '';
  console.error(
    `展平: 代入 ${hits} 处(${tag}${bg === undefined ? '' : `, --bg=${bg}`}${warn})` +
      (leftover > 0 ? `; ⚠ 残留 ${leftover} 处未定义: ${[...misses].join(', ')}(多半是运行期变量, 静态出图无影响)` : '; 无残留'),
  );
  return 0;
}

if (isMainModule(import.meta.url)) process.exitCode = main(process.argv.slice(2));
