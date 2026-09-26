// =====================================================================
// predicates · 几何谓词集 (纯数学, 零依赖)
// audit 与 route 共用的地基: 相交 / 净空 / 重叠 / 折点规范化 / 交叉计数。
//
// 与 Archify 对账后的三条硬规矩 —— 它们的**活文档是那两个测试**(断言即定义, 别去别处找文档):
//   test/predicate-spec.test.ts · test/predicates-parity.test.ts
//   ① 非法输入不许静默变成 0 或 NaN —— 全部走 null / false, 让门禁能"不知道"而不是"通过"
//   ② gap 是带符号量: >0 放宽(间距检查), <0 收紧(容差); 不用布尔 touch 糊
//   ③ 折点规范化必须保回折(dot<0), 否则折线长度会静默缩水
//
// ⚠ 调用方必读: 返回 null 的谓词(clearance / distance / 投影类)在**裸比较下会被当成 0** ——
//   `null < 4` 是 true (ToNumber(null) === 0), 只有 `null === null` 是可靠判据。
//   门禁与 UI 必须写成 `d === null ? 'unknown' : (d < threshold ? 'fail' : 'pass')`,
//   否则"不知道"会被当成"净空 0"(或相反)静默判决。
// =====================================================================

import { type Pt, type Rect, cross, dist, dot, rectBottom, rectRight, sub } from './vec.js';

const EPS = 1e-9;
/** 正交判定容差(px): 与 Archify 的 0.01 对齐 —— 视觉上贴线的微斜都算不正交 */
export const ORTHO_EPS = 0.01;

// --- 有限性守卫(任何几何谓词的第一道闸) --------------------------------

export const isFinitePoint = (p: Pt): boolean => Number.isFinite(p.x) && Number.isFinite(p.y);
export const isFiniteRect = (r: Rect): boolean =>
  Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.w) && Number.isFinite(r.h);
export const isFinitePoints = (pts: Pt[]): boolean => pts.every(isFinitePoint);

// --- 朝向与线段 --------------------------------------------------------

/** 三点朝向 (y-down): >0 顺时针, <0 逆时针, ≈0 共线。只用于同号判定, 绝对值无意义 */
export function orient(a: Pt, b: Pt, c: Pt): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/** p 是否落在线段 ab 的包围盒内(前置: 已知共线) */
function onSegment(a: Pt, b: Pt, p: Pt): boolean {
  return (
    Math.min(a.x, b.x) - EPS <= p.x && p.x <= Math.max(a.x, b.x) + EPS &&
    Math.min(a.y, b.y) - EPS <= p.y && p.y <= Math.max(a.y, b.y) + EPS
  );
}

/** 线段相交(含共线重叠与端点相触) */
export function segmentsIntersect(a1: Pt, a2: Pt, b1: Pt, b2: Pt): boolean {
  if (!isFinitePoint(a1) || !isFinitePoint(a2) || !isFinitePoint(b1) || !isFinitePoint(b2)) return false;
  const d1 = orient(b1, b2, a1);
  const d2 = orient(b1, b2, a2);
  const d3 = orient(a1, a2, b1);
  const d4 = orient(a1, a2, b2);
  if (((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS))) return true;
  if (Math.abs(d1) <= EPS && onSegment(b1, b2, a1)) return true;
  if (Math.abs(d2) <= EPS && onSegment(b1, b2, a2)) return true;
  if (Math.abs(d3) <= EPS && onSegment(a1, a2, b1)) return true;
  if (Math.abs(d4) <= EPS && onSegment(a1, a2, b2)) return true;
  return false;
}

/** 严格相交: 交点落在两条线段内部(端点相触不算) —— "T 触"与"真穿越"要能分开 */
export function properSegmentIntersection(a1: Pt, a2: Pt, b1: Pt, b2: Pt): boolean {
  if (!isFinitePoint(a1) || !isFinitePoint(a2) || !isFinitePoint(b1) || !isFinitePoint(b2)) return false;
  const d1 = orient(b1, b2, a1);
  const d2 = orient(b1, b2, a2);
  const d3 = orient(a1, a2, b1);
  const d4 = orient(a1, a2, b2);
  return ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS));
}

