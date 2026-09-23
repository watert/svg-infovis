// =====================================================================
// text_fit · 自由文本块按内容反算(构建期 helper)
//
// 重点与 `node-fit.test.ts` 同一条: **闭环** —— 算出来的 rect 必须与渲染逐字同源(行数 / 行心
// 偏移 / 锚点边), 按它摆到节点上方相切时门禁不响、压过 1px 就得报。
// 另一条是**口径收编**: 散在 examples 里的三套高度口径(`size×1.4` / `m.height` / `size×1.25`)
// 与"整串喂 measureText"那个坑, 这里都钉成可复算的断言。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { type Scene, SCENE_TEXT_DEFAULTS, audit } from '../src/knives/audit';
import { placeText, textFit, textNote } from '../src/knives/fit';
import { measureText } from '../src/knives/measure';
import { NODE_TEXT_LAYOUT } from '../src/shapes/node';
import { rowBlock } from '../src/geometry/text-rows';
import { type DText, type Descriptor, TEXT_ANCHORS, type TextAnchor, baselineY } from '../src/descriptor';
import { round1 } from '../src/geometry/vec';
import { sceneChildren } from '../src/export';
import { ShapeInputError } from '../src/guard';

const FS = SCENE_TEXT_DEFAULTS.fontSize; // 11
/** 行距 / 行盒高一律现算 —— 常量变了要在这条链上被发现, 不抄字面量 */
const gapOf = (size: number) => size * NODE_TEXT_LAYOUT.lineGapEm;
const wOf = (t: string, size: number = FS, weight = 400) => measureText(t, { fontSize: size, weight }).width;
const hOf = (t: string, size: number = FS, weight = 400) => measureText(t, { fontSize: size, weight }).height;

const sc = (texts: Scene['texts'] = [], nodes: Scene['nodes'] = []): Scene =>
  ({ width: 400, height: 200, nodes, edges: [], texts });

const flat = (ds: readonly Descriptor[]): Descriptor[] =>
  ds.flatMap((d) => (d.kind === 'group' ? flat(d.children) : [d]));
const renderedTexts = (ds: readonly Descriptor[]): DText[] =>
  flat(ds).filter((d): d is DText => d.kind === 'text');
const overlaps = (texts: Scene['texts'], nodes: Scene['nodes']) =>
  audit(sc(texts, nodes)).diagnostics.filter((d) => d.code === 'text_overlap');

