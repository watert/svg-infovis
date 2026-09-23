// =====================================================================
// shapes/icon · 把素材(ParsedIcon)画进一个矩形
//
// 由来(260920 ontology 图): "图标 + 说明卡片" 这类图里, 图标是**内容的一半** —— 它给的是
// "这一格是什么东西"的视觉替身, 而文字卡片只负责细节。core 此前只能画盒与线, 这类图根本出不来。
//
// 三条设计决定(都是照着本仓既有的题材做的, 不是新发明的口径):
//
// ① **坐标全部烘进产物, 不用 `<transform>`**。
//    与"不写 dominant-baseline、自己算基线"是同一条纪律: 产物里的每个坐标都该是真坐标,
//    这样 audit / describe / 人读 diff 看到的是同一份几何; `<g transform="scale(3)">` 一挂,
//    门禁量的是外层矩形、眼睛看的是缩放后的墨迹, 两边就开始了那种经典的漂。
//    代价: 解析出来的每个原语都要过一遍"缩放 + 平移"的换算(下面 `map` 一族), 只有这一处。
//
// ② **图标占的正是一个矩形**(`iconRect`), 且**画在盒上方**。
//    把它归约成矩形有两个收益: `contentBounds`(auto-fit 不裁图标)与 `describeScene`(读数板看得到它)
//    都直接吃得下; 而"上方"是这类图的固定版式(图标 → 卡片), 于是 `cardFit` 能把
//    "图标 + 间隙 + 卡片" 一次性反算成一个块高 —— 作者不必手调两个数去凑位置。
//
// ③ **描边宽度用素材自己的单位**(lucide = 2, 即 viewBox 单位), 不是渲染后的像素。
//    渲染值 = `strokeWidth × (size / viewBox.w)`。为什么不做成像素: 像素口径下一个图标
//    换尺寸就得重算描边, 而"这套图标多粗"是**整套素材**的属性(换一套图标就该整体变粗)。
//
// 门禁边界(明确说清): 图标**不进任何净空门禁** —— 与 `struck` 叉线 / 网格底纹同一档,
// 它是压在版式上的墨迹, 不是参与排版的对象。想让图标与别的格子保持距离, 用 `cardFit` 的
// `block` 留位(那是作者决策, core 不猜)。这条缺口记在 `TODO.md`。
// =====================================================================

import { type Attrs, type DGroup, type Descriptor, group, path, circle as dCircle, rect as dRect } from '../descriptor';
import { DEFAULT_THEME, type Theme } from '../theme';
import { ShapeInputError, assertFiniteNumber, assertFiniteRect } from '../guard';
import { type Rect, fmt, round1 } from '../geometry/vec';
import { mapPathData } from '../icons/path-data';
import type { IconPaint, ParsedIcon } from '../icons/svg-parse';

/** 图标缺省尺寸 / 与盒顶的间距(px)。改这两个数会改所有不显式给值的图标 —— 别随手动 */
export const ICON_DEFAULTS = { size: 64, gap: 12 } as const;

/**
 * 节点上的图标槽(**语义槽**, 与 `tone` / `shape` 同族: "这一格是什么东西"是图在说什么)。
 * 进 scene 的是它 —— 所以 `asset` 必须是纯数据(`iconAsset(name)` 的产物), 不是函数。
 */
export type NodeIcon = {
  /** 素材(由 `iconAsset` / `iconFromSvg` / `iconFromFile` 产出) */
  asset: ParsedIcon;
  /** 边长(px, 正方形)。缺省 `ICON_DEFAULTS.size` */
  size?: number;
  /** 图标底边到盒顶的距离(px)。缺省 `ICON_DEFAULTS.gap` */
  gap?: number;
  /** 描边色。缺省 `theme.edge`(与边同色, 于是"图标是图的墨"这件事在配色上也成立) */
  color?: string;
  /** 描边宽度(**素材坐标系单位**, 见文件头 ③)。缺省用素材自己声明的那个 */
  strokeWidth?: number;
};

