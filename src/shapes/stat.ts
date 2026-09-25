// =====================================================================
// shapes/stat · 大数字块 (主数字 + 标签 ± delta)
//
// 由来(docs/infograph-roadmap.md 的 v0.2「排版层」): diagram 与 infograph 的观感差, 一半差在
// 版式原语上 —— 一张图里最常被手搓的就是"一个大数字 + 底下一行小字(± 一个涨跌标)"。此前它只能
// 靠散落的坐标拼: 数字该多大、标签离数字多远、delta 跟在哪儿、整块占多宽 —— 全是心算, 而
// `\n`/行距/内边距三处口径各写一份就必然漂(本仓最贵的那类事故)。本文件把它收成一块。
//
// 定位: **纯 descriptor 出口**(与 `shapes/node.ts` 同层同纪律), 输入内容与一个版式盒, 输出
// 三样东西的落位 —— 它**不画壳**(底 / 描边 / 分隔线是作者的事: 自己垫一个 `rect` 或 `nodeShape`),
// 也**不猜意图**(盒由作者给, 通常来自 `statFit`; 块内只有"数字行 + 标签行 + 行内 delta"这一种排布)。
//
// 与既有模块的分工(一条都不自己重写):
//   · 度量 = `knives/measure` 的 `measureText`(单行估宽, 含行内 `**粗**` 的 3% 加宽)
//   · 堆法 = `geometry/text-rows` 的 `rowBlock`(n 行居中堆叠的**唯一一份**公式)
//   · 行内标记的**上屏** = `shapes/inline` 的 `inlineTextRow`(与节点标签 / 边标签 / 旁注同一份)
//     —— 三者同源之后, "量的是一串字、画的是另一串字"在本块里不可能发生
//   · 反算 = `statFit`。它是"按内容反算盒"的**第三个反函数**(`nodeFit` 管主/次标签居中排布,
//     `cardFit` 管左对齐正文 + 上方图标), 与它们共享零件(measureText / rowBlock / ceil), 只换口径
//
// 盒与字**同源**(这是本文件存在的理由, 各写一份必然漂): `statShape` 与 `statFit` 共读一处
// `statMeasure` —— 字号 / 字重 / 行距 / delta 标记尺寸都只声明在 `STAT_TEXT_LAYOUT`,
// 于是"盒按 32 号算、字按 24 号画"这种事在结构上就发生不了。
//
// 边界(明确不做):
//   · **不做自动排版** —— 盒(x/y/w/h)与块间距(`pack` 的 gap)是作者的; 本块只在盒内落位。
//   · **两行就是两行** —— `value` / `label` / `delta.text` 各占一行, 含 `\n` **当场抛**。
//     理由不是懒: `rowBlock` 是**单一行距**口径, 而这里相邻两行差 20 号(32 号数字 vs 12 号标签)——
//     共用 32 号的行距 ⇒ 标签那一行的间距散成 27px; 共用 12 号的 ⇒ 数字多行直接叠在一起。
//     宁可当场抛(附"拆成两个块"的修法), 也不留一个看着还行、其实排错的版。
//   · **数字不解析成数值** —— `value` 是字符串(`"1.2M"` / `"99.9%"` / `"3.4×"`)。比例尺与数据绑定
//     是 chart 库的事(`assets/embeds/` 的 echarts 底板), 内核一旦从数据推几何就滑过去了。
//   · **不画 delta 的折线 / 迷你走势图** —— 那是 chart, 不是排版。
// =====================================================================

import { type DGroup, type Descriptor, type TextAnchor, anchorAttrs, baselineY, group, path } from '../descriptor';
import { DEFAULT_THEME, type Theme, type Tone, TONES, toneStyle } from '../theme';
import { ShapeInputError, assertFiniteNumber, assertFiniteRect, assertOneOf } from '../guard';
import { fmt } from '../geometry/vec';
import { rowBlock } from '../geometry/text-rows';
import { measureText } from '../knives/measure';
import { NODE_ALIGN_KINDS, NODE_TEXT_LAYOUT, type NodeAlign } from './node';
import { inlineTextRow } from './inline';

/** delta 的方向词表。**运行时值与类型同源**(`StatDeltaDir` 由它推出) —— 写错的词当场抛, 不静默画成一个方向 */
export const STAT_DELTA_DIRS = ['up', 'down'] as const;
export type StatDeltaDir = (typeof STAT_DELTA_DIRS)[number];

