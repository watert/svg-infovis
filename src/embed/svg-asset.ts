// =====================================================================
// embed/svg-asset · 整幅外部 SVG(echarts 这类) → 可嵌进宿主的素材
//
// 由来(260920): 结构图里常要放"这一格的数据" —— 一张**真的图表**。core 只会画盒与线,
// 而按图标链那条窄面把 echarts 的产物烘平成七原语**做不到**: 实测把四份产物喂给
// `parseIconSvg` 全在第一个 `class` 属性上当场抛(原文见立项期"把 echarts SSR 产物烘平"那组
// 实测), 再往下还有 `<text>` / `transform` / `<style>` / `<g>` /
// `clipPath` —— 而那张窄面是**故意的**(只为 lucide 那 1853 个图标而写), 不该为这一条把它撑开。
//
// 于是走**嵌套 `<svg>`**: 把素材的内部标记整个塞进宿主的
// `<svg x y width height viewBox preserveAspectRatio>` 里。三条依据都实测过
// (rsvg-convert 栅格化, 多图并排核过 bar / line / pie / scatter):
//   · `clipPath` / `<defs>` / `<g>` / `transform="matrix(…)"` / `polyline` / `paint-order`
//     全部照常 —— **不必把坐标烘平到宿主坐标系**(那要重写圆弧 / 矩阵 / 裁剪, 收益只是产物短一点)
//   · 素材内部那套坐标由它自己的 `viewBox` 声明, 我们只声明"画在哪、多大" —— 缩放交给渲染器,
//     与"几何自己算"不冲突: 里面那套几何**本来就不是我们算的**
//   · 素材放在 `<defs>` 里的 `clipPath` 进嵌套 svg 同样解析得到
//
// 四件必须做的事:
//   ① **fail-closed**(命中即抛, 且说清怎么改): 脚本 / `<foreignObject` / `<iframe` /
//      `<image` / `<use` / 事件属性 / 指向文档外的 `href`。它们是"画出来跟作者以为的不一样"的来源
//      (还可能是安全面), 而图上没人看得出 —— 与图标链"见到不认识的元素当场抛"同一条立场。
//   ② **`:hover` 之外不许有样式**: 实测 4 种图型的 `<style>` 块**全是 `:hover` 规则**
//      (静态图里本就不生效, 整块丢掉 = 观感不变); 但**只要有一条不是**, 静默丢掉就等于悄悄改观感
//      —— 所以那是抛错, 不是丢弃。丢掉的那几块要记进 `dropped`(差集必须可见)。
//   ③ **命名空间化(防串台)**: echarts 的 id 从 `zr0` 起算(`id="zr1-c0"` + `url(#zr1-c0)` +
//      `class="zr1-cls-2"`), 而**同一张图放两份素材**时 `url(#…)` 会全解析到第一个定义 ——
//      与网格底纹那条"重复 pattern id 串台"是同一副面孔。默认前缀 = `name`, 名字不同就自动不撞。
//   ④ **字节确定**: 纯字符串处理, 无时间 / 随机 / 集合序 —— 同一份输入两次逐字节相同。
//
// 定位: 纯解析, **零运行期依赖**(只 import guard 与 vec), 不读盘 —— 素材文本由调用方给。
// =====================================================================

import { type Rect, round1 } from '../geometry/vec.js';
import { ShapeInputError } from '../guard.js';

/** 解析产物 —— **进 scene 的就是它**(纯数据, 可 JSON 往返) */
export type EmbedAsset = {
  /** 素材名(同时是缺省的 id 前缀); 只作对账与报错用, 不参与渲染 */
  name?: string;
  /** 素材自己的坐标系(取根 `<svg>` 的 viewBox; 缺省时用 width/height 兜底), 已 `round1` */
  viewBox: Rect;
  /** 已命名空间化、可直接嵌进宿主的**内部**标记(不含外层 `<svg>`) */
  markup: string;
  /** 构建期**有意丢掉**的东西 —— 渲染面与素材面的差集必须可见(同 `metrics.phantom_*` 那条纪律) */
  dropped: string[];
};

export type EmbedAssetOptions = {
  /** 素材名; 也是缺省的 id 前缀 */
  name?: string;
  /** id 前缀(覆盖 `name`)。**多份素材必须给不同前缀**, 否则 `url(#…)` 会串到第一份定义上 */
  idPrefix?: string;
};

function fail(field: string, reason: string, hint?: string): never {
  throw new ShapeInputError('embedAsset', field, reason, hint, '素材字段');
}

/** `name="v"` / `name='v'` —— 与 `icons/svg-parse` 同一口径(值必须带引号, 不带引号是自找的歧义) */
function parseAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z_][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) out[m[1]] = m[3] ?? m[4] ?? '';
  return out;
}

