// =====================================================================
// blocks/progress · 进度条 / 比例条 (blocks/ 层的第一个公民)
//
// 由来(docs/infograph-roadmap.md 的 260925 分层决策): "一个数值 → 一段几何"的组件(进度条的
// ratio, pictogram 的 k/N, donut 的占比)**不进 `shapes/`** —— shape 层只收无数值语义的排版件
// (stat 的数字是"字", 几何不编码数值)。但这类东西也不该流落仓外, 于是立 `blocks/` 这一层:
// 契约 `{ shape: DGroup, bounds: Rect }`, 纯组合 core 的刀, 零新依赖。本文件是这层的第一个
// 公民, 顺手把层约立起来(层约那一份在 `blocks/README.md`)。
//
// 定位: **组合块, 纯 descriptor 出口**。输入是作者声明的条(位置 / 总宽 / 比例 / 色调), 输出是
// 一段能被 `packCol` / `place` 当**一个盒**接着排的墨迹: 轨道 + 填充段 + 可选标签。
//
// 反比例尺口子(本层最要紧的一条纪律): `ratio` 是**作者算好的比例**, 不是原始数据 —— 本文件
// 不做归一化、不做百分比换算、不从任何数字推几何。kernel 一旦从数据推几何就滑向 chart 库,
// 与 `assets/embeds/` 的 echarts 底板链正面撞车(真图表走 embed, 不在内核重造)。
//
// 与既有模块的分工(一条都不自己重写):
//   · 圆角 = `geometry/rounded-path` 的 `radiusPolygonPath`; 四角同值走 `rect` 的 `rx`,
//     只有"单侧帽"(堆叠条的首 / 末段)才落路径 —— 两条路的钳制口径一致, 见 `segmentOf`
//   · 取色 = `theme` 的语义槽: 填充段吃 `tone × variant` 的三档阶梯(`FILL_SLOT`), 轨道只吃
//     outline 档的 surface / border(**不随 variant 变**, 理由见 `FILL_SLOT` 注释)
//   · 度量 = `knives/measure` 的 `measureText`; 字号与字重取 `NODE_TEXT_LAYOUT`(与节点主标签 /
//     列表行同一档 —— 不在这里另立第二份字号权威)
//   · 上屏 = `shapes/inline` 的 `inlineTextRow`(行内标记的唯一上屏路径)
//   · 并集 = `geometry/box` 的 `bounds`(盒并集的唯一一份公式)
//
// 块的盒是**墨迹盒**(不加内边距, 与 `statFit` 同一纪律): `bounds` 恰好包住画出来的墨迹, 于是它
// 可以直接喂 `packCol` 的 `items`; "块与块隔多远"是作者的 `gap`, 不在本文件里。
//
// 位置与尺寸口径: `x` = 条的**左缘**, `y` = 块的**顶边**(标签在上方时条顶 = y + 标签行盒高 +
// `labelGap`), `w` = 条的总宽, `barH` = 条高。**块的盒高是推导结果**(标签行盒 + `labelGap` +
// `barH`), 所以条高这一位刻意叫 `barH` 而不是 `h` —— 否则 `{ ...placedRect, ...props }` 这种
// "把摆好的盒摊回 props"的写法会把盒高当条高喂进来, 画出一根 36 高的条而没有任何东西会喊。
// 几何数一律过 `round1`(与 `pack` / `bounds` 同一口径, 也是渲染精度: 序列化取 1 位小数)。
//
// 边界(明确不做):
//   · **不做自动布局** —— 块摆在哪、块与块隔多远是作者的(`packCol` / `place`); 本文件只在块内落位
//   · **不做数值推断** —— ratio 越界当场抛(0..1), 不 clamp 也不归一化; 堆叠条合计 > 1 同样当场抛
//     (浮点累计留 1e-9 容差, 见 `planStack`)。**不做四舍五入成好看的数字**
//   · **不画壳 / 不加底** —— 底 / 加框 / 画布留白是作者的事
//   · **不标刻度、不画轴** —— 那是 chart, 走 echarts 底板
//   · **不做数值格式化** —— 标签是字符串(`"68%"` / `"3/5"`), 百分数怎么来是作者的事(与
//     `statShape` 对 `"1.2M"` 同一立场)
// =====================================================================

