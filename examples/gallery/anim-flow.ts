// =====================================================================
// gallery/anim-flow · 流程进行中 —— 蚂蚁线在跑 + 阶段依次点亮(纯 SMIL, 零 JS)
//   bun run examples/gallery/anim-flow.ts > /tmp/anim-flow.svg
//
// 这张图证明什么(ROADMAP 动画条 ① 档的活体):
//   · **不动版图, 只加时间轴** —— 版式与一张静态流水线图一字不差; 动画是压在同一批坐标上的
//     第二层墨迹(虚线 overlay + 高亮环), 于是"在跑"这件事不花任何版面代价
//   · **`stroke-dashoffset` 只能走 href** —— 它不是可继承属性: animate 挂在自己的组上只会动那个
//     `<g>`(容器根本没这个属性), 图上**静默不动**。所以四条蚂蚁线都指名道姓:
//     `attrs: { href: '#<path id>' }` 把目标钉在**那条 path 自己**身上(口径见 src/descriptor.ts 动画段)。
//     ⚠ 代价记在这儿: href / 同步基都是**按 id 在整篇文档里找第一个**(同页内联两份同一张产物时,
//     第二份的动画会落在第一份的元素上)—— 要一页并排多份, 得给 id 加实例前缀, 那是宿主的事
//   · **时序链**: 四个环的 `begin` 依次接在前一个的 `.end` 上 —— 改第一环的时长, 后面三环自己跟着挪
//     (⚠ 同步基引用有个**静默坑**: 被引用的 id 不许带连字符 —— `lit-1.end` 整条链一动不动且不报错;
//      精确边界与实测见下面的 `ring`)
//   · **命名缓动**: 曲线一律从 `EASING_SPLINES` 点名, 本文件一个贝塞尔字面量都不自带
//
// 动起来什么样(浏览器打开产物; PNG 快照只有第一帧 —— 静帧就是"未点亮"的那张流程图):
//   ① 三条主线 + 一条回流的虚线**蚂蚁线**恒在跑(一律顺着箭头方向爬)
//   ② 四个阶段环自左向右依次亮起(0.4s 起, 每环 0.34s)
//   ③ 末环亮完开始**呼吸**(1 → 0.45 → 1, 2.2s 一轮, 无限循环) —— "进行中"停在最后一格
//
// 版式(坐标全派生; 手写数字只剩下面那几个具名作者常量): 四盒同尺寸走 `nodeFit` 逐条反算取大 ·
// 盒位走 `packRow` · 边端点走 `rectFace` · 回流走廊走 `below` 推 · 缝间标签走 `mid` + `labelBoxSize` ·
// **画布**走 `bounds(墨迹)` + 四边同值留白(含动画层那圈外扩的环 —— 亮起来才不贴边)。
//
// 它是**描述符层**示例(与 `start/basic.ts` / `infograph/progress.ts` 同档): 直出 descriptor,
// 不经 scene、不过门禁 —— 动画是压在版式上的墨迹(与图标 / 网格底纹同族, 不进净空审计)。
// =====================================================================

import {
  type DSvg, type Descriptor, animate, group, path, rect, svg,
} from '../../src/descriptor';
import { toSVG } from '../../src/serialize';
import { DEFAULT_THEME, canvasLayer, toneStyle } from '../../src/theme';
import { type Size, bounds, insetRect, placeRect, rectFace } from '../../src/geometry/box';
import { mid, type Pt, type Rect, round1 } from '../../src/geometry/vec';
import { packRow } from '../../src/geometry/pack';
import { below } from '../../src/geometry/place';
import { measureText } from '../../src/knives/measure';
import { nodeFit } from '../../src/knives/fit';
import { nodeShape } from '../../src/shapes/node';
import { edgeGeometry, edgeShape, labelBoxSize } from '../../src/shapes/edge';
import { labelBoxShape, textShape } from '../../src/shapes/text';

// --- 作者决策: 只有这一段是手写的数 -----------------------------------------

