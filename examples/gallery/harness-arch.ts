// =====================================================================
// harness-arch · 立项实验的对照组: 同一张真图(DeepSeek-Harness 装配链, 15 节点)用 core 手排
//
// 为什么要它: 立项实验证明 Mermaid 的痛不是"几何违规"(它全绿), 而是**排布决策不在作者手里**
// —— 作者用 subgraph 明写的三层被摊到三个角落。本文件把同一份拓扑(取自一张公开的
// harness 装配链 mermaid 源)用 core 重排一遍,
// 让"作者旋钮"这件事可比: 三层真的竖起来、枢纽真的居中、对比真的并列。
//
// 它是**手排税**的测量载体: 版式(层序 / 列位 / 端口 / 折向)全部手给, 量一行行码下来要多少轮才过门禁。
// 260920 起,**可推导的几何一律不手写** —— 框体(fitGroupFrames) / 盒宽(nodeFit) / 标签盒
// (labelPlacement) / 腰线(从派生框现算)四处交回 core, 手排税只该花在"core 无从猜的决策"上:
// 层里谁在谁左边、端口取哪个比例、跨层边走哪条走廊。
//
//   bun run examples/gallery/harness-arch.ts > /tmp/harness.svg
//
// 它同时是个**可读的 scene 模块**(下面 `export const scene`), 迭代时先读数再出图:
//   bun run scripts/inspect.ts examples/gallery/harness-arch.ts --showcase --metrics --rows=80
// =====================================================================

import { type Scene, type SceneGroup, type SceneLabel } from '../../src/knives/audit';
import { nodeFit } from '../../src/knives/fit';
import { routeOrthogonal, type PortRef, type Side } from '../../src/knives/route';
import { edgeLabel } from '../../src/shapes/edge';
import { fitGroupFrames } from '../../src/scene';
import type { Rect } from '../../src/geometry/vec';
import { runScene } from '../../scripts/runner';

const H = 54;           // 版式: 节点高。nodeFit 的内容下限是 39, 高度这一侧没有门禁 —— 节奏由版式说了算
const PAD_X = 16;       // 版式: 标签左右呼吸位(比 showcase 档的 10 宽 6, 观感更松)
const GROUP_PAD = 40;   // 组框均匀 pad(推导见下方 fitGroupFrames 处)

// --- 作者决策: 三层竖排, 层内谁和谁对齐 ---------------------------------
//
// 装配层  一条有序注入管线, 左→右(层内顺序就是执行顺序)
const boot: Array<[string, string, number, number]> = [
  ['EMPTY', '空 entry list', 150, 80],
  ['BASE', 'dsh-base patch', 380, 80],
  ['MODE', 'web / headless patch', 640, 80],
  ['USER', 'profile + home cordis.patch.yml', 920, 80],
  ['FLAG', '--patch', 1150, 80],
];

// 服务层  两列纵向成对(tools→systemPrompt / agentLoop→agents) + 一排并列的旁观能力
// 决策点: TOOLS 与 SP **同列居中** —— 这样 tools provider 那条边是一条直线, 不是折线
const ctx: Array<[string, string, number, number]> = [
  ['TOOLS', 'ctx.tools', 210, 292],
  ['LOOP', 'ctx.agentLoop', 760, 292],
  ['SP', 'ctx.systemPrompt', 210, 382],
  ['AG', 'ctx.agents', 760, 382],
  ['SESS', 'ctx.runs', 130, 492],
  ['LLM', 'ctx.llm', 330, 492],
  ['SEAM', 'ctx.shell / ctx.fs / ctx.subprocess …', 610, 492],
];

