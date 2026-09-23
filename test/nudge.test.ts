// =====================================================================
// nudge 回归单测 · align / distribute / snap
//
// 这份只钉三件事 + 四类边界, 每条都对应一种"改错了会静默通过"的口子:
//   · **纯函数性**: 就地改入参 / 输出与入参共享 rect 引用 —— 调用方拿两份结果做 diff 会读到脏数据
//   · **字节确定性**: 同输入两次调用必须逐字节相同(golden 与 diff 的前提); 坐标一律 round1 收口
//   · **只动局部**: 只许改 x / y —— w / h 与 label / bounds_source 等字段原样带过(不动拓扑)
//   · **边界**: 空集 / 单元素 / 已等距不抖动 / 阈值与命中判据的边界(恰好等于阈值 = 命中)
//   · **null 纪律**: 非有限坐标与非法参数 → `items: null` + 诊断, 不抛异常、不返回 NaN、不静默动一半
//
// 断言里刻意钉住的几条语义(实现里最容易"顺手改坏"的地方):
//   · align 是单轴单趟, 参考系统一取"进入本次操作时"的值 —— 迭代收敛会让"以选中集为参照"变成整体平移
//   · distribute 的口径是**间距相等**(与 audit 的 node_gap 同尺子), 不是中心距相等
//   · distribute 保两端: 首项前缘与末项后缘不动(输入已是 1 位小数时逐字节不动)
//   · snap 的命中判据 `|位移| <= threshold`(含边界), 且逐轴独立(不给 x 靶子 = x 一个字都不动)
//   · `moved` 才是"这次动没动"的判据 —— 三把刀恒返回新实例, `===` 判不出来
// =====================================================================

import { describe, expect, it } from 'bun:test';
import {
  type AlignAxis,
  type AlignRef,
  type NudgeItem,
  type NudgeResult,
  align,
  distribute,
  snap,
} from '../src/knives/nudge';

// --- 测试辅助 ----------------------------------------------------------

/** 带额外字段的节点: 用来验"只动 rect, 其他字段原样带过" */
type Box = NudgeItem & { label?: string; bounds_source?: string };

const box = (id: string, x: number, y: number, w: number, h: number, extra: Omit<Partial<Box>, 'id' | 'rect'> = {}): Box => ({
  id,
  rect: { x, y, w, h },
  ...extra,
});

/** 三个同尺寸节点(横向错开 40, 纵向错开 20): 选中集包围盒 10..110 × 0..60 */
const trio = (): Box[] => [box('a', 10, 0, 20, 20), box('b', 50, 20, 20, 20), box('c', 90, 40, 20, 20)];

/** 断言没被拦停并取出 items(拦停时把诊断 code 抛出来, 比对着 undefined 猜要好读) */
function ok<T extends NudgeItem>(r: NudgeResult<T>): T[] {
  if (r.items === null) throw new Error(`期望成功, 实际被拦停: ${r.diagnostics.map((d) => d.code).join(', ')}`);
  return r.items;
}

/** 逐字节比对: JSON 化后的字符串(同输入必同串 —— "可字节比对"就是这么验的) */
const bytes = (v: unknown): string => JSON.stringify(v);

/** 是否已收口到 round1 的 1 位小数 */
const oneDecimal = (v: number): boolean => Math.abs(Number(v.toFixed(1)) - v) < 1e-9;

