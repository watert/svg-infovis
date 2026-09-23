// =====================================================================
// icons/path-data · `d` 字符串的坐标改写
//
// 这个文件是**被闭环用例咬出来才存在**的(260920): `iconShape` 早先对 circle / rect / ellipse 逐一
// 算过缩放后的坐标, 唯独 `path` 是原文照搬 —— 而 lucide 里 6470 处是 `<path>`。后果是图标绝大多
// 数笔画被画在**素材自己的 24×24 原点**上, 而 `audit` 一声不响(图标不进净空门禁)。是
// `test/ontology-e2e.test.ts` 那条"图标没被裁掉"的断言把它照出来的 —— 顺带说明"闭环验收"为什么
// 值: 逐块单测全绿, 拼起来照样能画歪一整个图标。
//
// 本文件钉住四条最容易写错、且**失败得不像失败**的规矩:
//   ① 相对命令的增量只乘比例(**不吃平移**)
//   ② `d` 开头的 `m` 的**第一对**坐标是绝对的(SVG 规定路径起点的当前点是 (0,0))
//   ③ `A` 的两个标志位按整数输出(`0.00` 会被解析成"标志 0 + 新数字 .00")
//   ④ 认不出来的一律抛(参数个数不对的路径会画成另一条线, 不许"尽力而为")
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { type PathMapper, mapPathData, parsePathData } from '../src/icons/path-data';
import { iconShape } from '../src/shapes/icon';
import { iconFromSvg } from '../src/icons/lucide';
import { ShapeInputError } from '../src/guard';

/** 放大 4 倍、平移到 (100, 200) —— 绝对坐标吃平移, 相对增量不吃 */
const M: PathMapper = { x: (v) => 100 + v * 4, y: (v) => 200 + v * 4, scale: 4 };

/** 从 `d` 里把所有数字抠出来(断言用; 命令字母与数字的边界本来就清楚) */
const nums = (d: string): number[] => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
/** 命令序列(字母) */
const cmds = (d: string): string[] => d.match(/[MmLlHhVvCcSsQqTtAaZz]/g) ?? [];

const throws = (fn: () => unknown): ShapeInputError => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ShapeInputError);
    return e as ShapeInputError;
  }
  throw new Error('本该抛 ShapeInputError, 却没有');
};

describe('path-data · 命令解析', () => {
  it('全量命令集都能拆(字母大小写保留 —— 相对/绝对是语义)', () => {
    const d = 'M1 2 L3 4 H5 V6 C1 1 2 2 3 3 S4 4 5 5 Q6 6 7 7 T8 8 A1 1 0 0 1 9 9 Z m1 1 l1 1 h1 v1 c1 1 1 1 1 1 s1 1 1 1 q1 1 1 1 t1 1 a1 1 0 0 0 1 1 z';
    expect(cmds(d)).toEqual(['M', 'L', 'H', 'V', 'C', 'S', 'Q', 'T', 'A', 'Z', 'm', 'l', 'h', 'v', 'c', 's', 'q', 't', 'a', 'z']);
    expect(parsePathData(d)).toHaveLength(20);
  });

  it('紧凑写法照收: 隐式重复(`m8 22 4-11 4 11`)、无分隔符负数(`-2-4`)、省略前导 0(`.5`/`-.5`)', () => {
    expect(parsePathData('m8 22 4-11 4 11').map((c) => c.args)).toEqual([[8, 22, 4, -11, 4, 11]]);
    expect(parsePathData('M1-2L3-4').map((c) => c.args)).toEqual([[1, -2], [3, -4]]);
    expect(parsePathData('M.5-.5').map((c) => c.args)).toEqual([[0.5, -0.5]]);
    // `1.2.3` 是两个数(1.2 与 .3) —— 这是合法路径数据, 断错了坐标就整体偏
    expect(parsePathData('M1.2.3').map((c) => c.args)).toEqual([[1.2, 0.3]]);
  });

  it('弧的两个 flag 是**单字符**: 糊在一起的 `000` 要读成 0/0 两个标志 + 0 一个坐标', () => {
    // 这两条是语料里的原样写法(1853 个图标里 126 个踩它, 当年按"数字 token"切会读成 5 个参数)
    expect(parsePathData('M10 3a41 41 0 000 18').map((c) => c.args)).toEqual([[10, 3], [41, 41, 0, 0, 0, 0, 18]]);
    expect(parsePathData('M20.001 19A2 2 0 0022 17').map((c) => c.args)).toEqual([[20.001, 19], [2, 2, 0, 0, 0, 22, 17]]);
    expect(parsePathData('M0 0a2 2 0 001.999 2').map((c) => c.args)).toEqual([[0, 0], [2, 2, 0, 0, 0, 1.999, 2]]);
  });

  it('flag 不是 0/1 → 抛(少了它后面所有坐标都会串位)', () => {
    expect(throws(() => parsePathData('M0 0a2 2 0 2010 10')).field).toBe('d');
    expect(throws(() => parsePathData('M0 0a2 2 0 0')).field).toBe('d');
  });

  it('参数个数不对 / 有解析不了的片段 → 抛(画成另一条线比抛错贵得多)', () => {
    expect(throws(() => parsePathData('M1 2 L3')).field).toBe('d'); // L 缺一个参数
    expect(throws(() => parsePathData('M1 2 L')).field).toBe('d'); // L 一个参数都没有
    expect(throws(() => parsePathData('M1 2 A1 1 0 0 1 9')).field).toBe('d'); // 弧缺端点
    expect(throws(() => parsePathData('M1 2 z 3 4')).field).toBe('d'); // z 不吃参数
    expect(throws(() => parsePathData('M1 2 @3')).field).toBe('d'); // 不认识的片段
    expect(throws(() => parsePathData('1 2')).field).toBe('d'); // 开头就是数字
  });
});

