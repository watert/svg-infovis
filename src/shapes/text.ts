// =====================================================================
// shapes/text · 文本与标签遮罩片
//
// 文本定位走**数学折算**(baselineY), 不写 `dominant-baseline` 属性 —— 见 descriptor.ts 里的理由:
// 那条属性各渲染器支持不一, 一换渲染器文字就漂, 而且漂多少不进坐标、无法对账。
//
// 偷自 Archify 的 c-mask 与 Infographic 的 backgroundColor chip(设计稿 §6.5):
// 两家都做了 = 遮线是刚需不是装饰。label_clearance 门禁的检测对象是线, 遮罩是成本最低的修法。
//
// 遮罩**默认隐形**(260925): `labelBoxShape` 的缺省 `bg` 是 `theme.canvas` —— 与画布同色就只剩
// "切断穿过的线"这个本职(半透明 / 同色块上压一条线仍读得断), 不再是一块比字大的浅灰徽章。
// **chip 是另一档语义**(徽章 = 作者要它显形), 所以 `labelChip` 把缺省补回 `theme.labelBg`。
// =====================================================================

import { type Attrs, type Descriptor, type TextAnchor, type Baseline, anchorAttrs, baselineY, group, rect, text } from '../descriptor';
import { DEFAULT_THEME, type Theme, type Tone } from '../theme';
import { assertFiniteNumber } from '../guard';
import { round1 } from '../geometry/vec';
// 多行遮罩片(260923): 行心堆叠走共用几何, 行距取与节点标签 / 旁注同一份口径
import { rowBlock } from '../geometry/text-rows';
import { NODE_TEXT_LAYOUT } from './node';

export type TextProps = {
  x: number;
  /** 锚点 y: 含义由 baseline 决定(central = 视觉中心, baseline = 基线, hanging = 顶部) */
  y: number;
  content: string;
  anchor?: TextAnchor;
  baseline?: Baseline;
  size?: number;
  weight?: number;
  /** 直接指定颜色(不传则取 tone 的文字色) */
  color?: string;
  tone?: Tone;
  theme?: Theme;
  opacity?: number;
  letterSpacing?: number;
  fontFamily?: string;
};

export function textAttrs(p: TextProps): Attrs {
  const theme = p.theme ?? DEFAULT_THEME;
  const fallback = theme.tones[p.tone ?? 'slate'].text;
  return {
    ...anchorAttrs(p.anchor ?? 'start'),
    'font-size': p.size ?? 12,
    'font-weight': p.weight,
    'font-family': p.fontFamily ?? 'inherit',
    'letter-spacing': p.letterSpacing,
    fill: p.color ?? fallback,
    opacity: p.opacity,
  };
}

export function textShape(p: TextProps): Descriptor {
  assertFiniteNumber('textShape', 'x', p.x, '文本坐标必须有限; 若传入的是 SceneText, 注意它的位置在 rect 里');
  assertFiniteNumber('textShape', 'y', p.y);
  if (p.size !== undefined) assertFiniteNumber('textShape', 'size', p.size);
  const size = p.size ?? 12;
  // 把垂直对齐吸收进 y 坐标: 属性里不再出现 dominant-baseline
  return text(p.x, baselineY(p.y, size, p.baseline ?? 'baseline'), p.content, textAttrs(p));
}

export type ChipProps = TextProps & {
  /** 水平内边距 */
  padX?: number;
  /** 垂直内边距 */
  padY?: number;
  /** 文本宽度估算值 —— 由 measure 给出, core 不猜字宽 */
  width: number;
  /** 高度估算值 */
  height?: number;
  bg?: string;
  radius?: number;
};

/**
 * 标签遮罩片: 垫在文字下的一小块背景, 用来切断穿过 label 的线。
 * 输入 width/height 是度量结果(measure 的活), 这里只做几何与对齐。
 * 语义统一按"锚点 = 视觉中心"处理 —— 标签没有用裸基线对齐的场景。
 */
/**
 * 文本外框(遮罩片 + 居中文字) —— **标签类元素唯一的上屏几何**。
 *
 * `w`/`h` 是外框尺寸, 必须与审计用的检测矩形同源(`SceneLabel.width/height` 就是这两个数):
 * 260917 的 ③ 号病症正是"审计读 SceneLabel.at、渲染另算 labelAnchor", 两个来源必然漂开。
 */
