// =====================================================================
// style-lab · 画布外观矩阵(260920 由 `theme-lab.ts` + `grid-lab.ts` 两张并成一张)
//
//   bun run examples/labs/style-lab.ts light  > /tmp/style-light.svg
//   bun run examples/labs/style-lab.ts dark   > /tmp/style-dark.svg
//   bun run examples/labs/style-lab.ts grid   > /tmp/style-grid.svg
//   (栅格化走 scripts/svg2png.sh)
//
// **为什么合成一张**: 两图同属一层 —— 都在定「画布长什么样」的缺省值。
//   ① 主题那一半: 7 tone × outline/solid × light/dark, 肉眼核色值(对比度 / solid 上的字看不看得见);
//   ② 底纹那一半: 线格 / 点阵 × 两档密度, 核的是 opacity 与"底纹会不会跟节点边框抢戏"。
//   260920 起网格进了 `Theme.grid` **主缺省**(paper 自带一层细线格) —— 两半从此是同一件事的两面,
//   分两个文件反而把"主题 = 色 + 字体 + 底纹"这件事割裂。合并后**几何一字未动**(light / dark 两份
//   逐字节等于合并前; grid 那份只改了画内标题 —— 原来写着文件名 `grid-lab`, 而那个文件已经不存在了)。
//
// 底纹那一半的定档依据(缺省值就是这么量出来的): 线格 opacity 0.1 / 点阵 0.2 —— 再浓就开始跟节点
// 边框抢戏; 墨色是中性灰 #999999(**不是**主题组框色: 墨黑铺满实测 18.3 灰阶会压住整张图,
// 中性灰 10.7, 定档缘由见 `shapes/grid-pattern.ts` 文件头)。
// ⚠ 深浅精度是 serialize 的 1 位小数档: 写 0.06 会被写成 0.1 —— 要更细就把 alpha 编进 `color`。
//
// 本文件是 SKILL「判据归 test, 示例只负责展示」里点名的**非出口示例**(并排对照卡, 不过门禁)。
// =====================================================================

import {
  type Descriptor, type GridProps, THEMES, TONES,
  canvasLayer, edgeShape, group, groupShape, nodeShape, rect, svg, textShape,
} from '../../src/index';
import { gridLayer } from '../../src/shapes/grid-pattern';
import { routeOrthogonal } from '../../src/knives/route';
import { toSVG } from '../../src/serialize';

const FONT = 'ui-sans-serif, system-ui, "PingFang SC", sans-serif';

/** 主题矩阵(前身 `theme-lab.ts`)—— `light` / `dark` 决定画哪一档 */
function themeMatrix(mode: 'light' | 'dark'): string {
  const theme = THEMES[mode];
  const ROW = 64;
  const TOP = 96;
  const W = 620;
  const H = TOP + TONES.length * ROW + 40;

  const children: Descriptor[] = [
    canvasLayer(theme, W, H),
    // 标题与分组框(演示 group 的 tone 取色)
    textShape({ x: 20, y: 26, content: `theme: ${mode}`, size: 15, weight: 700, theme }),
    textShape({ x: 20, y: 46, content: '7 tone × outline / solid', size: 11.5, theme, color: theme.label }),
    groupShape({ x: 12, y: 62, w: W - 24, h: H - 86, radius: 16, label: mode === 'dark' ? 'dark surface' : 'light surface', theme }),
  ];

  TONES.forEach((tone, i) => {
    const y = TOP + i * ROW;
    children.push(
      textShape({ x: 26, y: y + 22, content: tone, size: 12, weight: 600, tone, theme }),
      nodeShape({ x: 120, y, w: 190, h: 44, radius: 10, label: 'outline', tone, variant: 'outline', theme, fontSize: 12 }),
      nodeShape({ x: 330, y, w: 190, h: 44, radius: 10, label: 'solid', tone, variant: 'solid', theme, fontSize: 12 }),
    );
  });

  // 一条边 + 端点: 核对线色与箭头在两种 mode 下的可读性
  const r = routeOrthogonal({
    from: { x: 570, y: TOP - 6, w: 20, h: 20 }, fromPort: { side: 'bottom' },
    to: { x: 560, y: H - 60, w: 40, h: 20 }, toPort: { side: 'top' },
    stub: 12,
  });
  children.push(edgeShape({ points: r.points, theme, radius: 8, end: 'arrow-triangle', markerSize: 7 }));

  return toSVG(svg(W, H, children, { 'font-family': FONT }), { declaration: false });
}

