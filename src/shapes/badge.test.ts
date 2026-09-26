// =====================================================================
// shapes/badge · 判据(编号徽章 + 列表行)
//
// 这个文件守四件事, 每件都对应一种真实的漂法:
//   ① **反算与上屏同源** —— `badgeFit` / `listRowFit` 算出来的宽高, 必须与 `badgeShape` /
//      `listRowShape` 真画出去的那个圆、那几行字落在同一批数上(字号 / 字重 / 行距 / 缝全在
//      `BADGE_LAYOUT` 与 `NODE_TEXT_LAYOUT`)。期望值一律**现算**(`measureText` / `rowBlock` /
//      `toneStyle`), 不抄字面量 —— 常量一动, 这里跟着动才是对账。
//   ② **直径是紧解不是拍的系数** —— 字块四角必须落在"半径 − pad"的圈内, 且直径不小于下限。
//      这条是唯一能证伪"圆装不装得下那几个字"的判据(徽章不进任何净空门禁)。
//   ③ **行的可堆叠性** —— `listRowFit` 的返回面就是 `Size`, 喂 `packCol` 拿回的 rect 再
//      `listRowShape({...rect})`, 交出的 `bounds` 必须与那个 rect **逐位相同**(闭环)。
//   ④ **坏输入当场抛** —— NaN 坐标 / 负的缝与直径 / 词表外的 tone / 一行里一个字都没有,
//      一条都不许静默通过(徽章没有门禁, 拦不住就画到图外去了)。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { type Descriptor, type DGroup, type DText, baselineY, circle as dCircle, svg } from '../descriptor.js';
import { toSVG } from '../serialize.js';
import { DEFAULT_THEME, THEMES, type Theme, toneStyle } from '../theme.js';
import { ShapeInputError } from '../guard.js';
import { rowBlock } from '../geometry/text-rows.js';
import { packCol } from '../geometry/pack.js';
import { measureText } from '../knives/measure.js';
import { NODE_TEXT_LAYOUT } from './node.js';
import { BADGE_LAYOUT, badgeFit, badgeShape, listRowFit, listRowShape } from './badge.js';

const FS = BADGE_LAYOUT.fontSize;
const W = BADGE_LAYOUT.weight;

/** 拍平 descriptor 树(徽章是行里的一个 group, 要钻进去才读得到那个圆) */
function flatten(d: Descriptor | readonly Descriptor[]): Descriptor[] {
  const list = Array.isArray(d) ? d : [d as Descriptor];
  return list.flatMap((x) => (x.kind === 'group' ? [x, ...flatten(x.children)] : [x]));
}
const ofShape = (root: Descriptor, shape: string): DGroup[] =>
  flatten(root).filter((d): d is DGroup => d.kind === 'group' && d.attrs?.['data-shape'] === shape);
const texts = (root: Descriptor): DText[] => flatten(root).filter((d): d is DText => d.kind === 'text');
/** 行内**文本行** —— 行组的孩子就是 [徽章组, 文本行…], 徽章里那个字不在这一层(别把它数进来) */
const rowTexts = (g: DGroup): DText[] => g.children.filter((c): c is DText => c.kind === 'text');
const onlyCircle = (root: Descriptor) => {
  const c = flatten(root).filter((d) => d.kind === 'circle');
  expect(c).toHaveLength(1);
  return c[0] as ReturnType<typeof dCircle>;
};
/** 一行文本块高(与 `rowPlan` 同口径: 逐行 `measureText` 的行盒 + 单一行距) */
const blockH = (sizes: number[], gap: number): number =>
  rowBlock(sizes.length, gap, sizes.map((s) => measureText('x', { fontSize: s }).height)).height;