/**
 * delta 的**缺省语义色**(方向 → 取该 tone 的**文字槽**): 升 emerald / 降 rose。
 *
 * ⚠ 这是**约定不是判据**: "涨是不是好事"只有作者知道 —— 成本涨 12% 不该是绿的, 而延迟降 31%
 * 恰恰是好消息。所以 `tone` 一位随时可盖(活体见 `examples/infograph/stat.ts` 的 P95 那一块)。
 * 落成一张表而不是散在渲染里, 是为了让"哪来的绿"有唯一出处。
 */
export const DELTA_TONES: Record<StatDeltaDir, Tone> = { up: 'emerald', down: 'rose' };

/**
 * 本块的排布参数 —— **`statShape`(渲染)与 `statMeasure`(反算)共用的唯一一份数字**。
 * 与 `NODE_TEXT_LAYOUT` 那条纪律同源: 两处各写一份 = 盒按一个字号算、字按另一个字号画。
 */
export const STAT_TEXT_LAYOUT = {
  /** 主数字字号(px): 32。**视觉主导靠字号**(它是 12 号标签的 2.7 倍), 不靠再压一档字重 */
  valueFontSize: 32,
  /** 标签字号(px): 12 —— 与 32 号数字的落差是这个块读得出来的原因 */
  labelFontSize: 12,
  /** delta 字号(px): 13 —— 比标签略大一点, 因为它是"这一格的第二层信息"而不是脚注 */
  deltaFontSize: 13,
  /**
   * 主数字字重 = `NODE_TEXT_LAYOUT.weight`(600, 仓里的"标题档")。**刻意不加 700 这一档**:
   * `measureText` 的粗体加宽只按"是否 ≥ 600"一档算(3%), 写 700 就是"盒按 600 的宽算、
   * 字按 700 画"——正是本仓反复踩的那条老病。想更重请改这一处(它是单一来源)。
   */
  valueWeight: NODE_TEXT_LAYOUT.weight,
  /**
   * 两行**行心**距 = 主数字字号 × 本值(0.85 ⇒ 32 号下 27.2px)。
   * 为什么**不用** `NODE_TEXT_LAYOUT.lineGapEm`(1.25): 那个系数服务**同号**的多行块(节点标签),
   * 而这里相邻两行差 20 号 —— 1.25 × 32 = 40 会把 12 号的标签甩出数字的行盒之外(观感: 标签像另起一块)。
   */
  labelGapEm: 0.85,
  /** 数字与 delta 标记之间的横向间距(px) */
  deltaGapX: 10,
  /** delta **标记**与 delta 文字之间的横向间距(px) */
  markGapX: 4,
  /** delta 标记的宽 / 高(× delta 字号): 0.52 / 0.44 ⇒ 13 号下 6.8 × 5.7, 约等于一个箭头字形 */
  markWidthEm: 0.52,
  markHeightEm: 0.44,
} as const;

/** 一个 delta: 涨跌文字 + 可选方向标记 + 色 */
export type StatDelta = {
  /**
   * delta 的文字。**符号由作者写**(`"+18%"` / `"-31%"` / `"+0.3pt"`)—— 本块不做数值运算,
   * 也就不替你决定该不该有 `+`。可写行内标记(`[+18%]{blue}` 之类走 `shapes/inline`)
   */
  text: string;
  /**
   * 方向(**语义槽**, 与 `tone` 同族): 决定标记的折向 —— `up` 尖朝上 / `down` 尖朝下。
   * **不给 = 不画标记**(只上一行文字), 于是"没有方向"这件事也有合法写法。
   */
  dir?: StatDeltaDir;
  /** 色(缺省按 `dir` 取 `DELTA_TONES`; 无方向则 slate 中性)。取 **tone 的文字槽**, 不是边线那个 border 槽 */
  tone?: Tone;
  /** 字号(px, 缺省 `STAT_TEXT_LAYOUT.deltaFontSize`) */
  fontSize?: number;
};

/** 内容旋钮 —— `statFit` 的入参与 `StatProps` 的公共那一半(一处声明, 两处用) */
export type StatFitOptions = {
  /** 主数字(**字符串**: `"1.2M"` / `"99.9%"` / `"3.4×"`; 空串当场抛) */
  value: string;
  /** 下方标签(一行; 不给就没有这一行, 块高随之少一行) */
  label?: string;
  /** 可选 delta */
  delta?: StatDelta;
  /** 主数字字号(px)。缺省 `STAT_TEXT_LAYOUT.valueFontSize` */
  valueFontSize?: number;
};

