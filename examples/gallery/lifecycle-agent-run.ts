// =====================================================================
// lifecycle-agent-run · 参照实现复刻: "Agent Run Lifecycle"(**深色**)
//
// 源: `refs/archify-explore/shots/lifecycle-agent-run.png`(参照实现 single-HTML 的真实渲染)
// 语义源: 该图对应的 IR 声明(4 条 lane / 10 个状态 / 6 条迁移)。**成图上四条 lane 收成三段
// 段落** —— 等待(lane waiting)与恢复(lane exceptions)合成"02 / Interruptions + Recovery loop",
// 本文件跟着成图走。
//
// 为什么值得复刻: 它曾被文档点名为**能力缺口样本** —— "lifecycle/workflow 这类图
// 只能拿 groupShape 模拟"。本文件就是那句判断的实测答复: 四段 + 10 状态
// + 一条跨全图的回流, 全部由作者决策 + route 折点算出, 门禁照跑。
//
// ── 与参照实现**故意不同**的两处(不照抄) ────────────────────────────────
//
// ① **Failed 挪出 Needs Approval 那一列**。参照实现把 Needs Approval / Failed / Cancelled
//    摞在同一个 x 上, 于是 `approval → cancelled` 这条边**只能绕 Failed 的右侧**: 出右边
//    10px → 下 127px → 左 95px → 下 13px —— 出口在 2/3 高度而不是底边, 最后一段只有 13px
//    就顶到箭头, 读起来像"cancelled 在 failed 之后"而不是"等待审批可以被取消"。
//    **那不是路由器的锅, 是版式没给走廊**: Failed 与上下两个盒子 x 完全重合(实测差 9px),
//    中间根本没有可走的竖向通道。本文件把 Failed 排到 col1(Recovery 与 Executing 的左邻),
//    `approval → cancelled` 于是是**一条直线**。
//
// ② **边的肤色按"去向属于哪一族"给**, 不按来源: 进 waiting 的走 amber, 进 failure 的走
//    rose, 回 active 的重试走 emerald。参照实现里 `approval → cancelled` 是 amber(因为源头
//    是 waiting) —— 同一条语义规则下它该是 rose(去向是终态失败)。
//
// ── 版式(为什么长这样) ────────────────────────────────────────────────
//
//   col0      col1      col2        col3         col4
//   Queued  · Planning · Executing · Reviewing  · Completed   ← 阶段 01 · 五个有序阶段
//             Failed   · NeedsAppr · Blocked                 ← 阶段 02 · 暂停 + 可重试的失败
//                        Cancelled · Expired                 ← 阶段 03 · 没有回头路的结束
//
//   · **Failed(col1) 与 Needs Approval(col2) 是同一排的邻居**, 不是上下摞 —— 见 ①
//   · 三排错位成 5 / 3 / 2, 竖线只在同列之间发生: `executing→approval→cancelled` 与
//     `reviewing→blocked→expired` 各是一条**直线**(同列 ⇒ 端口同 x)
//   · 回流(failed → executing)只能**绕顶部**: Executing 的 bottom 面被同列的 Needs Approval
//     整个盖住, 从左绕过去又被同排的 Planning 挡 —— 归拢到一条左侧走廊, 正是参照实现的画法
//
//   ⚠ 两条走廊的**坐标纪律**(踩过才定的): 段落标签占 x ∈ [0, ~230], 回流脊柱必须更左
//   (`SPINE_X = -48`) —— 脊柱若落在标签的 x 区间里, 它会**穿过标签盒子**, `text_clearance`
//   当场报错。同理节点整体从 X0 = 64 起, 让出标签的左边槽。
//
// ── 前置问题(QUICKREF「动手前」, 落字即白名单) ──────────────────────────
//
//   1 主路径 = 横向五阶段链, 全直线零折弯(bends = 0)
//   2 方向 = 主路径右行 · 岔路下行 · 回流上行 —— 三种流向各占一条通道, 不抢道
//   3 分层 = 三行同级(阶段 01/02/03), 错位成 5 / 3 / 2
//   4 分组 = 阶段是**语义边界**, 但**刻意不用组框** —— 用"标签 + 虚线基准线"。组框在本仓是
//     ownership 语义(带四条 cluster 门禁), 而这三段是读图的段落感, 不是归属。
//     成员边数 ≥ 1(无孤儿节点), 每个状态都真的连在流水线上
//   5 主角 = Executing(四条边交汇, 三个岔路全从它分出去) → 唯一一个 `variant: 'solid'`;
//     **其余一律 tint** —— 满图实色等于没有重点
//   6 规模 = 最宽一排 5 个节点(≤ 7±2) ✓
//   7 画布 = 宽分层图 ⇒ 宽画布(实测 ≈ 1.7 : 1)
//
//   **白名单(收尾环测出来的警示, 逐条声明为"有意")**:
//   · `long_edge` ×4 —— 回流(拓扑迫使: Executing 只剩 top 面可进) + 3 条段落基准线(本就满宽)
//   · **段落标签字号(11) < 节点标签(13)** —— 反向的阶梯。这不是层级倒置: 段落标签是
//     "隔断"不是"标题", 与 AIGC 里"越大越细"的那套(组框标题 > 节点标签)不同族, 故意的
//   · **支路比主路径更醒**(族色 + 虚线 vs 中性灰实线) —— 这张图讲的就是"岔路", 主路径是底。
//     主路径**刻意不点 tone**(它不属于任何族, 走主题中性线色, 深色下反而比 slate 亮一档)
//   · 图例的 6 个色块是 solid —— 若将来落"solid 数 > 2 = 强调通胀"的度量, **这 6 个要在白名单里**
//     (它们是色卡, 不是语义强调; 全图语义强调位只有 Executing 一个)
//
//   bun run examples/gallery/lifecycle-agent-run.ts > /tmp/lifecycle.svg
//   bun run scripts/inspect.ts examples/gallery/lifecycle-agent-run.ts --showcase --rows=80
// =====================================================================

