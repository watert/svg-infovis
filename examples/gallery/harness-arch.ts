// =====================================================================
// harness-arch · 立项实验的对照组: 同一张真图(DeepSeek-Harness 装配链, 15 节点)用 core 手排
//
// 为什么要它: 立项实验证明 Mermaid 的痛不是"几何违规"(它全绿), 而是**排布决策不在作者手里**
// —— 作者用 subgraph 明写的三层被摊到三个角落。本文件把同一份拓扑(取自一张公开的
// harness 装配链 mermaid 源)用 core 重排一遍,
// 让"作者旋钮"这件事可比: 三层真的竖起来、枢纽真的居中、对比真的并列。
//
// 它是**手排税**的测量载体: 版式(层序 / 行序 / 行内次序 / 端口 / 走廊)全部手给, 量一行行码下来
// 要多少轮才过门禁。260920 起,**可推导的几何一律不手写** —— 框体(fitGroupFrames) / 盒宽(nodeFit)
// / 行内位置(packRow) / 标签盒(labelBoxSize) / 腰线(从派生框现算) 五处交回 core, 手排税只该
// 花在"core 无从猜的决策"上: 层里谁在哪一排哪一列、端口取哪个比例、跨层边走哪条通道。
//
// 260926 版式重做 —— 上一版的"乱"有三处根因, 每处都对应一支具体的旋钮:
//   ① 装配层的箭头长短不一(88/88/40/42): 位置手写了 cx, 而盒宽是 nodeFit 反算的 —— 两者一错开,
//      缝就参差。改成**由缝反算位置**(行内按 gap 铺开), 五条注入边的长度一律相等。
//   ② 服务层的两列与底部一排外缘不齐, 运行层又吊在右下角 ⇒ 画布左下空出一大块。改成: 三层
//      **骑同一条中轴**, 层内各排外缘对齐(层内容是一块方正的矩形), 运行层挂在中轴正下方。
//   ③ 两条跨层边都在空白里拉长线(老版 e8 是 486px 的竖线, 标签悬在线中间)。改成: 出口选在层内
//      **末排成员的底面** —— e8 成了一条 136px 的竖直线; e5 落在层间走廊里, 标签骑走廊横段
//      (两者的标签都从派生框现算, 不再悬在空白处)。
//
//   bun run examples/gallery/harness-arch.ts > /tmp/harness.svg
//
// 它同时是个**可读的 scene 模块**(下面 `export const scene`), 迭代时先读数再出图:
//   bun run scripts/inspect.ts examples/gallery/harness-arch.ts --showcase --metrics --rows=80
// =====================================================================

import { type Scene, type SceneGroup, type SceneLabel } from '../../src/knives/audit';
import { nodeFit } from '../../src/knives/fit';
import { packRow } from '../../src/geometry/pack';
import { routeOrthogonal, type PortRef, type Side } from '../../src/knives/route';
import { edgeLabel, labelBoxSize } from '../../src/shapes/edge';
import { fitGroupFrames } from '../../src/scene';
import { contentBounds } from '../../src/export';
import { rectFace } from '../../src/geometry/box';
import { mid, type Pt, type Rect } from '../../src/geometry/vec';
import { runScene } from '../../scripts/runner';
import { isMainModule } from '../../src/runtime';

// --- 版式旋钮(全是作者决策) --------------------------------------------
const H = 54;             // 盒高下限。nodeFit 的内容下限是 39, 高度这一侧没有门禁 —— 节奏由版式说了算
const PAD_X = 16;         // 标签呼吸位(比 showcase 档的 10 宽 6, 观感更松)。它同时进 nodeFit 的 padding
const GAP_X = 56;         // 行内相邻盒的缝 —— 行内位置从这个数反算, 所以装配层五条边的长度一律相等
const ROW_GAP = 56;       // 层内相邻行的缝
const CORRIDOR = 96;      // 层框之间的走廊: 跨层边(竖直)的标签就住在这里
const GROUP_PAD = 40;     // 组框均匀 pad(推导见下方 fitGroupFrames 处, 比缺省的 GROUP_FIT_PAD=28 大)
const LABEL_MARGIN = 12;  // 成对行里标签两侧的呼吸位(缝 = 标签宽 + 2×它 ⇒ 缝一定装得下那行字)
const PAIR_COL_GAP = 160; // 两对之间的缝(比组内缝宽, 两组才读得开)
const RUN_GAP = 120;      // 运行层两个来源之间的缝(比 GAP_X 宽: 汇聚要留出 V 的两条腿)
const FIRST_TOP = 80;     // 第一层内容顶。画布由 export 的 fit 重算, 这里只是自己坐标系的原点
const ASSEMBLE = 'assemble / stream / execute';