/** 点到线段的距离; 非法输入返回 null(不知道 ≠ 距离 0 —— 与 `segmentDistance` 同一口径) */
export function pointSegmentDistance(p: Pt, a: Pt, b: Pt): number | null {
  if (!isFinitePoint(p) || !isFinitePoint(a) || !isFinitePoint(b)) return null;
  const ab = sub(b, a);
  const l2 = ab.x * ab.x + ab.y * ab.y;
  if (l2 < EPS) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / l2));
  return Math.hypot(p.x - (a.x + ab.x * t), p.y - (a.y + ab.y * t));
}

/** 两条线段的最短距离(相交为 0); 非法输入返回 null */
export function segmentDistance(a1: Pt, a2: Pt, b1: Pt, b2: Pt): number | null {
  if (!isFinitePoint(a1) || !isFinitePoint(a2) || !isFinitePoint(b1) || !isFinitePoint(b2)) return null;
  if (segmentsIntersect(a1, a2, b1, b2)) return 0;
  const d1 = pointSegmentDistance(a1, b1, b2);
  const d2 = pointSegmentDistance(a2, b1, b2);
  const d3 = pointSegmentDistance(b1, a1, a2);
  const d4 = pointSegmentDistance(b2, a1, a2);
  if (d1 === null || d2 === null || d3 === null || d4 === null) return null; // 上游守卫已保证有限, 这里只让 null 不潜伏成比较基准
  return Math.min(d1, d2, d3, d4);
}

// --- 正交性(R10: 别用 atan2 量化判正交, 那是恒真式) ---------------------

/** 线段是否正交(水平或垂直); eps 默认 0.01px */
export const isOrthogonalSegment = (a: Pt, b: Pt, eps = ORTHO_EPS): boolean =>
  isFinitePoint(a) && isFinitePoint(b) && (Math.abs(a.x - b.x) <= eps || Math.abs(a.y - b.y) <= eps);

