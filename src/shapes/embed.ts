// =====================================================================
// shapes/embed · 把一整幅外部素材画进一个矩形(嵌套 `<svg>`)
//
// 由来(260920): 与 `shapes/icon.ts` 同一族需求的两半 —— 图标那条是"这一格是什么东西"的
// **小素材**(七原语、坐标烘平、无 transform), 本条是"这一格的数据"的**整幅画**(echarts 出的
// 图表: `<g>` / `<text>` / `transform` / `clipPath` 全有)。前者烘平, 后者**原样透传** ——
// 因为把后者的坐标烘平要重写圆弧 / 矩阵 / 裁剪, 收益只是产物短一点(依据见 `embed/svg-asset`)
//
// 三条设计决定:
//   ① **素材占的正是一个矩形**且**画在宿主坐标系里** —— `SceneEmbed.rect` 是唯一那份几何:
//      `contentBounds`(auto-fit 不裁素材)、`describeScene`(读数板看得到它)、
//      `single_svg`(越出画布) 读的都是它。嵌套 `<svg>` 的坐标就是它的坐标, 没有第二份换算。
//   ② **素材是个语义槽**(与 `SceneNode.icon` 同族): "这一格是一张图表"是图在说什么, 所以
//      `asset` 与几何一起进 scene, 渲染路径上**不读盘不解析 SVG**(素材在构建期已收拾干净)。
//   ③ **z 序在底**: 素材是这块版式的**底板**(面板里的图表), 线与标签要压在它上面才读得出
//      "谁在说什么" —— 它若压住节点, 图就没法看了。这条决定落在 `export.ts` 的 `sceneChildren`。
//
// 门禁边界(明确说清, 与图标同一条): 素材**不进任何净空门禁** —— 它是压在版式上的墨迹,
// 不是参与排版的对象。想让线 / 标签避开图表, 靠作者留位(那是决策, core 不猜)。
// 这条缺口(边/标签压在图表上无人管)记在 `ROADMAP.md`「后续方向」, 要收口得先按纪律 9 举证 + 纪律 11 给旋钮。
// =====================================================================

import { type Attrs, type DEmbed, embed as dEmbed } from '../descriptor.js';
import { ShapeInputError, assertFiniteRect } from '../guard.js';
import type { Rect } from '../geometry/vec.js';
import type { EmbedAsset } from '../embed/svg-asset.js';

/**
 * 场景里的外部素材 —— 与 `SceneNode.icon` 对位(都是一次"素材上屏"的声明)。
 *
 * `rect` 是素材在宿主坐标系里占的那块地方; 素材自己的坐标系在 `asset.viewBox` 里,
 * 两者的映射由渲染器的 `preserveAspectRatio="xMidYMid meet"` 做(contain, 不变形)。
 */
export type SceneEmbed = {
  id: string;
  rect: Rect;
  asset: EmbedAsset;
  /** 整块淡化(0~1), 与 `SceneNode.opacity` 同族; 缺省不写, 老产物字节不变 */
  opacity?: number;
};

export type EmbedProps = {
  asset: EmbedAsset;
  /** 素材画进的那块矩形(宿主坐标系) */
  x: number;
  y: number;
  w: number;
  h: number;
  opacity?: number;
};

/**
 * 素材 descriptor。产物是**一个嵌套 `<svg>`**: `x/y/w/h` 给它位置与尺寸, 素材自己的
 * `viewBox` 声明内部坐标系, `preserveAspectRatio="xMidYMid meet"` 做 contain(非等比素材不拉伸)。
 */
export function embedShape(p: EmbedProps): DEmbed {
  assertFiniteRect('embedShape', p);
  if (!p.asset || typeof p.asset.markup !== 'string' || !p.asset.viewBox || !Array.isArray(p.asset.dropped)) {
    throw new ShapeInputError('embedShape', 'asset', '不是一份素材(拿到空值 / 少了 markup / 少了 viewBox)',
      'asset 要用 `embedAsset(svgText)` 的产物, 不是一段 SVG 字符串');
  }
  // viewBox 是素材自己的坐标系, 而 `fmt` 对非有限值会**写出 NaN** —— 那种坏产物 `finite_svg` 扫不到
  // (它只看 scene 里的数值字段), 所以在入口挡住
  assertFiniteRect('embedShape', p.asset.viewBox, 'viewBox 来自 `embedAsset(svgText)` 的产物; 手搓的那份不保证是有限数');
  for (const [field, v] of [['w', p.w], ['h', p.h]] as const) {
    if (!(v > 0)) {
      throw new ShapeInputError('embedShape', field, `必须为正(拿到 ${v})`,
        '素材占的是一块有面积的地方 —— 尺寸不是增量, 0 画出来是空气');
    }
  }
  const attrs: Attrs = { 'data-shape': 'embed' };
  if (p.opacity !== undefined) attrs.opacity = p.opacity;
  return dEmbed(p.x, p.y, p.w, p.h, p.asset.viewBox, p.asset.markup, attrs);
}
