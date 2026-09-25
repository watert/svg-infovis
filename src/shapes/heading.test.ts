// =====================================================================
// shapes/heading · 判据(标题层级 + 分隔线)
//
// 这个文件守三件事, 每件都对应一种真实的漂法:
//   ① **一处事实** —— 上屏的字号 / 字重 / 字距 / 墨色必须与量宽时吃的那份逐字同源
//      (`HEADING_LAYOUT` 三档), 否则又是"盒按 11 算、字按 22 画"那类老病
//   ② **块能接着排** —— 行盒的位置 / 缝 / 并集是 `headingGeometry` 的公开承诺:
//      作者拿 `.block` 去接下一个元素, 这里算出来的必须就是画出来的
//   ③ **遮罩片断口同源** —— 分隔线的居中标签断多宽, 走的是 `labelBoxSize`(边标签那块)
//      同一份公式, 不是本文件另算的一个断口
//
// 判据的形式尽量是**对照**(与 `measureText` 对 / 与 `labelBoxSize` 对), 而不是"等于我抄在这里的
// 那个字面量" —— 后者在系数改动时只会跟着一起错。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { type Descriptor, type DGroup, type DText, baselineY, svg } from '../descriptor';
import { toSVG } from '../serialize';
import { THEMES } from '../theme';
import { ShapeInputError } from '../guard';
import { fmt, rectCenter, round1 } from '../geometry/vec';
import { measureText } from '../knives/measure';
import { labelBoxSize } from './edge';
import { DIVIDER_LAYOUT, HEADING_LAYOUT, dividerShape, headingGeometry, headingShape } from './heading';

/** 拍平 descriptor 树(分隔线的标签盒是个 group, 要钻进去才读得到那块遮罩) */
function flatten(d: Descriptor): Descriptor[] {
  return d.kind === 'group' || d.kind === 'defs' || d.kind === 'pattern'
    ? [d, ...d.children.flatMap(flatten)]
    : [d];
}
const textsOf = (d: Descriptor): DText[] => flatten(d).filter((c): c is DText => c.kind === 'text');
const pathsOf = (d: Descriptor) => flatten(d).filter((c): c is Extract<Descriptor, { kind: 'path' }> => c.kind === 'path');

