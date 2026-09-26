// =====================================================================
// knives/constraints · 一维约束账本 + 最长路: 一串"从 a 到 b 至少 N" → 一串位置
//
// 为什么要有它(260922, TODO 档 3.6 步 3): 本仓此前的刀**全是局部的** —— `route` 一条边 /
// `assignLanes` 一束边 / `nodeFit` 一个盒 / `nudge` 一组矩形 / `fitScene` 只 bbox + 平移。
// 没有一把回答得了"这些位置**互相**提的要求加起来, 谁该在哪"。而那正是版式推导的日常:
// 逐格需求好写(一格自己的事), 一旦出现**跨格**要求(一段区间横跨 3 列要装下一个标题),
// "逐格取 max" 就不再成立 —— 要求沿链**累积**, 且必须说清是哪一条把它顶开的。
//
// 判据(怎么算解完):
//   · 多源最小值竞争时取到**真正起作用**的那条(最长路 = 每个位置取所有入边的最大下界)
//   · `winners` / `attribution` 与解一致 —— 读得出"这一格是谁顶开的"
//   · 约束图有环(`from >= to`)当场拒绝, 不靠迭代转死
//
// ⚠ 边界宪章(与 `nodeFit` 给"内容下限"而非"该给多少"是同一条立场):
//   · **不注入任何缺省间距** —— 无约束 ⇒ 所有位置 = `origin`。栅格口径(列距下限 / 行距)是
//     **政策**, 政策属调用方(`templates/sequence.ts` 自己把 `colGapMin` 喂成一条约束)。
//     内核里写死一个缺省间距, 等于把某张模板的口味焊进所有图。
//   · **不判对错** —— 它不解"排布合理吗", 只解"满足这一组下界的最小解"。好不好是门禁与作者的
//     事(与 `route-cost` "是读数不是门禁"同族)。
//   · 只解**一维**且**单调**: `from < to` 是硬前提(位置随下标不减)。二维要的是另一套东西
//     (力导向 / 图分割), 不是本刀加个 axis 参数能糊过去的。
//
// 算法(确定性, 无随机; 同输入必得同输出):
//   ① 守卫: 索引 / minimum 逐条守, `from >= to` 当场抛 `ShapeInputError`
//   ② 量化: 每条 minimum **向上**抬到 0.1 网格 —— 账本内部只出现网格上的数
//   ③ 松弛: 按 `to` 升序(`from < to` ⇒ 这已是拓扑序), 逐条 candidate = pos[from] + minimum,
//      谁大用谁; 并把"这条约束 + 它 from 端那串链条"的 contributor 记成 pos[to] 的来源
//   ④ 位置再**向上**取到 0.1 —— 见 `roundUp1` 的注释(向下取会把 "≥ N" 偷偷改成 "差点不够")
//   ⑤ `tight` / `attribution` 从**最终解**反读, 不在松弛途中随手记(免得半成品状态进账)
//
// 为什么一趟扫描就够: `from < to` 让"按 to 升序"成为合法拓扑序, 每一轮用到的 pos[from] 都已定稿 ——
// 一趟下来每个位置拿到的就是所有下界的最小上界(最长路)。不需要迭代到不动点(那是非线性才要的)。
// =====================================================================

import { ShapeInputError, assertFiniteNumber } from '../guard.js';
import { codepointSort, round1 } from '../geometry/vec.js';

/**
 * 位置的分辨率 = 0.1 格(十分位)。乘除一律走整数十, 不写 `0.1`: `x / 10` 是正确舍入的一步,
 * 而 `x * 0.1` 会带进二进制尾巴(1240 × 0.1 = 124.00000000000001), 让 `tight` 的判等凭空差一点点。
 * 分辨率本身与全仓 `round1` 用的是同一把尺子。
 */
const TENTHS = 10;
/** 浮点比较余量: 只吸掉二进制尾巴(12.4 × 10 = 124.00000000000001), 不吸掉真实的 0.1 */
const EPS = 1e-9;

/**
 * 向上取到 0.1 格。
 *
 * ⚠ **必须向上**: 向下取整会把 `positions[to] - positions[from] >= minimum` 悄悄变成"差点不够"
 * —— 账本自己先撒了谎, 门禁又看不见(少 0.04px 谁都不会报), 而版式真的会挤。
 * `- EPS` 只为抵消二进制尾巴: 没有它, 一个本来就落在网格上的值会被自己抬高一格。
 */
const roundUp1 = (v: number): number => {
  const n = Math.ceil(v * TENTHS - EPS);
  // `ceil(-EPS) = -0`: 负零在几何里就是零, 在断言与序列化里却不是 —— 当场归一, 别让它漏出去
  return n === 0 ? 0 : n / TENTHS;
};

