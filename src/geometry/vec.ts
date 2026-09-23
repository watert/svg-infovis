// =====================================================================
// vec · 向量与矩形原语 (纯数学, 零依赖)
// 约定: y-down 坐标系(屏幕), 角度按 atan2(dy,dx) 的正方向为屏幕顺时针。
// 移植自 htmls/2609-svg-lab/src/lib/geometry/rounded-path.js, 逻辑零改写。
// =====================================================================

export type Pt = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };

export const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
export const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
export const scl = (v: Pt, k: number): Pt => ({ x: v.x * k, y: v.y * k });
export const len = (v: Pt): number => Math.hypot(v.x, v.y);
export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export const norm = (v: Pt): Pt => {
  const L = len(v);
  return L > 1e-9 ? { x: v.x / L, y: v.y / L } : { x: 0, y: 0 };
};

export const dot = (a: Pt, b: Pt): number => a.x * b.x + a.y * b.y;
/** y-down 下的叉积: >0 表示 b 在 a 的屏幕顺时针侧 */
export const cross = (a: Pt, b: Pt): number => a.x * b.y - a.y * b.x;
export const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);
export const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
export const ptEq = (a: Pt, b: Pt, eps = 1e-6): boolean => Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps;

/** 逆时针旋转 90°(屏幕) —— 折线法线方向, 用于线端内缩与端点标记 */
export const perpL = (v: Pt): Pt => ({ x: -v.y, y: v.x });
/** 顺时针旋转 90°(屏幕) */
export const perpR = (v: Pt): Pt => ({ x: v.y, y: -v.x });

/** 90° 量化的方向索引: 0=E 1=S 2=W 3=N (y-down); 非正交方向返回最近的正交方向 */
export const dirIndex = (v: Pt): 0 | 1 | 2 | 3 => {
  const a = Math.atan2(v.y, v.x);
  const k = Math.round(a / (Math.PI / 2));
  return (((k % 4) + 4) % 4) as 0 | 1 | 2 | 3;
};

// --- 矩形 -------------------------------------------------------------

export const rectRight = (r: Rect): number => r.x + r.w;
export const rectBottom = (r: Rect): number => r.y + r.h;
export const rectCenter = (r: Rect): Pt => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
export const rectFromPoints = (pts: Pt[]): Rect => {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
};
export const expandRect = (r: Rect, by: number): Rect => ({ x: r.x - by, y: r.y - by, w: r.w + by * 2, h: r.h + by * 2 });

// --- 确定性数值 --------------------------------------------------------

/** 确定性取整: 1 位小数(设计稿禁令: 禁 Date.now / Math.random, 数值必须可复现) */
export const round1 = (n: number): number => Math.round(n * 10) / 10;
/**
 * path / 属性字符串里的数值格式化: 2 位小数。
 * 非有限值**不静默成 0** —— 写回 "NaN" 让坏值在产物里肉眼可见、也能被 finite_svg 门禁扫到。
 * (之前回退成 0.00 会把 "自己扫自己输出永远通过" 变成一个真漏洞)
 */
export const fmt = (n: number): string => (Number.isFinite(n) ? n.toFixed(2) : 'NaN');

/** codepoint 序排序 —— 集合序列化的确定性保证(不依赖 localeCompare) */
export const codepointSort = (xs: string[]): string[] =>
  [...xs].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
