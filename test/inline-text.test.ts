// =====================================================================
// inline-text · 行内加粗标记(`**粗**`)的唯一一份解析
//
// 病灶(260920 卡片图): `Object Type: **Airport**` 里的 `**` 有两个消费者 —— 渲染面要把它拆成
// `<tspan>`、度量面(`label_fit` / `cardFit`)要按 run 加宽。两家各写一份解析, 结果就是
// "门禁量的宽度"与"画出来的宽度"是两串不同的字 —— 本仓最贵的那类事故。
//
// 本文件钉四件事(每条都是"把 bug 放回去会红"):
//   ① 拆 run 的**不变式**: 拼回恒等于去掉转义后的原文
//   ② 落单的 `**` 退回**字面量** —— 不许吞掉两个字符, 更不许把后半行悄悄变粗
//      (260920 初版真的会吞: `parseTextRuns('a ** b')` 得到 `[{text:'a '},{text:' b',bold:true}]`,
//       星号不见了、后半句变粗, 而文件头的注释与不变式都写着"落单的按字面量原样输出" —— 注释与
//       实现打架时, 错的是实现)
//   ③ 度量按 run 加宽, 且与"逐 run 手算"**同值**(不是"大约宽一点")
//   ④ 渲染面读同一份 run 表: 产物里那截走 `<tspan font-weight>`, 原串里没有星号;
//      无标记的老路径不挂 tspan(老产物字节不变)
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { type TextRun, needsTextParse, parseTextRuns, plainText } from '../src/geometry/inline-text';
import { ADVANCE_PER_UNIT_EM, BOLD_ADVANCE_GAIN, ESTIMATE_SAFETY_FACTOR, measureText } from '../src/knives/measure';
import { svg } from '../src/descriptor';
import { toSVG } from '../src/serialize';
import { nodeShape } from '../src/shapes/node';
import { round1 } from '../src/geometry/vec';

const FS = 12;
/** 粗体档(CSS 数值): 与 `measureText` 里那个私有阈值同档, 这里只作"该不该加宽"的判据 */
const BOLD = 600;

/**
 * 与 `measureText` **同式的独立复算**: 逐 run 累加推进, 粗体那几截乘 `(1 + 增益)`。
 * 单位数借 `measureText(...).units` 取(它是内容量、与字号无关), 但乘式与加宽判据在这里重写一遍 ——
 * 直接调 `measureText` 比宽度等于拿被测函数验证被测函数。
 */
const recompute = (runs: ReadonlyArray<readonly [string, number]>): number => {
  const em = runs.reduce(
    (acc, [text, weight]) =>
      acc + textUnits(text) * ADVANCE_PER_UNIT_EM * (weight >= BOLD ? 1 + BOLD_ADVANCE_GAIN : 1),
    0,
  );
  return round1(em * FS * ESTIMATE_SAFETY_FACTOR);
};

/** 字符单位数(半角 1 / 全角 2): 只由去标记后的文字决定 */
const textUnits = (t: string): number => measureText(t, { fontSize: FS }).units;

/** 一张卡片的节点(用来验渲染面) */
const cardSvg = (label: string, weight = 400): string =>
  toSVG(svg(400, 100, [
    nodeShape({ x: 10, y: 10, w: 300, h: 60, label, fontSize: FS, weight, align: 'start', padX: 10 }),
  ]));

