// =====================================================================
// knives/route · 已知盒子 + 端口 → 正交折点列
//
// 这是 layout-helpers 路线里"工具算像素"的样板刀: 输入全是离散决策(哪个面出、沿面什么位置),
// 输出是纯几何折点。路由器**不猜主路径** —— 主路径由 agent 的层/序决策决定, route 只把它铺成像素。
//
// 边界(明确不做, 见设计稿 §九):
//   · 不做避障(不绕开中间节点) —— 那是 v0.2 的 lane 分配
//   · 不做端口自动分散(多边共用一面时错开) —— 也归 v0.2
//   · 输出一律 normalize 过: 零长段与共线点在这里就死掉, 不让脏数据流到 audit
//
// 260917 手排实测补两条**可行性**约束(此前会吐出原地折回的坏几何, 且门禁看不见):
//   ① 两根 stub **对顶**时各让一半 —— 否则两个 stub 互穿, 中间的 Z 腰线位置根本不存在
//      (同向平行的 stub 不顶, 不能收短, 否则会把作者指定的 lane 一起毁掉)
//   ② 混合朝向的两个 L 拐法都要试 —— 目标在出方向背面时, "先出到目标列"会原路退回
//   · 腰线一律**按可行域投影**: 对顶时只能落在两 stub 之间; 平行时必须落在出口方向那一侧
//
// 260918 补第三条(⑥ 边×自身回退重叠): 两个水平 stub **相背**时(源往西出、目标从东进),
//   竖腰线 Z 的可行域是**空集** —— 折线要"先西出再东进", 只能在**另一行**上横穿过去, 否则
//   末段必然原路折回 18px 进端口(而边级门禁全是边×边, 这条自重叠此前无人喊疼)。
//   于是这类拓扑改走**横腰线**(竖腰线 Z 的转置), 候选行 = 两 stub 的中间行 / 绕两盒顶 / 绕两盒底,
//   择优口径与 L 拐法同源(先要不自重叠且不蹭自己这两个盒子, 同级取更短的)。作者给的 lane 在这条
//   路里无处可落 —— 一律置 `laneInfeasible` 报一声, 与 `laneProjected` 同一立场: 不静默改写调用方参数。
//
// 260918 补第四条(**作者指定的中间折点** `via`, 对标 archify `connections[].via`):
//   两张 archify 复刻图实测出 42 条诊断, 其中两条"边穿节点盒"的真根因**不是几何算错**, 而是 core
//   没有"作者能指定折点"的手段: archify 的 `via` 是**纯声明、零算法** —— 作者直接给出中段折点,
//   引擎只负责把相邻两点连成正交折线。core 此前只有单腰线 `lane`, 撞上"中间横着一个盒子"时
//   只剩把腰线投影到边界这一条路, 绕不开。
//   ⚠ **这不是"给引擎加避障"**: 既定边界明写 core 不猜意图、自动避障不许进默认路径。`via` 是
//   **作者权威的显式折点** —— 引擎不生成、不猜测、不替换, 只负责连成正交折线并如实报告可行性。
//   口径三条:
//     · via 存在 → lane 全程不参与, 报 `laneIgnored`(让 lane 被悄悄吞掉是这条路最怕的事)
//     · via 拼接后仍不可行(回折 / 自重叠) → **原样返回作者的折点列**并报 `viaInfeasible`;
//       不换成"引擎自己找的一条" —— 那正是静默改写
//     · 畸形 via(非数组 / 非有限点) → 当场抛 `ShapeInputError`(与 guard.ts 同口径: 畸形入参是编程错误)
//   `via` 点**不含两端端口点**: 两端仍走端口协议(出盒沿法线一个 stub), 首末段长度不受 via 影响。
// ======================================================================

