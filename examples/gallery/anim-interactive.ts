// =====================================================================
// gallery/anim-interactive · 交互高亮 —— SMIL 事件轨 + CSS 轨的分工(零 JS)
//   bun run examples/gallery/anim-interactive.ts > /tmp/anim-interactive.svg
//
// 这张图证明什么:
//   · **`begin="click"` 是一等公民** —— 点某个节点, 它自己那一层(SMIL 高亮层: 实底节点 + 加粗的
//     相关边)的 opacity 从 0 走到 1 并 `fill="freeze"` **冻在末态**。触发靠的正是"目标 = 父元素"
//     那条口径: 动画层那个组**自己就是点击靶子**(组得长得够满 —— 它里面压着实底节点, 是画出来的墨)
//   · **交互语义写清楚**: SMIL **没有状态**(没有"再点一次灭")。这里的语义是**只点不灭**: 每个节点
//     一条独立时间轴, 点几个亮几个; 要复位就得另开一条反向时间轴, 或上脚本 —— 那是另一条立项,
//     不在"静态产物 + 零 JS"这套口径里
//   · **两条轨不抢同一个属性** —— 悬停反馈走内嵌 CSS(`DStyle`), 但它只动 `stroke-width`(halo 描边)
//     与 `cursor`; `opacity` 那一位**留给 SMIL**。两条轨压在同一个属性上时 CSS 会盖住 SMIL 动画
//     (作者声明在动画之上), 图上就成了"点了没反应"却不报错的那类静默事故
//   · 呼吸那一段走 CSS `@keyframes`(无限循环的装饰墨), 与 SMIL 的"点一次冻住"是两种节奏的对照
//
// 动起来什么样(浏览器打开产物; PNG 快照只有第一帧 = 常态 + 可点环):
//   ① 悬停任意节点: 它外圈那道浅蓝环变粗(1.5 → 3)且指针变成手型
//   ② 点节点: 该节点变实底(白字)+ 相关边变蓝加粗, 定格不动(再点同一个节点不会灭)
//   ③ 页脚那个小圆点一直在呼吸(2.6s 一轮) —— 它挂在 CSS 轨上, 与点击无关
//
// 版式(坐标全派生): 四盒同尺寸走 `nodeFit` 取大 · 三列走 `packRow`(服务那列内部走 `packCol`)·
// 边端点走 `rectFace` / 折线走 `routeOrthogonal`(Z 形扇出)· 标签锚点走 `labelAnchor` +
// `labelBoxSize` · 高亮环是盒外扩(`insetRect` 负值)· 画布 = 墨迹并集 + 四边同值留白。
//
// 它是**描述符层**示例(与 `start/basic.ts` / `infograph/progress.ts` 同档): 直出 descriptor,
// 不经 scene、不过门禁 —— 高亮层是压在版式上的墨迹(与图标 / 网格底纹同族, 不进净空审计)。
// =====================================================================

import {
  type DSvg, type Descriptor, animate, circle, group, path, rect, style, svg,
} from '../../src/descriptor';
import { toSVG } from '../../src/serialize';
import { DEFAULT_THEME, canvasLayer, toneStyle } from '../../src/theme';
import { type Size, bounds, insetRect, placeRect, rectAnchor, rectFace } from '../../src/geometry/box';
import { below, rightOf } from '../../src/geometry/place';
import { packCol, packRow } from '../../src/geometry/pack';
import { type Pt, type Rect, round1 } from '../../src/geometry/vec';
import { measureText } from '../../src/knives/measure';
import { routeOrthogonal } from '../../src/knives/route';
import { nodeFit } from '../../src/knives/fit';
import { nodeShape } from '../../src/shapes/node';
import { edgeGeometry, edgeShape, labelAnchor, labelBoxSize } from '../../src/shapes/edge';
import { labelBoxShape, textShape } from '../../src/shapes/text';
import { isMainModule } from '../../src/runtime';

// --- 作者决策: 只有这一段是手写的数 -----------------------------------------