describe('path-data · 改写', () => {
  it('绝对坐标吃平移, 相对增量不吃(后者吃了图标会随平移整体飘走)', () => {
    expect(mapPathData('M1 1', M)).toBe('M 104.00 204.00');
    // 相对: (1,1)×4 = (4,4), 不加 (100,200)
    expect(mapPathData('m1 1', M)).toBe('m 104.00 204.00'); // 见下一条: 开头的 m 第一对是绝对的
    expect(mapPathData('M0 0 l1 1', M)).toBe('M 100.00 200.00 l 4.00 4.00');
  });

  it('**开头的 `m` 的第一对坐标是绝对的**(SVG 规定路径起点的当前点是 (0,0))', () => {
    // 这条 260920 真栽过: 放射塔底下那个小三角被丢在 (36.67, 100.83) 而不是框里
    expect(mapPathData('m8 22 4-11 4 11', M)).toBe('m 132.00 288.00 16.00 -44.00 16.00 44.00');
    // 第一条命令是 M/L 时不受影响; 非首条命令的 `m` 是真增量
    expect(mapPathData('M0 0 m1 1', M)).toBe('M 100.00 200.00 m 4.00 4.00');
  });

  it('H / V: 绝对走映射, 相对只乘比例', () => {
    expect(mapPathData('M0 0 H6 V8', M)).toBe('M 100.00 200.00 H 124.00 V 232.00');
    expect(mapPathData('M0 0 h6 v8', M)).toBe('M 100.00 200.00 h 24.00 v 32.00');
  });

  it('A: 半径乘比例, 标志位**按整数**输出(写成 0.00 会被解析成"标志 0 + 新数字 .00")', () => {
    const out = mapPathData('M0 0 a2 3 0 1 0 4 5', M);
    expect(out).toBe('M 100.00 200.00 a 8.00 12.00 0.00 1 0 16.00 20.00');
    expect(out).not.toContain('1.00 0.00 16.00'); // 标志位没被 fmt 成小数
    // 绝对弧的端点吃平移
    expect(mapPathData('M0 0 A2 3 0 0 1 4 5', M)).toBe('M 100.00 200.00 A 8.00 12.00 0.00 0 1 116.00 220.00');
  });

  it('C / S / Q / T 的每一对坐标都过映射(控制点也不例外)', () => {
    expect(mapPathData('M0 0 C1 1 2 2 3 3', M)).toBe('M 100.00 200.00 C 104.00 204.00 108.00 208.00 112.00 212.00');
    expect(mapPathData('M0 0 Q1 1 2 2', M)).toBe('M 100.00 200.00 Q 104.00 204.00 108.00 208.00');
    expect(mapPathData('M0 0 T1 1', M)).toBe('M 100.00 200.00 T 104.00 204.00');
  });

  it('Z 原样(大小写都留), 多子路径照常', () => {
    expect(mapPathData('M0 0 L1 1 Z', M)).toBe('M 100.00 200.00 L 104.00 204.00 Z');
    expect(mapPathData('M0 0 L1 1 z M2 2 L3 3', M)).toBe('M 100.00 200.00 L 104.00 204.00 z M 108.00 208.00 L 112.00 212.00');
  });

  it('确定性: 同输入同输出(字节确定是 core 的契约)', () => {
    const d = 'm8 22 4-11 4 11';
    expect(mapPathData(d, M)).toBe(mapPathData(d, M));
  });
});

describe('path-data · 与 iconShape 的闭环(这就是那条事故的回归钉)', () => {
  /** lucide `radio-tower` 的同款形态: 只有 path, 坐标覆盖 2..22(全用绝对命令, 便于取包围盒) */
  const PLANE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">'
    + '<path d="M2 22 L22 22"/><path d="M6.36 17.4 L4 17 L2 13"/></svg>';

  it('纯 path 图标进 100×100 框: 所有坐标落在**框里**, 而不是素材原点附近', () => {
    const g = iconShape({ x: 100, y: 200, w: 100, h: 100, asset: iconFromSvg(PLANE) });
    expect(g.children.every((c) => c.kind === 'path')).toBe(true);
    const all = g.children.flatMap((c) => nums((c as { d: string }).d));
    // 比例 = 100/24; 素材 0..24 ⇒ 画布 x∈[100,200] / y∈[200,300]
    expect(Math.min(...all)).toBeGreaterThanOrEqual(100);
    expect(Math.max(...all)).toBeLessThanOrEqual(300);
    expect(Math.max(...all)).toBeGreaterThan(290); // 反证: 原文照搬时这些数会落在 2..22
  });

  it('两条 path 的两套坐标都过映射(漏掉任何一条都是"图上少一根线")', () => {
    // 24×24 的框下比例恰好 1、平移 0 ⇒ 唯一可见的变化是坐标被 `round1` 收到 1 位小数
    const ds = iconShape({ x: 0, y: 0, w: 24, h: 24, asset: iconFromSvg(PLANE) })
      .children.map((c) => (c as { d: string }).d);
    expect(ds[0]).toBe('M 2.00 22.00 L 22.00 22.00');
    expect(ds[1]).toBe('M 6.40 17.40 L 4.00 17.00 L 2.00 13.00');
  });
});
