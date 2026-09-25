// =====================================================================
// port-folds · 「端口朝向 → 折法」参考卡(前身 `examples/route-lab.ts` 的重做)
//
// 前身为什么被删: 它自己写了一段"正交性自检" —— 与门禁 `orthogonal_edges` **同题**, 判据写了两份;
// 而且它压根不跑门禁(能出图就算成)。重复判据 + 无判决 = 一张看着对的玩具图。
// 本文件按**真实案例**的标准重做: 折点全由 `routeAll` 现算, 出口走 `exportScene` fail-closed
// (showcase 档), 门禁判决落到退出码。前身那段自检**不重写** —— 正交性归 `orthogonal_edges`、
// 自重叠归 `no_backtrack`(读数看 metrics 的 `backtracks`), 示例不再重复一遍判据。
//
// 它同时是两件东西, 缺一件都不该存在:
//   · **参考卡** —— 画图时查"这一对盒子的进出端口该给哪两个面、折出来是什么形状"。
//     2×2 四格, 盒位与走廊**逐字相同**, 只有端口组合不同 ⇒ 四格之间的差异只可能来自端口选择。
//     这正是本内核的立场: **端口位置是作者的旋钮, 不是布局算法的运气**。
//   · **真实案例** —— `routeAll`(route 的批量入口, `reqs.map(routeOrthogonal)`)此前零示例覆盖,
//     这里是它的活体; `SceneText` 的 `weight` / `color` 两个槽(260919)也在这里用上(格标题按格色着色)。
//
// 一条纪律: **折点一个坐标都不手写**。四格共用同一套相对盒坐标喂 `routeAll`, 拿回折点列后只做
// 刚体平移(平移到各自的格位) —— 平移量是版式, 不是几何。折法名与折数也一律从折点列现算。
//
//   bun run examples/checks/port-folds.ts > /tmp/port-folds.svg     # 门禁不过 → exit 1
//   scripts/svg2png.sh /tmp/port-folds.svg /tmp/port-folds.png 1200
//
// 出口放在 `import.meta.main` 里面是刻意的: **被 import 时本模块是纯 scene**(门禁不跑、不写文件、
// 不动退出码) —— `scripts/inspect.ts` 与后续 web 展示都按这个契约接, 谁也不该因为"读了一眼图"
// 而收到 exit 1。跑门禁只有一条路: 直接 `bun run` 本文件。
// =====================================================================

import {
  type Pt, type Rect, type RouteRequest, type RouteResult, type Scene, type SceneText, type Side, type Tone,
  ORTHO_EPS, THEMES, add, below, bounds, grid, nodeFit, rectBottom, rectRight, rightOf, routeAll, textFit,
} from '../../src/index';
import { runScene } from '../../scripts/runner';

const theme = THEMES.paper;

// --- 四格: 同一对盒, 只有端口两面不同 ---------------------------------------
//
// tone 的语义是"这一格在对照里是第几号"(同一族的边与格标题同色) —— 不是"这格更重要"。
const COMBOS = [
  { from: 'bottom', to: 'top', tone: 'blue' },
  { from: 'right', to: 'left', tone: 'emerald' },
  { from: 'bottom', to: 'left', tone: 'amber' },
  { from: 'right', to: 'top', tone: 'violet' },
] as const satisfies ReadonlyArray<{ from: Side; to: Side; tone: Tone }>;

// --- 版式: 盒由内容反算, 其余是作者决策 --------------------------------------

const fitA = nodeFit({ label: 'A · 源', level: 'showcase' });
const fitB = nodeFit({ label: 'B · 目标', level: 'showcase' });
// 两盒同尺寸(取两者更宽/更高的那个): 四格的相对坐标才可能是"同一套"
const BOX_W = Math.max(fitA.w, fitB.w);
const BOX_H = Math.max(fitA.h, fitB.h);

