// =====================================================================
// shapes/stat · 大数字块的判据
//
// 钉四件事:
//   ① **盒与字同源** —— `statFit` 的宽高与 `statShape` 真画出去的 `<text>` 坐标必须对上同一份
//      算式(字号 / 字重 / 行距 / delta 标记尺寸全在 `STAT_TEXT_LAYOUT`)。断言里的期望值一律**现算**,
//      不抄字面量: 常量一动, 这里跟着动才是对账。
//   ② **delta 的折向是几何** —— 上 / 下是同一对点关于行心镜像, 不是两个字面字符。
//   ③ **约定可盖** —— 缺省色按方向取(`DELTA_TONES`), 而"降延迟是好事"这类反例一句话就能盖掉;
//      无方向则不画标记、也不染色。
//   ④ **坏输入当场抛** —— 折行 / 空数字 / 词表外的方向与 tone / NaN 盒, 一条都不许静默通过。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { DELTA_TONES, STAT_DELTA_DIRS, STAT_TEXT_LAYOUT, type StatDelta, statFit, statShape } from './stat';
import { measureText } from '../knives/measure';
import { rowBlock } from '../geometry/text-rows';
import { DEFAULT_THEME, THEMES } from '../theme';
import { ShapeInputError } from '../guard';
import { toSVG } from '../serialize';
import { type DGroup, type DPath, type DText, baselineY, svg } from '../descriptor';

const V = '1.2M';
const L = '月度调用';
const D: StatDelta = { text: '+18%', dir: 'up' };
const ORIGIN = { x: 40, y: 40 };

const textsOf = (g: DGroup): DText[] => g.children.filter((c): c is DText => c.kind === 'text');
const pathsOf = (g: DGroup): DPath[] => g.children.filter((c): c is DPath => c.kind === 'path');
/** 一行文字的锚点 x —— 与 `statShape` 同判据: 居中走 `text-anchor: middle` */
const xOf = (t: DText): number => t.x;

/** 期望值一律从**公开常量**现算(见文件头 ①) */
const valueW = (v: string) => measureText(v, { fontSize: STAT_TEXT_LAYOUT.valueFontSize, weight: STAT_TEXT_LAYOUT.valueWeight }).width;
const labelW = (l: string) => measureText(l, { fontSize: STAT_TEXT_LAYOUT.labelFontSize }).width;
const deltaW = (d: StatDelta) => {
  const t = measureText(d.text, { fontSize: STAT_TEXT_LAYOUT.deltaFontSize }).width;
  return d.dir
    ? STAT_TEXT_LAYOUT.deltaFontSize * STAT_TEXT_LAYOUT.markWidthEm + STAT_TEXT_LAYOUT.markGapX + t
    : t;
};
const rowW = (o: { value: string; delta?: StatDelta }) =>
  valueW(o.value) + (o.delta ? STAT_TEXT_LAYOUT.deltaGapX + deltaW(o.delta) : 0);
/** 行心距 + 行块偏移: 与渲染同一份堆法(`geometry/text-rows`), 但期望值在这里独立重算一次 */
const gap = (o: { valueFontSize?: number } = {}) =>
  (o.valueFontSize ?? STAT_TEXT_LAYOUT.valueFontSize) * STAT_TEXT_LAYOUT.labelGapEm;
const offsets = (n: number) => rowBlock(n, gap()).offsets;

/** 盒心 + 行心偏移 ⇒ 渲染该写的基线 y(折算层只有 `baselineY` 一处); `n` = 这块真画几行 */
const rowCy = (h: number, i: number, n = 2) => ORIGIN.y + h / 2 + offsets(n)[i];

const throws = (fn: () => unknown): ShapeInputError => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ShapeInputError);
    return e as ShapeInputError;
  }
  throw new Error('本该抛 ShapeInputError, 却没有');
};

const nums = (d: string): number[] => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