/** 一条"从 a 到 b 至少 N"的要求 */
export type AxisConstraint = {
  /** 变量下标(左端 / 在前的那个) */
  from: number;
  /** 变量下标(右端); 必须 > `from` —— 见文件头"只解一维且单调" */
  to: number;
  /** 下界: `positions[to] - positions[from] >= minimum`。可以给 0(等于没提间距要求), 不许为负 */
  minimum: number;
  /** 谁提的这条要求(如 `label:m4` / `box:gw→db`)。只用于账目可读, 不参与求解 */
  contributor?: string;
};

/** 一维账本的解 + 全账 */
export type AxisPlan = {
  /** 解出来的位置(长度 = count); 无约束时每一位都是 `origin` */
  positions: number[];
  /** 相邻差值: `gaps[i] = positions[i+1] - positions[i]`, 长度 = count - 1(单变量 = 空数组) */
  gaps: number[];
  /**
   * 每个位置被哪条约束顶出来的(与 `positions` 同序); `null` = 没有任何约束把它推离 `origin`。
   * ⚠ 挂的是**生效副本** —— 里面那个 `minimum` 已抬到 0.1 网格, 就是真正驱动解的数(见 `solveAxis`)
   */
  winners: Array<AxisConstraint | null>;
  /** 顶住解的约束(实得差值恰等于它的 minimum); 同序于输入的规范序; 同为生效副本 */
  tight: AxisConstraint[];
  /** 每格列距的账: `index` = 格序(即 `gaps` 下标), `by` = 跨过这一格且**紧住**的那些约束的 contributor(去重 + codepoint 序) */
  attribution: Array<{ index: number; by: string[] }>;
};

/**
 * 解一维约束账本(见文件头)。
 *
 * `origin` 只是**坐标原点**(第一个变量的位置), 不是缺省间距 —— 不给就是 0。它原样参与松弛,
 * 但末了所有位置要一起向上取到 0.1 网格: 落不到网格上的 `origin`(如 `margin + 半盒宽` 这类
 * 带小数的锚点)至多被推高 0.1 —— 向上这条底线不许破, 少留 0.04px 谁都不会报, 而版式真的会挤。
 * ⚠ 所以想让锚点**一个字节都不动**, 就在调用方把它加回去(见 `templates/sequence.ts` ⑤)。
 *
 * 畸形入参一律当场抛(`ShapeInputError`), 与 `guard.ts` 同一口径: 编程错误不静默兜底。
 */
