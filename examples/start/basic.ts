// =====================================================================
// basic · core 冒烟示例: 零浏览器、零 React, bun 直出 SVG
//   bun run examples/start/basic.ts > /tmp/basic.svg
// 这一档就是设计稿 §6.3 说的"第一类公民路径": 单独 shape + 尺寸就能出图。
// ⚠ 它是**描述符层**示例: 直接拼 `svg()` 出图, 不经 scene、不过门禁 —— 要看走门禁的主路径读
// `start/full-chain.ts` / `gallery/node-forms.ts`。
//
// 坐标来源(260925 重写): 盒尺寸走 `nodeFit` · 三盒 y 链走 `packCol` · 边端点与回环走 `rectFace` ·
// 缝间标签走 `mid` · 标签尺寸走 `labelBoxSize` · 组框走 `bounds(成员, { pad })`。
// 重写前这些是散在 55 行里的 48 个坐标字面量: 边的端点 y(122/160/212)是盒底 / 盒顶的心算结果,
// 回环的两个 y(296/96)是两条 `centerY` 关系写成裸数, 组框更是手算的**漂移**值 ——
// 框底压在"写决策"上、三号盒整个挂在框外(旧快照里肉眼可见)。圆角解算 / 端点几何 / 遮罩片
// 仍然全是 core 算的; 变的是"坐标从哪来"。
// 手写数字只剩下面那几个**具名作者决策常量** —— 版式是作者的, 几何是 core 的。
// =====================================================================

import { svg } from '../../src/descriptor';
import { toSVG } from '../../src/serialize';
import { edgeShape, labelBoxSize } from '../../src/shapes/edge';
import { groupShape } from '../../src/shapes/group';
import { nodeShape } from '../../src/shapes/node';
import { labelBoxShape } from '../../src/shapes/text';
import {
  GROUP_FIT_PAD, bounds, edgeGeometry, mid, nodeFit, nodeGeometry, packCol, placeRect, rectFace,
} from '../../src/index';
import type { Descriptor } from '../../src/descriptor';

// --- 作者决策: 只有这一段的数是手写的, 每个都说清为什么 ----------------------

const W = 620, H = 460;        // 画布: 沿用重写前的版心 —— 教学图的画布是作者给的, 不随内容浮动
const COL_X = W / 2;           // 盒列中线 = 画布中线: 三盒同轴且整列骑中线, 左右留白才对称
const TOP_Y = 70;              // 首盒顶边: 上方要留出组框标题那一带(框顶到首盒顶就是框的 pad)
const SEAM_GAPS = [38, 58];    // 缝的节奏: 主干两跳各 38、到门禁那一跳放 58 —— 与重写前同节奏
const CORRIDOR_X = 90;         // 回环走廊的 x: 盒列左侧那条竖走廊(版式不是推导 —— 回环要读得出是"绕外面走")
const LOOP_RADIUS = 14;        // 回环折点磨圆半径: 自检读的就是它, 两处必须同值
const GROUP_TITLE = 'core · 零运行时依赖';

// --- 盒: 尺寸由内容反算, 位置由 pack 摆 --------------------------------------

/** 三条节点的内容 —— 盒尺寸从它反算, 字也从它画(`nodeShape` 与 `nodeFit` 同一份) */
const NODES = [
  { label: 'HTML 骨架', sub: '决策唯一源' },
  { label: 'blink 量框', sub: 'bounds 写回 scene' },
  { label: 'audit 门禁', sub: '4 项几何检查' },
] as const;

// 三盒同尺寸 = 三条反算结果取大(盒是内容驱动的下限, 取大保证三条都装得下且盒子齐整)
const fits = NODES.map((n) => nodeFit(n));
const BOX = { w: Math.max(...fits.map((f) => f.w)), h: Math.max(...fits.map((f) => f.h)) };
const col = packCol({ items: [BOX, BOX, BOX], gap: SEAM_GAPS, x: COL_X, y0: TOP_Y, align: 'center' });
const boxes = col.rects;
const [html, blink, audit] = boxes;

// --- 缝间标签与组框: 位置走 mid, 范围走 bounds -------------------------------

