// =====================================================================
// shapes/badge · 编号徽章 + 列表行 (v0.2 排版层)
//
// 由来(docs/infograph-roadmap.md 的 v0.2「排版层」第 3 项): "列表与步骤"此前只能靠散坐标拼 ——
// 一个圆徽章 + 右面一两行字, 每张图都手写一遍; 而"圆该多大才装得下那个数字""徽章与文字的列怎么
// 对齐"这两件事一散就必然漂(量的是一套、画的是另一套 —— 本仓最贵的那类事故)。
//
// 定位: **纯 descriptor 出口**(与 `shapes/node.ts` / `stat.ts` 同层同纪律)。
//   ① `badgeShape`   —— 编号 / 字母圆徽章(圆 + 居中字), 吃 `tone × variant` 语义槽。
//      **solid 是主用例**(步骤序号 = "当前这一步", 一图里只有它有资格吃实底); outline / tint
//      留给次要标号(未开始 / 已完成)
//   ② `listRowShape` —— 徽章 + 主文本(± 次文本)组装成**一行**, 并交出这一行的 `bounds`;
//      尺寸反算走 `listRowFit`, 它返回的 `{w, h}` **直接喂** `geometry/pack` 的 `packCol` 堆成列
//
// 与既有模块的分工(一条都不自己重写):
//   · 度量 = `knives/measure` 的 `measureText`(单行估宽, 含行内 `**粗**` 的 3% 加宽)
//   · 堆法 = `geometry/text-rows` 的 `rowBlock`(n 行居中堆叠的**唯一一份**公式)
//   · 行内标记的上屏 = `shapes/inline` 的 `inlineTextRow`(与节点标签 / 边标签 / 旁注同一份)
//   · 行距与主 / 次字号差 = `NODE_TEXT_LAYOUT` —— 列表行就是"**左对齐**的节点主 / 次标签",
//     不另立第二份行距权威
//   · 取色 = `theme` 的 `toneStyle`(7 tone × 3 variant 的唯一入口)
//
// 盒与字**同源**(本文件存在的理由): 反算(`badgeFit` / `listRowFit`)与上屏(`badgeShape` /
// `listRowShape`)读同一处 `BADGE_LAYOUT` 与同一批 measure 结果, 且行的文本行由 `rowPlan` 一处
// 拆出来 —— "盒按一个字号算、字按另一个字号画"与"量了 3 行、画了 2 行"在结构上都发生不了。
//
// 边界(明确不做):
//   · **不做自动布局** —— 行摆在哪、行与行隔多远, 是作者的事(`packCol` 的 `gap` / `x` / `y0`);
//     本文件只回答"这一行占多大"与"这一行里什么落在哪"
//   · **不替作者编号** —— `badge` 不给就是**无字圆点**(bullet 一类), 不从行序推序号
//   · **作者声明优先** —— `size` / `w` / `h` 给了就照用(与 `nodeShape` 的 `rect` 同口径: 装不下
//     是作者的事, 组件不因内容长大); 拿不准就用 `badgeFit` / `listRowFit` 的反算值
//   · **不在文本里写 bullet 字符** —— `•` 这类符号在 mono / rsvg 管线没有字形回退(QUICKREF 的
//     paper 主题那条), 要圆点就用无字徽章
// =====================================================================

import { type DGroup, type Descriptor, anchorAttrs, baselineY, circle, group } from '../descriptor.js';
import { DEFAULT_THEME, type Theme, type Tone, TONES, type Variant, toneStyle } from '../theme.js';
import { HINT_KNOB_SIZE, ShapeInputError, assertFiniteNumber, assertOneOf } from '../guard.js';
import type { Rect } from '../geometry/vec.js';
import { rowBlock } from '../geometry/text-rows.js';
import { measureText } from '../knives/measure.js';
import { NODE_TEXT_LAYOUT } from './node.js';
import { inlineTextRow } from './inline.js';