import { type Scene, type SceneEdge, type SceneText } from '../../src/knives/audit';
import { nodeFit, textNote } from '../../src/knives/fit';
import { routeOrthogonal } from '../../src/knives/route';
import { type EdgeProps } from '../../src/shapes/edge';
import { THEMES, type Tone } from '../../src/theme';
import { bounds, rectAnchor, rectFace } from '../../src/geometry/box';
import { rightOf } from '../../src/geometry/place';
import { grid } from '../../src/geometry/grid';
import { type Rect, rectRight } from '../../src/geometry/vec';
import { runScene } from '../../scripts/runner';
import { isMainModule } from '../../src/runtime';

// 档位与 fit 参数**导出**给 test 用 —— 判据里复述一遍这两个字面量就是第二权威(档位一漂,
// test 量的是另一档的图; 本仓最贵的事故就是"两个口径"这族)。
export const LEVEL = 'showcase' as const;
export const FIT = { padding: 30 } as const;
const THEME = THEMES.dark;

// --- 状态类型 → 肤色 / 图例词(单一来源: 图例的计数由它派生, 不会与图走散) ---

type StateType = 'start' | 'active' | 'waiting' | 'decision' | 'success' | 'failure';

const TYPE_TONE: Record<StateType, Tone> = {
  start: 'blue', active: 'emerald', waiting: 'amber',
  decision: 'rose', success: 'violet', failure: 'rose',
};
const TYPE_LABEL: Record<StateType, string> = {
  start: 'start', active: 'active state', waiting: 'waiting',
  decision: 'decision', success: 'terminal success', failure: 'failure / exit',
};

// --- 作者决策: 谁在第几段 / 第几列 --------------------------------------

type StateSpec = {
  id: string; label: string; sub: string; type: StateType; row: number; col: number;
  /** 视觉主角(前置七问第 5 问): 全图只有一个 —— 四条边在这里交汇, 三个岔路全从它分出去 */
  focus?: boolean;
};

const STATES: StateSpec[] = [
  // 阶段 01 · Lifecycle phases —— 五个有序阶段, 列序就是顺序
  { id: 'queued', label: 'Queued', sub: 'request accepted', type: 'start', row: 0, col: 0 },
  { id: 'planning', label: 'Planning', sub: 'build task graph', type: 'active', row: 0, col: 1 },
  { id: 'executing', label: 'Executing', sub: 'tool calls', type: 'active', row: 0, col: 2, focus: true },
  { id: 'reviewing', label: 'Reviewing', sub: 'quality gate', type: 'decision', row: 0, col: 3 },
  { id: 'completed', label: 'Completed', sub: 'final response', type: 'success', row: 0, col: 4 },
  // 阶段 02 · Interruptions + Recovery loop —— 两个"暂停但没结束" + 一个可重试的失败
  { id: 'failed', label: 'Failed', sub: 'recoverable error', type: 'failure', row: 1, col: 1 },
  { id: 'approval', label: 'Needs Approval', sub: 'human gate', type: 'waiting', row: 1, col: 2 },
  { id: 'blocked', label: 'Blocked', sub: 'missing input', type: 'waiting', row: 1, col: 3 },
  // 阶段 03 · Terminal exits —— 没有回头路的两种结束
  { id: 'cancelled', label: 'Cancelled', sub: 'user stopped', type: 'failure', row: 2, col: 2 },
  { id: 'expired', label: 'Expired', sub: 'timeout', type: 'failure', row: 2, col: 3 },
];

