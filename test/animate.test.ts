// =====================================================================
// descriptor · SMIL 内建动画(`DAnimate`)与内嵌样式表(`DStyle`)单测
//
// 三条线: ① 序列化**逐字节**(属性键序 / 缓动派生三位 / 标签名) ② 缓动词表与坏组合**当场抛**
// ③ 确定性(同一份 descriptor 两次全等 —— 动画进得了 golden 的前提)。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import {
  animate, circle, EASING_NAMES, EASING_SPLINES, easingSpline, group, style, svg,
  type AnimateProps, type AnimateTransformType, type Easing,
} from '../src/descriptor';
import { ShapeInputError } from '../src/guard';
import { escapeStyleText, serialize, toSVG } from '../src/serialize';

const CALL = 'animate'; // 守卫报错文案里的主体名

describe('descriptor · SMIL 动画与内嵌 style', () => {
  it('animate: 属性按 codepoint 序, 缓动派生出 calcMode / keyTimes / keySplines', () => {
    expect(
      serialize(animate({
        attributeName: 'opacity', from: '0', to: '1', dur: '600ms', begin: 'click',
        repeatCount: 'indefinite', easing: 'ease-out',
      })),
    ).toBe(
      '<animate attributeName="opacity" begin="click" calcMode="spline" dur="600ms" from="0"' +
        ' keySplines="0 0 0.58 1" keyTimes="0;1" repeatCount="indefinite" to="1" />',
    );
    // 只给终点(从当前值动起)也吃得下: 仍然是一个区间 ⇒ 仍然写 keyTimes="0;1"
    expect(serialize(animate({ attributeName: 'opacity', to: '0.25', dur: '300ms' }))).toBe(
      '<animate attributeName="opacity" dur="300ms" to="0.25" />',
    );
    // 数字档遍数走 String()(不是几何量, 不过 round1)
    expect(serialize(animate({ attributeName: 'opacity', to: '1', dur: '1s', repeatCount: 3 }))).toBe(
      '<animate attributeName="opacity" dur="1s" repeatCount="3" to="1" />',
    );
    // 属性袋的插入顺序不影响字节(键序由 attrsToStr 统一排)
    const a = animate({ attributeName: 'x', to: '10', dur: '1s', attrs: { z: '1', fill: 'freeze' } });
    const b = animate({ attributeName: 'x', to: '10', dur: '1s', attrs: { fill: 'freeze', z: '1' } });
    expect(serialize(a)).toBe(serialize(b));
    expect(serialize(a)).toBe('<animate attributeName="x" dur="1s" fill="freeze" to="10" z="1" />');
  });

  it('animateTransform: 有 type 就换标签, attributeName 缺省补 transform', () => {
    expect(
      serialize(animate({ type: 'translate', from: '-8 0', to: '0 0', dur: '400ms', easing: 'ease-out-cubic' })),
    ).toBe(
      '<animateTransform attributeName="transform" calcMode="spline" dur="400ms" from="-8 0"' +
        ' keySplines="0.33 1 0.68 1" keyTimes="0;1" to="0 0" type="translate" />',
    );
    // linear 也照写 spline(0 0 1 1 是它的退化形式) —— 一条路径, 不为它长一个 if 分支
    expect(serialize(animate({ type: 'scale', from: '1', to: '1.4', dur: '1s', easing: 'linear' }))).toBe(
      '<animateTransform attributeName="transform" calcMode="spline" dur="1s" from="1"' +
        ' keySplines="0 0 1 1" keyTimes="0;1" to="1.4" type="scale" />',
    );
    // 作者给的 attrs 最后合并 = 覆盖(多段 values 的逐段缓动走这里, 内核不猜)
    expect(
      serialize(animate({
        attributeName: 'd', values: 'M0 0;L10 0;L10 10', dur: '2s',
        attrs: { calcMode: 'spline', keyTimes: '0;0.5;1', keySplines: '0.4 0 0.6 1;0.4 0 0.6 1' },
      })),
    ).toBe(
      '<animate attributeName="d" calcMode="spline" dur="2s" keySplines="0.4 0 0.6 1;0.4 0 0.6 1"' +
        ' keyTimes="0;0.5;1" values="M0 0;L10 0;L10 10" />',
    );
  });

  it('style: CSS 原样插入, 只转 XML 文本里必须转的 < 与 &', () => {
    expect(serialize(style('@keyframes pulse { from { opacity: 0 } to { opacity: 1 } }', { media: 'screen' }))).toBe(
      '<style media="screen" type="text/css">@keyframes pulse { from { opacity: 0 } to { opacity: 1 } }</style>',
    );
    // `>` 与引号是普通字符(不转); `<` 与 `&` 是 XML 里必须转的两个 —— 后者管的是 CSS 嵌套的 &
    expect(escapeStyleText('a > b { content: "<" } .x { & .y { fill: red } }')).toBe(
      'a > b { content: "&lt;" } .x { &amp; .y { fill: red } }',
    );
    // 大小写不敏感的多行 CSS 逐字节不动(内核不缩进、不插换行)
    const css = '@keyframes fade {\n  from { opacity: 0; }\n  to { opacity: 1; }\n}';
    expect(serialize(style(css))).toBe(`<style type="text/css">${css}</style>`);
    expect(() => style('')).toThrow(ShapeInputError);
  });

  it('缓动词表: 写错名字当场抛, 词表与类型同源', () => {
    // 词表从 EASING_SPLINES 派生, 二者不许各写一份
    expect(EASING_NAMES.join(' ')).toBe(Object.keys(EASING_SPLINES).join(' '));
    expect(EASING_NAMES.length).toBeGreaterThanOrEqual(5);
    expect(easingSpline('ease-in-out')).toBe(EASING_SPLINES['ease-in-out']);
    const wrong = () => easingSpline('ease-in-outy' as Easing);
    expect(wrong).toThrow(ShapeInputError);
    expect(wrong).toThrow(/easing.*不在词表里/);
    // 拼错名字的缓动不许静默降级成匀速 —— 构造路径上同样当场抛
    expect(() => animate({ attributeName: 'opacity', to: '1', dur: '1s', easing: 'ease-out-back' as Easing }))
      .toThrow(ShapeInputError);
    expect(() => animate({ type: 'skewX' as AnimateTransformType, from: '0 0', to: '10 0', dur: '1s' }))
      .toThrow(new RegExp(`${CALL}: 词表参数 "type" 不在词表里`));
  });

  it('坏组合当场抛: transform 走 animate / values 与 from·to 互斥 / 缺必答', () => {
    // 这些入参**故意写歪**(类型层本来拦得住, 数据驱动 / 反序列化进来的拦不住) —— 故按 unknown 给
    const cases: [unknown, RegExp][] = [
      // 规范里 transform 只能由 <animateTransform> 动 —— 写成 animate 是"静默不动"的坑
      [{ attributeName: 'transform', to: 'translate(8)', dur: '1s' }, /只能由 <animateTransform> 动/],
      [{ attributeName: 'opacity', values: '0;1', from: '0', to: '1', dur: '1s' }, /与 from \/ to 同时给了/],
      [{ attributeName: 'opacity', dur: '1s' }, /与 from \/ to 都没给/],
      [{ attributeName: 'opacity', to: '1' }, /dur/],
      [{ from: '0', to: '1', dur: '1s' }, /attributeName/],
      [{ attributeName: 'opacity', values: '0;1', dur: '1s', easing: 'ease-in' }, /管一个区间/],
      [{ attributeName: 'opacity', to: '1', dur: '1s', repeatCount: 'infinite' }, /repeatCount/],
      [{ attributeName: 'opacity', to: '1', dur: '1s', repeatCount: -2 }, /为负/],
    ];
    for (const [p, re] of cases) {
      const call = () => animate(p as AnimateProps);
      expect(call).toThrow(ShapeInputError);
      expect(call).toThrow(re);
    }
  });

  it('确定性: 同一份 descriptor 两次序列化逐字节相同, 且产物里没有 NaN / undefined', () => {
    const build = () => svg(120, 60, [
      style('@keyframes pulse { from { opacity: 0 } to { opacity: 1 } }'),
      group(
        [
          circle(30, 30, 8, { fill: '#111' }),
          animate({ attributeName: 'opacity', from: '0.2', to: '1', dur: '1s', begin: '0s', easing: 'ease-in-out' }),
        ],
        { id: 'pulse' },
      ),
    ]);
    const first = toSVG(build());
    expect(toSVG(build())).toBe(first);
    expect(first).not.toContain('NaN');
    expect(first).not.toContain('undefined');
  });

  it('嵌套缩进: animate 是父元素的子元素, style 是根的子元素', () => {
    const doc = svg(120, 60, [
      style('@keyframes pulse { from { opacity: 0 } to { opacity: 1 } }'),
      // ⚠ animate 的目标是**父元素**: 这条产出里它动的是 `<g id="pulse">` 自己的透明度
      // (Chrome 实测钉过: 目标 = 父元素, 不是旁边的 circle —— 详见 descriptor 那条注释)
      group(
        [
          circle(30, 30, 8, { fill: '#111' }),
          animate({ attributeName: 'opacity', from: '0.2', to: '1', dur: '1s', begin: '0s', easing: 'ease-in-out' }),
        ],
        { id: 'pulse' },
      ),
    ]);
    expect(toSVG(doc, { declaration: false })).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" width="120.00" height="60.00" viewBox="0 0 120.00 60.00">\n' +
        '  <style type="text/css">@keyframes pulse { from { opacity: 0 } to { opacity: 1 } }</style>\n' +
        '  <g id="pulse">\n' +
        '    <circle cx="30.00" cy="30.00" r="8.00" fill="#111" />\n' +
        '    <animate attributeName="opacity" begin="0s" calcMode="spline" dur="1s" from="0.2"' +
        ' keySplines="0.42 0 0.58 1" keyTimes="0;1" to="1" />\n' +
        '  </g>\n' +
        '</svg>\n',
    );
  });
});
