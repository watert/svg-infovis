// =====================================================================
// ontology-icons · 图标 + 说明卡片的本体图(260920, 复刻航空业本体那张参照图)
//   bun run examples/gallery/ontology-icons.ts > /tmp/ontology-icons.svg
//
// 这张图是**能力举证**: "图标当节点的视觉替身 + 逐行说明卡片 + 成对双线 + 沿线旋转的标签"
// 这一整套 —— 即参照图那类 ontology / 关系图 —— 用 core 现有件能不能画出来。答案是能, 且
// `exportScene` 按 showcase 档全部门禁零诊断(fail-closed: 出图成功本身就是凭证)。
//
// 每个实体 = **图标(上) + 说明卡片(下)** 一个块, 块的尺寸与位置全部反算, 没有一处手定:
//   · `cardFit({ lines, iconSize, iconGap })` → 卡片盒 / 图标矩形 / 整块尺寸
//   · `placeCard(fit, { x, y })`               → 按**整块的中心**摆(带不带图标的心都在块上)
//   · 卡片文字进 `node.label`(`\n` 逐行, `**粗**` 行内加粗), `align: 'start'` 左对齐
//   · 左内边距由出口按档位填(`showcase` = 10), 于是它与门禁 `label_fit` 读的是同一个数
//
// 两条与参照图的**有意偏差**(都是 core 的既定纪律, 不是做不到):
//   ① 参照图里 "Hub For" / "Owned By" 是 45° 斜线 —— core 的 `orthogonal_edges` 门禁要求
//      折线全程正交, 所以这两条走 L 形。放开斜线是**独立决定**(要不要给边加"自由角度"档) ——
//      本图按现行纪律出; 真要开就得按纪律 9 / 11 在 `ROADMAP.md` 立项, 那里现在**没有**这一项。
//   ② 卡片文案的换行位置由本文件写死 —— 换行是作者的决定, core 不替你折行(口径见 fit.ts)。
//
// 布局用到的两条"这类图特有"的手法(都记进了 refs/recipes.md 配方 11):
//   ① **边路由对着 `iconInkRect`(块的外廓)而不是卡片盒** —— 卡片上方那截图标也在块的范围内,
//      拿卡片盒当端口会让线从图标身上穿过去
//   ② **成对双线走 `routePair`**(单线跑一次 + 沿法线平移两条), 标签走 `pairLabels`(每线一个,
//      落在自己那条线的外侧, 沿线旋转)
// =====================================================================

import { type Scene } from '../../src/knives/audit';
import { cardFit, placeCard, textFit } from '../../src/knives/fit';
import { routeOrthogonal } from '../../src/knives/route';
import { pairLabels, routePair } from '../../src/knives/route-pair';
import { iconAsset } from '../../src/icons/lucide';
import { iconInkRect } from '../../src/shapes/icon';
import { contentBounds } from '../../src/export';
import { below } from '../../src/geometry/place';
import { edgeLabel, labelAngle } from '../../src/shapes/edge';
import { THEMES } from '../../src/theme';
import { round1 } from '../../src/geometry/vec';
import { runScene } from '../../scripts/runner';
import { isMainModule } from '../../src/runtime';

const LEVEL = 'showcase';
const FONT_SIZE = 12;
const ICON_SIZE = 110;
const ICON_GAP = 14;
const ICON_STROKE = 1.1; // 素材单位(lucide 是 2): 110px 的图标下折算成 ~5px 描边, 与参照图的细线观感一致
const CARD_PAD: [number, number] = [14, 12];
const CARD_RADIUS = 10;
// 图标墨色取主题里的深档(slate.solidBorder = #334155), 边线仍走 theme.edge —— 参照图里图标比线深
const ICON_INK = THEMES.light.tones.slate.solidBorder;
const CARD_FILL = THEMES.light.tones.slate.tint;

/** 一个实体: 图标素材名 + 卡片逐行文案 */
const ENTITIES = [
  { id: 'airport', cx: 470, cy: 160, icon: 'radio-tower', lines: [
    'Object Type: **Airport**',
    'Object: JFK',
    'Properties: Opening Date,',
    'Operating Capacity, Lat./Long.',
  ] },
  { id: 'delay', cx: 120, cy: 620, icon: 'timer-reset', lines: [
    'Object Type: **Delay**',
    'Object: 38 Minute Delay',
    'Properties: Duration,',
    'Arrival/Departure, Cause',
  ] },
  { id: 'flight', cx: 470, cy: 620, icon: 'plane-takeoff', lines: [
    'Object Type: **Flight**',
    'Object: JFK -> SFO',
    '24-02-2020 15:22',
    'Properties: Departure, Arrival,',
    'Passenger Count',
  ] },
  { id: 'airline', cx: 830, cy: 620, icon: 'badge-check', lines: [
    'Object Type: **Airline**',
    'Object: Skybourne Airlines',
    'Properties: Headquarters,',
    'Founding Date, Alliance',
  ] },
  { id: 'aircraft', cx: 470, cy: 990, icon: 'plane', lines: [
    'Object Type: **Aircraft**',
    'Object: Boeing 747-001 1234',
    'Properties: Entry into Service,',
    'Passenger Capacity, Range',
  ] },
] as const;