/**
 * 徽章与列表行的排布参数 —— **反算与上屏共用的唯一一份数字**。
 * 与 `NODE_TEXT_LAYOUT` 那条纪律同源: 两处各写一份 = 盒按一个字号算、字按另一个字号画。
 * 行文本那一侧**刻意不在这里**: 主 / 次字号与行距取 `NODE_TEXT_LAYOUT`(节点标签那一位),
 * 抄一遍就是给自己立第二个权威。
 */
export const BADGE_LAYOUT = {
  /** 徽章直径的**下限**(px): 无字圆点就是它; 有字时由字块的外接圆接手(单字 25, 见下) */
  size: 24,
  /** 徽章内字号(px): 与直径下限同量级(12 : 24)—— 再大圆就"空", 再小数字顶到圆边 */
  fontSize: 12,
  /**
   * 徽章内字重 = `NODE_TEXT_LAYOUT.weight`(600, 仓里的标题档)。**刻意不留 700 这一档**:
   * `measureText` 的粗体加宽只按"是否 ≥ 600"一档算(3%) —— 写 700 就是"盒按 600 的宽算、
   * 字按 700 画"(见 `STAT_TEXT_LAYOUT.valueWeight` 同一条理由)。
   */
  weight: NODE_TEXT_LAYOUT.weight,
  /** 字块**四角**到圆边的呼吸位(px): 直径 = 字块斜对角 + 2×本值(见 `diameterOf`) */
  pad: 3,
  /** 徽章与右侧文本块之间的间距(px) —— 它也是列表列里文本左缘相对行左缘的偏移量 */
  gap: 10,
} as const;

// 12 号字配 24 的直径下限, 落到图上是什么样(实测值, 记在这儿省得每次现跑):
//   无字圆点 **24** · 单字 `"5"` **25** · 双字 `"10"` **29** · 三字 `"100"` **35** · 两行 `"A\nB"` **39**
// 前两个数说明**下限真的在下限档**(内容撑不动它), 从双字起由内容接手 —— 想要整列齐就给统一的
// `badgeSize`(见 `listRowFit`), 别指望各行反算值刚好一样。

/**
 * 字块 → 直径: **外接圆**解法 `d = max(下限, √(W² + H²) + 2×pad)`。
 *
 * 为什么不是拍一个"字号 ×1.8": 真判据是字块四角离圆心的距离 `√((W/2)² + (H/2)²)` ——
 * 斜对角上那两个角恰恰最先出圆, 而它们由**内容**决定, 不由字号决定(`"10"` 比 `"5"` 宽一倍)。
 * 紧解的好处是**可断言**: 测试能把"四角落在呼吸圈内"当闭环钉住, 拍的系数只能靠眼睛。
 */
const diameterOf = (blockW: number, blockH: number, pad: number, floor: number): number =>
  Math.max(floor, Math.hypot(blockW, blockH) + 2 * pad);

// --- ① 圆徽章 ---------------------------------------------------------

export type BadgeFitOptions = {
  /** 徽章里的字(编号 / 字母, 通常 1~2 字; 可含 `\n` —— 逐行照画, 圆心对称)。不给 / 空串 = 无字圆点 */
  content?: string;
  /** 字号(px)。缺省 `BADGE_LAYOUT.fontSize` */
  fontSize?: number;
  /** 直径**下限**(px)。缺省 `BADGE_LAYOUT.size` */
  minSize?: number;
  /** 四角呼吸位(px)。缺省 `BADGE_LAYOUT.pad` */
  pad?: number;
};

export type BadgeFitResult = {
  /** 直径(px) = `ceil(max(下限, √(W² + H²) + 2×pad))` */
  size: number;
  /** 半径 = `size / 2` —— 圆的几何只有这一个数 */
  r: number;
  /** 字块宽(px) = 最宽一行的 `measureText` 宽(不含 pad); 无字则 0 */
  contentW: number;
  /** 字块高(px) = 行块并集(`rowBlock`, 行高吃 `measureText` 的行盒); 无字则 0 */
  contentH: number;
  /** 真会画出来的行数(`\n` 拆出来的; 无字 = 0) */
  lines: number;
  /** 本次采用的字号 / 字重 / 呼吸位 */
  fontSize: number;
  weight: number;
  pad: number;
};