import { type Attrs, type DGroup, type Descriptor, type TextAnchor, anchorAttrs, baselineY, group, path, rect } from '../src/descriptor.js';
import { DEFAULT_THEME, type Theme, type Tone, type TonePalette, TONES, type Variant, toneStyle } from '../src/theme.js';
import { HINT_SPREAD_RECT, ShapeInputError, assertFiniteNumber, assertOneOf } from '../src/guard.js';
import { type Rect, round1 } from '../src/geometry/vec.js';
import { bounds } from '../src/geometry/box.js';
import { radiusPolygonPath } from '../src/geometry/rounded-path.js';
import { measureText } from '../src/knives/measure.js';
import { NODE_TEXT_LAYOUT } from '../src/shapes/node.js';
import { inlineTextRow } from '../src/shapes/inline.js';

// --- 块契约 -------------------------------------------------------------

/**
 * 块契约(v0.2 起, 见 `blocks/README.md`): 每个 block 的主出口吐一个**墨迹 group** + 它的
 * **墨迹盒**(不加内边距)。`bounds` 能被 `geometry/pack` / `geometry/place` 当一个盒直接摆,
 * 也能当别的块的输入 —— 这就是"块能嵌套"的全部含义。
 */
export type Block = { shape: DGroup; bounds: Rect };

/** 标签的两档位置。**运行时值与类型同源** —— 写错的词当场抛, 不静默回落 */
export const PROGRESS_LABEL_PLACES = ['above', 'inside'] as const;
export type ProgressLabelPlace = (typeof PROGRESS_LABEL_PLACES)[number];

/**
 * 本块的排布参数 —— **一处事实**(缺省值只声明在这里, 守卫的提示文案也指着它)。
 *
 * `labelFontSize` / `labelWeight` 直接取 `NODE_TEXT_LAYOUT`: 进度标签就是"节点主标签"那一档字,
 * 抄一个 13 / 600 进来就是第二个字重权威(量宽与画字迟早分叉, 那是本仓最贵的那类事故)。
 */
export const PROGRESS_LAYOUT = {
  /** 条高缺省(px): 12 */
  barH: 12,
  /** 圆角缺省(px): 6 = 12 高条的一半 ⇒ 药丸端 */
  radius: 6,
  /**
   * 轨道描边线宽(px): 1。**不取** `toneStyle` 的 `strokeWidth`(1.5 是节点描边的档, 12 高的条上
   * 太重); 它同时是**填充段的内缩量** —— 见 `planProgress` 的填充那一支。
   */
  trackWidth: 1,
  /** 标签字号: `NODE_TEXT_LAYOUT.fontSize`(13, 与节点主标签 / 列表行同一档) */
  labelFontSize: NODE_TEXT_LAYOUT.fontSize,
  /** 标签字重: `NODE_TEXT_LAYOUT.weight`(600, 仓里的"数值 / 标题"档) */
  labelWeight: NODE_TEXT_LAYOUT.weight,
  /** 标签行盒与条之间的缝(px): `labelAt: 'above'` 时条顶与标签行盒底之间留它 */
  labelGap: 6,
  /** 条内标签的左右呼吸位(px): 6 —— 它进"装不下"的判据(条内标签必须真落在条内) */
  labelPadX: 6,
  /** 条内标签的上下呼吸位(px): 2 */
  labelPadY: 2,
} as const;

