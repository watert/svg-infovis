// =====================================================================
// serialize 单测 · 字节确定性 / 属性键序 / 数值取整 / XML 转义
// 这些是 golden 对比的地基: 任何一处不确定, diff 就会假报警。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { circle, rect, svg, text } from '../src/descriptor';
import { attrsToStr, serialize, toSVG } from '../src/serialize';
import { edgeShape } from '../src/shapes/edge';
import { labelBoxShape } from '../src/shapes/text';
import { nodeShape } from '../src/shapes/node';

describe('serialize · 字节确定性', () => {
  it('同一份 descriptor 连续两次 toSVG 结果字符串严格相等', () => {
    const doc = svg(320, 200, [
      nodeShape({ x: 20, y: 20, w: 200, h: 56, label: 'HTML 骨架', sub: '决策唯一源' }),
      edgeShape({
        points: [
          { x: 120, y: 76 },
          { x: 120, y: 140 },
          { x: 260, y: 140 },
        ],
        end: 'arrow-triangle',
      }),
      labelBoxShape({ x: 190, y: 140, w: 56, h: 19, content: '写决策' }),
      circle(300, 40.4567, 3.3333, { fill: '#6b7280' }),
    ]);
    const first = toSVG(doc);
    expect(toSVG(doc)).toBe(first);
    // 同一份 descriptor 换一份实例再序列化, 仍然逐字节相同
    const rebuilt = svg(320, 200, [
      nodeShape({ x: 20, y: 20, w: 200, h: 56, label: 'HTML 骨架', sub: '决策唯一源' }),
      edgeShape({
        points: [
          { x: 120, y: 76 },
          { x: 120, y: 140 },
          { x: 260, y: 140 },
        ],
        end: 'arrow-triangle',
      }),
      labelBoxShape({ x: 190, y: 140, w: 56, h: 19, content: '写决策' }),
      circle(300, 40.4567, 3.3333, { fill: '#6b7280' }),
    ]);
    expect(toSVG(rebuilt)).toBe(first);
    expect(first).not.toContain('NaN');
    expect(first).not.toContain('undefined');
  });

  it('属性插入顺序不影响输出(键序由序列化统一决定)', () => {
    const a = toSVG(svg(10, 10, [rect(2.3456, 1, 5, 5, undefined, { z: 1, a: 2, fill: '#fff' })]));
    const b = toSVG(svg(10, 10, [rect(2.3456, 1, 5, 5, undefined, { fill: '#fff', a: 2, z: 1 })]));
    expect(a).toBe(b);
  });

  it('属性键按 codepoint 序输出', () => {
    // 'B'(0x42) < 'a'(0x61): locale 序会给出相反结果, codepoint 序不会
    expect(attrsToStr({ a: 1, B: 2 })).toBe(' B="2" a="1"');
    expect(attrsToStr({ 'stroke-width': 1.5, fill: '#fff', opacity: 0.5 })).toBe(
      ' fill="#fff" opacity="0.5" stroke-width="1.5"',
    );
    // undefined 值被丢弃, 不产出空属性
    expect(attrsToStr({ fill: 'none', 'stroke-dasharray': undefined })).toBe(' fill="none"');
    expect(attrsToStr()).toBe('');
  });

  it('数值经 round1(1 位小数)后再格式化', () => {
    // 属性: round1 后转字符串(不补零)
    expect(attrsToStr({ 'stroke-width': 2.56789 })).toBe(' stroke-width="2.6"');
    expect(attrsToStr({ opacity: 0.049 })).toBe(' opacity="0"');
    // 元素几何: 先 round1 再走 fmt(2 位小数)
    expect(serialize(rect(10.049, 20.951, 100.005, 50, 6))).toBe(
      '<rect x="10.00" y="21.00" width="100.00" height="50.00" rx="6.00" />',
    );
    // 完整文档的 golden: 声明 + 根尺寸 + viewBox 都取 round1 后的值
    expect(toSVG(svg(200, 56.04, [rect(10.049, 20.951, 100, 50, 6)]), { declaration: false })).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200.00" height="56.00" viewBox="0 0 200.00 56.00">\n' +
        '  <rect x="10.00" y="21.00" width="100.00" height="50.00" rx="6.00" />\n' +
        '</svg>\n',
    );
  });

  it('XML 转义: 文本含 & < > " 时被正确转义', () => {
    const s = serialize(text(5, 5, 'a & b < c > "d" \'e\'', { title: 'x & y < z' }));
    expect(s).toContain('>a &amp; b &lt; c &gt; &quot;d&quot; &#39;e&#39;</text>');
    expect(s).toContain('"x &amp; y &lt; z"');
    // 原文的裸尖括号不会漏进标签体, 否则 SVG 直接解析失败
    expect(s).not.toContain('< c >');
    // path 的 d 属性同样走转义通道
    expect(serialize({ kind: 'path', d: 'M 0 0 L 1 1', attrs: { 'data-note': 'a&b' } })).toBe(
      '<path d="M 0 0 L 1 1" data-note="a&amp;b" />',
    );
  });
});