export type IconProps = {
  asset: ParsedIcon;
  /** 目标矩形(图标按 contain 缩放居中放进去, 不变形) */
  x: number;
  y: number;
  w: number;
  h: number;
  color?: string;
  strokeWidth?: number;
  opacity?: number;
  theme?: Theme;
};

/**
 * 图标矩形 = 盒的**正上方**(水平居中, 底边离盒顶 `gap`)。
 * 单独导出是为了让 `contentBounds` / 读数板 / 作者三方读的是**同一个矩形**(渲染面与测量面同源)。
 */
export function iconRect(rect: Rect, icon: { size?: number; gap?: number } = {}): Rect {
  const size = icon.size ?? ICON_DEFAULTS.size;
  const gap = icon.gap ?? ICON_DEFAULTS.gap;
  if (!(size > 0)) {
    throw new ShapeInputError('iconRect', 'size', `必须为正(拿到 ${size})`, '图标边长是尺寸不是增量');
  }
  if (gap < 0) {
    throw new ShapeInputError('iconRect', 'gap', `为负(${gap})`, '间隙是尺寸不是增量; 想贴住盒顶就给 0');
  }
  return { x: round1(rect.x + (rect.w - size) / 2), y: round1(rect.y - gap - size), w: size, h: size };
}

/**
 * 图标 + 盒的**并集矩形** —— `contentBounds` 吃它(auto-fit / 出界门禁才不会把图标裁掉)。
 * ⚠ 它只是"墨迹范围", **不是**任何净空判据的检测对象(见文件头"门禁边界")。
 */
export function iconInkRect(rect: Rect, icon: { size?: number; gap?: number } = {}): Rect {
  const r = iconRect(rect, icon);
  return {
    x: Math.min(rect.x, r.x), y: Math.min(rect.y, r.y),
    w: Math.max(rect.x + rect.w, r.x + r.w) - Math.min(rect.x, r.x),
    h: Math.max(rect.y + rect.h, r.y + r.h) - Math.min(rect.y, r.y),
  };
}

/**
 * 逐原语的画法覆盖 → 一组真正的 SVG 属性(只有真写了的那几位才出现)。
 * `scale` 用来把素材单位的描边宽度折算成渲染像素 —— 与外层 `stroke-width` 同一把尺子,
 * 否则"某一笔比别的粗"这件事会在缩放后变得不成比例(素材里那几笔本来就该更粗)。
 */
function paintAttrs(paint: IconPaint | undefined, color: string, scale: number): Attrs {
  const attrs: Attrs = {};
  if (paint?.fill !== undefined) attrs.fill = paint.fill === 'currentColor' ? color : paint.fill;
  if (paint?.stroke !== undefined) attrs.stroke = paint.stroke === 'currentColor' ? color : paint.stroke;
  if (paint?.strokeWidth !== undefined) {
    if (!Number.isFinite(paint.strokeWidth)) {
      throw new ShapeInputError('iconShape', 'stroke-width', `素材里这个元素写的是 "${paint.strokeWidth}"`, '素材解析阶段就该拦下非数');
    }
    attrs['stroke-width'] = round1(paint.strokeWidth * scale);
  }
  return attrs;
}

/** 椭圆 → path(descriptor 层没有 ellipse 件, 而这里只有一处需要它, 不值得为它加一个 kind) */
const ellipsePath = (cx: number, cy: number, rx: number, ry: number): string =>
  `M ${fmt(cx - rx)} ${fmt(cy)} A ${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(cx + rx)} ${fmt(cy)} ` +
  `A ${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(cx - rx)} ${fmt(cy)} Z`;

/** 点列(素材坐标系) → path 的直线段串; `close` 管 polygon */
function pointsPath(points: string, close: boolean, map: (x: number, y: number) => [number, number]): string {
  const nums = points.trim().split(/[\s,]+/).map(Number);
  const pairs: string[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const [x, y] = map(nums[i], nums[i + 1]);
    pairs.push(`${pairs.length ? 'L' : 'M'} ${fmt(x)} ${fmt(y)}`);
  }
  if (!pairs.length) {
    throw new ShapeInputError('iconShape', 'points', `点数不足(拿到 "${points}")`, 'polyline / polygon 至少要有两个点');
  }
  return `${pairs.join(' ')}${close ? ' Z' : ''}`;
}

