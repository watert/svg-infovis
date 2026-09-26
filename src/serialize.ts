// =====================================================================
// serialize · descriptor → SVG 字符串 (字节确定性的唯一守门人)
// 铁律(设计稿 §三): 属性键按 codepoint 序, 数值取 1 位小数, 禁 Date.now / Math.random。
// 同一份 descriptor 在任何机器上必须产出同一串字节 —— 否则 golden 无从谈起。
// =====================================================================

import { easingSpline, type Attrs, type Descriptor, type DSvg } from './descriptor.js';
import { fmt, round1 } from './geometry/vec.js';

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeXml = (s: string): string => s.replace(/[&<>"']/g, (c) => ESCAPES[c]);
export const escapeAttr = escapeXml;

/**
 * `<style>` 的内容是**元素文本**(不是属性值): XML 字符数据里必须转的只有 `<` 与 `&`
 * (`>` 合法, 引号更是普通字符) —— 所以**不整份复用 `escapeXml`**: 它多转 `>` 与引号, 平白多字节,
 * "原样插入"这条承诺也打了折。
 *
 * 决定(260926, 在 CDATA 与转义之间选): **转义**, 不用 `<![CDATA[ … ]]>`。两者都是合法 XML,
 * 分岔在产物**离开独立文件**的时候 —— 把 `<style>` 内联进 HTML 页时, HTML 解析器对 `<style>` 走
 * rawtext(不认 CDATA 标记), `<![CDATA[` 会当字面量粘进第一条规则的前导, 把整段 `@keyframes` 吞掉;
 * 而转义那一版最坏只是宿主不还原实体(`<` / `&` 在 CSS 里近乎不存在, 唯一常见的场合是 CSS 嵌套的 `&`)。
 * 两害相权取 **XML 正确**: 产物是带 XML 声明的独立 .svg, rsvg / resvg / 浏览器按 XML 解析时逐字精确。
 * ⚠ 代价记在这儿: 若将来要"按宿主口吻序列化"(内联进 HTML 那一版), 加一层显式开关,
 * 别在这里偷偷改成 CDATA。
 */
const STYLE_TEXT_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;' };
export const escapeStyleText = (s: string): string => s.replace(/[&<]/g, (c) => STYLE_TEXT_ESCAPES[c]);

/** 属性序列化: 键 codepoint 序, 数值 round1, undefined 丢弃 */
export function attrsToStr(attrs?: Attrs): string {
  if (!attrs) return '';
  return Object.keys(attrs)
    .filter((k) => attrs[k] !== undefined)
    .sort()
    .map((k) => {
      const v = attrs[k] as string | number;
      return ` ${k}="${escapeXml(typeof v === 'number' ? String(round1(v)) : v)}"`;
    })
    .join('');
}

/** 单个 descriptor → SVG 片段(带缩进, 便于人读 diff) */
export function serialize(d: Descriptor, depth = 0): string {
  const pad = '  '.repeat(depth);
  switch (d.kind) {
    case 'path':
      return `${pad}<path d="${escapeAttr(d.d)}"${attrsToStr(d.attrs)} />`;
    case 'circle':
      return `${pad}<circle cx="${fmt(round1(d.cx))}" cy="${fmt(round1(d.cy))}" r="${fmt(round1(d.r))}"${attrsToStr(d.attrs)} />`;
    case 'rect': {
      const rx = d.rx === undefined ? '' : ` rx="${fmt(round1(d.rx))}"`;
      return `${pad}<rect x="${fmt(round1(d.x))}" y="${fmt(round1(d.y))}" width="${fmt(round1(d.w))}" height="${fmt(round1(d.h))}"${rx}${attrsToStr(d.attrs)} />`;
    }
    case 'text':
      // 富文本(分段样式)走 `<tspan>`: 只有写了属性那几段输出属性, 其余继承 `<text>`
      // (260920 卡片的行内 `**粗**`, 260925 加斜体 / 删除线 / 行内色)。
      // `weight` 排在最前且走 `fmt`(2 位小数) —— 首版只有它一位, 那个字节不许动; `attrs` 走
      // `attrsToStr` 那套键序。无 spans 的老路径输出**逐字节不变**
      if (d.spans) {
        const inner = d.spans
          .map((s) => {
            const head = s.weight === undefined ? '' : ` font-weight="${fmt(round1(s.weight))}"`;
            return `<tspan${head}${attrsToStr(s.attrs)}>${escapeXml(s.text)}</tspan>`;
          })
          .join('');
        return `${pad}<text x="${fmt(round1(d.x))}" y="${fmt(round1(d.y))}"${attrsToStr(d.attrs)}>${inner}</text>`;
      }
      return `${pad}<text x="${fmt(round1(d.x))}" y="${fmt(round1(d.y))}"${attrsToStr(d.attrs)}>${escapeXml(d.content)}</text>`;
    case 'group':
      return `${pad}<g${attrsToStr(d.attrs)}>\n${d.children.map((c) => serialize(c, depth + 1)).join('\n')}\n${pad}</g>`;
    // pattern / defs 的 id 与 tile 尺寸写成固定属性(不进 attrs), 免得 `id` 在两边各写一次
    case 'pattern':
      return `${pad}<pattern id="${escapeXml(d.id)}" width="${fmt(round1(d.w))}" height="${fmt(round1(d.h))}"${attrsToStr(d.attrs)}>\n${d.children.map((c) => serialize(c, depth + 1)).join('\n')}\n${pad}</pattern>`;
    case 'defs':
      return `${pad}<defs>\n${d.children.map((c) => serialize(c, depth + 1)).join('\n')}\n${pad}</defs>`;
    case 'embed':
      // ⚠ **markup 原样插入 —— 绝不重新缩进、绝不插换行**。
      // `<text>` 元素内部的首尾空白会真影响渲染: 给一个居中标签插个换行, 文字就被推偏一格,
      // 而图上没人看得出这一格是"格式化"插进去的。所以这里不做为了好看的格式化 ——
      // 只有包裹它的那对 `<svg>` 标签前后各有一个换行(标签之间的空白不渲染), markup 自己一个字节不动。
      return (
        `${pad}<svg x="${fmt(round1(d.x))}" y="${fmt(round1(d.y))}" width="${fmt(round1(d.w))}" height="${fmt(round1(d.h))}"` +
        ` viewBox="${fmt(round1(d.viewBox.x))} ${fmt(round1(d.viewBox.y))} ${fmt(round1(d.viewBox.w))} ${fmt(round1(d.viewBox.h))}"` +
        ` preserveAspectRatio="xMidYMid meet"${attrsToStr(d.attrs)}>\n${d.markup}\n${pad}</svg>`
      );
    case 'animate': {
      // SMIL 属性走**同一个属性袋**再交给 attrsToStr(与 path / circle 同一把尺子): 键序由它排,
      // 同一个键因此不可能出现两次(重复属性 = XML 不合法) —— 这也是本 case 不学 pattern 那种
      // "固定属性 + attrsToStr" 写法的原因。
      // `keyTimes="0;1"` 是**一个区间**(from/to 或只给一端)的显式表达: 规范允许省略, 但省略了
      // 读者就得自己去背"缺省 = 等分"; 产物要能自解释。多段 values 的逐段 keyTimes 内核不猜 ——
      // 所以 easing 与 values 互斥(构造器已拦)。
      const ease: Attrs =
        d.easing === undefined ? {} : { calcMode: 'spline', keyTimes: '0;1', keySplines: easingSpline(d.easing) };
      const tag = d.type === undefined ? 'animate' : 'animateTransform';
      return (
        `${pad}<${tag}` +
        attrsToStr({
          attributeName: d.attributeName,
          begin: d.begin,
          dur: d.dur,
          from: d.from,
          to: d.to,
          values: d.values,
          type: d.type,
          // 数字档: `String()` 的输出由 ECMAScript 规范定死, 它不是几何量, 不过 round1
          repeatCount: d.repeatCount === undefined ? undefined : String(d.repeatCount),
          ...ease,
          // 作者的 attrs **最后**合并 = 覆盖(与"覆盖表永远赢"同一条), 也是手写 calcMode /
          // keySplines(多段 values 逐段缓动)的逃生舱
          ...d.attrs,
        }) +
        ' />'
      );
    }
    case 'style':
      // 内容**原样插入**(与 embed 的 markup 同一条原则: 不重排 / 不缩进 / 不插换行) ——
      // 多行 CSS 自带缩进, 内核再加一层就是替作者排版, 还会改 CSS 里的空白语义。
      // `type="text/css"` 放进属性袋而不是写死前缀: 免得作者也在 attrs 里写一次(重复属性 = XML 不合法)。
      return `${pad}<style${attrsToStr({ type: 'text/css', ...d.attrs })}>${escapeStyleText(d.css)}</style>`;
  }
}

/** 完整 SVG 文档(带 XML 声明与默认命名空间) */
export function toSVG(root: DSvg, opts: { declaration?: boolean } = {}): string {
  const head = opts.declaration === false ? '' : '<?xml version="1.0" encoding="UTF-8"?>\n';
  const view = `0 0 ${fmt(round1(root.w))} ${fmt(round1(root.h))}`;
  const body = root.children.map((c) => serialize(c, 1)).join('\n');
  return (
    `${head}<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(round1(root.w))}" height="${fmt(round1(root.h))}"` +
    ` viewBox="${view}"${attrsToStr(root.attrs)}>\n${body}\n</svg>\n`
  );
}
