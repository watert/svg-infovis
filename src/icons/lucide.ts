// =====================================================================
// icons/lucide · 素材库加载器(**bun/node 侧**, 不在 barrel 里 —— 见下)
//
// 分工:
//   · `svg-parse.ts` = **纯解析**(零依赖, 进 barrel): SVG 文本 → 原语表。浏览器路径也能用
//   · 本文件      = **读盘那半边**(`node:fs`): 素材名 → 文本 → 原语表, 带缓存 / 模糊建议
// 为什么不进 barrel: barrel 是给浏览器 demo 也吃的(`scene.ts` 里的 sha256 就刻意在调用期才取
// `Bun.CryptoHasher`)。把一个 `import 'node:fs'` 挂上 barrel, 等于给浏览器路径判了死刑。
// 浏览器 / 非 bun 消费方走 `iconFromSvg(svgText)` —— 素材文本从哪来是调用方的事。
//
// 素材是**构建期**读的: 解析结果进 scene(`SceneNode.icon`), 渲染路径上一个字节都不读盘。
// 于是"图能不能出"只取决于 scene, 与这台机器上有没有那份素材目录无关 —— 冻结图哲学要的就是这个。
//
// 素材库本体来自 npm 依赖 `lucide-static`(ISC, 零本地副本): 单图标 lazy 读盘走
// `require.resolve('lucide-static/icons/<name>.svg')` 深路径, 名字全集与 tags 走包内 `tags.json`。
// 来历 / 升版纪律写在 `assets/icons/ICON_SOURCE.md`。⚠ 不走 `lucide-static` barrel 入口 ——
// bun 直跑无 tree-shake, 会 eager load 全部 ~1848 个模块(与"零 build step"自相矛盾)。
// =====================================================================

import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { ShapeInputError } from '../guard.js';
import { type ParsedIcon, parseIconSvg } from './svg-parse.js';

/** 本仓"裸解析"入口: lucide-static 的 package.json **无 exports 字段**, 深路径因此可用(见 ICON_SOURCE.md) */
const require = createRequire(import.meta.url);

const cache = new Map<string, ParsedIcon>();
let namesCache: string[] | null = null;
let tagsCache: Record<string, string[]> | null = null;

/** `tags.json`(name → tags[])懒加载 —— 名字全集与"按概念找名字"都从它来 */
function tags(): Record<string, string[]> {
  if (!tagsCache) {
    try {
      tagsCache = JSON.parse(readFileSync(require.resolve('lucide-static/tags.json'), 'utf8')) as Record<string, string[]>;
    } catch (e) {
      throw new ShapeInputError('iconNames', 'lucide-static/tags.json',
        `读不到 lucide-static 的 tags.json(${(e as Error).message})`,
        'lucide-static 是 optional 依赖 —— 要图标链就装上它: `npm install lucide-static`(或 bun / pnpm add);'
        + ' 仓内开发则 `bun install`(版本锁在 lockfile, 升版走 PR, 见 assets/icons/ICON_SOURCE.md)', '环境');
    }
  }
  return tagsCache;
}

/** 素材库里全部图标名(kebab-case, 与上游同名), codepoint 序 —— 报错时用来给建议 */
export function iconNames(): string[] {
  if (!namesCache) namesCache = Object.keys(tags()).sort();
  return namesCache;
}

/** 编辑距离(只用于"名字打错一个字"的建议, 短字符串上足够) */
function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

/**
 * 按概念找图标名。两路并集(名字子串 + 上游 tags 命中), 名字命中排前面 ——
 * 这个是"我大概要一个飞机"到 `plane` 之间的那座桥, 也是本素材库唯一比"翻文件夹"强的地方。
 * (categories 不在 lucide-static 包内, 主动放弃 —— 见 ICON_SOURCE.md。)
 */
export function findIcon(query: string, limit = 12): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const names = iconNames();
  const t = tags();
  const byName = names.filter((n) => n.includes(q) || q.includes(n));
  const seen = new Set(byName);
  const byTag = names.filter((n) => !seen.has(n) && (t[n] ?? []).some((tag) => tag.toLowerCase().includes(q)));
  return [...byName, ...byTag].slice(0, limit);
}

/** 名字不存在时的报错: 给"可能想找的"几个, 别让调用方对着 ~1848 个名字猜 */
function missingName(name: string): never {
  const names = iconNames();
  const near = [...names]
    .map((n) => ({ n, d: editDistance(name.toLowerCase(), n) }))
    .sort((a, b) => a.d - b.d || (a.n < b.n ? -1 : 1))
    .slice(0, 4)
    .map((x) => x.n);
  const guessed = findIcon(name, 6);
  const suggest = [...new Set([...guessed, ...near])].slice(0, 6);
  throw new ShapeInputError('iconAsset', 'name', `素材库里没有 "${name}"`,
    suggest.length
      ? `可能想找: ${suggest.join(' / ')}; 全量名字看 lucide-static 的 tags.json, 或 findIcon('airplane') 按概念找`
      : '用 findIcon(关键词) 按概念找; 自制素材走 iconFromSvg(text) / iconFromFile(path)',
    '素材名');
}

export type IconAsset = ParsedIcon & { name: string };

/**
 * 读一个素材。**第一次读盘 + 解析, 之后走缓存**(同一张图里同一个图标用十次也只解析一次)。
 * 名字打错 → 当场抛, 并给出候选名(静默回落到"没有图标"会让图看着"就是没画").
 */
export function iconAsset(name: string): IconAsset {
  const hit = cache.get(name);
  if (hit) return hit as IconAsset;
  if (!iconNames().includes(name)) missingName(name);
  const parsed = parseIconSvg(readFileSync(require.resolve(`lucide-static/icons/${name}.svg`), 'utf8'), { name }) as IconAsset;
  cache.set(name, parsed);
  return parsed;
}

/** 一次性读一批(名字错了立刻抛, 不静默少给几个) */
export function iconAssets(names: readonly string[]): IconAsset[] {
  return names.map(iconAsset);
}

/**
 * 任意外部 SVG(**额外素材**的入口): 文本进, 原语表出。
 * 约束与素材库同一条 —— 只认七种几何元素, 见 `svg-parse.ts` 的文件头。
 */
export function iconFromSvg(svg: string, name?: string): ParsedIcon {
  return parseIconSvg(svg, name === undefined ? {} : { name });
}

/** 任意本地 SVG 文件(相对 / 绝对路径都收) —— 想用一组自制图标时的入口 */
export function iconFromFile(file: string, name = basename(file, extname(file))): ParsedIcon {
  if (!existsSync(file)) {
    throw new ShapeInputError('iconFromFile', 'file', `文件不存在(${file})`, '路径要落到具体的 .svg 文件上', '路径');
  }
  return parseIconSvg(readFileSync(file, 'utf8'), { name });
}