/** 正交偏离量 = min(|dx|, |dy|): 0 表示严格正交, 越小越接近; 供门禁报"差了多少" */
export const orthogonalDeviation = (a: Pt, b: Pt): number => Math.min(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** 折点列是否全程正交(折线列, 不含圆弧 —— 圆弧只活在 path 串里) */
export function isOrthogonalPolyline(pts: Pt[], eps = ORTHO_EPS): boolean {
  for (let i = 1; i < pts.length; i++) if (!isOrthogonalSegment(pts[i - 1], pts[i], eps)) return false;
  return true;
}

/**
 * 第一个"原地折回"的折点下标(相邻两段反向), 无则 -1。
 *
 * 反向段意味着**折线叠在自己身上**: 它有限、正交、能过任何"合法"校验, 却明显是坏几何。
 * 260917 手排实测: `route` 会吐出这种折点列(两个 stub 互穿 / 端口法线与目标方向相反),
 * 而当时七项门禁一条都看不见它 —— 所以这个谓词同时供 route 挑拐法与 audit 判违例。
 */
export function firstBacktrackIndex(pts: readonly Pt[]): number {
  for (let i = 1; i < pts.length - 1; i++) {
    const x1 = pts[i].x - pts[i - 1].x, y1 = pts[i].y - pts[i - 1].y;
    const x2 = pts[i + 1].x - pts[i].x, y2 = pts[i + 1].y - pts[i].y;
    if (Math.hypot(x1, y1) < 1e-9 || Math.hypot(x2, y2) < 1e-9) continue; // 零长段归 normalizeRoutePoints 管
    if (x1 * x2 + y1 * y2 < -1e-9) return i;
  }
  return -1;
}

/** 折线是否原地折回(自重叠) */
export const isBacktrackingPolyline = (pts: readonly Pt[]): boolean => firstBacktrackIndex(pts) >= 0;

/**
 * 第一个"与**非相邻**段同轴反向、且投影区间重叠"的**段号**(段 k = `pts[k]` → `pts[k+1]`), 无则 -1。
 *
 * 为什么单开一个谓词而不是扩 `firstBacktrackIndex`: 那个只看**相邻**两段, 于是"首段与末段反向叠"
 * 这类隔段自重叠谁都不管(`no_backtrack` 两档的判定权分别落在这两个谓词上)。
 * 两者**不能合并**: `route` 拿 `firstBacktrackIndex` 挑拐法(只有相邻回折它拗得回来),
 * 把隔段也塞进它的语义里, 等于让"挑拐法"去处理它改不动的情形。
 *
 * ⚠ 复现口径 (260918 订正 —— 别把它读成"route 现场就吐这个"): route 在两根 stub 对顶时吐的是
 * **相邻**回折(`200,225 → 182,225 → 438,225 → 420,225`, 折点 1 处原路折回), `no_backtrack` 的
 * adjacent 档**本来就抓得住** —— 那个洞在 route 的候选集(已补横腰线候选), 不在门禁。
 * 本条补的是**结构性**盲区: 隔段自重叠谁都不管, 手写折点列尤其容易踩(route 侧 80k 组扫描命中 0)。
 *
 * 口径:
 *   · 同轴 + 投影重叠交给 `sameAxisOverlapLength`(轴容差 `eps`, 默认 0.5px —— 与 `segmentAxis` 同源)
 *   · 反向只认点积 < -1e-9, 与 `firstBacktrackIndex` 同口径
 *   · 重叠必须 **> eps** 才算: 亚半像素的擦边是轴容差噪声, 与"线画了两遍"不是一回事
 *   · 索引是**段号**而非点号(与 `firstBacktrackIndex` 的返回值差一档, 别串)
 *   · 零长段与非有限段一律跳过(前者归 `normalizeRoutePoints`, 后者归 `finite_svg` 门禁喊疼)
 */
export function selfOverlapIndex(pts: readonly Pt[], eps = 0.5): number {
  for (let i = 0; i + 1 < pts.length; i++) {
    const ax = pts[i + 1].x - pts[i].x, ay = pts[i + 1].y - pts[i].y;
    if (!Number.isFinite(ax) || !Number.isFinite(ay) || Math.hypot(ax, ay) < 1e-9) continue;
    for (let j = i + 2; j + 1 < pts.length; j++) {
      const bx = pts[j + 1].x - pts[j].x, by = pts[j + 1].y - pts[j].y;
      if (!Number.isFinite(bx) || !Number.isFinite(by) || Math.hypot(bx, by) < 1e-9) continue;
      if (ax * bx + ay * by >= -1e-9) continue; // 同向 / 正交: 不是"叠回去", 交给别的谓词
      if (sameAxisOverlapLength(pts[i], pts[i + 1], pts[j], pts[j + 1], eps) > eps) return i;
    }
  }
  return -1;
}

// --- 矩形 -------------------------------------------------------------

export const rectEdges = (r: Rect): Array<[Pt, Pt]> => {
  const p1 = { x: r.x, y: r.y };
  const p2 = { x: rectRight(r), y: r.y };
  const p3 = { x: rectRight(r), y: rectBottom(r) };
  const p4 = { x: r.x, y: rectBottom(r) };
  return [[p1, p2], [p2, p3], [p3, p4], [p4, p1]];
};

/** 点是否在矩形内; gap > 0 时矩形膨胀(净空检查), gap < 0 时收缩(容差) */
export function pointInRect(p: Pt, r: Rect, gap = 0): boolean {
  if (!isFinitePoint(p) || !isFiniteRect(r)) return false;
  return p.x >= r.x - gap && p.x <= rectRight(r) + gap && p.y >= r.y - gap && p.y <= rectBottom(r) + gap;
}

/** 点到矩形的最短距离(内部为 0); 非法输入返回 null */
export function pointRectDistance(p: Pt, r: Rect): number | null {
  if (!isFinitePoint(p) || !isFiniteRect(r)) return null;
  if (pointInRect(p, r)) return 0;
  const cx = Math.max(r.x, Math.min(p.x, rectRight(r)));
  const cy = Math.max(r.y, Math.min(p.y, rectBottom(r)));
  return Math.hypot(p.x - cx, p.y - cy);
}

/**
 * 两矩形是否重叠(带符号 gap)。
 * gap > 0: 间距小于 gap 也算重叠(Archify 用 +8 做"贴太近");
 * gap < 0: 需要真重叠超过 |gap| 才算(Archify 用 -2 做容差);
 * 非法输入返回 false(不知道 ≠ 通过, 由 finite 门禁另行抓)。
 */
export function rectsOverlap(a: Rect, b: Rect, gap = 0): boolean {
  if (!isFiniteRect(a) || !isFiniteRect(b)) return false;
  return a.x < rectRight(b) + gap && b.x < rectRight(a) + gap && a.y < rectBottom(b) + gap && b.y < rectBottom(a) + gap;
}

/** 线段与矩形是否相交; gap 膨胀矩形(legend 的 2px halo / 边穿节点的 clearance 都靠它) */
export function segmentIntersectsRect(a: Pt, b: Pt, r: Rect, gap = 0): boolean {
  if (!isFinitePoint(a) || !isFinitePoint(b) || !isFiniteRect(r)) return false;
  const grown: Rect = { x: r.x - gap, y: r.y - gap, w: r.w + gap * 2, h: r.h + gap * 2 };
  if (pointInRect(a, grown) || pointInRect(b, grown)) return true;
  return rectEdges(grown).some(([e1, e2]) => segmentsIntersect(a, b, e1, e2));
}

/** 线段到矩形的最小净空: 0 = 相交/相触; 非法输入返回 null(不许变 NaN 被 Math.min 吞掉) */
export function segmentRectClearance(a: Pt, b: Pt, r: Rect): number | null {
  if (!isFinitePoint(a) || !isFinitePoint(b) || !isFiniteRect(r)) return null;
  if (segmentIntersectsRect(a, b, r)) return 0;
  const da = pointRectDistance(a, r);
  const db = pointRectDistance(b, r);
  if (da === null || db === null) return null; // 守卫已保证有限, 这里只是不让 null 潜伏成 0
  let best = Math.min(da, db);
  for (const [e1, e2] of rectEdges(r)) {
    const d = segmentDistance(a, b, e1, e2);
    if (d !== null) best = Math.min(best, d);
  }
  return best;
}

/**
 * 线段与矩形(**闭包**)的相交长度(evidence 用: 说清"穿了多少 px", 不只是"穿了")
 *
 * ⚠️ 端点必须自己进候选(`t=0` / `t=1`) —— 只拿轴线交点当候选时, **端点在盒内的段恒返 0**:
 * 折线只要在盒内拐个弯, 进入段与离开段各自只剩一个候选点、双段皆 0, 于是整条边穿盒而门禁全绿
 * (260918 挖出的假阴性; 整段落在盒内同理)。
 */
export function segmentRectIntersectionLength(a: Pt, b: Pt, r: Rect): number | null {
  if (!isFinitePoint(a) || !isFinitePoint(b) || !isFiniteRect(r)) return null;
  const ab = sub(b, a);
  const L = Math.hypot(ab.x, ab.y);
  if (L < EPS) return 0; // 零长线段: 点在矩形内也只是个点, 相交长度恒为 0(合法退化, 不是"不知道")
  // 参数化求线段在矩形内(含边界)的区间 —— 线段与矩形都凸, 交集必是单区间, 取 min/max 即可
  const ts: number[] = [];
  const push = (t: number) => { if (t >= -EPS && t <= 1 + EPS) ts.push(Math.max(0, Math.min(1, t))); };
  const axis = (origin: number, d: number, lo: number, hi: number) => {
    if (Math.abs(d) < EPS) return;
    push((lo - origin) / d);
    push((hi - origin) / d);
  };
  axis(a.x, ab.x, r.x, rectRight(r));
  axis(a.y, ab.y, r.y, rectBottom(r));
  if (pointInRect(a, r)) push(0); // 端点在盒内: 交集的这一端是线段自身, 不是与边界的交点
  if (pointInRect(b, r)) push(1);
  const inside = ts.filter((t) => pointInRect({ x: a.x + ab.x * t, y: a.y + ab.y * t }, r)).sort((p, q) => p - q);
  if (!inside.length) return 0;
  return (inside[inside.length - 1] - inside[0]) * L;
}

// --- 折线 -------------------------------------------------------------

/**
 * 折点列规范化: 剔非有限点 → 去零长段 → 去"同向共线"的中间点, 保序。
 *
 * 两个坑(与 Archify 对账得来):
 *   ① NaN/Infinity 必须先剔, 否则污染后续所有谓词(而且 NaN 比较恒 false 会让门禁静默通过)
 *   ② 只吃"同向共线"(dot>0) —— 回折点(dot<0, 走一段又退回来)必须保留, 否则折线长度静默缩水
 */
export function normalizeRoutePoints(pts: Pt[], eps = 0.01): Pt[] {
  const finite = pts.filter(isFinitePoint);
  const out: Pt[] = [];
  for (const p of finite) {
    const last = out[out.length - 1];
    if (last && Math.abs(p.x - last.x) <= eps && Math.abs(p.y - last.y) <= eps) continue;
    out.push({ x: p.x, y: p.y });
  }
  if (out.length < 3) return out;
  const res: Pt[] = [out[0]];
  for (let i = 1; i < out.length - 1; i++) {
    const a = res[res.length - 1];
    const b = out[i];
    const c = out[i + 1];
    const ab = sub(b, a);
    const bc = sub(c, b);
    const cr = cross(ab, bc);
    const L = Math.hypot(c.x - a.x, c.y - a.y);
    if (L > eps && Math.abs(cr) / L <= eps && dot(ab, bc) > 0) continue; // 同向共线 → 吃掉中间点
    res.push(b);
  }
  res.push(out[out.length - 1]);
  return res;
}

/** 折线的总长度; 非法点按 0 段计(需严格判定请先 normalizeRoutePoints) */
export function polylineLength(pts: Pt[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1], pts[i]);
  return s;
}

