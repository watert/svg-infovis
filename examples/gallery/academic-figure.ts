// =====================================================================
// academic-figure · 学术风 golden case: 复刻一张 State 对照图
//
// 四件新槽的活体示范:
//   · THEMES.paper —— 墨水线/白底学术观感
//   · variant 'tint' —— 粉色上下文框 / 蓝色强调状态框
//   · SceneNode.opacity + struck —— Ephemeral Reasoning 废除格(淡化 + 红 X)
//   · SceneText.weight / color —— 面板标题 / 红蓝小标题 / 红字注释
// 出口: exportScene fail-closed(showcase 档), 门禁没过 exit 1 并落草稿图。
//
//   白名单(门禁放过但它要说一声, 逐条声明为"有意"):
//   · `mixed_cluster_row` ×3(第 2 / 3 / 4 层)—— 两栏**并排**就是这张图的全部版式: 左栏 5 格 /
//     右栏 3 格天然跨同样那几层, 而两栏正好互为镜像。逐栏独占一层会让"左右对照"这个语义散掉,
//     所以是**有意让它们同层**, 不是摆错。它报的是 warning(提示分组被同层打散), 不是 error。
// =====================================================================

import {
  THEMES, routeOrthogonal, textNote, edgeLabel, bounds, centeredOn, below, packCol, rectCenter,
  type Rect, type Scene, type SceneOwner, type SceneText,
} from '../../src/index';
import { runScene } from '../../scripts/runner';

const theme = THEMES.paper;
const W = 1280, H = 740;                          // 占位: 出口 `fit: true` 会按内容重定

// --- 版式常量(两栏镜像) ---------------------------------------------------
const BOX_W = 260, BOX_H = 50, STEP = 72;
const LEFT_CX = 240, RIGHT_CX = 860;
const FRAME_PAD: [number, number] = [30, 26];    // 容器框离格边: 左右 30 / 上下 26(两栏同一份)
// 三块跨栏盒: 盒心骑在**中线**上(`centeredOn`), x 一个都不手算 —— 参考盒是"中线带"(只提供
// "心在哪"), 宽度是作者决策的版式量, 不是算出来的。LLM / LLM_R 各骑一栏中线, EXEC / EXEC_R
// 跟着 LLM 往下(`below`, 同轴), GHOST 骑两栏之间那条走廊。
const LLM: Rect = centeredOn({ x: LEFT_CX, y: 560, w: 0, h: 60 }, { w: BOX_W, h: 60 });
const LLM_R: Rect = centeredOn({ x: RIGHT_CX, y: 560, w: 0, h: 60 }, { w: BOX_W, h: 60 });
const EXEC: Rect = below(LLM, { w: 160, h: 46 }, 50);
const EXEC_R: Rect = below(LLM_R, { w: 160, h: 46 }, 50);
const GHOST: Rect = centeredOn({ x: LEFT_CX, y: 560, w: RIGHT_CX - LEFT_CX, h: 60 }, { w: 160, h: 60 });

/** 旁注文本: 尺寸与落位走 `textNote`(与渲染同源) —— `at` 即盒心(anchor 缺省 middle), `owner` 是归属声明 */
const note = (id: string, cx: number, cy: number, text: string, o: { size: number; weight?: number; color?: string; owner?: SceneOwner }): SceneText =>
  textNote({ id, content: text, at: { x: cx, y: cy }, fontSize: o.size, weight: o.weight, color: o.color, owner: o.owner });

