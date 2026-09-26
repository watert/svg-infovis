// =====================================================================
// shapes/heading · 标题层级组合块(kicker / 主标题 / 副标题)+ 分隔线
//
// 由来(260925, infograph 路线图 v0.2「排版层」): infographic 的第一眼是**排版层级** —— 一行小字
// kicker / 一个大标题 / 一行更小的说明, 字号阶梯 + 对齐就撑住了整块气质。此前 core 只有
// `textShape` 这个"一行字"的原子, 于是页眉在每个图脚本里各手写一遍: y 坐标一串、字号三处漂
// (11 / 13 / 22), 而"这块多高"没人算得出来 —— 下面的元素只能拍一个大致的 y。
//
// 定位: **纯组合, 零新几何**。行盒走 `measureText`(单行度量的唯一来源)、堆叠走 `packCol`
// (一列盒的摆放只此一处)、上屏走 `shapes/inline`(行内标记的唯一上屏路径)。本文件只做两件事:
//   ① 把字号阶梯收成 `HEADING_LAYOUT` 一处常量 —— 量宽 / 画字 / 取字重三方读同一份(各写一份必然漂)
//   ② 把"几行 → 每行落在哪"算出来交出去(`headingGeometry`), 于是标题块能当**一个盒**接着排
//
// 与既有模块的分工(别越界):
//   · `shapes/text.ts` —— 那是"一行字"的原子(位置由调用方给); 这里是"几行字 + 字号阶梯"的组合
//   · `knives/fit.ts`  —— `textFit` 反算的是一段**同号字**旁注的盒; 标题的字号是**层级**(每行不同),
//     且块高由本文件自己算出, 不必"先量再摆"两步
//   · 排布归作者 —— 块**内**的行距与对齐是排版事实(标题块自己的几何); 块**外**的邻接不归本文件:
//     画布位置由 `x` / `y` 给, 与邻块的关系由作者用 `packCol` / `below` 决定
//
// 分隔线(`dividerShape`)与标题同属"版式墨迹": 一条水平基准线, 可选居中短标签或加粗短段。
// 它**不是边**(不长端点箭头, 也不进净空门禁) —— 边是关系, 线是版式, 所以不走 `edgeShape`。
// =====================================================================

import { type DGroup, type Descriptor, type TextAnchor, TEXT_ANCHORS, anchorAttrs, baselineY, group, path } from '../descriptor.js';
import { DEFAULT_THEME, type Theme, type Tone, toneStyle } from '../theme.js';
import { ShapeInputError, assertFiniteNumber, assertOneOf } from '../guard.js';
import { type Rect, fmt, rectCenter } from '../geometry/vec.js';
import { type AnchorName, rectAnchor } from '../geometry/box.js';
import { type PackAlign, packCol } from '../geometry/pack.js';
import { measureText } from '../knives/measure.js';
// 遮罩片尺寸的**唯一来源**(与 `edgeLabel` 上屏那块同源): 分隔线的居中标签就是一块遮罩片
import { labelBoxSize } from './edge.js';
import { labelBoxShape } from './text.js';
import { inlineTextRow } from './inline.js';

/** 行角色词表。**运行时值与类型同源**, 且**行序恒定**: kicker → title → sub */
export const HEADING_ROLES = ['kicker', 'title', 'sub'] as const;
export type HeadingRole = (typeof HEADING_ROLES)[number];

/** 一档字号的**声明**: 字号 / 字重 / 字距(px)。`letterSpacing` 不给 = 不上屏 `letter-spacing` 属性 */
export type HeadingRowStyle = {
  fontSize: number;
  weight: number;
  letterSpacing?: number;
};

/**
 * 字号阶梯 —— **一处事实**。量宽(`measureText`) / 画字(`inlineTextRow`) / 取字重三方读同一份,
 * 所以不会再有"盒按 11 算、字按 13 画"那类老病: 改这里, 三处一起变。
 *
 * 缺省三档 = **11 / 22 / 13**(kicker / 标题 / 副标题): 主标题是 kicker 的两倍、副标题落在主标题的
 * 0.59 倍处。相邻两档小于 ~1.3 倍时层级读不出来, 大于 3 倍又像两段不相干的东西 ——
 * 这是排版口径不是门禁, 作者换字号就三档一起换(它们只在这里)。
 *
 * `rowGap` 是相邻**行盒**之间的缝(px), 不是整个行距: 行盒自带上下留白(`measureText` 的 1.4em
 * 行距口径), 所以这一位只补一点空气; 一列 22 号标题的行盒 31.3 + 缝 4 ⇒ 行心距 35.3。
 */
