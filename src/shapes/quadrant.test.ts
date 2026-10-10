// =====================================================================
// shapes/quadrant · 判据(分区几何 + 墨迹)
//
// 这个文件守三件事, 每件都对应一种真实的漂法:
//   ① **格位由区域等分推出**(不是"格尺寸 × 个数") —— 等分除不尽时 1 位小数落位, 最后一格
//      必须贴回区域边缘(公差 ≤0.1px); 缝的账要能逐格对上
//   ② **分区线落在缝的中线上** —— 与 `grid.vGutter` 同一个公式(gap=0 时恰是格界);
//      `overshoot` 只动线的两端, 不动中线
//   ③ **墨迹与读数同源** —— `quadrantShape` 画的极标签位置, 必须与 `quadrantGeometry.pole`
//      交出的锚点逐位相同(两处各算一遍 = "量的一个盒、画另一个盒"的老病)
//
// 判据的形式尽量是**对照**(与公式对 / 与 geometry 对), 而不是"等于我抄在这里的那个字面量"。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { type Descriptor, type DText, baselineY } from '../descriptor.js';
import { ShapeInputError } from '../guard.js';
import { round1 } from '../geometry/vec.js';
import { QUADRANT_LAYOUT, quadrantGeometry, quadrantShape } from './quadrant.js';

/** 拍平 descriptor 树(group 要钻进去才读得到线 / 文字) */
function flatten(d: Descriptor): Descriptor[] {
  return d.kind === 'group' || d.kind === 'defs' || d.kind === 'pattern'
    ? [d, ...d.children.flatMap(flatten)]
    : [d];
}
const pathsOf = (d: Descriptor) => flatten(d).filter((c) => c.kind === 'path').length;
const rectsOf = (d: Descriptor) => flatten(d).filter((c) => c.kind === 'rect').length;
const textsOf = (d: Descriptor): DText[] => flatten(d).filter((c): c is DText => c.kind === 'text');

/** 3×2 的样本: 两轴都不等分(300/3 与 200/2), 格宽 80 / 格高 90 都是整数, 手算账干净 */
const P = { rect: { x: 0, y: 0, w: 300, h: 200 }, cols: 3, rows: 2, gap: { x: 30, y: 20 } } as const;