const PAD = 40;          // 画布四边留白(四边同值)
const HEAD_GAP = 10;     // 标题与副题的缝
const LINE_GAP = 10;     // 同一块里两行字的缝
const BLOCK_GAP = 56;    // 副题 → 结构图那一带
const FOOT_GAP = 40;     // 内容底 → 页脚
const COL_GAP = 110;     // 三列之间的缝(边与它的标签住在这条缝里 —— 缝是它们的版位)
const SVC_GAP = 40;      // 右侧那一列里两个服务的缝
const NODE_PAD: [number, number] = [16, 20];   // 盒的内边距 [左右, 上下]
const NODE_RADIUS = 10;
const HALO_PAD = 6;      // 可点环离盒边多远(正值向外)
const HALO_WIDTH = 1.5;
const HOT_WIDTH = 3;     // 高亮边的线宽(常态边是 1.5)
const DOT_R = 4;         // 页脚那个呼吸点
const DOT_GAP = 10;      // 呼吸点与它左边那行字的缝
const TITLE_SIZE = 18;
const SUB_SIZE = 12;

const HOT_TONE = 'blue' as const;
const HOT_EDGE = toneStyle(DEFAULT_THEME, HOT_TONE, 'solid').stroke;   // 高亮墨(实底档的深色)
const HALO_INK = DEFAULT_THEME.tones[HOT_TONE].border;                 // 可点环: 浅一档, 只是"这里能点"

const TITLE = '请求路径 · 点亮它';
const SUB = '点节点 = 它和相关边亮住(fill="freeze"); 悬停 = CSS 轨让环变粗';
const FOOT = [
  '点节点: 高亮层 opacity 0 → 1 并冻在末态(再点不会灭 —— SMIL 无状态)',
  '悬停: CSS 只动 halo 描边 —— opacity 那位留给 SMIL, 两轨不抢同一属性',
] as const;

/** 四件实体: 主标签 + 次标签(盒尺寸由它反算, 字也从它画) */
const NODES = [
  { id: 'client', label: '客户端', sub: 'web / app' },
  { id: 'gateway', label: 'API 网关', sub: 'auth + route' },
  { id: 'users', label: '用户服务', sub: 'profiles' },
  { id: 'orders', label: '订单服务', sub: 'checkout' },
] as const;

/** 内嵌样式表(`DStyle`)—— 产物自带这一小段 CSS, 离开宿主页面照样成立 */
const CSS = [
  '.svx-tap { cursor: pointer }',
  '.svx-tap:hover .svx-halo { stroke-width: 3 }',
  '@keyframes svx-breathe { 0%, 100% { opacity: 0.25 } 50% { opacity: 1 } }',
  '.svx-hint { animation: svx-breathe 2.6s ease-in-out infinite }',
].join('\n');

// --- 两行字的盒: 尺寸走 `measureText`, 落位交给作者 / `below` -------------------

type TextBox = Rect & { content: string; size: number; weight: number };
const caption = (content: string, at: Pt, size: number, weight: number): TextBox => {
  const m = measureText(content, { fontSize: size, weight });
  return { ...at, w: m.width, h: m.height, content, size, weight };
};
const stack = (lines: readonly string[], at: Pt, size: number, weight: number, gap: number): TextBox[] => {
  const out: TextBox[] = [];
  for (const content of lines) {
    const prev = out[out.length - 1];
    out.push(caption(content, { x: at.x, y: prev ? below(prev, { w: 0, h: 0 }, gap).y : at.y }, size, weight));
  }
  return out;
};
const line = (b: TextBox, color: string) =>
  textShape({ x: b.x, y: round1(b.y + b.h / 2), content: b.content, size: b.size, weight: b.weight, baseline: 'central', color });

const title = caption(TITLE, { x: PAD, y: PAD }, TITLE_SIZE, 700);
const sub = caption(SUB, { x: PAD, y: below(title, { w: 0, h: 0 }, HEAD_GAP).y }, SUB_SIZE, 400);

// --- 版位: 三列(客户端 | 网关 | 两个服务) —— 右列自己是一列, 三列再由 `packRow` 横排 ---

