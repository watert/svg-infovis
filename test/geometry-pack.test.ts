// =====================================================================
// geometry/pack · 摆放列 / 行的语义判据
//
// 钉三件事:
//   ① **`x` / `y` 是"对齐线"而不是"左缘 / 顶边"** —— `align: 'center'` 时它是每项的中心线。
//      这是全套 API 里最容易读错的一位(读成左缘 → 尺寸参差的那几项整体偏移半个格宽);
//      下面用 node-forms 的**真实三个尺寸**(矩形 / 菱形 / 圆柱)把三档都锁住。
//   ② **主轴是"次序 + 同一份 gap"** —— 每个客户各写一遍的 `y + h + 40` 在这里只有一行;
//      gap = 0 时退化成密排(相邻两项共边), 不是"间距不明的 0"。
//   ③ **不 mutate 入参**: items 是尺寸列(常来自 `nodeFit` / `cardFit` 的返回, 是共享对象),
//      pack 只读 `w/h`, 且不复用入参对象当输出。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { packCol, packRow } from '../src/geometry/pack';
import { bounds } from '../src/geometry/box';

/** node-forms 的真实三个尺寸(矩形 / 菱形 / 圆柱) —— 参差不齐才试得出"对齐线"的语义 */
const FORMS = [{ w: 74, h: 54 }, { w: 161, h: 107 }, { w: 86, h: 107 }];
const CX = 277;   // 三格共用的中心线(= 首格左缘 240 + 半个矩形宽)
const Y0 = 30;

describe('geometry/pack · 摆放列 / 行(对齐线 · 次序 · 不 mutate)', () => {
  it('packCol `align: center`: x 是**中心线**, 尺寸参差也同心(node-forms 那三格)', () => {
    const r = packCol({ items: FORMS, gap: 40, x: CX, y0: Y0, align: 'center' }).rects;
    expect(r).toEqual([
      { x: 240, y: 30, w: 74, h: 54 },
      { x: 196.5, y: 124, w: 161, h: 107 },
      { x: 234, y: 271, w: 86, h: 107 },
    ]);
    // 三格中心恒等于 CX —— "同心"是这条语义的可证形式
    for (const q of r) expect(q.x + q.w / 2).toBe(CX);
  });

  it('packCol `start` / `end`: 对齐线分别是每项的**左边** / **右边**(缺省是 start)', () => {
    const start = packCol({ items: FORMS, gap: 40, x: 240, y0: Y0 }).rects;
    expect(start.map((q) => q.x)).toEqual([240, 240, 240]);
    expect(start).toEqual(packCol({ items: FORMS, gap: 40, x: 240, y0: Y0, align: 'start' }).rects);
    const end = packCol({ items: FORMS, gap: 40, x: 400, y0: Y0, align: 'end' }).rects;
    expect(end.map((q) => q.x)).toEqual([400 - 74, 400 - 161, 400 - 86]);
    // 主轴不受 align 影响: 三档的 y 序列逐字相同(次序 + gap 说了算)
    expect(start.map((q) => q.y)).toEqual([30, 124, 271]);
    expect(end.map((q) => q.y)).toEqual(start.map((q) => q.y));
  });

  it('packRow: `y` 是交叉轴对齐线, `x0` 是主轴起点(次序自左而右)', () => {
    const items = [{ w: 100, h: 50 }, { w: 60, h: 80 }, { w: 40, h: 30 }];
    const start = packRow({ items, gap: 20, y: 200, x0: 10 }).rects;
    expect(start).toEqual([
      { x: 10, y: 200, w: 100, h: 50 },
      { x: 130, y: 200, w: 60, h: 80 },
      { x: 210, y: 200, w: 40, h: 30 },
    ]);
    const center = packRow({ items, gap: 20, y: 200, x0: 10, align: 'center' }).rects;
    expect(center.map((q) => q.y)).toEqual([175, 160, 185]);
    for (const q of center) expect(q.y + q.h / 2).toBe(200);
    const end = packRow({ items, gap: 20, y: 200, x0: 10, align: 'end' }).rects;
    expect(end.map((q) => q.y)).toEqual([150, 120, 170]);
    // 主轴逐字相同(align 只管交叉轴)
    expect(center.map((q) => q.x)).toEqual(start.map((q) => q.x));
  });

  it('gap = 0 的退化: 密排(相邻两项共边), 不是"间距不明的 0"', () => {
    const r = packRow({ items: [{ w: 10, h: 10 }, { w: 20, h: 20 }], gap: 0, y: 0, x0: 0 }).rects;
    expect(r).toEqual([{ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 20, h: 20 }]);
    const c = packCol({ items: [{ w: 10, h: 10 }, { w: 20, h: 20 }], gap: 0, x: 0, y0: 0 }).rects;
    expect(c[1].y).toBe(10);
    // 单列 / 单行 / 空列三种退化都不得出 NaN
    expect(packCol({ items: [FORMS[1]], gap: 40, x: 0, y0: 0 }).rects).toEqual([{ x: 0, y: 0, w: 161, h: 107 }]);
    expect(packCol({ items: [], gap: 40, x: 0, y0: 0 })).toEqual({ rects: [], bounds: null });
  });

  it('`w/h` 原样带出(尺寸是入参的), 落点按 round1 取整; 且**不 mutate 入参**', () => {
    const items = [{ w: 33.33, h: 20.25 }, { w: 10, h: 10 }];
    const snapshot = JSON.parse(JSON.stringify(items));
    const r = packCol({ items, gap: 7.7, x: 100.05, y0: 0, align: 'center' }).rects;
    expect(r[0]).toEqual({ x: 83.4, y: 0, w: 33.33, h: 20.25 });   // 100.05 − 16.665 → round1
    expect(r[1].y).toBe(28);                                        // 20.25 + 7.7 → round1
    expect(items).toEqual(snapshot);                                // 入参一个数都没动
    expect(r[0]).not.toBe(items[0]);                                // 也不把入参对象当输出复用
  });

  it('与 `bounds` 组合: 整列的组框 = 并集外扩 pad(academic 的左栏框就是这条)', () => {
    const col = packCol({ items: FORMS, gap: 40, x: CX, y0: Y0, align: 'center' });
    // 并集取的是**最外**的那条: 右缘由最宽的菱形(161)说了算, 不是矩形那一列
    expect(col.bounds).toEqual({ x: 196.5, y: 30, w: 161, h: 348 });
    // 并集是"裸"的(无 pad): 加 pad 才得到框, 且 pad 正数**外扩**
    expect(bounds(col.rects, { pad: [30, 26] })).toEqual({ x: 166.5, y: 4, w: 221, h: 400 });
    expect(bounds(col.rects, { pad: 0 })).toEqual(col.bounds);
    // 每格都落在自己那栏的并集里(框跟着内容走的前提)
    for (const q of col.rects) {
      expect(q.x).toBeGreaterThanOrEqual(col.bounds!.x);
      expect(q.y + q.h).toBeLessThanOrEqual(col.bounds!.y + col.bounds!.h);
    }
  });
});
