// =====================================================================
// blocks/pictogram · 图标阵列的判据
//
// 钉五件事:
//   ① **尺寸就是格子的算术** —— `pictogramFit` 的宽高必须等于"列 / 行数 × 边长 + 缝"(期望值现算,
//      不抄字面量); `cols` 不给 = 单行, 给了 = 网格; 末行不满**不改宽**(右缘由首排顶着, 不是拿末行算的)
//   ② **k 不改几何** —— 同一个阵列换 `filled` 只改字节, 一个坐标都不动(反比例尺口子: 染色数是颜色
//      不是尺寸, 所以 `pictogramFit` 的签名里压根没有 k)
//   ③ **块契约闭合** —— 逐格落位可对账(用一份 24×24 viewBox 的**合成素材**把坐标算死, 不依赖 lucide
//      具体路径), 且 `bounds` = 逐格并集 = 同一 `x` / `y` 下 `pictogramFit` 的 `{w, h}`
//   ④ **两档墨都取语义槽** —— 前 k 个走该 tone 的**实底槽**, 其余走 slate 的**描边槽**; 主题换档跟着走
//   ⑤ **坏输入当场抛** —— N / k / cols / 边长 / 缝 / tone 词表, 一条都不许静默通过
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { PICTOGRAM_LAYOUT, type PictogramProps, pictogramFit, pictogramShape } from './pictogram.js';
import { iconAsset, iconFromSvg } from '../src/icons/lucide.js';
import { DEFAULT_THEME, THEMES } from '../src/theme.js';
import { ShapeInputError } from '../src/guard.js';
import { toSVG } from '../src/serialize.js';
import { type DGroup, type DPath, svg } from '../src/descriptor.js';
import { round1, type Rect } from '../src/geometry/vec.js';

/** 两轴同值的旋钮袋(期望值一律从它现算 —— 常量一动, 这里跟着动才是对账) */
const D = PICTOGRAM_LAYOUT;

/**
 * 合成素材: 24×24 viewBox + 一根 (2,2)→(22,22) 的斜线。
 * 选它是因为 `size = 24` 时缩放比恰为 1 ⇒ 墨迹坐标 = 格位 + 素材坐标, 于是"第 i 个落在哪一格"
 * 能被算死; 换成 lucide 的真素材就只能反推它的路径了。
 */
const PROBE = iconFromSvg('<svg viewBox="0 0 24 24"><path d="M2 2 L22 22"/></svg>', 'probe');

/** 阵列里每个图标是一个 `<g data-shape="icon">`(iconShape 的产物原样嵌进来) */
const iconGroups = (g: DGroup): DGroup[] => g.children.filter((c): c is DGroup => c.kind === 'group');
const pathOf = (g: DGroup): DPath => {
  const c = g.children[0];
  if (c.kind !== 'path') throw new Error(`期望图标里第一笔是 path, 拿到 ${c.kind}`);
  return c;
};
const strokeOf = (g: DGroup): string => (g.attrs ?? {}).stroke as string;
const nums = (d: string): number[] => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

/** 第 i 个图标的格位 —— 独立重算一次格距公式(不调 `geometry/grid`, 否则只是把实现再跑一遍) */
const cellAt = (i: number, o: { x: number; y: number; cols: number; size: number; gapX: number; gapY: number }): Rect => ({
  x: round1(o.x + (i % o.cols) * (o.size + o.gapX)),
  y: round1(o.y + Math.floor(i / o.cols) * (o.size + o.gapY)),
  w: o.size,
  h: o.size,
});

/** 逐格并集(测试里自己聚合一次, 与 `box.bounds` 对照) */
const unionOf = (rects: Rect[]): Rect => ({
  x: Math.min(...rects.map((r) => r.x)),
  y: Math.min(...rects.map((r) => r.y)),
  w: Math.max(...rects.map((r) => r.x + r.w)) - Math.min(...rects.map((r) => r.x)),
  h: Math.max(...rects.map((r) => r.y + r.h)) - Math.min(...rects.map((r) => r.y)),
});

const throws = (fn: () => unknown): ShapeInputError => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ShapeInputError);
    return e as ShapeInputError;
  }
  throw new Error('本该抛 ShapeInputError, 却没有');
};

const BOX = { x: 40, y: 60, total: 10, filled: 7, asset: PROBE, tone: 'blue' } as const satisfies PictogramProps;