export function solveAxis(input: { count: number; origin?: number; constraints?: AxisConstraint[] }): AxisPlan {
  if (!input || typeof input !== 'object') {
    throw new ShapeInputError('solveAxis', 'input', `不是对象(拿到 ${typeof input})`, '要 `{ count, origin?, constraints? }`; 只有一个变量就写 `{ count: 1 }`');
  }
  const count = input.count;
  if (!Number.isInteger(count) || count < 1) {
    throw new ShapeInputError('solveAxis', 'count', `不是 ≥1 的整数(拿到 ${String(count)})`, '变量个数就是账本的行数; 空账本没有"解"可言');
  }
  const origin = input.origin ?? 0;
  assertFiniteNumber('solveAxis', 'origin', origin, 'origin 是原位(第一个变量的位置), 不是缺省间距; 不给就是 0');

  const given = input.constraints ?? [];
  if (!Array.isArray(given)) {
    throw new ShapeInputError('solveAxis', 'constraints', `不是数组(拿到 ${typeof given})`, '不写 = 没有任何要求');
  }

  // ① 逐条守卫 + ② 量化。上账的是**生效副本**: 里面那个 minimum 就是真正驱动解的数
  // (调用方给的 12.34 会以 12.4 上账), 于是 `tight` 的判等永远成立, 不会差着半根尾巴。
  const ledger = given.map((c, k) => {
    if (!c || typeof c !== 'object') {
      throw new ShapeInputError('solveAxis', `constraints[${k}]`, `不是对象(拿到 ${typeof c})`, '一条要求长这样: `{ from: 0, to: 2, minimum: 240, contributor: \'phase:读请求\' }`');
    }
    const { from, to } = c;
    if (!Number.isInteger(from) || from < 0) {
      throw new ShapeInputError('solveAxis', `constraints[${k}].from`, `不是 ≥0 的整数(拿到 ${String(from)})`, 'from / to 是变量下标', '索引参数');
    }
    if (!Number.isInteger(to) || to < 0 || to >= count) {
      throw new ShapeInputError('solveAxis', `constraints[${k}].to`, `不是 [0, ${count - 1}] 里的整数(拿到 ${String(to)})`, `本账本有 ${count} 个变量`, '索引参数');
    }
    if (from >= to) {
      throw new ShapeInputError(
        'solveAxis', `constraints[${k}].to`, `不大于 from(${from} → ${to})`,
        '本刀只解前向单调约束(from < to): 位置随下标不减, 所以"按 to 升序松弛"才算合法拓扑序。'
        + 'from >= to 说明需求自己绕成了环(self-loop / 互相指认), 该由调用方重写要求 —— 迭代硬转只会把矛盾拖进产物',
        '约束索引',
      );
    }
    assertFiniteNumber('solveAxis', `constraints[${k}].minimum`, c.minimum, 'minimum 是差值口径的下界(可以给 0); undefined 多半是字段名写错了');
    if (c.minimum < 0) {
      throw new ShapeInputError('solveAxis', `constraints[${k}].minimum`, `为负(${c.minimum})`, '下界说的是"至少差这么多"不是"增量"; 负值等于反方向的要求, 该写成反向那条约束或直接删掉');
    }
    const minimum = roundUp1(c.minimum);
    return { c: { ...c, minimum }, q: minimum, to };
  });

  // ③ 松弛。排序是四级键 (to, from, minimum, contributor) —— 顺序只许由**约束内容**决定, 不许由
  // 它在数组里排第几决定: 同一组要求打乱顺序也得解出同一份结果(产物可比对的前提)。
  const name = (c: AxisConstraint): string => c.contributor ?? '';
  const ordered = [...ledger].sort(
    (a, b) => a.to - b.to || a.c.from - b.c.from || a.q - b.q
      || (name(a.c) < name(b.c) ? -1 : name(a.c) > name(b.c) ? 1 : 0),
  );

  const positions = new Array<number>(count).fill(origin);
  const winners: Array<AxisConstraint | null> = new Array(count).fill(null);
  /** 每个位置"当前这个值"的来源链(contributor 集合) —— 跨格约束的账靠它传到下游各格 */
  const prov: Array<Set<string>> = Array.from({ length: count }, () => new Set<string>());
  /** 这条约束自己 + 它 from 端那串链条 */
  const chainOf = (e: (typeof ledger)[number]): string[] =>
    e.c.contributor === undefined ? [...prov[e.c.from]] : [...prov[e.c.from], e.c.contributor];

  // 按 to 分组(ordered 已按 to 排好, 同 to 的连续成段) —— "按 to 升序松弛"这句话在代码里就是这一句
  const byTo: Array<Array<(typeof ledger)[number]>> = Array.from({ length: count }, () => []);
  for (const e of ordered) byTo[e.to].push(e);

  for (let j = 1; j < count; j++) {
    for (const e of byTo[j]) {
      const cand = positions[e.c.from] + e.q;
      if (cand > positions[j] + EPS) {
        positions[j] = cand;
        winners[j] = e.c;
        prov[j] = new Set(chainOf(e));
      } else if (cand >= positions[j] - EPS && cand > origin + EPS) {
        // 与已定下来的值**恰好相等** ⇒ 这条也是顶住解的原因(共因), 把它的链条并进账里。
        // `cand > origin` 那道门槛是为退化约束留的: 零距离的要求没占住任何位置, 不该冒名上账。
        for (const n of chainOf(e)) prov[j].add(n);
      }
    }
  }

  // ④ 位置向上取到 0.1。逐位独立取整不破坏下界: minimum 已在网格上, 而 `ceil(x + k·0.1) = ceil(x) + k·0.1`
  // (k 为整数) ⇒ 差值一格不差。
  const solved = positions.map(roundUp1);
  const gaps = Array.from({ length: count - 1 }, (_, i) => round1(solved[i + 1] - solved[i]));

  // ⑤ 账目从最终解反读
  const spanOf = (c: AxisConstraint): number => round1(solved[c.to] - solved[c.from]);
  const tight = ordered.filter((e) => spanOf(e.c) === e.q).map((e) => e.c);

  const attribution = gaps.map((_, i) => {
    const by = new Set<string>();
    for (const e of ordered) {
      if (e.c.contributor === undefined) continue;
      if (e.c.from > i || e.c.to < i + 1) continue; // 没跨过这一格, 不算它的账
      if (spanOf(e.c) !== e.q) continue; // 没顶住解的只是"路过", 不进账
      by.add(e.c.contributor);
    }
    return { index: i, by: codepointSort([...by]) };
  });

  return { positions: solved, gaps, winners, tight, attribution };
}