export type StatFitResult = {
  /** 盒宽 = `ceil(内容宽)`(最宽那一行: 通常是数字行, 含 delta 标记与间隙) */
  w: number;
  /** 盒高 = `ceil(行块并集高)`(两行时 = 行距 + 两行盒高的均值) */
  h: number;
  /** 主数字墨迹宽(px, 不含 delta 与内边距) —— 可与产物里的 `<text>` 直接对账 */
  valueWidth: number;
  /** 标签墨迹宽(px); 没给标签则 0 */
  labelWidth: number;
  /** delta **块**墨迹宽(px) = 标记 + `markGapX` + 文字; 没给 delta 则 0 */
  deltaWidth: number;
  /** delta **文字**墨迹宽(px); 没给则 0。`deltaWidth − deltaTextWidth` 就是标记那一段(无方向时为 0) */
  deltaTextWidth: number;
  /** 主数字行(含 delta)的墨迹宽 —— `contentW` 通常就是它 */
  valueRowWidth: number;
  /** 内容宽(px, 不含内边距): 逐行取最大 */
  contentW: number;
  /** 内容高(px, 不含内边距): 走 `rowBlock` 的**行块并集** —— 与渲染同一份堆法 */
  contentH: number;
  /** 真会画出来的行数(1 = 只有数字, 2 = 还有标签) */
  rows: number;
  /** 逐行**行心**相对块心的偏移(px, 升序) —— 渲染按它落位, 于是"算的"与"画的"是同一份 */
  rowOffsets: number[];
  /** 两行**行心**距(px) = `valueFontSize × labelGapEm` —— 与渲染同一份 */
  lineGap: number;
  /** 本次采用的主数字字号 */
  valueFontSize: number;
  /** 本次采用的标签字号 */
  labelFontSize: number;
  /** 本次采用的 delta 字号 */
  deltaFontSize: number;
};

/** `statFit` 减去盒宽高 —— 反算与渲染共读的那一层(见 `statMeasure`) */
type StatMeasure = Omit<StatFitResult, 'w' | 'h'>;

export type StatProps = StatFitOptions & {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 内容在盒内的水平对齐(缺省 `start` = 左对齐; `center` = 整块骑盒心)。盒宽 = 内容宽时两者同图 */
  align?: NodeAlign;
  /** 整块的语义色(**只影响主数字色**, 取 `tones[tone].text`); delta 有自己的 `tone` */
  tone?: Tone;
  /** 主数字色(单点例外, 覆盖 `tone`) */
  color?: string;
  /** 标签色(缺省 `theme.label` —— 与旁注 / 边标签同一个"小字"槽) */
  labelColor?: string;
  theme?: Theme;
};

/**
 * "一行"守卫。`\n` 在本块里没有合法排布(见文件头边界), 而不是"没实现" —— 所以当场抛,
 * 提示直接给修法, 别让它静默折成一串(渲染器会把裸换行折成空格, 那时图上没人看得出)。
 */
function assertSingleLine(owner: string, field: string, v: unknown): asserts v is string {
  if (typeof v !== 'string') {
    throw new ShapeInputError(owner, field, `不是字符串(拿到 ${typeof v})`, '内容是字符串; 数字也不进数值运算(写 "1.2M" 而不是 1.2)');
  }
  if (v.includes('\n')) {
    throw new ShapeInputError(owner, field, '含换行', '数字 / 标签 / delta 各占一行, 折行会排错 —— 要折行请拆成两个 stat 块, 或缩短文案');
  }
}

/**
 * delta **块**的墨迹宽(px) = 标记 + `markGapX` + 文字。没给方向 = 不画标记, 那一段就是 0。
 * 反算与渲染都从这里取 —— 免得"量的时候算了标记、画的时候没画"(13 号下盒宽差近 11px, 而图上没人看得出)。
 */
const deltaBlockWidth = (d: StatDelta, fontSize: number, textWidth: number): number =>
  d.dir ? fontSize * STAT_TEXT_LAYOUT.markWidthEm + STAT_TEXT_LAYOUT.markGapX + textWidth : textWidth;

/**
 * 内容的**行块布局**(纯度量, 不落任何坐标) —— `statFit` 与 `statShape` 共读这一份。
 * 为什么不是各算一遍: 盒宽与文字落位必须同源, 而这套算式有七个中间量
 * (三处字号 / 行距 / 三处行宽 / 行块偏移), 抄一遍就是给自己埋一个会漂的第二权威。
 */