const PAD = 40;          // 画布四边留白(四边同值 —— 与内容缩到多大无关)
const HEAD_GAP = 10;     // 标题与副题的缝(同一话题的两行)
const BLOCK_GAP = 62;    // 副题 → 流水线那一行(换话题了, 缝比 HEAD_GAP 明显大一档)
const FOOT_GAP = 36;     // 内容底 → 页脚第一行; 页脚两行之间再用 HEAD_GAP
const ROW_GAP = 48;      // 阶段之间的缝: 边与箭头住在这条缝里(缝就是箭头的地皮)
const NODE_PAD: [number, number] = [16, 20];   // 盒的内边距 [左右, 上下] —— 流水线的盒子要站得住
const LOOP_DEPTH = 112;  // 回流走廊比盒底再低多少(竖段本身就是 stub, 不再另设)
const LOOP_RADIUS = 14;  // 回流折点磨圆半径
const NODE_RADIUS = 10;  // 节点圆角(**同一份**给盒与高亮环: 环是从盒外扩出来的, 同心靠这个数)
const RING_PAD = 5;      // 高亮环离盒边多远(正值向外)
const DASH_PERIOD = 12;  // 蚂蚁线一个 dash 周期(px)= 一次位移量 ⇒ 循环处无缝
const DASH_ON = 7;       // 周期里实的那一段(虚的那段 = DASH_PERIOD − DASH_ON)
const ANT_CYCLE = 900;   // 跑一个周期多久(ms)
const TITLE_SIZE = 18;
const SUB_SIZE = 12;

const ACCENT = toneStyle(DEFAULT_THEME, 'blue', 'solid').stroke;   // 动画层的墨: 全图唯一一处彩

const TITLE = 'CI 流水线 · 运行中';
const SUB = '同一张版图, 多一条时间轴 —— 虚线在跑、环在亮; 产物仍是静态 SVG, 零 JS';
const FOOT = [
  '动起来: ① 四条蚂蚁线顺箭头恒动 ② 四环依次点亮 ③ 末环亮完开始呼吸',
  '分工: 蚂蚁线走 href 指名 path 自己(不可继承属性, 挂组上不动), 环走时序链',
] as const;

/** 四个阶段(主标签 + 次标签)—— 盒尺寸由它反算, 字也从它画(`nodeFit` / `nodeShape` 同一份) */
const STAGES = [
  { label: '源码', sub: 'push' },
  { label: '构建', sub: 'bundle + lint' },
  { label: '测试', sub: 'unit + e2e' },
  { label: '发布', sub: 'canary 10%' },
] as const;

// --- 头部: 两行字的盒由 `measureText` 给(与画字同一把尺子), 落位由 `below` 从上往下推 -----

type TextBox = Rect & { content: string; size: number; weight: number };
const caption = (content: string, at: Pt, size: number, weight: number): TextBox => {
  const m = measureText(content, { fontSize: size, weight });
  return { ...at, w: m.width, h: m.height, content, size, weight };
};
const line = (b: TextBox, color: string) =>
  textShape({ x: b.x, y: round1(b.y + b.h / 2), content: b.content, size: b.size, weight: b.weight, baseline: 'central', color });

const title = caption(TITLE, { x: PAD, y: PAD }, TITLE_SIZE, 700);
const sub = caption(SUB, { x: PAD, y: below(title, { w: 0, h: 0 }, HEAD_GAP).y }, SUB_SIZE, 400);

// --- 流水线一行: 四盒同尺寸(逐条反算后取大), 位置交给 `packRow` -----------------

const fits = STAGES.map((s) => nodeFit({ ...s, padding: NODE_PAD }));
const BOX: Size = { w: Math.max(...fits.map((f) => f.w)), h: Math.max(...fits.map((f) => f.h)) };
const rowY = below(sub, { w: 0, h: 0 }, BLOCK_GAP).y;
// packRow 的 x0 / y 是相对原点: 整行先按 (0,0) 排好, 再整体挪到 (PAD, rowY) —— 一次平移, 不是逐个手摆
const row = packRow({ items: STAGES.map(() => BOX), gap: ROW_GAP, x0: 0, y: 0 });
const boxes: Rect[] = row.rects.map((r) => ({ ...r, x: round1(r.x + PAD), y: round1(r.y + rowY) }));
const rowBox = bounds(boxes)!;                        // 整行的外廓 —— 回流走廊从它往下推
const rings = boxes.map((r) => insetRect(r, -RING_PAD));   // 高亮环的外廓: 它是版图里最高的墨

// --- 边: 三条主线(面对面 = 一条直线)+ 一条回流(下绕, 折点磨圆)------------------