describe('inline-text · 标记解析', () => {
  const TABLE: Array<[string, TextRun[]]> = [
    ['纯文本', [{ text: '纯文本', bold: false }]],
    ['Object Type: **Airport**', [
      { text: 'Object Type: ', bold: false },
      { text: 'Airport', bold: true },
    ]],
    ['**A** 与 **B**', [
      { text: 'A', bold: true },
      { text: ' 与 ', bold: false },
      { text: 'B', bold: true },
    ]],
    ['**重点**', [{ text: '重点', bold: true }]],
    // 落单: **原样留在文字里** —— 星号可见, 于是它自己暴露
    ['a ** b', [{ text: 'a ** b', bold: false }]],
    ['a**', [{ text: 'a**', bold: false }]],
    ['**', [{ text: '**', bold: false }]],
    // 三对里的最后一个落单: 前两对作数, 落单那段保持原样
    ['a **b** c **d', [
      { text: 'a ', bold: false },
      { text: 'b', bold: true },
      { text: ' c **d', bold: false },
    ]],
    // 转义: 反斜杠被吃掉, 星号留下; 且不参与标记配对
    ['a \\* b', [{ text: 'a * b', bold: false }]],
    ['a\\\\b', [{ text: 'a\\b', bold: false }]],
    ['\\*\\*x', [{ text: '**x', bold: false }]],
    ['', [{ text: '', bold: false }]],
  ];

  for (const [src, wanted] of TABLE) {
    it(`拆 run: ${JSON.stringify(src)}`, () => {
      expect(parseTextRuns(src)).toEqual(wanted);
    });
  }

  it('不变式: 拼回恰等于 `plainText` —— 于是按字数算的口径不必理解标记语法', () => {
    for (const [src] of TABLE) {
      const runs = parseTextRuns(src);
      expect(runs.map((r) => r.text).join('')).toBe(plainText(src));
    }
  });

  it('不变式落空的那一类: 落单标记若被当标记吃掉, 拼接就少两个字符(这是本文件存在的理由)', () => {
    // 反证: 若是"见到 ** 就 toggle"的实现, `'a ** b'` 的拼接会变成 `'a  b'`(少两个星号)
    const runs = parseTextRuns('a ** b');
    expect(runs.map((r) => r.text).join('')).toHaveLength('a ** b'.length);
    expect(runs.some((r) => r.bold)).toBe(false);
  });

  it('`needsTextParse` 把**转义**也算进来(只判星号的话 `a\\*b` 会被画成两个字符)', () => {
    expect(needsTextParse('plain')).toBe(false);
    expect(needsTextParse('a*b')).toBe(true);
    expect(needsTextParse('a\\b')).toBe(true);
  });
});

describe('inline-text · 度量与渲染同源', () => {
  it('度量按 run 加宽, 且与逐 run 手算同值', () => {
    const marked = measureText('Object Type: **Airport**', { fontSize: FS, weight: 400 });
    const bare = measureText('Object Type: Airport', { fontSize: FS, weight: 400 });
    expect(marked.width).toBe(recompute([['Object Type: ', 400], ['Airport', BOLD]]));
    expect(bare.width).toBe(recompute([['Object Type: Airport', 400]]));
    // 方向: 宁宽不窄 —— 粗体那截确实吃到了增益
    expect(marked.width).toBeGreaterThan(bare.width);
    // 字符数不变(标记不进字形流): 单位数只由去标记后的文字决定
    expect(marked.units).toBe(bare.units);
  });

  it('行字重已到粗体档时, 行内标记不再"二次加宽"(加宽是档位差, 不是叠加)', () => {
    // weight 600 下整行本来就是粗的 ⇒ 带标记与不带标记同宽
    const a = measureText('a **b** c', { fontSize: FS, weight: 600 });
    const b = measureText('a b c', { fontSize: FS, weight: 600 });
    expect(a.width).toBe(b.width);
    // 而 400 下两者必须不同 —— 否则上一条是"碰巧相等"
    expect(measureText('a **b** c', { fontSize: FS, weight: 400 }).width)
      .toBeGreaterThan(measureText('a b c', { fontSize: FS, weight: 400 }).width);
  });

  it('渲染面读同一份 run 表: 产物里走 `<tspan>`, 且不会漏出一个星号', () => {
    const out = cardSvg('Object Type: **Airport**', 400);
    expect(out).toContain('<tspan font-weight="400.00">Object Type: </tspan>');
    expect(out).toContain('<tspan font-weight="600.00">Airport</tspan>');
    expect(out).not.toContain('*');
  });

  it('行内粗体取 `max(行字重, 600)`: 行字重 700 时那截是 700(不降级)', () => {
    const out = cardSvg('**Airport**', 700);
    expect(out).toContain('<tspan font-weight="700.00">Airport</tspan>');
  });

  it('无标记的老路径**不挂 tspan**(老产物字节不变)', () => {
    const out = cardSvg('Object Type: Airport', 400);
    expect(out).not.toContain('tspan');
    expect(out).toContain('>Object Type: Airport</text>');
  });

  it('落单标记在产物里看得见(星号没被吃掉)', () => {
    const out = cardSvg('a ** b', 400);
    expect(out).toContain('>a ** b</text>');
  });
});
