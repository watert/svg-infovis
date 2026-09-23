// =====================================================================
// ontology-e2e · 能力举证的**闭环**
//
// 这张图是本次(260920)整个特性的验收范式: "图标当节点的视觉替身 + 逐行说明卡片 + 成对双线
// + 沿线旋转的标签" —— 即参照图那类 ontology / 关系图 —— 组装起来能不能**过 showcase 档门禁**。
//
// 为什么闭环比逐条单测更值: 单测各验一块积木, 而"积木拼起来互相打架"恰恰是这类特性的真风险
// (`iconInkRect` 没进 `contentBounds` ⇒ 图标被 fit 裁掉; `cardFit` 的字重与门禁的字重不同源 ⇒
// 盒按 400 给、门禁按 600 量)。出图成功本身就是凭证(fail-closed: 门禁不过就出不了正式产物),
// 所以这条用例断言的是 `pass === true` 与零 error 诊断, 而不是"SVG 里有几个标签"。
//
// 两处与参照图的**有意偏差**都在示例文件里写明(折线走正交是现行门禁的要求; 换行位置是作者决定),
// 这里不重复。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { type Scene } from '../src/knives/audit';
import { cardFit, placeCard } from '../src/knives/fit';
import { pairLabels, routePair } from '../src/knives/route-pair';
import { iconAsset } from '../src/icons/lucide';
import { iconInkRect } from '../src/shapes/icon';
import { contentBounds, exportScene } from '../src/export';
import { edgeLabel, labelAngle } from '../src/shapes/edge';
import { routeOrthogonal } from '../src/knives/route';
import { THEMES } from '../src/theme';
import { round1 } from '../src/geometry/vec';

const LEVEL = 'showcase';
const FS = 12;
const ICON_SIZE = 110;
const ICON_GAP = 14;
const CARD_PAD: [number, number] = [14, 12];

const ENTITIES = [
  { id: 'airport', cx: 560, cy: 160, icon: 'radio-tower', lines: [
    'Object Type: **Airport**', 'Object: JFK', 'Properties: Opening Date,', 'Operating Capacity, Lat./Long.',
  ] },
  { id: 'flight', cx: 560, cy: 620, icon: 'plane-takeoff', lines: [
    'Object Type: **Flight**', 'Object: JFK -> SFO', '24-02-2020 15:22', 'Properties: Departure, Arrival,', 'Passenger Count',
  ] },
  { id: 'delay', cx: 200, cy: 620, icon: 'timer-reset', lines: [
    'Object Type: **Delay**', 'Object: 38 Minute Delay', 'Properties: Duration,', 'Arrival/Departure, Cause',
  ] },
] as const;

/** 逐实体反算 + 摆放(全在构建期; scene 里存的是算好的几何) */
function build(): { scene: Scene; inkOf: Record<string, ReturnType<typeof iconInkRect>> } {
  const nodes: Scene['nodes'] = [];
  const inkOf: Record<string, ReturnType<typeof iconInkRect>> = {};
  for (const e of ENTITIES) {
    const fit = cardFit({ lines: e.lines, fontSize: FS, level: LEVEL, padding: CARD_PAD, iconSize: ICON_SIZE, iconGap: ICON_GAP });
    const { card } = placeCard(fit, { x: e.cx, y: e.cy });
    nodes.push({
      id: e.id, rect: card, label: e.lines.join('\n'), fontSize: FS, radius: 10,
      align: 'start', weight: fit.weight, // 与 cardFit 算盒时同一个字重
      icon: {
        asset: iconAsset(e.icon), size: ICON_SIZE, gap: ICON_GAP,
        color: THEMES.light.tones.slate.solidBorder, strokeWidth: 1.1,
      },
    });
    // 边路由对着**块的外廓**而不是卡片盒: 卡片上方那截图标也在块的范围内
    inkOf[e.id] = iconInkRect(card, { size: ICON_SIZE, gap: ICON_GAP });
  }

  const edges: Scene['edges'] = [];
  const labels: NonNullable<Scene['labels']> = [];
  const at = (id: string) => inkOf[id];

  // 成对双线: 同一对实体上的两条关系
  const pair = routePair({ from: at('flight'), fromPort: { side: 'top' }, to: at('airport'), toPort: { side: 'bottom' }, gap: 26 });
  pair.points.forEach((points, i) => edges.push({ id: `e.dep.${i}`, from: 'flight', to: 'airport', points }));
  labels.push(...pairLabels(pair, ['Departed From', 'Arrived To'], { offset: 16 }));

  // 单线 + 沿线旋转的标签
  const r = routeOrthogonal({ from: at('flight'), fromPort: { side: 'left' }, to: at('delay'), toPort: { side: 'right' } });
  edges.push({ id: 'e.delayed', from: 'flight', to: 'delay', points: r.points });
  labels.push(edgeLabel({ id: 'e.delayed', points: r.points }, 'Delayed By', { dy: -16, rotate: labelAngle(r.points) }));

  return {
    inkOf,
    scene: { width: 0, height: 0, nodes, edges, labels },
  };
}