/** 段落标签 = 分段的唯一身份; 顺序即行序 */
const BAND_LABELS = [
  '01 / Lifecycle phases',
  '02 / Interruptions + Recovery loop',
  '03 / Terminal exits',
];

// --- 版式常量 -----------------------------------------------------------

// 版式常量除 SWATCH 外**一律 8 的倍数**(aesthetics 第 3.5 圈的"间距节奏") ——
// ⚠ 但**节拍对不齐**: 盒宽是 nodeFit 反算出来的内容下限, 不是作者给的数。宁可让节拍落在
// 列距 / 行距上、盒宽随内容, 也不要反过来手定盒宽(QUICKREF 误用表最后几行那条)。
const GAP_X = 48;         // 列距(节点之间的呼吸位)
const ROW_H = 56;         // 行高。带 sub 的两行块在 showcase 档**恒 54**(余量只有 2px, 不带 sub 才是 39) —— 节奏归版式
const BAND_GAP = 104;     // 段落之间的走廊高度(要容下: 段落标签盒 + 分隔线 + 折线横段)
const X0 = 64;            // 列 0 左缘 = 标签左边槽的宽度(见文件头 坐标纪律)
const RAISE_RULE = 40;    // 分隔线在本段行顶之上
const RAISE_LABEL = 64;   // 段落标签盒中心在本段行顶之上(落位走 textNote 的 at)
const SWATCH = 11;        // 图例色块边长

// 盒宽 = 全部内容的 max(fit.w) —— 每列等宽, 于是竖排的两个盒子天然同宽同列
const BOX_W = Math.max(...STATES.map((s) => nodeFit({ label: s.label, sub: s.sub, level: LEVEL }).w));

// 版式本体就是一张 5×3 的均匀格子(列 = 阶段位置, 行 = 三个段落) —— 行距 = 行高 + 段落走廊,
// 于是"第几段第几列"的坐标全部走查询, 不再手写 `X0 + col * PITCH` / `ROW_Y[row]`
const g = grid({
  origin: { x: X0, y: 0 },
  cols: 5,
  rows: 3,
  cell: { w: BOX_W, h: ROW_H },
  gap: { x: GAP_X, y: BAND_GAP },
});
const COL_RIGHT = rectRight(g.bounds);   // 段落分隔线铺到格区右缘(最后一列的右边)

// 两条走廊由**格区的面**往外推(数值与手写常量逐字相同: 格区左缘 = X0 = 64, 顶面 = 0):
//   · 回流脊柱必须落在标签 x 区间**之外** —— 让开整个标签槽(64)再往左 48
//   · 顶部走廊在格区顶面之上 96(要越过分隔线 40 与段落标签盒 64)
const SPINE_X = rectFace(g.bounds, 'left', { offset: X0 + 48 }).x;
const RETRY_TOP = rectFace(g.bounds, 'top', { offset: 96 }).y;

const boxes: Record<string, Rect> = {};
for (const s of STATES) {
  const fit = nodeFit({ label: s.label, sub: s.sub, level: LEVEL });
  const slot = g.cell(s.col, s.row);
  // 格子是**槽**, 盒高取"装得下内容"的那个(nodeFit 给的是下限; 高度这一侧没有门禁)
  boxes[s.id] = { x: slot.x, y: slot.y, w: slot.w, h: Math.max(ROW_H, fit.h) };
}

/**
 * 某一段(行)的盒 = 该行全部状态盒的并集。分隔线 / 段落标签 / 图例标题都挂在**它的面**上,
 * 于是"这一段从哪到哪"由真实盒推出来, 而不是 `ROW_Y[row]` 的第二次手算(每行都有状态, 故非空)。
 */
const bandRect = (row: number): Rect => bounds(STATES.filter((s) => s.row === row).map((s) => boxes[s.id]))!;

// --- 边: 折点全走 route, 一个坐标都不手写 --------------------------------

const DASH = '5 4';
const edges: SceneEdge[] = [];
const edgeStyles: Record<string, Omit<EdgeProps, 'points'>> = {};

/**
 * 主路径(横向, 直线): 阶段之间就是"下一步"。
 *
 * **刻意不点 tone** —— `tone` 说的是"这条边属于哪一族", 而主路径不属于任何族: 它就是流水线
 * 本身。不点 tone 时 `edgeShape` 取 `theme.edge`(中性线色), 比 slate.border 还亮一档 ——
 * 于是"只有支路才有族色"既是语义判断, 也顺手把脊柱从背景里提出来(深色主题下尤其明显)。
 */