export type LabelBoxProps = {
  /** 外框中心 */
  x: number;
  y: number;
  /** 外框宽高(含内边距) —— 与检测矩形同源 */
  w: number;
  h: number;
  content: string;
  fontSize?: number;
  weight?: number;
  /** 文字色(缺省 `theme.label`); 有 `tone` 的标签由出口给成 `tones[tone].text` */
  color?: string;
  /**
   * 遮罩底色 —— **缺省 `theme.canvas`**: 与画布同色 ⇒ 遮罩隐形, 只剩"切断穿过的线"的本职。
   * 要显形的徽章观感(不透明色块 / tint 底)才显式给值, chip 那条路径由 `labelChip` 补上。
   */
  bg?: string;
  radius?: number;
  /**
   * 绕 (x, y) 旋转的角度(度, 屏幕顺时针为正; 缺省 0)。
   * 与 `SceneLabel.rotate` **同一个数**: 审计的检测矩形由 `labelRect` 取旋转后的轴对齐包围盒,
   * 渲染在这里做同一件事 —— 两边读的必须是同一块地方(这是本文件第二次处理"双源"了)。
   */
  rotate?: number;
  theme?: Theme;
};

export function labelBoxShape(p: LabelBoxProps): Descriptor {
  assertFiniteNumber('labelBoxShape', 'x', p.x);
  assertFiniteNumber('labelBoxShape', 'y', p.y);
  assertFiniteNumber('labelBoxShape', 'w', p.w, '外框宽高来自度量结果(measureText)或作者声明, 不许是 undefined');
  assertFiniteNumber('labelBoxShape', 'h', p.h);
  if (p.fontSize !== undefined) assertFiniteNumber('labelBoxShape', 'fontSize', p.fontSize);
  if (p.rotate !== undefined) assertFiniteNumber('labelBoxShape', 'rotate', p.rotate);
  const theme = p.theme ?? DEFAULT_THEME;
  const size = p.fontSize ?? 11;
  // 多行(260923): 逐行发射, 行心对盒中心对称 —— 堆法走 `geometry/text-rows`(与 `nodeShape` /
  // `export.ts` 的 `scene.texts` 同一份), 行距取 `NODE_TEXT_LAYOUT.lineGapEm`。
  // 单行时 `offsets = [0]` ⇒ 产出的 `<text>` 与旧版**逐字节相同**(字节确定性那条不受影响)
  const lines = p.content.split('\n');
  const block = rowBlock(lines.length, size * NODE_TEXT_LAYOUT.lineGapEm);
  const box = group(
    [
      rect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, p.radius ?? 4, { fill: p.bg ?? theme.canvas, stroke: 'none' }),
      ...lines.map((line, i) => text(p.x, baselineY(p.y + block.offsets[i], size, 'central'), line, {
        ...anchorAttrs('middle'),
        'font-size': size,
        'font-weight': p.weight,
        fill: p.color ?? theme.label,
        'font-family': 'inherit',
      })),
    ],
    { 'data-shape': 'label-box' },
  );
  // 不旋转时**原样返回那个 group** —— 既有产物逐字节不变(多包一层 `transform: rotate(0)` 会改字节)
  if (!p.rotate) return box;
  return group([box], { transform: `rotate(${round1(p.rotate)} ${round1(p.x)} ${round1(p.y)})` });
}

/**
 * 便捷入口: 给的是**文本宽度**, 内边距在这里加进去。
 * `SceneLabel` 渲染不经过它 —— 那条路径的外框尺寸已经是最终值, 直连 `labelBoxShape`。
 */
export function labelChip(p: ChipProps): Descriptor {
  // width/height 是**必填**的度量结果 —— 缺了它 chip 会变成一个 NaN 宽度的矩形, 被渲染器静默吞掉
  assertFiniteNumber('labelChip', 'width', p.width, '宽度来自 measureText(); 空字符串也会得到 0, 而不是 undefined');
  if (p.height !== undefined) assertFiniteNumber('labelChip', 'height', p.height);
  const theme = p.theme ?? DEFAULT_THEME;
  const size = p.size ?? 11;
  const h = p.height ?? size + 6;
  const w = p.width + (p.padX ?? 6) * 2;
  const anchor = p.anchor ?? 'middle';
  // 以文本锚点为中心反推 chip 左端, 再换算回中心锚点 —— 几何实现只此一处
  const left = anchor === 'middle' ? p.x - w / 2 : anchor === 'end' ? p.x - w : p.x;
  return labelBoxShape({
    x: left + w / 2, y: p.y, w, h, content: p.content, fontSize: size,
    // chip 是**徽章语义**(作者要它显形), 所以在这里把缺省补回 `theme.labelBg` ——
    // `labelBoxShape` 的缺省已改成画布色(遮罩隐形), 本行是唯一让老观感原地不动的地方
    weight: p.weight, color: p.color, bg: p.bg ?? theme.labelBg, radius: p.radius, theme,
  });
}