// 运行层  两个来源汇聚到一处(而不是 Mermaid 那样排成一条平链)
// 260920 之前这里有个事后补丁("把派生框顶 +30 给走廊留位")—— 现在走廊由**层坐标自己**表达:
// 服务层最低排(492)与运行层最高排(680)之间隔 134px, 两个 pad(2×40) 之外自然空出 54px 走廊;
// 派生框的顶就是成员顶 − pad, 不再需要"事后改派生物"这种两个真相的写法。
const run: Array<[string, string, number, number]> = [
  ['INBOX', 'agent inbox', 800, 680],
  ['WF', 'agent/* 与 tools/* 瀑布', 1140, 680],
  ['LOG', 'event log', 970, 780],
];

const all = [...boot, ...ctx, ...run];
const boxes: Record<string, Rect> = {};
for (const [id, label, cx, y] of all) {
  // 盒宽 = max(版式宽, nodeFit 反算宽): 后者是"装得下"的地板, 且**档位与出图档位对齐**(showcase)——
  // 按 standard 算盒再按 showcase 出图会差 4px, 那条边正好在 showcase 档爆 `label_fit`。
  const fit = nodeFit({ label, level: 'showcase' });
  const w = Math.max(Math.ceil(fit.labelWidth + 2 * PAD_X), fit.w);
  boxes[id] = { x: Math.round(cx - w / 2), y, w, h: Math.max(H, fit.h) };
}

// 组框**只声明成员**(membership 声明制): `rect` 是占位, 框体由下面 `fitGroupFrames` 按
// 成员并集 + pad 派生 —— 框与成员从此是两个视角的同一份数据(`cluster_member_outside` 结构上不可能发生)。
// 标题也不再手算 labelRect: 写一次 `labelPlacement`, 渲染面与审计面读同一个 `labelAnchor`(双源老病根除)。
const groupSpec = [
  { id: 'boot', label: '装配层', contains: boot.map((b) => b[0]) },
  { id: 'ctx', label: '服务层', contains: ctx.map((b) => b[0]) },
  { id: 'run', label: '运行层', contains: run.map((b) => b[0]) },
];

const scaffold: Scene = {
  width: 1400, height: 900, // 交给 export 的 fit 重算, 这里只是个占位
  nodes: all.map(([id, label]) => ({ id, rect: boxes[id], label, radius: 10 })),
  groups: groupSpec.map((g): SceneGroup => ({
    id: g.id, label: g.label, contains: [...g.contains],
    rect: { x: 0, y: 0, w: 0, h: 0 }, // 占位: 一律被下面的 fitGroupFrames 覆盖
    labelPlacement: 'inner', fontSize: 12,
  })),
  edges: [], // 折点要用派生后的组框(见下), 所以边在 fitGroupFrames 之后才建
};

// 均匀 pad 取 40 的推导: inner 标题盒的**底边**恒在框顶 + 27.6px(inset 18 + 基线偏移), 成员顶在框顶 + pad,
// 两者之间还要留 showcase 档的 12px 节点净空 ⇒ pad ≥ 39.6。pad 比缺省的 GROUP_FIT_PAD(28) 大, 是因为
// "框顶那条带既要放标题又要放呼吸位"是这张图的版式决策, 不是 core 的缺省能猜的。
const fitted = fitGroupFrames(scaffold, { pad: GROUP_PAD });
if (fitted.changed.length !== scaffold.groups?.length) throw new Error('组框没派生全 —— 占位 rect 会直接进图');
const frame = new Map(fitted.scene.groups!.map((g) => [g.id, g.rect]));
const frameOf = (id: string): Rect => {
  const r = frame.get(id);
  if (!r) throw new Error(`没有 ${id} 这个组框`);
  return r;
};

// --- 边: 全走 route, 折点一次都不手写 ----------------------------------

/** 边的端点: 节点 id, 或 `{ group }`(跨层边指向**整组**, 对应 mermaid 的 `FLAG --> ctx`) */
type End = string | { group: string };
const rectOf = (e: End): Rect => (typeof e === 'string' ? boxes[e] : frameOf(e.group));
const idOf = (e: End): string => (typeof e === 'string' ? e : e.group);

const edges: Scene['edges'] = [];
const sceneLabels: SceneLabel[] = [];