import { type Pt, type Rect, add, rectBottom, scl } from '../geometry/vec.js';
import {
  normalizeRoutePoints, firstBacktrackIndex, selfOverlapIndex,
} from '../geometry/predicates.js';
import { ShapeInputError, assertFiniteNumber } from '../guard.js';
// 代价向量(260919): 候选之间的**择优**改走它 —— 审美从此是"维度表里的行序", 不再是 if 分支。
// 只 import 比较器与量化器, 不把维度表整个搬进来(route 不该管"还有哪些维度")
import { type RouteCostDimension, compareRouteCost, routeCost } from './route-cost.js';
// 半像素尺子在 thresholds。值导入 audit 会把整座门禁求值进来
import { PIERCE_MIN } from './thresholds.js';
// 面上的点只许一份, 实现在几何层。再导出同一绑定, `knives/route` 的旧路径不变
export { type Side, type PortRef, portPoint, sideDir } from '../geometry/port.js';
import { type Side, type PortRef, portPoint, sideDir } from '../geometry/port.js';

export type RouteRequest = {
  from: Rect;
  fromPort: PortRef;
  to: Rect;
  toPort: PortRef;
  /** 出盒后的直段长度, 避免折点贴住盒角 */
  stub?: number;
  /** 腰线位置(覆盖自动中线): 竖直腰用 y, 水平腰用 x */
  lane?: number;
  /**
   * 作者给的**中间折点**(不含两端端口点) —— 对标 archify `connections[].via`, 纯声明、零算法。
   * 语义: `端口点 → via[0] → … → via[n] → 端口点`, 相邻两点之间由引擎插正交拐点。
   *
   * 这是**作者权威**: 引擎不生成也不替换这些点(不受 lane 可行域投影、不受任何自动避障影响 ——
   * core 不做避障)。给了 via 就等于由作者给出了中段主路径, 引擎只负责连成正交折线 + 校验可行性。
   * 给了 via 时 `lane` 全程不参与(报 `laneIgnored`); 空数组等同于没给(中间没有折点, lane 照常参与)。
   * 畸形入参(非数组 / 非有限坐标)当场抛 `ShapeInputError`, 不静默剔除。
   */
  via?: Pt[];
};

export type RouteResult = {
  /** 完整折点列(含两端端口点), 已规范化 */
  points: Pt[];
  /** 端口点, 供端点标记与 trim 使用 */
  from: Pt;
  to: Pt;
  /** 转折数(不含端点), 供 audit 与诊断用 */
  bends: number;
  /**
   * 作者给的 lane 落在可行域之外, 已被投影到边界(见文件头「腰线一律按可行域投影」)。
   * 报一声而不是静默改写: "静默忽略调用方参数" 正是这条路最怕的事 ——
   * 260917 实测的坏几何就来自一个越界 lane, 而当时没有任何东西告诉作者。
   */
  laneProjected?: boolean;
  /**
   * 作者给的 lane 在**这个拓扑下没有可行值**(竖腰线 Z 的可行域为空, 整条已改走横腰线)。
   * 与 `laneProjected` 的区别很硬: 投影是"你的值越界, 我挪到边界再走"; 这里是"这条路里根本
   * 没有能放下竖腰线的位置"。两者都报一声, 且互斥 —— 投影出来的边界值随竖腰线候选一起被弃时,
   * 只报 `laneInfeasible`(判决说的是**最终产物**怎么处理了作者的参数)。
   */
  laneInfeasible?: boolean;
  /**
   * `via` 与 `lane` 同时给了 → 按优先级 **via 胜**, lane 全程没有参与(连投影都没做)。
   * 与 `laneInfeasible` 分工很硬: 那个说的是"这个拓扑里没有能放下竖腰线的位置"(试过了, 放不下);
   * 这里说的是"压根没轮到它"(因为作者已经用 via 给出了中段路径)。
   * 两个标志不会同时出现 —— 报 laneIgnored 的那条路里 laneProjected / laneInfeasible 一律不置。
   */
  laneIgnored?: boolean;
  /**
   * 作者给的 `via` 拼接后**仍不可行**(折线回折或自重叠) —— 原样返回作者的折点列 + 报一声。
   * 不投影、不替换、不改写: 折点是作者权威, 引擎的职责是"连起来 + 说实话", 不是"替作者想一条"。
   * 调用方拿这个标志决定是改折点、改端口还是改布局。
   */
  viaInfeasible?: boolean;
};

const isVertical = (s: Side) => s === 'top' || s === 'bottom';

