// =====================================================================
// knives/route-cost · 折点列的**代价向量**: 量化 + 字典序比较
//
// 为什么要有它 (260919, 对标 archify 后立项):
//   同一个拓扑下 route 会枚举出多条**都合法**的候选折线, 挑哪条是**审美**, 不是对错。core 此前把
//   这套审美**写死在控制流里** —— "先要不自重叠且不蹭自己这两个盒子, 同级取更短"(`transposedRoute`
//   的 `pick(strict)`)、"取第一个不回折的"(`routeOrthogonal`)。想加一维(比如"少拐一个弯"),
//   只能改控制流分支; 想解释"为什么这条候选赢了", 只能读源码。
//   本文件把审美**表达式化**: 候选 → **代价向量** → 字典序排序。加一维 = 往维度表加一行。
//
// 借自参照实现 `renderers/workflow/workflow-compiler.mjs` 的两样东西(它是全仓唯一的真布局引擎):
//   · `READABLE_CANDIDATE_COST_PRIORITY` —— 有序维度表, 顺序即优先级
//   · `compareCost()` —— 逐维比较的字典序, **末位专做确定性破平**(不许靠枚举顺序的巧合)
//   它的第三样"布局失败 → 回灌约束重解"(最多 3 轮)属于 v0.2 的活儿, 与本文件无关。
//
// 刻意**没抄**的三维(都是它的产品包袱, 不是几何资产):
//   · `legacyCoordinateDisplacement` —— "偏离 legacy 列心多远", 只在它 schema v1→v2 迁移期有意义
//   · `canvasGrowthPx` —— 画布外溢。core 的 `fitScene` 自动包内容, 没有"画布被撑大"这回事
//   · `portDisplacementMilli` —— 端口位移。core 的端口是作者给定的常量, 候选只在中间折点上变
//
// 边界(与 core 其余部分同纪律):
//   · 这是**读数**, 不是门禁 —— 不返回 pass/fail、不抛异常、**不新增阈值**。每一维的阈值都从
//     `thresholds.ts` 取(audit 再导出同一绑定), 判决与排序**必须同一把尺子**; 另定一个数就会出现
//     "门禁说没穿、排序说穿了"的双源结论。
//   · 零新判据: 维度只是把门禁**已经在算**的量从 bool 提成标量。`firstBacktrackIndex >= 0` 是判决,
//     `backtrackPx = 37.4` 是它的量化 —— 同一个事实的两种读出方式。
//   · 确定性: 每个值过 `round1`(与 nudge / audit 同一量化粒度), 末位 `ordinal` 破平 ⇒ 同输入同输出。
//
// 接线状态(260926):
//   · 横腰线 `transposedRoute` 的择优**已经**走 `compareRouteCost`, 只启用与表达式化之前逐字等价的
//     三维 `backtrackPx` / `endpointBitePx` / `stretchMilli`。证据是 `test/route-pick-equivalence.test.ts`
//     的 288 组逐字节基线(随 `bun run verify` 跑)。
//   · 竖腰线 Z 与 L 拐仍是原来的控制流。放开弯数 / 穿盒 / 走廊 / 交叉会改产物, 要单独拍板再重出 golden。
// =====================================================================

import { type Pt, type Rect, round1 } from '../geometry/vec';
import {
  polylineCrossings, polylineLength, polylineRectsClearance, polylineSegmentLengths,
  sameAxisOverlapLength, segmentRectIntersectionLength,
} from '../geometry/predicates';
import { type AuditLevel, PIERCE_MIN, STUB_MIN, THRESHOLDS } from './thresholds';

// --- 维度表(**单一来源**) -----------------------------------------------
//
// 顺序即优先级: 排在前面的维先比, 前面的分了胜负就不看后面的。
// 排序依据是**门禁已有的分级** —— 我们判成 error 的几何事实排前面(回折 / 自重叠 / 穿盒 / 端段过短 /
// 标签压线), 没有门禁的审美量排后面(走廊 / 交叉 / 弯数 / 绕路)。这套顺序是**唯一的可调点**:
// 改审美 = 改这张表的行序, 是一次显式决策, 不再散落在控制流的分支里。
//
// ⚠ 加一维 = 加一行, 且必须同时回答三个问题: ① 阈值从哪个既有判据取(或"无阈值, 纯量化")
//   ② 它排在谁前面、为什么 ③ `test/route-cost.test.ts` 里拿什么样本证明它真在参与排序。