const fits = NODES.map((n) => nodeFit({ label: n.label, sub: n.sub, padding: NODE_PAD }));
const BOX: Size = { w: Math.max(...fits.map((f) => f.w)), h: Math.max(...fits.map((f) => f.h)) };
const rowY = below(sub, { w: 0, h: 0 }, BLOCK_GAP).y;
const svc = packCol({ items: [BOX, BOX], gap: SVC_GAP, x: 0, y0: 0 });
const cols = packRow({ items: [BOX, BOX, { w: BOX.w, h: svc.bounds!.h }], gap: COL_GAP, x0: 0, y: 0, align: 'center' });
/** 相对坐标 → 画布坐标(整版一次平移: 左缘 PAD, 顶边 rowY) */
const at = (r: Rect, dx = 0): Rect => ({ ...r, x: round1(r.x + dx + PAD), y: round1(r.y + rowY) });
const client = at(cols.rects[0]);
const gateway = at(cols.rects[1]);
const [users, orders] = svc.rects.map((r) => at(r, cols.rects[2].x));

// --- 边: 客户端那条是直线, 网关扇出那两条走 `routeOrthogonal`(Z 形)---------------
//
// 网关右面按 t 取两个端口(上 / 下), 于是两条 Z 的 stub 不叠在一起; 折点磨圆交给 `edgeGeometry`

const route = (from: Rect, fromT: number, to: Rect) =>
  routeOrthogonal({ from, fromPort: { side: 'right', t: fromT }, to, toPort: { side: 'left' } }).points;
const EDGES = [
  { id: 'client', label: 'HTTPS', points: [rectFace(client, 'right'), rectFace(gateway, 'left')] },
  { id: 'users', label: 'GET /me', points: route(gateway, 0.3, users) },
  { id: 'orders', label: 'POST', points: route(gateway, 0.7, orders) },
] as const;
/** 边的 `d` 与 `edgeShape` 内部那份**同源**(同一个纯函数、同一份入参)—— 高亮层要的正是这条 d */
const drawn = EDGES.map((e) => ({ ...e, d: edgeGeometry({ points: [...e.points], radius: 12, end: 'arrow-triangle' }).d }));
const edgeOf = (id: string) => drawn.find((e) => e.id === id)!;

// 标签: 盒从 `labelBoxSize` 来, 位置骑在折线长度中点上(`labelAnchor` 的原生用法, dy=0 rode 在线上)
const labels = EDGES.map((e) => {
  const size = labelBoxSize(e.label);
  const box = placeRect({ w: size.width, h: size.height }, labelAnchor([...e.points], 0));
  return { ...box, content: e.label };
});

// --- 交互层: 一个节点 = 一个可点单元(halo 常显 + 高亮层常态透明)----------------
//
// ⚠ 动画的**目标是它所在的父元素**, 所以高亮层自己就是那个组: animate 挂在组里 ⇒ 动组的 opacity;
// 而点击靶子也正是这个组(它里面压着实底节点, 是画出来的墨 ⇒ 点到节点就落到它身上)。
// 需要 href 指名道姓的是"非继承属性"(见另外两张示例); 这里动的是可继承/整体性的 opacity, 不用它。

type Topic = { id: string; label: string; sub: string; rect: Rect; own: readonly string[] };
const TOPICS: Topic[] = [
  { ...NODES[0], rect: client, own: ['client'] },
  { ...NODES[1], rect: gateway, own: ['client', 'users', 'orders'] },   // 网关是扇出点: 三条边都算它的
  { ...NODES[2], rect: users, own: ['users'] },
  { ...NODES[3], rect: orders, own: ['orders'] },
];

const interactive = (t: Topic): Descriptor => {
  const halo = insetRect(t.rect, -HALO_PAD);
  return group([
    // 可点环: 常态就在(它说的是"这里能点"), 悬停时由 CSS 加粗
    rect(halo.x, halo.y, halo.w, halo.h, NODE_RADIUS + HALO_PAD, {
      fill: 'none', stroke: HALO_INK, 'stroke-width': HALO_WIDTH, class: 'svx-halo',
    }),
    group([
      // 高亮墨: 相关边先画(它在节点之下), 实底节点压在上面
      ...t.own.map((id) => path(edgeOf(id).d, {
        fill: 'none', stroke: HOT_EDGE, 'stroke-width': HOT_WIDTH, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      })),
      nodeShape({ ...t.rect, label: t.label, sub: t.sub, radius: NODE_RADIUS, tone: HOT_TONE, variant: 'solid' }),
      animate({
        attributeName: 'opacity', from: '0', to: '1', dur: '240ms', begin: 'click',
        easing: 'ease-out-cubic',
        attrs: { fill: 'freeze' },   // 停在末态 = 亮着
      }),
    ], { id: `hot-${t.id}`, opacity: '0' }),
  ], { class: 'svx-tap' });   // 悬停反馈的作用域(见内嵌 CSS)
};