export const HEADING_LAYOUT = {
  rowGap: 4,
  kicker: { fontSize: 11, weight: 600, letterSpacing: 1.2 },
  title: { fontSize: 22, weight: 700 },
  sub: { fontSize: 13, weight: 400 },
} as const;

export type HeadingProps = {
  /** 水平方向: `align` 指定的那条边(缺省 `start` = 文字**左端**); `align: 'middle'` 时是中轴 */
  x: number;
  /** 块**顶边** = 首行行盒的顶(行盒含 `measureText` 的上下留白, 真墨迹顶还要往下 ~0.2em) */
  y: number;
  /** 小字标签行(kicker; 缺省无)。**可吃 `tone`** —— 它是唯一带肤色的那一档 */
  kicker?: string;
  /** 主标题(**必填**; 可含 `\n` —— 逐行照画, 与 `nodeShape` 的多行口径同源) */
  title: string;
  /** 副标题(小字、淡一档; 缺省无)。**同样支持 `\n`** */
  sub?: string;
  /** kicker 的色调(缺省 `theme.label`)。**只染 kicker** —— 标题 / 副标题各走自己的墨色槽 */
  tone?: Tone;
  /** 主标题墨色(**单点例外**, 缺省 `theme.tones.slate.text` = 主题里最深的那档字色) */
  titleColor?: string;
  /** 水平对齐(缺省 `start`): `start` 左端 / `middle` 中轴 / `end` 右端 —— 词表与 `TEXT_ANCHORS` 同源 */
  align?: TextAnchor;
  theme?: Theme;
};

/** 一行: 角色 + 文案 + 本次采用的字号口径 + 它的**行盒**(绝对坐标) */
export type HeadingRow = {
  role: HeadingRole;
  /** 这一行的字(已按 `\n` 拆开) */
  text: string;
  fontSize: number;
  weight: number;
  letterSpacing?: number;
  /** 上屏墨色(本次采用值) */
  color: string;
  /** 行盒: 宽高来自 `measureText`(估算, 宁宽不窄), 位置来自堆叠; 文字基线落在它的**行心**上 */
  rect: Rect;
};

/** 标题块的几何 —— 块能当**一个盒**接着排(`packCol` / `below` 都吃这个 `block`) */
export type HeadingGeometry = {
  /** 整块 = 所有行盒的并集(对齐已生效) */
  block: Rect;
  /** 逐行, 顺序即绘制顺序(kicker → title 各行 → sub 各行) */
  rows: HeadingRow[];
  /** 本次采用的水平对齐 */
  align: TextAnchor;
};

/** 对齐三档 → 行盒上"文字锚点"落在哪条边(与 `placeText` 那套一一对应: 左端 / 心 / 右端) */
const ANCHOR_NAME: Record<TextAnchor, AnchorName> = { start: 'w', middle: 'center', end: 'e' };
/** 对齐三档 → `packCol` 的交叉轴对齐(同一套三档的两种说法, 只在这里映射一次) */
const PACK_ALIGN: Record<TextAnchor, PackAlign> = { start: 'start', middle: 'center', end: 'end' };

/**
 * 三档墨色的取值**只在这里**: kicker 走 tone 的文字槽(没给走 `theme.label`) / 标题走主题最深的
 * 字色(`tones.slate.text`, 与 `groupToneStyle` 取的是同一格) / 副标题走 `theme.label`。
 * 三个槽都是**色调槽**而不是硬编码色值, 所以 paper / dark 主题下自动跟着换。
 */
const rowColor = (theme: Theme, role: HeadingRole, tone?: Tone): string => {
  if (role === 'kicker') return tone ? toneStyle(theme, tone, 'outline').text : theme.label;
  return role === 'title' ? theme.tones.slate.text : theme.label;
};

type DraftRow = { role: HeadingRole; text: string; style: HeadingRowStyle; color: string };

/** 一行内容的类型守卫: 非字符串会静默变成 `undefined.split` 的 TypeError, 报错要说清是哪个字段 */
function assertText(owner: string, field: string, v: unknown): void {
  if (v === undefined) return;
  if (typeof v !== 'string') {
    throw new ShapeInputError(owner, field, `不是字符串(拿到 ${typeof v})`, '标题文案是文字; 要摆一个尺寸自己定的盒子请直接用 `textShape`', '文本');
  }
}