// 标签骑在**两盒端口的中点**上(旧版是心算出来的 241); 尺寸走 `labelBoxSize` —— 遮罩片只求盖住
// 墨迹, 所以按墨迹口径给, 不是 `textFit` 的行盒口径
const seamCenter = mid(rectFace(blink, 'bottom'), rectFace(audit, 'top'));
const seamSize = labelBoxSize('写决策');
const seamRect = placeRect({ w: seamSize.width, h: seamSize.height }, seamCenter);

// 组框 = 成员并集 + pad: 成员是三盒 + 缝间标签(它在列内, 并不撑开并集 —— 写进成员是为了让
// "框跟着成员走"这句话在代码里也成立)。pad 走仓内 `GROUP_FIT_PAD`(呼吸位 + 4 余量, 与派生框
// 门禁同源): 框顶那一段留白要容得下组标题(inner 位移 + 一行墨高), 框宽则被标题顶着 ——
// 标题比三盒的并集还宽, 所以横向余量按它给是够的, 再小就顶框了。
// 回环标签**不是**成员 —— 它是回环那条边的旁注, 留在走廊那侧; 进并集会把框拉到整条回环上。
const frame = bounds([...boxes, seamRect], { pad: GROUP_FIT_PAD })!;

// 回环: 两端落在两盒的**左面中点**, 中间借走廊竖着串起来(只有走廊 x 是作者给的)
const loopFrom = rectFace(audit, 'left');
const loopTo = rectFace(html, 'left');
const loopPts = [loopFrom, { x: CORRIDOR_X, y: loopFrom.y }, { x: CORRIDOR_X, y: loopTo.y }, loopTo];
const loopCenter = mid({ x: CORRIDOR_X, y: loopFrom.y }, { x: CORRIDOR_X, y: loopTo.y });
const loopSize = labelBoxSize('不过就回环');

const content: Descriptor[] = [
  groupShape({ ...frame, label: GROUP_TITLE, radius: 16 }),

  ...boxes.map((r, i) => nodeShape({ ...r, ...NODES[i] })),

  // 主干: 竖直下行的正交折线, 圆角 + 三角形端点 —— 端点取自两盒的面中点, 一个坐标不手写
  edgeShape({ points: [rectFace(html, 'bottom'), rectFace(blink, 'top')], end: 'arrow-triangle' }),
  edgeShape({ points: [rectFace(blink, 'bottom'), rectFace(audit, 'top')] }),
  // 边标签: **不是 edgeShape 的参数**(那会造成第二条上屏路径) —— 走 labelBoxShape(或 edgeLabel),
  // 位置与尺寸进 scene.labels, 渲染与审计读同一份(设计稿 §3 ③)。
  labelBoxShape({ x: seamCenter.x, y: seamCenter.y, w: seamSize.width, h: seamSize.height, content: '写决策' }),

  // 回环: 左绕上行, 虚线 + 折点磨圆(看半径是否被邻段钳制)
  edgeShape({
    points: loopPts,
    radius: LOOP_RADIUS, dash: '6 5', start: 'dot-solid', end: 'arrow-triangle',
  }),
  labelBoxShape({ x: loopCenter.x, y: loopCenter.y, w: loopSize.width, h: loopSize.height, content: '不过就回环' }),
];

// 解算结果自检: 半径被钳制的角必须为 0(本例盒子够大)
const g = nodeGeometry({ ...html, radius: 10 });
if (g.clamped.length) console.error('警告: 被钳制的角', g.clamped, 'minActualRadius=', g.minActualRadius);

const loop = edgeGeometry({ points: loopPts, radius: LOOP_RADIUS });
console.error(`回环: 原长 ${loop.length.toFixed(1)} → 折点 ${loop.points.length}, 磨圆半径 ${loop.tangents.map((t) => t.actualRadius.toFixed(1)).join('/')}`);

if (import.meta.main) {
  process.stdout.write(toSVG(svg(W, H, content, { 'font-family': 'ui-sans-serif, system-ui, "PingFang SC", sans-serif' })));
}
