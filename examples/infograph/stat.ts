// =====================================================================
// infograph/stat · v0.2 排版层第一件: 四块大数字排成 2×2
//   bun run examples/infograph/stat.ts > /tmp/stat-grid.svg
//
// 这张图证明什么: 一个 stat 块里**没有一个手写坐标** ——
//   · 块尺寸由 `statFit` 反算(数字行的宽含 delta 的标记与间隙), 格尺寸取四块里的最大宽高
//   · 格位由 `grid` 摆(两轴都等距 —— 规则格子正是 `grid` 与 `pack` 的分工线, 见 `geometry/pack.ts`)
//   · 画布由内容并集定 + 四边同值留白(与 `start/basic.ts` 同一姿势)
// 手写数字只剩 4 条文案与几个版式常量(2×2 的格数 · 两个缝 · 一个留白)。它顺带把两件容易做错的事摆上台面:
//   · **约定可盖**: "延迟降 31%" 按 `down` 走缺省是 rose(红), 而作者知道降延迟是好事 ——
//     一个 `tone: 'emerald'` 就盖掉了。缺省色是约定不是判据(见 `DELTA_TONES`)。
//   · delta 的标记是**几何**(path 小三角), 不是 `▲` / `▼` 字符: mono 字体栈 + rsvg 管线
//     没有字形回退, Unicode 符号实测出 tofu(同 QUICKREF 里 Unicode 下标那条)。
//
// 为什么不是 `packRow`: 四块一字横排是 792×139(5.7 : 1), 缩进 3:2 的画框就成了一条 ——
// 两行两列后 466×310(≈3:2), 块在卡里大了一档还看得清字。两轴都等距的规则格子归 `grid`,
// 代价是统一格尺寸(取最大那块)会给窄块多留一段空白 —— 版式上认这个代价。
//
// 走**描述符层**(直出 descriptor, 不经 scene / 不过门禁), 与 `start/basic.ts` 同档:
// 一个 stat 块是"几行字 + 一个标记"的组合, 不是 scene 的对象(进 scene 只会被拆成散字)。
// =====================================================================

import { svg } from '../../src/descriptor';
import { toSVG } from '../../src/serialize';
import { type StatFitOptions, statFit, statShape } from '../../src/shapes/stat';
import { type Pt, type Rect, bounds, grid, round1 } from '../../src/index';

// --- 作者决策: 四条文案 + 几个版式常量 ---------------------------------------

const STATS: StatFitOptions[] = [
  { value: '1.2M', label: '月度调用', delta: { text: '+18%', dir: 'up' } },
  { value: '99.9%', label: '可用性', delta: { text: '+0.3pt', dir: 'up' } },
  // 反例: 降延迟是好事 ⇒ 盖掉 down 的缺省 rose
  { value: '42ms', label: 'P95 延迟', delta: { text: '-31%', dir: 'down', tone: 'emerald' } },
  { value: '3.4×', label: '成本效率', delta: { text: '+12%', dir: 'up' } },
];
const COLS = 2;    // 列数(2×2 的那个 2); 行数由块数推 —— 加一块就自己多一行
const GAP_X = 48;  // 列缝(缝的节奏是作者决策, 不是推导)
const GAP_Y = 112; // 行缝比列缝宽一档: 块是扁的(169×59), 而 2×2 要的是画幅分量 —— 行缝到 112 整幅即 466×310 ≈ 3:2
const PAD = 40;    // 画布四边留白

// --- 块: 尺寸反算 → 格位由 grid 摆 → 画布由内容并集定 -------------------------

const fits = STATS.map((s) => statFit(s));
/** 格尺寸 = 四块里的**最大**宽高(`grid` 只吃一个 cell —— 参差格子不在它的边界内, 见 `geometry/grid.ts`) */
const cell = { w: Math.max(...fits.map((f) => f.w)), h: Math.max(...fits.map((f) => f.h)) };
const rows = Math.ceil(STATS.length / COLS);
const g = grid({ origin: { x: 0, y: 0 }, cols: COLS, rows, cell, gap: { x: GAP_X, y: GAP_Y } });
const cells = STATS.map((_, i) => g.cell(i % COLS, Math.floor(i / COLS)));
const ink = bounds(cells)!;
const W = round1(ink.w + 2 * PAD);
const H = round1(ink.h + 2 * PAD);
/** 内容坐标系 → 画布: 并集左上角挪到 (PAD, PAD) —— 与 `start/basic.ts` 同一份平移 */
const O: Pt = { x: round1(PAD - ink.x), y: round1(PAD - ink.y) };
const move = (r: Rect): Rect => ({ ...r, x: round1(r.x + O.x), y: round1(r.y + O.y) });

/** 统一格比内容宽(取的是最大那块) ⇒ 块内骑格心; 盒宽 = 内容宽时两种对齐同图 */
const content = cells.map((r, i) => statShape({ ...move(r), ...STATS[i], align: 'center' }));

if (import.meta.main) {
  // 自检走 stderr(诊断不污染图): 自然宽是交付尺寸的硬约束, 经验档 ≤900
  console.error(`4 块 stat · 逐块拟合 ${fits.map((f) => `${f.w}×${f.h}`).join(' / ')} · 格 ${cell.w}×${cell.h}`);
  console.error(`自然尺寸 ${W} × ${H}(比 ${(W / H).toFixed(2)} · 交付经验档宽 ≤900)`);
  process.stdout.write(toSVG(svg(W, H, content, { 'font-family': 'ui-sans-serif, system-ui, "PingFang SC", sans-serif' })));
}
