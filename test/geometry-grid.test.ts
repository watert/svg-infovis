// =====================================================================
// geometry/grid · 均匀格子(格位 / 格心 / 格面 / 缝 / 并集)的语义判据
//
// ⚠ 文件名带 `geometry-` 前缀: 底纹那份测试叫 `grid-pattern.test.ts`(260920 之前是
// `grid.test.ts` —— 那时它与本文件撞名, 所以本文件从一开始就叫 `geometry-grid`)。
//
// 钉三件事:
//   ① **格位公式只有一份** —— 列 = `origin.x + c × (格宽 + 列距)`, 行同理(两轴各自独立, 不是按阅读序
//      累加)。手写 `X0 + col * PITCH` 时代每个客户各写一遍, 这里由首格 / 中间格 / 末格三点夹住。
//   ② **缝中线真的在缝里** —— `vGutter/hGutter` 是这套 API 里唯一"从单个格推不出来"的量(评审 ④ 保留
//      它的理由); 格距为 0 时它退化成两格共用的那条线, 而不是某一格的边。
//   ③ **bounds 是所有 cell 的并集** —— 每格都落在里面, 且**不含外侧 gap**(右缘就是末格右缘);
//      它与 `rectFace(bounds, …)` 合起来才是"段盒 + 走廊"那组查询。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { grid } from '../src/geometry/grid';
import { rectBottom, rectRight } from '../src/geometry/vec';

/** 一份"不整"的格子: 格宽 192 / 列距 48 ⇒ 节距 240; 格高 56 / 行距 104 ⇒ 节距 160 */
const G = grid({ origin: { x: 64, y: 0 }, cols: 5, rows: 3, cell: { w: 192, h: 56 }, gap: { x: 48, y: 104 } });

describe('geometry/grid · 格位 / 格心 / 格面 / 缝中线 / 并集', () => {
  it('cell: 首格 = origin, 节距 = 格尺寸 + 间距; 两轴各自独立', () => {
    expect(G.cell(0, 0)).toEqual({ x: 64, y: 0, w: 192, h: 56 });
    expect(G.cell(1, 0)).toEqual({ x: 304, y: 0, w: 192, h: 56 });      // 64 + 240
    expect(G.cell(0, 1)).toEqual({ x: 64, y: 160, w: 192, h: 56 });     // 0 + 160
    expect(G.cell(4, 2)).toEqual({ x: 1024, y: 320, w: 192, h: 56 });   // 64 + 4×240 / 0 + 2×160
    expect(G.cell(2, 1).y).toBe(G.cell(0, 1).y);
    expect(G.cell(2, 1).x).toBe(G.cell(2, 0).x);
  });

  it('center: 格心 = 格位 + 半格', () => {
    expect(G.center(0, 0)).toEqual({ x: 160, y: 28 });
    expect(G.center(2, 1)).toEqual({ x: 640, y: 188 });
  });

  it('face: 格面上的点, `offset` 语义与 `rectFace` 完全同款(正 = 朝外)', () => {
    expect(G.face(0, 0, 'bottom')).toEqual({ x: 160, y: 56 });                  // 缺省面中点
    expect(G.face(0, 0, 'bottom', { offset: 18 })).toEqual({ x: 160, y: 74 });  // 出盒 stub 起点
    expect(G.face(0, 0, 'top', { offset: -10 })).toEqual({ x: 160, y: 10 });    // 负 = 朝格内
    expect(G.face(2, 1, 'right', { t: 0.25 })).toEqual({ x: 736, y: 174 });     // t 是比例
    expect(G.face(2, 1, 'left', { at: 200 })).toEqual({ x: 544, y: 200 });      // at 是**绝对坐标**
  });

  it('bounds: 所有 cell 的并集(**不含**外侧 gap), 每格都落在里面', () => {
    expect(G.bounds).toEqual({ x: 64, y: 0, w: 4 * 240 + 192, h: 2 * 160 + 56 });
    // 不含外侧 gap: 右缘 / 底缘就是末格的右缘 / 底缘(不是再往外半条缝)
    expect(rectRight(G.bounds)).toBe(rectRight(G.cell(4, 0)));
    expect(rectBottom(G.bounds)).toBe(rectBottom(G.cell(0, 2)));
    expect(rectRight(G.bounds)).toBe(1216);
    for (let c = 0; c < G.cols; c++) {
      for (let r = 0; r < G.rows; r++) {
        const q = G.cell(c, r);
        const inside = q.x >= G.bounds.x && q.y >= G.bounds.y
          && rectRight(q) <= rectRight(G.bounds) && rectBottom(q) <= rectBottom(G.bounds);
        expect({ c, r, inside }).toEqual({ c, r, inside: true });
      }
    }
  });

  it('vGutter / hGutter: 缝的**中线**(与两侧等距, 严格落在缝里)', () => {
    expect(G.vGutter(0)).toBe(280);   // col0 右缘 256 → col1 左缘 304 的中间
    expect(G.vGutter(1)).toBe(520);
    expect(G.hGutter(0)).toBe(108);   // row0 底 56 → row1 顶 160 的中间
    expect(G.hGutter(1)).toBe(268);
    for (let i = 0; i < G.cols - 1; i++) {
      const mid = G.vGutter(i);
      expect({ i, mid }).toEqual({ i, mid: (rectRight(G.cell(i, 0)) + G.cell(i + 1, 0).x) / 2 });
      expect(mid).toBeGreaterThan(rectRight(G.cell(i, 0)));
      expect(mid).toBeLessThan(G.cell(i + 1, 0).x);
    }
    // "格底 + 整个 gap" 是**下一行的顶**, 不是缝中线 —— 两者差半条缝(最常见的写错)
    expect(G.hGutter(0)).not.toBe(rectBottom(G.cell(0, 0)) + 104);
  });

  it('gap 缺省 = 0 密铺: 格与格共边, "缝中线"退化成那条共用的线', () => {
    const t = grid({ origin: { x: 0, y: 0 }, cols: 2, rows: 2, cell: { w: 10, h: 10 } });
    expect(t.cell(1, 1)).toEqual({ x: 10, y: 10, w: 10, h: 10 });
    expect(t.bounds).toEqual({ x: 0, y: 0, w: 20, h: 20 });
    expect(t.vGutter(0)).toBe(rectRight(t.cell(0, 0)));
    expect(t.hGutter(0)).toBe(rectBottom(t.cell(0, 0)));
    expect(t.center(1, 0)).toEqual({ x: 15, y: 5 });
  });

  it('单行 / 单列的退化: 节距与 gap 不参与, bounds 就是那一格', () => {
    const one = grid({ origin: { x: 5, y: 7 }, cols: 1, rows: 1, cell: { w: 30, h: 40 }, gap: { x: 99, y: 99 } });
    expect(one.bounds).toEqual({ x: 5, y: 7, w: 30, h: 40 });
    expect(one.cell(0, 0)).toEqual({ x: 5, y: 7, w: 30, h: 40 });
  });
});
