// =====================================================================
// icons/svg-parse · SVG 素材 → 可渲染原语(纯函数, 零依赖)
//
// 目的: 让"图标能进 scene"。scene 必须是**纯数据**(可 JSON / 可逐字节 diff), 所以素材在
// 构建期就被解析成一份原语表, 渲染面只认这份表 —— 渲染路径上**不读盘、不解析 SVG**。
// (`SceneNode.icon` 里躺的就是 `ParsedIcon`, 见 `shapes/icon.ts`。)
//
// 覆盖面是**照实量出来的**, 不是猜的(260920 实测 1853 个 lucide 图标):
//   元素只用到 path(6470) / circle(563) / rect(408) / line(135) / ellipse(16) /
//   polyline(3) / polygon(2) —— **零 `<g>`、零 `transform`**; 属性只有几何 + 20 处 `fill`。
// 于是解析器**故意写窄**:
//   · 只认那七种元素 + `fill` / `stroke` / `stroke-width` 三种画法覆盖
//   · 见到 `<g>` / `transform` / 别的不认识的元素 → **当场抛**, 并说清"怎么改"。
//     为什么不能静默跳过: 跳过等于画出一个**少了几笔的图标**, 而图上没人看得出一根线丢了
//     (与"NaN 静默丢元素"同族的事故)。宁可抛。
//   · 想吃更花的 SVG 就预先把 `<g transform>` 用 Inkscape / `svgo --pretty` 拍平成普通路径再进来。
//
// 定位: 纯解析, 零依赖(只 import guard 与 vec 的类型)。
// =====================================================================

import { type Rect, round1 } from '../geometry/vec.js';
import { ShapeInputError } from '../guard.js';

/** 七种原语 —— 与 SVG 的几何元素一一对应, 不做合并(合并要写圆弧换算, 而收益只是产物短一点) */
export const ICON_PRIM_KINDS = ['path', 'circle', 'rect', 'ellipse', 'line', 'polyline', 'polygon'] as const;
export type IconPrimKind = (typeof ICON_PRIM_KINDS)[number];

/** 逐元素的画法覆盖(素材里 `fill="currentColor"` 那 20 处就靠它) */
export type IconPaint = {
  /** `currentColor` = 跟随 `iconShape` 给的颜色; 其它值原样写进产物 */
  fill?: string;
  stroke?: string;
  /** **原坐标系单位**(与 lucide 的 2 同口径), 不是渲染后的像素 */
  strokeWidth?: number;
};

export type IconPrim =
  | { kind: 'path'; d: string; paint?: IconPaint }
  | { kind: 'circle'; cx: number; cy: number; r: number; paint?: IconPaint }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; rx?: number; ry?: number; paint?: IconPaint }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; paint?: IconPaint }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; paint?: IconPaint }
  | { kind: 'polyline'; points: string; paint?: IconPaint }
  | { kind: 'polygon'; points: string; paint?: IconPaint };

/** 解析产物 —— **进 scene 的就是它**(纯数据) */
export type ParsedIcon = {
  /** 素材名(缺省 = 文件名去掉扩展名); 只作对账与报错用, 不参与渲染 */
  name?: string;
  /** 素材自己的坐标系(lucide 恒为 `0 0 24 24`) */
  viewBox: Rect;
  /** 默认描边宽度(**viewBox 单位**): `iconShape` 不传 `strokeWidth` 时用它 */
  strokeWidth: number;
  prims: IconPrim[];
};

const DEFAULT_VIEWBOX: Rect = { x: 0, y: 0, w: 24, h: 24 };
const DEFAULT_STROKE_WIDTH = 2;

const fail = (field: string, reason: string, hint?: string): never => {
  throw new ShapeInputError('parseIconSvg', field, reason, hint, '素材字段');
};

/** `name="v"` / `name='v'` —— 值必须带引号(不带引号在真实 SVG 里合法, 但那是自找的歧义) */
function parseAttrs(raw: string, where: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z_][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) out[m[1]] = m[3] ?? m[4] ?? '';
  const bare = raw.replace(re, '').replace(/[\s/]+/g, '');
  if (bare) {
    fail(where, `有不能解析的属性片段 "${bare}"`,
      '只认 `name="value"` 这种带引号的写法; 不带引号的属性会让坐标读错值');
  }
  return out;
}

