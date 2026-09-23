// =====================================================================
// knives/route-pair · 成对连线(双线): 同一对端口上的两条平行线
//
// 由来(260920 ontology 图): `Flight --Departed From--> Airport` 与
// `Flight --Arrived To--> Airport` 是**同一对实体上的两条关系**, 版式上是两条相距十几像素的
// **平行线**(每条各带自己的方向箭头与沿线标签)。core 此前只能用两条独立边去凑 —— 而"凑"的
// 代价是作者得手算两个端口偏移量, 于是两条线必然不平行、间距必然不等(实测: 手写 at 差 3px
// 就已经能看出来)。
//
// **一条权威几何, 两条平移拷贝** —— 这是本刀唯一的机制, 也是它与"再写一个路由器"的分界:
//   · 中线交给**单线那条路**(`routeOrthogonal`: 端口协议 / stub / lane / via / 可行性标志全照旧)
//   · 成对关系只做一件事: 沿**成对法线**把中线整体平移 ±gap/2
// 为什么是"整体平移"而不是"给两个端口各路由一次": 后者在两条线拓扑不同(一条 L 形、一条 Z 形)时
// 会给出**不平行**的一对 —— 而平行正是"这是一对"的唯一视觉信号。平移出来的两条线拓扑恒相同,
// 凭构造保证平行。代价也如实说: 端点会跟着平移, 落在面的哪一侧由 `gap` 与端口位置共同决定,
// 于是本刀**报** `onFace`(端口太靠角时会给 false), 但不替作者挪端口(端口是作者决策)。
//
// 边界(明确不做):
//   · 不改端口分散策略 —— 一条边上挂 3 条以上关系仍要作者自己给 `at` 摊开(本刀只管成对)
//   · 不做"自动折返"(两条线一条去一条回是**两条边**的事, 与几何无关)
//   · 不平移节点、不动版式(与 `assignLanes` 同立场: 旋钮不是门禁)
// =====================================================================

import { type Pt, type Rect, rectBottom, rectRight, round1 } from '../geometry/vec';
import { ShapeInputError, assertFiniteNumber } from '../guard';
import { type PortRef, type RouteRequest, type RouteResult, routeOrthogonal } from './route';
// 标签的落位与角度走 `shapes/edge` 的那两份(标签几何只许有一处), 本刀只负责"哪条线配哪个字、
// 字该落在哪一侧"
import { type SceneLabel } from './audit';
import { edgeLabel, labelAnchor, labelAngle } from '../shapes/edge';

/** 两条线的中心距缺省(px)。够放一个 11px 的标签 + 两侧各一点呼吸位 */
export const PAIR_GAP = 22;

/** 成对标签离自己那条线的距离缺省(px) —— 与"两条线之间"的 `PAIR_GAP` 分工不同: 那是线距, 这是线到字 */
export const PAIR_LABEL_GAP = 14;

export type PairRouteOptions = RouteRequest & {
  /** 两条线的中心距(px), 缺省 `PAIR_GAP`。**顺序约定**: 线 0 在 `-normal` 侧, 线 1 在 `+normal` 侧 */
  gap?: number;
};

export type PairRouteResult = {
  /** 实际采用的中心距 */
  gap: number;
  /** 两条线的折点列 —— 顺序即 [0, 1], 与 `pairLabels` 的标签顺序一一对应 */
  points: [Pt[], Pt[]];
  /**
   * **成对法线**(单位向量, 主轴的法向): 线 0 在 `-normal` 侧, 线 1 在 `+normal` 侧。
   * 主轴取"起终点位移较大的那根轴"(竖向为主 → 法线走 x; 横向为主 → 法线走 y)。
   * 它是两条线与它们标签的**公共参照系** —— `pairLabels` 靠它决定"哪边算外侧"。
   */
  normal: Pt;
  /** 主轴: `x` = 两条线沿 y 平移(竖向为主); `y` = 沿 x 平移(横向为主) */
  normalAxis: 'x' | 'y';
  /**
   * **中线**的完整路由结果(两条线共同的那条参考线) —— 可行性标志全在这一份上。
   * 刻意**不叫 `routes[2]`**: 两条线的折点列在 `points` 里, 而"这一份几何是从哪条中路来的"
   * 是一件事。塞两份一模一样的 RouteResult 进数组, 迟早有人去读 `routes[0].points` 拿到中线。
   */
  midline: RouteResult;
  /**
   * 两条线的端点是**否仍落在原来的那个面上**(各自两端都算) —— 端口贴着盒角 + gap 一大,
   * 平移后的端点就会滑出那个面, 于是线看起来"从盒角外侧悬空长出来"。
   * 报而不改: 收小 gap 或把端口往里挪(`at` / `t`)是作者的决策。
   */
  onFace: [boolean, boolean];
};

/** 端点是否还贴在那个面上(半像素容差: route 的端口本来就是按整数坐标给的) */
function liesOnFace(r: Rect, port: PortRef, at: Pt, tol = 0.5): boolean {
  switch (port.side) {
    case 'top': return Math.abs(at.y - r.y) <= tol && at.x >= r.x - tol && at.x <= rectRight(r) + tol;
    case 'bottom': return Math.abs(at.y - rectBottom(r)) <= tol && at.x >= r.x - tol && at.x <= rectRight(r) + tol;
    case 'left': return Math.abs(at.x - r.x) <= tol && at.y >= r.y - tol && at.y <= rectBottom(r) + tol;
    case 'right': return Math.abs(at.x - rectRight(r)) <= tol && at.y >= r.y - tol && at.y <= rectBottom(r) + tol;
  }
}