/** 折线各段长度 */
export const polylineSegmentLengths = (pts: Pt[]): number[] =>
  pts.slice(1).map((p, i) => dist(pts[i], p));

/**
 * 两条折线的"真交叉"次数: 只数 proper 相交(两条线的内部穿插),
 * T 形相触 / 共线重叠 / 共享端点都不算 —— 正交路由里这些是常态, 计进去等于虚报。
 */
export function polylineCrossings(a: Pt[], b: Pt[]): number {
  let n = 0;
  for (let i = 1; i < a.length; i++) {
    for (let j = 1; j < b.length; j++) {
      if (properSegmentIntersection(a[i - 1], a[i], b[j - 1], b[j])) n++;
    }
  }
  return n;
}

/**
 * 折线到一组矩形的最小净空。
 * 任一矩形非法 / 任一段无法判定 → **整个函数返回 null**。
 * ⚠ 不能用 forEach + return: 那只能跳出当前回调, 会把"不知道"静默降级成"只看部分矩形"(实测踩过)。
 */
export function polylineRectsClearance(
  pts: Pt[],
  rects: Rect[],
  skip: (r: Rect, i: number) => boolean = () => false,
): number | null {
  if (!isFinitePoints(pts)) return null;
  let best: number | null = null;
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (skip(r, i)) continue;
    if (!isFiniteRect(r)) return null;
    for (let k = 1; k < pts.length; k++) {
      const d = segmentRectClearance(pts[k - 1], pts[k], r);
      if (d === null) return null;
      best = best === null ? d : Math.min(best, d);
    }
  }
  return best;
}

