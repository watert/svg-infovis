// =====================================================================
// shapes/edge · 正交折线边 (route 结果的下游)
// 一条边的完整装配顺序是硬约束, 顺序错了就出事故:
//   normalizeRoutePoints → 端点 marker 几何 → trimPolyline(按 marker 深度内缩) → radiusPolylinePath
// 反过来(先磨圆再裁端)会让圆弧被切掉一截; 不 trim 则线头会从三角尖端露出来。
//
// **本文件只画线与端点, 不画文字**(260917 ③): 边标签一度有两条上屏路径 —— `edgeShape` 里
// 现算 `labelAnchor`, 而 audit 读的是 `SceneLabel.at`。两个来源必然漂开(实测: 竖线从
// "assemble / stream / execute" 中间穿过去, 而 `min_label_clearance=51.42` 是绿的)。
// 现在文字**只走 `edgeLabel()` 落进 `scene.labels`**, 由出口统一上屏 ——
// 审计读哪个矩形, 画的就是哪个矩形。
// =====================================================================

import { type Descriptor, group, path } from '../descriptor';
import { DEFAULT_THEME, type Theme, type Tone } from '../theme';
import { ShapeInputError, assertFiniteNumber, assertFinitePoints } from '../guard';
import {
  type EndpointMarker, type MarkerStyle, type PolylineTangent,
  endpointTrim, polylineEndpoints, radiusPolylinePath, trimPolyline,
} from '../geometry/rounded-path';
import { type Pt, dist, norm, perpL, round1, sub } from '../geometry/vec';
import { normalizeRoutePoints, polylineLength } from '../geometry/predicates';
// 行块几何(260923): 遮罩片的高不再是"字号 + 2×padY"的近似, 而是真行块并集 —— 与
// `shapes/node.ts` 的节点标签 / `export.ts` 的 `scene.texts` / `knives/fit.ts` 的 `textFit`
// 共用同一份堆法(`geometry/text-rows`), 行距口径也共用 `NODE_TEXT_LAYOUT.lineGapEm`
import { rowBlock } from '../geometry/text-rows';
import { NODE_TEXT_LAYOUT } from './node';
import { measureText } from '../knives/measure';
import type { SceneLabel } from '../knives/audit';

export type EdgeProps = {
  /** route 给出的折点列(至少 2 点) */
  points: Pt[];
  radius?: number;
  start?: MarkerStyle;
  end?: MarkerStyle;
  markerSize?: number;
  color?: string;
  width?: number;
  dash?: string;
  /**
   * 边肤色 —— **语义槽, 不是样式参数**(与 `SceneNode.tone` 同一口径): 它说的是"这条边属于
   * 哪一族"(选项路径 / 可选步骤 / 异常回流), 该跟几何一起进 scene, 见 `SceneEdge.tone`。
   * 单点样式例外(比如违规红)仍走 `color`。取色槽的选择见 `edgeShape` 的说明。
   */
  tone?: Tone;
  theme?: Theme;
};

export type EdgeGeometry = {
  /** 规范化后的折点列 */
  points: Pt[];
  /** 端点内缩后的折点列(实际画的那条) */
  trimmed: Pt[];
  d: string;
  markers: Array<EndpointMarker & { at: 'start' | 'end' }>;
  tangents: PolylineTangent[];
  length: number;
};

/**
 * 折线**中点**所在的段: 交出落点与那一小段的方向(单位向量)。
 * `labelAnchor` 与 `labelAngle` 共用它 —— "中点落在哪一段"这个走法只许有一份,
 * 两份会在"折线中点恰好在折点上"这类边界上给出不同的段, 于是标签的位置与角度对不上。
 * 退化(0 长度)时回退到最后一段的方向, 不返回 (0,0) —— 角度是 undefined 的温床。
 */
function midSegment(pts: Pt[]): { at: Pt; dir: Pt } {
  const total = polylineLength(pts);
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = dist(pts[i - 1], pts[i]);
    if (acc + seg >= total / 2) {
      const t = seg > 1e-9 ? (total / 2 - acc) / seg : 0;
      const at = { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t };
      return { at, dir: norm(sub(pts[i], pts[i - 1])) };
    }
    acc += seg;
  }
  const last = pts[pts.length - 1];
  return { at: last, dir: norm(sub(last, pts[pts.length - 2] ?? last)) };
}