/**
 * 填充段的取色档 —— **一处事实**(`progressBlock` 与 `stackedBarBlock` 共用同一张表)。
 * 三档是一条**深浅阶梯**: `tint`(最浅, 该 tone 的浅底槽) < `outline`(该 tone 的浅色档
 * `border`) < `solid`(实色档 `solidBg`)。
 *
 * 为什么 `outline` 档取 `border` 而不是 `toneStyle('outline').fill`(那个是 `surface` = 白):
 * 白底填充在轨道上等于**没有进度** —— 表存在的意义就是让"哪一档取哪个槽"有唯一出处。
 *
 * 轨道**不随 variant 变**(恒走 outline 档的 surface / border): 轨道是"100% 的界"(容器),
 * 而 variant 是给**编码量那一段**的强调旋钮 —— 轨道跟着走会得到"实底轨道 + 实底填充"这类
 * 读不出进度的组合。
 */
const FILL_SLOT: Record<Variant, (p: TonePalette) => string> = {
  tint: (p) => p.tint,
  outline: (p) => p.border,
  solid: (p) => p.solidBg,
};

/**
 * variant 词表 —— 三档只声明在 `FILL_SLOT` 一处(键序即声明序), 不在这里再抄一遍字面量。
 * ⚠ `theme.ts` 只导出了 `TONES`, 三档 variant 没有运行时词表 —— 所以本文件的 `FILL_SLOT`
 * 就是这一层认的那份声明(写错的档位当场抛, 由 `assertOneOf` 用它的键去比)。
 */
const PROGRESS_VARIANTS = Object.keys(FILL_SLOT) as Variant[];

/** 条上那几个尺寸旋钮(两个入口共用): 非有限抛, 负值抛 —— 与 `assertFiniteRect` 对宽高同一立场 */
const HINT_LAYOUT_SIZE = '条高 / 圆角都是尺寸不是增量; 不传就走 PROGRESS_LAYOUT';

/** 比例越界的修法 —— 本块最常被误用的那一位(把 55 当 55% 写) */
const HINT_RATIO = 'ratio 是**已算好的比例**(0..1), 不是百分数也不是原始数据 —— 55% 写 0.55; 怎么算出来的(kernel: 不从数据推几何)';

// --- 守卫 ---------------------------------------------------------------

/** 非负尺寸(条高 / 圆角 / 缝都用它): 非有限值走 `guard` 口径, 负值是尺寸写反 */
function assertSize(owner: string, field: string, v: number, hint = HINT_LAYOUT_SIZE): void {
  assertFiniteNumber(owner, field, v, hint);
  if (v < 0) throw new ShapeInputError(owner, field, `为负(${v})`, hint);
}

/**
 * 比例守卫: 有限 + 落在 0..1。**不 clamp** —— clamp 会把"55 写成 55%"静默画成满条,
 * 而图上看不出这一格其实是写错了(与 `guard` 对 NaN 的立场同源: 畸形入参是编程错误)。
 */
function assertRatio(owner: string, field: string, v: unknown): number {
  assertFiniteNumber(owner, field, v, HINT_RATIO);
  const r = v as number;
  if (!(r >= 0 && r <= 1)) throw new ShapeInputError(owner, field, `越界(${r})`, `比例条只认 0..1; ${HINT_RATIO}`);
  return r;
}

/** 四角圆角, 顺序恒为 [左上, 右上, 右下, 左下] —— `radiusPolygonPath` 的顶点序就是它 */
export type Corners = readonly [number, number, number, number];

/**
 * 一段圆角矩形 → descriptor。四角同值走 `rect` 的 `rx`(一个元素, 字节最短); 只有"单侧帽"
 * (堆叠条的首 / 末段: 一边圆一边方)才落 `radiusPolygonPath`。
 *
 * 为什么两条路可以并存: 它们的**钳制口径一致** —— `rect` 的 `rx` 由渲染器按 SVG 规范夹到
 * `min(半宽, 半高)`, 路径由 `cornerAt` 的 `tDist` 夹到同一对方位(`tDist = r/tan45° = r`)。
 * 于是"走哪条"只改字节, 不改形状(判据: 测试里把同一条几何的两条画法对账)。
 */