/**
 * 非负尺寸的统一守卫(三处共用同一句话): 非有限值走 `guard` 口径当场抛, 负值是**尺寸写反**
 * (与 `assertFiniteRect` 对宽高同一立场) —— 徽章这一族到处是"缝 / 呼吸位 / 字号", 逐个写两行太啰嗦。
 */
function assertSize(owner: string, field: string, v: number, hint: string): void {
  assertFiniteNumber(owner, field, v, hint);
  if (v < 0) throw new ShapeInputError(owner, field, `为负(${v})`, hint);
}

/**
 * 按内容反算徽章直径: 字块宽取最宽一行, 高走 `rowBlock` 并集, 再套外接圆解法并取 `ceil`。
 *
 * ```ts
 * const f = badgeFit({ content: '10' });        // → { size: 29, r: 14.5, … }
 * const d = Math.max(...STEPS.map((s) => badgeFit({ content: s.no }).size));   // 整列徽章要齐: 全列取大
 * ```
 * ⚠ 它只管"装得下": 视觉上多大的圆好看是版式决策 —— 想给统一直径就直接用 `minSize`(或
 * `badgeShape` 的 `size`), 这里给的是**下限**。
 */
export function badgeFit(o: BadgeFitOptions = {}): BadgeFitResult {
  const fontSize = o.fontSize ?? BADGE_LAYOUT.fontSize;
  assertSize('badgeFit', 'fontSize', fontSize, '字号是尺寸不是增量; 不传就走 BADGE_LAYOUT.fontSize');
  const floor = o.minSize ?? BADGE_LAYOUT.size;
  if (o.minSize !== undefined) assertSize('badgeFit', 'minSize', floor, HINT_KNOB_SIZE);
  const pad = o.pad ?? BADGE_LAYOUT.pad;
  if (o.pad !== undefined) assertSize('badgeFit', 'pad', pad, HINT_KNOB_SIZE);
  const content = o.content ?? '';
  const lines = content ? content.split('\n') : [];
  // 逐行量宽 + 行块取并集: 与节点标签 / 旁注同一把尺子(行内 `**粗**` 也在 `measureText` 那一层加宽)
  const boxes = lines.map((t) => measureText(t, { fontSize, weight: BADGE_LAYOUT.weight }));
  const contentW = Math.max(0, ...boxes.map((b) => b.width));
  const contentH = boxes.length
    ? rowBlock(boxes.length, fontSize * NODE_TEXT_LAYOUT.lineGapEm, boxes.map((b) => b.height)).height
    : 0;
  const size = Math.ceil(diameterOf(contentW, contentH, pad, floor));
  return { size, r: size / 2, contentW, contentH, lines: boxes.length, fontSize, weight: BADGE_LAYOUT.weight, pad };
}

export type BadgeProps = {
  /** 圆心 —— 圆的坐标口径与 `descriptor` 的 `circle` 一致(**不是**"盒左上": 徽章没有盒) */
  cx: number;
  cy: number;
  /** 徽章里的字(可含 `\n`)。不给 / 空串 = 无字圆点 */
  content?: string;
  /** 直径(px)。**给了就照用**(作者声明); 不给走 `badgeFit` 按内容反算 */
  size?: number;
  /** 字号(px)。缺省 `BADGE_LAYOUT.fontSize` */
  fontSize?: number;
  /** 肤色(语义槽, 缺省 `slate`) */
  tone?: Tone;
  /** 档位(缺省 `outline`; 编号步骤的主用例是 `solid`) */
  variant?: Variant;
  theme?: Theme;
  /** 单点覆盖(少数例外才用; 常规取色走 `tone × variant` 两槽) */
  fill?: string;
  stroke?: string;
  textColor?: string;
  strokeWidth?: number;
  /** 整枚徽章淡化(0~1, 缺省 1 不输出属性) */
  opacity?: number;
};

