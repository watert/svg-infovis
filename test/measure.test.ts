// =====================================================================
// measure 回归单测 · 字符单位表 + 估算尺寸
//
// 这份只钉宽度表本身的两层语义, 不测场景集成:
//   · textUnits 的**单位表**(半角 1 / 全角 2 + variation selector 改口径): 简化版
//     "ASCII 1 / CJK 2" 在这里会被逐条打脸 —— emoji 与全角标点都靠区间表
//   · measureText 的**折算**(单位 × 推进宽度 / 字距 / 字重 / 行盒高)与单调性
//
// 断言背后都是"改错了会静默通过"的口子: 混排量成单宽、VS16 被当第三单位、
// 空串抛错、更长的串反而变窄(负宽度类 bug)。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import {
  ADVANCE_PER_UNIT_EM,
  BOLD_ADVANCE_GAIN,
  ESTIMATE_SAFETY_FACTOR,
  LINE_HEIGHT_EM,
  measureText,
  textUnits,
} from '../src/knives/measure';

/** 按 units 加权的期望宽度: 单位表 × 推进宽度 × 字号, 再乘估算余量 */
const weightedWidth = (units: number, fontSize: number): number =>
  units * ADVANCE_PER_UNIT_EM * fontSize * ESTIMATE_SAFETY_FACTOR;