const num = (attrs: Record<string, string>, key: string, where: string, fallback?: number): number => {
  const raw = attrs[key];
  if (raw === undefined) {
    if (fallback !== undefined) return fallback;
    return fail(`${where}.${key}`, '缺失', `素材里这个元素没有 ${key}, 几何上推不出来`);
  }
  const v = Number(raw);
  if (!Number.isFinite(v)) return fail(`${where}.${key}`, `不是有限数(拿到 "${raw}")`);
  return v;
};

const optNum = (attrs: Record<string, string>, key: string, where: string): number | undefined => {
  const raw = attrs[key];
  if (raw === undefined) return undefined;
  const v = Number(raw);
  if (!Number.isFinite(v)) return fail(`${where}.${key}`, `不是有限数(拿到 "${raw}")`);
  return v;
};

/** 三种画法覆盖里, 只有真写了的那几位才进 `paint`(写了几个就是几个, 不铺缺省) */
function paintOf(attrs: Record<string, string>): IconPaint | undefined {
  const paint: IconPaint = {};
  if (attrs.fill !== undefined) paint.fill = attrs.fill;
  if (attrs.stroke !== undefined) paint.stroke = attrs.stroke;
  if (attrs['stroke-width'] !== undefined) paint.strokeWidth = Number(attrs['stroke-width']);
  return Object.keys(paint).length ? paint : undefined;
}

/** 元素上**不许出现**的属性: 出现即抛(它们是"画得不对却说不出哪里不对"的来源) */
const FORBIDDEN_ATTRS = ['transform', 'style', 'class', 'opacity', 'mask', 'clip-path', 'filter'];

function primOf(tag: string, attrs: Record<string, string>, where: string): IconPrim {
  for (const bad of FORBIDDEN_ATTRS) {
    if (attrs[bad] !== undefined) {
      fail(`${where}.${bad}`, `素材里带了 ${bad}="..."`,
        bad === 'transform'
          ? '解析器不做坐标变换 —— 预先把变换烘进坐标(或 `svgo --pretty` 拍平)再喂进来, 否则图标会画歪而没人看得出'
          : `把这一位的作用手工画进几何里再进来; 渲染面只认显式的坐标与颜色`);
    }
  }
  const paint = paintOf(attrs);
  switch (tag) {
    case 'path':
      return { kind: 'path', d: attrs.d ?? fail(`${where}.d`, '缺失', 'path 没有 d 就是一根画不出来的线'), paint };
    case 'circle':
      return { kind: 'circle', cx: num(attrs, 'cx', where), cy: num(attrs, 'cy', where), r: num(attrs, 'r', where), paint };
    case 'rect':
      return {
        kind: 'rect', x: num(attrs, 'x', where, 0), y: num(attrs, 'y', where, 0),
        w: num(attrs, 'width', where), h: num(attrs, 'height', where),
        rx: optNum(attrs, 'rx', where), ry: optNum(attrs, 'ry', where), paint,
      };
    case 'ellipse':
      return { kind: 'ellipse', cx: num(attrs, 'cx', where), cy: num(attrs, 'cy', where), rx: num(attrs, 'rx', where), ry: num(attrs, 'ry', where), paint };
    case 'line':
      return { kind: 'line', x1: num(attrs, 'x1', where), y1: num(attrs, 'y1', where), x2: num(attrs, 'x2', where), y2: num(attrs, 'y2', where), paint };
    case 'polyline':
    case 'polygon':
      return { kind: tag, points: attrs.points ?? fail(`${where}.points`, '缺失', `${tag} 没有 points 就没有形状`), paint };
    default:
      return fail(where, `不认识的元素 <${tag}>`,
        `只认 ${ICON_PRIM_KINDS.join(' / ')}; <g> / <use> / <text> 这类要先把结构拍平成普通路径`);
  }
}

export type ParseIconOptions = {
  /** 素材名(只进 `ParsedIcon.name`, 供报错与对账) */
  name?: string;
  /** viewBox 缺省(素材没写 viewBox 时用) */
  fallbackViewBox?: Rect;
};

