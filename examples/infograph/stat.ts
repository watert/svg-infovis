// =====================================================================
// infograph/stat · v0.2 排版层第一件: 一行大数字块(4 块横排)
//   bun run examples/infograph/stat.ts > /tmp/stat-row.svg
//
// 这张图证明什么: 一个 stat 块里**没有一个手写坐标** ——
//   · 块宽高由 `statFit` 反算(数字行的宽含 delta 的标记与间隙)
//   · 块位置由 `packRow` 摆(列缝是唯一的版式常量)
//   · 画布由内容并集定 + 四边同值留白(与 `start/basic.ts` 同一姿势)
// 手写数字只剩 4 条文案与两个版式常量(GAP / PAD)。它顺带把两件容易做错的事摆上台面:
//   · **约定可盖**: "延迟降 31%" 按 `down` 走缺省是 rose(红), 而作者知道降延迟是好事 ——
//     一个 `tone: 'emerald'` 就盖掉了。缺省色是约定不是判据(见 `DELTA_TONES`)。
//   · delta 的标记是**几何**(path 小三角), 不是 `▲` / `▼` 字符: mono 字体栈 + rsvg 管线
//     没有字形回退, Unicode 符号实测出 tofu(同 QUICKREF 里 Unicode 下标那条)。
//
// 走**描述符层**(直出 descriptor, 不经 scene / 不过门禁), 与 `start/basic.ts` 同档:
// 一个 stat 块是"几行字 + 一个标记"的组合, 不是 scene 的对象(进 scene 只会被拆成散字)。
// =====================================================================

import { svg } from '../../src/descriptor';
import { toSVG } from '../../src/serialize';
import { type StatFitOptions, statFit, statShape } from '../../src/shapes/stat';
import { type Pt, type Rect, bounds, packRow, round1 } from '../../src/index';

// --- 作者决策: 四条文案 + 两个版式常量 ---------------------------------------

const STATS: StatFitOptions[] = [
  { value: '1.2M', label: '月度调用', delta: { text: '+18%', dir: 'up' } },
  { value: '99.9%', label: '可用性', delta: { text: '+0.3pt', dir: 'up' } },
  // 反例: 降延迟是好事 ⇒ 盖掉 down 的缺省 rose
  { value: '42ms', label: 'P95 延迟', delta: { text: '-31%', dir: 'down', tone: 'emerald' } },
  { value: '3.4×', label: '成本效率', delta: { text: '+12%', dir: 'up' } },
];
const GAP = 48;   // 列缝(缝的节奏是作者决策, 不是推导)
const PAD = 40;   // 画布四边留白

// --- 块: 尺寸反算 → 位置由 packRow 摆 → 画布由内容并集定 ----------------------

const fits = STATS.map((s) => statFit(s));
const row = packRow({ items: fits, gap: GAP, y: 0, x0: 0, align: 'start' });
const ink = bounds(row.rects)!;
const W = round1(ink.w + 2 * PAD);
const H = round1(ink.h + 2 * PAD);
/** 内容坐标系 → 画布: 并集左上角挪到 (PAD, PAD) —— 与 `start/basic.ts` 同一份平移 */
const O: Pt = { x: round1(PAD - ink.x), y: round1(PAD - ink.y) };
const move = (r: Rect): Rect => ({ ...r, x: round1(r.x + O.x), y: round1(r.y + O.y) });

const content = row.rects.map((r, i) => statShape({ ...move(r), ...STATS[i] }));

if (import.meta.main) {
  // 自检走 stderr(诊断不污染图): 自然宽是交付尺寸的硬约束, 经验档 ≤900
  console.error(`4 块 stat · 块宽 ${fits.map((f) => f.w).join(' / ')} · 块高 ${fits[0].h}`);
  console.error(`自然尺寸 ${W} × ${H}(交付经验档宽 ≤900)`);
  process.stdout.write(toSVG(svg(W, H, content, { 'font-family': 'ui-sans-serif, system-ui, "PingFang SC", sans-serif' })));
}