describe('shapes/quadrant · 象限分区框架', () => {
  it('格位: 区域等分 + 缝; 最后一格贴回区域右 / 下缘(1 位小数精度内)', () => {
    const g = quadrantGeometry(P);
    expect(g.cellSize).toEqual({ w: 80, h: 90 });
    expect(g.cell(0, 0)).toEqual({ x: 0, y: 0, w: 80, h: 90 });
    expect(g.cell(1, 0)).toEqual({ x: 110, y: 0, w: 80, h: 90 });
    const last = g.cell(2, 1);
    expect(last.x + last.w).toBeCloseTo(300, 1);
    expect(last.y + last.h).toBeCloseTo(200, 1);
    // 格心 = 格位中心(第 1 行 y 从 90 + 20 起 —— 缝也要算进去)
    expect(g.center(1, 1)).toEqual({ x: round1(110 + 40), y: round1(110 + 45) });
    // 除不尽的账: 等分保持数学值, 只在输出位取整(不静默吸附最后一格 —— 那会让格子不等宽)
    const odd = quadrantGeometry({ rect: { x: 0, y: 0, w: 100, h: 100 }, cols: 3, rows: 2 });
    expect(new Set([0, 1, 2].map((c) => odd.cell(c, 0).w)).size).toBe(1);
    expect(odd.cell(2, 0).x + odd.cell(2, 0).w).toBeCloseTo(100, 1);
  });

  it('分区线落在缝的中线上(gap=0 时 = 格界); overshoot 只动线的两端', () => {
    const g = quadrantGeometry(P);
    expect(g.vLine(0)).toBe(round1(0 + 80 + 15));      // 第 0 格右缘 + 半条缝
    expect(g.vLine(1)).toBe(round1(110 + 80 + 15));
    expect(g.hLine(0)).toBe(round1(0 + 90 + 10));
    const zero = quadrantGeometry({ rect: { x: 5, y: 7, w: 200, h: 100 }, cols: 2, rows: 2 });
    expect(zero.vLine(0)).toBe(zero.cell(0, 0).x + zero.cell(0, 0).w);
    const seg = g.vRule(0, { overshoot: 9 });
    expect(seg.from).toEqual({ x: g.vLine(0), y: -9 });
    expect(seg.to).toEqual({ x: g.vLine(0), y: 209 });
    const flat = g.hRule(0);
    expect(flat.from).toEqual({ x: 0, y: g.hLine(0) });
    expect(flat.to).toEqual({ x: 300, y: g.hLine(0) });
  });

  it('极标签锚点: 逐格 = 该格边的中点(上下边居中对齐 / 左边右对齐 / 右边左对齐), 整边 = 边中点', () => {
    const g = quadrantGeometry(P);
    const top1 = g.pole('top', 1, { offset: 10 });
    expect(top1.at).toEqual({ x: 150, y: -10 });
    expect(top1.anchor).toBe('middle');
    expect(g.pole('bottom', 0, { offset: 10 }).at).toEqual({ x: 40, y: 210 });
    const left1 = g.pole('left', 1, { offset: 10 });
    expect(left1.at).toEqual({ x: -10, y: round1(110 + 45) });
    expect(left1.anchor).toBe('end');
    expect(g.pole('right', 0, { offset: 10 }).anchor).toBe('start');
    // 整边(四象限那种一个维度名管一整边): 边中点, 与格位无关
    expect(g.pole('top', undefined, { offset: 10 }).at).toEqual({ x: 150, y: -10 });
    expect(g.pole('left', undefined, { offset: 10 }).at).toEqual({ x: -10, y: 100 });
    expect(() => g.pole('top', 3)).toThrow(/格位/);
  });

  it('rules: 缺省画 cols-1 + rows-1 条线; frame 加外框; `false` 一条不画', () => {
    const lines = quadrantGeometry(P);
    expect(pathsOf(quadrantShape(P))).toBe(lines.cols - 1 + lines.rows - 1);
    const framed = quadrantShape({ ...P, rules: { frame: true } });
    expect(rectsOf(framed)).toBe(1);
    expect(pathsOf(framed)).toBe(3);
    expect(pathsOf(quadrantShape({ ...P, rules: false }))).toBe(0);
    // 九宫格: 两轴各两条
    expect(pathsOf(quadrantShape({ rect: { x: 0, y: 0, w: 300, h: 300 }, cols: 3, rows: 3 }))).toBe(4);
  });

  it('arrows: 只给"轴"(2 分区那一维)加箭头; 两个方向都不是 2 分区时当场抛', () => {
    // 2×2: 两条线 + 四端箭头
    expect(pathsOf(quadrantShape({ rect: { x: 0, y: 0, w: 200, h: 200 }, cols: 2, rows: 2, rules: { arrows: true } }))).toBe(6);
    // 3×2: 竖线两条无箭头, 横线一条两端有箭头
    expect(pathsOf(quadrantShape({ rect: { x: 0, y: 0, w: 300, h: 200 }, cols: 3, rows: 2, rules: { arrows: true } }))).toBe(5);
    // 3×3: 没有中轴线, 打开它 = "写了却不上屏", 当场抛
    expect(() => quadrantShape({ rect: { x: 0, y: 0, w: 300, h: 300 }, cols: 3, rows: 3, rules: { arrows: true } }))
      .toThrow(/中轴线/);
  });

  it('极标签墨迹与 `quadrantGeometry.pole` 同源: 位置 / 对齐 / 字号逐位对上', () => {
    const g = quadrantGeometry(P);
    const texts = textsOf(quadrantShape({ ...P, poles: { top: ['A', 'B', 'C'], left: '维度名' } }));
    expect(texts.map((t) => t.content)).toEqual(['A', 'B', 'C', '维度名']);
    for (const [i, t] of texts.slice(0, 3).entries()) {
      const a = g.pole('top', i);
      expect(t.x).toBe(a.at.x);
      expect(t.y).toBe(baselineY(a.at.y, QUADRANT_LAYOUT.poleFontSize, 'central'));
      expect(t.attrs?.['text-anchor']).toBe('middle');
    }
    const whole = g.pole('left');
    expect(texts[3].x).toBe(whole.at.x);
    expect(texts[3].attrs?.['text-anchor']).toBe('end');
    expect(texts[3].attrs?.['font-size']).toBe(QUADRANT_LAYOUT.poleFontSize);
  });

  it('守卫: 1×1 / 非整数分区 / 缝吃掉区域 / 标签数不符 / 多行标签', () => {
    const r = { x: 0, y: 0, w: 200, h: 200 };
    expect(() => quadrantGeometry({ rect: r, cols: 1, rows: 1 })).toThrow(ShapeInputError);
    expect(() => quadrantGeometry({ rect: r, cols: 2.5, rows: 2 })).toThrow(/整数/);
    expect(() => quadrantGeometry({ rect: r, cols: 3, rows: 2, gap: { x: 120 } })).toThrow(/吃掉了整个区域/);
    expect(() => quadrantGeometry({ rect: r, cols: 2, rows: 2, gap: { y: -1 } })).toThrow(/为负/);
    expect(() => quadrantShape({ rect: r, cols: 3, rows: 3, poles: { top: ['A'] } })).toThrow(/格位/);
    expect(() => quadrantShape({ rect: r, cols: 2, rows: 2, poles: { left: '上\n下' } })).toThrow(/换行/);
    expect(() => quadrantShape({ rect: r, cols: 2, rows: 2, poles: { bottom: '' } })).toThrow(/非空/);
    expect(() => quadrantShape({ rect: r, cols: 2, rows: 2, rules: { tone: 'chartreuse' as never } })).toThrow(/词表/);
  });
});