describe('text_fit · 按内容反算旁注块(与渲染同源)', () => {
  it('单行: 盒 = ceil(measureText) —— 审计读的与算出来的是同一把尺子', () => {
    const content = 'GHOST';
    const fit = textFit({ content });
    expect(fit.lines).toBe(1);
    expect(fit.contentW).toBe(wOf(content));
    expect(fit.contentH).toBe(hOf(content)); // 单行时行块并集 = 那个行盒高(不是 (n−1)×gap)
    expect([fit.w, fit.h]).toEqual([Math.ceil(wOf(content)), Math.ceil(hOf(content))]);
    expect(fit.lineWidths).toEqual([wOf(content)]);
  });

  it('多行: 宽取最宽一行、高走 rowBlock 并集 —— 钉住"整串当一行"那个坑', () => {
    const content = 'A\nWIDER LINE\nBB';
    const lines = content.split('\n');
    const fit = textFit({ content });
    expect(fit.lines).toBe(3);
    expect(fit.lineWidths).toEqual(lines.map((l) => wOf(l)));
    expect(fit.contentW).toBe(Math.max(...lines.map((l) => wOf(l))));
    expect(fit.contentH).toBe(rowBlock(3, gapOf(FS), lines.map((l) => hOf(l))).height);
    // 反面: 整串喂 `measureText`(它明写不拆 `\n`)量到的是"所有行拼成一行"的宽, 与本刀无关
    expect(fit.contentW).not.toBe(wOf(content));
    // 三行的盒必须真的比一行高 —— 旧口径(整串当一行)下这两者几乎相等
    expect(fit.contentH).toBeGreaterThan(hOf('A'));
  });

  it('渲染闭环: 行数 / 行心偏移 / 锚点边与 sceneChildren 逐字同源, 且墨迹必在盒内', () => {
    const content = 'one\ntwo\nthree';
    const fit = textFit({ content, anchor: 'start' });
    const note = textNote({ id: 't', content, anchor: 'start', at: { x: 120, y: 80 } });
    const rendered = renderedTexts(sceneChildren(sc([note])));
    expect(rendered.length).toBe(fit.lines);

    const offsets = rowBlock(fit.lines, gapOf(FS)).offsets;
    const midY = round1(note.rect.y + note.rect.h / 2);
    rendered.forEach((t, i) => {
      expect(t.x).toBe(note.rect.x); // start 锚: 文字左端落在盒左边
      // 渲染吐的是**基线 y**(`baselineY` 的 central 折算含 CJK 光学补偿 1.2px), 不是行心 ——
      // 与 `textShape` 逐字同源: 行心先 `round1` 收口, 再由 `textShape` 折算(这一步不该手抄一个 5.05)
      expect(t.y).toBe(baselineY(round1(midY + offsets[i]), FS, 'central'));
    });
    // 检测盒不小于墨迹(方向宁宽不窄) —— 否则就是"盒子比字窄而门禁看不出"
    expect(note.rect.w).toBeGreaterThanOrEqual(fit.contentW);
    expect(note.rect.h).toBeGreaterThanOrEqual(fit.contentH);
  });

  it('anchor 三向: rect 的哪条边落在锚点上(与 placeRect 的锚名一一对应)', () => {
    const fit = textFit({ content: 'x' });
    const at = { x: 100, y: 50 };
    for (const a of TEXT_ANCHORS) {
      const r = placeText({ ...fit, anchor: a }, at);
      const edge = a === 'start' ? r.x : a === 'end' ? r.x + r.w : r.x + r.w / 2;
      expect(edge).toBeCloseTo(at.x, 1); // round1 收口的残差 ≤0.05
      expect(r.y).toBe(round1(at.y - r.h / 2)); // 垂直一律取盒心
      expect([r.w, r.h]).toEqual([fit.w, fit.h]); // 落位不改尺寸
    }
  });

  it('缺省只从同一处取: 字号走 SCENE_TEXT_DEFAULTS、行距走 NODE_TEXT_LAYOUT, 没给的字段不落值', () => {
    const fit = textFit({ content: 'x' });
    expect([fit.fontSize, fit.weight, fit.anchor, fit.lineGap]).toEqual([FS, 400, 'middle', gapOf(FS)]);
    const note = textNote({ id: 'n', content: 'x', at: { x: 0, y: 0 } });
    // 缺省由渲染与 textFit 各自从同一处取 —— 多写一个 `weight: 400` 会让产物多一个属性
    expect([note.fontSize, note.weight, note.anchor, note.color, note.owner]).toEqual([undefined, undefined, undefined, undefined, undefined]);
    expect(note.rect).toEqual(placeText(fit, { x: 0, y: 0 }));
    // 显式给的就原样带上(与手写 SceneText 逐字一致)
    const given = textNote({ id: 'n2', content: 'x', at: { x: 0, y: 0 }, fontSize: 9, weight: 600, anchor: 'end', color: '#f00' });
    expect([given.fontSize, given.weight, given.anchor, given.color]).toEqual([9, 600, 'end', '#f00']);
    expect(given.rect.w).toBe(textFit({ content: 'x', fontSize: 9, weight: 600 }).w);
    // owner 是**透传**的语义声明: 它不许动几何(动了就是"渲染期自己落位", 违反冻结图哲学)
    const owned = textNote({ id: 'n3', content: 'x', at: { x: 0, y: 0 }, owner: { kind: 'edge', id: 'e1' } });
    expect(owned.owner).toEqual({ kind: 'edge', id: 'e1' });
    expect(owned.rect).toEqual(note.rect);
  });

  it('padding 是检测盒余量: 只撑大盒(门禁更保守), 不移动文字', () => {
    const content = 'x';
    const base = textFit({ content });
    const pad = textFit({ content, padding: [10, 4] });
    expect(pad.padding).toEqual([10, 4]);
    expect([pad.w, pad.h]).toEqual([Math.ceil(base.contentW + 20), Math.ceil(base.contentH + 8)]);
    expect(textFit({ content }).padding).toEqual([0, 0]); // 缺省贴住墨迹盒(旁注没有宽度门禁)
    // 盒变宽了 ⇒ `rect.x` 必然左移; 但**文字画在哪**只由锚点边/中心决定, 而那正是 `at` ——
    // 所以比对的是渲染出来的 x(渲染事实), 不是 rect.x(盒的几何)
    const at = { x: 100, y: 50 };
    const drawX = (fit: typeof base) =>
      renderedTexts(sceneChildren(sc([{ id: 'n', rect: placeText(fit, at), text: content, anchor: fit.anchor }])))[0].x;
    expect(placeText(pad, at).x).toBeLessThan(placeText(base, at).x);
    expect(drawX(pad)).toBe(drawX(base));
  });

  it('闭环: 按 fit 摆到节点上方相切时门禁不响, 压过 1px 就报 text_overlap', () => {
    const content = 'note line';
    const fit = textFit({ content });
    const node = { id: 'n', rect: { x: 100, y: 60, w: 120, h: 40 } };
    const top = 60 - fit.h / 2; // 盒底 = 节点顶(相切)
    const touching = textNote({ id: 't', content, at: { x: 160, y: top } });
    expect(overlaps([touching], [node])).toEqual([]);
    const pressed = textNote({ id: 't', content, at: { x: 160, y: top + 1 } });
    expect(overlaps([pressed], [node]).length).toBe(1);
  });

  it('畸形入参当场抛(空串 / 非字符串 / 非有限或非正的尺寸 / 词表外的 anchor)', () => {
    expect(() => textFit({ content: '' })).toThrow(ShapeInputError);
    expect(() => textFit({ content: 42 as unknown as string })).toThrow(ShapeInputError);
    expect(() => textFit({ content: 'x', fontSize: Number.NaN })).toThrow(ShapeInputError);
    expect(() => textFit({ content: 'x', fontSize: 0 })).toThrow(ShapeInputError);
    expect(() => textFit({ content: 'x', weight: Number.POSITIVE_INFINITY })).toThrow(ShapeInputError);
    expect(() => textFit({ content: 'x', padding: -1 })).toThrow(ShapeInputError);
    expect(() => textFit({ content: 'x', anchor: 'left' as unknown as TextAnchor })).toThrow(ShapeInputError);
    expect(() => placeText(textFit({ content: 'x' }), { x: Number.NaN, y: 0 })).toThrow(ShapeInputError);
  });
});