/**
 * 成对路由: **单线路由一次 → 沿法线平移两条**。
 *
 * 顺序语义值得再念一遍(它是这套 API 唯一容易记错的地方):
 * 把"起点 → 终点"看成一根有向轴, 从起点朝终点看, **左手边是线 0, 右手边是线 1**
 * (`normal` 是屏幕 y-down 坐标下该轴的法线)。
 *
 * ```ts
 * const pair = routePair({
 *   from: flight, fromPort: { side: 'top' }, to: airport, toPort: { side: 'bottom' }, gap: 24,
 * });
 * // pair.points[0] = "Departed From" 那条(靠左), pair.points[1] = "Arrived To" 那条(靠右)
 * scene.edges = pair.points.map((points, i) => ({ id: `e${i}`, points, end: 'arrow-triangle' }));
 * scene.labels = pairLabels(pair, ['Departed From', 'Arrived To']);
 * ```
 */
export function routePair(req: PairRouteOptions): PairRouteResult {
  const gap = req.gap ?? PAIR_GAP;
  assertFiniteNumber('routePair', 'gap', gap, '成对连线的中心距, 不传走 PAIR_GAP');
  if (!(gap > 0)) {
    throw new ShapeInputError('routePair', 'gap', `必须为正(拿到 ${gap})`, '两条线重合等于一条线 —— 要一条线就别走成对路由');
  }
  const half = round1(gap / 2);
  const mid = routeOrthogonal(req);
  const first = mid.points[0];
  const last = mid.points[mid.points.length - 1];
  // 主轴 = 起终点位移较大的那根轴。竖着走的两条线要"左右分开"(法线走 x), 横着走的要"上下分开"
  const alongX = Math.abs(last.x - first.x) >= Math.abs(last.y - first.y);
  const normal: Pt = alongX ? { x: 0, y: 1 } : { x: 1, y: 0 };
  const normalAxis: 'x' | 'y' = alongX ? 'y' : 'x';

  const shift = (k: number): Pt[] =>
    mid.points.map((p) => ({ x: round1(p.x + normal.x * k), y: round1(p.y + normal.y * k) }));
  const points: [Pt[], Pt[]] = [shift(-half), shift(half)];

  const faceOk = (pts: Pt[], rect: Rect, port: PortRef, atStart: boolean): boolean =>
    liesOnFace(rect, port, atStart ? pts[0] : pts[pts.length - 1]);

  return {
    gap,
    points,
    normal,
    normalAxis,
    // 两条线的路由结果就是中线那一份(几何同拓扑, 标志位同源) —— 不伪造两份"看起来独立"的结果
    midline: mid,
    onFace: [
      faceOk(points[0], req.from, req.fromPort, true) && faceOk(points[0], req.to, req.toPort, false),
      faceOk(points[1], req.from, req.fromPort, true) && faceOk(points[1], req.to, req.toPort, false),
    ],
  };
}

// --- 成对标签(每条线一个, 落在自己那条线的外侧) ---------------------------

export type PairLabelOptions = {
  /** 文字离自己那条线的距离(px), 缺省 `PAIR_LABEL_GAP` */
  offset?: number;
  /** 标签字号(px) —— 与 `edgeLabel` / `labelBoxSize` 同一处缺省 */
  fontSize?: number;
  /** 两条标签的 id(缺省 `L-pair0` / `L-pair1`) */
  ids?: [string, string];
};

/**
 * 成对标签: **每条线一个**, 落在自己那条线的**外侧**, 并沿线旋转(`labelAngle`)。
 *
 * 三条口径值得点名:
 *  · **外侧**由 `pair.normal` 决定(线 0 在 `-normal` 侧 ⇒ 它的字也在 `-normal` 侧), 于是
 *    "两条线的字各朝外"这件事不需要作者再算一遍
 *  · 落位走 `edgeLabel` 的**显式 `at`**(不是"先让它算一个再改掉"), 旋转走 `rotate`
 *  · 返回 `SceneLabel[]` 直接并进 `scene.labels`; **文字的上屏由出口统一做**,
 *    本函数只产几何(与 `edgeLabel` 同一条纪律: 标签位置不许有两个来源)
 */
export function pairLabels(pair: PairRouteResult, texts: readonly [string, string], o: PairLabelOptions = {}): SceneLabel[] {
  const offset = o.offset ?? PAIR_LABEL_GAP;
  assertFiniteNumber('pairLabels', 'offset', offset);
  if (!(offset >= 0)) {
    throw new ShapeInputError('pairLabels', 'offset', `为负(${offset})`, '标签离线的距离是尺寸不是增量; 想让字压在线上的话 offset 给 0');
  }
  const outward = round1(pair.gap / 2 + offset);
  const place = (i: 0 | 1, text: string): SceneLabel => {
    const mid = labelAnchor(pair.points[i], 0);
    const sign = i === 0 ? -1 : 1;
    const at: Pt = {
      x: round1(mid.x + pair.normal.x * outward * sign),
      y: round1(mid.y + pair.normal.y * outward * sign),
    };
    const id = o.ids?.[i] ?? `L-pair${i}`;
    // 显式 at + rotate 一起给: 落位由本函数按"外侧"算好, `edgeLabel` 只做度量与装配
    return edgeLabel({ id, points: pair.points[i] }, text, {
      at, rotate: labelAngle(pair.points[i]), fontSize: o.fontSize, id,
    });
  };
  return [place(0, texts[0]), place(1, texts[1])];
}