/**
 * 命中即抛的元素 / 属性(见文件头 ①)。`why` 说现象, `hint` 说怎么改 ——
 * 静默跳过等于画出一张**缺了几块**的图, 而图上没人看得出(与"NaN 静默丢元素"同族)。
 */
const FORBIDDEN: ReadonlyArray<{ re: RegExp; field: string; why: string; hint: string }> = [
  { re: /<\s*script\b/i, field: 'script', why: '素材里有 <script>', hint: '图的产物不该带脚本; 要动态效果就在出素材那一步渲染成静态标记' },
  { re: /<\s*foreignObject\b/i, field: 'foreignObject', why: '素材里有 <foreignObject>(内嵌 HTML)', hint: '嵌套 svg 里它换渲染器就变样(rsvg 与浏览器支持面不同); 先把那块内容画成 SVG 图元' },
  { re: /<\s*iframe\b/i, field: 'iframe', why: '素材里有 <iframe>', hint: '图里嵌不了另一个文档; 去掉它' },
  { re: /<\s*image\b/i, field: 'image', why: '素材里有 <image>(位图)', hint: '位图进不了"字节确定的矢量产物", 也没法进 golden; 把它内联成图元或换一份纯矢量素材' },
  { re: /<\s*use\b/i, field: 'use', why: '素材里有 <use>(引用别处的定义)', hint: '引用面(哪个 id 活到产物里)不可逐字节对账; 先把引用展开成真实的元素再进来' },
  { re: /\son[a-z]+\s*=/i, field: 'on*', why: '素材里有事件属性(on…="…")', hint: '静态图里它不生效, 但会让人以为"这一块有交互"; 去掉它' },
];

/** 根 `<svg>` 上的**声明噪声**: 它们说的是"这是一份 SVG 文档", 不是"画什么" —— 丢了不改渲染 */
const ROOT_DECL_NOISE = new Set(['xmlns', 'xmlns:xlink', 'xmlns:svg', 'version', 'baseProfile', 'width', 'height', 'viewBox']);

/** `<style>` 块(整块会被丢掉, 见文件头 ②) */
const STYLE_BLOCK = /<\s*style\b[^>]*>([\s\S]*?)<\s*\/\s*style\s*>/gi;

/** `href` 指向文档外 = 产物换台机器就画不出来(还可能是读取面的入口) */
const EXTERNAL_HREF = /^(?:https?:)?\/\/|^data:/i;

/** 数值属性的容错读法: `420` / `420px` / `420.5` 都认(单位只在末尾) */
const numOf = (raw: string | undefined): number => {
  if (raw === undefined) return NaN;
  const m = /^\s*(-?\d+(?:\.\d+)?)/.exec(raw);
  return m ? Number(m[1]) : NaN;
};

/**
 * SVG 文本 → `EmbedAsset`。接受完整文档 / 带 XML 声明 / 带换行缩进的原文。
 *
 * **不建 DOM**: 本仓零运行期依赖, 而这里做的是"取根 + 裁出内部 + 四类改写", 不需要树。
 * 任何看不懂 / 不许出现的东西一律当场抛并指出怎么改, 不留静默降级的余地。
 */