describe('blocks/pictogram · ISOTYPE 图标阵列(N 与 k 由作者声明)', () => {
  it('pictogramFit: 宽 = 列数 × 边长 + 列缝, 高 = 行数 × 边长 + 行缝; 不给 cols = 单行', () => {
    const row = pictogramFit({ total: 10 });
    expect(row.cols).toBe(10); // 单行: 列数就是总数
    expect(row.rows).toBe(1);
    expect(row.w).toBe(10 * D.size + 9 * D.gapX);
    expect(row.h).toBe(D.size); // 单行不占行缝
    // 缺省旋钮读数与表同源(不是各自写一遍)
    expect([row.size, row.gapX, row.gapY]).toEqual([D.size, D.gapX, D.gapY]);

    const grid = pictogramFit({ total: 20, cols: 4 });
    expect([grid.cols, grid.rows]).toEqual([4, 5]);
    expect(grid.w).toBe(4 * D.size + 3 * D.gapX);
    expect(grid.h).toBe(5 * D.size + 4 * D.gapY);
    // 墨迹盒是**格子并集**: 少一列就少一个"边长 + 缝", 少一行同理(边界两档都得真起作用)
    expect(grid.w - pictogramFit({ total: 20, cols: 3 }).w).toBe(D.size + D.gapX);
    expect(grid.h - pictogramFit({ total: 16, cols: 4 }).h).toBe(D.size + D.gapY);

    // 末行不满**不改宽**: 6 个 4 列仍是 2 行 4 列宽(右缘由首排顶着, 不是拿末行算的)
    const partial = pictogramFit({ total: 6, cols: 4 });
    expect(partial.rows).toBe(2);
    expect(partial.w).toBe(4 * D.size + 3 * D.gapX);
    expect(partial.h).toBe(2 * D.size + D.gapY);

    // 旋钮逐个真起作用(边长 / 两条缝各给一个数, 期望值现算)
    const knobbed = pictogramFit({ total: 10, size: 40, gapX: 12, gapY: 20 });
    expect(knobbed.w).toBe(10 * 40 + 9 * 12);
    expect(knobbed.h).toBe(40);
    expect(pictogramFit({ total: 10, cols: 5, size: 40, gapX: 12, gapY: 20 }).h).toBe(2 * 40 + 20);
    // 缝可以贴紧(0 是合法的 —— 密铺)
    expect(pictogramFit({ total: 3, gapX: 0, gapY: 0 }).w).toBe(3 * D.size);
  });

  it('块契约闭合: 逐格落位可对账, bounds = 逐格并集 = 同一 x/y 下 pictogramFit 的 {w, h}', () => {
    const p = { x: 40, y: 60, total: 7, cols: 3, filled: 2, asset: PROBE } as const satisfies PictogramProps;
    const r = pictogramShape(p);
    const g = iconGroups(r.shape);
    expect(g.length).toBe(7); // 一个图标一笔不少(总数是画出来的, 不是声明的)
    expect(g.every((x) => (x.attrs ?? {})['data-shape'] === 'icon')).toBe(true);

    const cells = Array.from({ length: 7 }, (_, i) => cellAt(i, { ...p, size: D.size, gapX: D.gapX, gapY: D.gapY }));
    for (const [i, c] of cells.entries()) {
      // 素材 (2,2)→(22,22) 在 size = viewBox = 24 时缩放比 = 1 ⇒ 墨迹 = 格位 + 素材坐标
      const d = nums(pathOf(g[i]).d);
      expect(d).toEqual([c.x + 2, c.y + 2, c.x + 22, c.y + 22]);
    }
    // 落位就是格子: 第 i 个的左上角 = 首格 + ⌊i/cols⌋ 行 ⌊i%cols⌋ 列(阅读序从左到右逐行填)
    const first = nums(pathOf(g[0]).d);
    const fourth = nums(pathOf(g[3]).d); // 3 = 第 2 行第 1 个 → 往下一行, x 回到首列
    expect([first[0], fourth[0]]).toEqual([p.x + 2, p.x + 2]);
    expect(fourth[1] - first[1]).toBe(D.size + D.gapY);
    // 末行(第 3 行)只有一个图标: 第 7 个的 x 回到首列, 且它的右缘**没**顶到 bounds 右缘
    const seventh = nums(pathOf(g[6]).d);
    expect(seventh[0]).toBe(p.x + 2);
    expect(seventh[2]).toBeLessThan(r.bounds.x + r.bounds.w);
    // 第 3 个(首排末列)才顶到右缘 —— 这一条就是"末行不满不改宽"的几何证据
    expect(nums(pathOf(g[2]).d)[2]).toBe(r.bounds.x + r.bounds.w - (D.size - 22));

    // bounds = 逐格并集(测试自己聚合一份), 且与 fit 在同一 x/y 下的 {w, h} 逐位相同
    const ink = unionOf(cells);
    expect(r.bounds).toEqual(ink);
    const fit = pictogramFit({ total: 7, cols: 3 });
    expect([r.bounds.w, r.bounds.h]).toEqual([fit.w, fit.h]);
    expect([r.bounds.x, r.bounds.y]).toEqual([p.x, p.y]); // 盒从声明的左上角起, 不加内边距(= 墨迹盒)
    expect(r.bounds.y + r.bounds.h).toBe(cells[6].y + cells[6].h); // 末行的底就是盒的底
  });

  it('k 不改几何: 同一个阵列换 filled 只改字节, bounds 与每个坐标一字不动', () => {
    const base = pictogramShape(BOX);
    for (const k of [0, 1, BOX.total]) {
      const other = pictogramShape({ ...BOX, filled: k });
      expect(other.bounds).toEqual(base.bounds);
      // 逐格墨迹坐标全等 —— k 是颜色, 不进任何几何
      expect(iconGroups(other.shape).map((x) => pathOf(x).d)).toEqual(iconGroups(base.shape).map((x) => pathOf(x).d));
    }
    // 但**字节**必须变(否则上面那条"相等"可能是"什么都没画"的假绿)
    const at = (k: number): string => toSVG(svg(200, 120, [pictogramShape({ ...BOX, filled: k }).shape]));
    expect(at(3)).not.toBe(at(7));
    // k 的两端都合法: 全染 / 一个不染
    expect(iconGroups(pictogramShape({ ...BOX, filled: 0 }).shape).length).toBe(BOX.total);
    expect(iconGroups(pictogramShape({ ...BOX, filled: BOX.total }).shape).length).toBe(BOX.total);
  });

  it('两档墨取语义槽: 前 k 个走 tone 的实底槽, 其余走 slate 的描边槽(主题换档跟着走, 覆盖表可盖)', () => {
    const strokes = (p: PictogramProps, theme = DEFAULT_THEME): string[] =>
      iconGroups(pictogramShape({ ...p, theme }).shape).map(strokeOf);
    const inkOf = (tone: 'blue' | 'emerald') => DEFAULT_THEME.tones[tone].solidBg;
    const rest = DEFAULT_THEME.tones.slate.border; // outline 档的 stroke 就是 border 槽

    const s = strokes(BOX);
    expect(s.slice(0, BOX.filled).every((c) => c === inkOf('blue'))).toBe(true);
    expect(s.slice(BOX.filled).every((c) => c === rest)).toBe(true);
    // 缺省 tone = slate: 实底槽与描边槽在同一个族里, 仍分得开(阵列不该因为"没给肤色"糊成一片)
    expect(strokes({ ...BOX, tone: undefined }).slice(0, 2))
      .toEqual([DEFAULT_THEME.tones.slate.solidBg, DEFAULT_THEME.tones.slate.solidBg]);
    expect(DEFAULT_THEME.tones.slate.solidBg).not.toBe(rest);
    // 换 tone 只动染色那一档(淡态恒 slate)
    expect(strokes({ ...BOX, tone: 'emerald' })[0]).toBe(inkOf('emerald'));
    expect(strokes({ ...BOX, tone: 'emerald' }).at(-1)).toBe(rest);
    // 主题换档: 三档主题各取自己的槽(色值一个都没硬编码在本块里)
    for (const mode of ['light', 'dark', 'paper'] as const) {
      expect(strokes({ ...BOX, tone: 'emerald' }, THEMES[mode])[0]).toBe(THEMES[mode].tones.emerald.solidBg);
      expect(strokes({ ...BOX, tone: 'emerald' }, THEMES[mode]).at(-1)).toBe(THEMES[mode].tones.slate.border);
    }
    // 单点例外: 两个墨色各能盖掉(常规仍走 tone)
    const o = strokes({ ...BOX, inkColor: '#b91c1c', restColor: '#eeeeee' });
    expect(o.slice(0, BOX.filled)).toEqual(Array(BOX.filled).fill('#b91c1c'));
    expect(o.slice(BOX.filled)).toEqual(Array(BOX.total - BOX.filled).fill('#eeeeee'));
    // 描边宽度走素材单位(与 `iconShape` 同口径): 给一个数就真落到产物上
    const sw = iconGroups(pictogramShape({ ...BOX, strokeWidth: 1.5 }).shape)[0].attrs?.['stroke-width'];
    expect(sw).toBe(1.5); // 缩放比 = 1(size 24 = viewBox 24)⇒ 素材单位与像素同值
  });

  it('走真素材链: `iconAsset` 的产物直接喂得进来(构建期读盘的一次), 且字节确定', () => {
    const user = iconAsset('user'); // 素材名 → 纯数据; 块本身不碰 fs(见文件头)
    const p = { x: 0, y: 0, total: 10, filled: 7, asset: user, tone: 'blue' } as const satisfies PictogramProps;
    const one = (): string => toSVG(svg(400, 100, [pictogramShape(p).shape]));
    expect(one()).toBe(one()); // 逐字节相同(禁 Date.now / Math.random 那条的落地检查)
    expect(one()).toContain('data-shape="pictogram"');
    expect(one().match(/data-shape="icon"/g)?.length).toBe(10); // 十个图标 = 十份素材产物
    expect(one()).not.toContain('NaN');
    expect(one()).not.toContain('transform'); // 坐标全烘进产物, 没有 `<g transform>`
    // 阵列的墨迹盒与 fit 对得上(真素材与合成素材同一套格距, 与素材内容无关)
    expect(pictogramShape(p).bounds.w).toBe(pictogramFit({ total: 10 }).w);
  });

  it('坏输入当场抛: N / k / cols / 边长 / 缝 / tone 词表 —— 一条都不静默通过', () => {
    // N: 非正 / 非整数 / 非有限
    expect(throws(() => pictogramFit({ total: 0 })).field).toBe('total');
    expect(throws(() => pictogramFit({ total: -3 })).field).toBe('total');
    expect(throws(() => pictogramFit({ total: 2.5 })).field).toBe('total');
    expect(throws(() => pictogramFit({ total: Number.NaN })).field).toBe('total');
    expect(throws(() => pictogramFit({ total: undefined as unknown as number })).field).toBe('total');
    // k: 越界(两个方向) / 非整数 —— 静默 clamp 会让图上的数**看着对**
    expect(throws(() => pictogramShape({ ...BOX, filled: 11 })).field).toBe('filled');
    expect(throws(() => pictogramShape({ ...BOX, filled: -1 })).field).toBe('filled');
    expect(throws(() => pictogramShape({ ...BOX, filled: 1.5 })).field).toBe('filled');
    // cols: 0 / 比总数还大(那是"装不满的一行" = 单行) / 非整数
    expect(throws(() => pictogramFit({ total: 10, cols: 0 })).field).toBe('cols');
    expect(throws(() => pictogramFit({ total: 10, cols: 11 })).field).toBe('cols');
    expect(throws(() => pictogramFit({ total: 10, cols: 3.5 })).field).toBe('cols');
    // 尺寸旋钮: 边长为 0 / 为负, 缝为负 —— 都是"尺寸写反"; 缝给 0 合法(上面那条已钉)
    expect(throws(() => pictogramFit({ total: 4, size: 0 })).field).toBe('size');
    expect(throws(() => pictogramFit({ total: 4, size: -24 })).field).toBe('size');
    expect(throws(() => pictogramFit({ total: 4, gapX: -1 })).field).toBe('gapX');
    expect(throws(() => pictogramFit({ total: 4, gapY: Number.NaN })).field).toBe('gapY');
    // 词表: 写错的 tone 会静默回落成缺省肤色, 那正是"写了却不上屏"
    expect(throws(() => pictogramShape({ ...BOX, tone: 'purple' as never })).field).toBe('tone');
    // 盒: NaN 坐标拦在 shape 边界上(guard 那条"NaN 静默丢元素"的老病)
    expect(throws(() => pictogramShape({ ...BOX, x: Number.NaN })).field).toBe('x');
    expect(throws(() => pictogramShape({ ...BOX, y: undefined as unknown as number })).field).toBe('y');
    // 素材: 传名字字符串而不是 `iconAsset` 的产物 —— 由 `iconShape` 那一层当场拦下(本块不重写那条守卫)
    expect(throws(() => pictogramShape({ ...BOX, asset: 'user' as never })).shape).toBe('iconShape');
  });
});