/**
 * SVG 文本 → `ParsedIcon`。接受完整文档 / 只有一个 `<svg>` 的片段 / lucide 那种带换行缩进的原文。
 *
 * 只扫元素与属性, **不建 DOM** —— 本仓零运行时依赖, 且素材面是已知的窄面(见文件头)。
 * 任何"看不懂的东西"都抛错并指出怎么改, 不留静默降级的余地。
 */
export function parseIconSvg(svg: string, opts: ParseIconOptions = {}): ParsedIcon {
  const src = String(svg ?? '');
  const root = /<svg\b([^>]*)>/i.exec(src);
  if (!root) fail('svg', '找不到 <svg> 根元素', '给进来的是不是一段 SVG 片段?');
  const rootAttrs = parseAttrs(root![1], 'svg');

  // viewBox 优先; 没写则退回 width/height(仍是"素材自己的坐标系"), 再没写才用缺省
  let viewBox: Rect = opts.fallbackViewBox ?? DEFAULT_VIEWBOX;
  if (rootAttrs.viewBox) {
    const parts = rootAttrs.viewBox.trim().split(/[\s,]+/).map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
      fail('svg.viewBox', `不是四个数(拿到 "${rootAttrs.viewBox}")`);
    }
    viewBox = { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
  } else {
    const w = Number(rootAttrs.width);
    const h = Number(rootAttrs.height);
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) viewBox = { x: 0, y: 0, w, h };
  }
  if (!(viewBox.w > 0) || !(viewBox.h > 0)) {
    fail('svg.viewBox', `宽高必须为正(拿到 ${viewBox.w}×${viewBox.h})`, '坐标系没有面积就没法把图标缩进目标矩形');
  }

  const strokeWidth = Number(rootAttrs['stroke-width']);

  const body = src.slice(src.indexOf('>', src.indexOf('<svg')) + 1).replace(/<\/svg>[\s\S]*$/i, '');
  const prims: IconPrim[] = [];
  const re = /<\s*([a-zA-Z][\w:-]*)([^>]*?)\/?\s*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const tag = m[1].toLowerCase();
    if (tag.startsWith('/')) continue;
    prims.push(primOf(tag, parseAttrs(m[2], tag), `${tag}[${prims.length}]`));
  }
  if (!prims.length) {
    fail('svg', '一个几何元素都没有',
      '空素材画出来是空气, 而 audit 不会报(它只看 scene 里声明的矩形)—— 这种失败必须在入口挡住');
  }

  return {
    ...(opts.name === undefined ? {} : { name: opts.name }),
    viewBox: { x: round1(viewBox.x), y: round1(viewBox.y), w: round1(viewBox.w), h: round1(viewBox.h) },
    strokeWidth: Number.isFinite(strokeWidth) ? strokeWidth : DEFAULT_STROKE_WIDTH,
    prims,
  };
}

/** 素材里所有原语的包围盒(viewBox 坐标系) —— 用于对账"这个图标是不是撑满自己的框" */
export function primsBounds(prims: readonly IconPrim[]): Rect | null {
  // 只对 path 之外的原语算(box 可数); path 的 d 要真解析才知道边界, 那个活不在这
  const xs: number[] = [];
  const ys: number[] = [];
  for (const p of prims) {
    if (p.kind === 'circle') { xs.push(p.cx - p.r, p.cx + p.r); ys.push(p.cy - p.r, p.cy + p.r); }
    else if (p.kind === 'rect') { xs.push(p.x, p.x + p.w); ys.push(p.y, p.y + p.h); }
    else if (p.kind === 'ellipse') { xs.push(p.cx - p.rx, p.cx + p.rx); ys.push(p.cy - p.ry, p.cy + p.ry); }
    else if (p.kind === 'line') { xs.push(p.x1, p.x2); ys.push(p.y1, p.y2); }
    else if (p.kind === 'polyline' || p.kind === 'polygon') {
      const nums = p.points.trim().split(/[\s,]+/).map(Number);
      for (let i = 0; i + 1 < nums.length; i += 2) { xs.push(nums[i]); ys.push(nums[i + 1]); }
    }
  }
  if (!xs.length) return null;
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x: round1(x), y: round1(y), w: round1(Math.max(...xs) - x), h: round1(Math.max(...ys) - y) };
}