/** 一条边: 端点列 + 磨圆半径。`d` 取**无端点裁切**的整杆(`end: 'none'` —— 缺省会按箭头深度内缩
 *  ~7px, 那是给箭头让位的; 蚂蚁线没有箭头, 要一路爬到盒边, 不留缺口) */
const edgeOf = (id: string, points: Pt[], radius?: number) =>
  ({ id, points, radius, d: edgeGeometry({ points, radius, end: 'none' }).d });
const mains = boxes.slice(0, -1).map((a, i) => edgeOf(`e${i + 1}`, [rectFace(a, 'right'), rectFace(boxes[i + 1], 'left')]));

// 回流: 从末盒底绕到第二盒底。**端点贴盒边**(rectFace 不加 offset —— 从盒面到走廊的竖段本身就是
// stub, 再 offset 线就悬空了); 走廊 y 由 `below` 从整行底下推
const last = boxes[boxes.length - 1];
const build = boxes[1];
const downFrom = rectFace(last, 'bottom');
const downTo = rectFace(build, 'bottom');
const loopY = below(rowBox, { w: 0, h: 0 }, LOOP_DEPTH).y;
const loopPts: Pt[] = [downFrom, { x: downFrom.x, y: loopY }, { x: downTo.x, y: loopY }, downTo];
const loop = edgeOf('e-loop', loopPts, LOOP_RADIUS);

// 回流的标签: 盒从 `labelBoxSize` 来(遮罩片只求盖住墨迹), 位置骑在走廊那一段的**中点**上
const loopSize = labelBoxSize('失败回滚');
const loopRect = placeRect({ w: loopSize.width, h: loopSize.height }, mid(loopPts[1], loopPts[2]));

// --- 页脚: 从内容底再往下推两行 ---------------------------------------------

const footStart = below(bounds([rowBox, loopRect])!, { w: 0, h: 0 }, FOOT_GAP).y;
const foot: TextBox[] = [];
for (const content of FOOT) {
  const prev = foot[foot.length - 1];
  foot.push(caption(content, { x: PAD, y: prev ? below(prev, { w: 0, h: 0 }, HEAD_GAP).y : footStart }, SUB_SIZE, 400));
}

// --- 动画层 ---------------------------------------------------------------
//
// ① 蚂蚁线: 一段虚线 overlay 钉在**边自己的 d** 上(不是第二条几何), 靠 href 指名道姓动它的
//    `stroke-dashoffset`。位移量恰好一个 dash 周期 ⇒ 循环处无缝; 0→负 = 顺 path 方向(顺着箭头)爬
const ants = (e: { id: string; d: string }): Descriptor => {
  const dashId = `ant-${e.id}`;
  return group([
    path(e.d, {
      id: dashId, fill: 'none', stroke: ACCENT, 'stroke-width': 2.2, 'stroke-linecap': 'round',
      'stroke-dasharray': `${DASH_ON} ${DASH_PERIOD - DASH_ON}`,
    }),
    animate({
      attributeName: 'stroke-dashoffset',
      values: `0;-${DASH_PERIOD}`,                                    // 负号 = 顺着箭头跑
      dur: `${ANT_CYCLE}ms`, repeatCount: 'indefinite',
      attrs: { href: `#${dashId}` },                                  // ⚠ 逃生舱: 目标 = 那条 path 自己
    }),
  ]);
};

// ② 高亮环: 从盒外扩一圈(同心靠 `NODE_RADIUS` 同一个数), 常态透明、走到时间点才亮。
//    末环多一条时间轴: 亮完接住自己那个 `.end` 开始呼吸 —— 两条轨在**不相交的时刻**上接力
//
// ⚠ **时序链的 id 不许带连字符**(260926 在 Chrome 实测钉下的一条, 与 `descriptor.ts` 那条"目标 =
//    父元素"同族): `begin="lit-1.end"` 这种引用**静默不触发** —— 整条链一动不动, 而产物里每个字节
//    都合法、也不报错; 换成 `lit1.end` 立刻就对。**四条链一次全亮**, 唯一变量就是那个连字符
//    (hyphen ✗ / 下划线 ✓ / 纯字母数字 ✓)。所以本图的环 id 走 `lit1`…`: 名字里的分隔符是版面措辞,
//    而它在这里是**语义** —— kernel 的 scene id 习惯 kebab-case, 拿它们当同步基时踩的就是这一脚。
const ring = (r: Rect, i: number): Descriptor => {
  const out = insetRect(r, -RING_PAD);
  const litId = `lit${i + 1}`;
  return group([
    rect(out.x, out.y, out.w, out.h, NODE_RADIUS + RING_PAD, { fill: 'none', stroke: ACCENT, 'stroke-width': 2 }),
    animate({
      attributeName: 'opacity', from: '0', to: '1', dur: '340ms',
      begin: i === 0 ? '0.4s' : `lit${i}.end`,                        // ← 时序链: 接前一个的结尾
      easing: 'ease-out-cubic',
      attrs: { id: litId, fill: 'freeze' },                           // 停在末态(亮着)
    }),
    ...(i === STAGES.length - 1
      ? [animate({ attributeName: 'opacity', values: '1;0.45;1', dur: '2200ms', begin: `${litId}.end`, repeatCount: 'indefinite' })]
      : []),
  ], { opacity: '0' });
};