/** 一个盒 = id + 标签。**盒宽由 nodeFit 反算**, 这里不给尺寸(给了就是第二个真相) */
type Item = readonly [id: string, label: string];

// --- 作者决策: 三层, 层内谁在哪一排 / 谁和谁成对 -------------------------

// 装配层  一条有序注入管线, 行内次序 = 执行次序
const boot: Item[] = [
  ['EMPTY', '空 entry list'],
  ['BASE', 'dsh-base patch'],
  ['MODE', 'web / headless patch'],
  ['USER', 'profile + home cordis.patch.yml'],
  ['FLAG', '--patch'],
];
// 服务层  上一排是并排的旁路能力, 下一排是**两对水平注入**(能力 → 消费方)
// 决策点 ①: 成对行排在**末排** —— 于是 ctx.agentLoop 的出口是一条竖直直线, 直接落进运行层;
//   反过来把旁路能力摆在末排, 那条边就得横穿画布绕过整排盒子(实测 682px, 当场触 `long_edge`)。
// 决策点 ②: 旁路那一排把**最宽的接缝盒放在中间**(两侧是小的 ctx.runs / ctx.llm)。这一排本来就是
//   并列的旁观项, 次序无语义; 而两对之间那道 ~130px 的空档正好被它补上 —— `cluster_corridor`
//   量的是**投影**上的空档(成员盒按 FOOTPRINT_PAD 外扩后求并集, 再看最长的一段断裂), 不是盒子之间
//   的缝宽; 中间空着就是一道 132px 的走廊(> 节点尺度 114px ⇒ 报警), 摆上它就只剩 96px。
const seams: Item[] = [
  ['SESS', 'ctx.runs'],
  ['SEAM', 'ctx.shell / ctx.fs / ctx.subprocess …'],
  ['LLM', 'ctx.llm'],
];
/** 一对 = 左盒 → 右盒 一条水平注入边, 缝里放那行标签 */
type Pair = { from: Item; to: Item; label: string };
const pairs: Pair[] = [
  { from: ['TOOLS', 'ctx.tools'], to: ['SP', 'ctx.systemPrompt'], label: 'tools provider' },
  { from: ['LOOP', 'ctx.agentLoop'], to: ['AG', 'ctx.agents'], label: 'setFactory' },
];
// 运行层  两个来源汇聚到一处(而不是 Mermaid 那样排成一条平链)
const sources: Item[] = [['INBOX', 'agent inbox'], ['WF', 'agent/* 与 tools/* 瀑布']];
const sink: Item = ['LOG', 'event log'];

// --- 盒: 宽走 nodeFit 反算, 高吃版式下限 --------------------------------

const boxes: Record<string, Rect> = {};
const sized = new Map<string, Rect>();
const sizeOf = (it: Item): Rect => {
  let hit = sized.get(it[0]);
  if (!hit) {
    // 档位与出图档位对齐 —— showcase(按 standard 算盒再按 showcase 出图会差 4px, 那条边正好爆 `label_fit`)
    const f = nodeFit({ label: it[1], level: 'showcase', padding: PAD_X });
    hit = { x: 0, y: 0, w: f.w, h: Math.max(H, f.h) };
    sized.set(it[0], hit);
  }
  return hit;
};
/** 一行的自然宽 —— 问 packRow 要, 不在这里手抄一遍 "Σ盒宽 + 缝"(同一句话写两遍必漂) */
const rowW = (items: readonly Item[], gap: number | readonly number[]): number =>
  (packRow({ items: items.map(sizeOf), gap, x0: 0, y: 0 }).bounds as Rect).w;