export const ROUTE_COST_DIMENSIONS = [
  { key: 'backtrackPx', unit: 'px', note: '原路折回的总长 —— 相邻两段反向时取较短那段的长度(即"退回去的部分")' },
  { key: 'selfOverlapPx', unit: 'px', note: '自重叠总长 —— 非相邻段同轴反向且投影重叠时的重叠长度之和' },
  { key: 'piercePx', unit: 'px', note: `穿盒总长 —— 逐盒累加与盒的相交长度, 超过 ${PIERCE_MIN}px(半像素擦边)才算` },
  { key: 'endpointBitePx', unit: 'px', note: `端点盒净空缺口 —— 折线中段(剔掉贴在盒面上的两端端口点)对端点盒的净空不足 ${PIERCE_MIN}px 的差额` },
  { key: 'stubDeficitPx', unit: 'px', note: `端段过短的缺口 —— 折线有折弯(≥2 段)时, 首/末段短于 ${STUB_MIN}px 的差额之和` },
  { key: 'labelDeficitPx', unit: 'px', note: '标签净空缺口 —— 净空不足门槛(与 label_clearance 门禁同源)的差额之和, 豁免自家边的标签' },
  { key: 'sharedCorridorPx', unit: 'px', note: '与其他边的共线重叠总长(共享走廊) —— 原始量, 不含门禁的 8px 阈值与终端走廊豁免' },
  { key: 'crossingCount', unit: '处', note: '与其他边的真交叉次数(T 形相触 / 共线重叠 / 共享端点都不算)' },
  { key: 'bendCount', unit: '个', note: '转折数(不含两端端口点)' },
  { key: 'stretchMilli', unit: '', note: '绕路比 ×1000(总长 ÷ 两端曼哈顿距离) —— 取整免浮点残差进比较' },
  { key: 'ordinal', unit: '', note: '稳定破平: 候选在枚举里的序号, 只在前面的维全都同分时才起作用' },
] as const;

export type RouteCostDimension = (typeof ROUTE_COST_DIMENSIONS)[number]['key'];

/**
 * 全部维度, 顺序 = 维度表顺序 —— **从表派生, 不手抄**(手抄一份就等于开了第二个来源,
 * 加维时必然漏改)。比较器与诊断出口的缺省值都是它。
 */
export const ALL_COST_DIMENSIONS: readonly RouteCostDimension[] = ROUTE_COST_DIMENSIONS.map((d) => d.key);

/** 一条候选折线在每一维上的取值。全部有限数, 越小越好 */
export type RouteCost = Record<RouteCostDimension, number>;

// --- 入参 ---------------------------------------------------------------

/**
 * 一条"邻居"折线(同一张图里已经定下来的其他边)。
 * `sharesEndpoint` 跳过共享端点的边 —— 借参照实现 `routeInteractionMetrics` 的口径: 两条边从同一个
 * 盒子出发时端口附近本来就贴着走, 计进"共享走廊"等于给所有扇出边扣同一个常数(排序不受影响,
 * 但读数会虚高, 作者看不出真问题在哪)。
 */
export type RouteCostNeighbor = {
  points: readonly Pt[];
  /** 与本条边共用端点(同一个盒子出发/汇入) —— 端口附近的共线是必然的, 不计入 */
  sharesEndpoint?: boolean;
};

/** 一块参与净空检查的标签遮罩片。`ownerEdge` 与 scene 的 `SceneLabel` 同义 */
export type RouteCostLabel = {
  rect: Rect;
  ownerEdge?: string;
};

/**
 * 代价的**上下文** —— 全部可选: 只给折点列时, 涉及"场景里别的对象"的维度自然退化成 0
 * (没有邻居就没有交叉, 没有盒子就没有穿盒), 而**折线自身的维度**(回折 / 自重叠 / 弯数 / 绕路)
 * 永远能算。这是刻意的: 让 `routeCost(pts)` 在不带上下文时也有意义, 而不是抛错或给假值。
 */
export type RouteCostContext = {
  /** 这条边自己的 id —— 用来豁免"自家标签"(与 label_clearance 门禁同一条豁免) */
  edgeId?: string;
  /** 场景里的节点盒(判穿盒)。要用门禁口径就传"非端点节点"; 想让端点盒也被罚就一并传进来 */
  nodeRects?: readonly Rect[];
  /** 本条边的两个**端点盒** —— 折线中段贴着它们擦过时, 由 `endpointBitePx` 罚 */
  endpointRects?: readonly Rect[];
  /** 场景里的标签遮罩片 */
  labels?: readonly RouteCostLabel[];
  /** 已经定下来的其他边 */
  neighbors?: readonly RouteCostNeighbor[];
  /** 判分档位 —— 只影响 `labelDeficitPx` 的门槛(与 audit 同源) */
  level?: AuditLevel;
  /** 候选在枚举里的序号(从 0 起) —— 末位破平用 */
  ordinal?: number;
};

// --- 逐维量化 -----------------------------------------------------------