/** `via` 入参写错时的指路文案: 说清"不含端口点", 免得作者把端口点也写进来重复一遍 */
const HINT_VIA = 'via 是**不含两端端口点**的中间折点数组, 例: `via: [{ x: 300, y: 40 }, { x: 442, y: 40 }]`'
  + '(两端端口点由 fromPort/toPort 决定, 不要重复写进来; 出盒与入盒仍会自动留一个 stub)';

/**
 * via 读侧守卫: `undefined` / 空数组 → 没有中间折点(空数组等同没给, lane 照常参与);
 * 非数组或含非有限坐标 → **当场抛**(与 guard.ts 同一立场: 畸形入参是编程错误, 不是数据错误)。
 * 与 predicates 对非有限点的"剔除"口径不冲突: 那是谓词对**已有折线**做防御, 这里是入参边界。
 */
function readVia(req: RouteRequest): Pt[] | null {
  const via = req.via;
  if (via === undefined) return null;
  if (!Array.isArray(via)) {
    throw new ShapeInputError('routeOrthogonal', 'via', `不是折点数组(拿到 ${via === null ? 'null' : typeof via})`, HINT_VIA);
  }
  via.forEach((p, i) => {
    assertFiniteNumber('routeOrthogonal', `via[${i}].x`, p?.x, HINT_VIA);
    assertFiniteNumber('routeOrthogonal', `via[${i}].y`, p?.y, HINT_VIA);
  });
  return via.length ? via : null;
}

/** 端口点 + 出/入 stub 端点(对顶时各让一半)。via 分支与主路径共用, 保证"出盒沿法线一个 stub"不被绕开 */
function portStubs(req: RouteRequest, stub: number) {
  const from = portPoint(req.from, req.fromPort);
  const to = portPoint(req.to, req.toPort);
  const aD = sideDir(req.fromPort.side);
  const bD = sideDir(req.toPort.side);
  const aV = isVertical(req.fromPort.side);
  const bV = isVertical(req.toPort.side);
  // ① stub 只在**两根对顶**时各让一半(同向平行的 stub 不会互穿, 收短反而把作者的 lane 挤掉)
  const opposing = aD.x * bD.x + aD.y * bD.y < 0;
  const half = (sameAxis: boolean, gap: number) =>
    (sameAxis && opposing ? Math.max(0, Math.min(stub, gap / 2)) : stub);
  const a1 = add(from, scl(aD, aV ? half(aV && bV, Math.abs(to.y - from.y)) : half(!aV && !bV, Math.abs(to.x - from.x))));
  const b1 = add(to, scl(bD, bV ? half(aV && bV, Math.abs(to.y - from.y)) : half(!aV && !bV, Math.abs(to.x - from.x))));
  return { from, to, a1, b1, opposing, aD, bD, aV, bV };
}

// --- 腰线可行域: 单边路由与批量分配器的**同一份**口径 (260919) ---------------
//
// 为什么要抽出来: `assignLanes` 必须在"这条边能吃在哪条腰线上"的**同一个**可行域里分配。
// 若分配器另写一套判据(哪怕只差一点), 分配出来的值会被 `laneFor` 判成越界而投影 —— 门禁于是
// 在"分配器自认为已经错开"的图上继续喊 `edge_overlap`, 而作者看到的是两条互相矛盾的结论。
// 所以 `laneFor` 与 `laneSlot` 走同一个 `laneRange`, **不许双源**。

/**
 * 腰线**值域**(不含轴向): 对顶 → 两 stub 之间(闭区间); 同向平行 → 出口方向那一侧, 一端是半轴。
 * 半轴用 ±Infinity 表达, 调用方 `clamp` 一次即可得到与老实现逐字节相同的结果。
 */
function laneRange(
  av: number,
  bv: number,
  dir: number,
  opposing: boolean,
): { lo: number; hi: number; preferred: number } {
  const lo = Math.min(av, bv);
  const hi = Math.max(av, bv);
  if (opposing) return { lo, hi, preferred: (av + bv) / 2 };
  return dir < 0 ? { lo: -Infinity, hi: lo, preferred: lo } : { lo: hi, hi: Infinity, preferred: hi };
}