/**
 * 标签锚点: 取折线长度中点的所在段, 再沿该段法线偏移 dy。
 * 只偷 Archify 的默认放置策略, 不复活 labelAt/labelDx 那套旋钮(设计稿 §6.5)。
 * **构建期**由 `edgeLabel()` 调用, 把结果烘进 `SceneLabel.at` —— 渲染期不再现算。
 */
export function labelAnchor(pts: Pt[], dy: number): Pt {
  assertFinitePoints('labelAnchor', pts);
  assertFiniteNumber('labelAnchor', 'dy', dy);
  const { at, dir } = midSegment(pts);
  if (!dy) return at;
  const n = perpL(dir);
  return { x: at.x + n.x * dy, y: at.y + n.y * dy };
}

/**
 * **标签沿线的角度**(度, 屏幕顺时针为正)—— 给 `SceneLabel.rotate` 用, 于是竖线旁的
 * "Flown By" 竖着读、斜线旁的 "Hub For" 斜着读(260920 ontology 图)。
 *
 * 归一化到 `[-90, 90)`: 角度落在下半圈就翻 180° —— **文字永远不倒着写**。
 * 竖线(±90°)一律归到 **-90°**(自下而上读), 这是排版惯例, 也顺带让"差 180° 的两条线"
 * (一条向上一条向下)得到同一个角度 —— 一对平行线的标签因此看起来是同一套排法。
 */
export function labelAngle(pts: Pt[]): number {
  assertFinitePoints('labelAngle', pts);
  const { dir } = midSegment(pts);
  if (!dir.x && !dir.y) return 0; // 退化折线(所有点重合): 没有方向可言, 不编一个角度出来
  let deg = (Math.atan2(dir.y, dir.x) * 180) / Math.PI;
  if (deg >= 90) deg -= 180;
  else if (deg < -90) deg += 180;
  return round1(deg);
}

export function edgeGeometry(p: EdgeProps): EdgeGeometry {
  assertFinitePoints('edgeGeometry', p.points, 'route 的输出本应是有限数; 手写折点时检查每个点都有 x/y(别忘展开 rect)');
  for (const k of ['radius', 'markerSize'] as const) {
    if (p[k] !== undefined) assertFiniteNumber('edgeGeometry', k, p[k]);
  }
  const pts = normalizeRoutePoints(p.points);
  const size = p.markerSize ?? 7;
  const start = p.start ?? 'none';
  const end = p.end ?? 'arrow-triangle';
  const markers = polylineEndpoints(pts, start, end, size);
  const trimmed = trimPolyline(pts, endpointTrim(start, size), endpointTrim(end, size));
  const { d, tangents } = radiusPolylinePath(trimmed, p.radius ?? 8);
  return { points: pts, trimmed, d, markers, tangents, length: polylineLength(pts) };
}

// --- 标签遮罩片的尺寸(构建期) + 落位(③ 方案 B: 写回 scene) --------------
//
// 260920 把这两件事**拆开**: 一个函数同时管"量多大"与"放哪", 于是**只要尺寸**的调用方无路可走
// —— `templates/sequence.ts` 反算列距时曾造一条 1px 的**假边**喂进 `edgeLabel` 再抠 `.width`
// (`points: [{x:0,y:0},{x:1,y:0}]`)。那是"为拿一个数先伪造一个几何对象", 缺的正是 `labelBoxSize`
// 这个入口。拆开之后两者仍是**同一个公式**算出来的 —— 各写一份必然漂, 那是本仓最贵的事故。

/** 标签遮罩片的三个样式缺省 —— **尺寸公式的系数只有这一份**(上屏与审计同吃它) */
export const LABEL_BOX_DEFAULTS = { fontSize: 11, padX: 5, padY: 4 } as const;

export type LabelBoxSizeOptions = {
  /** 字号(缺省 `LABEL_BOX_DEFAULTS.fontSize`; 与 `labelBoxShape` 的缺省同值) */
  fontSize?: number;
  /** 遮罩片左右内边距(缺省 `LABEL_BOX_DEFAULTS.padX`) */
  padX?: number;
  /** 遮罩片上下内边距(缺省 `LABEL_BOX_DEFAULTS.padY`) */
  padY?: number;
};

export type LabelBoxSize = { width: number; height: number; fontSize: number };

