// =====================================================================
// labelBoxSize · 遮罩片尺寸的**唯一来源** (260920 从 `edgeLabel` 拆出)
//
// 这个文件守的是一条**同源纪律**, 不是新的几何行为: "反算类调用方量到的宽高" 与 "上屏那块
// 遮罩片的宽高" 必须是同一个数。所以用例的形式全是**对照**(与 `edgeLabel` 对 / 与 `measureText` 对),
// 而不是"等于我抄在这个文件里的那个字面量" —— 后者在系数改动时只会跟着一起错。
//
// 由来: `templates/sequence.ts` 曾为算列距造一条 1px 假边喂 `edgeLabel` 再抠 `.width`。
// 拆分后那条假边没了, 本条对照就是它的回归守卫: 谁让两条路径漂开, 这里立刻红。
//
// ⚠ 260925 起这一对数字**分道**了(最容易读错的一点): **宽**走 `measureText`(宁宽不窄),
// **高**走墨迹口径 `MASK_ROW_INK_EM`(1.15em, 只盖住字)。所以下面凡"与 measureText 同源"的
// 判据都只对**宽**成立; 高度的判据一律另外写清楚它吃的是哪个口径。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { LABEL_BOX_DEFAULTS, MASK_ROW_INK_EM, edgeLabel, labelBoxSize, labelAnchor } from '../src/shapes/edge';
import { ESTIMATE_SAFETY_FACTOR, measureText } from '../src/knives/measure';
import { ShapeInputError } from '../src/guard';
import { labelRect } from '../src/knives/audit';
// 多行口径(260923): 高度是**行块并集**而不是"字号 + 2×padY"的近似 —— 判据要跟它同源。
// 行高(260925)取**墨迹**口径: 堆法仍是 `rowBlock`, 只把每行的高度从 1.4em 行盒换成 1.15em 墨迹
import { rowBlock } from '../src/geometry/text-rows';
import { NODE_TEXT_LAYOUT } from '../src/shapes/node';

const edge = { id: 'e1', points: [{ x: 0, y: 0 }, { x: 120, y: 0 }] };
/** 遮罩的**墨迹行高**(与 `labelBoxSize` 同式, 只抄那一式当作判据的另一端) */
const inkRow = (fontSize: number) => Math.round(fontSize * MASK_ROW_INK_EM * ESTIMATE_SAFETY_FACTOR * 10) / 10;

/** 取出守卫抛的那个错(与 guard.test.ts 同法: 断言"抛的是哪一种 + 说清了哪个字段") */
const guardErr = (fn: () => unknown): ShapeInputError => {
  try {
    fn();
  } catch (e) {
    if (e instanceof ShapeInputError) return e;
    throw e;
  }
  throw new Error('本该抛 ShapeInputError, 却没抛 —— 守卫漏了');
};