/**
 * 徽章 descriptor: 一个圆 + 居中的字(逐行, 行块对**圆心**对称 —— 与 `labelBoxShape` 同一种堆法)。
 *
 * 返回类型是 `DGroup` 而不是宽联合 `Descriptor`(与 `nodeShape` / `statShape` 同规矩):
 * 本函数**恒**返回一个 group, 声明成联合是类型在撒谎。
 */
export function badgeShape(p: BadgeProps): DGroup {
  assertFiniteNumber('badgeShape', 'cx', p.cx);
  assertFiniteNumber('badgeShape', 'cy', p.cy);
  assertOneOf('badgeShape', 'tone', p.tone, TONES);
  if (p.fontSize !== undefined) assertSize('badgeShape', 'fontSize', p.fontSize, '字号是尺寸不是增量; 不传就走 BADGE_LAYOUT.fontSize');
  if (p.opacity !== undefined) assertFiniteNumber('badgeShape', 'opacity', p.opacity);
  // 作者给的直径要**正的**: 0 直径的圆画不出来 —— 与 `listRowFit` 的 `badgeSize` 同一条口径
  // (两处给的都是"这个圆多大", 一个放行一个拦下就是两套规矩)
  if (p.size !== undefined) {
    assertSize('badgeShape', 'size', p.size, '直径是尺寸不是增量; 不传就按内容反算');
    if (!(p.size > 0)) {
      throw new ShapeInputError('badgeShape', 'size', `不是正数(拿到 ${p.size})`, '直径是尺寸不是增量; 不要这枚徽章就别调本函数');
    }
  }
  const theme = p.theme ?? DEFAULT_THEME;
  // 反算那一份即使不采用也要跑: 字号与字重口径、行的拆法都从它出来(口径只有一处)
  const fit = badgeFit({ content: p.content, fontSize: p.fontSize });
  const size = p.size ?? fit.size;
  const st = toneStyle(theme, p.tone, p.variant);
  const ink = p.textColor ?? st.text;
  const lines = p.content ? p.content.split('\n') : [];
  const block = rowBlock(lines.length, fit.fontSize * NODE_TEXT_LAYOUT.lineGapEm);

  const children: Descriptor[] = [circle(p.cx, p.cy, size / 2, {
    fill: p.fill ?? st.fill,
    stroke: p.stroke ?? st.stroke,
    'stroke-width': p.strokeWidth ?? st.strokeWidth,
  })];
  for (const [i, content] of lines.entries()) {
    children.push(inlineTextRow({
      x: p.cx,
      y: baselineY(p.cy + block.offsets[i], fit.fontSize, 'central'),
      content,
      weight: fit.weight,
      theme,
      attrs: { ...anchorAttrs('middle'), 'font-size': fit.fontSize, fill: ink, 'font-family': 'inherit' },
    }));
  }
  return group(children, { 'data-shape': 'badge', ...(p.opacity === undefined ? {} : { opacity: p.opacity }) });
}

// --- ② 列表行(徽章 + 主文本 ± 次文本) ----------------------------------

export type ListRowFitOptions = {
  /** 徽章里的字(编号 / 字母)。不给 / 空串 = 无字圆点 */
  badge?: string;
  /** 徽章直径(px)。**给了就照用**(整列徽章要齐时给全列同一个值); 不给走 `badgeFit` 反算 */
  badgeSize?: number;
  /** 徽章字号(px)。缺省 `BADGE_LAYOUT.fontSize` */
  badgeFontSize?: number;
  /** 主文本(可含 `\n`: 宽取最宽行, 行块逐行堆) */
  label?: string;
  /** 次文本(小两号、`theme.label` 的灰, 接在主文本行块之后; 同样支持 `\n`) */
  sub?: string;
  /** 主文本字号(px)。缺省 `NODE_TEXT_LAYOUT.fontSize`(13, 与节点主标签同一个缺省) */
  fontSize?: number;
  /** 主文本字重(缺省 `NODE_TEXT_LAYOUT.weight` = 600, 标题档) */
  weight?: number;
  /** 徽章与文本块之间的间距(px)。缺省 `BADGE_LAYOUT.gap` */
  gap?: number;
};

