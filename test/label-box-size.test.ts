// =====================================================================
// labelBoxSize · 遮罩片尺寸的**唯一来源** (260920 从 `edgeLabel` 拆出)
//
// 这个文件守的是一条**同源纪律**, 不是新的几何行为: "反算类调用方量到的宽高" 与 "上屏那块
// 遮罩片的宽高" 必须是同一个数。所以用例的形式全是**对照**(与 `edgeLabel` 对 / 与 `measureText` 对),
// 而不是"等于我抄在这个文件里的那个字面量" —— 后者在系数改动时只会跟着一起错。
//
// 由来: `templates/sequence.ts` 曾为算列距造一条 1px 假边喂 `edgeLabel` 再抠 `.width`。
// 拆分后那条假边没了, 本条对照就是它的回归守卫: 谁让两条路径漂开, 这里立刻红。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { LABEL_BOX_DEFAULTS, edgeLabel, labelBoxSize, labelAnchor } from '../src/shapes/edge';
import { measureText } from '../src/knives/measure';
import { ShapeInputError } from '../src/guard';
import { labelRect } from '../src/knives/audit';
// 多行口径(260923): 高度不再是"字号 + 2×padY"的近似, 而是真行块并集 —— 判据要跟它同源
import { rowBlock } from '../src/geometry/text-rows';
import { NODE_TEXT_LAYOUT } from '../src/shapes/node';

const edge = { id: 'e1', points: [{ x: 0, y: 0 }, { x: 120, y: 0 }] };

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
  it('尺寸 = 文本度量 + 两侧内边距(与 measureText 同源, 另加的那一项只有内边距)', () => {
    const m = measureText('写决策', { fontSize: LABEL_BOX_DEFAULTS.fontSize });
    const s = labelBoxSize('写决策');
    expect(s.width).toBe(Math.round((m.width + 2 * LABEL_BOX_DEFAULTS.padX) * 10) / 10);
    // 高 = **那个行盒高** + 两倍内边距(260923 起): 旧式 `fontSize + 2×padY` 按 1em 给高,
    // 而真行盒约 1.4em ⇒ 遮罩片比字矮, 连检测盒一起矮(净空门禁量的是矮的那块)
    expect(s.height).toBe(Math.round((m.height + 2 * LABEL_BOX_DEFAULTS.padY) * 10) / 10);
    expect(s.fontSize).toBe(LABEL_BOX_DEFAULTS.fontSize);
  });

  it('多行(260923): 宽取**最宽一行**、高走 `rowBlock` 并集 —— 与 textFit / 节点标签同一份堆法', () => {
    const content = 'route\nGET /v1/user/42';
    const lines = content.split('\n');
    const per = lines.map((t) => measureText(t, { fontSize: LABEL_BOX_DEFAULTS.fontSize }));
    const block = rowBlock(lines.length, LABEL_BOX_DEFAULTS.fontSize * NODE_TEXT_LAYOUT.lineGapEm, per.map((r) => r.height));
    const s = labelBoxSize(content);
    expect(s.width).toBe(Math.round((Math.max(...per.map((r) => r.width)) + 2 * LABEL_BOX_DEFAULTS.padX) * 10) / 10);
    expect(s.height).toBe(Math.round((block.height + 2 * LABEL_BOX_DEFAULTS.padY) * 10) / 10);
    // 两行必须真的比一行高(旧口径下"只按第一行算"会让两者同高)
    expect(s.height).toBeGreaterThan(labelBoxSize(lines[0]).height);
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
    // 宽只有内边距(空白量出 0), 高仍是那个行盒 —— 空串不是"没有行", 它是一行空字
    expect(s.height).toBe(Math.round((measureText('', { fontSize: LABEL_BOX_DEFAULTS.fontSize }).height + 2 * LABEL_BOX_DEFAULTS.padY) * 10) / 10);
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
