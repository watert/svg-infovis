// =====================================================================
// knives/lanes · 批量腰线分配: 一束边共享一条走廊时, 给它们各分一条
//
// 为什么要有它(260919, 真实事故驱动): 一个 subagent 画"来源树"(1 个根 fan-out 到 7 个子目录),
// 7 条边**只能挤一条腰线** —— `lane` 是单值, 它给 4 条边写了同一个 `lane: 140`, 于是有两条边
// 在 y=140 上共线 106px(`edge_overlap` error); 另外 3 条改走 `via` 又各自重叠(`no_backtrack` ×3)。
// 它最后的处理是**把边整个删掉**("Let me drop edges entirely"), 交付了一张没有父子关系的"树"。
//
// 门禁其实早喊对了方向 —— `edge_overlap` 的 supportedFixes 写着"错开至少 15px""用 distribute
// 把这一束边均分间距" —— 但**没有对应的工具**: 作者只能手算每条边的 lane, 而手工算 7 个数要同时
// 满足"每条各自不同的可行域 + 两两错开", 于是"放弃"成了理性选择。本刀就是那个工具。
//
// ⚠ 它**不是**引擎的自动行为:
//   · `routeOrthogonal` 单边行为一字不改(仍是"给什么用什么 + 投影 + 报标志")
//   · 只有**显式调用** `assignLanes` 才发生分配 —— 与 `nudge` 同性质, 是作者手里的旋钮
//   · 明确**不做避障**: 只在"这条边本来就允许的腰线区间"(`route.ts` 的 `laneSlot`)内选值,
//     不绕开中间节点、不改主路径、不改端口。跨层绕行是 `via` 的活儿(作者权威)
//
// 算法(确定性, 无随机, 同输入必得同输出):
//   ① 逐条读 `laneSlot` —— 吃不了 lane 的边(`via` / L 形 / 竖腰线无解)当场出列, 值给 `null`
//   ② **聚带**: 同轴(都竖腰线或都横腰线)且腰线段投影**区间重叠**的边归一个带。区间重叠的
//      传递闭包 = 区间图连通分量 —— 区间不重叠的两组边永远不会撞上, 不该被拉来一起错开
//   ③ 带内**保序**: 按出口位置(`origin`)排序。顺序对了, 边摊开时彼此不交叉(扇形, 不是麻花)
//   ④ 带内**只推开真挤在一起的**: 理想位 = 各自 `preferred`(引擎本来会用的自动中线); 违反
//      "相邻 ≥ step"的连续段用 PAVA 式分块合并(块心 = 成员理想位的 size 加权均值), 块内等距
//      铺开。⇒ 本来就不挤的边**一个字节都不动**(分到的值 = 自动值); 全挤在一处的(fan-out 的
//      常态)以理想位的中枢**对称摊开**, 而不是被单向推向一侧(那会白扔一半可行域)
//   ⑤ 逐条夹回个体可行域; 夹完仍违反间距的 → 报 `lane_band_overflow` warning
//      ("装不下"是事实, 必须说出来 —— 不说的话作者会以为自己已经错开了)
//
// 出口 `reqs` 是**新实例**(不 mutate 入参, 与 nudge 同纪律), 直接喂 `routeAll` 即可。
// `lanes[i] === null` 的边一律**原样带过**(连它原本的 `lane` 一起) —— null 的语义是"不干涉"。
// =====================================================================

import { type Diagnostic } from './audit';
import { LANE_CODES } from './codes';
import { type LaneSlot, type RouteRequest, laneSlot } from './route';
import { round1 } from '../geometry/vec';

/**
 * 同带内相邻腰线的最小间距缺省值 —— 与 `audit` 的 `TRACK_SHIFT_MIN`(`OVERLAP_MIN` 8 + `PARALLEL_GAP_MAX` 7 = 15) 同源:
 * 门禁的修法提示喊的就是这个数, 分配器不该另定一个。窄了照样报 `edge_overlap`, 宽了白占走廊。
 */
