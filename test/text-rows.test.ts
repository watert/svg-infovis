// =====================================================================
// text_rows · 行块几何(多行居中堆叠的**唯一一份**公式)
//
// 它存在的理由是 260920 那次事故: 同一套堆叠公式被写在三处, 其中一处(fit.ts)漂了, 而渲染面
// 早已拆行 —— 于是"盒按 1 行给、字按 N 行画", 门禁只判宽 ⇒ 全绿出厂。
//
// 所以这组测试盯两件事:
//   ① 公式本身(奇偶对称 / 并集高 / 退化)
//   ② **三个消费方读到的是同一份**(渲染的行心 === 出口的行心 === 反算盒高用的偏移)
//      —— 单测公式不算数, 单测得出"三处一致"才算数
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { rowBlock } from '../src/geometry/text-rows';
import { NODE_TEXT_LAYOUT, nodeShape } from '../src/shapes/node';
import { nodeFit } from '../src/knives/fit';
import { type DText, baselineY } from '../src/descriptor';
import { exportScene } from '../src/export';

const FS = NODE_TEXT_LAYOUT.fontSize;

describe('rowBlock · 行块几何', () => {
  it('中心对称: 奇数行正中那行为 0, 偶数行 ±gap/2 起步 —— 整块重心恒为 0', () => {
    const gap = 20;
    expect(rowBlock(0, gap).offsets).toEqual([]);
    expect(rowBlock(1, gap).offsets).toEqual([0]);
    expect(rowBlock(2, gap).offsets).toEqual([-10, 10]);
    expect(rowBlock(3, gap).offsets).toEqual([-20, 0, 20]);
    expect(rowBlock(4, gap).offsets).toEqual([-30, -10, 10, 30]);
    // 任意行数: 偏移之和恒为 0(对称的代数表达), 首末对称
    for (let n = 1; n <= 8; n += 1) {
      const { offsets } = rowBlock(n, gap);
      expect(offsets.reduce((a, b) => a + b, 0)).toBeCloseTo(0, 10);
      offsets.forEach((o, i) => expect(o).toBeCloseTo(-offsets[n - 1 - i], 10));
      // 相邻间距恒为 gap
      for (let i = 1; i < n; i += 1) expect(offsets[i] - offsets[i - 1]).toBeCloseTo(gap, 10);
    }
  });

  it('并集高 = max(行心+半盒) − min(行心−半盒); 不传行盒时退化成 (n−1)×gap', () => {
    // 等厚行: 就是间隔 + 一个行盒
    expect(rowBlock(2, 10, [8, 8]).height).toBeCloseTo(18, 10);
    expect(rowBlock(3, 10, [8, 8, 8]).height).toBeCloseTo(28, 10);
    // 一行: 就是那一个行盒(与"零厚度"口径不同 —— 这才是盒高该用的数)
    expect(rowBlock(1, 10, [8]).height).toBeCloseTo(8, 10);
    // 厚薄不齐(主标签 + 次标签那种): 并集取两端各行盒的一半
    expect(rowBlock(2, 10, [12, 8]).height).toBeCloseTo(10 + 6 + 4, 10);
    // 零厚度: 只够算偏移, **不是盒高**
    expect(rowBlock(3, 10).height).toBeCloseTo(20, 10);
    expect(rowBlock(0, 10).height).toBe(0);
    // 行盒长度与行数不符时按缺省 0 兜(不抛: 纯几何层不持有入参校验, 与 vec.ts 同纪律)
    expect(rowBlock(2, 10, [8]).height).toBeCloseTo(10 + 4, 10);
  });

  it('三个消费方读到同一份: 节点渲染 / 旁注出口 / 反算盒高 都用这套偏移', () => {
    const gap = FS * NODE_TEXT_LAYOUT.lineGapEm;

    // ① 节点: nodeShape 的行心 = 盒中心 + offsets
    const label = '甲\n乙\n丙';
    const fit = nodeFit({ label });
    expect(fit.lines).toBe(3);
    const shape = nodeShape({ x: 0, y: 0, w: fit.w, h: fit.h, label });
    const texts = (shape.kind === 'group' ? shape.children : []).filter((c): c is DText => c.kind === 'text');
    const { offsets } = rowBlock(3, gap);
    expect(texts.length).toBe(3);
    texts.forEach((t, i) => {
      const center = t.y - baselineY(0, FS, 'central');
      expect(center - (fit.h / 2 + offsets[i])).toBeCloseTo(0, 6);
    });

    // ② 旁注: 同一个 offsets, 中心换旁注 rect 的中心(行距按**旁注自己的字号**, 与节点各按各的)
    const text = '甲\n乙';
    const textSize = 11; // SceneText 的缺省字号, 与节点的 13 不同 —— 行距也跟着不同, 这是设计
    const svg = exportScene({
      width: 200, height: 100, nodes: [], edges: [],
      texts: [{ id: 't', rect: { x: 20, y: 20, w: 80, h: 40 }, text, fontSize: textSize }],
    }).svg;
    const ys = [...svg.matchAll(/<text[^>]*\by="([-\d.]+)"/g)].map((m) => Number(m[1]));
    expect(ys.length).toBe(2);
    const midY = 20 + 40 / 2;
    const center2 = rowBlock(2, textSize * NODE_TEXT_LAYOUT.lineGapEm).offsets;
    ys.forEach((y, i) => {
      const center = y - baselineY(0, textSize, 'central');
      // 出口写回坐标过一次 round1, serialize 的属性出口再过一次 —— 公差取两个 0.1 量子
      expect(Math.abs(center - (midY + center2[i]))).toBeLessThanOrEqual(0.1);
    });
    // 而且确实按 gap 拉开了(不是两行叠在一起)
    expect(Math.abs((ys[1] - ys[0]) - 2 * Math.abs(center2[0]))).toBeLessThanOrEqual(0.1);

    // ③ 反算: nodeFit 的 contentH 就是这套偏移 + 行盒的并集(不是另一套算式)
    const lineH = nodeFit({ label: 'x' }).contentH;
    expect(fit.contentH).toBeCloseTo(rowBlock(3, gap, [lineH, lineH, lineH]).height, 6);
  });
});