/** 段向量; 零长段返回 null —— 与 `normalizeRoutePoints` 之后的折线口径一致 */
function seg(a: Pt, b: Pt): { x: number; y: number; len: number } | null {
  const x = b.x - a.x, y = b.y - a.y;
  const len = Math.hypot(x, y);
  return len < 1e-9 ? null : { x, y, len };
}

function backtrackPx(pts: readonly Pt[]): number {
  let total = 0;
  for (let i = 2; i < pts.length; i++) {
    const s1 = seg(pts[i - 2], pts[i - 1]);
    const s2 = seg(pts[i - 1], pts[i]);
    if (!s1 || !s2) continue;
    // 反向 = 点积为负。与 `firstBacktrackIndex` 同一判据, 这里只是不取索引而取长度
    if (s1.x * s2.x + s1.y * s2.y < -1e-9) total += Math.min(s1.len, s2.len);
  }
  return total;
}

function selfOverlapPx(pts: readonly Pt[], eps = 0.5): number {
  let total = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const s1 = seg(pts[i], pts[i + 1]);
    if (!s1) continue;
    // j 从 i+2 起: 相邻段的反向重叠属于"回折"(backtrackPx), 不在这里重复计
    for (let j = i + 2; j + 1 < pts.length; j++) {
      const s2 = seg(pts[j], pts[j + 1]);
      if (!s2) continue;
      if (s1.x * s2.x + s1.y * s2.y >= -1e-9) continue;
      total += sameAxisOverlapLength(pts[i], pts[i + 1], pts[j], pts[j + 1], eps);
    }
  }
  return total;
}

function piercePx(pts: readonly Pt[], ctx: RouteCostContext): number {
  let total = 0;
  for (const r of ctx.nodeRects ?? []) {
    let through = 0;
    for (let i = 1; i < pts.length; i++) {
      through += segmentRectIntersectionLength(pts[i - 1], pts[i], r) ?? 0;
    }
    if (through > PIERCE_MIN) total += through; // 同门禁: 半像素以下算擦边, 不算穿
  }
  return total;
}

function endpointBitePx(pts: readonly Pt[], ctx: RouteCostContext): number {
  const rects = ctx.endpointRects ?? [];
  if (!rects.length || pts.length < 3) return 0;
  // 剔掉两端端口点: 它们本来就落在盒面上, 留着等于把每个解都判成"蹭盒"
  const inner = pts.slice(1, -1);
  let total = 0;
  for (const r of rects) {
    const c = polylineRectsClearance(inner, [r]);
    if (c === null) continue;
    total += Math.max(0, PIERCE_MIN - c);
  }
  return total;
}

function stubDeficitPx(pts: readonly Pt[]): number {
  // 无折弯的直连边不在判据内 —— 与 `endpoint_approach` 同源: 两盒离得近时直连是对的,
  // 否则 "nodeGap 允许 8px" 与 "STUB_MIN 禁 10px" 两条门禁会互相打架
  if (pts.length < 3) return 0;
  const segs = polylineSegmentLengths([...pts]);
  return Math.max(0, STUB_MIN - segs[0]) + Math.max(0, STUB_MIN - segs[segs.length - 1]);
}

function labelDeficitPx(pts: readonly Pt[], ctx: RouteCostContext): number {
  const labels = ctx.labels ?? [];
  if (!labels.length) return 0;
  const thr = THRESHOLDS[ctx.level ?? 'standard'].labelClearance;
  let total = 0;
  for (const l of labels) {
    if (ctx.edgeId !== undefined && l.ownerEdge === ctx.edgeId) continue; // 唯一豁免: 自家边
    const d = polylineRectsClearance([...pts], [l.rect]);
    if (d === null) continue;
    total += Math.max(0, thr - d);
  }
  return total;
}

function sharedCorridorPx(pts: readonly Pt[], ctx: RouteCostContext): number {
  let total = 0;
  for (const nb of ctx.neighbors ?? []) {
    if (nb.sharesEndpoint) continue;
    for (let i = 1; i < pts.length; i++) {
      for (let j = 1; j < nb.points.length; j++) {
        total += sameAxisOverlapLength(pts[i - 1], pts[i], nb.points[j - 1], nb.points[j]);
      }
    }
  }
  return total;
}

function crossingCount(pts: readonly Pt[], ctx: RouteCostContext): number {
  let total = 0;
  for (const nb of ctx.neighbors ?? []) total += polylineCrossings([...pts], [...nb.points]);
  return total;
}

function bendCount(pts: readonly Pt[]): number {
  return Math.max(0, pts.length - 2);
}

/**
 * 绕路比 ×1000。两端重合(闭环)时比值无定义 —— 返回哨兵 `999999` 而不是 0:
 * 0 会被读成"一点没绕", 恰好说反。真出现闭环边说明上游给了不该有的几何, 排序把它排到最后即可。
 */