// --- 逐实体反算 + 摆放(全在构建期, scene 里存的是算好的几何) ---------------
const nodes: Scene['nodes'] = [];
/** 每个实体**整块的外廓**(图标 ∪ 卡片) —— 边路由对着它, 不拿卡片盒(见文件头手法 ①) */
const ink = {} as Record<string, { x: number; y: number; w: number; h: number }>;

for (const e of ENTITIES) {
  const fit = cardFit({ lines: e.lines, fontSize: FONT_SIZE, level: LEVEL, padding: CARD_PAD, iconSize: ICON_SIZE, iconGap: ICON_GAP });
  const { card } = placeCard(fit, { x: e.cx, y: e.cy });
  nodes.push({
    id: e.id,
    rect: card,
    label: e.lines.join('\n'), // `\n` = 作者写下的换行; `**粗**` = 行内加粗(与度量同源)
    fontSize: FONT_SIZE,
    radius: CARD_RADIUS,
    align: 'start',
    weight: fit.weight, // 400 = 正文档 —— 必须与 cardFit 算盒时那个数同源
    icon: { asset: iconAsset(e.icon), size: ICON_SIZE, gap: ICON_GAP, color: ICON_INK, strokeWidth: ICON_STROKE },
  });
  ink[e.id] = iconInkRect(card, { size: ICON_SIZE, gap: ICON_GAP });
}

const at = (id: string) => ink[id];

const edges: Scene['edges'] = [];
const labels: NonNullable<Scene['labels']> = [];

/** 一条**直线**边 + 沿线标签(标签默认落在线上方/侧方 `dy` 处) */
function link(id: string, from: string, fromSide: 'top' | 'right' | 'bottom' | 'left', to: string, toSide: 'top' | 'right' | 'bottom' | 'left', label: string, dy: number): void {
  const r = routeOrthogonal({ from: at(from), fromPort: { side: fromSide }, to: at(to), toPort: { side: toSide } });
  edges.push({ id, from, to, points: r.points });
  labels.push(edgeLabel({ id, points: r.points }, label, { dy, rotate: labelAngle(r.points) }));
}

// Flight ↔ Airport 那一对(Delayed By 之外的另一半): **成对双线** —— 同一对实体上的两条关系
const pair = routePair({ from: at('flight'), fromPort: { side: 'top' }, to: at('airport'), toPort: { side: 'bottom' }, gap: 26 });
pair.points.forEach((points, i) => edges.push({ id: `e.dep.${i}`, from: 'flight', to: 'airport', points }));
labels.push(...pairLabels(pair, ['Departed From', 'Arrived To'], { offset: 16 }));

link('e.delayed', 'flight', 'left', 'delay', 'right', 'Delayed By', -16);
link('e.operated', 'flight', 'right', 'airline', 'left', 'Operated By', -16);
link('e.flown', 'flight', 'bottom', 'aircraft', 'top', 'Flown By', -16);
link('e.hub', 'airport', 'right', 'airline', 'top', 'Hub For', -16);
link('e.owned', 'aircraft', 'right', 'airline', 'bottom', 'Owned By', -16);

// --- 图注(参照图底部那两行说明): 位置由**内容包围盒**推, 不手估画布中心 ------
const CAPTION = [
  'A simple ontology of 5 object types displays some of the properties',
  'and relationships within airline industry datasets.',
];
const capSize = 16;
// 宽高只由 textFit 给(与 scene.texts 上屏逐字同源: 最宽行 + 行块并集高)
const capFit = textFit({ content: CAPTION.join('\n'), fontSize: capSize, weight: 700 });
// 落位: 贴在**内容包围盒底边中点**往下 52px —— `below` 的 align 缺省 `center` 就是"骑底边中点",
// 于是重心不用手算(内容非空, `contentBounds` 不会给 null)
const before = contentBounds({ width: 0, height: 0, nodes, edges, labels })!;
const captionRect = below(before, capFit, 52);

export const scene: Scene = {
  width: 0, // 交给 `fit` 按内容重定(先 fit 再审 —— 审计吃的是平移后的那份)
  height: 0,
  nodes,
  edges,
  labels,
  texts: [{ id: 'caption', rect: captionRect, text: CAPTION.join('\n'), fontSize: capSize, weight: 700, anchor: 'middle' }],
};

const styles = Object.fromEntries(nodes.map((n) => [n.id, { fill: CARD_FILL }]));

// 出口走 `scripts/runner.ts`(260920): 摘要 / 诊断 / 草稿 / exit code 都在那一处(见该文件头注)
if (isMainModule(import.meta.url)) {
  runScene(scene, {
    level: LEVEL,
    fit: { padding: 40 },
    nodeStyles: styles,
    title: '航空业本体(图标 + 卡片)',
    extra: [
      `块尺寸(cardFit 反算): 卡片 ${nodes[2].rect.w}×${nodes[2].rect.h} · 图标 ${ICON_SIZE} · 块 ${round1(ink.flight.h)} 高`,
      `成对双线: gap ${pair.gap} · 法线 ${JSON.stringify(pair.normal)} · 端点贴面 ${JSON.stringify(pair.onFace)}`,
      `标签角度: 竖线 ${labelAngle(pair.points[0])}° · 横线 ${labelAngle(edges[2].points)}°`,
    ],
  });
}