const chain = (id: string, from: string, to: string): void => {
  const r = routeOrthogonal({
    from: boxes[from], fromPort: { side: 'right' },
    to: boxes[to], toPort: { side: 'left' },
  });
  edges.push({ id, from, to, points: r.points });
  edgeStyles[id] = { width: 1.6, markerSize: 8 };
};
chain('e-queued-planning', 'queued', 'planning');
chain('e-planning-executing', 'planning', 'executing');
chain('e-executing-reviewing', 'executing', 'reviewing');
chain('e-reviewing-completed', 'reviewing', 'completed');

/** 单条边: 端口 + 可选 lane + 肤色/虚线(样式走覆盖表, 语义 tone 进 scene) */
const link = (
  id: string, from: string, to: string,
  fromPort: { side: 'bottom' | 'top' | 'left' | 'right'; t?: number },
  toPort: { side: 'bottom' | 'top' | 'left' | 'right'; t?: number },
  tone: Tone, lane?: number,
): void => {
  const r = routeOrthogonal({ from: boxes[from], fromPort, to: boxes[to], toPort, lane });
  edges.push({ id, from, to, points: r.points, tone });
  edgeStyles[id] = { dash: DASH, width: 1.5 };
};

// 暂停: 两个都是**直线** —— 同列(executing/approval 同 col2, reviewing/blocked 同 col3) ⇒ 端口同 x
link('e-approval-needed', 'executing', 'approval', { side: 'bottom', t: 0.5 }, { side: 'top', t: 0.5 }, 'amber');
link('e-review-blocked', 'reviewing', 'blocked', { side: 'bottom', t: 0.5 }, { side: 'top', t: 0.5 }, 'amber');
// 终态出口: 同样各是一条直线(approval/cancelled 同 col2, blocked/expired 同 col3)
link('e-approval-cancelled', 'approval', 'cancelled', { side: 'bottom', t: 0.5 }, { side: 'top', t: 0.5 }, 'rose');
link('e-block-expired', 'blocked', 'expired', { side: 'bottom', t: 0.5 }, { side: 'top', t: 0.5 }, 'rose');

// 执行失败: 出 Executing 的 bottom(靠左那一口) → 横过走廊 → 进 Failed 的 top。
// **lane 必须显式给**: 不给时两个 stub 的中点是 108, 正好压在 02 段的分隔线(120)上 ——
// 距离 12px, 会同时踩 `edge_overlap` 的近共线档与视觉上的"贴着分隔线跑"。
// 出盒 stub 起点 = 盒底沿朝外法线 18px(offset 正 = 朝外, 不必自己写 y + h)
const FAIL_LANE = rectFace(boxes.executing, 'bottom', { offset: 18 }).y;
link('e-execution-failed', 'executing', 'failed',
  { side: 'bottom', t: 0.25 }, { side: 'top', t: 0.5 }, 'rose', FAIL_LANE);

// 重试回流: Failed 左出 → 左走到脊柱 → 升到顶部走廊 → 右行 → 下进 Executing 的 top。
// 为什么只能绕顶部: Executing 的 bottom 面被同列的 Needs Approval 整个盖住, 左侧被同排的
// Planning 挡住 —— 能进 Executing 的自由面只剩 top。**via 是声明, 不是避障**。
{
  const exit = boxes.failed;
  const r = routeOrthogonal({
    from: exit, fromPort: { side: 'left' },
    to: boxes.executing, toPort: { side: 'top', t: 0.5 },
    via: [
      { x: SPINE_X, y: rectAnchor(boxes.failed, 'center').y },
      { x: SPINE_X, y: RETRY_TOP },
      { x: rectAnchor(boxes.executing, 'center').x, y: RETRY_TOP },
    ],
  });
  if (r.viaInfeasible) throw new Error('回流折点不可行 —— 检查 via 是否落在盒边 + stub(18px) 之内');
  edges.push({ id: 'e-failed-retry', from: 'failed', to: 'executing', points: r.points, tone: 'emerald' });
  edgeStyles['e-failed-retry'] = { width: 2.2, markerSize: 9 };
}