// 盒间走廊(横竖同值): 走廊**多窄都不影响折法** —— 实测 10 / 20 / … / 70 七档出的是同一套折法,
// 一档都没绕远(③ 的"绕两盒顶 / 底"一次都没进)。原因是 `route.ts` 文件头 ① 那条: 两根 stub
// **对顶**时各让一半(`half = min(stub, 缝/2)`), 于是 `a1` 与 `b1` 的间隔恒 ≥ 0(`2×half ≤ 缝`
// 对任何走廊成立), 腰线可行域永不为空。
// 70 是作者给的**观感**余量(四格之间的呼吸位), 不是可行域要求 —— 别把它当门禁下限读。
const CORRIDOR = 70;
const TITLE_ZONE = 48;                     // 格顶 → A 盒顶: 装标题 + 折法两行
// 四格的两盒统一尺寸: `place` 的糖面吃尺寸对象(不吃 fit), 尺寸对不齐就谈不上"同一套相对坐标"
const BOX_SIZE = { w: BOX_W, h: BOX_H };
const REL_A: Rect = { x: 0, y: TITLE_ZONE, w: BOX_W, h: BOX_H };
// B 在 A 的右下方各隔一条走廊(`align: 'start'` = 贴 A 的左边 / 顶边) —— 走 `rightOf` / `below`
// 糖面直说这句话, 不再自己写 `BOX_W + CORRIDOR` 这种换算
const REL_B: Rect = below(rightOf(REL_A, BOX_SIZE, CORRIDOR, { align: 'start' }), BOX_SIZE, CORRIDOR, { align: 'start' });

const TITLE_SIZE = 12, CAPTION_SIZE = 10.5, HEAD_SIZE = 17, DESC_SIZE = 12;
// 格尺寸 = 两盒并集的**远角坐标**(不是并集本身的宽高) —— 格里那套相对坐标的原点恒在 (0, 0),
// 并集右 / 下缘到原点的距离才是格要装下的范围(A 之上那条 TITLE_ZONE 标题带也算格的一部分)
const CELL = bounds([REL_A, REL_B])!;
const CELL_W = rectRight(CELL);
const CELL_H = rectBottom(CELL);
const CELL_GAP_X = 96, CELL_GAP_Y = 96;    // 格间 > 格内走廊(70), 四格才读得出是四格
const PAD = 32, HEAD_H = 96;               // 顶部标题 + 说明两行, 与第一排格标题留 16px
const MUTED = '#64748b';                   // 次级文字(主题没有"弱化"槽: 格标题按格色, 折法名走这个)

// 四格本体 = 一张 2×2 的**均匀格子**: 格位与画布占位全从它查(格内仍是同一套相对盒坐标)
const g = grid({ origin: { x: PAD, y: HEAD_H }, cols: 2, rows: 2, cell: { w: CELL_W, h: CELL_H }, gap: { x: CELL_GAP_X, y: CELL_GAP_Y } });

// --- 折点: 四条边一次算完 ----------------------------------------------------

const reqs: RouteRequest[] = COMBOS.map((c) => ({
  from: REL_A, fromPort: { side: c.from }, to: REL_B, toPort: { side: c.to },
}));
const routes = routeAll(reqs);

// --- 读数: 折法名与折数都从折点列现算, 不手写 ---------------------------------

/** 折法名: 1 折 = L(先哪轴后哪轴看首段), 2 折 = Z(腰线轴看中间那段) */
const foldName = (r: RouteResult): string => {
  const [p0, p1] = r.points;
  // 判"首段是不是水平的"就是问它偏竖直轴多少 —— 与门禁 `orthogonal_edges` 同一把尺子(`ORTHO_EPS`)
  const first = Math.abs(p0.y - p1.y) < ORTHO_EPS ? '横' : '竖';
  if (r.bends <= 1) return `L · 先${first}后${first === '横' ? '竖' : '横'}`;
  const [q, s] = [r.points[1], r.points[2]];
  return `Z · ${Math.abs(q.x - s.x) < ORTHO_EPS ? '竖腰' : '横腰'}`;
};