// --- 节点 ------------------------------------------------------------------
// 两栏各是一次 `packCol`(列中心线与上方的标题 / 小标题共用 LEFT_CX / RIGHT_CX ⇒ 整栏同轴);
// 容器框则是**派生量** —— 由该栏的并集外扩 FRAME_PAD 得到(格动框跟着动, 四个数不再手写)
const L = ['Procedural Instructions', 'Conversation History', 'Previous Observations', 'Previous Reasoning', 'Latest Observation o_t'];
const R = ['Procedural Instructions', 'Execution State Σ_{t-1}', 'Latest Observation o_t'];
const colL = packCol({ items: L.map(() => ({ w: BOX_W, h: BOX_H })), pitch: STEP, x: LEFT_CX, y0: 156, align: 'center' });
const colR = packCol({ items: R.map(() => ({ w: BOX_W, h: BOX_H })), pitch: STEP, x: RIGHT_CX, y0: 212, align: 'center' });
const FRAME_L: Rect = bounds(colL.rects, { pad: FRAME_PAD })!;
const FRAME_R: Rect = bounds(colR.rects, { pad: FRAME_PAD })!;

const nodes: Scene['nodes'] = [
  ...L.map((label, i) => ({ id: `l${i}`, rect: colL.rects[i], label, fontSize: 15 })),
  ...R.map((label, i) => ({ id: `r${i}`, rect: colR.rects[i], label, fontSize: 15 })),
  { id: 'llm', rect: LLM, label: 'Large Language Model', fontSize: 16 },
  { id: 'llm-r', rect: LLM_R, label: 'Large Language Model', fontSize: 16 },
  { id: 'exec', rect: EXEC, label: 'Execute Action', fontSize: 15 },
  { id: 'exec-r', rect: EXEC_R, label: 'Execute Action', fontSize: 15 },
  { id: 'ghost', rect: GHOST, label: 'Ephemeral\nReasoning', fontSize: 15, struck: true, opacity: 0.5 },
];

// 左栏 2-4 格 = 上下文角色(粉 tint); 右栏状态格 = 强调(蓝 tint 粗边)。样式走覆盖表(LLM 灰底是单点例外)
const nodeStyles = {
  l1: { tone: 'rose', variant: 'tint' }, l2: { tone: 'rose', variant: 'tint' }, l3: { tone: 'rose', variant: 'tint' },
  r0: { strokeWidth: 2 }, r2: { strokeWidth: 2 },
  r1: { tone: 'blue', variant: 'tint', strokeWidth: 2.5 },
  llm: { fill: '#e5e7eb', stroke: '#111827', textColor: '#111827', strokeWidth: 1.8 },
  'llm-r': { fill: '#e5e7eb', stroke: '#111827', textColor: '#111827', strokeWidth: 1.8 },
  exec: { dash: '6 4' }, 'exec-r': { dash: '6 4' },
  ghost: { dash: '6 4', stroke: '#9ca3af', textColor: '#6b7280' },
} as const;

// --- 组(成员声明制) ----------------------------------------------------------
const groups = [
  { id: 'ctx-l', rect: FRAME_L, tone: 'rose' as const, strokeWidth: 1.8, contains: L.map((_, i) => `l${i}`) },
  { id: 'ctx-r', rect: FRAME_R, tone: 'blue' as const, strokeWidth: 1.8, contains: ['r0', 'r1', 'r2'] },
];

// --- 边(折点一律 routeOrthogonal) ---------------------------------------------
const route = (from: Rect, fromPort: { side: 'top' | 'bottom' | 'left' | 'right' }, to: Rect, toPort: { side: 'top' | 'bottom' | 'left' | 'right' }, extra: Record<string, unknown> = {}) =>
  routeOrthogonal({ from, fromPort, to, toPort, ...extra });

const eFrameL = route(FRAME_L, { side: 'bottom' }, LLM, { side: 'top' });
const eLlmL = route(LLM, { side: 'bottom' }, EXEC, { side: 'top' });
const eFrameR = route(FRAME_R, { side: 'bottom' }, LLM_R, { side: 'top' });
const eLlmR = route(LLM_R, { side: 'bottom' }, EXEC_R, { side: 'top' });
const eLoop = route(LLM_R, { side: 'right' }, colR.rects[1], { side: 'right' }, { lane: 1130 }); // 状态回流(粗)
const eGhost = route(LLM_R, { side: 'left' }, GHOST, { side: 'right' });                          // 废除箭头(虚线)

