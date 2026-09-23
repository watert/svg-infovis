// =====================================================================
// constraints 回归单测 · 一维约束账本 + 最长路
//
// 这份测试守的是**本刀存在的理由**, 不是它的代码行:
//   · **多源竞争要取对**: 同一格上多条要求(相邻的 + 跨格的)谁大用谁 —— "逐格 max" 只对相邻格
//     成立, 跨格要求要沿链累积。取错(比如只认相邻那条)图上不会报错, 只会悄悄挤。
//   · **账与解一致**: `winners` / `tight` / `attribution` 是从最终解反读的; 一旦有人把"松弛途中的
//     中间状态"记进账, 这里立刻红 —— 账本撒谎比算错更坏(下游会拿它当依据)。
//   · **不注入缺省间距**: 空约束 ⇒ 位置全在 origin。缺省间距是**政策**, 政策属调用方;
//     内核里长出一个, 等于把某张模板的口味焊进所有图。
//   · **环当场拒绝**: `from >= to` 抛错而不是迭代转死 —— 转死会把矛盾拖成产物里的怪坐标。
//   · **确定性**: 同一组要求打乱顺序必须解出同一份结果(产物逐字节可比对的前提)。
//
// 断言里刻意钉住的几条语义(实现里最容易"顺手改坏"的地方):
//   · 位置**向上**取到 0.1: 舍入把 "≥ N" 变成 "差点不够" 是静默事故, 所以下界小的约束会被抬
//     到网格上(`tight` 里挂的是**生效值**, 12.34 上账成 12.4)
//   · `attribution` 只收**跨过这一格且紧住解**的约束的 contributor(去重 + codepoint 序)
//   · `origin` 只是坐标原点(整体平移), 不是间距来源
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { type AxisConstraint, ShapeInputError, round1, solveAxis } from '../src/index';

const c = (from: number, to: number, minimum: number, contributor?: string): AxisConstraint =>
  ({ from, to, minimum, ...(contributor === undefined ? {} : { contributor }) });