// 横轴原点: 层的中轴落在画布左侧留白之后(画布宽由最宽的那层定 —— 装配层)。
// 上面全部算在"中轴 = 0"的局部坐标里(层的可比性靠它), 出图前整体挪到正坐标 ——
// scene 里不留负数(`single_svg` 只看声明的画布, 负数就是越界)。
const AXIS = GROUP_PAD + 24 + rowW(boot, GAP_X) / 2;
/** 行内第 i 个盒的 x 中线, **相对层中轴**(要绝对坐标就自己加 AXIS) —— 汇聚点这类相对量用它 */
const rowCxL = (items: readonly Item[], gap: number | readonly number[], i: number): number => {
  let x = -rowW(items, gap) / 2;
  const gaps = typeof gap === 'number' ? items.map(() => gap) : [...gap, 0];
  for (let k = 0; k < i; k++) x += sizeOf(items[k]).w + gaps[k];
  return x + sizeOf(items[i]).w / 2;
};
/** 按缝铺开一行并写进 boxes —— 整行骑在中轴上的 `cx` 处(层内各排因此同轴; cx 是**局部**坐标) */
const placeRow = (items: readonly Item[], cx: number, y: number, gap: number | readonly number[]): Rect[] => {
  const packed = packRow({ items: items.map(sizeOf), gap, x0: AXIS + cx - rowW(items, gap) / 2, y });
  items.forEach((it, i) => { boxes[it[0]] = packed.rects[i]; });
  return packed.rects;
};

// --- 层的横轴: 层的宽由"最宽的那一排"定, 各排骑同一条中轴 -----------------

// 服务层: 层的宽取两排的较大者(成对行通常更宽), **旁路那一排再铺到同一个宽度** ⇒ 两排外缘对齐;
// 成对行的缝由**标签宽**反算(缝要装得下那行字), 组内的缝因此是内容定的, 不是拍出来的
const pairGap = (p: Pair): number => labelBoxSize(p.label).width + 2 * LABEL_MARGIN;
const pairItems = pairs.flatMap((p) => [p.from, p.to]);
const pairGaps = pairs.flatMap((p, i) => (i === pairs.length - 1 ? [pairGap(p)] : [pairGap(p), PAIR_COL_GAP]));
const ctxW = Math.max(
  rowW(pairItems, pairGaps),
  rowW(seams, GAP_X),
);
const seamGap = (ctxW - seams.reduce((s, it) => s + sizeOf(it).w, 0)) / (seams.length - 1);

// 运行层: 汇聚点落在**两个来源的中线**上(两条腿等长, V 才对称 —— "层的中心"是另一回事),
// 整块内容再按包围盒挪到层的中轴上。
const srcW = rowW(sources, RUN_GAP);
const srcSinkCx = mid(
  { x: rowCxL(sources, RUN_GAP, 0), y: 0 },
  { x: rowCxL(sources, RUN_GAP, sources.length - 1), y: 0 },
).x;
const runL = Math.min(-srcW / 2, srcSinkCx - sizeOf(sink).w / 2);
const runR = Math.max(srcW / 2, srcSinkCx + sizeOf(sink).w / 2);
const runShift = -(runL + runR) / 2;

// --- 层的竖轴: 内容顶 = 上一层组成员底 + pad + 走廊 + pad -----------------
//
// 这一串加法与 fitGroupFrames 的派生是**两份**算法(框 = 成员并集 ± GROUP_PAD), 所以下面派生完
// 要当场对账(量真走廊), 不然版式会静默漂开。
const rowY = (top: number, r: number): number => top + r * (H + ROW_GAP);
const bootTop = FIRST_TOP;
const ctxTop = bootTop + H + GROUP_PAD + CORRIDOR + GROUP_PAD;
const runTop = rowY(ctxTop, 1) + H + GROUP_PAD + CORRIDOR + GROUP_PAD;

placeRow(boot, 0, bootTop, GAP_X);
placeRow(seams, 0, rowY(ctxTop, 0), seamGap);
placeRow(pairItems, 0, rowY(ctxTop, 1), pairGaps);
placeRow(sources, runShift, rowY(runTop, 0), RUN_GAP);
placeRow([sink], runShift + srcSinkCx, rowY(runTop, 1), 0);