describe('shapes/stat · 大数字块(数字 + 标签 ± delta)', () => {
  it('statFit: 宽 = 最宽的**数字行**(含 delta 标记与间隙), 高 = 行块并集 —— 盒就是墨迹盒(无内边距)', () => {
    const f = statFit({ value: V, label: L, delta: D });
    const g = gap();
    const heights = [measureText(V, { fontSize: STAT_TEXT_LAYOUT.valueFontSize, weight: STAT_TEXT_LAYOUT.valueWeight }).height,
      measureText(L, { fontSize: STAT_TEXT_LAYOUT.labelFontSize }).height];
    expect(f.w).toBe(Math.ceil(rowW({ value: V, delta: D })));
    expect(f.h).toBe(Math.ceil(rowBlock(2, g, heights).height));
    // 逐行证据(便于对账"哪一行把它顶宽的")
    expect(f.valueWidth).toBe(valueW(V));
    expect(f.labelWidth).toBe(labelW(L));
    expect(f.deltaTextWidth).toBe(measureText(D.text, { fontSize: STAT_TEXT_LAYOUT.deltaFontSize }).width);
    expect(f.deltaWidth).toBe(deltaW(D));
    expect(f.valueRowWidth).toBe(rowW({ value: V, delta: D }));
    expect(f.contentW).toBe(Math.max(f.valueRowWidth, f.labelWidth));
    expect(f.rows).toBe(2);
    expect(f.lineGap).toBe(g);
    // 无标签 = 少一行(盒高随之变), 无 delta(none) = 数字行窄一截 —— 两处旋钮都得真起作用
    expect(statFit({ value: V }).rows).toBe(1);
    expect(statFit({ value: V }).h).toBeLessThan(f.h);
    expect(statFit({ value: V }).w).toBeLessThan(statFit({ value: V, delta: D }).w);
    // 标签窄于数字行 ⇒ 它**不参与**盒宽(盒宽取逐行最大, 不是把两行加起来)
    expect(f.labelWidth).toBeLessThan(f.valueRowWidth);
    expect(f.w).toBe(Math.ceil(f.valueRowWidth));
    // delta 无方向 ⇒ 不画标记 ⇒ 比有方向窄一个"标记 + 间隙"
    expect(statFit({ value: V, delta: { text: D.text } }).w)
      .toBe(Math.ceil(rowW({ value: V, delta: { text: D.text } })));
    expect(statFit({ value: V, delta: { text: D.text } }).deltaWidth).toBe(f.deltaTextWidth);
  });

  it('闭环: 渲染的行基线 = 盒心 + 行块偏移, 且最宽一行恰好顶满盒宽(盒不空也不溢出)', () => {
    const f = statFit({ value: V, label: L, delta: D });
    const g = statShape({ ...ORIGIN, w: f.w, h: f.h, value: V, label: L, delta: D });
    const [tValue, tDelta, tLabel] = textsOf(g);
    expect(textsOf(g).length).toBe(3); // 数字 / delta / 标签
    expect(tValue.y).toBe(baselineY(rowCy(f.h, 0), STAT_TEXT_LAYOUT.valueFontSize, 'central'));
    expect(tLabel.y).toBe(baselineY(rowCy(f.h, 1), STAT_TEXT_LAYOUT.labelFontSize, 'central'));
    expect(tDelta.y).toBe(baselineY(rowCy(f.h, 0), STAT_TEXT_LAYOUT.deltaFontSize, 'central'));
    // 左对齐(缺省): 数字贴盒左缘, delta 跟在其后, 标签另起一行
    expect(xOf(tValue)).toBe(ORIGIN.x);
    expect(xOf(tDelta)).toBe(ORIGIN.x + f.valueWidth + STAT_TEXT_LAYOUT.deltaGapX
      + STAT_TEXT_LAYOUT.deltaFontSize * STAT_TEXT_LAYOUT.markWidthEm + STAT_TEXT_LAYOUT.markGapX);
    expect(xOf(tLabel)).toBe(ORIGIN.x);
    // 最宽一行(数字行)恰好顶满盒宽 —— 拿 delta 文字右缘与盒右缘对账: 取整余量必然 < 1px
    const tDeltaRight = xOf(tDelta) + f.deltaTextWidth;
    expect(tDeltaRight).toBeLessThanOrEqual(ORIGIN.x + f.w);
    expect(tDeltaRight).toBeGreaterThan(ORIGIN.x + f.w - 1);
    // 单行块(无标签)的偏移只有一行、恒为 0
    const only = statShape({ ...ORIGIN, w: f.w, h: statFit({ value: V }).h, value: V });
    expect(textsOf(only).length).toBe(1);
    expect(textsOf(only)[0].y).toBe(baselineY(ORIGIN.y + statFit({ value: V }).h / 2, STAT_TEXT_LAYOUT.valueFontSize, 'central'));
  });

  it('delta 折向是几何: up / down 是同一对点关于**数字行心**的镜像, 不是两个字面字符', () => {
    const f = statFit({ value: V, delta: D });
    const box = { ...ORIGIN, w: f.w, h: f.h, value: V };
    const up = nums(pathsOf(statShape({ ...box, delta: { text: D.text, dir: 'up' } }))[0].d);
    const down = nums(pathsOf(statShape({ ...box, delta: { text: D.text, dir: 'down' } }))[0].d);
    const [ux, uy] = [up.filter((_, i) => i % 2 === 0), up.filter((_, i) => i % 2 === 1)];
    const [dx, dy] = [down.filter((_, i) => i % 2 === 0), down.filter((_, i) => i % 2 === 1)];
    // up: 尖在**上**(首个点), 底边两点同 y; down: 反过来
    expect(uy[0]).toBe(Math.min(...uy));
    expect(uy[1]).toBe(uy[2]);
    expect(dy[2]).toBe(Math.max(...dy));
    expect(dy[0]).toBe(dy[1]);
    // 镜像: 两串 y **取值集合**相同(上下缘对称), 尖的 x 也相同(x 序列 [尖, 左, 右] / [左, 右, 尖])
    const uniq = (xs: number[]) => [...new Set(xs)].sort((a, b) => a - b);
    expect(uniq(uy)).toEqual(uniq(dy));
    expect(uy.length).toBe(dy.length);
    expect(ux[0]).toBe(dx[2]);
    // 竖向上标记骑数字行心: 上下缘对称于 `rowCy(0)`(这一块只有一行 —— 没给标签)
    expect(Math.min(...uy) + Math.max(...uy)).toBeCloseTo(2 * rowCy(f.h, 0, 1), 6);
    // 标记是 path 而不是文字: 无方向的 delta 一个 path 都不出(只上文字)
    expect(pathsOf(statShape({ ...box, delta: { text: D.text } })).length).toBe(0);
  });

  it('delta 的色: 缺省按方向取文字槽(升 emerald / 降 rose), 作者能用 tone 盖掉, 无方向则中性不染', () => {
    const f = statFit({ value: V, delta: D });
    const box = { ...ORIGIN, w: f.w, h: f.h, value: V };
    const inkOf = (delta: StatDelta, theme = DEFAULT_THEME): string => {
      const g = statShape({ ...box, delta, theme, w: statFit({ value: V, delta }).w });
      const [tDelta] = textsOf(g).slice(1); // 0 = 数字
      return (tDelta.attrs ?? {}).fill as string;
    };
    for (const dir of STAT_DELTA_DIRS) {
      expect(inkOf({ text: D.text, dir })).toBe(DEFAULT_THEME.tones[DELTA_TONES[dir]].text);
    }
    // 反例是常态而非例外: 降延迟是好事 ⇒ 作者盖成 emerald(取的是**文字槽**, 不是边线那个 border 槽)
    expect(inkOf({ text: D.text, dir: 'down', tone: 'emerald' })).toBe(DEFAULT_THEME.tones.emerald.text);
    expect(inkOf({ text: D.text })).toBe(DEFAULT_THEME.tones.slate.text);
    // 主题换档跟着走(不是写死的色值)
    expect(inkOf({ text: D.text, dir: 'up' }, THEMES.dark)).toBe(THEMES.dark.tones.emerald.text);
    // 主数字同理: 缺省 slate 的文字槽, tone / color 各自可盖
    const g = statShape({ ...box, value: V, tone: 'blue' });
    expect((textsOf(g)[0].attrs ?? {}).fill).toBe(DEFAULT_THEME.tones.blue.text);
    expect((textsOf(statShape({ ...box, value: V, color: '#b91c1c' }))[0].attrs ?? {}).fill).toBe('#b91c1c');
    // 标签色取"小字槽"(与旁注 / 边标签同一处)
    expect((textsOf(g)[0].attrs ?? {})['font-size']).toBe(STAT_TEXT_LAYOUT.valueFontSize);
  });

  it('align 两档: 左对齐贴盒左缘, 居中时整块骑盒心(文字锚点随之换档)', () => {
    const f = statFit({ value: V, label: L, delta: D });
    const wide = { x: 40, y: 40, w: f.w + 120, h: f.h };
    const start = statShape({ ...wide, value: V, label: L, delta: D });
    const center = statShape({ ...wide, value: V, label: L, delta: D, align: 'center' });
    expect(xOf(textsOf(start)[0])).toBe(wide.x);
    expect((textsOf(start)[0].attrs ?? {})['text-anchor']).toBeUndefined();
    // 居中: 数字行整体(数字 + delta)骑盒心 ⇒ 数字的**文字中心**在块左缘 + 半个数字宽
    const rowLeft = wide.x + wide.w / 2 - f.valueRowWidth / 2;
    expect(xOf(textsOf(center)[0])).toBe(rowLeft + f.valueWidth / 2);
    expect((textsOf(center)[0].attrs ?? {})['text-anchor']).toBe('middle');
    // 标签按**自己**那一行的宽居中(不是跟着数字行)
    expect(xOf(textsOf(center)[2])).toBe(wide.x + wide.w / 2);
    // 盒宽 = 内容宽时两档同图(缺省档不留第二种可能): 居中的数字中心落在盒心, 左缘仍贴着盒左(差 ≤ 取整的 1px)
    const vf = statFit({ value: V });
    const tight = { ...ORIGIN, w: vf.w, h: vf.h, value: V };
    const centered = xOf(textsOf(statShape({ ...tight, align: 'center' }))[0]);
    expect(centered).toBe(tight.x + tight.w / 2);
    expect(centered - valueW(V) / 2).toBeCloseTo(tight.x, 0);
  });

  it('行内标记走 `shapes/inline` 那唯一一份上屏器: 认宽也认样式(粗体加宽 / tone 名解析成色值)', () => {
    const marked = '**月度**调用'; // 半段加粗 —— 整行都加粗时只会有一个 run, 拆不出两段来对账
    // 度量面认它(粗体那截 3% 加宽), 反算跟着宽
    expect(labelW(marked)).toBeGreaterThan(labelW(L));
    expect(statFit({ value: V, label: marked }).w).toBe(Math.ceil(Math.max(valueW(V), labelW(marked))));
    // 渲染面也认它: 标签拆成两个 run, 且纯文本内容守恒(`runs.join('') === 原文` 那条不变式)
    const g = statShape({ ...ORIGIN, w: statFit({ value: V, label: marked }).w, h: 60, value: V, label: marked });
    const tLabel = textsOf(g)[1]; // 0 = 数字
    expect(tLabel.spans?.length).toBe(2);
    expect(tLabel.content).toBe(L);
    expect(tLabel.spans?.[0].weight).toBe(600);
    expect(tLabel.spans?.[1].weight).toBe(400); // 标签基准字重是 400, 只有标记那截吃粗体档
    // 着色标记: `{tone 名}` 在渲染面对上主题的文字槽(Ink 的查表落在 inline 那一层, 不在这里重写一份)
    const tValue = textsOf(statShape({ ...ORIGIN, w: 200, h: 60, value: '[1.2M]{blue}' }))[0];
    expect(tValue.spans?.[0].attrs?.fill).toBe(DEFAULT_THEME.tones.blue.text);
    expect(statFit({ value: '[1.2M]{blue}' }).w).toBe(Math.ceil(valueW(V))); // 着色不改宽
  });

  it('坏输入当场抛: 折行 / 空数字 / 词表外的方向与 tone / 坏盒 —— 一条都不静默通过', () => {
    // 折行: 本块两行的行距口径不同, 折行必然排错 ⇒ 抛, 而不是折成一串
    expect(throws(() => statFit({ value: '1.2\nM' })).field).toBe('value');
    expect(throws(() => statFit({ value: V, label: '月度\n调用' })).field).toBe('label');
    expect(throws(() => statFit({ value: V, delta: { text: '+18%\n' } })).field).toBe('delta.text');
    expect(throws(() => statShape({ ...ORIGIN, w: 100, h: 60, value: '1.2\nM' })).shape).toBe('statShape');
    expect(throws(() => statFit({ value: '' })).field).toBe('value');
    expect(throws(() => statFit({ value: 12 as unknown as string })).field).toBe('value');
    // 词表: 方向 / tone / 对齐 (写错的词会静默回落 —— 比如 dir 写成 'sideways' 就少画一个标记)
    // `statFit` 只守**影响尺寸**的那几位(dir 决定标记占多宽); tone / align 是纯渲染槽, 归 `statShape`
    expect(throws(() => statFit({ value: V, delta: { text: '+1', dir: 'sideways' as never } })).field).toBe('delta.dir');
    expect(throws(() => statShape({ ...ORIGIN, w: 100, h: 60, value: V, delta: { text: '+1', tone: 'purple' as never } })).field).toBe('delta.tone');
    expect(throws(() => statShape({ ...ORIGIN, w: 100, h: 60, value: V, align: 'left' as never })).field).toBe('align');
    expect(throws(() => statShape({ ...ORIGIN, w: 100, h: 60, value: V, tone: 'purple' as never })).field).toBe('tone');
    // 盒: NaN / 负宽都是坏几何(与 `assertFiniteRect` 同一口径)
    expect(throws(() => statShape({ x: Number.NaN, y: 0, w: 10, h: 10, value: V })).field).toBe('x');
    expect(throws(() => statShape({ x: 0, y: 0, w: -10, h: 10, value: V })).field).toBe('w');
    expect(throws(() => statShape({ ...ORIGIN, w: 100, h: 60, value: V, valueFontSize: Number.NaN })).field).toBe('valueFontSize');
  });

  it('字节确定: 同输入逐字节同输出(禁 Date.now / Math.random 那一条的落地检查)', () => {
    const one = () => toSVG(svg(400, 200, [statShape({ ...ORIGIN, w: 200, h: 80, value: V, label: L, delta: D })]));
    expect(one()).toBe(one());
    expect(one()).toContain('data-shape="stat"');
    // 换个字号 / 换个主题必须真改字节(否则上面那条"相等"可能是"什么都没画"的假绿)
    const other = toSVG(svg(400, 200, [statShape({ ...ORIGIN, w: 200, h: 80, value: V, label: L, delta: D, valueFontSize: 24 })]));
    expect(other).not.toBe(one());
    expect(one()).not.toContain('NaN');
  });
});