describe('badge · 编号徽章 + 列表行', () => {
  it('直径是外接圆的紧解: 四角落在呼吸圈内, 且不小于下限', () => {
    for (const content of ['5', '10', 'AB', '88']) {
      const f = badgeFit({ content });
      expect(f.contentW).toBe(measureText(content, { fontSize: FS, weight: W }).width);
      expect(f.size).toBe(Math.max(BADGE_LAYOUT.size, Math.ceil(Math.hypot(f.contentW, f.contentH) + 2 * f.pad)));
      // 四角到圆心的距离 ≤ 半径 − pad —— 这就是"装得下"的定义, 不靠肉眼看图
      expect(Math.hypot(f.contentW / 2, f.contentH / 2)).toBeLessThanOrEqual(f.r - f.pad + 1e-9);
    }
    // 内容越长圆越大(下限之上由内容说了算)
    expect(badgeFit({ content: '100' }).size).toBeGreaterThan(badgeFit({ content: '5' }).size);
    // 下限真的能顶住: 给小到不合理的 minSize 也抬到它
    expect(badgeFit({ content: '5', minSize: 40 }).size).toBe(40);
  });

  it('字块高走 rowBlock(多行), 不是 `字号 × 行数` 或整串当一行', () => {
    const two = badgeFit({ content: 'A\nB' });
    const one = badgeFit({ content: 'A' });
    const h = measureText('A', { fontSize: FS, weight: W }).height;
    expect(two.lines).toBe(2);
    expect(two.contentH).toBe(rowBlock(2, FS * NODE_TEXT_LAYOUT.lineGapEm, [h, h]).height);
    expect(two.size).toBeGreaterThan(one.size);
    // 无字 = 无字圆点: 字块为 0, 直径回到下限
    const dot = badgeFit({});
    expect([dot.lines, dot.contentW, dot.contentH]).toEqual([0, 0, 0]);
    expect(dot.size).toBe(BADGE_LAYOUT.size);
  });

  it('徽章上屏: 圆骑圆心, 字走 `central` 基线 —— 与反算同一批数', () => {
    const props = { cx: 100, cy: 50, content: '3', tone: 'blue' as const, variant: 'solid' as const };
    const g = badgeShape(props);
    const fit = badgeFit({ content: props.content });
    expect(g.attrs?.['data-shape']).toBe('badge');
    const c = onlyCircle(g);
    expect([c.cx, c.cy, c.r]).toEqual([100, 50, fit.size / 2]);
    const t = texts(g);
    expect(t).toHaveLength(1);
    expect([t[0].x, t[0].content]).toEqual([100, '3']);
    expect(t[0].y).toBe(baselineY(50, FS, 'central'));
    expect(t[0].attrs?.['font-size']).toBe(FS);
    expect(t[0].attrs?.['font-weight']).toBe(W);
    expect(t[0].attrs?.['text-anchor']).toBe('middle');
    // 多行: 行心按 `rowBlock` 偏移对称(与 `labelBoxShape` 同一种堆法)
    const two = texts(badgeShape({ ...props, content: 'A\nB' }));
    const off = rowBlock(2, FS * NODE_TEXT_LAYOUT.lineGapEm).offsets;
    expect(two.map((x) => x.y)).toEqual(off.map((o) => baselineY(50 + o, FS, 'central')));
    expect(two.map((x) => x.x)).toEqual([100, 100]);
  });

  it('色只走 `tone × variant` 两槽: 圆与字的取色都能对回 `toneStyle`', () => {
    const variants = ['outline', 'tint', 'solid'] as const;
    for (const theme of [THEMES.light, THEMES.dark, THEMES.paper] as Theme[]) {
      for (const variant of variants) {
        const st = toneStyle(theme, 'amber', variant);
        const g = badgeShape({ cx: 0, cy: 0, content: '7', tone: 'amber', variant, theme });
        expect([onlyCircle(g).attrs?.fill, onlyCircle(g).attrs?.stroke]).toEqual([st.fill, st.stroke]);
        expect(texts(g)[0].attrs?.fill).toBe(st.text);
      }
    }
    // 单点例外压过语义槽(少数例外才用), 且 tone 不给时走 slate
    const ex = badgeShape({ cx: 0, cy: 0, content: '7', fill: '#123456', textColor: '#abcdef' });
    expect([onlyCircle(ex).attrs?.fill, texts(ex)[0].attrs?.fill]).toEqual(['#123456', '#abcdef']);
    expect(onlyCircle(badgeShape({ cx: 0, cy: 0, content: '7' })).attrs?.fill)
      .toBe(DEFAULT_THEME.tones.slate.surface);
  });

  it('行的尺寸 = 徽章 + 缝 + 文本块, 高取两者之大(逐行给高, 所以列距用 gap)', () => {
    const fit = listRowFit({ badge: '4', label: '摆列: packCol', sub: '缝 / 节距二选一' });
    const badge = badgeFit({ content: '4' });
    const lw = measureText('摆列: packCol', { fontSize: NODE_TEXT_LAYOUT.fontSize, weight: NODE_TEXT_LAYOUT.weight }).width;
    const sw = measureText('缝 / 节距二选一', { fontSize: NODE_TEXT_LAYOUT.fontSize - NODE_TEXT_LAYOUT.subSizeDelta }).width;
    const textH = blockH([NODE_TEXT_LAYOUT.fontSize, NODE_TEXT_LAYOUT.fontSize - NODE_TEXT_LAYOUT.subSizeDelta],
      NODE_TEXT_LAYOUT.fontSize * NODE_TEXT_LAYOUT.lineGapEm);
    expect(fit.badgeSize).toBe(badge.size);
    expect(fit.textW).toBe(Math.max(lw, sw));
    expect(fit.textH).toBe(textH);
    expect(fit.lines).toBe(2);
    expect(fit.textOffset).toBe(fit.badgeSize + BADGE_LAYOUT.gap);
    expect([fit.w, fit.h]).toEqual([Math.ceil(badge.size + BADGE_LAYOUT.gap + Math.max(lw, sw)), Math.ceil(Math.max(badge.size, textH))]);
    // 只有一行时行高落回徽章直径(徽章比字块高)
    const one = listRowFit({ badge: '4', label: '复查: verify' });
    expect(one.lines).toBe(1);
    expect(one.h).toBe(Math.max(one.badgeSize, Math.ceil(one.textH)));
    // 作者声明的直径被照用(整列徽章要齐), 不给徽章字 = 无字圆点
    expect(listRowFit({ badgeSize: 30, label: 'x' }).badgeSize).toBe(30);
    expect(listRowFit({ label: 'x' }).badgeSize).toBe(BADGE_LAYOUT.size);
  });

  it('`listRowFit` 的返回直接喂 `packCol`: 行的 bounds 与那个 rect 逐位相同(闭环)', () => {
    const steps = [
      { badge: '1', label: '读宪章', sub: '红线 + 一处事实一处' },
      { badge: '2', label: '算盒' },
      { badge: '3', label: '出图', sub: '两行\n次文本' },
    ];
    const badgeSize = Math.max(...steps.map((s) => listRowFit(s).badgeSize));
    const fits = steps.map((s) => listRowFit({ ...s, badgeSize }));
    const col = packCol({ items: fits, gap: 16, x: 40, y0: 24 });
    const rows = steps.map((s, i) => listRowShape({ ...s, badgeSize, ...col.rects[i] }));
    expect(rows.map((r) => r.bounds)).toEqual(col.rects);
    // 三行左缘齐(align 缺省 start), 徽章圆心骑行心, 文本左缘 = 行左缘 + textOffset
    expect(rows.map((r) => r.bounds.x)).toEqual([40, 40, 40]);
    rows.forEach((r, i) => {
      expect(r.bounds.y).toBe(col.rects[i].y);
      expect(ofShape(r.shape, 'badge')).toHaveLength(1); // 一行恰一枚徽章
      const c = onlyCircle(r.shape);
      expect(c.cx).toBe(r.bounds.x + fits[i].badgeSize / 2);
      expect(c.cy).toBe(r.bounds.y + r.bounds.h / 2);
      expect(rowTexts(r.shape).map((t) => t.x)).toEqual(new Array(fits[i].lines).fill(r.bounds.x + fits[i].textOffset));
    });
    // 第三行给了两行次文本: 真画出来 1 主 + 2 次(与反算的行数一致), 行心按 rowBlock 偏移,
    // 字号逐行取自己的(**主行不是次行** 那条口径在这里同时被钉住)
    const third = rowTexts(rows[2].shape);
    const main = NODE_TEXT_LAYOUT.fontSize;
    const sub = main - NODE_TEXT_LAYOUT.subSizeDelta;
    expect(fits[2].lines).toBe(3);
    expect(third.map((t) => t.content)).toEqual(['出图', '两行', '次文本']);
    expect(third.map((t) => t.attrs?.['font-size'])).toEqual([main, sub, sub]);
    const off = rowBlock(3, main * NODE_TEXT_LAYOUT.lineGapEm).offsets;
    const cy = rows[2].bounds.y + rows[2].bounds.h / 2;
    expect(third.map((t) => t.y)).toEqual([main, sub, sub].map((size, i) => baselineY(cy + off[i], size, 'central')));
  });

  it('行文本的两档: 主文本走墨槽 + 标题字重, 次文本走小字槽 + 小两号 + 400', () => {
    const theme = THEMES.light;
    const { shape } = listRowShape({ x: 0, y: 0, badge: '1', label: '主文本', sub: '次文本', theme });
    const [label, sub] = rowTexts(shape);
    const main = NODE_TEXT_LAYOUT.fontSize;
    expect(label.attrs?.['font-size']).toBe(main);
    expect(label.attrs?.['font-weight']).toBe(NODE_TEXT_LAYOUT.weight);
    expect(label.attrs?.fill).toBe(theme.tones.slate.text);
    expect(sub.attrs?.['font-size']).toBe(main - NODE_TEXT_LAYOUT.subSizeDelta);
    expect(sub.attrs?.['font-weight']).toBeUndefined(); // 400 = SVG 缺省, 不写属性
    expect(sub.attrs?.fill).toBe(theme.label);
    // 单点例外只盖主文本色, 次文本仍守小字槽(语义不跟着跑)
    const ex = rowTexts(listRowShape({ x: 0, y: 0, badge: '1', label: '主', sub: '次', textColor: '#b91c1c' }).shape);
    expect([ex[0].attrs?.fill, ex[1].attrs?.fill]).toEqual(['#b91c1c', DEFAULT_THEME.label]);
  });

  it('行框是作者声明: 给了 w / h 就照用(整列等宽 / 等高), bounds 跟着走', () => {
    const row = listRowShape({ x: 10, y: 20, w: 300, h: 48, badge: '2', label: '短' });
    expect(row.bounds).toEqual({ x: 10, y: 20, w: 300, h: 48 });
    // 行框中心变了 ⇒ 徽章与文本跟着骑新中心(落位是行框的函数, 不是内容的)
    expect(onlyCircle(row.shape).cy).toBe(20 + 24);
    expect(rowTexts(row.shape)[0].y).toBe(baselineY(20 + 24, NODE_TEXT_LAYOUT.fontSize, 'central'));
    // 不给 w / h 时 bounds 就是反算值
    const auto = listRowShape({ x: 0, y: 0, badge: '2', label: '短' });
    const fit = listRowFit({ badge: '2', label: '短' });
    expect([auto.bounds.w, auto.bounds.h]).toEqual([fit.w, fit.h]);
  });

  it('坏输入当场抛: NaN / 负尺寸 / 词表外的 tone / 一行里一个字都没有', () => {
    expect(() => badgeShape({ cx: NaN, cy: 0, content: '1' })).toThrow(ShapeInputError);
    expect(() => badgeShape({ cx: 0, cy: 0, content: '1', size: -1 })).toThrow(ShapeInputError);
    expect(() => badgeShape({ cx: 0, cy: 0, content: '1', size: 0 })).toThrow(ShapeInputError);
    expect(() => badgeShape({ cx: 0, cy: 0, content: '1', tone: 'pink' as never })).toThrow(ShapeInputError);
    expect(() => badgeFit({ content: '1', minSize: -1 })).toThrow(ShapeInputError);
    expect(() => badgeFit({ content: '1', pad: -1 })).toThrow(ShapeInputError);
    expect(() => listRowFit({ label: 'x', gap: -1 })).toThrow(ShapeInputError);
    expect(() => listRowFit({ label: 'x', badgeSize: 0 })).toThrow(ShapeInputError);
    expect(() => listRowFit({ label: 'x', fontSize: NaN })).toThrow(ShapeInputError);
    // 空行: 只剩一个圆的行 = 漏了内容
    expect(() => listRowFit({ badge: '1' })).toThrow(ShapeInputError);
    expect(() => listRowShape({ x: 0, y: 0, badge: '1' })).toThrow(ShapeInputError);
    expect(() => listRowShape({ x: 0, y: 0, label: 'x', w: -5 })).toThrow(ShapeInputError);
  });

  it('产物字节确定且无 NaN', () => {
    const rows = ['1', '2'].map((badge, i) =>
      listRowShape({ x: 0, y: i * 40, badge, label: `第 ${badge} 步`, sub: 'note' }).shape);
    const doc = () => toSVG(svg(300, 120, rows));
    expect(doc()).toBe(doc());
    expect(doc()).not.toContain('NaN');
  });
});