function statMeasure(owner: string, o: StatFitOptions): StatMeasure {
  assertSingleLine(owner, 'value', o.value);
  if (!o.value) {
    throw new ShapeInputError(owner, 'value', '是空串', '主数字是这块的主角; 空串量出来是 0 宽的盒, 摆到图上没人看得出是漏了内容');
  }
  if (o.label !== undefined) assertSingleLine(owner, 'label', o.label);
  if (o.delta) {
    assertSingleLine(owner, 'delta.text', o.delta.text);
    assertOneOf(owner, 'delta.dir', o.delta.dir, STAT_DELTA_DIRS, '不给就不画标记(只上一行文字)');
  }
  const valueFontSize = o.valueFontSize ?? STAT_TEXT_LAYOUT.valueFontSize;
  assertFiniteNumber(owner, 'valueFontSize', valueFontSize, '字号是尺寸不是增量; 不传就走 STAT_TEXT_LAYOUT.valueFontSize');
  const labelFontSize = STAT_TEXT_LAYOUT.labelFontSize;
  const deltaFontSize = o.delta?.fontSize ?? STAT_TEXT_LAYOUT.deltaFontSize;
  if (o.delta?.fontSize !== undefined) assertFiniteNumber(owner, 'delta.fontSize', deltaFontSize);

  // 三行各自量一次: 宽取各自的值, 行盒高只由字号决定(`measureText` 的口径, 与内容无关)
  const mv = measureText(o.value, { fontSize: valueFontSize, weight: STAT_TEXT_LAYOUT.valueWeight });
  const ml = o.label ? measureText(o.label, { fontSize: labelFontSize }) : null;
  const md = o.delta ? measureText(o.delta.text, { fontSize: deltaFontSize }) : null;
  const deltaWidth = o.delta && md ? deltaBlockWidth(o.delta, deltaFontSize, md.width) : 0;

  const valueRowWidth = mv.width + (o.delta ? STAT_TEXT_LAYOUT.deltaGapX + deltaWidth : 0);
  const labelWidth = ml?.width ?? 0;
  const contentW = Math.max(valueRowWidth, labelWidth);
  // 行距与堆法都取渲染那一份: `rowBlock` 是"n 行居中堆叠"的唯一公式(见 geometry/text-rows)
  const lineGap = valueFontSize * STAT_TEXT_LAYOUT.labelGapEm;
  const rowHeights = [mv.height, ...(ml ? [ml.height] : [])];
  const block = rowBlock(rowHeights.length, lineGap, rowHeights);

  return {
    valueWidth: mv.width,
    labelWidth,
    deltaWidth,
    deltaTextWidth: md?.width ?? 0,
    valueRowWidth,
    contentW,
    contentH: block.height,
    rows: rowHeights.length,
    rowOffsets: block.offsets,
    lineGap,
    valueFontSize,
    labelFontSize,
    deltaFontSize,
  };
}

/**
 * 按内容反算**大数字块**的盒(构建期算一次, 结果写死进图 —— 与 `nodeFit` / `cardFit` 同一姿势)。
 *
 * 盒 = **墨迹盒**: 宽 = 最宽那一行(通常是数字行, 含 delta 的标记与间隙), 高 = 行块并集。
 * **不加内边距** —— 本块不画壳, 留白是作者的事(`pack` 的 `gap` 说了算); 想在块外加底 / 加框,
 * 就给一个更大的盒喂 `statShape`(内容按 `align` 在盒内落位)。
 *
 * ```ts
 * const f = statFit({ value: '1.2M', label: '月度调用', delta: { text: '+18%', dir: 'up' } });
 * const row = packRow({ items: [f, f, f], gap: 48, y: 0, x0: 0 });
 * statShape({ ...row.rects[0], value: '1.2M', label: '月度调用', delta: { text: '+18%', dir: 'up' } });
 * ```
 */
export function statFit(o: StatFitOptions): StatFitResult {
  const m = statMeasure('statFit', o);
  return { ...m, w: Math.ceil(m.contentW), h: Math.ceil(m.contentH) };
}

/**
 * 大数字块 descriptor: 主数字(大字号) + 可选 delta(标记 + 文字, 与数字同行) + 可选标签(下一行)。
 * 行块对盒心对称(`align` 只管水平), 落位全由 `statMeasure` 交出的宽与行心偏移算出, 没有第二份坐标口径。
 *
 * 返回类型是 `DGroup` 而不是宽联合 `Descriptor`(与 `nodeShape` 同规矩): 本函数**恒**返回一个 group。
 */
