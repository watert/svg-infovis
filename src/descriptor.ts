// =====================================================================
// descriptor · 几何描述子 (纯数据, 零依赖)
// shape 函数不吐字符串也不吐 JSX, 只吐这份纯数据 —— 双态序列化的分界点(设计稿 §6.3):
//   serialize.ts  → SVG 字符串(字节确定性)
//   react 薄壳    → JSX 元素
// =====================================================================

// 只作**类型**引用(type-only import): descriptor 仍是零运行期依赖 —— 但"矩形"这个概念
// 全仓只有一份(`geometry/vec`), 在这里再写一个 `{ x, y, w, h }` 就是第二个几何真相
import type { Rect } from './geometry/vec';

/** SVG 属性袋: 值只允许确定性原始类型 */
export type Attrs = Record<string, string | number | undefined>;

export type DPath = { kind: 'path'; d: string; attrs?: Attrs };
export type DCircle = { kind: 'circle'; cx: number; cy: number; r: number; attrs?: Attrs };
export type DRect = { kind: 'rect'; x: number; y: number; w: number; h: number; rx?: number; attrs?: Attrs };
export type DTextSpan = {
  text: string;
  /**
   * 字重(CSS 数值)。**单独一位**而不是并进 `attrs`: 它走 `fmt`(2 位小数)口径,
   * 与 260920 首版 `<tspan font-weight="400.00">` 的字节一致。
   */
  weight?: number;
  /** 其余行内样式属性(斜体 / 删除线 / 行内色 …): 键序由序列化器统一排 */
  attrs?: Attrs;
};
export type DText = { kind: 'text'; x: number; y: number; content: string; attrs?: Attrs; spans?: DTextSpan[] };
export type DGroup = { kind: 'group'; children: Descriptor[]; attrs?: Attrs };
export type DSvg = { kind: 'svg'; w: number; h: number; children: Descriptor[]; attrs?: Attrs };
/** `<pattern>`: 平铺单元 —— 网格底纹的唯一载体(w/h = tile 尺寸, id 供 `fill="url(#id)"` 引用) */
export type DPattern = { kind: 'pattern'; id: string; w: number; h: number; children: Descriptor[]; attrs?: Attrs };
/** `<defs>`: 只声明不上屏的容器 */
export type DDefs = { kind: 'defs'; children: Descriptor[] };
/**
 * **嵌套 `<svg>`**: 外部素材(echarts 这类整幅出图的工具)的挂载点。
 *
 * 它不是"又一个形状", 而是**一整块别人画的画**: `markup` 是素材的内部标记, 序列化时
 * **原样插入** —— 所以那边不做任何重新缩进 / 换行(见 `serialize.ts` 那条 case 的注释)。
 * `viewBox` 是**素材自己的坐标系**, 由宿主的 `x/y/w/h` + `preserveAspectRatio` 把它映射进去。
 */
export type DEmbed = { kind: 'embed'; x: number; y: number; w: number; h: number; viewBox: Rect; markup: string; attrs?: Attrs };

export type Descriptor = DPath | DCircle | DRect | DText | DGroup | DPattern | DDefs | DEmbed;

export const path = (d: string, attrs?: Attrs): DPath => ({ kind: 'path', d, attrs });
export const circle = (cx: number, cy: number, r: number, attrs?: Attrs): DCircle => ({ kind: 'circle', cx, cy, r, attrs });
export const rect = (x: number, y: number, w: number, h: number, rx?: number, attrs?: Attrs): DRect => ({ kind: 'rect', x, y, w, h, rx, attrs });
export const text = (x: number, y: number, content: string, attrs?: Attrs): DText => ({ kind: 'text', x, y, content, attrs });

/**
 * 富文本: 一行里**分段不同样式**(`**粗**` / `*斜*` / `~~删~~` / `[字]{accent}`)。走 `<tspan>`
 * 而不是"每段一个 `<text>` 元素 + 自己累加 x" —— 后者的段间距由 core 的估算宽决定, 而渲染器
 * 用的是真字体, 两把尺子必然在段的接缝处露出破绽(字挤在一起或裂开一条缝)。`<tspan>` 让
 * **渲染器自己接**, 接缝不存在。
 *
 * 它是 `shapes/inline.ts` 那个发射器的出口 —— 别在别处手拼 spans(解析层在 `geometry/inline-text`)。
 * `content` 仍然写全(纯文本) —— 它是这一行的"内容", 供对账 / 调试 / 未来可能的纯文本渲染器读;
 * 序列化时以 `spans` 为准。
 */
export const richText = (x: number, y: number, spans: DTextSpan[], attrs?: Attrs): DText =>
  ({ kind: 'text', x, y, content: spans.map((s) => s.text).join(''), attrs, spans });
