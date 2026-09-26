// =====================================================================
// full-chain · 完整纯函数链: scene → route → audit → export
//   bun run examples/start/full-chain.ts > /tmp/chain.svg
//   bun run examples/start/full-chain.ts --golden    (只打印摘要 + sha256, 供字节对账)
//
// 这条链就是设计稿 §三 说的"core 纯函数链独扛字节 golden"的载体: 不需要浏览器、不需要 React,
// 固定输入 → 固定字节。blink 路径不进这里(它带来的字体/viewport 漂移会让 golden 必死)。
// 出口走 `scripts/runner.ts`(260920): 摘要 / 诊断 / 草稿 / exit code 都不再由本文件各守一遍。
// =====================================================================

import { type Scene } from '../../src/knives/audit';
import { routeOrthogonal } from '../../src/knives/route';
import { edgeLabel } from '../../src/shapes/edge';
import { packCol, packRow } from '../../src/geometry/pack';
import { runScene } from '../../scripts/runner';
import { isMainModule } from '../../src/runtime';

const W = 640;
const H = 400;

// 五格同尺寸(这张图讲的是链路, 盒尺寸是手定的: 150 × 46)
const BOX = { w: 150, h: 46 };
// 一条链(竖排, 节距 100)+ 两个出口(横排) —— 摆位走 pack, 与折点走 route 是同一条纪律
const chain = packCol({ items: [BOX, BOX, BOX], pitch: 100, x: 250, y0: 40, align: 'start' });
const sinks = packRow({ items: [BOX, BOX], gap: 170, y: 330, x0: 90, align: 'start' });
const [html, blink, audit] = chain.rects;
const [readme, board] = sinks.rects;
const boxes = { html, blink, audit, readme, board };

// 折点列全部由 route 生成 —— 手写坐标在这条链里一次都不出现
const e1 = routeOrthogonal({ from: boxes.html, fromPort: { side: 'bottom' }, to: boxes.blink, toPort: { side: 'top' } });
const e2 = routeOrthogonal({ from: boxes.blink, fromPort: { side: 'bottom' }, to: boxes.audit, toPort: { side: 'top' } });
// e3/e4 从 audit 底边**不同位置**出、各给一条腰线(260918 第四轮门禁抓到: 两条都走底边中心 + 同一条 310 腰线
// → port_crowding 与 edge_overlap 同时报"从同一点出发 + 24px 画在同一条线上")
const e3 = routeOrthogonal({ from: boxes.audit, fromPort: { side: 'bottom', t: 0.3 }, to: boxes.readme, toPort: { side: 'top' }, lane: 300 });
const e4 = routeOrthogonal({ from: boxes.audit, fromPort: { side: 'bottom', t: 0.7 }, to: boxes.board, toPort: { side: 'top' }, lane: 310 });
// 回环: 从 audit 左侧绕回 html 左侧。
// **不传 lane**: 平行 stub 的缺省就是最小可行位置(72 = html.left 外一个 stub),
// 传 170 会从 html 盒(x 90–240)里插过去 —— 260917 新门禁正是在这里抓到一例真穿透。
const loop = routeOrthogonal({ from: boxes.audit, fromPort: { side: 'left' }, to: boxes.html, toPort: { side: 'left' } });

const edgeList: Scene['edges'] = [
  { id: 'e1', from: 'html', to: 'blink', points: e1.points },
  { id: 'e2', from: 'blink', to: 'audit', points: e2.points },
  { id: 'e3', from: 'audit', to: 'readme', points: e3.points },
  { id: 'e4', from: 'audit', to: 'board', points: e4.points },
  { id: 'loop', from: 'audit', to: 'html', points: loop.points },
];

export const scene: Scene = {
  width: W,
  height: H,
  nodes: [
    { id: 'html', rect: boxes.html, label: 'HTML 骨架', radius: 10 },
    { id: 'blink', rect: boxes.blink, label: 'blink 量框', radius: 10 },
    { id: 'audit', rect: boxes.audit, label: 'audit 门禁', radius: 10 },
    { id: 'readme', rect: boxes.readme, label: 'README 冻结图', radius: 10 },
    { id: 'board', rect: boxes.board, label: 'HTML 看板', radius: 10 },
  ],
  edges: edgeList,
  // 边标签走 `edgeLabel`: 位置/尺寸在构建期算好写回 scene, 出口与 audit 读同一份
  labels: [
    edgeLabel(edgeList[0], 'route'),
    edgeLabel(edgeList[1], 'audit'),
    edgeLabel(edgeList[4], 'loop'),
  ],
};

// lane 越界时 route 会投影到可行域并置 laneProjected —— 调用方应该看见它, 别当没发生
const projected = [e1, e2, e3, e4, loop].filter((r) => r.laneProjected).length;

// 出口走 `scripts/runner.ts`(260920): 摘要 / 诊断 / 草稿 / exit code 全在那一处(见该文件头注)。
// 本文件只给"这条链该怎么画", 出口纪律不再由每个示例各守一遍。
if (isMainModule(import.meta.url)) {
  runScene(scene, {
    level: 'showcase',
    title: '几何内核工具环',
    extra: [`lane 被投影: ${projected} 条`],
    golden: process.argv.includes('--golden'),   // 字节对账档: 只吐摘要 + sha256, 不吐图
  });
}