/**
 * 行方案(守卫 → 取值 → 度量 → 堆叠)。两个公开入口共读这一份 —— `owner` 只进报错文案,
 * 免得"同一个错误在两条路径上有两套几何"。
 */
function planHeading(owner: string, p: HeadingProps): { theme: Theme; align: TextAnchor; rows: HeadingRow[]; block: Rect } {
  assertFiniteNumber(owner, 'x', p.x);
  assertFiniteNumber(owner, 'y', p.y);
  assertOneOf(owner, 'align', p.align, TEXT_ANCHORS, 'start 是最常走的那档(标题块的左缘)');
  assertText(owner, 'kicker', p.kicker);
  assertText(owner, 'title', p.title);
  assertText(owner, 'sub', p.sub);
  if (p.titleColor !== undefined && typeof p.titleColor !== 'string') {
    throw new ShapeInputError(owner, 'titleColor', `不是字符串(拿到 ${typeof p.titleColor})`, '墨色是色值字符串(如 #0f172a); 想换色调请给 `tone`', '文本');
  }
  const theme = p.theme ?? DEFAULT_THEME;
  const align = p.align ?? 'start';

  // 三档文案 → 行: `\n` 是**作者写下的换行**(与 nodeShape 同口径), 空行 = 没有这一行
  const drafts: DraftRow[] = [];
  const add = (role: HeadingRole, content: string | undefined, style: HeadingRowStyle, color: string): void => {
    for (const text of (content ?? '').split('\n')) {
      if (text) drafts.push({ role, text, style, color });
    }
  };
  add('kicker', p.kicker, HEADING_LAYOUT.kicker, rowColor(theme, 'kicker', p.tone));
  add('title', p.title, HEADING_LAYOUT.title, p.titleColor ?? rowColor(theme, 'title'));
  add('sub', p.sub, HEADING_LAYOUT.sub, rowColor(theme, 'sub'));

  // 行盒 = `measureText` 的估算宽高(量宽与画字同一份字号 / 字重 / 字距); 堆叠 = `packCol` 摆一列盒。
  // 不自算坐标: 交叉轴对齐三档与主轴缝全在那一处(手写 `y += h + gap` 是第二份堆法, 迟早漂开)。
  // ⚠ `measureText` 给的是 `width/height`, `packCol` 吃的是 `w/h` —— 字段名不同, 不映射就是
  // 一路 undefined ⇒ NaN 的盒(packCol 有意**不拦** item 尺寸, 见 pack.ts 的边界)
  const boxes = drafts.map((r) => {
    const m = measureText(r.text, { fontSize: r.style.fontSize, weight: r.style.weight, letterSpacing: r.style.letterSpacing });
    return { w: m.width, h: m.height };
  });
  const col = packCol({ items: boxes, gap: HEADING_LAYOUT.rowGap, x: p.x, y0: p.y, align: PACK_ALIGN[align] });
  const block = col.bounds;
  // 一档文案都没有(title 空串 / 只有空行) ⇒ `packCol` 给 null(它对空列就是这么说的)。
  // 空块是 0 高的盒, 摆到图上没人看得出是漏了内容 —— 同 `cardFit` 对空 `lines` 的立场
  if (!block) {
    throw new ShapeInputError(owner, 'title', '是空串(或整块一行字都没有)', '标题块至少得有一行字; 只想画分隔线请单独用 `dividerShape`');
  }

  return {
    theme, align, block,
    rows: drafts.map((r, i) => ({
      role: r.role, text: r.text, fontSize: r.style.fontSize, weight: r.style.weight,
      letterSpacing: r.style.letterSpacing, color: r.color, rect: col.rects[i],
    })),
  };
}

/**
 * 标题块的几何: 逐行盒 + 整块并集。**与 `headingShape` 同源**(同一个 `planHeading`) ——
 * 算出来的块高就是画出来的块高, 不存在"量的一个盒、画另一个盒"。
 *
 * 典型用法(块的底边往下接元素):
 * ```ts
 * const head = headingGeometry({ x: 40, y: 40, kicker: 'SECTION 01', title: '把一张图读成信息' });
 * const ruleY = below(head.block, { w: 0, h: 0 }, 28).y;      // 分隔线是 0 高的盒, 只用它求 y
 * ```
 */
export function headingGeometry(p: HeadingProps): HeadingGeometry {
  const { align, rows, block } = planHeading('headingGeometry', p);
  return { block, rows, align };
}