describe('measure · 字符宽度表与文本估算', () => {
  it('textUnits: ASCII 串按字符数线性 —— 一行每字符 1 单位', () => {
    expect(textUnits('')).toBe(0);
    expect(textUnits('a')).toBe(1);
    expect(textUnits('abcd')).toBe(4);
    expect(textUnits('a-b_1!')).toBe(6);
  });

  it('measureText: ASCII 宽度随字符数线性增长', () => {
    const o = { fontSize: 10 };
    const w1 = measureText('a', o).width;
    const w4 = measureText('abcd', o).width;
    // 4 倍字符 = 4 倍宽(round1 收口, 容差取 1 位小数)
    expect(w4 / w1).toBeCloseTo(4, 1);
    // 逐字符步长一致: 线性增长而不是随长度漂移
    const step = w1;
    expect(measureText('ab', o).width - w1).toBeCloseTo(step, 1);
    expect(measureText('abc', o).width - measureText('ab', o).width).toBeCloseTo(step, 1);
    expect(w4 - measureText('abc', o).width).toBeCloseTo(step, 1);
  });

  it('纯 CJK 串: ≈ 同长度 ASCII 的 2 倍(全角 = 2 单位)', () => {
    const o = { fontSize: 12 };
    expect(textUnits('中文字体')).toBe(8);
    const ascii4 = measureText('abcd', o).width;
    const cjk4 = measureText('中文字体', o).width;
    expect(cjk4 / ascii4).toBeCloseTo(2, 1);
    // 全角标点(U+FF0C)与表意空格(U+3000)同档
    expect(textUnits('，')).toBe(2);
    expect(textUnits('\u3000')).toBe(2);
  });

  it('中英混排: 介于纯 ASCII 与纯 CJK 之间, 且等于按 units 加权的结果', () => {
    const o = { fontSize: 12 };
    const mixed = measureText('中a文b', o); // 2 个全角 + 2 个半角
    expect(mixed.units).toBe(6);
    expect(mixed.width).toBeGreaterThan(measureText('abcd', o).width);
    expect(mixed.width).toBeLessThan(measureText('中文字体', o).width);
    // 混排不是"整串按单宽"也不是"整串按双宽": 逐字符加权
    expect(mixed.width).toBeCloseTo(weightedWidth(mixed.units, o.fontSize), 1);
  });

  it('variation selector: VS16 算 2 / VS15 算 1 / 裸 selector 跳过', () => {
    // ✈ + VS16(emoji 呈现)= 2 单位; ✈ + VS15(文本呈现)= 1 单位; 裸 ✈ = 1 单位(半角符号)
    expect(textUnits('\u2708\uFE0F')).toBe(2);
    expect(textUnits('\u2708\uFE0E')).toBe(1);
    expect(textUnits('\u2708')).toBe(1);
    // 裸 selector 自己不占宽
    expect(textUnits('\uFE0F')).toBe(0);
    expect(textUnits('\uFE0E')).toBe(0);
    expect(measureText('\uFE0F', { fontSize: 12 }).width).toBe(0);
    // VS16 改的是**前一个基字**的口径: 连 'a' 这种半角基字也跟着变成 2 单位
    expect(textUnits('a\uFE0F')).toBe(2);
    expect(textUnits('a\uFE0E')).toBe(1);
    // 全角基字 + VS16 仍是 2, 不许算成 3(基字已在区间表里, 再加一次就量宽一倍多)
    expect(textUnits('\u2B50\uFE0F')).toBe(2);
    expect(textUnits('\u{1F680}\uFE0F')).toBe(2);
    // VS16 不只是"跳过一位": 它把基字的推进从半角改成全角('a✈' → 'a✈️' 多 1 单位)
    expect(measureText('a\u2708\uFE0F', { fontSize: 10 }).width).toBeCloseTo(weightedWidth(3, 10), 1);
  });

  it('区间表边界: 半角片假名 / 半角标点不在全角表内(不是整个 FF 块都算宽)', () => {
    expect(textUnits('\uFF71')).toBe(1); // ｱ 半角片假名 A
    expect(textUnits('\uFF0C')).toBe(2); // ，全角逗号
    expect(textUnits('\uFFE5')).toBe(2); // ￥ 全角货币符号
    expect(textUnits('\u{1F469}')).toBe(2); // 👩 增补平面 emoji
  });

  it('空串 / 单字符 / ZWJ 家族 emoji: 不抛异常且给数', () => {
    const o = { fontSize: 12 };
    expect(() => textUnits('')).not.toThrow();
    expect(() => measureText('', o)).not.toThrow();
    expect(measureText('', o)).toEqual({ width: 0, height: measureText('a', o).height, units: 0 });
    expect(textUnits('a')).toBe(1);
    // ZWJ 家族 emoji: 三个码点各自计宽(ZWJ 不落区间表 → 1), 共 5 单位。
    // 比屏幕上的"一个方块"宽 —— 方向与前文表尾注释一致(宁宽不窄), 与 Archify 实测同值。
    const family = '\u{1F469}\u200D\u{1F4BB}';
    expect(() => measureText(family, o)).not.toThrow();
    expect(textUnits(family)).toBe(5);
    expect(measureText(family, o).width).toBeGreaterThan(0);
  });

  it('单调性: 更长的串不更窄(units 与 width 都非递减)', () => {
    const o = { fontSize: 12 };
    const ladder = ['', 'a', 'ab', 'aB', 'aB中', 'aB中文', 'aB中文🚀', 'aB中文🚀中'];
    const widths = ladder.map((s) => measureText(s, o).width);
    const units = ladder.map((s) => textUnits(s));
    for (let i = 1; i < ladder.length; i += 1) {
      expect(units[i]).toBeGreaterThanOrEqual(units[i - 1]);
      expect(widths[i]).toBeGreaterThanOrEqual(widths[i - 1]);
    }
  });

  it('height 只由字号决定, 与文本内容无关', () => {
    const o = { fontSize: 12 };
    expect(measureText('', o).height).toBe(measureText('中文字体🚀', o).height);
    expect(measureText('中文字体🚀', o).height).toBeCloseTo(12 * LINE_HEIGHT_EM * ESTIMATE_SAFETY_FACTOR, 1);
    // 换字号才换高
    expect(measureText('a', { fontSize: 24 }).height).toBeGreaterThan(measureText('a', o).height);
  });

  it('weight: 600 及以上按粗体加宽(估宽只增不减)', () => {
    const o = { fontSize: 10 };
    const normal = measureText('abcd', o).width;
    const semibold = measureText('abcd', { ...o, weight: 600 }).width;
    const bold = measureText('abcd', { ...o, weight: 700 }).width;
    // 600 与 700 同一档(阈值 600), 都严格宽于常规
    expect(semibold).toBe(bold);
    expect(bold).toBeGreaterThan(normal);
    expect(bold / normal).toBeCloseTo(1 + BOLD_ADVANCE_GAIN, 2);
    // 300(light) 走常规档, 不加宽
    expect(measureText('abcd', { ...o, weight: 300 }).width).toBe(normal);
    // 字重不影响高度
    expect(measureText('abcd', { ...o, weight: 700 }).height).toBe(measureText('abcd', o).height);
  });

  it('letterSpacing: 逐渲染字符累加, 裸 selector 不占字距', () => {
    const o = { fontSize: 10 };
    const base = measureText('ab', o).width;
    const spaced = measureText('ab', { ...o, letterSpacing: 2 }).width;
    // 2 个渲染字符 × 2px = +4px(两次 round1 收口, 容差取 0.5px)
    expect(spaced - base).toBeCloseTo(4 * ESTIMATE_SAFETY_FACTOR, 0);
    expect(spaced).toBeGreaterThan(base);
    // 裸 selector 不占字距槽: 'a' + VS16 只多算 1 份字距(selector 若也占槽这里会翻倍)
    const vsPlain = measureText('a\uFE0F', o).width;
    const vsSpaced = measureText('a\uFE0F', { ...o, letterSpacing: 2 }).width;
    expect(vsSpaced - vsPlain).toBeCloseTo(2 * ESTIMATE_SAFETY_FACTOR, 1);
  });
});