function segmentOf(r: Rect, c: Corners, attrs: Attrs): Descriptor {
  const [tl, tr, br, bl] = c;
  if (tl === tr && tr === br && br === bl) return rect(r.x, r.y, r.w, r.h, tl || undefined, attrs);
  const pts = [
    { x: r.x, y: r.y }, { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h },
  ];
  const radii = [tl, tr, br, bl];
  return path(radiusPolygonPath(pts, (i) => radii[i]).d, attrs);
}

// --- ① 单值进度条 -------------------------------------------------------

export type ProgressProps = {
  /** 条的**左缘** */
  x: number;
  /** 块的**顶边**(`labelAt: 'above'` 时是标签行盒的顶; 条顶 = y + 标签行盒高 + `labelGap`) */
  y: number;
  /** 条的**总宽** —— 它就是 100%(作者声明; kernel 不从内容 / 数据反算) */
  w: number;
  /** 比例(0..1): **作者算好的数**。越界当场抛 */
  ratio: number;
  /**
   * 条高(px, 缺省 `PROGRESS_LAYOUT.barH`)。
   *
   * ⚠ **刻意不叫 `h`**: 块的盒是 `bounds`(`{x, y, w, h}`), 而块的**高是推导结果**(标签行盒 +
   * `labelGap` + 条高)—— 若这一位叫 `h`, 那么 `{ ...placed, ...props }` 这种"把摆好的盒摊回
   * props"的写法会把**盒高当条高**喂给本函数, 画出一根 36 高的条而没有任何东西会喊。
   */
  barH?: number;
  /** 圆角(px, 缺省 `PROGRESS_LAYOUT.radius`); 超过半高 / 半宽的部分由圆角钳制吃掉(与渲染器同口径) */
  radius?: number;
  /**
   * 是否画轨道(缺省 true)。轨道是"100% 的界" —— 关掉只在**别处已经交代了满额在哪**(列宽 /
   * 网格 / 同一块的另一条)时才成立, 门禁不管这件事(块不进净空审计)。
   */
  track?: boolean;
  /** 可选标签(可写行内标记); 空串 = 没给(与 `headingShape` 对空行的立场同) */
  label?: string;
  /** 标签位(缺省 `above`): `above` 条上方、左对齐条左缘 · `inside` 条内居中(条内必须真装得下) */
  labelAt?: ProgressLabelPlace;
  /** 填充段肤色(语义槽, 缺省 slate) */
  tone?: Tone;
  /** 填充段档位(缺省 `outline`): tint 最浅 < outline 中档 < solid 强调 —— 一条深浅阶梯 */
  variant?: Variant;
  theme?: Theme;
  /** 单点覆盖(少数例外才用; 常规取色走 `tone × variant` 两槽) */
  fill?: string;
  trackFill?: string;
  trackStroke?: string;
  /** 标签墨色(缺省 `theme.label` 的小字槽, 与旁注 / 边标签同一个) */
  labelColor?: string;
};

export type ProgressBlock = Block & {
  /** 轨道盒 = **100% 的界**(作者声明的那条 `w` × `barH`) */
  bar: Rect;
  /** 填充段的盒(没画时 undefined) —— 它恒在轨道**内**, 且四边各缩一个线宽 */
  fill?: Rect;
  /** 标签的**行盒**(没给标签时 undefined; 行盒含 `measureText` 的上下留白, 与 `headingGeometry` 同口径) */
  label?: Rect;
};

/** 两个入口共有的那几位旋钮(守卫与缺省只写这一份) */
type BarKnobs = {
  x: number;
  y: number;
  w: number;
  /** 条高(**不是**块的盒高; 见 `ProgressProps.barH`) */
  barH?: number;
  radius?: number;
  track?: boolean;
};