/** 一条边 = route + 可选边标签(标签位置由 edgeLabel 在构建期算好写回 scene, 渲染与审计同源) */
const link = (
  id: string, from: End, to: End, sideFrom: Side, sideTo: Side,
  opts: { text?: string; lane?: number; atFrom?: number; atTo?: number; labelDy?: number } = {},
): void => {
  const fromPort: PortRef = { side: sideFrom, at: opts.atFrom };
  const r = routeOrthogonal({
    from: rectOf(from), fromPort, to: rectOf(to), toPort: { side: sideTo, t: opts.atTo }, lane: opts.lane,
  });
  edges.push({ id, from: idOf(from), to: idOf(to), points: r.points, label: opts.text });
  if (opts.text) sceneLabels.push(edgeLabel({ id, points: r.points }, opts.text, { dy: opts.labelDy }));
};

// 装配层的注入管线(层内顺序, 直线连接)
link('e1', 'EMPTY', 'BASE', 'right', 'left');
link('e2', 'BASE', 'MODE', 'right', 'left');
link('e3', 'MODE', 'USER', 'right', 'left');
link('e4', 'USER', 'FLAG', 'right', 'left');
// 跨层: FLAG → 服务层**整组**(对应原文的 `FLAG -->|Loader + inject| ctx`)
// lane = **两条派生框线的中点**(装配层框底 / 服务层框顶), 由坐标现算而不是写常数 ——
// 常数会在 pad / 层距一动就与框脱钩。不给 lane 时 route 取两个 stub 的中点, 那只离装配层框线 10px
// (`cluster_border_clearance` 上线第一次就把它抓了出来: 与框线相距 1px、并行 368px)。
// 决策点: 入口取服务层顶边 t=0.9(靠右)而不是缺省的中点 —— 管线末端本来就在右侧,
// 让"注入点"贴近来源, 那条边就从 700px 缩到 400px。**这就是"Mermaid 没有的作者旋钮"**:
// 端口位置是一个参数, 不是布局算法的运气。
// 标签落位: 主杆下方 12px(dy=-12) —— 过去它骑在装配层下边线上(下半截戳出框), 是 260918 `text_overlap` 抓到的。
const corridorLane = (frameOf('boot').y + frameOf('boot').h + frameOf('ctx').y) / 2;
link('e5', 'FLAG', { group: 'ctx' }, 'bottom', 'top', {
  text: 'Loader + inject', atTo: 0.9, lane: corridorLane, labelDy: -12,
});
// 服务层内部两对(同列居中 ⇒ 直线)
link('e6', 'TOOLS', 'SP', 'bottom', 'top', { text: 'tools provider' });
link('e7', 'LOOP', 'AG', 'bottom', 'top', { text: 'setFactory' });
// 再跨层: LOOP → 运行层整组(对应 `LOOP -->|assemble / stream / execute| run`)
// 走右侧走廊: 出 LOOP 右边 → 沿走廊下 → 进运行层顶部(lane 对 L 形无效, 位置由运行层摆在哪决定)
link('e8', 'LOOP', { group: 'run' }, 'right', 'top', { text: 'assemble / stream / execute' });
// 运行层内部汇聚
link('e9', 'INBOX', 'LOG', 'bottom', 'left');
link('e10', 'WF', 'LOG', 'bottom', 'right');

export const scene: Scene = { ...fitted.scene, edges, labels: sceneLabels };
export default scene;

// 折线自重叠(相邻段反向 / 隔段同轴反向)归门禁 `no_backtrack` —— 260919 前它是本文件里手写的一段自检,
// 现在读数直接看 metrics 的 `backtracks`(本图 0), 示例不再自己重复一遍判据。

if (import.meta.main) {
  // 出口走 `scripts/runner`(260920): 摘要 / 诊断 / 草稿 / exit code 都在那一处(见该文件头注)
  runScene(scene, { level: 'showcase', fit: { padding: 24, bleed: 1 }, title: 'DeepSeek-Harness 装配链路' });
}
