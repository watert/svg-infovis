// =====================================================================
// pack-spacing · 主轴间距三档参考卡: 缝(单值) / 逐项缝 / 节距
//
//   bun run examples/checks/pack-spacing.ts > /tmp/pack-spacing.svg
//
// `packCol` / `packRow` 的主轴间距有**两种口径、三种写法**, 而它们只差一个词、错法却看不出来
// (QUICKREF「版式原语怎么选」第 4 条):
//   · `gap`(缝)  —— 前一项的**尾**到后一项的**头**那段空档。缝是那个不变量, 节距 = 缝 + 盒高。
//   · `pitch`(节距) —— 前一项的**头**到后一项的**头**(前缘到前缘)。节距是那个不变量, 缝 = 节距 − 盒高。
//   · `gap` 还能给**数组**(逐项缝) —— 每一跳的缝各写各的, 长度必须 = 盒数 − 1。
//
// 三格用**同一组参差盒高**(46 / 64 / 46): 盒高不等, 两种口径立刻分道扬镳 ——
//   ① 恒缝 ⇒ 节距跟着盒高变(70·88·70);  ③ 恒节距 ⇒ 缝跟着盒高变(42·24·42)。
//   ② 逐项缝是 ① 的进阶: 缝本身逐项不同(24·56), 既不是恒缝也不是恒节距。
// 把"心里想的是缝还是节距"写对, 就是这张卡要教的那一件事 —— 写错时门禁看不出来(账面数字都有限)。
//
// 一条纪律与 `port-folds` 相同: **格内的相对盒坐标逐字相同**, 三格只换那一行 `pack` 调用;
// 每格下方那两行读数(缝 / 节距)一律从 `pack` 的 `rects` **现算**, 不手抄。
//
// 顶层是**纯几何**: 不打印、不写流, `import` 它拿 `scene` 是安全的(inspect / web 都能直接读)。
// 出口在 `isMainModule` 里(fail-closed, 判决落 exit code) —— 与 `port-folds` 同一份姿势。
// =====================================================================

import {
  type Pt, type Rect, type Scene, type SceneText, type Tone,
  THEMES, grid, packCol, rectBottom, rectRight, round1, textFit,
} from '../../src/index';
import { runScene } from '../../scripts/runner';
import { isMainModule } from '../../src/runtime';

const theme = THEMES.paper;

// --- 版式: 盒高参差是**故意的**(两种口径的差异只有盒高不等等时才显形) -----------

const PAD = 32;
const HEAD_H = 96;          // 顶部标题 + 说明两行, 与格顶留 16px
const TITLE_ZONE = 68;      // 格顶 → 首盒顶: 装口径名 + 口径写法 + 一行读数
const BOX_W = 240;
const HEIGHTS = [46, 64, 46] as const;
const ITEMS = HEIGHTS.map((h) => ({ w: BOX_W, h }));

// --- 作者决策: 三个口径的旋钮值 ----------------------------------------------

const SEAM = 24;            // ① 恒缝
const SEAMS = [24, 56];     // ② 逐项缝(长度 = 盒数 − 1)
const PITCH = 88;           // ③ 恒节距

const MUTED = '#64748b';    // 次级文字(主题没有"弱化"槽; 与 port-folds 同一档)
const TITLE_SIZE = 12, CAPTION_SIZE = 10.5, HEAD_SIZE = 17, DESC_SIZE = 12;

/** 三格: 同一组盒、同一套相对坐标, 只有那一行 `pack` 调用不同 */
const colDefs = [
  { tone: 'blue' as Tone, title: '① gap: 单值(缝恒定)', spec: `gap: ${SEAM}`, pack: packCol({ items: ITEMS, gap: SEAM, x: 0, y0: TITLE_ZONE, align: 'start' }) },
  { tone: 'emerald' as Tone, title: '② gap: 逐项缝', spec: `gap: [${SEAMS.join(', ')}]`, pack: packCol({ items: ITEMS, gap: SEAMS, x: 0, y0: TITLE_ZONE, align: 'start' }) },
  { tone: 'amber' as Tone, title: '③ pitch: 节距恒定', spec: `pitch: ${PITCH}`, pack: packCol({ items: ITEMS, pitch: PITCH, x: 0, y0: TITLE_ZONE, align: 'start' }) },
];