/** 条的旋钮 → 校验过的数: 条高 / 圆角 / 内缩量 / 画不画轨道 */
function barKnobs(owner: string, p: BarKnobs): { barH: number; radius: number; inset: number; showTrack: boolean } {
  assertFiniteNumber(owner, 'x', p.x, HINT_SPREAD_RECT);
  assertFiniteNumber(owner, 'y', p.y, HINT_SPREAD_RECT);
  assertFiniteNumber(owner, 'w', p.w, HINT_SPREAD_RECT);
  if (!(p.w > 0)) {
    throw new ShapeInputError(owner, 'w', `不是正数(拿到 ${p.w})`, '条宽是尺寸不是增量; 0 宽的条图上什么都没有(不要这条就别调本函数)');
  }
  const barH = p.barH ?? PROGRESS_LAYOUT.barH;
  if (p.barH !== undefined) assertSize(owner, 'barH', barH);
  if (!(barH > 0)) {
    throw new ShapeInputError(owner, 'barH', `不是正数(拿到 ${barH})`, '条高是尺寸不是增量; 不传就走 PROGRESS_LAYOUT.barH');
  }
  const radius = p.radius ?? PROGRESS_LAYOUT.radius;
  if (p.radius !== undefined) assertSize(owner, 'radius', radius);
  const showTrack = p.track ?? true;
  const inset = showTrack ? PROGRESS_LAYOUT.trackWidth : 0;
  // 条身装不下轨道是个**结构性错误**(内缩后条内区 <= 0), 不是"看着还行" —— 与 `dividerShape` 的
  // `thick > w` 同一档: 当场抛, 并给"关掉轨道"这条真修法
  const thin = (v: number, field: 'w' | 'barH'): never => {
    throw new ShapeInputError(owner, field, `${field === 'barH' ? '条高' : '条宽'}${v} 装不下一圈轨道线宽(${PROGRESS_LAYOUT.trackWidth})`,
      '轨道线宽两侧各吃一个: 条身必须 > 2×线宽; 想要更细的条就关掉轨道(track: false)');
  };
  if (showTrack && barH <= 2 * inset) thin(barH, 'barH');
  if (showTrack && p.w <= 2 * inset) thin(p.w, 'w');
  return { barH, radius, inset, showTrack };
}

/** 单值条的**落位方案**(守卫 → 取值 → 度量 → 落位) —— 主出口只读这一份, 没有第二处坐标口径 */
type ProgressPlan = {
  theme: Theme;
  /** 填充段色(已解析成色值) */
  fillInk: string;
  bar: Rect;
  block: Rect;
  inner: Rect;
  radius: number;
  inset: number;
  showTrack: boolean;
  fill?: Rect;
  label?: Rect;
  /** 标签的锚点档: 条内走 `middle`(骑条心), 条外走 `start`(左对齐条左缘) */
  labelAnchor: TextAnchor;
};