const edges: Scene['edges'] = [
  { id: 'e-frame-l', from: 'ctx-l', to: 'llm', points: eFrameL.points },
  { id: 'e-llm-l', from: 'llm', to: 'exec', points: eLlmL.points },
  { id: 'e-frame-r', from: 'ctx-r', to: 'llm-r', points: eFrameR.points },
  { id: 'e-llm-r', from: 'llm-r', to: 'exec-r', points: eLlmR.points },
  { id: 'e-loop', from: 'llm-r', to: 'r1', points: eLoop.points },
  { id: 'e-ghost', from: 'llm-r', to: 'ghost', points: eGhost.points },
];
const edgeStyles = {
  'e-loop': { width: 3, color: '#111827' },
  'e-ghost': { color: '#9ca3af', dash: '5 5', end: 'arrow-line' as const },
};

// --- 旁注文本(标题/小标题/废除格图注) ------------------------------------------
const texts: SceneText[] = [
  note('title-l', LEFT_CX, 55, 'Traditional Skill Execution', { size: 24, weight: 700 }),
  note('sub-l', LEFT_CX, 102, 'Prompt Context O(T)', { size: 17, weight: 700, color: '#be123c' }),
  note('title-r', RIGHT_CX, 55, 'SKILL.State Runtime', { size: 24, weight: 700 }),
  note('sub-r', RIGHT_CX, 158, 'Prompt Context O(1)', { size: 17, weight: 700, color: '#1d4ed8' }),
  // 废除格图注: 两行是**同一句话的换行**(不是两条独立旁注) —— 260923 起 `textNote` 收 `\n`,
  // 于是它是一条多行旁注(块心落在格下 40px), 并顺手声明归属: 它是 `ghost` 这个节点的说明
  note('discard', rectCenter(GHOST).x, 660, 'Discarded after\nstate projection',
    { size: 13, color: '#be123c', owner: { kind: 'node', id: 'ghost' } }),
];

// --- 边标签(回流的双行说明) ---------------------------------------------------
// 260923 之前这里手拼了两条 `SceneText`(`loop-1` 14/700 + `loop-2` 13/400): 视觉上是 `e-loop`
// 的**一条两行标签**, 却在 `texts[]` 里 —— 于是既拿不到 `label_clearance` 的门禁保护(那时
// `edgeLabel` 严格单行), 又要自己把行距算对。接上行块口径后它回到 `labels[]`: 一个块心 +
// 一个字号, 检测盒与渲染同源。
// 代价(明写): `SceneLabel` 没有 `weight` 字段, 两行的主/次字重差(700/400)随之消失;
// 实测块宽 108.9(13px 字), 块心 x 取 1198 ⇒ 盒左端离 `e-loop` 的 lane(1130) 13.6px(1143.6)。
const eLoopLabel = edgeLabel({ id: 'e-loop', points: eLoop.points }, 'State Update\nJSON Patch ΔΣ',
  { id: 'loop', fontSize: 13, at: { x: 1198, y: 482 } });

export const scene: Scene = { width: W, height: H, nodes, edges, groups, texts, labels: [eLoopLabel] };

// --- 出口(fail-closed + 诊断走 stderr) -----------------------------------------
//
// 260920 起出口**统一到 stdout**(过去本文件自己 `writeFileSync('/tmp/academic-figure.svg')`)——
// 它是全仓唯一一个"图不走 stdout"的出图示例, 于是 `build-example-pngs.sh` 得为它单独登记一条
// 产物路径; **出口不统一本身就是一处纪律裂缝**(清单里多一个特例, 就多一个漏登记的机会)。
if (import.meta.main) {
  runScene(scene, { level: 'showcase', theme, fit: true, nodeStyles, edgeStyles });
}
