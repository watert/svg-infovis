// =====================================================================
// inline-space-preserve · `<tspan>` 接壤的空格不许被渲染器剥掉(260925)
//
// 病灶(由 `examples/gallery/ontology-icons.ts:54` 的 `'Object Type: **Airport**'` 坐实):
// `inlineTextRow` 把一行拆成多个 `<tspan>`, 而每个 tspan 是一段**独立的字符数据 chunk** ——
// `xml:space` 缺省档下渲染器**逐 chunk 剥首尾空白**。于是第一段 `"Object Type: "` 的尾空格
// 在字节里还在、栅格化后却没了: 图上成 `Object Type:Airport`。
//
// 更贵的是**双尺分叉**: `measureText` / `labelBoxSize` 量的是**含空格**的整串(尺子读 `plainText`),
// 渲染面却少画一格 ⇒ 盒宽按 A 给、字按 B 画 —— 本仓最贵的那类事故, 只是这回小到肉眼几乎看不出
// (它靠"卡片第二行的字挤在一起"暴露自己)。
//
// 机制**只有一条有效**: `<text xml:space="preserve">`。rsvg 实测 `&#160;`(NBSP)与普通空格
// 像素级相同 —— 它换了个字形, "被剥"这件事本身没解决。pin 在 `descriptor.richText`(见那里注释):
// "走 spans ⇒ 多 chunk ⇒ 会挨剥"是那个构造器自己的事, 调用点忘不掉。
//
// 本文件钉五件事(每条的"把 pin 摘掉就红"都验过):
//   ① 标记**前**的空格: 尾空格留在第一个 tspan 里(tspan 字节一字未动, 只是父级加了属性)
//   ② 标记**后**的空格: 首空格留在后一个 tspan 里 —— 首尾一样会被剥, 不是只有尾格有事
//   ③ **两端都有**: ` x **Airport** y ` 三段全在
//   ④ 单 run 的老路径**不含** `xml:space` —— 全仓 PNG 快照 + 两条逐字节基线盯着这一条
//   ⑤ 度量与渲染**同源不漂**: 上屏那串字 = `plainText`, 且按产物里的 tspan 逐段独立复算的宽度
//     与 `measureText` 给的那一个同值(丢一格接壤空格就少 0.6em, 这条当场红)
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { svg } from '../src/descriptor';
import { toSVG } from '../src/serialize';
import { nodeShape } from '../src/shapes/node';
import { labelBoxShape } from '../src/shapes/text';
import { ADVANCE_PER_UNIT_EM, ESTIMATE_SAFETY_FACTOR, measureText, textUnits } from '../src/knives/measure';
import { INLINE_STYLE, plainText } from '../src/geometry/inline-text';
import { round1 } from '../src/geometry/vec';
import { createScene } from '../src/scene';
import { exportScene } from '../src/export';

const FS = 12;
const BOLD = INLINE_STYLE.bold;

/** 渲染面之一: 节点标签。⚠ 字重 400 要**显式给**: `nodeShape` 的主标签缺省是 600(标题档) */
const cardSvg = (label: string, weight = 400): string =>
  toSVG(svg(400, 100, [nodeShape({ x: 10, y: 10, w: 300, h: 60, label, fontSize: FS, weight, align: 'start', padX: 10 })]));

/** 渲染面之二: 边标签遮罩片 */
const labelSvg = (content: string): string =>
  toSVG(svg(200, 60, [labelBoxShape({ x: 100, y: 30, w: 120, h: 22, content })]));

/** 渲染面之三: 旁注(`scene.texts`)—— 走完整出口 */
const noteSvg = (text: string): string =>
  exportScene(createScene({
    width: 300, height: 80, nodes: [], edges: [],
    texts: [{ id: 't', rect: { x: 10, y: 10, w: 280, h: 60 }, text }],
  }), { skipAudit: true }).svg;

/** 判据读**产物字节**(不是中间态): 那条 `<text>` 的属性串 + 逐 tspan 的文本与字重 */
function rowOf(out: string): { attrs: string; spans: Array<{ text: string; weight: number }>; chunks: string[] } {
  const m = /<text ([^>]*)>(.*?)<\/text>/.exec(out);
  if (!m) throw new Error('产物里没有 <text>');
  const spans = [...m[2].matchAll(/<tspan([^>]*)>([^<]*)<\/tspan>/g)]
    .map((t) => ({ text: t[2], weight: Number(/font-weight="([\d.]+)"/.exec(t[1])?.[1] ?? 400) }));
  if (!spans.length) throw new Error('产物里没有 <tspan> —— 这条内容没被拆成多 run');
  return { attrs: m[1], spans, chunks: spans.map((s) => s.text) };
}