/** `portStubs` 的返回形状(它没显式声明类型, 这里给探针引用) */
type Stubs = ReturnType<typeof portStubs>;

/**
 * 在**缺省腰线位**(`preferred`)上拼一条折线, 用来问"这个拓扑里竖/横腰线到底有没有处落"。
 *
 * 判据用**折线实测**而不是另写一套"相背/背对背"的几何条件 —— 与 route 实际挑候选的逻辑同源,
 * 不会漂开; 也不必枚举所有拓扑(这个函数的边界条件多到写不完)。
 * 取 `preferred` 而非法遍历候选值: 它是引擎**本来就会选**的那条 —— 若引擎的自动位都回折,
 * 这条边就属于 route 的已知边界(见文件头 ③), 给 lane 也是徒劳, 分配器不该在这种边上占轨道。
 */
function probeAtPreferred(st: Stubs, r: { preferred: number }, vertical: boolean): Pt[] {
  return normalizeRoutePoints(vertical
    // 竖直-竖直: 腰线是 y, 折点落在两 stub 那一列
    ? [st.from, st.a1, { x: st.a1.x, y: r.preferred }, { x: st.b1.x, y: r.preferred }, st.b1, st.to]
    // 水平-水平: 腰线是 x, 折点落在两 stub 那一行
    : [st.from, st.a1, { x: r.preferred, y: st.a1.y }, { x: r.preferred, y: st.b1.y }, st.b1, st.to]);
}

/**
 * 一条边"腰线能吃在哪一段"的完整描述 —— `assignLanes` 的输入, 也是作者查"为什么这条边没分到 lane"的入口。
 *
 * `null` 是三种**正常**情形, 不是错误(对应 route 里 lane 不参与或无处可落的路径):
 *   · 给了非空 `via` —— lane 全程不参与(见文件头第四条)
 *   · L 形拓扑(一出竖直一出水平) —— 两种拐法都不经过腰线, 给了也无处落
 *   · 缺省腰线位就回折 —— 这个拓扑里腰线没有处落(如水平对顶**同行**: 竖腰线退化成一条横线,
 *     route 已改走横腰线; 竖向背对背同理, 见文件头 ③)
 */
export type LaneSlot = {
  /** 腰线段的方向: 竖腰线落在 y 上(`'y'`), 横腰线落在 x 上(`'x'`) */
  axis: 'y' | 'x';
  /** 腰线值的可行域(含端点)。同向平行时是一侧半轴 ⇒ 某端可能为 ±Infinity */
  lo: number;
  hi: number;
  /** 没给 lane 时引擎会用的值(对顶取两 stub 中点 / 平行取出口侧边界) */
  preferred: number;
  /** 腰线**段**在带轴上的投影区间 —— 聚带判据: 同轴且区间重叠的两条边才需要互相错开 */
  span: [number, number];
  /** 出口端在带轴上的坐标(竖腰线 = `a1.x`) —— `assignLanes` 靠它保序, 顺序对了边才不交叉 */
  origin: number;
};

/** 读一条边的腰线可行域(见上面三条 null 情形)。畸形 `via` 照旧当场抛, 与 `routeOrthogonal` 同口径 */
export function laneSlot(req: RouteRequest): LaneSlot | null {
  if (readVia(req)) return null;
  const st = portStubs(req, req.stub ?? 18);
  if (st.aV && st.bV) {
    const r = laneRange(st.a1.y, st.b1.y, st.aD.y, st.opposing);
    if (firstBacktrackIndex(probeAtPreferred(st, r, true)) >= 0) return null;
    return {
      axis: 'y', ...r,
      span: [Math.min(st.a1.x, st.b1.x), Math.max(st.a1.x, st.b1.x)],
      origin: st.a1.x,
    };
  }
  if (!st.aV && !st.bV) {
    const r = laneRange(st.a1.x, st.b1.x, st.aD.x, st.opposing);
    if (firstBacktrackIndex(probeAtPreferred(st, r, false)) >= 0) return null;
    return {
      axis: 'x', ...r,
      span: [Math.min(st.a1.y, st.b1.y), Math.max(st.a1.y, st.b1.y)],
      origin: st.a1.y,
    };
  }
  return null;
}