export function embedAsset(svgText: string, opts: EmbedAssetOptions = {}): EmbedAsset {
  const src = String(svgText ?? '');
  const root = /<\s*svg\b([^>]*)>/i.exec(src);
  if (!root) {
    fail('svg', '找不到 <svg> 根元素', '给进来的是不是一段 SVG 片段 / JSON? 这里要的是工具**出好的整幅 SVG 文本**');
  }
  const rootAttrs = parseAttrs(root![1]);

  // inner = 根标签之后到**最后一个** `</svg>` 之前(素材内部若还有嵌套 svg, 取最外那层的闭合)
  const after = src.slice((root!.index ?? 0) + root![0].length);
  const close = after.toLowerCase().lastIndexOf('</svg>');
  if (close < 0) fail('svg', '找不到闭合的 </svg>', '这段文本不是一份完整的 SVG(被截断的输出很常见, 检查生成侧有没有写全)');
  // 只裁掉整段首尾的空白(元素标签之间的空白不渲染); `<text>` 内部的空白一个字节都不动
  const raw = after.slice(0, close).trim();

  // --- ① fail-closed(先扫再改: 报错里给的原文才可读) --------------------
  for (const f of FORBIDDEN) {
    if (f.re.test(raw)) fail(f.field, f.why, f.hint);
  }
  const whole = `${root![0]}${raw}`;
  const hrefRe = /(?:\s|xlink:)href\s*=\s*("([^"]*)"|'([^']*)')/gi;
  let hm: RegExpExecArray | null;
  while ((hm = hrefRe.exec(whole))) {
    const v = (hm[2] ?? hm[3] ?? '').trim();
    if (EXTERNAL_HREF.test(v)) {
      fail('href', `素材里有指向文档外的 href="${v}"`,
        '嵌套 svg 里没有网络 / 文件解析的上下文 —— 产物换台机器就画不出来; 先把引用的东西内联进来, 或去掉这一处');
    }
  }

  // --- viewBox: 优先根上的 viewBox, 再退回 width/height -------------------
  let vb: Rect | null = null;
  if (rootAttrs.viewBox !== undefined) {
    const parts = rootAttrs.viewBox.trim().split(/[\s,]+/).map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
      fail('svg.viewBox', `不是四个数(拿到 "${rootAttrs.viewBox}")`, 'viewBox 是素材自己的坐标系, 四个数缺一不可');
    }
    vb = { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
  } else {
    const w = numOf(rootAttrs.width);
    const h = numOf(rootAttrs.height);
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) vb = { x: 0, y: 0, w, h };
  }
  if (!vb) {
    fail('svg.viewBox', '根 <svg> 上既没有 viewBox 也没有可用的 width/height',
      '素材自己的坐标系是"把它缩进宿主矩形"的前提; 补一个 viewBox(或在生成侧写好宽高)再来');
  }
  if (!(vb.w > 0) || !(vb.h > 0)) {
    fail('svg.viewBox', `宽高必须为正(拿到 ${vb.w}×${vb.h})`, '坐标系没有面积就没法映射进宿主的矩形');
  }

  // --- ② `<style>`: 全是 `:hover` 才准丢, 丢掉的记进 dropped -------------
  const dropped: string[] = [];
  let markup = raw;
  const blocks = [...markup.matchAll(STYLE_BLOCK)];
  if (blocks.length) {
    let rules = 0;
    for (const b of blocks) {
      const body = b[1].replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '');
      for (const rule of body.split('}').map((s) => s.trim()).filter(Boolean)) {
        if (!rule.includes(':hover')) {
          fail('style', `素材的 <style> 里有不是 :hover 的规则("${rule.slice(0, 80)}")`,
            '静态图里丢掉它 = 悄悄改观感, 所以这里不丢而是抛; 把这条规则的作用烘进元素的显式属性(或换一份不用 CSS 的素材)再进来');
        }
        rules++;
      }
    }
    markup = markup.replace(STYLE_BLOCK, '');
    dropped.push(`<style> 块 ${blocks.length} 个 / ${rules} 条规则全是 :hover —— 静态图里本就不生效, 整块丢掉`);
  }

  // --- ③ 命名空间化(防串台) ---------------------------------------------
  const prefix = opts.idPrefix ?? `${opts.name ?? 'emb'}-`;
  // 前置断言 `(?<![\w-])` 是必要的: `data-id=` 这种复合名会被 `\b` 放过, 而它不是我们要改的 id
  markup = markup
    .replace(/(?<![\w-])id\s*=\s*("([^"]*)"|'([^']*)')/g, (_m, _q, dq: string, sq: string) => `id="${prefix}${dq ?? sq}"`)
    .replace(/url\(\s*['"]?#([^)'"\s]+)['"]?\s*\)/g, (_m, id: string) => `url(#${prefix}${id})`)
    .replace(/(?<![\w-])class\s*=\s*("([^"]*)"|'([^']*)')/g, (_m, _q, dq: string, sq: string) =>
      `class="${(dq ?? sq).split(/\s+/).filter(Boolean).map((c) => `${prefix}${c}`).join(' ')}"`)
    .replace(/(\s(?:xlink:)?href\s*=\s*["'])#([^"']*)(["'])/g, (_m, head: string, id: string, tail: string) => `${head}#${prefix}${id}${tail}`);

  // --- 根上没被搬走的属性: 差集可见(宿主只接管 viewBox / width / height) --
  const extra = Object.keys(rootAttrs).filter((k) => !ROOT_DECL_NOISE.has(k)).sort();
  if (extra.length) {
    dropped.push(`根 <svg> 上还有 ${extra.length} 个属性没搬: ${extra.join(', ')}(宿主只接管 viewBox / width / height)`);
  }
  if (!markup) dropped.push('内部标记是空的 —— 这份素材画出来是空气');

  return {
    ...(opts.name === undefined ? {} : { name: opts.name }),
    viewBox: { x: round1(vb.x), y: round1(vb.y), w: round1(vb.w), h: round1(vb.h) },
    markup,
    dropped,
  };
}