const all = [...boot, ...seams, ...pairItems, ...sources, sink];

// 组框**只声明成员**(membership 声明制): `rect` 是占位, 框体由下面 `fitGroupFrames` 按
// 成员并集 + pad 派生 —— 框与成员从此是两个视角的同一份数据(`cluster_member_outside` 结构上不可能发生)。
// 标题也不再手算 labelRect: 写一次 `labelPlacement`, 渲染面与审计面读同一个 `labelAnchor`(双源老病根除)。
const groupSpec = [
  { id: 'boot', label: '装配层', contains: boot.map((b) => b[0]) },
  { id: 'ctx', label: '服务层', contains: [...seams.map((s) => s[0]), ...pairItems.map((p) => p[0])] },
  { id: 'run', label: '运行层', contains: [...sources.map((s) => s[0]), sink[0]] },
];
const scaffold: Scene = {
  width: 0, height: 0, // 占位: 建完边和标签由 contentBounds 现算(见文件末)
  nodes: all.map((it) => ({ id: it[0], rect: boxes[it[0]], label: it[1], radius: 10 })),
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
if (fitted.changed.length !== groupSpec.length) throw new Error('组框没派生全 —— 占位 rect 会直接进图');
const frameOf = (id: string): Rect => {
  const r = fitted.scene.groups!.find((g) => g.id === id)?.rect;
  if (!r) throw new Error(`没有 ${id} 这个组框`);
  return r;
};
// 对账: 竖轴那串加法给出的层距必须就是派生框量出来的走廊(两份算法, 一处对账)
for (const [a, b] of [['boot', 'ctx'], ['ctx', 'run']] as const) {
  const got = frameOf(b).y - (frameOf(a).y + frameOf(a).h);
  if (Math.abs(got - CORRIDOR) > 0.5) throw new Error(`${a}→${b} 的走廊是 ${got}, 不是版式给的 ${CORRIDOR}`);
}

// --- 边: 全走 route, 折点一次都不手写 ----------------------------------

/** 边的端点: 节点 id, 或 `{ group }`(跨层边指向**整组**, 对应 mermaid 的 `FLAG --> ctx`) */
type End = string | { group: string };
const rectOf = (e: End): Rect => (typeof e === 'string' ? boxes[e] : frameOf(e.group));
const idOf = (e: End): string => (typeof e === 'string' ? e : e.group);

const edges: Scene['edges'] = [];
const sceneLabels: SceneLabel[] = [];

/** 一条边 = route + 可选边标签(标签位置在构建期算好写回 scene, 渲染与审计同源) */
const link = (
  id: string, from: End, to: End, sideFrom: Side, sideTo: Side,
  opts: { text?: string; lane?: number; atTo?: number; labelDy?: number; labelAt?: Pt } = {},
): void => {
  const fromPort: PortRef = { side: sideFrom };
  const r = routeOrthogonal({
    from: rectOf(from), fromPort, to: rectOf(to), toPort: { side: sideTo, t: opts.atTo }, lane: opts.lane,
  });
  edges.push({ id, from: idOf(from), to: idOf(to), points: r.points, label: opts.text });
  if (opts.text) {
    // 落位二选一: 给了 `labelAt` 就用它(折线中点落在竖段上、而标签该住走廊时只能显式给), 否则沿法线偏 `labelDy`
    const place = opts.labelAt ? { at: opts.labelAt } : { dy: opts.labelDy ?? 0 };
    sceneLabels.push(edgeLabel({ id, points: r.points }, opts.text, place));
  }
};

// 装配层的注入管线(层内次序 = 执行次序, 缝一律 GAP_X ⇒ 五条边等长)
link('e1', 'EMPTY', 'BASE', 'right', 'left');
link('e2', 'BASE', 'MODE', 'right', 'left');
link('e3', 'MODE', 'USER', 'right', 'left');
link('e4', 'USER', 'FLAG', 'right', 'left');
// 服务层的两对水平注入(缝由标签宽反算 ⇒ 标签正好落在两盒之间)
pairs.forEach((p, i) => link(`p${i}`, p.from[0], p.to[0], 'right', 'left', { text: p.label }));
// 运行层内部汇聚(两个来源各一条 L, 进 event log 的两侧)
link('e9', 'INBOX', 'LOG', 'bottom', 'left');
link('e10', 'WF', 'LOG', 'bottom', 'right');

// 跨层 e5 · FLAG → 服务层**整组**(对应原文的 `FLAG -->|Loader + inject| ctx`)
// 走"竖落 → 走廊横段 → 竖落": 出底面沿 FLAG 的中线下来, 在走廊中点折向左, 进服务层框的顶边。
// 入口取顶边 t=0.9(靠右)而不是缺省的中点 —— 管线末端本来就在右侧, 让注入点贴近来源,
// 那条横段就从 495px 收到 102px。**这就是"Mermaid 没有的作者旋钮"**: 端口位置是一个参数,
// 不是布局算法的运气。lane = **两条派生框线的中点**(装配层框底 / 服务层框顶), 由坐标现算而不是写常数
// —— 常数会在 pad / 层距一动就与框脱钩(不给 lane 时 route 取两个 stub 的中点, 那只离框线 10px,
// `cluster_border_clearance` 上线第一次就把它抓了出来: 与框线相距 1px、并行 368px)。
// 标签落位: 横段下方 12px(`labelDy: -12` 对该朝向的横段就是往下; 过去它骑在装配层下边线上, 是 260918 `text_overlap` 抓到的)
link('e5', 'FLAG', { group: 'ctx' }, 'bottom', 'top', {
  text: 'Loader + inject', atTo: 0.9,
  lane: mid(rectFace(frameOf('boot'), 'bottom'), rectFace(frameOf('ctx'), 'top')).y,
  labelDy: -12,
});

// 跨层 e8 · LOOP → 运行层整组(对应 `LOOP -->|assemble / stream / execute| run`)
// ctx.agentLoop 在服务层**末排** ⇒ 出底面竖直落进运行层框顶边, 一条直线(0 折点)。
// 端口取运行层框顶的 t = LOOP 的中线 ⇒ 这条边是竖直的: 端口位置是作者算出来的一个参数,
// 不是"布局算法碰巧对齐"。标签落位: 折线的长度中点落在服务层框底那道留白里(离本层框线太近),
// 而这里要它住进走廊 —— 于是显式给, y 走走廊中线(两条派生框线的中点), 与 e5 的 lane 同一套现算口径。
const ctxBottomLane = mid(rectFace(frameOf('ctx'), 'bottom'), rectFace(frameOf('run'), 'top')).y;
link('e8', 'LOOP', { group: 'run' }, 'bottom', 'top', {
  text: ASSEMBLE,
  // 端口比例由 LOOP 的中线倒推(端口是比例参数, 而"从哪个 x 落下"是作者的几何决策),
  // 于是这条边是**竖直**的 —— 不是"布局算法碰巧对齐"
  atTo: (rectFace(boxes.LOOP, 'bottom').x - frameOf('run').x) / frameOf('run').w,
  labelAt: { x: rectFace(boxes.LOOP, 'bottom').x, y: ctxBottomLane },
});

// 声明的画布跟着内容走(与 `fitScene` 同一份公式): 不 fit 的消费者(读数 / 嵌入)也拿得到正确边界
const scene: Scene = { ...fitted.scene, edges, labels: sceneLabels };
const cb = contentBounds(scene);
scene.width = Math.round((cb?.x ?? 0) + (cb?.w ?? 0) + 24);
scene.height = Math.round((cb?.y ?? 0) + (cb?.h ?? 0) + 24);

export { scene };
export default scene;

// 折线自重叠(相邻段反向 / 隔段同轴反向)归门禁 `no_backtrack` —— 260919 前它是本文件里手写的一段自检,
// 现在读数直接看 metrics 的 `backtracks`(本图 0), 示例不再自己重复一遍判据。

if (isMainModule(import.meta.url)) {
  // 出口走 `scripts/runner`(260920): 摘要 / 诊断 / 草稿 / exit code 都在那一处(见该文件头注)
  runScene(scene, { level: 'showcase', fit: { padding: 24, bleed: 1 }, title: 'DeepSeek-Harness 装配链路' });
}