/**
 * 图标 descriptor。缩放走 **contain**(取两轴较小的比例), 所以非正方形素材不会被拉变形。
 *
 * 产物是**平铺的 path / circle / rect**(见文件头 ①): 每一笔都带上了缩放后的真坐标与显式描边宽度,
 * 没有任何 transform。于是 `describeScene` 量到的、门禁扫到的、眼睛看到的, 是同一份几何。
 */
export function iconShape(p: IconProps): DGroup {
  assertFiniteRect('iconShape', p);
  if (p.strokeWidth !== undefined) assertFiniteNumber('iconShape', 'strokeWidth', p.strokeWidth);
  if (!p.asset || !Array.isArray(p.asset.prims) || !p.asset.viewBox) {
    throw new ShapeInputError('iconShape', 'asset', '不是一份素材(拿到空值 / 少了 prims / 少了 viewBox)',
      'asset 要用 `iconAsset(name)` / `iconFromSvg(text)` 的产物, 不是名字字符串');
  }
  const theme = p.theme ?? DEFAULT_THEME;
  const vb = p.asset.viewBox;
  const sw = p.strokeWidth ?? p.asset.strokeWidth; // 素材单位
  const s = Math.min(p.w / vb.w, p.h / vb.h); // contain
  const tx = p.x + (p.w - vb.w * s) / 2 - vb.x * s;
  const ty = p.y + (p.h - vb.h * s) / 2 - vb.y * s;
  const X = (v: number): number => round1(tx + v * s);
  const Y = (v: number): number => round1(ty + v * s);

  const color = p.color ?? theme.edge;
  const children: Descriptor[] = [];
  for (const prim of p.asset.prims) {
    const attrs = paintAttrs(prim.paint, color, s);
    switch (prim.kind) {
      case 'path':
        // ⚠ `path` 的 `d` 必须**逐坐标改写**(260920 被 ontology-e2e 咬出来的真事故):
        // 早先这里是 `path(prim.d, attrs)` —— 原文照搬。lucide 里 6470 处是 `<path>`, 于是图标
        // 里绝大多数笔画被画在**素材自己的 24×24 原点**上, 而门禁一声不响(图标不进净空门禁)。
        // 改写走 `icons/path-data`, 与 circle / rect 那几支**同一把尺子**(X/Y/s)。
        children.push(path(mapPathData(prim.d, { x: X, y: Y, scale: s }), attrs));
        break;
      case 'circle':
        children.push(dCircle(X(prim.cx), Y(prim.cy), round1(prim.r * s), attrs));
        break;
      case 'rect':
        children.push(dRect(X(prim.x), Y(prim.y), round1(prim.w * s), round1(prim.h * s),
          prim.rx === undefined ? undefined : round1(prim.rx * s), attrs));
        break;
      case 'ellipse':
        children.push(path(ellipsePath(X(prim.cx), Y(prim.cy), prim.rx * s, prim.ry * s), attrs));
        break;
      case 'line':
        children.push(path(`M ${fmt(X(prim.x1))} ${fmt(Y(prim.y1))} L ${fmt(X(prim.x2))} ${fmt(Y(prim.y2))}`, attrs));
        break;
      case 'polyline':
      case 'polygon':
        children.push(path(pointsPath(prim.points, prim.kind === 'polygon', (x, y) => [X(x), Y(y)]), attrs));
        break;
    }
  }
  // 缺省画法挂在外层: 七种原语里绝大多数是"只描不填 + 圆头圆角", 逐笔再写一遍就是七份重复事实
  const groupAttrs: Attrs = {
    'data-shape': 'icon',
    fill: 'none',
    stroke: color,
    'stroke-width': round1(sw * s),
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  };
  if (p.opacity !== undefined) groupAttrs.opacity = p.opacity;
  return group(children, groupAttrs);
}