// --- 第四轮门禁用的谓词(260918 Mermaid 对账) ---------------------------
//
// 三档"看起来同源"与两档"线叠在一起"共用的度量。全部沿用本文件的硬规矩:
// 非法输入返 null / false, 绝不静默变 0 —— 但**重叠长度为 0 是合法结果**, 所以那两个
// 返 number 而不是 null(调用方只需判阈值)。

/**
 * 把点按 **bbox 逐轴 clamp** 进矩形(盒外 → 落到盒上; 盒内 → **原地不动**)。
 *
 * 用途: `port_crowding` 的第三档 —— 两个端点看着位置不同, 各自 clamp 回盒后却重合,
 * 说明它们其实同源(手写折点 / 组锚点这类端点可以落在盒外的写法)。
 *
 * ⚠ 语义与 Mermaid `validateLayout.ts:1316-1323` 逐字对齐: 只 clamp, **不**把盒内的点推到最近边。
 * 盒内端点不是"投影回盒"能修的缺陷(那是另一类问题), 硬推会造出参考实现不会有的命中。
 *
 * 非法输入(点或矩形非有限)返回 `null`: clamp 一个 NaN 出来还是 NaN, 那只是把"不知道"
 * 伪装成一个坐标。与同族 `pointRectDistance` / `segmentRectClearance` 同一口径。
 */
export function clampPointToRect(p: Pt, r: Rect): Pt | null {
  if (!isFinitePoint(p) || !isFiniteRect(r)) return null;
  return {
    x: Math.min(Math.max(p.x, r.x), rectRight(r)),
    y: Math.min(Math.max(p.y, r.y), rectBottom(r)),
  };
}

/**
 * 两端点 clamp 回同一矩形后是否重合(非有限输入返 false)。
 *
 * ⚠ 对**边界上的**端点它是恒假(边界点是不动点): 所以 route 产物永远触发不了它,
 * 只有盒外端点(手写坐标)才会。别在注释里许诺工具做不到的事。
 */
export function projectedPortsCoincide(a: Pt, b: Pt, r: Rect, eps = 3): boolean {
  if (!isFinitePoint(a) || !isFinitePoint(b) || !isFiniteRect(r)) return false;
  const ca = clampPointToRect(a, r);
  const cb = clampPointToRect(b, r);
  if (ca === null || cb === null) return false; // 上游守卫已保证有限, 这里只让 null 不潜伏成"重合"
  return dist(ca, cb) <= eps;
}