/** 相邻两锚点之间的正交连接变体(不含起点, 起点是上一个锚点): 已对齐只剩直连一条, 否则两种拐法 */
function jointVariants(a: Pt, b: Pt): Pt[][] {
  if (Math.abs(a.x - b.x) < 1e-9 || Math.abs(a.y - b.y) < 1e-9) return [[b]];
  return [[{ x: b.x, y: a.y }, b], [{ x: a.x, y: b.y }, b]];
}

/**
 * via 中间折点的路由(见文件头第四条)。
 *
 * 拼接: `from → a1 → via… → b1 → to`; 相邻锚点之间插正交拐点, 两端仍由 `portStubs` 给出 stub 点,
 * 所以"出盒沿法线一个 stub"与"对顶各让一半"两条既有约束原封不动。
 * 拐法沿用与 L 形**同一套**策略(两种拐法都生成, 择优), 不另造几何:
 *   · 关节数 ≤ 8(via ≤ 7 点) → 枚举 2^关节 种组合, 取第一个既无 `firstBacktrackIndex`、
 *     也无 `selfOverlapIndex` 的(先横后竖 = 第 0 变体, 枚举序即确定性)
 *   · 更长的链 → 逐关节取第一个"不让已拼接前缀回折"的拐法(O(n) 确定性退化, 不做启发式搜索)
 * 全坏时返回**第一个候选**(作者的折点原样保留)并置 `viaInfeasible`, 绝不静默换一条。
 */
function viaRoute(req: RouteRequest, via: Pt[], e: { from: Pt; to: Pt; a1: Pt; b1: Pt }): RouteResult {
  const anchors = [e.a1, ...via, e.b1];
  // 关节只负责"从上一个锚点走到下一个锚点", 起点锚点自己要先落进折点列(否则首段会斜着飞出去)
  const joints = anchors.slice(1).map((b, i) => jointVariants(anchors[i], b));
  let cands: Pt[][];
  if (joints.length > 8) {
    // 超长链的确定性退化: 逐关节取第一个"不让已拼接前缀回折"的拐法(局部判据, O(n), 不做启发式搜索)
    const seq: Pt[] = [e.a1];
    for (const vs of joints) {
      const pick = vs.find((v) => firstBacktrackIndex(normalizeRoutePoints([e.from, ...seq, ...v])) < 0) ?? vs[0];
      seq.push(...pick);
    }
    cands = [normalizeRoutePoints([e.from, ...seq, e.to])];
  } else {
    cands = [];
    for (let mask = 0; mask < 1 << joints.length; mask++) {
      const seq: Pt[] = [e.a1];
      joints.forEach((vs, k) => seq.push(...(vs[(mask >> k) & 1] ?? vs[0])));
      cands.push(normalizeRoutePoints([e.from, ...seq, e.to]));
    }
  }
  const valid = cands.find((p) => firstBacktrackIndex(p) < 0 && selfOverlapIndex(p) < 0);
  const points = valid ?? cands[0];
  return {
    points, from: e.from, to: e.to, bends: Math.max(0, points.length - 2),
    // 与 lane 同时给: via 胜, lane 连投影都没做 —— 报一声, 不许静默吞掉调用方参数
    ...(req.lane === undefined ? {} : { laneIgnored: true }),
    ...(valid ? {} : { viaInfeasible: true }),
  };
}

