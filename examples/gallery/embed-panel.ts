// =====================================================================
// embed-panel · 外部素材(echarts 图表)当底板的结构图(260920)
//   bun run examples/gallery/embed-panel.ts > /tmp/embed-panel.svg
//
// 这张图回答"整幅外部 SVG 能不能当素材用": 面板框里那块**图表**是从
// `assets/embeds/echarts-line.svg` 读进来的(echarts SSR 出图, 来源与许可见
// `assets/embeds/LICENSE-APACHE-2`),
// 走 `embedAsset` → `scene.embeds` → 出口渲成**嵌套 `<svg>`** —— core 侧不依赖 echarts,
// 进仓的素材是"收拾干净的内部标记"(id 已加前缀, `<style>` 已丢, 见 `embed/svg-asset`)。
//
// 版式决策(全是作者定的, core 不猜):
//   · 面板框是**声明框**(`frame: 'declared'`): 它由"这里放一块指标面板"定, 不是成员并集的派生量
//   · 图表尺寸按素材 viewBox 的宽高比给(456×282 ≈ 420×260) —— 差一点点会被
//     `preserveAspectRatio="xMidYMid meet"` 居中补掉, 但等比给才是作者该做的事
//   · 素材的 z 序在底(**出口定死的**, 见 `export.ts` 的 `sceneChildren`): 边与芯片压在图表上面
//   · 一行芯片的盒宽取 `nodeFit` 的内容下限与版式值的较大者(手定宽度会被 `label_fit` 抓)
//
// ⚠ 本图会报一条 `cluster_corridor`(**warning**, 不拦出口) —— 那是**已知缺口**不是摆错:
// 面板里最大的一块占位是**素材**, 而素材不进任何门禁(cluster / density 都看不见它), 于是
// "框比成员大"被算成空走廊。同族的缺口(边 / 标签压在图表上现在也无人管)登记在 `ROADMAP.md`。
// =====================================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type Scene } from '../../src/knives/audit';
import { embedAsset } from '../../src/embed/svg-asset';
import { nodeFit, textFit } from '../../src/knives/fit';
import { rectFace } from '../../src/geometry/box';
import { below } from '../../src/geometry/place';
import { routeOrthogonal } from '../../src/knives/route';
import { edgeLabel } from '../../src/shapes/edge';
import { contentBounds } from '../../src/export';
import { type Rect } from '../../src/geometry/vec';
import { runScene } from '../../scripts/runner';

export const LEVEL = 'showcase';
/** 素材路径走 `fileURLToPath`(不能用 `.pathname`): 本仓绝对路径含空格, 会被 percent-encode */
const ASSET_SVG = fileURLToPath(new URL('../../assets/embeds/echarts-line.svg', import.meta.url));

/** 面板框(声明框): 作者定的版式, 与成员并集无关 */
const PANEL: Rect = { x: 360, y: 64, w: 520, h: 480 };
/** 图表占的那块(456/282 ≈ 素材 viewBox 420/260) */
const CHART: Rect = { x: 392, y: 112, w: 456, h: 282 };
/** 一行芯片的顶边与高度(版式节奏是作者给的, 盒宽走 nodeFit 反算) */
const ROW_Y = 430;
const ROW_H = 48;

/** 素材在构建期解析好 —— 渲染路径上不读盘, 也不依赖 echarts */
export const asset = embedAsset(readFileSync(ASSET_SVG, 'utf8'), { name: 'chart' });

function box(id: string, label: string, x: number, w: number, extra: Partial<Scene['nodes'][number]> = {}): Scene['nodes'][number] {
  const fit = nodeFit({ label, level: LEVEL });
  return { id, rect: { x, y: ROW_Y, w: Math.max(w, fit.w), h: ROW_H }, label, ...extra };
}

