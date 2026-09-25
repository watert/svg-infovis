// =====================================================================
// geometry/pack · 节距 `pitch` 与逐项缝 `gap[]`(260925 加的两个主轴增强)
//
// 这份测试钉三件事:
//   ① **换算方向** —— `pitch` 是"前缘到前缘"(col = 顶到顶, row = 左到左), 不是缝。尺寸参差时
//      每一项换算出的缝各不相同; 把 pitch 当 gap 用会一路累积错位, 而图上门禁看不出来。
//   ② **结构性错误当场抛, 且点得出是第几项** —— 节距与缝同给 / 某项尺寸超节距 / 缝数组长度不符 /
//      缝为负。参差的链里不指名, 作者只能逐项试。
//   ③ **单值路径一字未改** —— 单值 gap 与等值数组必须逐字同结果、`pitch = extent + gap` 同尺寸时
//      必须与旧写法(手写 `gap: 100 - BOX.h`)逐字同结果(仓外还有 288 组逐字节基线 + PNG 快照)。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { packCol, packRow } from '../src/geometry/pack';
import { type Size } from '../src/geometry/box';
import { ShapeInputError } from '../src/guard';

/** full-chain 手定的五格(节距 100 那条链: 旧写法是 `gap: 100 - BOX.h`) */
const BOX: Size = { w: 150, h: 46 };
/** node-forms 的真实三个尺寸(矩形 / 菱形 / 圆柱) —— 参差才试得出"逐项换算" */
const FORMS: Size[] = [{ w: 74, h: 54 }, { w: 161, h: 107 }, { w: 86, h: 107 }];

/** 取出守卫抛的那个错(比 toThrow 更能断言"抛的是哪一种 + 说清了哪个字段") */
const guardErr = (fn: () => unknown): ShapeInputError => {
  try {
    fn();
  } catch (e) {
    if (e instanceof ShapeInputError) return e;
    throw e;
  }
  throw new Error('本该抛 ShapeInputError, 却没抛 —— 增强项漏了守卫');
};

