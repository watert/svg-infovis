// =====================================================================
// basic · core 冒烟示例: 零浏览器、零 React, bun 直出 SVG
//   bun run examples/start/basic.ts > /tmp/basic.svg
// 这一档就是设计稿 §6.3 说的"第一类公民路径": 单独 shape + 尺寸就能出图。
// ⚠ 它是**描述符层**示例: 直接拼 `svg()` 出图, 不经 scene、不过门禁 —— 要看走门禁的主路径读
// `start/full-chain.ts` / `gallery/node-forms.ts`。
// 坐标手给正是这一档的性质; 圆角解算 / 端点几何 / 遮罩片仍然全是 core 算的。
// =====================================================================

import { svg } from '../../src/descriptor';
import { toSVG } from '../../src/serialize';
import { edgeShape } from '../../src/shapes/edge';
import { groupShape } from '../../src/shapes/group';
import { nodeShape } from '../../src/shapes/node';
import { labelBoxShape } from '../../src/shapes/text';
import { edgeGeometry, nodeGeometry } from '../../src/index';
import type { Descriptor } from '../../src/descriptor';

const W = 620;
const H = 460;

const box = { x: 210, y: 70, w: 200, h: 52 };

const content: Descriptor[] = [
  groupShape({ x: 170, y: 30, w: 280, h: 210, label: 'core · 零运行时依赖', radius: 16 }),

  nodeShape({ ...box, label: 'HTML 骨架', sub: '决策唯一源' }),
  nodeShape({ x: 210, y: 160, w: 200, h: 52, label: 'blink 量框', sub: 'bounds 写回 scene' }),
  nodeShape({ x: 210, y: 270, w: 200, h: 52, label: 'audit 门禁', sub: '4 项几何检查' }),

  // 主干: 竖直下行的正交折线, 圆角 + 三角形端点
  edgeShape({ points: [{ x: 310, y: 122 }, { x: 310, y: 160 }], end: 'arrow-triangle' }),
  edgeShape({ points: [{ x: 310, y: 212 }, { x: 310, y: 270 }] }),
  // 边标签: **不是 edgeShape 的参数**(那会造成第二条上屏路径) —— 走 labelBoxShape(或 edgeLabel),
  // 位置与尺寸进 scene.labels, 渲染与审计读同一份(设计稿 §3 ③)。
  labelBoxShape({ x: 310, y: 241, w: 56, h: 19, content: '写决策' }),

  // 回环: 左绕上行, 虚线 + 折点磨圆(看半径是否被邻段钳制)
  edgeShape({
    points: [{ x: 210, y: 296 }, { x: 90, y: 296 }, { x: 90, y: 96 }, { x: 210, y: 96 }],
    radius: 14, dash: '6 5', start: 'dot-solid', end: 'arrow-triangle',
  }),
  labelBoxShape({ x: 90, y: 196, w: 80, h: 19, content: '不过就回环' }),
];

// 解算结果自检: 半径被钳制的角必须为 0(本例盒子够大)
const g = nodeGeometry({ ...box, radius: 10 });
if (g.clamped.length) console.error('警告: 被钳制的角', g.clamped, 'minActualRadius=', g.minActualRadius);

const loop = edgeGeometry({ points: [{ x: 210, y: 296 }, { x: 90, y: 296 }, { x: 90, y: 96 }, { x: 210, y: 96 }], radius: 14 });
console.error(`回环: 原长 ${loop.length.toFixed(1)} → 折点 ${loop.points.length}, 磨圆半径 ${loop.tangents.map((t) => t.actualRadius.toFixed(1)).join('/')}`);

if (import.meta.main) {
  process.stdout.write(toSVG(svg(W, H, content, { 'font-family': 'ui-sans-serif, system-ui, "PingFang SC", sans-serif' })));
}