export type ListRowFitResult = {
  /** 行宽(px) = 徽章直径 + `gap` + 文本块宽 —— `packCol` 的 `items` 直接吃 `{w, h}` */
  w: number;
  /** 行高(px) = `max(徽章直径, 文本块高)` —— 徽章与文本块对**行框中心**对称 */
  h: number;
  /** 本次采用的徽章直径(px): 作者给了 `badgeSize` 就是它, 否则 `badgeFit` 的反算值 */
  badgeSize: number;
  /** 文本块左缘相对行左缘的偏移(px) = 徽章直径 + `gap` —— 整列的文本对齐就靠它 */
  textOffset: number;
  /** 文本块宽(px) = 主 / 次各行取最大(`measureText`); 无文本则 0 */
  textW: number;
  /** 文本块高(px) = 行块并集(`rowBlock`, 行距 = 主字号 × `lineGapEm`); 无文本则 0 */
  textH: number;
  /** 真会画出来的文本行数(主文本各行 + 次文本各行) */
  lines: number;
  /** 本次采用的徽章字号 / 主文本字号 / 主文本字重 / 徽章与文本的缝 */
  badgeFontSize: number;
  fontSize: number;
  weight: number;
  gap: number;
};

/** 一行里"哪几行字、什么字号" —— 反算与上屏共读这一份, 于是"量了 3 行、画了 2 行"不可能发生 */
type RowLine = {
  content: string;
  size: number;
  /** 字重: 主文本给(缺省仍走 `NODE_TEXT_LAYOUT.weight`); **次文本不给** = 走 400 缺省(不写属性) */
  weight?: number;
  /** 是次文本(小两号 + `theme.label` 的小字槽) */
  sub: boolean;
};

/**
 * 行的**文本行表 + 尺寸**(纯度量, 不落任何坐标) —— `listRowFit` 与 `listRowShape` 共读这一份。
 * 拆两处就是给自己埋一个会漂的第二权威(尺寸一处、行表一处, 迟早对不上)。
 */
