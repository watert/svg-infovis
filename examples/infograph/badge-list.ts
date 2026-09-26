// =====================================================================
// badge-list · 编号徽章 + 列表行: 5 行编号步骤列表
//   bun run examples/infograph/badge-list.ts > /tmp/badge-list.svg
//
// 这张图证明两件事(v0.2「排版层」第 3 项, 见 docs/infograph-roadmap.md):
//   ① `listRowFit` 的返回面就是 `Size` —— **直接喂 `packCol`** 堆成一列(逐行给高, 所以列距用
//      `gap` 而不是 `pitch`); 行内的徽章 / 文本落位全由 `listRowShape` 算, 脚本里没有一个手写的行坐标
//   ② 徽章吃 `tone × variant` 两槽 —— 前三行是编号步骤的主用例 `blue/solid`, 第四行换一档
//      (`amber/tint`), 末行 `slate/outline`, 一图把三档都画出来。**颜色是语义槽**: 哪一步算
//      "走完"、哪一步算"未开始"是作者说了算, 这里只把档位摆出来
//
// 它是**描述符层**示例(与 `start/basic.ts` 同档): 直接拼 `svg()` 出图, 不经 scene、不过门禁 ——
// 徽章与行文本是**压在版式上的墨迹**(与图标 / 网格底纹同一档), 压根不进净空审计, 所以这条路径
// 就是它的正路; 要组框 / 分隔线 / 底, 是作者拿 `rows[i].bounds` 自己垫。
//
// 动手前(QUICKREF 那八问, 收尾当白名单): 主路径 = 一列步骤, 方向自上而下; 无分组(单列不画框);
// 规模 5 行扫得完; 宽度是内容的函数, 不手定。手写的数只有下面那几个**具名作者决策常量**
// —— 版式是作者的, 几何是 core 的。
// =====================================================================

import { svg } from '../../src/descriptor';
import { toSVG } from '../../src/serialize';
import { bounds } from '../../src/geometry/box';
import { packCol } from '../../src/geometry/pack';
import { type Pt, round1 } from '../../src/geometry/vec';
import type { Tone, Variant } from '../../src/theme';
import { listRowFit, listRowShape } from '../../src/shapes/badge';
import { isMainModule } from '../../src/runtime';

// --- 作者决策: 只有这一段的数是手写的 ---------------------------------------

const ROW_X = 0;              // 行左缘(内容坐标系: 原点取哪都行, 整段一致即可)
const TOP_Y = 0;              // 首行顶边
const ROW_GAP = 15;           // 行缝: 行高逐行不同(有没有次文本) ⇒ 用 gap, 不用 pitch
const CANVAS_PAD = 40;        // 画布四边留白(四边同值: 与内容缩到多大无关)
const NATURAL_MAX = 900;      // 交付尺寸经验档: 自然宽超了该减文案, 不是加宽画布

/** 一行步骤。徽章里的编号是**字符串** —— 本组件不做数值运算(与 `statShape` 对"1.2M"同一立场) */
type Step = {
  /** 徽章里的编号 */
  badge: string;
  /** 主文本 */
  label: string;
  /** 次文本(可省 —— 末行刻意不给, 于是"± 次文本"两种行高同框) */
  sub?: string;
  tone?: Tone;
  variant?: Variant;
};

const TONE: Tone = 'blue';       // 步骤编号这一族的肤色
const MAIN: Variant = 'solid';   // ← 主用例: 实底圆 + 白字(整张图的视觉焦点就是这一列)

const STEPS: Step[] = [
  { badge: '1', label: '读宪章: AGENTS.md', sub: '红线 + 一处事实一处', tone: TONE, variant: MAIN },
  { badge: '2', label: '算盒: nodeFit', sub: '盒宽按内容反算, 不手定', tone: TONE, variant: MAIN },
  { badge: '3', label: '摆列: packCol', sub: '缝 / 节距二选一', tone: TONE, variant: MAIN },
  { badge: '4', label: '出图: toSVG', sub: '字节确定, 无构建步骤', tone: 'amber', variant: 'tint' },
  { badge: '5', label: '复查: bun run verify', tone: 'slate', variant: 'outline' },
];

// --- 行尺寸与行位置: 反算 → packCol(一个手写坐标都没有) -----------------------

// 徽章列要**齐**: 先探一次各行按内容反算的直径, 取全列最大回喂 —— 否则单字与双字两行的徽章
// 一大一小, 而文本列左缘也跟着错开几 px(列不齐是肉眼第一眼就看到的那种错位)。
// 与 `start/basic.ts` 的"三盒取大"同一路数: 盒宽是内容驱动的下限, 取大保证都装得下且齐整。
const probe = STEPS.map((s) => listRowFit(s));
const BADGE_SIZE = Math.max(...probe.map((f) => f.badgeSize));
const fits = STEPS.map((s) => listRowFit({ ...s, badgeSize: BADGE_SIZE }));
const col = packCol({ items: fits, gap: ROW_GAP, x: ROW_X, y0: TOP_Y, align: 'start' });

// --- 画布: 由内容并集定, 四边同值留白 ---------------------------------------
//
// 先量并集(整列的 5 个行框), 再把内容**整体平移**到留白处 —— 于是四边留白是同一个数算出来的,
// 与内容缩到多大无关(手写画布宽高会在内容变化时留出一大片空)。
const INK = bounds(col.rects)!;
const W = round1(INK.w + 2 * CANVAS_PAD);
const H = round1(INK.h + 2 * CANVAS_PAD);
const O: Pt = { x: round1(CANVAS_PAD - INK.x), y: round1(CANVAS_PAD - INK.y) };

const rows = STEPS.map((s, i) => {
  const r = col.rects[i];
  return listRowShape({ ...s, badgeSize: BADGE_SIZE, x: round1(r.x + O.x), y: round1(r.y + O.y) });
});

if (isMainModule(import.meta.url)) {
  // 自检(只走 stderr): 列齐 = 全列文本左缘同一个偏移(徽章直径取大就是为了它), 顺带量一眼自然宽
  const offsets = [...new Set(fits.map((f) => f.textOffset))];
  if (offsets.length !== 1) console.error('警告: 文本列不齐, textOffset =', offsets.join(' / '));
  if (W > NATURAL_MAX) console.error(`警告: 自然宽 ${W} > ${NATURAL_MAX} —— 进帖 / README 会被缩到读不动(QUICKREF「交付尺寸」)`);
  console.error(`徽章直径 ${BADGE_SIZE}px(全列取大) · 行高 ${fits.map((f) => f.h).join(' / ')} · 文本列偏移 ${offsets[0]}px · 画布 ${W}×${H}`);

  process.stdout.write(toSVG(svg(W, H, rows.map((r) => r.shape), {
    'font-family': 'ui-sans-serif, system-ui, "PingFang SC", sans-serif',
  })));
}