describe('labelBoxSize · 遮罩片尺寸的唯一来源', () => {
  it('尺寸 = 文本宽 + 两侧内边距(与 measureText 同源), 高走**墨迹行高** + 两侧内边距', () => {
    const m = measureText('写决策', { fontSize: LABEL_BOX_DEFAULTS.fontSize });
    const s = labelBoxSize('写决策');
    // 宽仍是 `measureText` 的那一份(宁宽不窄), 多出来的只有内边距
    expect(s.width).toBe(Math.round((m.width + 2 * LABEL_BOX_DEFAULTS.padX) * 10) / 10);
    // 高**不**取 `m.height`: 那是 1.4em 的排版行盒(服务多行 pitch), 含上下各 ~0.2em 空白;
    // 遮罩只需盖住墨迹(1.15em), 单行 11 号因此从 19.6(行盒口径 + padY 2) 收到 14.8
    expect(s.height).toBe(Math.round((inkRow(LABEL_BOX_DEFAULTS.fontSize) + 2 * LABEL_BOX_DEFAULTS.padY) * 10) / 10);
    expect(s.height).toBeLessThan(m.height); // 造一个"盒比行盒矮"的显式信号: 这是有意的口径分道
    expect(s.fontSize).toBe(LABEL_BOX_DEFAULTS.fontSize);
  });

  it('多行(260923/260925): 宽取**最宽一行**、高走 `rowBlock` 并集(墨迹行高) = (n−1)×gap + 墨迹高', () => {
    const content = 'route\nGET /v1/user/42';
    const lines = content.split('\n');
    const gap = LABEL_BOX_DEFAULTS.fontSize * NODE_TEXT_LAYOUT.lineGapEm;
    const block = rowBlock(lines.length, gap, lines.map(() => inkRow(LABEL_BOX_DEFAULTS.fontSize)));
    const s = labelBoxSize(content);
    expect(s.width).toBe(Math.round((Math.max(...lines.map((t) => measureText(t, { fontSize: LABEL_BOX_DEFAULTS.fontSize }).width)) + 2 * LABEL_BOX_DEFAULTS.padX) * 10) / 10);
    expect(s.height).toBe(Math.round((block.height + 2 * LABEL_BOX_DEFAULTS.padY) * 10) / 10);
    // 两行必须真的比一行高(旧口径下"只按第一行算"会让两者同高)
    expect(s.height).toBeGreaterThan(labelBoxSize(lines[0]).height);
    // n 行的显式算式: (n−1)×gap + 墨迹高 —— 行距没跟着瘦, 所以行数一多"墨迹节省"被摊薄:
    // 两行 28.6 / 三行 42.3, 而不是一行的 3 倍
    const three = labelBoxSize('a\nb\nc');
    expect(three.height).toBe(Math.round((2 * gap + inkRow(LABEL_BOX_DEFAULTS.fontSize) + 2 * LABEL_BOX_DEFAULTS.padY) * 10) / 10);
    // 关键不变式: **行距 > 墨迹高** ⇒ 3 行盒子高 > 单行盒子的 3 倍里…… 逐行核: 行心间距 13.75
    // 大于墨迹 12.8, 所以相邻两行的墨迹**不重叠**(重叠就是字压在字上)
    expect(gap).toBeGreaterThan(inkRow(LABEL_BOX_DEFAULTS.fontSize));
  });

  it('**同源对照**: `edgeLabel` 上屏那块的宽高与 `labelBoxSize` 逐字相等(单一来源的机器判据)', () => {
    for (const text of ['route', 'GET /v1/user/42', '这是一条很长的消息标签']) {
      const s = labelBoxSize(text);
      const lab = edgeLabel(edge, text);
      expect([lab.width, lab.height]).toEqual([s.width, s.height]);
      // audit 读的检测矩形就是这一份, 不许有第三个来源
      const r = labelRect(lab);
      expect([r.w, r.h]).toEqual([s.width, s.height]);
    }
  });

  it('空字符串得到合法的"只有内边距"的盒子 —— 不是 NaN(那个时代渲染器会把元素整个吞掉)', () => {
    const s = labelBoxSize('');
    expect(s.width).toBe(2 * LABEL_BOX_DEFAULTS.padX);
    // 宽只有内边距(空白量出 0), 高仍是**一行墨迹** —— 空串不是"没有行", 它是一行空字
    expect(s.height).toBe(Math.round((inkRow(LABEL_BOX_DEFAULTS.fontSize) + 2 * LABEL_BOX_DEFAULTS.padY) * 10) / 10);
    expect(Number.isFinite(s.width)).toBe(true);
  });

  it('显式 `at` 一给就不走 `labelAnchor`: 落位是作者给的数, 与折点无关', () => {
    const at = { x: 37, y: -12.5 };
    expect(edgeLabel(edge, 'miss', { at }).at).toEqual(at);
    // 不给 at 时仍是"折线长度中点 + 法线偏移"那套(老行为一字未改)
    expect(edgeLabel(edge, 'miss').at).toEqual(labelAnchor(edge.points, 0));
    expect(edgeLabel(edge, 'miss', { dy: 6 }).at).toEqual(labelAnchor(edge.points, 6));
  });

  it('守卫: 字号 / 内边距非有限, 或 `at` 不是 {x, y} 有限数 —— 当场抛且点名', () => {
    expect(guardErr(() => labelBoxSize('x', { fontSize: NaN })).field).toBe('fontSize');
    expect(guardErr(() => labelBoxSize('x', { padX: Infinity })).field).toBe('padX');
    expect(guardErr(() => labelBoxSize('x', { padY: Number.NaN })).shape).toBe('labelBoxSize');
    const bad = guardErr(() => edgeLabel(edge, 'x', { at: { x: 1, y: NaN } }));
    expect(bad.field).toBe('at.y');
    expect(bad.message).toContain('显式落位');
    expect(guardErr(() => edgeLabel(edge, 'x', { at: { x: undefined, y: 2 } as never })).field).toBe('at.x');
  });
});