/**
 * 标签遮罩片的**尺寸唯一来源**: 文本度量 + 内边距 → 上屏矩形(= 审计的检测矩形)。
 * 反算类调用方(按内容顶开列距 / 排图例 / 定画布边界)只用这一个函数量宽高, 别自己拼。
 *
 * **多行(260923)**: 逐行量宽取**最宽一行**, 高取 `rowBlock` 的**行块并集** —— 与
 * `nodeShape`(节点标签) / `export.ts`(`scene.texts`) / `knives/fit.ts` 的 `textFit` 同一份口径。
 * 旧口径是"整串喂 `measureText` + 高度写死 `fontSize + 2×padY`": 单行时按 1em 给高, 而真行盒
 * 高约 1.4em ⇒ **遮罩片比字矮**(检测盒也跟着矮, 净空门禁量的是矮的那块); 多行则只按第一行算宽。
 */
export function labelBoxSize(content: string, o: LabelBoxSizeOptions = {}): LabelBoxSize {
  const fontSize = o.fontSize ?? LABEL_BOX_DEFAULTS.fontSize;
  assertFiniteNumber('labelBoxSize', 'fontSize', fontSize);
  if (o.padX !== undefined) assertFiniteNumber('labelBoxSize', 'padX', o.padX);
  if (o.padY !== undefined) assertFiniteNumber('labelBoxSize', 'padY', o.padY);
  const lines = content.split('\n');
  const perLine = lines.map((t) => measureText(t, { fontSize }));
  const contentW = Math.max(...perLine.map((r) => r.width));
  const contentH = rowBlock(lines.length, fontSize * NODE_TEXT_LAYOUT.lineGapEm, perLine.map((r) => r.height)).height;
  return {
    width: round1(contentW + 2 * (o.padX ?? LABEL_BOX_DEFAULTS.padX)),
    height: round1(contentH + 2 * (o.padY ?? LABEL_BOX_DEFAULTS.padY)),
    fontSize,
  };
}

export type EdgeLabelOptions = LabelBoxSizeOptions & {
  /** 沿折线法线的偏移(缺省 0 = 落在中点所在段上); 给了 `at` 就整个让位 */
  dy?: number;
  /**
   * **显式落位**: 给了就不走 `labelAnchor`(也不再读 `dy`)。
   * 用途: 调用方/模板已按自己的版式推导知道标签该待在哪时, 用这个 —— 而不是"先建一条
   * SceneLabel 再把 `at` 覆盖掉": 后者会先请 core 算一个马上被扔掉的落位, 且从调用点上
   * 看不出"这个标签的落位是自定义的"。
   */
  at?: Pt;
  /**
   * **沿线的角度**(度) —— 缺省不旋转。给 `labelAngle(pts)` 即"让这段文字跟着线走",
   * 竖向 / 斜向的边靠它才读得顺(见 `labelAngle` 的归一化口径)。
   */
  rotate?: number;
  /** 标签 id(缺省 `L-<edge.id>`) */
  id?: string;
};

/**
 * 边标签的**唯一入口**: 在构建期把 `labelAnchor` + 度量结果烘成一条 `SceneLabel`
 * 写进 `scene.labels`。作者侧仍是一行(便利没丢), 但位置从此是 scene 里的数据 ——
 * 渲染与审计读同一份, 不再各算一遍。
 *
 * 外层尺寸 = `labelBoxSize(content, o)`(文本度量 + 内边距), 就是上屏遮罩片的尺寸;
 * audit 的 `labelRect()` 用的也是它。
 */
export function edgeLabel(edge: { id: string; points: Pt[] }, content: string, o: EdgeLabelOptions = {}): SceneLabel {
  const size = labelBoxSize(content, o);
  let at: Pt;
  if (o.at) {
    const hint = '显式落位要的是 {x, y} 两个有限数';
    assertFiniteNumber('edgeLabel', 'at.x', o.at.x, hint);
    assertFiniteNumber('edgeLabel', 'at.y', o.at.y, hint);
    at = o.at;
  } else {
    at = labelAnchor(edge.points, o.dy ?? 0);
  }
  return {
    id: o.id ?? `L-${edge.id}`,
    at,
    width: size.width,
    height: size.height,
    ownerEdge: edge.id,
    text: content,
    fontSize: size.fontSize,
    ...(o.rotate ? { rotate: o.rotate } : {}),
  };
}

/** 端点标记 → descriptor(颜色与线一致, 空心点用画布底色填充) */
function markerDescriptor(m: EndpointMarker, color: string, theme: Theme): Descriptor | null {
  if (!m.tag) return null;
  if (m.tag === 'circle') {
    return {
      kind: 'circle', cx: m.cx!, cy: m.cy!, r: m.r!,
      attrs: { fill: m.filled ? color : theme.canvas, stroke: color, 'stroke-width': 1.5 },
    };
  }
  return { kind: 'path', d: m.d!, attrs: { fill: m.filled ? color : 'none', stroke: color, 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } };
}