export const LANE_STEP_MIN = 15;

export type LaneAssignOptions = {
  /** 带内相邻腰线的最小间距(px), 缺省 `LANE_STEP_MIN`(15)。必须正有限, 否则当场抛 */
  step?: number;
};

/** 一条走廊带: 一组必须互相错开的边(同轴 + 腰线段区间重叠) */
export type LaneBand = {
  /** 腰线轴(竖腰线 `'y'` / 横腰线 `'x'`) */
  axis: 'y' | 'x';
  /** 带内成员在**入参**里的下标(升序) */
  members: number[];
  /** 带内腰线段的并集区间 —— 报告"这条走廊有多宽"用 */
  span: [number, number];
  /** 公共可行域(各成员可行域的交集); 空集时为 `null`(这种情况下没有一条腰线能同时满足所有人) */
  feasible: [number, number] | null;
  /** 分配结果, 与 `members` **同序** */
  assigned: number[];
  /** 需要的跨度 `(n-1)×step` 与公共可行域宽度之差 —— `≤0` 说明铺得开 */
  slack: number;
};

export type LanePlan = {
  /** 与入参同序: 分到的腰线值; `null` = 这条边不参与分配(吃不了 lane, 或没有同带邻居需要错开) */
  lanes: (number | null)[];
  /** 只需要错开的带(成员 ≥2); 单条自成一"带"的边不记在这里 —— 它不需要任何分配 */
  bands: LaneBand[];
  diagnostics: Diagnostic[];
};

export type LaneAssignResult = {
  /** 新实例: 分到 lane 的边带上 `lane`, 其余原样带过 */
  reqs: RouteRequest[];
  plan: LanePlan;
};

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);

/**
 * 聚带: 同轴的边按腰线段投影做区间图连通分量。
 * 判据"重叠"而不是"距离 < X" —— 腰线段不重叠的边根本不会画在一起, 与它们的腰线差多少 px 无关。
 */
function clusterBands(members: number[], slots: (LaneSlot | null)[]): number[][] {
  const spanAt = (i: number): [number, number] => (slots[i] as LaneSlot).span;
  const sorted = [...members].sort((a, b) => {
    const sa = spanAt(a), sb = spanAt(b);
    return sa[0] - sb[0] || sa[1] - sb[1] || a - b; // 三级键: 同输入必得同序
  });
  const out: number[][] = [];
  let cur: number[] = [];
  let reach = -Infinity;
  for (const i of sorted) {
    const s = spanAt(i);
    if (cur.length && !(s[0] <= reach)) { out.push(cur); cur = []; reach = -Infinity; }
    cur.push(i);
    if (s[1] > reach) reach = s[1];
  }
  if (cur.length) out.push(cur);
  return out;
}

/** 带内分配的一次结果(纯几何, 不带诊断) */
type BandPlan = {
  /** 与 `members` 同序的分配值 */
  assigned: number[];
  feasible: [number, number] | null;
  slack: number;
  /** 夹回个体可行域后仍违反最小间距的个数 */
  violations: number;
  /** 违反处的一对成员下标(诊断 evidence 用) */
  worstPair: [number, number] | null;
};

/**
 * 带内分配(见文件头 ③④⑤)。
 *
 * 为什么是 PAVA 分块而不是"从左到右贪心推": 贪心推只往一个方向挤, 对 fan-out(preferred 全相同)
 * 会把 7 条边全推到中心线的一侧 —— 而走廊两侧通常是对称的, 那等于白扔一半可行域, 还让整束边
 * 明显偏心。分块法把"挤在一起的连续段"当成一个整体, 块心留在成员理想位的中枢上, 块内对称铺开。
 */