/**
 * 两段在**同一轴**上的重叠长度(H/H 比 x 区间, V/V 比 y 区间)。
 * 不同朝向 / 不在同一轴(y 或 x 不相等, 容差 eps) / 零长段 → 0。
 *
 * 正交线网里"贴轨"判定唯一正确的度量: 只比端点距离会把"两条平行轨挨着"漏掉。
 */
export function sameAxisOverlapLength(a1: Pt, a2: Pt, b1: Pt, b2: Pt, eps = 0.5): number {
  if (!isFinitePoint(a1) || !isFinitePoint(a2) || !isFinitePoint(b1) || !isFinitePoint(b2)) return 0;
  const aH = Math.abs(a1.y - a2.y) <= eps && Math.abs(a1.x - a2.x) > eps;
  const bH = Math.abs(b1.y - b2.y) <= eps && Math.abs(b1.x - b2.x) > eps;
  const aV = Math.abs(a1.x - a2.x) <= eps && Math.abs(a1.y - a2.y) > eps;
  const bV = Math.abs(b1.x - b2.x) <= eps && Math.abs(b1.y - b2.y) > eps;
  if (aH && bH) {
    if (Math.abs(a1.y - b1.y) > eps) return 0;
    return Math.max(0, Math.min(Math.max(a1.x, a2.x), Math.max(b1.x, b2.x)) - Math.max(Math.min(a1.x, a2.x), Math.min(b1.x, b2.x)));
  }
  if (aV && bV) {
    if (Math.abs(a1.x - b1.x) > eps) return 0;
    return Math.max(0, Math.min(Math.max(a1.y, a2.y), Math.max(b1.y, b2.y)) - Math.max(Math.min(a1.y, a2.y), Math.min(b1.y, b2.y)));
  }
  return 0;
}

/**
 * 两段"近平行"的距离与投影重叠: 同朝向 → `{gap, overlap}`(gap = 垂直距离,
 * overlap = 沿轴投影重叠长度); 朝向不同 / 非法 → null。
 *
 * ⚠ **共轴时返回 `gap: 0`**, 不返 null —— 由调用方过滤(`gap > 0`, 见 `sameAxisOverlapLength` 管共线那档)。
 * 与 `sameAxisOverlapLength` 分工: 那个抓"完全叠在一起", 这个抓"没贴上但看不清"。
 */
export function parallelSegmentGap(a1: Pt, a2: Pt, b1: Pt, b2: Pt, eps = 0.5): { gap: number; overlap: number } | null {
  if (!isFinitePoint(a1) || !isFinitePoint(a2) || !isFinitePoint(b1) || !isFinitePoint(b2)) return null;
  const aH = Math.abs(a1.y - a2.y) <= eps && Math.abs(a1.x - a2.x) > eps;
  const bH = Math.abs(b1.y - b2.y) <= eps && Math.abs(b1.x - b2.x) > eps;
  const aV = Math.abs(a1.x - a2.x) <= eps && Math.abs(a1.y - a2.y) > eps;
  const bV = Math.abs(b1.x - b2.x) <= eps && Math.abs(b1.y - b2.y) > eps;
  if (aH && bH) {
    const overlap = Math.max(0, Math.min(Math.max(a1.x, a2.x), Math.max(b1.x, b2.x)) - Math.max(Math.min(a1.x, a2.x), Math.min(b1.x, b2.x)));
    return { gap: Math.abs(a1.y - b1.y), overlap };
  }
  if (aV && bV) {
    const overlap = Math.max(0, Math.min(Math.max(a1.y, a2.y), Math.max(b1.y, b2.y)) - Math.max(Math.min(a1.y, a2.y), Math.min(b1.y, b2.y)));
    return { gap: Math.abs(a1.x - b1.x), overlap };
  }
  return null;
}

/** 段的朝向(0=非轴 / 1=水平 / 2=垂直); 零长段与斜段都算 0(第四轮门禁只认正交折线) */
export function segmentAxis(a: Pt, b: Pt, eps = 0.5): 0 | 1 | 2 {
  if (!isFinitePoint(a) || !isFinitePoint(b)) return 0;
  if (Math.abs(a.y - b.y) <= eps && Math.abs(a.x - b.x) > eps) return 1;
  if (Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) > eps) return 2;
  return 0;
}