function planProgress(owner: string, p: ProgressProps): ProgressPlan {
  const ratio = assertRatio(owner, 'ratio', p.ratio);
  const { barH, radius, inset, showTrack } = barKnobs(owner, p);
  const theme = p.theme ?? DEFAULT_THEME;
  const tone = p.tone ?? 'slate';
  assertOneOf(owner, 'tone', p.tone, TONES);
  assertOneOf(owner, 'variant', p.variant, PROGRESS_VARIANTS, 'outline 是缺省档(最克制的那一档)');
  assertOneOf(owner, 'labelAt', p.labelAt, PROGRESS_LABEL_PLACES, 'above 是缺省(条内那一档要求条本身装得下字)');
  const place = p.labelAt ?? 'above';
  const text = p.label ?? '';
  // "写了却不上屏"的那一类: 给了 labelAt 却没有字 —— 与 `dividerShape` 对 label/thick 同占中心的立场同源
  if (p.labelAt !== undefined && !text) {
    throw new ShapeInputError(owner, 'labelAt', `给了但 label 是空的("${p.label ?? ''}")`, '这一位写了却不上屏: 要么给 label, 要么别写 labelAt');
  }
  const m = text ? measureText(text, { fontSize: PROGRESS_LAYOUT.labelFontSize, weight: PROGRESS_LAYOUT.labelWeight }) : null;

  // 轨道 / 标签落位: 条内那一档会把该条压扁(不是视觉问题, 是"字压在轨道边上 / 探出条外") ⇒ 当场抛
  let bar: Rect;
  let label: Rect | undefined;
  let labelAnchor: TextAnchor = 'start';
  if (m && place === 'inside') {
    const availW = p.w - 2 * PROGRESS_LAYOUT.labelPadX;
    const availH = barH - 2 * PROGRESS_LAYOUT.labelPadY;
    if (m.width > availW || m.height > availH) {
      throw new ShapeInputError(owner, 'label',
        `在条内装不下(标签行盒 ${round1(m.width)}×${round1(m.height)} > 条内可用 ${round1(availW)}×${round1(availH)})`,
        '缩文案 / 加宽 w / 加高 barH, 或换 labelAt: "above"(条外那一档没有这个限制)');
    }
    bar = { x: p.x, y: p.y, w: p.w, h: barH };
    label = { x: round1(p.x + (p.w - m.width) / 2), y: round1(p.y + (barH - m.height) / 2), w: m.width, h: m.height };
    labelAnchor = 'middle';
  } else {
    const lead = m ? m.height + PROGRESS_LAYOUT.labelGap : 0;
    bar = { x: p.x, y: round1(p.y + lead), w: p.w, h: barH };
    label = m ? { x: p.x, y: p.y, w: m.width, h: m.height } : undefined;
  }
  const inner: Rect = { x: round1(bar.x + inset), y: round1(bar.y + inset), w: round1(bar.w - 2 * inset), h: round1(bar.h - 2 * inset) };
  // 填充段: 起点 = 条内区左缘, 长度 = **条内区宽 × ratio**(于是 ratio 的分母是"能填的那段",
  // 与肉眼读到的满额一致); ratio 为 0 时不落元素 —— 它是一个**合法状态**(0% 完成), 只是没墨迹
  const fill: Rect | undefined = ratio > 0
    ? { x: inner.x, y: inner.y, w: round1(inner.w * ratio), h: inner.h }
    : undefined;
  // 幂等的前提: 所有墨迹都在 [x, x+bounds.w] 内(条内那一档已判过装得下; 条外那一档标签恒从条左缘起)
  const block = bounds([bar, ...(label ? [label] : [])])!;
  const p0 = theme.tones[tone];
  return {
    theme, fillInk: p.fill ?? FILL_SLOT[p.variant ?? 'outline'](p0),
    bar, block, inner, radius, inset, showTrack, fill, label, labelAnchor,
  };
}

/**
 * 单值进度条 descriptor: 轨道 + 填充段 + 可选标签。
 *
 * ```ts
 * const b = progressBlock({ x: 40, y: 40, w: 480, ratio: 0.68, tone: 'blue', variant: 'solid', label: '读盘 68%' });
 * const col = packCol({ items: [b.bounds, …], gap: 24, x: 40, y0: 40 });   // bounds 直接当盒摆
 * ```
 *
 * 返回类型是 `ProgressBlock`(含契约的 `shape` / `bounds`, 外加 `bar` / `fill` / `label` 三个读数
 * 盒) —— 与 `listRowShape` 同规矩: 多余的那几个字段不并进 `shape` 的 attrs(描述符是纯数据)。
 */