/**
 * 正交路由(单折腰线版)。
 *
 * 规则按"出方向 vs 入方向"分四种情形选折法:
 *   竖直-竖直 → Z 形(腰线取两 stub 中点 y, 或 lane 覆盖)
 *   水平-水平 → Z 形(腰线取中点 x)
 *   竖直-水平 → L 形(先沿出方向到目标 y, 再横进)
 *   水平-竖直 → L 形
 * 同轴且已对齐的情形会自然退化成直线(normalize 会把中点吃掉)。
 *
 * 候选逐个用 `firstBacktrackIndex` 验: 取第一个不自重叠的。
 * 这不是"猜意图", 而是**不许吐坏几何** —— 坏几何会直接流进产物, 而门禁看不见它。
 *
 * 唯一的例外分支是"水平-水平 + 对顶相背": 竖腰线 Z 在那里**没有可行解**(见文件头 ③),
 * 便追加横腰线候选(`transposedRoute`); 它排在竖腰线候选之后, 所以正常拓扑一个字节都不变。
 *
 * 给了 `via` 时整条改走 `viaRoute`(见文件头第四条) —— 主路径一个字节都不动。
 */
export function routeOrthogonal(req: RouteRequest): RouteResult {
  const stub = req.stub ?? 18;
  const via = readVia(req);
  // `bD` 只在本函数用不到的对称位上(portStubs 内部自用), 不解构以免 noUnusedLocals 报错
  const { from, to, a1, b1, opposing, aD, aV, bV } = portStubs(req, stub);
  if (via) return viaRoute(req, via, { from, to, a1, b1 });

  /**
   * 腰线投影到可行域: 对顶 → [lo,hi] 区间内; 平行 → 只能落在出口方向那一侧(否则要先越过再折回)。
   * 可行域本身走 `laneRange`(与 `laneSlot` 同一份来源) —— 这里只剩"要不要投影"的判决。
   */
  let projected = false;
  const laneFor = (av: number, bv: number, dir: number): number => {
    const r = laneRange(av, bv, dir, opposing);
    const want = req.lane ?? r.preferred;
    const used = Math.min(Math.max(want, r.lo), r.hi);
    if (req.lane !== undefined && Math.abs(used - req.lane) > 1e-9) projected = true;
    return used;
  };

  const candidates: Pt[][] = [];
  /** 横腰线候选在 candidates 里的下标 —— 用来判"作者给的 lane 到底有没有落位"(见返回值) */
  let altIndex: number | undefined;

  if (aV && bV) {
    const y = laneFor(a1.y, b1.y, aD.y);
    candidates.push([from, a1, { x: a1.x, y }, { x: b1.x, y }, b1, to]);
  } else if (!aV && !bV) {
    const x = laneFor(a1.x, b1.x, aD.x);
    candidates.push([from, a1, { x, y: a1.y }, { x, y: b1.y }, b1, to]);
    // ③ 竖腰线 Z 走不通时(同轴对顶且**相背**: a1 在 b1 里侧)改走横腰线。只给对顶追加:
    // 同向平行的 stub 共享一个可行侧, 永远不进这个死局 —— 顺手给它们塞横腰线候选只会把
    // 作者指定的 lane 挤掉(首版收短 stub 就踩过这个坑, 见文件头 ①)
    if (opposing) {
      const alt = transposedRoute(from, a1, b1, to, req.from, req.to, stub);
      if (alt) { altIndex = candidates.length; candidates.push(alt); }
    }
  } else if (aV) {
    // 竖直出、水平入: 两种拐法都试 —— "先竖到目标行"与"先横到目标列"
    candidates.push([from, a1, { x: a1.x, y: b1.y }, b1, to]);
    candidates.push([from, a1, { x: b1.x, y: a1.y }, b1, to]);
  } else {
    // 水平出、竖直入
    candidates.push([from, a1, { x: b1.x, y: a1.y }, b1, to]);
    candidates.push([from, a1, { x: a1.x, y: b1.y }, b1, to]);
  }

  const built = candidates.map((c) => normalizeRoutePoints(c));
  const idx = built.findIndex((p) => firstBacktrackIndex(p) < 0);
  const points = idx >= 0 ? built[idx] : built[built.length - 1];
  // 竖腰线候选整条被弃时只报 laneInfeasible: 此处的 laneProjected 说的"已投影到边界"是条
  // 没兑现的判决(投影值随候选一起被丢掉了), 两条一起报反而误导调用方
  const laneFlag = req.lane === undefined ? {}
    : idx === altIndex ? { laneInfeasible: true }
      : projected ? { laneProjected: true } : {};
  return { points, from, to, bends: Math.max(0, points.length - 2), ...laneFlag };
}