/**
 * 标题块上屏。每行一个 `<text>`: 基线走 `baselineY(行心, 字号, 'central')`(与 `nodeShape` /
 * 遮罩片同一份折算), 内容走 `inlineTextRow`(于是标题里也能写 `**粗**` / `[字]{blue}`, 且
 * 量宽与画字认的是同一份 run 表)。
 *
 * `y` 口径: 行心 + `central` 折算,**不写 `dominant-baseline`** —— 那条属性各渲染器支持不一。
 */
export function headingShape(p: HeadingProps): DGroup {
  const { theme, align, rows } = planHeading('headingShape', p);
  const children: Descriptor[] = rows.map((r) => inlineTextRow({
    x: rectAnchor(r.rect, ANCHOR_NAME[align]).x,
    y: baselineY(rectCenter(r.rect).y, r.fontSize, 'central'),
    content: r.text,
    weight: r.weight,
    theme,
    attrs: {
      ...anchorAttrs(align),
      'font-size': r.fontSize,
      fill: r.color,
      'font-family': 'inherit',
      // 没给字距就不写这一位(缺省 0 写出来是噪声; 量宽那边同样按 0 算)
      'letter-spacing': r.letterSpacing,
    },
  }));
  return group(children, { 'data-shape': 'heading' });
}

// --- 分隔线(horizontal rule) -------------------------------------------
//
// 与标题同族都是"版式墨迹": 它不是关系边, 所以**不走 `edgeShape`** —— 那边缺省端点长一个三角,
// 而且一条线的信息量为零, 进不了任何净空门禁。它只有三个可选形态, 别在这里加第四个:
//   · 光板一条线
//   · 居中**短标签**(线在标签两侧断开 —— 走遮罩片那条路: 遮罩底色 = 画布色, 于是"断开"是画的结果,
//     不是本文件自己算的断口; 断口宽度就是 `labelBoxSize` 给的那块, 与边标签同一份口径)
//   · 居中**加粗短段**(宽一档的一段压在线上, 给整条线一个重心)

/** 分隔线的缺省口径 —— **一处事实**(线宽 / 加粗段宽 / 标签两端的断口留白) */
export const DIVIDER_LAYOUT = {
  /** 细线线宽(px) */
  width: 1,
  /** 居中加粗短段的线宽(px) */
  thickWidth: 3,
  /** 标签两端的**断口留白**(px): 线在标签墨迹左右各断这么远(即遮罩片的 `padX`) */
  labelPadX: 8,
} as const;

export type DividerProps = {
  /** 线左端 */
  x: number;
  /** 线所在的 y(线恒水平 —— 分隔线是版式基准线, 不给斜率) */
  y: number;
  /** 线长(必须为正: 0 长的线图上什么都没有, 那是漏写不是"不画") */
  w: number;
  /** 线色覆盖(单点例外; 缺省: 有 `tone` 取该 tone 的**描边槽**, 否则 `theme.groupStroke` = 版式线色) */
  color?: string;
  /**
   * 分隔线肤色(语义槽): 线走 `tones[tone].border`、标签走 `tones[tone].text` ——
   * 与 `edgeLabel` 的 tone 分工同源(线是描边、字是填充, 浅色系 border 当字色看不清)。
   */
  tone?: Tone;
  /** 线宽(px, 缺省 `DIVIDER_LAYOUT.width` = 1) */
  width?: number;
  /** 虚线(如 `'6 5'`); 不给 = 实线 */
  dash?: string;
  /** 居中的**短标签**(线在它两侧断开)。与 `thick` **互斥** —— 两个都占中心, 遮罩会把粗段盖掉 */
  label?: string;
  /** 标签字号(px; 缺省走 `labelBoxSize` 的缺省档, 不在本文件另写一个数) */
  labelSize?: number;
  /** 标签字重(缺省 400) */
  labelWeight?: number;
  /** 标签墨色覆盖(单点例外; 缺省: 有 `tone` 走 `tones[tone].text`, 否则 `theme.label`) */
  labelColor?: string;
  /**
   * 标签**遮罩底色**覆盖(逃生口)。缺省不写 = 与画布同色 ⇒ 遮罩隐形, 只剩"把线断开"这个本职。
   * 分隔线铺在**有底色**的区块上(tint 分区 / 深色面板)时必须给这一位 —— 否则那块遮罩会在面板上
   * 留一块画布色的补丁。要显形的徽章观感才给不透明色。
   */
  labelBg?: string;
  /** 居中**加粗短段**的长度(px)。与 `label` 互斥; 比 `w` 还长会探出线的两端 */
  thick?: number;
  /** 加粗段的线宽(px, 缺省 `DIVIDER_LAYOUT.thickWidth` = 3) */
  thickWidth?: number;
  theme?: Theme;
};