/** 底纹对照(前身 `grid-lab.ts`)—— paper 主题下四格: 上排 line / 下排 dot, 每排两档密度 */
function gridLab(): string {
  const theme = THEMES.paper;
  const CW = 300;
  const CH = 180;
  const GAP = 16;
  const PAD = 16;
  const TOP = PAD + 30;
  const W = PAD * 2 + CW * 2 + GAP;
  const H = TOP + CH * 2 + GAP + PAD;

  /** 一格 = 纸底 + 网格 + 两个节点一条边(格子自己平移, 内容坐标与真实用法一致) */
  const cell = (col: number, row: number, label: string, grid: GridProps): Descriptor =>
    group(
      [
        canvasLayer(theme, CW, CH),
        ...gridLayer(CW, CH, grid),
        textShape({ x: 14, y: 18, content: label, size: 10.5, theme, color: theme.label }),
        nodeShape({ x: 30, y: 52, w: 104, h: 38, radius: 8, label: 'Ingest', tone: 'blue', variant: 'tint', theme, fontSize: 11.5 }),
        nodeShape({ x: 166, y: 106, w: 104, h: 38, radius: 8, label: 'Store', tone: 'slate', variant: 'outline', theme, fontSize: 11.5 }),
        edgeShape({
          points: [{ x: 82, y: 90 }, { x: 82, y: 125 }, { x: 166, y: 125 }],
          theme, radius: 8, end: 'arrow-triangle', markerSize: 6,
        }),
      ],
      { transform: `translate(${PAD + col * (CW + GAP)} ${TOP + row * (CH + GAP)})` },
    );

  // ⚠ 四格的 pattern 参数各不相同, 所以**必须各自给 id**: 缺省 id 一律是 `md-grid`, 而重复 id 下
  // `url(#md-grid)` 会全部解析到**第一个**定义 —— 实测(合并前): 四格全渲染成 step 10 的线格,
  // dot 格纵向量到的间距是 10 而不是 14。一图只铺一种网格时不用管; 并排对比 / 同页 inline 多图
  // 就得各自点名(这也是 `GridProps.id` 存在的唯一理由)。
  const children: Descriptor[] = [
    rect(0, 0, W, H, 0, { fill: '#ffffff', stroke: 'none' }),
    textShape({ x: PAD, y: PAD + 12, content: '底纹对照 · paper 主题下的两种网格', size: 13, weight: 700, theme }),
    cell(0, 0, 'line · step 10 · 线宽 1 · opacity 0.1', { id: 'grid-line-10' }),
    cell(1, 0, 'line · step 8 · 线宽 0.6 · opacity 0.1', { id: 'grid-line-8', step: 8, width: 0.6 }),
    cell(0, 1, 'dot · step 14 · 直径 2 · opacity 0.2', { id: 'grid-dot-14', style: 'dot', step: 14 }),
    cell(1, 1, 'dot · step 10 · 直径 3 · opacity 0.2', { id: 'grid-dot-10', style: 'dot', step: 10, width: 3 }),
  ];

  return toSVG(svg(W, H, children, { 'font-family': theme.fontFamily }), { declaration: false });
}

if (import.meta.main) {
  const arg = process.argv[2];
  // 不认识的分档当场说清, 不静默落回缺省(缺省档 `light` —— 与合并前的 theme-lab 一致; 2 = 用法错)
  if (arg !== undefined && arg !== 'light' && arg !== 'dark' && arg !== 'grid') {
    console.error(`✗ 不认识的分档 '${arg}'。可选: light | dark | grid`);
    process.exit(2);
  }
  process.stdout.write(arg === 'grid' ? gridLab() : themeMatrix(arg === 'dark' ? 'dark' : 'light'));
}