function rowPlan(owner: string, o: ListRowFitOptions): { fit: ListRowFitResult; lines: RowLine[] } {
  const fontSize = o.fontSize ?? NODE_TEXT_LAYOUT.fontSize;
  assertSize(owner, 'fontSize', fontSize, '字号是尺寸不是增量; 不传就走 NODE_TEXT_LAYOUT.fontSize');
  const weight = o.weight ?? NODE_TEXT_LAYOUT.weight;
  assertFiniteNumber(owner, 'weight', weight);
  const gap = o.gap ?? BADGE_LAYOUT.gap;
  if (o.gap !== undefined) assertSize(owner, 'gap', gap, HINT_KNOB_SIZE);
  const badgeFontSize = o.badgeFontSize ?? BADGE_LAYOUT.fontSize;
  if (o.badgeFontSize !== undefined) assertSize(owner, 'badgeFontSize', badgeFontSize, '字号是尺寸不是增量; 不传就走 BADGE_LAYOUT.fontSize');
  // 空行守卫: 没有文本的"行"只剩一个圆, 摆到图上没人看得出是漏了内容(与 `cardFit` 对空 `lines` 同一立场)。
  // 空串也算没给 —— 文案是人的决定, 空串是手滑。
  if (!o.label && !o.sub) {
    throw new ShapeInputError(owner, 'label', '与 sub 都没给', '一行至少要有主文本或次文本; 只想单独画个圆请直接用 badgeShape');
  }
  const subSize = fontSize - NODE_TEXT_LAYOUT.subSizeDelta;
  const lines: RowLine[] = [
    ...(o.label ? o.label.split('\n').map((content): RowLine => ({ content, size: fontSize, weight, sub: false })) : []),
    ...(o.sub ? o.sub.split('\n').map((content): RowLine => ({ content, size: subSize, sub: true })) : []),
  ];
  const boxes = lines.map((l) => measureText(l.content, { fontSize: l.size, weight: l.weight }));
  const textW = Math.max(...boxes.map((b) => b.width));
  // 行距与堆法取渲染那一份(主字号 × `lineGapEm`): 次文本行盒比这个 pitch 矮, 所以多行不会叠
  const textH = rowBlock(lines.length, fontSize * NODE_TEXT_LAYOUT.lineGapEm, boxes.map((b) => b.height)).height;
  const badgeSize = o.badgeSize ?? badgeFit({ content: o.badge, fontSize: badgeFontSize }).size;
  // 作者给的直径要**正的**: 0 直径的圆画不出来, 而"不要徽章"这件事已经由 `label` / `sub` 那一侧
  // 说清了(真是纯文本请用 `textShape`) —— 静默画一个看不见的圆是这里最坏的下场
  if (o.badgeSize !== undefined) {
    assertSize(owner, 'badgeSize', badgeSize, '直径是尺寸不是增量; 不给就按徽章内容反算');
    if (!(badgeSize > 0)) {
      throw new ShapeInputError(owner, 'badgeSize', `不是正数(拿到 ${badgeSize})`, '直径是尺寸不是增量; 不给就按徽章内容反算');
    }
  }

  return {
    lines,
    fit: {
      w: Math.ceil(badgeSize + gap + textW),
      h: Math.ceil(Math.max(badgeSize, textH)),
      badgeSize,
      textOffset: badgeSize + gap,
      textW,
      textH,
      lines: lines.length,
      badgeFontSize,
      fontSize,
      weight,
      gap,
    },
  };
}

/**
 * 按内容反算**一行的尺寸**: 宽 = 徽章 + 缝 + 文本块, 高 = `max(徽章, 文本块)`。
 *
 * ```ts
 * const probe = STEPS.map((s) => listRowFit({ badge: s.idx, label: s.label, sub: s.sub }));
 * const BADGE = Math.max(...probe.map((f) => f.badgeSize));      // 徽章列要齐: 取全列最大
 * const fits = STEPS.map((s) => listRowFit({ …s, badgeSize: BADGE }));
 * const col = packCol({ items: fits, gap: 16, x: 40, y0: 40 });  // 返回面就是 `Size` —— 喂得进去
 * ```
 * ⚠ 逐行给高(有次文本的行更高), 所以列间距用 **`gap` 不用 `pitch`**: `pitch` 的心智是"每格
 * 一样高", 而尺寸参差时它换算出的每条缝都不一样(见 `geometry/pack` 的那条对照)。
 */
export function listRowFit(o: ListRowFitOptions): ListRowFitResult {
  return rowPlan('listRowFit', o).fit;
}

export type ListRowProps = ListRowFitOptions & {
  /** 行框左上角 —— 行框本身不画(要不要底 / 分隔线 / 组框是作者的事) */
  x: number;
  y: number;
  /** 行宽(px)。给了就照用(整列等宽: 分隔线 / hover 底要靠它); 不给 = 内容反算 */
  w?: number;
  /** 行高(px)。给了就照用(整列等高: 等距分隔线要靠它); 不给 = `max(徽章直径, 文本块高)` */
  h?: number;
  /** 徽章肤色(语义槽, 缺省 `slate`) */
  tone?: Tone;
  /** 徽章档位(缺省 `outline`; 编号步骤的主用例是 `solid`) */
  variant?: Variant;
  theme?: Theme;
  /** 主文本色(单点例外, 覆盖中性墨槽)。次文本恒取 `theme.label`(小字槽) */
  textColor?: string;
  /** 整行淡化(0~1, 缺省 1 不输出属性) */
  opacity?: number;
};