export function statShape(p: StatProps): DGroup {
  assertFiniteRect('statShape', p);
  assertOneOf('statShape', 'align', p.align, NODE_ALIGN_KINDS, 'start 是缺省(左对齐)');
  assertOneOf('statShape', 'tone', p.tone, TONES);
  assertOneOf('statShape', 'delta.tone', p.delta?.tone, TONES);
  const theme = p.theme ?? DEFAULT_THEME;
  const m = statMeasure('statShape', p);

  const align: NodeAlign = p.align ?? 'start';
  const anchor: TextAnchor = align === 'center' ? 'middle' : 'start';
  /** 数字 / delta 的文字色取 tone 的文字槽(与 nodeShape 同源: 形状只读语义槽, 不认具体色值) */
  const valueInk = p.color ?? toneStyle(theme, p.tone).text;
  const labelInk = p.labelColor ?? theme.label;
  const delta = p.delta;
  // 无方向时给中性 slate —— "没有涨跌方向"不该被染成绿或红
  const deltaInk = toneStyle(theme, delta?.tone ?? (delta?.dir ? DELTA_TONES[delta.dir] : 'slate')).text;

  const cx = p.x + p.w / 2;
  const cy = p.y + p.h / 2;
  /** 一行的左缘: 左对齐贴盒左, 居中时整行骑盒心(行宽自己那一份) */
  const leftOf = (rowW: number): number => (align === 'center' ? cx - rowW / 2 : p.x);
  /** 文字 x: 居中排版走 `text-anchor: middle`(仓内"居中 = 锚点落自己中心"的惯例), 左对齐走 start */
  const xAt = (left: number, w: number): number => (anchor === 'middle' ? left + w / 2 : left);
  const rowCy = (i: number): number => cy + m.rowOffsets[i];

  const valueLeft = leftOf(m.valueRowWidth);
  const children: Descriptor[] = [
    inlineTextRow({
      x: xAt(valueLeft, m.valueWidth),
      y: baselineY(rowCy(0), m.valueFontSize, 'central'),
      content: p.value,
      weight: STAT_TEXT_LAYOUT.valueWeight,
      theme,
      attrs: { ...anchorAttrs(anchor), 'font-size': m.valueFontSize, fill: valueInk, 'font-family': 'inherit' },
    }),
  ];

  if (delta) {
    // delta 整块跟在数字之后: [数字][deltaGapX][标记?][markGapX][文字]
    const deltaLeft = valueLeft + m.valueWidth + STAT_TEXT_LAYOUT.deltaGapX;
    const markW = m.deltaFontSize * STAT_TEXT_LAYOUT.markWidthEm;
    if (delta.dir) {
      // 标记是与数字**同行心**的小三角(纯 path, 不是 `▲` 字符 —— mono / rsvg 管线没有字形回退,
      // 实测 Unicode 符号出 tofu, 见 QUICKREF 的 paper 主题那条)
      const halfW = markW / 2;
      const halfH = (m.deltaFontSize * STAT_TEXT_LAYOUT.markHeightEm) / 2;
      const markCy = rowCy(0);
      const apexX = deltaLeft + halfW;
      const bottom = markCy + halfH;
      const d = delta.dir === 'up'
        ? `M ${fmt(apexX)} ${fmt(markCy - halfH)} L ${fmt(deltaLeft)} ${fmt(bottom)} L ${fmt(deltaLeft + markW)} ${fmt(bottom)} Z`
        : `M ${fmt(deltaLeft)} ${fmt(markCy - halfH)} L ${fmt(deltaLeft + markW)} ${fmt(markCy - halfH)} L ${fmt(apexX)} ${fmt(bottom)} Z`;
      children.push(path(d, { fill: deltaInk, stroke: 'none' }));
    }
    children.push(inlineTextRow({
      // 文字左缘 = 块左缘 + 标记那一段(`deltaWidth − deltaTextWidth`, 无方向时恰为 0)——
      // 于是"量出来的块宽"与"画出来的块"必然对齐
      x: xAt(deltaLeft + (m.deltaWidth - m.deltaTextWidth), m.deltaTextWidth),
      y: baselineY(rowCy(0), m.deltaFontSize, 'central'),
      content: delta.text,
      theme,
      attrs: { ...anchorAttrs(anchor), 'font-size': m.deltaFontSize, fill: deltaInk, 'font-family': 'inherit' },
    }));
  }

  if (p.label) {
    children.push(inlineTextRow({
      x: xAt(leftOf(m.labelWidth), m.labelWidth),
      y: baselineY(rowCy(1), m.labelFontSize, 'central'),
      content: p.label,
      theme,
      attrs: { ...anchorAttrs(anchor), 'font-size': m.labelFontSize, fill: labelInk, 'font-family': 'inherit' },
    }));
  }

  return group(children, { 'data-shape': 'stat' });
}
