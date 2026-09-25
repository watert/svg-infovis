// =====================================================================
// shapes/inline · 行内富文本的**唯一**上屏路径
//
// 病灶(260925): 行内标记的渲染只有 `nodeShape` 一家认, 而 `labelBoxShape`(边标签 / 遮罩片)
// 与 `export.ts` 的 `scene.texts`(旁注)各自画**纯文本** —— 同一个 `**粗**` 在节点里是粗体、
// 在边标签里是两个字面星号; 更坏的是**度量面认得它**(`measureText` 早按 run 加宽),
// 于是"量的宽度"与"画的那串字"再次分叉 —— 本仓最贵的那类事故。
//
// 所以"一行内容串 → `<text>`(± `<tspan>`)"这件事**只此一处**, 三家都吃它。
// 它做两件超出几何的事: ① 认标记(经 `geometry/inline-text`, 与度量**同一份 run 表**);
// ② 把 run 的样式袋翻成 SVG 属性 —— tone 名 → 色值的查表落在这里, 因为主题不属于纯文本层。
//
// 两条字节纪律(既有产物没用到新语法 ⇒ 必须逐字节不变):
//   · 单 run 且无样式的行走**老路**: 一个 `<text>`, `attrs` 原样 + 行字重(见下)
//   · 走 `<tspan>` 的行, `<text>` 上**不写 `font-weight`** —— 字重已由每个 span 自持,
//     再在父级写一份就是两处事实打架(这正是 260920 那批既有产物的字节: `<tspan font-weight>` 独占字重)
//
// 拆成多 chunk 就带上"首尾空白会被渲染器剥掉"这件事(260925): 接壤空格落在 tspan 行尾时图上会消失。
// 解法 `<text xml:space="preserve">` **钉在 `descriptor.richText` 一处**(不在本文件写 —— 单 run 那条
// 老路不过那里, 于是它的字节一动都不动)。
// =====================================================================

import { type Attrs, type Descriptor, type DTextSpan, richText, text } from '../descriptor';
import { DEFAULT_THEME, type Theme } from '../theme';
import { INLINE_KINDS, INLINE_STYLE, type InlineStyleBag, type InlineStyleSpec, type TextRun, needsTextParse, parseTextRuns } from '../geometry/inline-text';

/** 行基准字重(CSS 数值) —— 400 是 SVG 缺省, 写它等于白写(老产物字节也据此不含 `font-weight` 属性) */
const DEFAULT_WEIGHT = 400;

export type InlineTextRowProps = {
  x: number;
  /** 已折算好的基线 y(`baselineY` 的活; 本函数不碰垂直定位) */
  y: number;
  /** **一整行**的内容(换行由调用方先拆好) */
  content: string;
  /** `<text>` 上的非字重属性(锚点 / 字号 / 填充 / 行族 / opacity …) */
  attrs: Attrs;
  /** 行基准字重: 缺省 400; 行内粗体取 `max(本值, INLINE_STYLE.bold.weight)` */
  weight?: number;
  theme?: Theme;
};

/**
 * 着色标记的值 → 色值: **tone 名**查主题的文字槽(与 `SceneLabel.tone` / `textAttrs` 同一槽位),
 * 不是 tone 名就原样当色值用(作者可以写 `#hex` / `rgb(...)` / `currentColor`)。
 */
const resolvePaint = (value: string, theme: Theme): string =>
  (theme.tones as Record<string, { text: string } | undefined>)[value]?.text ?? value;

/**
 * 一个 run → 一个 `<tspan>`。样式袋里有的样式各自添属性, 表(`INLINE_STYLE`)说了算:
 * `svgAttrs` 静态照搬, `valueAttr` 吃解析出来的色值, `weight` 走"与行字重取 max"那条。
 *
 * 字重**每段都写**(哪怕这段没样式): `<text>` 上传不到字重(见文件头第二条纪律), 不写就等于
 * 悄悄把它降回 400 —— 那是"看起来只是有点细"的那种静默改写。
 */
function spanOf(run: TextRun, baseWeight: number, theme: Theme): DTextSpan {
  const bag: InlineStyleBag = run.style ?? {};
  const span: DTextSpan = { text: run.text, weight: bag.bold ? Math.max(baseWeight, INLINE_STYLE.bold.weight) : baseWeight };
  let attrs: Attrs | undefined;
  for (const kind of INLINE_KINDS) {
    if (!bag[kind]) continue;
    // 表里每种的字段各不相同(`satisfies` 保留了各自的字面类型), 按统一规格读
    const spec: InlineStyleSpec = INLINE_STYLE[kind];
    const patch: Attrs = { ...spec.svgAttrs, ...(spec.valueAttr ? { [spec.valueAttr]: resolvePaint(bag[kind] as string, theme) } : {}) };
    if (Object.keys(patch).length) attrs = { ...attrs, ...patch };
  }
  if (attrs) span.attrs = attrs;
  return span;
}

/** 一行文字 → descriptor: 无样式的走单 `<text>`, 有样式的挂 `<tspan>` */
export function inlineTextRow(p: InlineTextRowProps): Descriptor {
  // 字重**只从 `weight` 进**: `attrs` 里若也带 `font-weight`(老调用方如 `textAttrs` 会带),
  // 两份必然打架 —— 在这里丢掉, 写不写由下面那一处统一决定
  const { 'font-weight': _dropped, ...attrs } = p.attrs;
  const weight = p.weight ?? DEFAULT_WEIGHT;
  const runs = needsTextParse(p.content) ? parseTextRuns(p.content) : [{ text: p.content, start: 0, end: p.content.length }];
  const inner = runs[0];
  if (runs.length === 1 && !inner.style) {
    // 字重只在**这一条**路径上进属性: 缺省档不写(SVG 缺省即 400), 于是老产物逐字节不变
    return text(p.x, p.y, inner.text, weight === DEFAULT_WEIGHT ? attrs : { ...attrs, 'font-weight': weight });
  }
  const theme = p.theme ?? DEFAULT_THEME;
  return richText(p.x, p.y, runs.map((r) => spanOf(r, weight, theme)), attrs);
}