describe('geometry/pack · 节距 pitch 与逐项缝 gap[]', () => {
  it('pitch = **前缘到前缘**(col 顶到顶): 同尺寸链与旧写法 `gap: 100 - BOX.h` 逐字同结果', () => {
    const byPitch = packCol({ items: [BOX, BOX, BOX], pitch: 100, x: 250, y0: 40, align: 'start' });
    const legacy = packCol({ items: [BOX, BOX, BOX], gap: 100 - BOX.h, x: 250, y0: 40, align: 'start' });
    expect(byPitch.rects.map((r) => [r.x, r.y])).toEqual([[250, 40], [250, 140], [250, 240]]);
    expect(JSON.stringify(byPitch)).toBe(JSON.stringify(legacy));
  });

  it('pitch 逐项换算: 尺寸参差时**每一项的缝都不同**, 而"顶到顶"处处相等', () => {
    const r = packCol({ items: FORMS, pitch: 200, x: 0, y0: 30 }).rects;
    expect(r.map((q) => q.y)).toEqual([30, 230, 430]);
    // 节距是那条不变量(顶到顶处处 200) —— 缝是它的**结果**, 不是输入
    for (let i = 1; i < r.length; i++) expect(r[i].y - r[i - 1].y).toBe(200);
    // 反推的缝: 200 − 54 / 200 − 107(参差链里这就是"每块之间的空档不一样")
    expect([r[0].y + r[0].h, r[1].y + r[1].h]).toEqual([84, 337]);
    expect([r[1].y - (r[0].y + r[0].h), r[2].y - (r[1].y + r[1].h)]).toEqual([146, 93]);
    // row 方向同理: 左到左
    const row = packRow({ items: [{ w: 100, h: 50 }, { w: 60, h: 80 }], pitch: 120, y: 0, x0: 10 });
    expect(row.rects).toEqual([{ x: 10, y: 0, w: 100, h: 50 }, { x: 130, y: 0, w: 60, h: 80 }]);
  });

  it('pitch 与 gap **互斥**: 同时给当场抛; 一个都不给同样抛', () => {
    const e = guardErr(() => packCol({ items: [BOX, BOX], gap: 20, pitch: 100, x: 0, y0: 0 }));
    expect(e.shape).toBe('packCol');
    expect(e.field).toBe('pitch');
    expect(e.message).toContain('二选一');
    const eRow = guardErr(() => packRow({ items: [BOX, BOX], gap: 20, pitch: 100, y: 0, x0: 0 }));
    expect(eRow.shape).toBe('packRow');
    expect(eRow.field).toBe('pitch');
    // 一个都不给同样抛(不然只能静默密排, 而密排是"间距不明的 0")
    expect(guardErr(() => packCol({ items: [BOX, BOX], x: 0, y0: 0 })).field).toBe('gap');
    // 两样都是普通可选字段(不是排他联合, 见 `PackSpacing` 的 ⚠): "改一个字段"的存量写法在这里
    // 落到下面这条**读得懂**的守卫上, 而不是 tsc 里一句"pitch 不能赋给 undefined"
    const opts = { items: [BOX, BOX], gap: 20, x: 0, y0: 0 };
    expect(guardErr(() => packCol({ ...opts, pitch: 100 })).field).toBe('pitch');
  });

  it('某项尺寸 > pitch → 当场抛(会重叠), 报错**指名第几项**', () => {
    const e = guardErr(() => packCol({ items: FORMS, pitch: 100, x: 0, y0: 0 }));
    // 54 合格、107 越界 —— 报的是第二项(0 起), 不是"某项"
    expect(e.field).toBe('items[1]');
    expect(e.message).toContain('items[1]');
    expect(e.message).toContain('107');
    expect(e.message).toContain('pitch(100)');
    // row 方向量的是宽
    const eRow = guardErr(() => packRow({ items: [{ w: 100, h: 50 }, { w: 90, h: 80 }], pitch: 80, y: 0, x0: 0 }));
    expect(eRow.field).toBe('items[0]');
    expect(eRow.message).toContain('宽(100)');
    // 边界: 尺寸**恰好等于** pitch 不抛(那是密排, 缝 0), pitch 本身非有限也抛
    expect(packCol({ items: [BOX], pitch: BOX.h, x: 0, y0: 0 }).rects).toEqual([{ x: 0, y: 0, w: 150, h: 46 }]);
    expect(guardErr(() => packCol({ items: [BOX, BOX], pitch: NaN, x: 0, y0: 0 })).field).toBe('pitch');
  });

  it('gap 数组: 逐项缝(三段 y 链 38 / 58 参差那种, 单值表达不了)', () => {
    const col = packCol({ items: FORMS, gap: [38, 58], x: 0, y0: 0 }).rects;
    expect(col.map((q) => q.y)).toEqual([0, 92, 257]);   // 54 + 38 / 107 + 58
    expect(col[1].y - (col[0].y + col[0].h)).toBe(38);
    expect(col[2].y - (col[1].y + col[1].h)).toBe(58);
    const row = packRow({ items: [{ w: 10, h: 10 }, { w: 20, h: 20 }, { w: 5, h: 5 }], gap: [7, 3], y: 0, x0: 0 }).rects;
    expect(row.map((q) => q.x)).toEqual([0, 17, 40]);
    // 退化: 空 items 与单项的合法缝条数都是 0(0 个盒 0 条缝 / 1 个盒 0 条缝)
    expect(packCol({ items: [], gap: [], x: 0, y0: 0 })).toEqual({ rects: [], bounds: null });
    expect(packCol({ items: [BOX], gap: [], x: 0, y0: 0 }).rects).toEqual([{ x: 0, y: 0, w: 150, h: 46 }]);
  });

  it('gap 数组长度必须 = items.length − 1: 长一条 / 短一条都抛(消息里带两个数)', () => {
    const short = guardErr(() => packCol({ items: FORMS, gap: [38], x: 0, y0: 0 }));
    expect(short.field).toBe('gap');
    expect(short.message).toContain('长度 1 ≠ items.length − 1 (2)');
    expect(guardErr(() => packCol({ items: [BOX, BOX], gap: [38, 58], x: 0, y0: 0 })).message).toContain('(1)');
    // 单项 / 空 items 给一条缝同样抛 —— "缝无处放"是明错, 不是多余项
    expect(guardErr(() => packCol({ items: [BOX], gap: [10], x: 0, y0: 0 })).field).toBe('gap');
    expect(guardErr(() => packCol({ items: [], gap: [10], x: 0, y0: 0 })).field).toBe('gap');
    expect(guardErr(() => packRow({ items: FORMS, gap: [], y: 0, x0: 0 })).message).toContain('(2)');
  });

  it('gap 数组逐项校验: 负值 / NaN / Infinity 当场抛, 报错点名**那一项**', () => {
    const neg = guardErr(() => packCol({ items: FORMS, gap: [38, -1], x: 0, y0: 0 }));
    expect(neg.field).toBe('gap[1]');
    expect(neg.message).toContain('为负(-1)');
    expect(guardErr(() => packCol({ items: FORMS, gap: [NaN, 10], x: 0, y0: 0 })).field).toBe('gap[0]');
    const inf = guardErr(() => packRow({ items: [BOX, BOX], gap: [Infinity], y: 0, x0: 0 }));
    expect(inf.field).toBe('gap[0]');
    expect(inf.message).toContain('Infinity');
  });

  it('等价切片: 单值 gap ≡ 等值数组; 同尺寸下 pitch ≡ (extent + gap) —— 逐字节口径', () => {
    const scalar = packCol({ items: FORMS, gap: 40, x: 100, y0: 0 });
    expect(JSON.stringify(packCol({ items: FORMS, gap: [40, 40], x: 100, y0: 0 }))).toBe(JSON.stringify(scalar));
    // 五格横排那种"同尺寸 + 固定缝": 两个说法必须同结果(否则从 gap 迁到 pitch 会悄悄挪图)
    const byGap = packRow({ items: [BOX, BOX], gap: 170, y: 330, x0: 90, align: 'start' });
    const byPitch = packRow({ items: [BOX, BOX], pitch: BOX.w + 170, y: 330, x0: 90, align: 'start' });
    expect(JSON.stringify(byPitch)).toBe(JSON.stringify(byGap));
    // 参差时两者本就**不该**同结果 —— 这两行是"别把 pitch 当 gap"的对照:
    // pitch 120 换算出的缝是 66 / 13, 只有第一项的 54 + 40 与 gap: 40 对得上, 后两项就错开了
    expect(packCol({ items: FORMS, gap: 40, x: 0, y0: 0 }).rects.map((r) => r.y)).toEqual([0, 94, 241]);
    expect(packCol({ items: FORMS, pitch: 120, x: 0, y0: 0 }).rects.map((r) => r.y)).toEqual([0, 120, 240]);
  });

  it('空 / 单项退化: pitch 路径下同样不出 NaN; 且**不 mutate 入参**(items 与 gap 数组)', () => {
    expect(packCol({ items: [], pitch: 100, x: 0, y0: 0 })).toEqual({ rects: [], bounds: null });
    const items: Size[] = [{ w: 33.33, h: 20.25 }, { w: 10, h: 10 }];
    const gaps = [7.7];
    const snapshot = JSON.parse(JSON.stringify({ items, gaps }));
    const r = packCol({ items, gap: gaps, x: 100.05, y0: 0, align: 'center' }).rects;
    expect(r[0]).toEqual({ x: 83.4, y: 0, w: 33.33, h: 20.25 });   // 100.05 − 16.665 → round1
    expect(r[1].y).toBe(28);                                        // 20.25 + 7.7 → round1
    expect(JSON.parse(JSON.stringify({ items, gaps }))).toEqual(snapshot);
    expect(packCol({ items, gap: [7.7], x: 100.05, y0: 0, align: 'center' }).rects).toEqual(r);
  });
});