/**
 * 与 `measureText` **同式的独立复算**: 逐 tspan 累加推进, 粗体那几截乘 `(1 + 增益)`。
 * 字重从**产物字节**里读(不是从解析器的中间态) —— 直接调 `measureText` 比宽度等于拿被测函数
 * 验证被测函数; 判据是"尺子给的那一个, 与按画出来的东西复算的那一个, 是不是同一个数"。
 */
const recompute = (spans: Array<{ text: string; weight: number }>): number => {
  const em = spans.reduce(
    (acc, s) => acc + textUnits(s.text) * ADVANCE_PER_UNIT_EM * (s.weight >= BOLD.weight ? 1 + BOLD.advanceGain : 1),
    0,
  );
  return round1(em * FS * ESTIMATE_SAFETY_FACTOR);
};

describe('inline-space-preserve · 接壤空白在产物里保留', () => {
  it('标记**前**的空格: 留在第一个 tspan 里(渲染器剥不掉它)', () => {
    const out = cardSvg('Object Type: **Airport**');
    const { attrs, chunks } = rowOf(out);
    expect(attrs).toContain('xml:space="preserve"');
    // 段边界上的空格仍在字节里 —— 这正是栅格化后读得出来的那一格(目视见 examples/images/ontology-icons.png)
    expect(chunks).toEqual(['Object Type: ', 'Airport']);
    expect(out).toContain('<tspan font-weight="400.00">Object Type: </tspan>');
  });

  it('标记**后**的空格: 首空格同样会被剥, 一样要保', () => {
    const { chunks } = rowOf(cardSvg('**Airport** 是机场'));
    expect(chunks).toEqual(['Airport', ' 是机场']);
  });

  it('**两端都有**: 三个 run 全在, 首尾空格一个不少', () => {
    const src = ' x **Airport** y ';
    const { chunks } = rowOf(cardSvg(src));
    expect(chunks).toEqual([' x ', 'Airport', ' y ']);
    expect(chunks.join('')).toBe(plainText(src));
  });

  it('三个渲染面(节点 / 遮罩片 / 旁注)同一份发射器, 也吃同一份保留', () => {
    for (const out of [cardSvg('前 **中** 后'), labelSvg('前 **中** 后'), noteSvg('前 **中** 后')]) {
      const { attrs, chunks } = rowOf(out);
      expect(attrs).toContain('xml:space="preserve"');
      expect(chunks).toEqual(['前 ', '中', ' 后']);
    }
  });

  it('单 run 的老路径**不含** `xml:space`(老产物字节逐字不变)', () => {
    // 无标记 → 老路; 落单星号(通配符)退字面量 → 也是老路
    const cases: Array<[string, string]> = [
      ['Object Type: Airport', 'Object Type: Airport'],
      ['agent/* 与 tools/* 瀑布', 'agent/* 与 tools/* 瀑布'],
    ];
    for (const [src, plain] of cases) {
      const out = cardSvg(src);
      expect(out).not.toContain('tspan');
      expect(out).not.toContain('xml:space');
      expect(out).toContain(`>${plain}</text>`);
    }
    // 影线: 同一条内容一旦真被拆成多 run, 属性就得在 —— 否则上面那条只是"碰巧"
    expect(cardSvg('Object Type: **Airport**')).toContain('xml:space="preserve"');
  });

  it('度量与渲染**同源不漂**: 上屏那串字 = `plainText`, 宽度与逐 tspan 复算同值', () => {
    for (const src of ['Object Type: **Airport**', '**Airport** 是机场', ' x **Airport** y ', 'a *b* ~~c~~ [d]{rose} e']) {
      const { attrs, spans, chunks } = rowOf(cardSvg(src));
      expect(attrs).toContain('xml:space="preserve"');
      // ① 画的字 = 去标记后的原文(标记一个字符都不上屏)
      expect(chunks.join('')).toBe(plainText(src));
      // ② 尺子量的是**含空格**的整串; 按画出来的 tspan 逐段复算, 两把尺子必须同值 ——
      //   接壤空格丢掉一格 = 少 0.6em × 字号, 这条当场红
      expect(measureText(src, { fontSize: FS }).width).toBe(recompute(spans));
    }
    // 反证(把病态的产物喂给尺子): 少一格接壤空格的串量出来**就是不一样** ⇒ 上面那条不是恒真
    const marked = 'Object Type: **Airport**';
    expect(recompute([{ text: 'Object Type:', weight: 400 }, { text: 'Airport', weight: BOLD.weight }]))
      .toBeLessThan(measureText(marked, { fontSize: FS }).width);
  });
});