const collect = box('collect', '采集 agent', 40, 200);
const p95 = box('p95', 'p95 12ms', CHART.x, 216, { tone: 'blue', variant: 'tint' });
// 右缘贴面板右缘内 32(`rectFace` 的 offset 负 = 朝内法线, 不用自己写 `PANEL.x + PANEL.w`);
// 减掉的 216 是它**自己的盒宽** —— 端口给的是右缘, 盒的 x 是左缘, 这一步换算省不掉
const err = box('err', '错误率 0.4%', rectFace(PANEL, 'right', { offset: -32 }).x - 216, 216, { tone: 'blue', variant: 'tint' });
const alert = box('alert', '越线告警', 1000, 168, { tone: 'rose' });
const nodes = [collect, p95, err, alert];

const labels: NonNullable<Scene['labels']> = [];

/** 一条直线边 + 落在线上的标签(两端同 y 且端口取面中点 ⇒ 折点数为 2, 不折) */
function link(id: string, from: Scene['nodes'][number], to: Scene['nodes'][number], text: string): Scene['edges'][number] {
  const r = routeOrthogonal({ from: from.rect, fromPort: { side: 'right' }, to: to.rect, toPort: { side: 'left' } });
  labels.push(edgeLabel({ id, points: r.points }, text));
  return { id, from: from.id, to: to.id, points: r.points };
}

const edges = [
  link('e.collect', collect, p95, '每 5s'),
  link('e.alert', err, alert, '越线告警'),
];

/** 图注: 位置由**内容包围盒**推, 不手估画布中心(同 ontology-icons 那条惯用法) */
const CAPTION = [
  '图表来自 echarts SSR 出的整幅 SVG, 经 embedAsset 收拾后原样嵌进宿主(嵌套 <svg>)。',
  '素材不进任何净空门禁 —— 边与标签压在它上面是作者留位, 不是门禁放行。',
];
const CAP_SIZE = 12;
// 尺寸只由 textFit 给(与渲染逐字同源: 最宽行 + 行块并集高)
const capFit = textFit({ content: CAPTION.join('\n'), fontSize: CAP_SIZE });
// 落位: 贴在**内容包围盒底边中点**往下 40px —— `below` 的 align 缺省 `center` 就是"骑底边中点",
// 于是重心不用手算(内容非空, `contentBounds` 不会给 null)。包围盒含声明框与素材(它们占着版面)
const before = contentBounds({
  width: 0, height: 0, nodes, edges, labels,
  groups: [{ id: 'panel', rect: PANEL, frame: 'declared' }],
  embeds: [{ id: 'chart', rect: CHART, asset }],
})!;
const captionRect = below(before, capFit, 40);

/** 具名导出: 顶层是纯几何(判据在 `test/embed-scene.test.ts`), 出口全在 `import.meta.main` */
export const scene: Scene = {
  width: 0, // 交给 `fit` 按内容重定(先 fit 再审 —— 审计吃的是平移后的那份)
  height: 0,
  nodes,
  edges,
  labels,
  groups: [{
    id: 'panel', rect: PANEL, label: '指标面板', frame: 'declared', tone: 'slate',
    contains: [p95.id, err.id], // 声明的成员是面板里的芯片(图表不是节点, 声明不了 —— 见文件头那条缺口)
  }],
  embeds: [{ id: 'chart', rect: CHART, asset }],
  texts: [{
    id: 'caption',
    rect: captionRect,
    text: CAPTION.join('\n'),
    fontSize: CAP_SIZE,
    anchor: 'middle',
  }],
};

// 出口走 `scripts/runner`(260920): 摘要 / 诊断 / 草稿 / exit code 都在那一处(见该文件头注)
if (import.meta.main) {
  runScene(scene, {
    level: LEVEL,
    fit: { padding: 48 },
    title: '指标面板 · echarts 素材当底板',
    extra: [
      `素材: ${asset.name} viewBox ${asset.viewBox.w}×${asset.viewBox.h} → 宿主矩形 ${CHART.w}×${CHART.h}`,
      `构建期丢掉: ${asset.dropped.join(' / ') || '(无)'}`,
      `节点 ${nodes.length} · 边 ${edges.length} · 素材 1`,
    ],
  });
}