export function progressBlock(p: ProgressProps): ProgressBlock {
  const plan = planProgress('progressBlock', p);
  const { theme, bar, fill, label, radius, inset, block } = plan;
  const track = toneStyle(theme, p.tone, 'outline');
  /** 内缩之后的圆角: 同心的减法(负值归 0 —— 圆角不是尺寸, 但也不能是负的) */
  const innerRadius = Math.max(0, radius - inset);
  const kids: Descriptor[] = [];

  if (plan.showTrack) {
    kids.push(segmentOf(bar, [radius, radius, radius, radius], {
      fill: p.trackFill ?? track.fill,
      stroke: p.trackStroke ?? track.stroke,
      'stroke-width': PROGRESS_LAYOUT.trackWidth,
    }));
  }
  if (fill) {
    kids.push(segmentOf(fill, [innerRadius, innerRadius, innerRadius, innerRadius], { fill: plan.fillInk, stroke: 'none' }));
  }
  if (label) {
    // ⚠ 条内标签的墨色是**作者的**: 条心落在填充段还是轨道上取决于 ratio(实底档的填充会把深色
    // 小字吃掉) —— 缺省取 `theme.label`, 压不住时给 `labelColor` 或换 `labelAt: 'above'`。
    kids.push(inlineTextRow({
      x: plan.labelAnchor === 'middle' ? round1(label.x + label.w / 2) : label.x,
      y: baselineY(round1(label.y + label.h / 2), PROGRESS_LAYOUT.labelFontSize, 'central'),
      content: p.label!,
      weight: PROGRESS_LAYOUT.labelWeight,
      theme,
      attrs: {
        ...anchorAttrs(plan.labelAnchor),
        'font-size': PROGRESS_LAYOUT.labelFontSize,
        fill: p.labelColor ?? theme.label,
        'font-family': 'inherit',
      },
    }));
  }
  return { shape: group(kids, { 'data-shape': 'progress' }), bounds: block, bar, fill, label };
}

// --- ② 100% 堆叠条 ------------------------------------------------------

export type StackedBarProps = {
  /** 条的**左缘** */
  x: number;
  /** 条的**顶边** */
  y: number;
  /** 条的**总宽** —— 它就是 100% */
  w: number;
  /**
   * 逐段比例(0..1): **每段宽 = 条内区宽 × 该段比例**, kernel 不归一化、不补尾差。
   * 合计 < 1 = 没填满(余量露轨道, 除非 `track: false`); 合计 > 1 当场抛(浮点累计留 1e-9 容差)。
   */
  ratios: readonly number[];
  /** 逐段肤色(长度必须 = `ratios.length` —— 每段吃一个 tone) */
  tones: readonly Tone[];
  /** 条高(px, 缺省 `PROGRESS_LAYOUT.barH`; 与 `progressBlock` 同名同义 —— 它不是块的盒高) */
  barH?: number;
  /** 圆角(px, 缺省 `PROGRESS_LAYOUT.radius`) */
  radius?: number;
  /** 是否画轨道(缺省 true): 合计 = 1 时轨道被段盖满, 只在有**余量**时露出来 */
  track?: boolean;
  /** 整条共用的档位(缺省 `outline`, 详见 `FILL_SLOT`) */
  variant?: Variant;
  theme?: Theme;
  /** 单点覆盖(少数例外才用) */
  trackFill?: string;
  trackStroke?: string;
};

export type StackedBarBlock = Block & {
  /** 轨道盒 = **100% 的界** */
  bar: Rect;
  /**
   * 逐段的盒: **与 `ratios` 同序同长**(比例 0 的段也在其中, 只是一个宽 0 的盒 —— 于是"第几段
   * 在哪"与输入一一对应, 而上屏的墨迹里没有它)。
   */
  segments: Rect[];
};

/** 合计上界: 浮点累计的容差(0.55 + 0.3 + 0.15 在双精度下是 1.0000000000000002) */
const TOTAL_EPS = 1e-9;

function planStack(owner: string, p: StackedBarProps): { ratios: number[]; tones: Tone[]; total: number; bar: Rect; inner: Rect; radius: number; inset: number; showTrack: boolean } {
  const { barH, radius, inset, showTrack } = barKnobs(owner, p);
  const ratios = p.ratios;
  if (!Array.isArray(ratios) || !ratios.length) {
    throw new ShapeInputError(owner, 'ratios', `是空数组(${Array.isArray(ratios) ? 0 : typeof ratios})`, '堆叠条至少得有一段; 只想画一条空轨道请用 progressBlock');
  }
  const tones = p.tones;
  if (!Array.isArray(tones) || tones.length !== ratios.length) {
    throw new ShapeInputError(owner, 'tones', `长度 ${Array.isArray(tones) ? tones.length : typeof tones} ≠ ratios.length(${ratios.length})`,
      '每段吃一个 tone: 两列一一对应(三段同色就写三个同一个 tone)');
  }
  ratios.forEach((r, i) => {
    assertRatio(owner, `ratios[${i}]`, r);
    assertOneOf(owner, `tones[${i}]`, tones[i], TONES);
  });
  const total = ratios.reduce((a, b) => a + b, 0);
  if (total > 1 + TOTAL_EPS) {
    throw new ShapeInputError(owner, 'ratios', `合计 ${total} > 1`, '合计是"这些段一共占了满额的多少"; 超过就从条右端探出去 —— 归一化是作者的事(kernel 不替你缩); 浮点累计留了 1e-9 容差');
  }
  const bar: Rect = { x: p.x, y: p.y, w: p.w, h: barH };
  const inner: Rect = { x: round1(bar.x + inset), y: round1(bar.y + inset), w: round1(bar.w - 2 * inset), h: round1(bar.h - 2 * inset) };
  return { ratios: [...ratios], tones: [...tones], total, bar, inner, radius, inset, showTrack };
}