describe('constraints · 一维约束账本 + 最长路', () => {
  it('① 空约束: 所有位置 = origin, gaps 全 0 —— 内核不注入任何缺省间距(缺省间距是政策, 属调用方)', () => {
    const p = solveAxis({ count: 4 });
    expect(p.positions).toEqual([0, 0, 0, 0]);
    expect(p.gaps).toEqual([0, 0, 0]);
    expect(p.winners).toEqual([null, null, null, null]);
    expect(p.tight).toEqual([]);
    expect(p.attribution.every((a) => a.by.length === 0)).toBe(true);
    // origin 是坐标原点(整体平移), 不是"第一个间距": 给了 origin 也不许有谁被顺手拉开
    expect(solveAxis({ count: 3, origin: 120 }).positions).toEqual([120, 120, 120]);
    expect(solveAxis({ count: 1 }).gaps).toEqual([]); // 单变量没有"相邻格"可算
  });

  it('② 链式: 逐格最小间距各 10 ⇒ gaps 全是 10(累积是账本的基本盘)', () => {
    const p = solveAxis({ count: 4, constraints: [c(0, 1, 10, 'a'), c(1, 2, 10, 'b'), c(2, 3, 10, 'c')] });
    expect(p.positions).toEqual([0, 10, 20, 30]);
    expect(p.gaps).toEqual([10, 10, 10]);
    expect(p.tight.map((x) => x.contributor)).toEqual(['a', 'b', 'c']);
    expect(p.winners.map((w) => w?.contributor ?? null)).toEqual([null, 'a', 'b', 'c']);
    // 同一格上两条**同名**要求: 取大的那条, 名字只留一份(账目去重 + codepoint 序)
    const dup = solveAxis({ count: 2, constraints: [c(0, 1, 5, '同名'), c(0, 1, 9, '同名')] });
    expect(dup.gaps).toEqual([9]);
    expect(dup.attribution[0].by).toEqual(['同名']);
  });

  it('③ 多源竞争: 链和 30 被一条 (0→3, 100) 顶开 ⇒ 总距 100, 且 attribution 读得出是那一条', () => {
    const chain = [c(0, 1, 10, 'chain:a'), c(1, 2, 10, 'chain:b'), c(2, 3, 10, 'chain:c')];
    const p = solveAxis({ count: 4, constraints: [...chain, c(0, 3, 100, 'span:三格标题')] });

    expect(p.positions).toEqual([0, 10, 20, 100]);
    expect(p.positions[3] - p.positions[0]).toBe(100); // 跨格那条赢, 不是链和 30
    expect(p.gaps).toEqual([10, 10, 80]);
    expect(p.winners[3]?.contributor).toBe('span:三格标题'); // 末位是它顶的, 不是 c(2,3,10)
    // 它跨过的那三格, 账上都写着它 —— "这三格是被那条跨 3 格的要求撑起来的"
    expect(p.attribution.map((a) => a.by)).toEqual([
      ['chain:a', 'span:三格标题'],
      ['chain:b', 'span:三格标题'],
      ['span:三格标题'],
    ]);
    // 若实现退化成"只认相邻格"(逐格 max), 上面三条(positions / gaps / attribution)立刻红
  });

  it('④ 紧度一致: tight 里每条都满足 positions[to] − positions[from] === minimum', () => {
    const p = solveAxis({
      count: 4,
      constraints: [c(0, 1, 10, 'a'), c(1, 2, 10, 'b'), c(2, 3, 10, 'c'), c(0, 3, 100, 'span')],
    });
    expect(p.tight.length).toBeGreaterThan(0);
    for (const x of p.tight) {
      // 0.1 网格上的减法在二进制里不总是精确(880.3 − 100.1 = 780.1999999999999), round1 收掉尾巴
      expect(round1(p.positions[x.to] - p.positions[x.from])).toBe(x.minimum);
      expect(x.minimum).toBeGreaterThanOrEqual(0); // 负下界上不了账(见 ⑦)
    }
    // 没顶住的不许混进 tight: c(2,3,10) 实得 80
    expect(p.tight.map((x) => x.contributor)).toEqual(['a', 'b', 'span']);
    // 下界不在 0.1 网格上时挂的是**生效值**: 账本对外的承诺是"解 ≥ 你给的数", 不是"原样存你给的数"
    const q = solveAxis({ count: 2, constraints: [c(0, 1, 12.34, 'x')] });
    expect(q.tight[0].minimum).toBe(12.4);
  });

  it('⑤ 顺序无关: 同一组约束打乱数组顺序 ⇒ 解与账逐值相同(确定性是产物可比对的前提)', () => {
    const cs = [c(0, 1, 10, 'a'), c(1, 2, 10, 'b'), c(2, 3, 10, 'c'), c(0, 2, 40, 'mid'), c(0, 3, 100, 'span')];
    const base = solveAxis({ count: 4, constraints: cs });
    const variants = [
      solveAxis({ count: 4, constraints: [...cs].reverse() }),
      solveAxis({ count: 4, constraints: [cs[3], cs[0], cs[4], cs[2], cs[1]] }),
    ];
    for (const p of variants) {
      expect(p.positions).toEqual(base.positions);
      expect(p.gaps).toEqual(base.gaps);
      expect(p.attribution).toEqual(base.attribution);
      expect(p.tight.map((x) => x.contributor)).toEqual(base.tight.map((x) => x.contributor));
      expect(p.winners.map((w) => w?.contributor ?? null)).toEqual(base.winners.map((w) => w?.contributor ?? null));
    }
  });

  it('⑥ 环拒绝: from >= to 当场抛 —— 不许静默忽略, 更不许迭代转死', () => {
    // 退化成"忽略环"或"硬迭代"的话, 这条就是红的那个(抛不出来)
    expect(() => solveAxis({ count: 4, constraints: [c(2, 2, 10, 'self-loop')] })).toThrow(ShapeInputError);
    expect(() => solveAxis({ count: 4, constraints: [c(3, 1, 10, '倒指')] })).toThrow(/不大于 from/);
    expect(() => solveAxis({ count: 4, constraints: [c(0, 1, 10, 'ok'), c(2, 0, 5, '环')] })).toThrow(/拓扑序|不大于 from/);
    // 越界也是同一档: 账本不该对不存在的变量提要求
    expect(() => solveAxis({ count: 2, constraints: [c(0, 2, 10, '越界')] })).toThrow(/不是 \[0, 1\] 里的整数/);
  });

  it('⑦ 坏输入: count < 1 / 非有限 minimum / 负 minimum —— 当场抛, 不留半成品解', () => {
    expect(() => solveAxis({ count: 0 })).toThrow(/count/);
    expect(() => solveAxis({ count: -1 })).toThrow(ShapeInputError);
    expect(() => solveAxis({ count: 2.5 })).toThrow(ShapeInputError);
    expect(() => solveAxis({ count: 2, constraints: [c(0, 1, Number.NaN)] })).toThrow(/是 NaN/);
    expect(() => solveAxis({ count: 2, constraints: [c(0, 1, Number.POSITIVE_INFINITY)] })).toThrow(/Infinity/);
    expect(() => solveAxis({ count: 2, constraints: [c(0, 1, -1)] })).toThrow(/为负/);
    expect(() => solveAxis({ count: 2, constraints: [{ from: 0, to: 1 } as AxisConstraint] })).toThrow(/undefined/);
    // 0 是合法下界("没有间距要求"), 别把它也当成坏值
    expect(solveAxis({ count: 2, constraints: [c(0, 1, 0, '零')] }).gaps).toEqual([0]);
  });

  it('⑧ 0.1 精度向上取: 下界被抬到网格, 绝不把 "≥ N" 舍成 "差点不够"', () => {
    const p = solveAxis({ count: 3, constraints: [c(0, 1, 12.34, 'a'), c(1, 2, 0.03, 'b')] });
    expect(p.positions).toEqual([0, 12.4, 12.5]);
    expect(p.tight.map((x) => x.minimum)).toEqual([12.4, 0.1]);
    // 对外的硬承诺: 每一格都不小于调用方给的下界(舍入只许往上)
    expect(p.gaps[0]).toBeGreaterThanOrEqual(12.34);
    expect(p.gaps[1]).toBeGreaterThanOrEqual(0.03);
    // 已经落在网格上的下界一个字节都不动
    expect(solveAxis({ count: 2, constraints: [c(0, 1, 135, 'x')] }).gaps).toEqual([135]);
  });
});