function planBand(members: number[], slots: (LaneSlot | null)[], step: number): BandPlan {
  const slotAt = (i: number): LaneSlot => slots[i] as LaneSlot;
  // ③ 保序: 按出口位置排, 同位置按入参下标(确定性)
  const order = [...members].sort((a, b) => slotAt(a).origin - slotAt(b).origin || a - b);
  const size = order.length;

  // 公共可行域: 各成员 [lo,hi] 的交集(半轴用 ±Infinity 参与运算)
  const loAll = Math.max(...order.map((i) => slotAt(i).lo));
  const hiAll = Math.min(...order.map((i) => slotAt(i).hi));
  const feasible: [number, number] | null = loAll <= hiAll ? [loAll, hiAll] : null;

  // ④ 理想位(先夹进各自可行域 —— preferred 本来就落在里面, 夹一次只为对半轴/异常值收口)
  const want = order.map((i) => {
    const s = slotAt(i);
    return clamp(s.preferred, s.lo, s.hi);
  });

  // PAVA 式分块: 块 = order 上的一段连续区间; 块心 = 成员理想位的 size 加权均值
  type Block = { lo: number; hi: number; size: number; sum: number };
  const centerOf = (b: Block): number => b.sum / b.size;
  /** 块铺开后占的跨度(块内相邻差一律 step) */
  const widthOf = (b: Block): number => (b.hi - b.lo) * step;
  const blocks: Block[] = [];
  for (let k = 0; k < size; k++) {
    blocks.push({ lo: k, hi: k, size: 1, sum: want[k] });
    // 相邻两块若"靠得太近"(前块右端 + step 超过后块左端) → 合并, 块心退化成两块的加权均值
    while (blocks.length >= 2) {
      const b = blocks[blocks.length - 1];
      const a = blocks[blocks.length - 2];
      const aRight = centerOf(a) + widthOf(a) / 2;
      const bLeft = centerOf(b) - widthOf(b) / 2;
      if (aRight + step > bLeft + 1e-9) {
        blocks.pop(); blocks.pop();
        blocks.push({ lo: a.lo, hi: b.hi, size: a.size + b.size, sum: a.sum + b.sum });
      } else break;
    }
  }

  // 块内对称铺开
  const v = new Array<number>(size);
  for (const bl of blocks) {
    const center = centerOf(bl);
    const cnt = bl.hi - bl.lo + 1;
    for (let m = 0; m < cnt; m++) v[bl.lo + m] = center + (m - (cnt - 1) / 2) * step;
  }

  // ⑤ 夹回个体可行域, 再做两遍保序修正(左推下界 / 右推上界)
  for (let k = 0; k < size; k++) {
    const s = slotAt(order[k]);
    v[k] = clamp(v[k], s.lo, s.hi);
  }
  for (let k = 1; k < size; k++) {
    const s = slotAt(order[k]);
    if (v[k] < v[k - 1] + step) v[k] = Math.min(v[k - 1] + step, s.hi);
  }
  for (let k = size - 2; k >= 0; k--) {
    const s = slotAt(order[k]);
    if (v[k] > v[k + 1] - step) v[k] = Math.max(v[k + 1] - step, s.lo);
  }

  // 校验(夹与推可能互相抵消 → 链式冲突无解, 必须报出来而不是假装成功了)
  let violations = 0;
  let worstPair: [number, number] | null = null;
  let worstGap = Infinity;
  for (let k = 1; k < size; k++) {
    const gap = v[k] - v[k - 1];
    if (gap < step - 1e-9) {
      violations++;
      if (gap < worstGap) { worstGap = gap; worstPair = [order[k - 1], order[k]]; }
    }
  }

  // 回填到入参下标序
  const assigned = new Array<number>(members.length);
  order.forEach((i, k) => {
    assigned[members.indexOf(i)] = v[k];
  });

  const need = (size - 1) * step;
  const have = hiAll - loAll;
  return { assigned, feasible, slack: Number.isFinite(have) ? have - need : Infinity, violations, worstPair };
}