export const group = (children: Descriptor[], attrs?: Attrs): DGroup => ({ kind: 'group', children, attrs });
export const svg = (w: number, h: number, children: Descriptor[], attrs?: Attrs): DSvg => ({ kind: 'svg', w, h, children, attrs });
/** 平铺单元(网格底纹的载体): id 供 `fill="url(#id)"` 引用, w/h 即 tile 尺寸 */
export const pattern = (id: string, w: number, h: number, children: Descriptor[], attrs?: Attrs): DPattern =>
  ({ kind: 'pattern', id, w, h, children, attrs });
export const defs = (children: Descriptor[]): DDefs => ({ kind: 'defs', children });
/**
 * 嵌套 `<svg>`(素材挂载点) —— `markup` **原样透传**: 别在这里缩进、别在这里包 `<![CDATA[`。
 * 素材内部的坐标是它自己那套(`viewBox` 声明), 缩放交给渲染器的 `preserveAspectRatio`。
 */
export const embed = (x: number, y: number, w: number, h: number, viewBox: Rect, markup: string, attrs?: Attrs): DEmbed =>
  ({ kind: 'embed', x, y, w, h, viewBox, markup, attrs });

// --- 主题: 已迁到 ./theme.ts (7 色 tone × light/dark × outline/solid) ------
// 这里不再持有配色 —— shape 只读语义槽, 不认具体色值。

// --- 文本定位: 自己算, 不依赖渲染器的 dominant-baseline ------------------

// (偷自 Infographic 的对齐矩阵只剩水平一半 —— 垂直那半改成算出来的坐标)

/**
 * 水平对齐词表 —— **运行时值与类型同源**(与 `NODE_ALIGN_KINDS` 同规矩): 写错当场抛, 不静默回落。
 * 消费者: `anchorAttrs`(渲染) 与 `textFit` / `placeText`(构建期反算锚点边) —— 同一个词表,
 * 所以"字按 start 对齐"与"盒的左端落在锚点上"必然是同一件事。
 */
export const TEXT_ANCHORS = ['start', 'middle', 'end'] as const;
export type TextAnchor = (typeof TEXT_ANCHORS)[number];
export type Baseline = 'hanging' | 'central' | 'baseline';

/**
 * 基线折算系数(相对 font-size)。
 *
 * 为何不用 `dominant-baseline` 属性: 各渲染器支持不一 —— ImageMagick 内置 MSVG 直接不支持,
 * librsvg / resvg / PDF 管线各有偏差, 换渲染器整张图的文字就漂, 而且漂多少不可对账。
 * 自己算 = 坐标进得了 golden, 跨渲染器只差一个固定系数。
 *
 * `central = 0.35` 是**量出来的**(260925 复核): 按它摆好单行字后逐像素量墨迹, 墨心落在基线上方
 * **CJK 0.3555–0.3594em**(11/13/16/20 四档字号一致)、大写英文 0.3636em、小写 0.3413em ——
 * 残差 ≤0.1px。所以这一格**不该再叠任何 px 补偿**; CJK / 等宽字族真要有偏差, 也是改这个系数。
 *
 * ⚠ **别在这里加"光学补偿"**: 260917 曾加过一个 `OPTICAL_CENTRAL_FIX = 1.2`(`central` 恒
 * +1.2px), 260925 已移除。它当时是拿"主标签 CJK + 次标签大写英文"那个**两行块**校准出来的
 * (那份内容上 +1.2 确实更准), 可两行块的视觉中心还牵扯行距与两行字族的墨心差 —— 那是
 * **内容依赖**的修正, 而 `baselineY` 是所有 central 站点共享的**折算层**(节点单标签 / 边标签
 * 遮罩片 / 旁注 / 组标题都吃它)。放进共享层 = 每个单行场景统一多下沉 1.2px, 而它们本来是对的。
 * 教训: **内容依赖的偏差修在摆那块内容的地方, 折算层只放与内容无关的几何系数** —— 想再往这里
 * 加全局常量, 先证明它对"单行 CJK / 单行英文 / 多行 / 各字号"同时成立。
 */
export const BASELINE_FACTORS: Record<Baseline, number> = {
  baseline: 0,
  central: 0.35,
  hanging: 0.8,
};

/**
 * 把"锚点 y"折算成 SVG 里真正要写的基线 y。**纯公式**(只吃 `BASELINE_FACTORS`)——
 * 这里多一个 px 修正, 全图的字就一起跟着沉, 别再塞东西进来(原委见上一条)。
 */
export const baselineY = (y: number, fontSize: number, baseline: Baseline = 'baseline'): number =>
  y + fontSize * BASELINE_FACTORS[baseline];

/** 水平对齐: 这条各渲染器一致, 保留属性 */
export const anchorAttrs = (anchor: TextAnchor = 'start'): Attrs =>
  ({ 'text-anchor': anchor === 'start' ? undefined : anchor });