/**
 * 边的取色: `color`(单点覆盖, 最高) → `tone`(语义槽) → `theme.edge`(中性线色)。
 *
 * `tone` 取的是 **outline 描边槽 `tones[tone].border`**: 与节点 outline 的描边同槽, 于是
 * "这条线是 violet 的"与"那格节点是 violet 的"在图上读起来是同一族色。缺省不给 tone 时仍走
 * `theme.edge`(主题的中性线色, **不是** slate.border) —— 所以既有产物的缺省一个字节都不变。
 *
 * 为什么这里必须认 tone(260919, "作者写了却不上屏"同族第五次): `EdgeProps` 一直有这个字段,
 * 而 `edgeShape` 只认 `color`, 于是复刻脚本里 `edgeStyles: { tone }` 是**死数据** ——
 * 作者在数据表里点了色, 产物上那条线还是灰的(`refs/build-arch-v2.ts` 的 violet 虚线边即此例)。
 */
export function edgeShape(p: EdgeProps): Descriptor {
  assertFinitePoints('edgeShape', p.points, '一条边至少要两点; 若传入的是 SceneEdge, 记得 `{ points: e.points }`');
  const theme = p.theme ?? DEFAULT_THEME;
  const color = p.color ?? (p.tone ? theme.tones[p.tone].border : theme.edge);
  const g = edgeGeometry(p);
  const children: Descriptor[] = [
    path(g.d, {
      fill: 'none', stroke: color, 'stroke-width': p.width ?? 1.5,
      'stroke-dasharray': p.dash, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    }),
  ];
  for (const m of g.markers) {
    const d = markerDescriptor(m, color, theme);
    if (d) children.push(d);
  }
  return group(children, { 'data-shape': 'edge' });
}

// --- 成对连线(双线) -----------------------------------------------------
//
// 关系图里常见"同一对实体上的两条关系"(Departed From / Arrived To 这类): 版式上是两条相距
// 十几像素的**平行线**, 每条各带自己的箭头与沿线标签。
//
// **它是组合, 不是第二份实现** —— 两条线各自完全走 `edgeShape`: 端点 marker 几何 / 按 marker
// 深度内缩折线 / 圆角 / 取色 / 样式覆盖, 一个字都没重写。为什么要一个具名入口而不是让调用方
// 自己 `[edgeShape(a), edgeShape(b)]`: ① 成对需要**共同的组属性**(同色 / 同粗细 / 同虚线),
// 否则"两条线是一对"这件事只能靠读者猜 ② 它是 `routePair` + `pairLabels` 那条链上的中间一环,
// 三个名字凑成一套可检索的词汇。真要写第二份线段实现时会发现无一处可抄 —— 因为本来就不需要。

export type EdgePairProps = {
  /** 两条线的完整描边参数, 顺序即 [0, 1](与 `routePair().points` / `pairLabels` 的文本顺序一致) */
  lines: readonly [EdgeProps, EdgeProps];
  /** 两条线**共享**的组属性(色调 / 粗细 / 虚线)。逐线的同名字段仍然赢 —— 覆盖表永远最高 */
  tone?: Tone;
  color?: string;
  width?: number;
  dash?: string;
  theme?: Theme;
};

/**
 * 成对连线的 descriptor: 一个组, 两条线。
 * 共享字段填进每一条(**显式给的那条仍赢**), 组上只挂 `data-shape` 供产物对账。
 */
export function edgePairShape(p: EdgePairProps): Descriptor {
  if (!Array.isArray(p.lines) || p.lines.length !== 2) {
    throw new ShapeInputError('edgePairShape', 'lines', `要恰好两条线(拿到 ${Array.isArray(p.lines) ? p.lines.length : typeof p.lines})`,
      '成对连线的定义就是两条 —— 三条以上请用 `assignLanes` 摊开端口, 那才是它的解法');
  }
  const shared = { tone: p.tone, color: p.color, width: p.width, dash: p.dash, theme: p.theme };
  const one = (l: EdgeProps): EdgeProps => ({
    ...shared, ...l,
    tone: l.tone ?? p.tone,
    color: l.color ?? p.color,
    width: l.width ?? p.width,
    dash: l.dash ?? p.dash,
    theme: l.theme ?? p.theme,
  });
  return group(p.lines.map(one).map(edgeShape), { 'data-shape': 'edge-pair' });
}