/**
 * 给一批边分配腰线(见文件头)。`reqs` 顺序即返回的 `lanes` / `bands.members` 的坐标。
 *
 * 缺省 step 取 `LANE_STEP_MIN`(15, 与门禁的修法提示同源)。`step` 非正有限 → 当场抛
 * (与 `route.ts` 对畸形 `via` 同口径: 畸形入参是编程错误, 不静默兜底)。
 */
export function assignLanes(reqs: RouteRequest[], opts: LaneAssignOptions = {}): LaneAssignResult {
  const step = opts.step ?? LANE_STEP_MIN;
  if (!(Number.isFinite(step) && step > 0)) {
    throw new RangeError(`assignLanes: step 必须是正有限数(拿到 ${String(opts.step)}) —— 缺省用 LANE_STEP_MIN(${LANE_STEP_MIN})`);
  }

  const slots = reqs.map((r) => laneSlot(r));
  const lanes: (number | null)[] = new Array(reqs.length).fill(null);
  const bands: LaneBand[] = [];
  const diagnostics: Diagnostic[] = [];

  for (const axis of ['y', 'x'] as const) {
    const membersOfAxis: number[] = [];
    slots.forEach((s, i) => {
      if (s && s.axis === axis) membersOfAxis.push(i);
    });
    if (membersOfAxis.length < 2) continue;

    for (const members of clusterBands(membersOfAxis, slots)) {
      // 单条自成一"带" = 没有邻居要和它错开 → 不干涉(它的 lane 保持原样/自动值)
      if (members.length < 2) continue;

      const plan = planBand(members, slots, step);
      const sortedMembers = [...members].sort((a, b) => a - b);
      const spanLo = Math.min(...members.map((i) => (slots[i] as LaneSlot).span[0]));
      const spanHi = Math.max(...members.map((i) => (slots[i] as LaneSlot).span[1]));

      bands.push({
        axis,
        members: sortedMembers,
        span: [spanLo, spanHi],
        feasible: plan.feasible,
        assigned: plan.assigned,
        slack: plan.slack,
      });
      members.forEach((i, k) => {
        lanes[i] = round1(plan.assigned[k]);
      });

      if (plan.violations > 0) {
        const need = round1((members.length - 1) * step);
        const have = plan.feasible ? round1(plan.feasible[1] - plan.feasible[0]) : 0;
        const pair = plan.worstPair ?? [sortedMembers[0], sortedMembers[1]];
        diagnostics.push({
          code: LANE_CODES.lane_band_overflow,
          severity: 'warning',
          message:
            `走廊里 ${members.length} 条边要按 ${step}px 错开需要 ${need}px, 但可行域只有 ${have}px —— ` +
            `挤不开, 仍有两条的腰线间距不足(会被 edge_overlap 判成"叠得太近")`,
          subject: { kind: 'edge', id: `req[${pair[0]}]` },
          evidence: {
            axis,
            count: members.length,
            step,
            need,
            have: Number.isFinite(have) ? have : 'inf',
            members: sortedMembers,
            worstPair: [pair[0], pair[1]],
          },
          supportedFixes: [
            { kind: 'grow-corridor', hint: `把这两层拉开至少 ${round1(need - have)}px —— 走廊宽了才铺得开` },
            { kind: 'shrink-step', hint: `走廊确实挤不开: 调小 step(下限是两条线分得清, 再小就是画成一条)` },
            { kind: 'split-corridor', hint: '这批边不该挤同一条走廊: 换端口面 / 从两侧分头出线(改的是布局, 不是坐标)' },
            { kind: 'drop-some', hint: '边太多本身就是信息过载: 考虑合并成一条主干再分支(拓扑决策)' },
          ],
        });
      }
    }
  }

  const out: RouteRequest[] = reqs.map((r, i) => {
    const v = lanes[i];
    return v === null ? { ...r } : { ...r, lane: v };
  });
  return { reqs: out, plan: { lanes, bands, diagnostics } };
}