/**
 * 水平分隔线: 细线 + 可选(居中短标签 | 居中加粗短段)。
 *
 * 端点**不写 `stroke-linecap`**(SVG 缺省 `butt`): 墨迹恰好落在 `x .. x+w`, 于是线长就是 `w`
 * —— `edgeShape` 那种 `round` 帽会让线两端各多出半个线宽, 版式线的长度得是对的。
 */
export function dividerShape(p: DividerProps): DGroup {
  assertFiniteNumber('dividerShape', 'x', p.x);
  assertFiniteNumber('dividerShape', 'y', p.y);
  assertFiniteNumber('dividerShape', 'w', p.w);
  if (p.width !== undefined) assertFiniteNumber('dividerShape', 'width', p.width);
  if (p.thickWidth !== undefined) assertFiniteNumber('dividerShape', 'thickWidth', p.thickWidth);
  if (p.thick !== undefined) assertFiniteNumber('dividerShape', 'thick', p.thick);
  assertText('dividerShape', 'label', p.label);
  if (!(p.w > 0)) {
    throw new ShapeInputError('dividerShape', 'w', `不是正数(拿到 ${p.w})`, '线长为 0 图上什么都没有; 不要这条线就别调它(段位方向交给 x/y)');
  }
  // 两个形态都占中心 —— 同给的话标签的遮罩片会把粗段整段盖掉(粗细白设), 那是"写了却不上屏", 当场抛
  if (p.label && p.thick !== undefined) {
    throw new ShapeInputError('dividerShape', 'thick', '与 label 同时给了', '两个都占中心: 遮罩片会把粗段盖掉; 选一个, 或者用两条线');
  }
  if (p.thick !== undefined) {
    if (!(p.thick > 0)) {
      throw new ShapeInputError('dividerShape', 'thick', `不是正数(拿到 ${p.thick})`, '长度是尺寸不是增量; 不要粗段就别给这一位');
    }
    if (p.thick > p.w) {
      throw new ShapeInputError('dividerShape', 'thick', `比线还长(${p.thick} > ${p.w})`, '粗段是压在线上的一段, 比线长会从两端探出去');
    }
  }
  const theme = p.theme ?? DEFAULT_THEME;
  const color = p.color ?? (p.tone ? theme.tones[p.tone].border : theme.groupStroke);
  const x2 = p.x + p.w;
  const children: Descriptor[] = [
    path(`M ${fmt(p.x)} ${fmt(p.y)} L ${fmt(x2)} ${fmt(p.y)}`, {
      fill: 'none', stroke: color, 'stroke-width': p.width ?? DIVIDER_LAYOUT.width, 'stroke-dasharray': p.dash,
    }),
  ];

  // 加粗短段压在细线之上, 居中 —— 它是给整条线一个重心, 不代替线
  if (p.thick !== undefined) {
    const x0 = p.x + (p.w - p.thick) / 2;
    children.push(path(`M ${fmt(x0)} ${fmt(p.y)} L ${fmt(x0 + p.thick)} ${fmt(p.y)}`, {
      fill: 'none', stroke: color, 'stroke-width': p.thickWidth ?? DIVIDER_LAYOUT.thickWidth, 'stroke-dasharray': p.dash,
    }));
  }

  if (p.label) {
    // 尺寸走 `labelBoxSize`(遮罩片尺寸的唯一来源) —— "断开多宽"与"边标签那块多大"是同一份公式;
    // 底色不给 = `labelBoxShape` 的缺省 `theme.canvas`(与画布同色 ⇒ 遮罩隐形, 只剩断开这个本职)
    const size = labelBoxSize(p.label, { fontSize: p.labelSize, padX: DIVIDER_LAYOUT.labelPadX });
    children.push(labelBoxShape({
      x: p.x + p.w / 2, y: p.y, w: size.width, h: size.height, content: p.label,
      fontSize: size.fontSize, weight: p.labelWeight, theme, bg: p.labelBg,
      color: p.labelColor ?? (p.tone ? theme.tones[p.tone].text : theme.label),
    }));
  }
  return group(children, { 'data-shape': 'divider' });
}