/**
 * 100% 堆叠条 descriptor: 一段轨道 + N 段紧贴的色段(首末段吃掉圆角帽)。
 *
 * 两条口径值得点名:
 *   · **段与段紧贴**(不给缝): 缝会让"每段占多长"与声明的比例分叉 —— 比例的分母是条内区的宽
 *   · **圆角帽给"画得出来的"首末段**: 首段比例写 0 时它不上屏, 帽就落到下一个有墨迹的段上
 *     (不是从数据推几何, 而是"照画出来的东西收边")
 *
 * 图例是**调用方义务**(与 `templates/lifecycle.ts` 对图例的立场同): `segments` 与 `ratios` 同序,
 * 拿它自己垫图例 / 标签; 本文件一个图例元素都不出。
 */
export function stackedBarBlock(p: StackedBarProps): StackedBarBlock {
  const plan = planStack('stackedBarBlock', p);
  const { ratios, tones, bar, inner, radius, inset } = plan;
  const theme = p.theme ?? DEFAULT_THEME;
  const variant = p.variant ?? 'outline';
  // 首末**有墨迹**的段(比例 0 的段不上屏, 也就不吃帽)
  const firstDrawn = ratios.findIndex((r) => r > 0);
  const lastDrawn = ratios.length - 1 - [...ratios].reverse().findIndex((r) => r > 0);
  const capR = Math.max(0, radius - inset);
  const kids: Descriptor[] = [];

  if (plan.showTrack) {
    // 轨道不带肤色: 堆叠条的肤色是**逐段**的, 让某一的颜色去染整个框就是"第一段偷偷当了主角"
    // —— 与 `progressBlock` 的"轨道是容器"同一条口径, 这里取中性 slate 的 outline 档
    const track = toneStyle(theme, 'slate', 'outline');
    kids.push(segmentOf(bar, [radius, radius, radius, radius], {
      fill: p.trackFill ?? track.fill,
      stroke: p.trackStroke ?? track.stroke,
      'stroke-width': PROGRESS_LAYOUT.trackWidth,
    }));
  }
  // 逐段累加位置: 每段 x 与宽都过 `round1`(与渲染精度同档), 且**按累加值接着排** ——
  // 于是段与段严丝合缝(各段自己取整会让相邻两段之间裂出或叠上零点几 px)
  const segments: Rect[] = [];
  let cx = inner.x;
  for (const [i, r] of ratios.entries()) {
    const w = round1(inner.w * r);
    segments.push({ x: cx, y: inner.y, w, h: inner.h });
    cx = round1(cx + w);
    if (!(w > 0)) continue;
    kids.push(segmentOf(segments[i], [i === firstDrawn ? capR : 0, i === lastDrawn ? capR : 0, i === lastDrawn ? capR : 0, i === firstDrawn ? capR : 0], {
      fill: FILL_SLOT[variant](theme.tones[tones[i]]),
      stroke: 'none',
    }));
  }
  return { shape: group(kids, { 'data-shape': 'stacked-bar' }), bounds: bounds([bar])!, bar, segments };
}