// --- 读数: 缝与节距都从摆好的 `rects` 现算, 不手抄 ---------------------------

/** 缝序列: 前一项尾 → 后一项头 */
const gapsOf = (rs: readonly Rect[]): number[] => rs.slice(1).map((r, i) => round1(r.y - (rs[i].y + rs[i].h)));
/** 节距序列: 前一项头 → 后一项头(前缘到前缘) */
const pitchesOf = (rs: readonly Rect[]): number[] => rs.slice(1).map((r, i) => round1(r.y - rs[i].y));

// --- 排格: 三格横排, 格位走 `grid`(格内仍是同一套相对坐标) --------------------

const CELL_W = BOX_W;
const CELL_H = Math.max(...colDefs.map((c) => c.pack.bounds!.h));
const CELL_GAP_X = 96;      // 格间 > 格内最大缝(56), 三格才读得出是三格
const g = grid({ origin: { x: PAD, y: HEAD_H }, cols: 3, rows: 1, cell: { w: CELL_W, h: CELL_H }, gap: { x: CELL_GAP_X, y: 0 } });

// --- 组装 --------------------------------------------------------------------

/** 一行旁注: rect = 实测包围盒(渲染就在它里面对齐, 审计读同一份) */
const textAt = (id: string, x: number, y: number, content: string, o: { size: number; weight?: number; color?: string }): SceneText => {
  const fit = textFit({ content, fontSize: o.size, weight: o.weight });
  return { id, rect: { x, y, w: fit.w, h: fit.h }, text: content, fontSize: o.size, weight: o.weight, color: o.color };
};

/** 格内坐标 → 画布: 只做刚体平移(平移到格位) */
const shiftRect = (r: Rect, o: Pt): Rect => ({ x: r.x + o.x, y: r.y + o.y, w: r.w, h: r.h });

const nodes: Scene['nodes'] = [];
const texts: SceneText[] = [];

colDefs.forEach((c, i) => {
  const slot = g.cell(i, 0);
  const o: Pt = { x: slot.x, y: slot.y };
  c.pack.rects.forEach((r, k) => {
    nodes.push({ id: `c${i}r${k}`, rect: shiftRect(r, o), label: `h ${HEIGHTS[k]}`, fontSize: 12 });
  });
  texts.push(textAt(`t${i}`, o.x, o.y, c.title, { size: TITLE_SIZE, weight: 700, color: theme.tones[c.tone].text }));
  texts.push(textAt(`s${i}`, o.x, o.y + 20, c.spec, { size: CAPTION_SIZE, color: MUTED }));
  texts.push(textAt(`m${i}`, o.x, o.y + 38, `缝 ${gapsOf(c.pack.rects).join('·')} · 节距 ${pitchesOf(c.pack.rects).join('·')}`, { size: CAPTION_SIZE, color: MUTED }));
});

texts.push(textAt('head', PAD, PAD, '主轴间距三档: 缝 / 逐项缝 / 节距', { size: HEAD_SIZE, weight: 700 }));
texts.push(textAt('desc', PAD, PAD + 30, '同一组参差盒高(46 / 64 / 46): gap 恒缝 ⇒ 节距随盒高变; pitch 恒节距 ⇒ 缝随盒高变; 逐项缝就是 gap 的数组形态', { size: DESC_SIZE, color: MUTED }));

// 画布尺寸是**占位**(出口的 `fit: true` 会按内容重算): 格区右下各留一个 PAD
export const scene: Scene = { width: rectRight(g.bounds) + PAD, height: rectBottom(g.bounds) + PAD, nodes, edges: [], texts };

// --- 出口(fail-closed; 诊断走 stderr, 图走 stdout) ---------------------------

if (isMainModule(import.meta.url)) {
  runScene(scene, {
    level: 'showcase', theme, fit: true, title: '主轴间距三档 · 缝 / 逐项缝 / 节距',
    extra: colDefs.map((c) => `${c.title}: 缝 ${gapsOf(c.pack.rects).join('·')} / 节距 ${pitchesOf(c.pack.rects).join('·')}`),
  });
}
