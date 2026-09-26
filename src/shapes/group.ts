// =====================================================================
// shapes/group · 分组虚线框
// 框体本身是圆角矩形(复用 node 的几何解算), 标签默认贴框内左上 —— 与 Archify 一致的观感。
// 注意: group 只画框, 不含任何"框住谁"的判断 —— 归属是决策, 活在 HTML 里(设计稿 §4.1)。
// =====================================================================

import { type Descriptor, baselineY, group, path, text } from '../descriptor.js';
import { DEFAULT_THEME, type Theme, type Tone, groupToneStyle } from '../theme.js';
import { assertFiniteNumber, assertFiniteRect } from '../guard.js';
import { radiusPolygonPath } from '../geometry/rounded-path.js';
import type { Pt, Rect } from '../geometry/vec.js';
import { measureText } from '../knives/measure.js';

export type GroupProps = {
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  radius?: number;
  /** 色调(默认 slate) */
  tone?: Tone;
  theme?: Theme;
  stroke?: string;
  fill?: string;
  dash?: string;
  strokeWidth?: number;
  fontSize?: number;
  /** 标签字重(缺省 600 粗体)。调它会同步影响 `groupLabelRect` 的宽度估算 */
  labelWeight?: number;
  /** 标签色(缺省走 group 的 tone 文字色) */
  labelFill?: string;
  /**
   * 标签位置:
   *  - `inner`(缺省): 框内左上 —— Archify 的观感
   *  - `outer`: 框**上方外侧** —— 组内已经被折线占满时用它, 标题不再与线抢空间
   *    (260917 实测: 架构图的 core 组框标题被折线穿字, 根因就是 inner 标题与组内主杆抢道)
   */
  labelPlacement?: GroupLabelPlacement;
  /**
   * 标签位移(相对**框左上角**), 两种 placement 共用同一语义, 只是缺省不同(inner [14,18] / outer [0,-12])。
   * 传了就整体覆盖缺省 —— 别在调用方各写一份默认值。
   */
  labelInset?: [number, number];
};

/** 标签位置: 框内左上 / 框上方外侧 */
export type GroupLabelPlacement = 'inner' | 'outer';

/** 两种 placement 的缺省位移(相对框左上角)。outer 取 -12: 字底距框顶 ~2.4px, 不压框线 */
const DEFAULT_LABEL_INSET: Record<GroupLabelPlacement, [number, number]> = {
  inner: [14, 18],
  outer: [0, -12],
};

/**
 * 标签锚点(文本基线左端)。`groupShape` 与 `groupLabelRect` **共用**这一个函数 ——
 * 摆放与审计必须同一套坐标, 各写一份默认值迟早会静静漂开。
 */
function labelAnchor(p: GroupProps): { x: number; baseline: number } | null {
  if (!p.label) return null;
  const fs = p.fontSize ?? 12;
  const place = p.labelPlacement ?? 'inner';
  const [ix, iy] = p.labelInset ?? DEFAULT_LABEL_INSET[place];
  assertFiniteNumber('labelAnchor', 'labelInset[0]', ix);
  assertFiniteNumber('labelAnchor', 'labelInset[1]', iy);
  return { x: p.x + ix, baseline: baselineY(p.y + iy, fs, 'central') };
}

/**
 * 分组框标签的包围盒 —— 与 `groupShape` 同源(同一个 labelAnchor)。
 * 存在的理由: 组框标题在 scene 里原本只是个字符串(null 位置), 于是 audit 看不见它 ——
 * 260917 实测: 折线从组框标题身上穿过去, 全部门禁照样 pass。
 */
export function groupLabelRect(p: GroupProps): Rect | null {
  assertFiniteRect('groupLabelRect', p);
  if (p.fontSize !== undefined) assertFiniteNumber('groupLabelRect', 'fontSize', p.fontSize);
  const a = labelAnchor(p);
  if (!a || !p.label) return null;
  const fs = p.fontSize ?? 12;
  // label 缺省 600 粗体 —— weight 不同宽度不同, 所以 measure 必须跟渲染用同一个值
  const m = measureText(p.label, { fontSize: fs, weight: p.labelWeight ?? 600 });
  return { x: a.x, y: a.baseline - fs * 0.8, w: m.width, h: fs * 1.25 };
}

export function groupShape(p: GroupProps): Descriptor {
  assertFiniteRect('groupShape', p);
  if (p.fontSize !== undefined) assertFiniteNumber('groupShape', 'fontSize', p.fontSize);
  const theme = p.theme ?? DEFAULT_THEME;
  const st = groupToneStyle(theme, p.tone);
  const r = p.radius ?? 14;
  const pts: Pt[] = [
    { x: p.x, y: p.y }, { x: p.x + p.w, y: p.y },
    { x: p.x + p.w, y: p.y + p.h }, { x: p.x, y: p.y + p.h },
  ];
  const { d } = radiusPolygonPath(pts, r);
  const children: Descriptor[] = [
    path(d, {
      fill: p.fill ?? 'none',
      stroke: p.stroke ?? st.stroke,
      'stroke-width': p.strokeWidth ?? 1.5,
      'stroke-dasharray': p.dash ?? '6 5',
    }),
  ];
  const a = labelAnchor(p);
  if (a && p.label) {
    const fs = p.fontSize ?? 12;
    children.push(text(a.x, a.baseline, p.label, {
      'font-size': fs,
      'font-weight': p.labelWeight ?? 600,
      fill: p.labelFill ?? st.text,
      'font-family': 'inherit',
    }));
  }
  return group(children, { 'data-shape': 'group' });
}