// --- 组装 --------------------------------------------------------------------

/** 一行旁注: rect = 实测包围盒(渲染就在它里面对齐, 审计读同一份) —— 不给出渲染看不见的幽灵矩形 */
const textAt = (id: string, x: number, y: number, content: string, o: { size: number; weight?: number; color?: string }): SceneText => {
  // 尺寸走 textFit(逐行 + 行块, 与渲染同源); (x, y) 是包围盒左上角, 不走 placeText 的块心语义
  const fit = textFit({ content, fontSize: o.size, weight: o.weight });
  return { id, rect: { x, y, w: fit.w, h: fit.h }, text: content, fontSize: o.size, weight: o.weight, color: o.color };
};

/** 盒 / 折点的刚体平移(平移到格位) —— 折点仍是 `routeAll` 吐出来的那一份, 只换原点 */
const shiftRect = (r: Rect, o: Pt): Rect => ({ x: r.x + o.x, y: r.y + o.y, w: r.w, h: r.h });

const nodes: Scene['nodes'] = [];
const edges: Scene['edges'] = [];
const texts: SceneText[] = [];

COMBOS.forEach((c, i) => {
  // 格位 = 格子的第 (i%2) 列 / 第 ⌊i/2⌋ 行; 格内一切照旧走相对盒坐标 + 刚体平移
  const slot = g.cell(i % 2, Math.floor(i / 2));
  const origin: Pt = { x: slot.x, y: slot.y };
  const r = routes[i];
  nodes.push({ id: `n${i}a`, rect: shiftRect(REL_A, origin), label: 'A · 源' });
  nodes.push({ id: `n${i}b`, rect: shiftRect(REL_B, origin), label: 'B · 目标' });
  edges.push({ id: `e${i}`, from: `n${i}a`, to: `n${i}b`, points: r.points.map((p) => add(p, origin)), tone: c.tone });
  texts.push(textAt(`t${i}`, origin.x, origin.y, `${c.from} → ${c.to} · ${r.bends} 折`, {
    size: TITLE_SIZE, weight: 700, color: theme.tones[c.tone].text,
  }));
  texts.push(textAt(`c${i}`, origin.x, origin.y + 21, foldName(r), { size: CAPTION_SIZE, color: MUTED }));
});

texts.push(textAt('head', PAD, PAD, '端口朝向 → 折法', { size: HEAD_SIZE, weight: 700 }));
texts.push(textAt('desc', PAD, PAD + 30, '端口位置是作者的旋钮, 不是布局算法的运气 —— 四格盒位逐字相同, 只换端口两面', { size: DESC_SIZE, color: MUTED }));

// 画布尺寸是**占位**(出口的 `fit: true` 会按内容重算): 格区右侧 / 下侧各留一个 PAD
export const scene: Scene = { width: rectRight(g.bounds) + PAD, height: rectBottom(g.bounds) + PAD, nodes, edges, texts };

// --- 出口(fail-closed; 诊断走 stderr, 图走 stdout) ---------------------------

// 260920 起出口收进 `scripts/runner.ts`: 门禁没过时**草稿仍走同一条通道**(stdout —— 也就是
// `> /tmp/port-folds.svg` 重定向的那个文件), 判决落到退出码。于是这个迭代回路在被拦下的那次
// 也有图可看, 而"带病产物"由 exit 1 拦在 shell 的 `&&` 链上(过去是草稿落 /tmp、stdout 留空)。
if (import.meta.main) {
  runScene(scene, {
    level: 'showcase', theme, fit: true, title: '端口朝向 → 折法',
    extra: [`bends: ${routes.map((r, i) => `${COMBOS[i].from}→${COMBOS[i].to}=${r.bends}`).join(' ')}`],
  });
}