describe('nudge · 局部微调刀(align / distribute / snap)', () => {
  // --- 纯函数性 --------------------------------------------------------

  it('纯函数性: 三把刀都不 mutate 入参(数组与对象原地不动)', () => {
    const items = [box('a', 0, 0, 100, 20), box('b', 150, 0, 50, 20), box('c', 300, 0, 50, 20)];
    const before = bytes(items);
    align(items, 'left');
    distribute(items, 'x');
    snap(items, { threshold: 4, grid: 20, others: [box('n', 400, 0, 20, 20)] });
    expect(bytes(items)).toBe(before);
    // distribute 内部要排序: 排序走副本, 入参序不许被改(原地 sort 会在这里翻车)
    expect(items.map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });

  it('纯函数性: 输出与入参不共享实例(改输出不反噬入参)', () => {
    const items = [box('a', 10, 0, 20, 20), box('b', 50, 0, 20, 20)];
    const res = align(items, 'left'); // a 本来就在最左: 不动, 但仍是新实例
    const out = ok(res);
    expect(res.moved).toEqual(['b']);
    expect(out[0]).not.toBe(items[0]);
    expect(out[0].rect).not.toBe(items[0].rect);
    expect(out[0].rect.x).toBe(10);
    out[0].rect.x = 999;
    expect(items[0].rect.x).toBe(10); // 入参没被输出牵着改
  });

  it('字节确定性: 同输入两次调用输出逐字节相同', () => {
    const items = [box('a', 13, 7, 50, 30), box('b', 149, 41, 33, 22), box('c', 260, 118, 44, 18)];
    const others = [box('n', 200, 0, 20, 20)];
    const runs: Array<() => unknown> = [
      () => align(items, 'centerY'),
      () => align(items, 'right', { kind: 'canvas', width: 400, height: 240 }),
      () => distribute(items, 'x'),
      () => distribute(items, 'y'),
      () => snap(items, { threshold: 6, grid: 8, others, guides: { x: [200], y: [64] } }),
    ];
    for (const run of runs) expect(bytes(run())).toBe(bytes(run()));
  });

  it('不动拓扑: 只改 x / y, 宽高与其他字段原样带过', () => {
    const items: Box[] = [
      { ...box('a', 10, 0, 20, 30), label: '甲', bounds_source: 'manual' },
      { ...box('b', 50, 20, 20, 30), label: '乙', bounds_source: 'layout' },
    ];
    const results = [align(items, 'left'), distribute(items, 'x'), snap(items, { threshold: 4, grid: 20 })];
    for (const res of results) {
      const out = ok(res);
      expect(out.map((n) => n.id)).toEqual(['a', 'b']); // 顺序不变
      out.forEach((n, i) => {
        expect(n.rect.w).toBe(items[i].rect.w); // 尺寸不变
        expect(n.rect.h).toBe(items[i].rect.h);
        expect(n.label).toBe(items[i].label); // 其他字段原样
        expect(n.bounds_source).toBe(items[i].bounds_source);
      });
    }
  });

  it('边界: 空集三把刀都返回空数组(不抛异常, 也不报诊断)', () => {
    expect(align([], 'bottom')).toEqual({ items: [], moved: [], diagnostics: [] });
    expect(distribute([], 'y').items).toEqual([]);
    expect(snap([], { threshold: 4, grid: 8 }).items).toEqual([]);
  });

  // --- ① align ---------------------------------------------------------

  it('align: 六个面各自命中选中集的对应边 / 中线', () => {
    const cases: Array<{ axis: AlignAxis; wantX?: number; wantY?: number; moved: string[] }> = [
      { axis: 'left', wantX: 10, moved: ['b', 'c'] },
      { axis: 'centerX', wantX: 50, moved: ['a', 'c'] }, // 包围盒中线 = 60
      { axis: 'right', wantX: 90, moved: ['a', 'b'] }, // 包围盒右缘 = 110
      { axis: 'top', wantY: 0, moved: ['b', 'c'] },
      { axis: 'centerY', wantY: 20, moved: ['a', 'c'] }, // 包围盒中线 = 30
      { axis: 'bottom', wantY: 40, moved: ['a', 'b'] }, // 包围盒下缘 = 60
    ];
    for (const c of cases) {
      const res = align(trio(), c.axis);
      for (const it of ok(res)) {
        if (c.wantX !== undefined) expect(it.rect.x).toBe(c.wantX);
        if (c.wantY !== undefined) expect(it.rect.y).toBe(c.wantY);
      }
      expect(res.moved).toEqual(c.moved); // 已经在对齐位上的项不进 moved
    }
  });

  it('align: 参考系三选一(选中集 / 显式 anchor rect / 画布)', () => {
    const anchor: AlignRef = { kind: 'rect', rect: { x: 100, y: 5, w: 40, h: 40 } };
    expect(ok(align(trio(), 'left', anchor)).map((n) => n.rect.x)).toEqual([100, 100, 100]);
    expect(ok(align(trio(), 'centerX', anchor)).map((n) => n.rect.x)).toEqual([110, 110, 110]); // 120 - 10
    expect(ok(align(trio(), 'bottom', anchor)).map((n) => n.rect.y)).toEqual([25, 25, 25]); // 45 - 20

    const canvas: AlignRef = { kind: 'canvas', width: 200, height: 100 };
    expect(ok(align(trio(), 'left', canvas)).map((n) => n.rect.x)).toEqual([0, 0, 0]);
    expect(ok(align(trio(), 'centerX', canvas)).map((n) => n.rect.x)).toEqual([90, 90, 90]); // 100 - 10
    expect(ok(align(trio(), 'right', canvas)).map((n) => n.rect.x)).toEqual([180, 180, 180]);
    expect(ok(align(trio(), 'centerY', canvas)).map((n) => n.rect.y)).toEqual([40, 40, 40]); // 50 - 10
    expect(ok(align(trio(), 'bottom', canvas)).map((n) => n.rect.y)).toEqual([80, 80, 80]);
  });

  it('align: 单元素以选中集为参考系时不动(包围盒就是自己)', () => {
    const res = align([box('a', 10, 20, 30, 40)], 'right');
    expect(ok(res)[0].rect).toEqual({ x: 10, y: 20, w: 30, h: 40 });
    expect(res.moved).toEqual([]);
  });

  it('align: 坐标过 round1 收口(1 位小数, 不留 83.335 这种尾巴)', () => {
    const out = ok(align([box('a', 10, 0, 33.33, 20)], 'centerX', { kind: 'canvas', width: 200, height: 100 }));
    expect(out[0].rect.x).toBe(83.3); // 100 - 33.33 / 2 = 83.335 → 83.3
    expect(oneDecimal(out[0].rect.x)).toBe(true);
  });

  it('null 纪律: 非有限坐标 / 非法参考系整体拦停(不抛异常, 不返回 NaN)', () => {
    const items = [box('ok', 10, 0, 20, 20), box('bad', Number.NaN, 0, 20, 20)];
    const call = () => align(items, 'left');
    expect(call).not.toThrow();
    const res = call();
    expect(res.items).toBeNull();
    expect(res.moved).toEqual([]);
    const d = res.diagnostics[0];
    expect(d.code).toBe('nudge_invalid_rect');
    expect(d.severity).toBe('error');
    expect(d.subject).toEqual({ kind: 'node', id: 'bad' });
    expect(d.evidence.field).toBe('x');
    expect(d.supportedFixes.length).toBeGreaterThan(0);

    // 参考系坏了同样拦停(锚点算不出来 = "不知道"), 且与集合大小无关: 空集也报
    const ref = align(trio(), 'left', { kind: 'canvas', width: Number.POSITIVE_INFINITY, height: 100 });
    expect(ref.items).toBeNull();
    expect(ref.diagnostics[0].code).toBe('nudge_invalid_rect');
    expect(ref.diagnostics[0].subject.id).toBe('canvas');
    expect(align([], 'left', { kind: 'canvas', width: Number.NaN, height: 10 }).items).toBeNull();
  });

  // --- ② distribute ----------------------------------------------------

  it('distribute: 横向等距 —— 相邻净空相等, 首尾外缘不动', () => {
    const items = [box('a', 0, 0, 100, 20), box('b', 150, 0, 50, 20), box('c', 300, 0, 50, 20)];
    const res = distribute(items, 'x');
    const out = ok(res);
    expect(out.map((n) => n.rect.x)).toEqual([0, 175, 300]);
    expect(res.moved).toEqual(['b']); // 两端不动, 只有中间项被挪

    // 口径是"间距相等"(净空), 不是"中心距相等": 间距由 (span - 总宽) / (n - 1) 算出
    const gaps = out.slice(1).map((n, i) => n.rect.x - (out[i].rect.x + out[i].rect.w));
    expect(gaps).toEqual([75, 75]);
    // 两端锚点: 首项前缘 0 与末项后缘 350 逐字节不动
    expect(out[0].rect.x).toBe(0);
    expect(out[2].rect.x + out[2].rect.w).toBe(350);
  });

  it('distribute: 纵向等距(y 轴同一套算法, 换的是轴不是口径)', () => {
    const items = [box('a', 0, 0, 50, 40), box('b', 0, 90, 50, 40), box('c', 0, 200, 50, 40)];
    const res = distribute(items, 'y');
    expect(ok(res).map((n) => n.rect.y)).toEqual([0, 100, 200]);
    expect(res.moved).toEqual(['b']);
    expect(ok(res).map((n) => n.rect.x)).toEqual([0, 0, 0]); // x 一个字都不动
  });

  it('distribute: 已经等距就不抖动(moved 为空, 输出与输入逐字节同值)', () => {
    const items = [box('a', 0, 0, 100, 20), box('b', 175, 0, 50, 20), box('c', 300, 0, 50, 20)];
    const res = distribute(items, 'x');
    expect(res.moved).toEqual([]);
    expect(bytes(ok(res))).toBe(bytes(items));
  });

  it('distribute: 少于两个元素不动(空集 / 单元素 / 两元素都复现原坐标)', () => {
    expect(distribute([], 'x').items).toEqual([]);
    const one = distribute([box('a', 7, 9, 10, 10)], 'x');
    expect(ok(one)[0].rect).toEqual({ x: 7, y: 9, w: 10, h: 10 });
    expect(one.moved).toEqual([]);
    // 两元素的间距由两端定义, 落位必然复现原坐标(边界上不许有量化抖动)
    const two = [box('a', 0, 0, 40, 10), box('b', 90, 0, 40, 10)];
    const res = distribute(two, 'x');
    expect(res.moved).toEqual([]);
    expect(bytes(ok(res))).toBe(bytes(two));
  });

  it('distribute: 乱序入参按前缘排, 输出仍与入参同序', () => {
    const items = [box('b', 150, 0, 50, 20), box('c', 300, 0, 50, 20), box('a', 0, 0, 100, 20)];
    const res = distribute(items, 'x');
    const out = ok(res);
    expect(out.map((n) => n.id)).toEqual(['b', 'c', 'a']); // 入参序
    expect(out.map((n) => n.rect.x)).toEqual([175, 300, 0]); // 内部按前缘排完再落位
    expect(res.moved).toEqual(['b']);
  });

  it('distribute: 空间不够 → 负间距 warning(distribute_overflow), 坐标照给不拦停', () => {
    const items = [box('a', 0, 0, 100, 20), box('b', 10, 0, 100, 20), box('c', 150, 0, 100, 20)];
    const res = distribute(items, 'x');
    expect(ok(res).map((n) => n.rect.x)).toEqual([0, 75, 150]); // 压着也要给坐标(不拦停)
    expect(res.moved).toEqual(['b']);
    const d = res.diagnostics[0];
    expect(d.code).toBe('distribute_overflow');
    expect(d.severity).toBe('warning');
    expect(d.evidence.gap).toBe(-25); // span 250 - 总宽 300 → 间距 -25
    expect(d.evidence.axis).toBe('x');
    expect(d.supportedFixes.length).toBeGreaterThan(0);
  });

  it('distribute: 间距除不尽时留 ≤0.1px 量化残差, 但两端锚点仍逐字节不动', () => {
    const items = [box('a', 0, 0, 100, 20), box('b', 100, 0, 100, 20), box('c', 200, 0, 100, 20), box('d', 301, 0, 100, 20)];
    const out = ok(distribute(items, 'x'));
    expect(out.map((n) => n.rect.x)).toEqual([0, 100.3, 200.7, 301]);
    // 两端: 首前缘 0 / 末后缘 401 不动(它们在代数上就是 span 的定义点)
    expect(out[0].rect.x).toBe(0);
    expect(out[3].rect.x + out[3].rect.w).toBe(401);
    // 中间落位有 round1 收口带来的量化残差, 但必须仍是"看起来等距"(理想间距 1/3)
    const xs = out.map((n) => n.rect.x);
    const gaps = xs.slice(1).map((x, i) => x - (xs[i] + out[i].rect.w));
    for (const g of gaps) expect(Math.abs(g - 1 / 3)).toBeLessThan(0.1);
    expect(out.every((n) => oneDecimal(n.rect.x))).toBe(true);
  });

  it('distribute: 非有限坐标整体拦停, 且点名坏字段(不返回半成品)', () => {
    const res = distribute([box('a', 0, 0, 100, 20), box('bad', Number.POSITIVE_INFINITY, 0, 100, 20)], 'x');
    expect(res.items).toBeNull();
    expect(res.diagnostics[0].code).toBe('nudge_invalid_rect');
    expect(res.diagnostics[0].evidence.field).toBe('x');
    // 坏的是 w 就点名 w; 单元素也先过守卫(拦停与元素个数无关)
    const w = distribute([box('bad', 0, 0, Number.NaN, 20)], 'x');
    expect(w.items).toBeNull();
    expect(w.diagnostics[0].evidence.field).toBe('w');
  });

  // --- ③ snap ----------------------------------------------------------

  it('snap: 栅格吸附 —— 阈值内取 |位移| 最小的面', () => {
    const res = snap([box('a', 13, 7, 50, 30)], { threshold: 4, grid: 20 });
    const out = ok(res);
    // x: 面 13 / 38 / 63 → 位移 +7 / +2 / -3 ⇒ 取 +2 → x=15(中线 40 落在格点上)
    expect(out[0].rect.x).toBe(15);
    expect(out[0].rect.x + out[0].rect.w / 2).toBe(40);
    // y: 面 7 / 22 / 37 → 位移 -7 / -2 / +3 ⇒ 取 -2 → y=5(中线 20 落在格点上)
    expect(out[0].rect.y).toBe(5);
    expect(out[0].rect.y + out[0].rect.h / 2).toBe(20);
    expect(res.moved).toEqual(['a']);
  });

  it('snap: 邻居边吸附(右缘贴住邻居左缘: 面 × 面全交叉)', () => {
    const res = snap([box('a', 48, 0, 50, 20)], { threshold: 4, others: [box('n', 100, 0, 20, 20)] });
    const out = ok(res);
    expect(out[0].rect.x).toBe(50);
    expect(out[0].rect.x + out[0].rect.w).toBe(100); // 贴边闭合
    expect(out[0].rect.y).toBe(0); // y 轴与邻居的面对齐(位移 0), 不进 moved
    expect(res.moved).toEqual(['a']);
  });

  it('snap: 对齐线吸附, 且两轴独立(没给 x 靶子 y 就一个字都不动)', () => {
    const res = snap([box('a', 68, 33.4, 50, 20)], { threshold: 4, guides: { x: [120] } });
    const out = ok(res);
    expect(out[0].rect.x).toBe(70); // 右缘 118 → 吸到 120
    expect(out[0].rect.y).toBe(33.4); // 只给了 x 对齐线: y 原样(连 round1 重写都没有)
    expect(res.moved).toEqual(['a']);
  });

  it('snap: 阈值边界 —— 位移恰好等于阈值命中, 超过一点点不动', () => {
    // 右缘 97 → 位移恰好 3 = 阈值: 命中(含边界, 与 audit 的"等于阈值即通过"同向)
    const hit = snap([box('a', 47, 0, 50, 20)], { threshold: 3, guides: { x: [100] } });
    expect(ok(hit)[0].rect.x).toBe(50);
    // 右缘 96.9 → 位移 3.1 > 3: 不动
    const miss = snap([box('b', 46.9, 0, 50, 20)], { threshold: 3, guides: { x: [100] } });
    expect(ok(miss)[0].rect.x).toBe(46.9);
    expect(miss.moved).toEqual([]);
  });

  it('snap: 一个靶子都没有 → 原样返回 + snap_no_targets warning(不静默当成"吸好了")', () => {
    const items = [box('a', 13, 7, 50, 30)];
    const res = snap(items, { threshold: 4 });
    expect(res.items).not.toBeNull();
    expect(res.moved).toEqual([]);
    expect(bytes(ok(res))).toBe(bytes(items));
    const d = res.diagnostics[0];
    expect(d.code).toBe('snap_no_targets');
    expect(d.severity).toBe('warning');
    expect(d.supportedFixes.length).toBeGreaterThan(0);
  });

  it('snap: 阈值 / 栅格步长非法一律拦停(负数不许当 0 用)', () => {
    const illegal: Array<Parameters<typeof snap>[1]> = [
      { threshold: Number.NaN },
      { threshold: -1 },
      { threshold: 4, grid: 0 },
      { threshold: 4, grid: { x: -8 } },
    ];
    for (const opts of illegal) {
      const res = snap(trio(), opts);
      expect(res.items).toBeNull();
      expect(res.diagnostics[0].code).toBe('nudge_invalid_param');
      expect(res.diagnostics[0].supportedFixes.length).toBeGreaterThan(0);
    }
    // 合法参数照常放行: 阈值 0 是合法退化(只有已经精确命中的才动)
    expect(ok(snap(trio(), { threshold: 0, grid: 20 })).length).toBe(3);
    expect(ok(snap(trio(), { threshold: 4, grid: { x: 20 } })).length).toBe(3);
  });

  it('snap: others 是几何输入, 靶子坏了同样拦停(不跳过坏靶子接着吸)', () => {
    const res = snap([box('a', 13, 7, 50, 30)], { threshold: 4, others: [box('n', Number.NaN, 0, 10, 10)] });
    expect(res.items).toBeNull();
    expect(res.diagnostics[0].code).toBe('nudge_invalid_rect');
    expect(res.diagnostics[0].subject).toEqual({ kind: 'node', id: 'n' });
  });
});