// --- 画布: 墨迹并集 + 四边同值留白 ------------------------------------------
//
// 并集收的是**真墨迹**: 五行文字 / 四个盒 / 四个外扩的环 / 回流走廊 / 回流标签。留白是同一个数
// 的四倍。比例算术(实测于 stderr): 墨迹 634×388.3 ⇒ 画布 709×468.3 ≈ **1.5** —— 落在画廊 3:2 画框的
// 1.3~1.7 带里, 且**不靠垫白凑**: 宽由四个阶段的内容反算(盒 120 由 `nodeFit` 取大 + ROW_GAP 48 ×3),
// 高由四层竖缝加出来(头两行 / 52 缝 / 盒 74 / 走廊 112 / 页脚 36)。要挪比例就调那几个具名常量, 别改 PAD。
const INK = bounds([title, sub, rowBox, loopRect, ...rings, ...foot])!;
const W = round1(INK.x + INK.w + PAD);
const H = round1(INK.y + INK.h + PAD);

const content: Descriptor[] = [
  canvasLayer(DEFAULT_THEME, W, H),
  line(title, DEFAULT_THEME.tones.slate.text),
  line(sub, DEFAULT_THEME.label),
  // 静态版式: 边(实线 + 箭头)→ 节点。**回流也是实线底子** —— 虚线底 + 蚂蚁线 overlay 是两条
  // 错开的虚线互相打架(实测观感), "往回走"由方向、标签与箭头说, 不靠底子换花样
  ...mains.map((e) => edgeShape({ points: e.points, end: 'arrow-triangle' })),
  edgeShape({ points: loop.points, radius: LOOP_RADIUS, end: 'arrow-triangle' }),
  ...boxes.map((r, i) => nodeShape({ ...r, ...STAGES[i], radius: NODE_RADIUS })),
  // 动画层: 蚂蚁线 + 高亮环(整层排在静态版式之上 —— 两层墨谁都盖不着谁)
  ...mains.map((e) => ants(e)),
  ants(loop),
  ...boxes.map(ring),
  // 标签与页脚**压在动画层之上**: 遮罩片的本职就是切断穿过的线 —— 蚂蚁线也不许糊住字
  labelBoxShape({ x: loopRect.x + loopRect.w / 2, y: loopRect.y + loopRect.h / 2, w: loopRect.w, h: loopRect.h, content: '失败回滚' }),
  ...foot.map((b) => line(b, DEFAULT_THEME.label)),
];

/** 出口: 顶层只持**纯数据**(测试 / 读数板 / 网站 import 它都不会吐图), 序列化留在 `import.meta.main` */
export const doc: DSvg = svg(W, H, content, { 'font-family': 'ui-sans-serif, system-ui, "PingFang SC", sans-serif' });

if (import.meta.main) {
  // 自检走 stderr(图走 stdout): 版式读数 + 比例 —— 交付尺寸与画廊画框都对得上才算这张图站得住
  console.error(`盒 ${BOX.w}×${BOX.h}(nodeFit 取大) · 行宽 ${rowBox.w} · 走廊 y ${loopY}`);
  console.error(`墨迹 ${INK.w}×${INK.h} → 画布 ${W}×${H} · 比例 ${round1(W / H)}(画廊带 1.3~1.7)`);
  console.error(`时间轴: ${mains.length + 1} 条蚂蚁线(周期 ${DASH_PERIOD}px / ${ANT_CYCLE}ms) · ${boxes.length} 个环(时序链 lit1 → lit4)`);
  process.stdout.write(toSVG(doc));
}