/**
 * 对顶水平的**横腰线**折点列(竖腰线 Z 的转置): 出 stub → 竖到第 Y' 行 → 横到 b1 列 → 竖直进 b1。
 *
 * 什么时候只有它能走: 两 stub 相背(源往西出、目标从东进)时竖腰线 Z 的可行域是空集 ——
 * "先西出再东进"这句话只能在**另一行**上兑现, 于是 Y' 不能是两个 stub 所在的行:
 *   · 两端口错行 → 取两行**中间行**, 与竖腰线取中点同源(走廊通畅时一点绕行都不产生)
 *   · 两端口同行 → 没有中间行可用, 只剩**绕两盒顶 / 绕两盒底**, 各留一个 stub 的净空
 *
 * 择优(260919 **表达式化**): 走 `compareRouteCost` 的代价向量, 不再把审美写进 if 分支。
 * 只启用与表达式化之前**逐字等价**的三维 —— 回折 → 端点擦盒 → 绕路:
 *   · `backtrackPx === 0` 与旧版 `firstBacktrackIndex >= 0 → continue` 等价(谓词与量化同一判据)
 *   · `endpointBitePx < PIERCE_MIN` 与旧版 `clearance <= 0 → continue` 等价 —— 缺口是
 *     `max(0, PIERCE_MIN - 净空)`, 所以"净空为正"⇔"缺口小于半像素"。**这不是新阈值**,
 *     而是把旧判据的 `0` 用代价层的刻度重新表达了一次
 *   · 这一族候选**起终点相同** ⇒ 曼哈顿直径相等 ⇒ `stretchMilli` 的次序与裸长度一致
 *   · 等长时取**先枚举的**(绕顶排在绕底前) —— 由 `ordinal` 破平显式承担, 不靠比较的副作用
 *   · 两轮都空 ⇒ 返回 null, 调用方据此**不追加**候选(旧版 `pick(true) ?? pick(false)` 同义)
 * 其余维度(弯数 / 穿盒 / 走廊 / 交叉)在本场景恒为 0 或不参与 —— 一旦放开排序就会变, 那是
 * "更优解", 但要单独拍板 + 重出 golden, 见 `route-cost.ts` 文件头的接线状态。
 * 等价证据: `test/route-pick-equivalence.test.ts`(288 组合逐字节扫描, 随 `bun run verify` 跑)。
 */
const TRANSPOSED_PICK_COST: readonly RouteCostDimension[] = ['backtrackPx', 'endpointBitePx', 'stretchMilli'];

function transposedRoute(from: Pt, a1: Pt, b1: Pt, to: Pt, rFrom: Rect, rTo: Rect, stub: number): Pt[] | null {
  const above = Math.min(rFrom.y, rTo.y) - stub;
  const below = Math.max(rectBottom(rFrom), rectBottom(rTo)) + stub;
  const rows = a1.y === b1.y ? [above, below] : [(a1.y + b1.y) / 2, above, below];
  const scored = rows.map((y, ordinal) => {
    const pts = normalizeRoutePoints([from, a1, { x: a1.x, y }, { x: b1.x, y }, b1, to]);
    return { pts, cost: routeCost(pts, { endpointRects: [rFrom, rTo], ordinal }) };
  });
  /** 硬闸(不是降权): 回折的候选一律出局; strict 轮里"贴着端点盒"同样出局 */
  const pick = (strict: boolean): (typeof scored)[number] | null => {
    const eligible = scored.filter(({ cost }) => (
      cost.backtrackPx === 0 && (!strict || cost.endpointBitePx < PIERCE_MIN)
    ));
    if (!eligible.length) return null;
    return eligible.reduce((a, b) => (compareRouteCost(a.cost, b.cost, TRANSPOSED_PICK_COST) <= 0 ? a : b));
  };
  return (pick(true) ?? pick(false))?.pts ?? null;
}

/** 批量路由一批边(同一请求形状), 供上层做"一次调用拿全部折点列" */
export function routeAll(reqs: RouteRequest[]): RouteResult[] {
  return reqs.map(routeOrthogonal);
}