// --- 页脚: 一行说明 + 一个呼吸点(点挂在 CSS 轨上, 与点击无关)--------------------

const footY = below(bounds([...TOPICS.map((t) => t.rect), ...labels])!, { w: 0, h: 0 }, FOOT_GAP).y;
const foot = stack(FOOT, { x: PAD, y: footY }, SUB_SIZE, 400, LINE_GAP);
const dotBox = rightOf(foot[0], { w: 2 * DOT_R, h: 2 * DOT_R }, DOT_GAP, { align: 'center' });
const dot = rectAnchor(dotBox, 'center');

// --- 画布: 墨迹并集 + 四边同值留白 ------------------------------------------
//
// 并集收的是**真墨迹**: 四行文字 / 可点环(盒外扩那一圈)/ 边标签 / 呼吸点。留白同一个数四份。
// 比例算术(实测于 stderr): 墨迹 571×380.9 ⇒ 画布 645×460.9 ≈ **1.4** —— 宽 = 3×BOX(113) + 2×COL_GAP(110)
// 再各让一圈 halo, 说明行都比它窄(所以画的与量的同宽); 高 = 头两行 + 56 + 右列那一摞(2×74 + 40)
// + 40 + 页脚两行。要挪比例先看 stderr 上那两个数, 别改 PAD。
const INK = bounds([
  title, sub, ...TOPICS.map((t) => insetRect(t.rect, -HALO_PAD)), ...labels, ...foot, dotBox,
])!;
const W = round1(INK.x + INK.w + PAD);
const H = round1(INK.y + INK.h + PAD);

const content: Descriptor[] = [
  canvasLayer(DEFAULT_THEME, W, H),
  style(CSS),   // 内嵌样式表: 悬停微反馈 + 呼吸 @keyframes(产物自带, 不靠宿主页面)
  line(title, DEFAULT_THEME.tones.slate.text),
  line(sub, DEFAULT_THEME.label),
  // 常态版式: 边 → 节点
  ...EDGES.map((e) => edgeShape({ points: [...e.points], radius: 12, end: 'arrow-triangle' })),
  ...TOPICS.map((t) => nodeShape({ ...t.rect, label: t.label, sub: t.sub, radius: NODE_RADIUS })),
  // 交互层: 可点环 + 高亮层(整层排在常态版式之上)
  ...TOPICS.map(interactive),
  // 标签与页脚压在交互层之上: 遮罩片的本职是切断穿过的线 —— 高亮边也不许糊住字
  ...labels.map((l) => labelBoxShape({ x: l.x + l.w / 2, y: l.y + l.h / 2, w: l.w, h: l.h, content: l.content })),
  ...foot.map((b) => line(b, DEFAULT_THEME.label)),
  circle(dot.x, dot.y, DOT_R, { fill: HOT_EDGE, class: 'svx-hint' }),
];

/** 出口: 顶层只持**纯数据**(测试 / 读数板 / 网站 import 它都不会吐图), 序列化留在 `isMainModule(import.meta.url)` */
export const doc: DSvg = svg(W, H, content, { 'font-family': 'ui-sans-serif, system-ui, "PingFang SC", sans-serif' });

if (isMainModule(import.meta.url)) {
  // 自检走 stderr(图走 stdout): 版位读数 + 折法 + 比例
  console.error(`盒 ${BOX.w}×${BOX.h} · 三列 ${COL_GAP}/缝 · 右列 ${svc.bounds!.h} 高(两服务 ${SVC_GAP} 缝)`);
  console.error(`折数: ${drawn.map((e) => `${e.id}=${e.points.length - 1}`).join(' / ')} 段 · 可点单元 ${TOPICS.length} 个(高亮层 id hot-*)`);
  console.error(`墨迹 ${INK.w}×${INK.h} → 画布 ${W}×${H} · 比例 ${round1(W / H)}(画廊带 1.3~1.7)`);
  process.stdout.write(toSVG(doc));
}