// --- 段落分隔线 + 标签 --------------------------------------------------
//
// 分段**不是组框**: 参照实现里它是"一行标签 + 一条虚线基准线", 没有左边/下边。
// 走 `SceneEdge.noCheck`(与泳道线同族) —— 它是版式基准线而不是"一条关系", 判据
// `edge_node_clearance` 对它的适用面本就不同; 其余(正交 / 共线 / 端口 / 可读性)照旧管它。
const texts: SceneText[] = [];
BAND_LABELS.forEach((label, row) => {
  const band = bandRect(row);
  // 分隔线在段顶面**朝外**(上)RAISE_RULE 处 —— offset 正 = 朝外, 不必自己写减号
  const ruleY = rectFace(band, 'top', { offset: RAISE_RULE }).y;
  edges.push({
    id: `rule-band${row}`,
    points: [{ x: 0, y: ruleY }, { x: COL_RIGHT, y: ruleY }],
    noCheck: true,
  });
  // `end: 'none'` 不能省: `edgeShape` 的缺省端点是 `arrow-triangle` —— 基准线不带箭头,
  // 忘了这一位就会在每条分隔线的右端长出一个指向上方的三角(实测第一次出图就是这样)。
  edgeStyles[`rule-band${row}`] = { dash: '2 6', width: 1, color: THEME.groupStroke, end: 'none' };
  // 左边槽 x = 0; `anchor: 'start'` 的 at = 左中落点, y 仍是块心(段顶面往上 RAISE_LABEL)
  texts.push(textNote({
    id: `band-${row}`,
    content: label,
    at: { x: 0, y: rectFace(band, 'top', { offset: RAISE_LABEL }).y },
    anchor: 'start',
    color: THEME.groupText,
  }));
});

// --- 图例: 计数从状态表派生(改一个状态的 type, 图例自己跟上) ---------------

const legendOrder = Object.keys(TYPE_TONE) as StateType[];
const legend = legendOrder
  .map((type) => ({ type, n: STATES.filter((s) => s.type === type).length }))
  .filter((e) => e.n > 0);

// 图例标题贴着**最后一段的底边**往下 58 —— 也由盒面推, 不再手写 ROW_Y[2] + ROW_H
const LEGEND_TITLE_Y = rectFace(bandRect(2), 'bottom', { offset: 58 }).y;
const legendNodes: Scene['nodes'] = [];
{
  let prev: Rect = { x: -30, y: LEGEND_TITLE_Y + 30, w: 0, h: SWATCH };  // 链首锚盒: 其右缘落在 x = 0(图例左对齐的起点是作者决策)
  for (const e of legend) {
    const swatch: Rect = rightOf(prev, { w: SWATCH, h: SWATCH }, 30);  // align 缺省 center ⇒ 与上一格文字同心中线, y 自己锁在同一行
    legendNodes.push({ id: `legend-${e.type}`, rect: swatch, tone: TYPE_TONE[e.type], variant: 'solid' });
    // 贴色块右缘 8px; `anchor: 'start'` 的 at = 左中, y 取块心(与色块同高)
    const note = textNote({
      id: `legend-text-${e.type}`,
      content: `${TYPE_LABEL[e.type]} ${e.n}`,
      at: rectFace(swatch, 'right', { offset: 8 }),
      anchor: 'start',
      color: THEME.label,
    });
    texts.push(note);
    prev = note.rect;   // 下一格从本段文字盒起再让 30(宽取 rect, 与检测盒同一个数)
  }
}

// --- scene --------------------------------------------------------------

export const scene: Scene = {
  width: 0, height: 0, // 占位: 出口的 fit 会按内容重算(见 FIT) —— 声明的画布尺寸不参与任何计算
  nodes: [
    ...STATES.map((s) => ({
      id: s.id, rect: boxes[s.id], label: s.label, sub: s.sub,
      tone: TYPE_TONE[s.type],
      // tint = 角色色(这格是哪一类状态); solid = 强调 —— 只给唯一的主角
      variant: (s.focus ? 'solid' : 'tint') as 'solid' | 'tint',
      radius: 8,
    })),
    ...legendNodes,
  ],
  edges,
  texts: [
    { id: 'legend-title', rect: { x: 0, y: LEGEND_TITLE_Y - 8, w: 60, h: 18 }, text: 'Legend', fontSize: 13, weight: 700, anchor: 'start' },
    ...texts,
  ],
};
export default scene;

if (isMainModule(import.meta.url)) {
  // 出口走 `scripts/runner.ts`(260920): 摘要 / 诊断(含 evidence) / 草稿 / exit code 都在那一处。
  // 深色画布的细线格仍在这里给 —— dark 主题**刻意不带**底纹, 要就得自己给(与 paper 自带那层同族)。
  runScene(scene, {
    level: LEVEL,
    theme: THEME,
    fit: FIT,
    edgeStyles,
    grid: { style: 'line', step: 24, color: 'rgba(148,163,184,0.06)' },
    title: 'Agent Run Lifecycle',
  });
}