export type ListRow = {
  /** 这一行的 descriptor(徽章 + 文本行) —— 直接进 `svg(…)` 的 children */
  shape: DGroup;
  /** 这一行占的矩形(行框)。没给 `w` / `h` 时与 `listRowFit` 的 `w` / `h` 逐位相同 */
  bounds: Rect;
};

/**
 * 列表行 descriptor: [徽章][缝][主文本块 ± 次文本块], 整行骑在**行框中心线**上。
 *
 * 落位只有三条, 都由 `rowPlan` 交出的数算出(没有第二份坐标口径):
 *   · 圆心 = `x + 直径/2`, `cy = 行框中心` —— 徽章**骑行心**, 于是不随文本行数上下跳
 *   · 文本左缘 = `x + textOffset`(徽章直径 + `gap`) —— 整列的文本对齐就看这一个数
 *   · 各行行心 = 行框中心 + `rowBlock` 的偏移(升序), 基线走 `baselineY(…, 'central')`
 *
 * 返回 `{ shape, bounds }`: `bounds` 是**这一行占的矩形**, 拿去 `bounds()` 收组框 / 喂
 * `contentBounds` 都行。它没并进 `shape` 的 attrs(描述符是纯数据, 多出来的字段类型也读不出来)。
 */
export function listRowShape(p: ListRowProps): ListRow {
  assertFiniteNumber('listRowShape', 'x', p.x);
  assertFiniteNumber('listRowShape', 'y', p.y);
  if (p.w !== undefined) assertSize('listRowShape', 'w', p.w, '宽高是尺寸不是增量; 传绝对值, 方向交给 x/y');
  if (p.h !== undefined) assertSize('listRowShape', 'h', p.h, '宽高是尺寸不是增量; 传绝对值, 方向交给 x/y');
  if (p.opacity !== undefined) assertFiniteNumber('listRowShape', 'opacity', p.opacity);
  assertOneOf('listRowShape', 'tone', p.tone, TONES);
  const theme = p.theme ?? DEFAULT_THEME;
  const { fit, lines } = rowPlan('listRowShape', p);
  const w = p.w ?? fit.w;
  const h = p.h ?? fit.h;
  // 主文本走**中性墨槽**(与 `nodeShape` 缺省标签色同一个槽); 次文本走 `theme.label`(小字槽,
  // 与旁注 / 边标签 / `statShape` 的标签同一个) —— 两档色都是主题槽, 不是本文件拍的两个色值
  const ink = p.textColor ?? theme.tones.slate.text;
  const cy = p.y + h / 2;

  const badge = badgeShape({
    cx: p.x + fit.badgeSize / 2,
    cy,
    content: p.badge,
    size: fit.badgeSize,
    fontSize: fit.badgeFontSize,
    tone: p.tone,
    variant: p.variant,
    theme,
  });
  const textX = p.x + fit.textOffset;
  const block = rowBlock(lines.length, fit.fontSize * NODE_TEXT_LAYOUT.lineGapEm);
  const children: Descriptor[] = [badge];
  for (const [i, line] of lines.entries()) {
    children.push(inlineTextRow({
      x: textX,
      y: baselineY(cy + block.offsets[i], line.size, 'central'),
      content: line.content,
      weight: line.weight,
      theme,
      attrs: { ...anchorAttrs('start'), 'font-size': line.size, fill: line.sub ? theme.label : ink, 'font-family': 'inherit' },
    }));
  }
  return {
    shape: group(children, { 'data-shape': 'list-row', ...(p.opacity === undefined ? {} : { opacity: p.opacity }) }),
    bounds: { x: p.x, y: p.y, w, h },
  };
}