describe('shapes/heading · 标题层级 + 分隔线', () => {
  it('三档字号是**层级**(title > sub > kicker), 行盒宽高与 measureText 逐行同源', () => {
    const rows = headingGeometry({ x: 10, y: 20, kicker: 'SECTION 01', title: '把一张图读成信息', sub: '三档字号撑住第一眼' }).rows;
    expect(rows.map((r) => r.role)).toEqual(['kicker', 'title', 'sub']);
    const [k, t, s] = rows;
    expect(t.fontSize).toBeGreaterThan(s.fontSize);
    expect(s.fontSize).toBeGreaterThan(k.fontSize);
    for (const r of rows) {
      const m = measureText(r.text, { fontSize: r.fontSize, weight: r.weight, letterSpacing: r.letterSpacing });
      expect([r.rect.w, r.rect.h]).toEqual([m.width, m.height]);
    }
  });

  it('堆叠: 首行顶 = y, 相邻行的缝 = `HEADING_LAYOUT.rowGap`, block = 行盒并集', () => {
    const { rows, block } = headingGeometry({ x: 40, y: 30, kicker: 'K', title: 'T', sub: 'S' });
    expect(rows[0].rect.y).toBe(30);
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i].rect.y).toBe(round1(rows[i - 1].rect.y + rows[i - 1].rect.h + HEADING_LAYOUT.rowGap));
    }
    const last = rows[rows.length - 1];
    expect(block).toEqual({ x: 40, y: 30, w: Math.max(...rows.map((r) => r.rect.w)), h: round1(last.rect.y + last.rect.h - 30) });
  });

  it('对齐三档只动 x 不动 y: start 左端 / middle 中轴 / end 右端(缺省 = start)', () => {
    const base = { y: 40, kicker: 'K', title: 'TITLE', sub: 'sss' };
    const start = headingGeometry({ ...base, x: 100, align: 'start' });
    const mid = headingGeometry({ ...base, x: 100, align: 'middle' });
    const end = headingGeometry({ ...base, x: 100, align: 'end' });
    expect(headingGeometry({ ...base, x: 100 })).toEqual(start); // 缺省档
    expect(start.block.x).toBe(100);
    expect(start.rows[0].rect.x).toBe(100);
    // ⚠ 容差 0.05: `packCol` 把每项的 x 收口到 1 位小数(`round1`), 于是偶数宽的盒居中后
    // 可能差半个刻度 —— 这是堆叠器自己的取整口径, 不是"另外算了一个中心"
    for (const r of mid.rows) expect(Math.abs(r.rect.x + r.rect.w / 2 - 100)).toBeLessThanOrEqual(0.05);
    for (const r of end.rows) expect(Math.abs(r.rect.x + r.rect.w - 100)).toBeLessThanOrEqual(0.05);
    expect(mid.rows.map((r) => r.rect.y)).toEqual(start.rows.map((r) => r.rect.y));
  });

  it('上屏: 每行一个 `<text>`, 字号 / 字重 / 字距 / 墨色 / 基线全部取自同一份口径', () => {
    const p = { x: 40, y: 30, kicker: 'SECTION', title: '标题', sub: '说明' };
    const rows = headingGeometry(p).rows;
    const texts = textsOf(headingShape(p));
    expect(texts.length).toBe(rows.length);
    const theme = THEMES.light;
    rows.forEach((r, i) => {
      const t = texts[i];
      expect(t.content).toBe(r.text);
      expect(t.attrs?.['font-size']).toBe(r.fontSize);
      // 400 是 SVG 缺省 ⇒ 不上屏属性; 读的时候按同一个缺省补回来
      expect(t.attrs?.['font-weight'] ?? 400).toBe(r.weight);
      expect(t.attrs?.['letter-spacing']).toBe(r.letterSpacing);     // kicker 有字距, 其余 undefined
      expect(t.attrs?.fill).toBe(r.color);
      expect(t.x).toBe(r.rect.x);                                     // start 档: x 就是行盒左端
      expect(t.y).toBe(baselineY(rectCenter(r.rect).y, r.fontSize, 'central'));
      expect(t.attrs?.['text-anchor']).toBeUndefined();               // start 是 SVG 缺省, 不上屏
    });
    // 三档墨色的取值: kicker 走标签槽, 标题走主题最深的字色, 副标题走标签槽
    expect(rows[0].color).toBe(theme.label);
    expect(rows[1].color).toBe(theme.tones.slate.text);
    expect(rows[2].color).toBe(theme.label);
    // 字号就是那份常量(不是本文件另抄的数)
    expect(texts.map((t) => t.attrs?.['font-size'])).toEqual([HEADING_LAYOUT.kicker.fontSize, HEADING_LAYOUT.title.fontSize, HEADING_LAYOUT.sub.fontSize]);
  });

  it('kicker 吃 tone(只染 kicker), 主题从 `theme` 走 —— 三档墨色都是色调槽不是硬编码色值', () => {
    const paper = THEMES.paper;
    const rows = headingGeometry({ x: 0, y: 0, kicker: 'K', title: 'T', sub: 'S', tone: 'rose', theme: paper }).rows;
    expect(rows.map((r) => r.color)).toEqual([paper.tones.rose.text, paper.tones.slate.text, paper.label]);
    // 单点例外: titleColor 只顶标题那一行
    const overridden = headingGeometry({ x: 0, y: 0, kicker: 'K', title: 'T', sub: 'S', titleColor: '#b91c1c' }).rows;
    expect(overridden[1].color).toBe('#b91c1c');
    expect(overridden[2].color).toBe(THEMES.light.label);
  });

  it('`\\n` 是作者写下的换行(空行不占位): 逐行成行, 行序仍是 kicker → title → sub', () => {
    const rows = headingGeometry({ x: 0, y: 0, kicker: '', title: 'A\nB\n\nC', sub: '\n' }).rows;
    expect(rows.map((r) => r.text)).toEqual(['A', 'B', 'C']);
    expect(new Set(rows.map((r) => r.role))).toEqual(new Set(['title']));
  });

  it('行内标记走 `inlineTextRow`: 量宽认它, 画字也认它(同一份 run 表)', () => {
    // 拿副标题(400)验加宽: 标题缺省 700 本来就吃 `measureText` 的 `max(行字重, 600)` 那档,
    // `**粗**` 在它身上**不再额外加宽**(所以"标题加粗会变宽"是个假判据)
    const plain = headingGeometry({ x: 0, y: 0, title: 'T', sub: 'A B' });
    const bold = headingGeometry({ x: 0, y: 0, title: 'T', sub: 'A **B**' });
    expect(bold.rows[1].rect.w).toBeGreaterThan(plain.rows[1].rect.w);
    expect(textsOf(headingShape({ x: 0, y: 0, title: 'T', sub: 'A **B**' }))[1]?.spans?.length).toBe(2);
  });

  it('畸形入参当场抛: 空标题 / 写错的 align / 非有限坐标', () => {
    expect(() => headingShape({ x: 0, y: 0, title: '' })).toThrow(ShapeInputError);
    expect(() => headingGeometry({ x: 0, y: 0, title: '\n\n' })).toThrow(ShapeInputError);
    expect(() => headingShape({ x: 0, y: 0, title: 'T', align: 'centre' as never })).toThrow(ShapeInputError);
    expect(() => headingShape({ x: Number.NaN, y: 0, title: 'T' })).toThrow(ShapeInputError);
  });

  it('divider: 光板细线 = x .. x+w 的水平线, 且**没有**端点帽(线长就是 w)', () => {
    const paths = pathsOf(dividerShape({ x: 100, y: 60, w: 300 }));
    expect(paths.length).toBe(1);
    expect(paths[0].d).toBe(`M ${fmt(100)} ${fmt(60)} L ${fmt(400)} ${fmt(60)}`);
    expect(paths[0].attrs?.stroke).toBe(THEMES.light.groupStroke);
    expect(paths[0].attrs?.['stroke-width']).toBe(DIVIDER_LAYOUT.width);
    expect(paths[0].attrs?.['stroke-linecap']).toBeUndefined();
  });

  it('divider: 居中短标签的**断口** = `labelBoxSize`(与边标签同一份公式), 遮罩底色 = 画布色', () => {
    const g = dividerShape({ x: 100, y: 60, w: 300, label: '① 字号阶梯' });
    const size = labelBoxSize('① 字号阶梯', { padX: DIVIDER_LAYOUT.labelPadX });
    const box = flatten(g).find((c) => c.kind === 'rect');
    expect(box).toBeDefined();
    if (box?.kind !== 'rect') throw new Error('没找到标签遮罩片');
    expect([box.w, box.h]).toEqual([size.width, size.height]);
    expect(round1(box.x + box.w / 2)).toBe(250);                      // 居中(100 + 300/2)
    expect(round1(box.y + box.h / 2)).toBe(60);                       // 骑在线上
    expect(box.attrs?.fill).toBe(THEMES.light.canvas);                // 与画布同色 ⇒ 只剩"断开"这个本职
    expect(textsOf(g)[0]?.content).toBe('① 字号阶梯');
    // 铺在有底色的区块上时, 遮罩必须能跟着换色(否则留一块画布色补丁)
    expect(flatten(dividerShape({ x: 0, y: 0, w: 300, label: 'L', labelBg: '#fff7ed' })).find((c) => c.kind === 'rect')?.attrs?.fill).toBe('#fff7ed');
  });

  it('divider: tone 一处给全(线走描边槽 / 标签走文字槽)', () => {
    const g = dividerShape({ x: 0, y: 0, w: 200, tone: 'rose', label: 'R' });
    expect(pathsOf(g)[0]?.attrs?.stroke).toBe(THEMES.light.tones.rose.border);
    expect(textsOf(g)[0]?.attrs?.fill).toBe(THEMES.light.tones.rose.text);
  });

  it('divider: 加粗短段居中压在线上(线本身不被打断), 长度 = thick', () => {
    const paths = pathsOf(dividerShape({ x: 100, y: 60, w: 300, thick: 64 }));
    expect(paths.length).toBe(2);
    expect(paths[1].d).toBe(`M ${fmt(218)} ${fmt(60)} L ${fmt(282)} ${fmt(60)}`);
    expect(paths[1].attrs?.['stroke-width']).toBe(DIVIDER_LAYOUT.thickWidth);
    expect(paths[0].d).toBe(`M ${fmt(100)} ${fmt(60)} L ${fmt(400)} ${fmt(60)}`);
  });

  it('divider 的结构性错误当场抛: label 与 thick 同给 / 粗段比线长 / 长度非正 / w 非正', () => {
    expect(() => dividerShape({ x: 0, y: 0, w: 100, label: 'L', thick: 20 })).toThrow(ShapeInputError);
    expect(() => dividerShape({ x: 0, y: 0, w: 100, thick: 120 })).toThrow(ShapeInputError);
    expect(() => dividerShape({ x: 0, y: 0, w: 100, thick: 0 })).toThrow(ShapeInputError);
    expect(() => dividerShape({ x: 0, y: 0, w: 0 })).toThrow(ShapeInputError);
  });

  it('字节确定: 同输入两次拼出的 SVG 逐字节相同', () => {
    const build = (): string => toSVG(svg(400, 220, [
      headingShape({ x: 20, y: 20, kicker: 'K', title: '标题', sub: 'S' }),
      dividerShape({ x: 20, y: 150, w: 360, label: '分隔' }),
    ]));
    expect(build()).toBe(build());
  });

  it('返回的是 group(不是宽联合): 两个出口都能直接读 `.children`', () => {
    const head: DGroup = headingShape({ x: 0, y: 0, title: 'T' });
    const div: DGroup = dividerShape({ x: 0, y: 0, w: 10 });
    expect([head.attrs?.['data-shape'], div.attrs?.['data-shape']]).toEqual(['heading', 'divider']);
  });
});
