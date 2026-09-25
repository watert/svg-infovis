// =====================================================================
// serialize · descriptor → SVG 字符串 (字节确定性的唯一守门人)
// 铁律(设计稿 §三): 属性键按 codepoint 序, 数值取 1 位小数, 禁 Date.now / Math.random。
// 同一份 descriptor 在任何机器上必须产出同一串字节 —— 否则 golden 无从谈起。
// =====================================================================

import type { Attrs, Descriptor, DSvg } from './descriptor';
import { fmt, round1 } from './geometry/vec';

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeXml = (s: string): string => s.replace(/[&<>"']/g, (c) => ESCAPES[c]);
export const escapeAttr = escapeXml;

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