const STRETCH_UNDEFINED = 999999;

function stretchMilli(pts: readonly Pt[]): number {
  if (pts.length < 2) return 0;
  const len = polylineLength([...pts]);
  const head = pts[0], tail = pts[pts.length - 1];
  const direct = Math.abs(tail.x - head.x) + Math.abs(tail.y - head.y);
  if (direct < 1e-9) return len < 1e-9 ? 0 : STRETCH_UNDEFINED;
  return Math.round((len / direct) * 1000);
}

/** 维度 → 计算器。**加一维必须同时在这张表与维度表各加一行**, 否则类型检查当场拦下 */
const COMPUTE: Record<RouteCostDimension, (pts: readonly Pt[], ctx: RouteCostContext) => number> = {
  backtrackPx: (pts) => backtrackPx(pts),
  selfOverlapPx: (pts) => selfOverlapPx(pts),
  piercePx,
  endpointBitePx,
  stubDeficitPx: (pts) => stubDeficitPx(pts),
  labelDeficitPx,
  sharedCorridorPx,
  crossingCount,
  bendCount: (pts) => bendCount(pts),
  stretchMilli: (pts) => stretchMilli(pts),
  ordinal: (_pts, ctx) => ctx.ordinal ?? 0,
};

// --- 出口 ---------------------------------------------------------------

/**
 * 算一条候选折点列的代价向量。
 *
 * 遍历**维度表**而不是手写一串赋值 —— 这样"加一维 = 加一行"在实现侧也成立,
 * 不会出现"表里加了、出口忘了算"的半接线状态(那正是 core 反复吃过的亏)。
 */
export function routeCost(points: readonly Pt[], ctx: RouteCostContext = {}): RouteCost {
  const out = {} as RouteCost;
  for (const dim of ROUTE_COST_DIMENSIONS) {
    out[dim.key] = round1(COMPUTE[dim.key](points, ctx));
  }
  return out;
}

/**
 * 字典序比较(与参照实现的 `compareCost` 同构, 但顺序来自**单一来源的维度表**)。
 * 负 = `left` 更优; 正 = `right` 更优; 0 = 每一维都同分(有 `ordinal` 兜底时几乎不可能走到)。
 *
 * `dimensions` 是**分阶段接线**的必需件: 放开一个新维度会改排序, 那要单独拍板 + 重出 golden。
 * 所以调用方(如 `route` 的择优)可以先只启用"与现状等价"的子集, 逐维验证之后再放行。
 * ⚠ `ordinal` 恒在末位参与比较(调用方给了不含它的子集时自动追加)—— 破平不许被关掉,
 *   否则"同分取谁"就退化成"靠枚举顺序的巧合", 正是本文件要消灭的东西。
 */
export function compareRouteCost(
  left: RouteCost,
  right: RouteCost,
  dimensions: readonly RouteCostDimension[] = ALL_COST_DIMENSIONS,
): number {
  for (const key of dimensions) {
    const delta = left[key] - right[key];
    if (delta !== 0) return delta;
  }
  if (!dimensions.includes('ordinal')) {
    const delta = left.ordinal - right.ordinal;
    if (delta !== 0) return delta;
  }
  return 0;
}

/**
 * 两条候选**在第一维上分出胜负的那一维** —— 判决给"谁赢", 它回答"赢在哪"。
 *
 * 为什么单独开一个出口: 放开一个新维度之后产物会变, 追查"是哪一维把它顶掉的"若靠读源码,
 * 就会退回到"审美散落在控制流里"的老问题 —— 那正是本文件要消灭的东西。
 */
export function firstCostDifference(
  left: RouteCost,
  right: RouteCost,
  dimensions: readonly RouteCostDimension[] = ALL_COST_DIMENSIONS,
): RouteCostDimension | null {
  for (const key of dimensions) {
    if (left[key] !== right[key]) return key;
  }
  return null;
}

/**
 * 人读的一行读数 —— 缺省**跳过 0 值**(0 的意思是"这一维没问题", 全列出来是噪音),
 * 全零时输出 `clean`。`ordinal` 恒不进人读串: 它是破平用的序号, 不是代价。
 */
export function formatRouteCost(
  cost: RouteCost,
  { skipZero = true, separator = ' · ' }: { skipZero?: boolean; separator?: string } = {},
): string {
  const parts: string[] = [];
  for (const dim of ROUTE_COST_DIMENSIONS) {
    if (dim.key === 'ordinal') continue;
    const value = cost[dim.key];
    if (skipZero && value === 0) continue;
    parts.push(`${dim.key} ${value}${dim.unit}`);
  }
  return parts.length ? parts.join(separator) : 'clean';
}
