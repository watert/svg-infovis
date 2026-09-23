// =====================================================================
// rounded-path · 圆角路径与端点标记核心 (纯数学, 零 DOM)
//
// 1) 圆角: 把多边形 / 开放折线的尖角用圆弧磨圆。凸角圆心落在内侧, 凹角按模式保留尖角或外凸补偿。
// 2) 端点: 折线两端生成圆点 / 箭头 / V 形箭头的几何描述(不用 SVG marker)。
//
// 关键设计: 圆角不是"画个弧"就完了 —— cornerAt 把圆心 / 切点 / 被邻段钳制后的实际半径都解算出来,
// 这份解算就是 audit 能验"半径是否被钳制到违规""凸凹是否画反"的依据(设计稿 §6.2)。
//
// 移植自 htmls/2609-svg-lab/src/lib/geometry/rounded-path.js, 逻辑零改写(仅 TS 化 + 修 idealRadius 取值)。
// =====================================================================

import { type Pt, add, clamp, fmt, len, norm, scl, sub } from './vec';

/** 闭合多边形的绕向: y-down 下 signedArea > 0 = 屏幕视角顺时针 */
export function signedArea(pts: Pt[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export type Corner = {
  /** curr→prev 的单位向量 */
  u1: Pt;
  /** curr→next 的单位向量 */
  u2: Pt;
  /** u1×u2 (y-down): 负 = 屏幕顺时针转 */
  cross: number;
  /** 内角 0..π */
  angle: number;
  half: number;
  lenPrev: number;
  lenNext: number;
  /** 沿邻边的切点距离 = r/tan(half), 受最短邻边一半钳制 */
  tDist: number;
  /** 钳制后的实际半径(可能小于期望值) */
  actualRadius: number;
  t1: Pt;
  t2: Pt;
  /** u1+u2 平分线: 凸顶点指向内部, 凹顶点指向外部 */
  bisector: Pt;
};

export type VertexAnalysis = Corner & {
  index: number;
  curr: Pt;
  prev: Pt;
  next: Pt;
  isCW: boolean;
  /** 圆心向内偏移时落在多边形内部 —— 即"该画圆角"的情形 */
  isConvex: boolean;
  inwardBisector: Pt;
};

export type Tangent = {
  t1: Pt;
  t2: Pt;
  center: Pt | null;
  actualRadius: number;
  skipped: boolean;
  tDist: number;
  idealRadius: number;
  /** 顶点下标 —— 诊断要能指名道姓说"第几个角" */
  index: number;
  /** 内角 0..π (audit 判"半径被压到不成圆角"要看它) */
  angle: number;
  half: number;
  /** u1×u2: 负 = 屏幕顺时针转 */
  cross: number;
  isConvex: boolean;
};

export type PolylineTangent = {
  /** 顶点在折点列里的下标 */
  index: number;
  t1: Pt;
  t2: Pt;
  sweep: 0 | 1;
  actualRadius: number;
  center: Pt;
  /** 转弯的内角 0..π 与朝向(负 = 屏幕顺时针) */
  angle: number;
  cross: number;
};

export type RadiusSpec = number | ((index: number) => number);

// 单个角的几何解算: 入/出边方向, 内角, 切点, 实际半径, 平分线.
// 沿邻边的切点距离 t = r / tan(half), 受最短邻边一半钳制 → 实际半径可能小于期望值.
// 多边形与折线共用这一份数学, 差别只在圆心取内侧还是外侧、sweep 方向.
export function cornerAt(prev: Pt, curr: Pt, next: Pt, r: number): Corner {
  const v1 = sub(prev, curr); // curr→prev
  const v2 = sub(next, curr); // curr→next
  const lenPrev = len(v1);
  const lenNext = len(v2);
  const u1 = norm(v1);
  const u2 = norm(v2);
  const crossV = u1.x * u2.y - u1.y * u2.x; // y-down
  const angle = Math.acos(clamp(u1.x * u2.x + u1.y * u2.y, -1, 1)); // 内角 0..π
  const half = angle / 2;
  const halfSafe = Math.max(half, 1e-3);
  const tDist = Math.min(r / Math.tan(halfSafe), lenPrev / 2, lenNext / 2);
  const actualRadius = tDist * Math.tan(halfSafe);
  return {
    u1, u2, cross: crossV, angle, half, lenPrev, lenNext, tDist, actualRadius,
    t1: add(curr, scl(u1, tDist)),
    t2: add(curr, scl(u2, tDist)),
    bisector: norm({ x: u1.x + u2.x, y: u1.y + u2.y }),
  };
}

/** 逐顶点分析: 入/出边方向, 内角, 凹凸标记, 平分线 */
export function analyzeVertices(points: Pt[]): VertexAnalysis[] {
  const n = points.length;
  if (n < 3) return [];
  const isCW = signedArea(points) > 0;
  return points.map((curr, i) => {
    const prev = points[(i - 1 + n) % n];
    const next = points[(i + 1) % n];
    const c = cornerAt(prev, curr, next, 0);
    // CW 凸角 cross<0; CCW 凸角 cross>0
    const isConvex = isCW ? c.cross < -1e-9 : c.cross > 1e-9;
    return { index: i, curr, prev, next, isCW, isConvex, inwardBisector: c.bisector, ...c };
  });
}

/**
 * 闭合多边形 → path d + 每顶点圆角参数(圆心/切点/实际半径)。
 * @param radius 数值(所有角一致)或 (i)=>number(逐角)
 * @param concaveMode 'sharp' 保留凹角尖角 | 'round' 凹角外凸补偿
 */
export function radiusPolygonPath(
  points: Pt[],
  radius: RadiusSpec,
  concaveMode: 'sharp' | 'round' = 'sharp',
): { d: string; analyses: VertexAnalysis[]; tangents: Tangent[] } {
  const rAt = typeof radius === 'function' ? radius : () => radius;
  const A = analyzeVertices(points);
  const n = A.length;
  if (n < 3) return { d: '', analyses: A, tangents: [] };

  const tangents: Tangent[] = A.map((a) => {
    const skipRound = !a.isConvex && concaveMode === 'sharp';
    // 解算字段(angle/half/cross/isConvex)无论跳不跳圆角都要带上 —— 审计读的是它们, 不是 path 字符串
    const base = { index: a.index, angle: a.angle, half: a.half, cross: a.cross, isConvex: a.isConvex };
    if (skipRound) {
      return { ...base, t1: a.curr, t2: a.curr, center: null, actualRadius: 0, skipped: true, tDist: a.tDist, idealRadius: rAt(a.index) };
    }
    const c = cornerAt(a.prev, a.curr, a.next, rAt(a.index));
    // 圆心: 凸 → 内部, 凹 + round → 外部
    const dir = a.isConvex ? c.bisector : { x: -c.bisector.x, y: -c.bisector.y };
    const centerDist = c.actualRadius / Math.sin(Math.max(c.half, 1e-3));
    return {
      ...base,
      t1: c.t1, t2: c.t2, center: add(a.curr, scl(dir, centerDist)),
      actualRadius: c.actualRadius, skipped: false, tDist: c.tDist, idealRadius: rAt(a.index),
    };
  });

  // sweep flag (y-down): 凸顶点圆心在内, 弧从 t1 经原顶点侧到 t2 = 屏幕顺时针 → sweep=1;
  //                     凹顶点(round 模式)圆心在外, 弧鼓回缺口 → sweep=0.
  const sweepFor = (i: number): 0 | 1 => (A[i].isConvex ? 1 : 0);

  const cmds: string[] = [];
  // 路径起点 = 第一个顶点的入切点(沿前一边切出的位置)
  cmds.push(`M ${fmt(tangents[0].t1.x)} ${fmt(tangents[0].t1.y)}`);
  for (let i = 0; i < n; i++) {
    const t = tangents[i];
    const nextT = tangents[(i + 1) % n];
    if (!t.skipped) {
      cmds.push(`A ${fmt(t.actualRadius)} ${fmt(t.actualRadius)} 0 0 ${sweepFor(i)} ${fmt(t.t2.x)} ${fmt(t.t2.y)}`);
    }
    cmds.push(`L ${fmt(nextT.t1.x)} ${fmt(nextT.t1.y)}`);
  }
  cmds.push('Z');
  return { d: cmds.join(' '), analyses: A, tangents };
}

/** 开放折线 → path d: 只磨内部顶点, 起终点保持原样 */
export function radiusPolylinePath(points: Pt[], radius: RadiusSpec): { d: string; tangents: PolylineTangent[] } {
  const rAt = typeof radius === 'function' ? radius : () => radius;
  const n = points.length;
  if (n < 2) return { d: '', tangents: [] };
  const cmds: string[] = [`M ${fmt(points[0].x)} ${fmt(points[0].y)}`];
  const tangents: PolylineTangent[] = [];
  for (let i = 1; i < n - 1; i++) {
    const curr = points[i];
    const c = cornerAt(points[i - 1], curr, points[i + 1], rAt(i));
    const sweep: 0 | 1 = c.cross < 0 ? 1 : 0; // 屏幕顺时针转弯 → sweep=1 (同多边形凸角)
    const centerDist = c.actualRadius / Math.sin(Math.max(c.half, 1e-3));
    tangents.push({
      index: i, t1: c.t1, t2: c.t2, sweep, actualRadius: c.actualRadius,
      center: add(curr, scl(c.bisector, centerDist)), angle: c.angle, cross: c.cross,
    });
    cmds.push(`L ${fmt(c.t1.x)} ${fmt(c.t1.y)}`);
    cmds.push(`A ${fmt(c.actualRadius)} ${fmt(c.actualRadius)} 0 0 ${sweep} ${fmt(c.t2.x)} ${fmt(c.t2.y)}`);
  }
  const last = points[n - 1];
  cmds.push(`L ${fmt(last.x)} ${fmt(last.y)}`);
  return { d: cmds.join(' '), tangents };
}

/** 折线两端的朝外方向: 起点反向、终点正向(用于端点标记朝向) */
export function endpointDirs(points: Pt[]): { start: Pt; end: Pt } {
  const n = points.length;
  if (n < 2) return { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } };
  return {
    start: norm(sub(points[0], points[1])),
    end: norm(sub(points[n - 1], points[n - 2])),
  };
}

export type MarkerStyle = 'none' | 'dot-hollow' | 'dot-solid' | 'arrow-triangle' | 'arrow-line';

export type EndpointMarker = {
  style: MarkerStyle;
  /** 建议的 SVG 元素名; none 时为 null */
  tag: 'circle' | 'path' | null;
  filled: boolean;
  cx?: number;
  cy?: number;
  r?: number;
  d?: string;
};

/**
 * 端点标记几何(纯几何, 颜色由调用方决定):
 *   dot-hollow / dot-solid  圆点, 圆心落在端点上, size = 直径
 *   arrow-triangle          实心三角, 尖端在端点, size = 尖端到底边长度
 *   arrow-line              V 形线状箭头, size = 尖端到两翼的长度
 */
export function endpointMarker(pt: Pt, dir: Pt, style: MarkerStyle, size: number): EndpointMarker {
  if (!style || style === 'none') return { style: 'none', tag: null, filled: false };
  const u = norm(dir);
  const nx = -u.y;
  const ny = u.x; // 法线
  if (style === 'dot-hollow' || style === 'dot-solid') {
    return { style, tag: 'circle', filled: style === 'dot-solid', cx: pt.x, cy: pt.y, r: size / 2 };
  }
  if (style === 'arrow-triangle') {
    const bx = pt.x - u.x * size;
    const by = pt.y - u.y * size; // 底边中点
    const w = size * 0.45;
    const l = { x: bx + nx * w, y: by + ny * w };
    const r = { x: bx - nx * w, y: by - ny * w };
    return {
      style, tag: 'path', filled: true,
      d: `M ${fmt(pt.x)} ${fmt(pt.y)} L ${fmt(l.x)} ${fmt(l.y)} L ${fmt(r.x)} ${fmt(r.y)} Z`,
    };
  }
  // arrow-line: 两翼从尖端回退 size, 半角 ~26° (tan 0.45 ≈ 0.483)
  const bx = pt.x - u.x * size;
  const by = pt.y - u.y * size;
  const w = size * Math.tan(0.45);
  const l = { x: bx + nx * w, y: by + ny * w };
  const r = { x: bx - nx * w, y: by - ny * w };
  return {
    style, tag: 'path', filled: false,
    d: `M ${fmt(l.x)} ${fmt(l.y)} L ${fmt(pt.x)} ${fmt(pt.y)} L ${fmt(r.x)} ${fmt(r.y)}`,
  };
}

/** 折线两端一次性产出标记(省去调用方重复取 dir) */
export function polylineEndpoints(
  points: Pt[],
  styleStart: MarkerStyle,
  styleEnd: MarkerStyle,
  size: number,
): Array<EndpointMarker & { dir: Pt; at: 'start' | 'end' }> {
  const dirs = endpointDirs(points);
  return [
    { ...endpointMarker(points[0], dirs.start, styleStart, size), dir: dirs.start, at: 'start' },
    { ...endpointMarker(points[points.length - 1], dirs.end, styleEnd, size), dir: dirs.end, at: 'end' },
  ];
}

/**
 * 端点标记会遮住折线端头的深度, 用于把线端缩进去, 避免线头从标记尖端露出。
 * 圆点缩到圆心(半径); 实心三角缩到根部(全长);
 * 线状 V 形只缩 1px —— 它是开放路径, 缩多了线端会悬在开口里接不上。
 */
export function endpointTrim(style: MarkerStyle, size: number): number {
  if (!style || style === 'none') return 0;
  if (style.startsWith('dot')) return size / 2;
  if (style === 'arrow-line') return 1;
  return size;
}

/** 折线两端沿相邻段内缩(内部顶点不动), 供画线时避开端点标记 */
export function trimPolyline(points: Pt[], startTrim: number, endTrim: number): Pt[] {
  const out = points.map((p) => ({ ...p }));
  const n = out.length;
  if (n < 2) return out;
  const segS = sub(points[1], points[0]);
  const segE = sub(points[n - 2], points[n - 1]);
  const lenS = len(segS);
  const lenE = len(segE);
  let tS = Math.min(startTrim, lenS * 0.9);
  let tE = Math.min(endTrim, lenE * 0.9);
  // 两点折线两端共享同一段, 总量一起钳制避免交叉
  if (n === 2 && tS + tE > lenS * 0.9) {
    const k = (lenS * 0.9) / (tS + tE || 1);
    tS *= k;
    tE *= k;
  }
  if (tS > 0) out[0] = add(out[0], scl(norm(segS), tS));
  if (tE > 0) out[n - 1] = add(out[n - 1], scl(norm(segE), tE));
  return out;
}