describe('ontology-e2e · 图标 + 卡片 + 双线 + 旋转标签的闭环', () => {
  const { scene, inkOf } = build();
  const result = exportScene(scene, {
    level: LEVEL,
    fit: { padding: 40 },
    title: '航空业本体(图标 + 卡片)',
  });

  it('showcase 档零诊断, 出的是正式产物(不是草稿)', () => {
    expect(result.report.pass).toBe(true);
    expect(result.report.metrics.errors).toBe(0);
    expect(result.report.diagnostics).toEqual([]);
    expect(result.draft).toBe(false);
  });

  it('三个图标都上屏(每个一个 `data-shape="icon"` 组, 且都是平铺原语不是 transform)', () => {
    expect(result.svg.match(/data-shape="icon"/g)).toHaveLength(ENTITIES.length);
    expect(result.svg.slice(0, result.svg.indexOf('</svg>'))).not.toContain('transform="scale');
  });

  it('卡片文案里的 `**粗**` 走 `tspan`, 且星号一个不漏出来', () => {
    expect(result.svg).toContain('<tspan font-weight="600.00">Airport</tspan>');
    expect(result.svg).toContain('<tspan font-weight="600.00">Flight</tspan>');
    expect(result.svg).not.toContain('*');
  });

  it('成对双线两条都上屏, 标签沿竖线旋转 -90°', () => {
    expect(result.svg.match(/data-shape="edge"/g)?.length).toBe(3); // 双线两条 + 单线一条
    expect(result.svg).toContain('Departed From');
    expect(result.svg).toContain('transform="rotate(-90');
  });

  it('图标没被裁掉: 它进了内容包围盒(auto-fit 才是按含图标的块给的边距)', () => {
    const bounds = contentBounds(scene, { bleed: 0 });
    const highestIconTop = Math.min(...Object.values(inkOf).map((r) => r.y));
    expect(bounds!.y).toBe(round1(highestIconTop));
    // 第一行的卡片盒顶一定低于图标顶(图标在卡片上方) —— 否则上面那条是"碰巧"
    const topCard = Math.min(...scene.nodes.map((n) => n.rect.y));
    expect(highestIconTop).toBeLessThan(topCard);
    // 出图后整张图的高度 = 内容高 + 两倍 padding(图标确实是 fit 照顾到的对象)
    const pad = 40;
    const svgH = Number(/height="([\d.]+)"/.exec(result.svg)![1]);
    expect(svgH).toBeGreaterThan(bounds!.h + 2 * pad - 1);
  });

  it('块宽/块高全是反算的: 卡片宽 = 最宽行 + 2×padX, 块高 = 图标 + 间隙 + 卡片', () => {
    for (const e of ENTITIES) {
      const fit = cardFit({ lines: e.lines, fontSize: FS, level: LEVEL, padding: CARD_PAD, iconSize: ICON_SIZE, iconGap: ICON_GAP });
      const node = scene.nodes.find((n) => n.id === e.id)!;
      expect(node.rect.w).toBe(fit.w);
      expect(node.rect.h).toBe(fit.h);
      expect(inkOf[e.id].h).toBe(ICON_SIZE + ICON_GAP + fit.h);
    }
  });
});
