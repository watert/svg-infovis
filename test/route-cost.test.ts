// =====================================================================
// route-cost · 代价向量: 量化 + 字典序
//
// 覆盖三层:
//   ① 逐维量化真值 —— 样本**一律取真实折点列**(260917 手排实测的两条坏几何 + route 的真实产物),
//      不另造"看着像"的折线。造样本踩过一次: `(0,0)→(100,0)→(100,30)→(60,30)` 肉眼像"绕回去",
//      其实右→下→左没有相邻反向、段0 与段2 也不共线 —— 回折是 0。**肉眼判几何不可靠**。
//   ② 字典序语义 —— 逐维比较 / 优先级 / 末位破平 / 反对称
//   ③ 口径同源 —— 代价与门禁必须同一把尺子, 不许出现"门禁说没穿、排序说穿了"
//
// 变异验证(改维度表或计算器后照着做一遍, 三处都要真变红):
//   · `backtrackPx` 的判据从点积 `< -1e-9` 改成 `< -1`(即永不触发) → 回折那两例 + 优先级那例红
//   · `compareRouteCost` 的 `delta !== 0` 改成 `delta > 0`(只顺着一个方向看) → 反对称那例红
//   · 删掉 `labelDeficitPx` 的 ownerEdge 豁免 → 自家标签那例红
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { compareRouteCost, firstCostDifference, formatRouteCost, routeCost } from '../src/knives/route-cost';
import { firstBacktrackIndex, selfOverlapIndex } from '../src/geometry/predicates';
import { PIERCE_MIN, STUB_MIN, THRESHOLDS } from '../src/knives/audit';
import { routeOrthogonal } from '../src/knives/route';

const p = (x: number, y: number) => ({ x, y });
const r = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

// 260917 手排实测的两条真坏几何:
//   e5 末段原路折回 18px · e8 首段出去 18px 又原路退回
const E5 = [p(1150, 150), p(1150, 200), p(513, 200), p(513, 152), p(513, 170)];
const E8 = [p(841, 277), p(859, 277), p(390, 277), p(390, 620)];
// 无回折的干净 Z 形(2 弯)
const CLEAN = [p(0, 0), p(0, 40), p(100, 40), p(100, 90)];

describe('折线自身维度', () => {
  it('回折总长 = 原路退回的那一小段(取两段较短者)', () => {
    // e5: 段2 向上 48px, 段3 向下 18px → 折回的那段是 18
    expect(routeCost(E5).backtrackPx).toBe(18);
    // e8: 段0 向右 18px, 段1 向左 469px → 折回 18
    expect(routeCost(E8).backtrackPx).toBe(18);
    expect(routeCost(CLEAN).backtrackPx).toBe(0);
  });

  it('不相邻的同轴反向归自重叠, 不重复计进回折', () => {
    // 段0 在 y=0 向右 · 段4 在 y=0 向左, 投影 [0,100] ∩ [50,150] = 50
    const pts = [p(0, 0), p(100, 0), p(100, 50), p(150, 50), p(150, 0), p(50, 0)];
    const cost = routeCost(pts);
    expect(cost.backtrackPx).toBe(0);
    expect(cost.selfOverlapPx).toBe(50);
  });

  it('同轴反向但**不共线**时两维都不计(不是所有反向都叫叠)', () => {
    // 段0 在 y=0 向右, 段2 在 y=50 向左 —— 反向但不同线, 画出来根本碰不到
    const cost = routeCost([p(0, 0), p(100, 0), p(100, 50), p(20, 50), p(20, 80)]);
    expect(cost.backtrackPx).toBe(0);
    expect(cost.selfOverlapPx).toBe(0);
  });

  it('弯数 = 折点数 - 2, 绕路比 ×1000(直线恰为 1000)', () => {
    expect(routeCost(CLEAN).bendCount).toBe(2);
    expect(routeCost(E5).bendCount).toBe(3);
    // 直线: 长 100, 曼哈顿直径 100 → 1000
    expect(routeCost([p(0, 0), p(100, 0)]).stretchMilli).toBe(1000);
    // 绕了三倍: 实际走 300, 两端曼哈顿距离只有 100
    expect(routeCost([p(0, 0), p(0, 100), p(100, 100), p(100, 0)]).stretchMilli).toBe(3000);
  });

  it('两端重合(闭环)取哨兵值, 不假装"一点没绕"', () => {
    const cost = routeCost([p(0, 0), p(0, 50), p(50, 50), p(50, 0), p(0, 0)]);
    expect(cost.stretchMilli).toBe(999999);
    expect(cost.stretchMilli).not.toBe(0);
  });
});

describe('上下文维度(带场景对象)', () => {
  it('穿盒: 逐盒累加相交长度, 半像素以下算擦边不计', () => {
    const box = r(30, 20, 40, 40);
    expect(routeCost(CLEAN, { nodeRects: [box] }).piercePx).toBe(40); // y=40 横穿 x∈[30,70]
    // ⚠ 沿盒边共线走 = 相交 40px。谓词用的是**闭包**语义(`segmentRectIntersectionLength` 的入参含边界),
    //   所以"压着盒子边线走"会被计成穿盒 —— 与 `node_gap` 用 `rectsOverlap` 的严格 `<` 是**两套口径**。
    //   这里如实记录既有行为: 视觉上线盒不分本来就是事故, 计进去是对的; 真要改是判据变更, 得单独拍板。
    expect(routeCost([p(0, 20), p(100, 20)], { nodeRects: [box] }).piercePx).toBe(40);
    // 真正"从旁边掠过"(离盒 5px): 0
    expect(routeCost([p(0, 15), p(100, 15)], { nodeRects: [box] }).piercePx).toBe(0);
  });

  it('端点擦过: 只量中段(剔掉贴在盒面上的两端端口点)', () => {
    const box = r(0, 0, 50, 30);
    // 中段 (5,20)→(60,20) 压在盒里 → 缺口恰为半像素门槛
    expect(routeCost([p(0, 0), p(5, 20), p(60, 20), p(60, 10)], { endpointRects: [box] }).endpointBitePx)
      .toBe(PIERCE_MIN);
    // 中段整段离盒 20px → 0
    expect(routeCost([p(0, 0), p(-20, 40), p(60, 40), p(60, 10)], { endpointRects: [box] }).endpointBitePx)
      .toBe(0);
  });

  it(`端段过短: 短于 ${STUB_MIN}px 才计, 且无折弯的直连边不在判据内`, () => {
    expect(routeCost([p(0, 0), p(5, 0), p(5, 50)]).stubDeficitPx).toBe(STUB_MIN - 5);
    // 只有一段(无折弯): 两盒离得近时直连是对的 —— 与 endpoint_approach 同一条豁免
    expect(routeCost([p(0, 0), p(9, 0)]).stubDeficitPx).toBe(0);
    expect(routeCost(CLEAN).stubDeficitPx).toBe(0);
  });

  it('标签净空: 门槛与 label_clearance 同源, 自家边标签豁免', () => {
    const chip = r(20, 32, 40, 16); // 压在 y=40 那段上
    const thr = THRESHOLDS.standard.labelClearance;
    expect(routeCost(CLEAN, { edgeId: 'e1', labels: [{ rect: chip, ownerEdge: 'e2' }] }).labelDeficitPx)
      .toBe(thr);
    // 唯一豁免: 自家边的标签(与门禁同一条规定)
    expect(routeCost(CLEAN, { edgeId: 'e1', labels: [{ rect: chip, ownerEdge: 'e1' }] }).labelDeficitPx)
      .toBe(0);
    // showcase 档门槛更高, 同一张图缺口更大 —— 档位真的透下去了
    expect(routeCost(CLEAN, { edgeId: 'e1', level: 'showcase', labels: [{ rect: chip, ownerEdge: 'e2' }] }).labelDeficitPx)
      .toBe(THRESHOLDS.showcase.labelClearance);
  });

  it('共享走廊: 同线重叠计入; 共享端点时跳过(端口附近贴着走是必然的)', () => {
    const neighbor = [p(20, 40), p(80, 40)];
    expect(routeCost(CLEAN, { neighbors: [{ points: neighbor }] }).sharedCorridorPx).toBe(60);
    expect(routeCost(CLEAN, { neighbors: [{ points: neighbor, sharesEndpoint: true }] }).sharedCorridorPx)
      .toBe(0);
  });

  it('交叉数: 只数真交叉(T 形相触不算)', () => {
    // 竖直邻居横穿 y=40 那一行 → 1 处真交叉
    expect(routeCost(CLEAN, { neighbors: [{ points: [p(50, 0), p(50, 80)] }] }).crossingCount).toBe(1);
    // 邻居端点正好落在折线上(T 形相触) → 不算
    expect(routeCost(CLEAN, { neighbors: [{ points: [p(50, 40), p(50, 80)] }] }).crossingCount).toBe(0);
  });

  it('零上下文时只算折线自身的维度, 其余为 0(不抛错也不给假值)', () => {
    const cost = routeCost(CLEAN);
    expect(cost.piercePx).toBe(0);
    expect(cost.endpointBitePx).toBe(0);
    expect(cost.labelDeficitPx).toBe(0);
    expect(cost.sharedCorridorPx).toBe(0);
    expect(cost.crossingCount).toBe(0);
    expect(cost.bendCount).toBe(2);
    expect(cost.stretchMilli).toBe(1000);
  });
});

describe('字典序', () => {
  it('逐维比较: 前面的维分出胜负就不看后面', () => {
    // 两条只差弯数与绕路: 弯数在维度表里排在绕路之前 → 由弯数定胜负
    const few = routeCost([p(0, 0), p(0, 40), p(100, 40), p(100, 90)]);        // 2 弯
    const many = routeCost([p(0, 0), p(0, 20), p(50, 20), p(50, 70), p(100, 70), p(100, 90)]); // 4 弯
    expect(compareRouteCost(few, many)).toBeLessThan(0);
    expect(firstCostDifference(few, many)).toBe('bendCount');
  });

  it('优先级: 门禁级的几何事实压过审美量(回折 15px 的 2 弯输给无回折的 4 弯)', () => {
    const backtrack = routeCost([p(0, 0), p(100, 0), p(100, 20), p(100, 5)]); // 段2 原路退回 15px, 2 弯
    const clean = routeCost([p(0, 0), p(0, 40), p(100, 40), p(100, 60), p(60, 60), p(60, 30)]); // 无回折, 4 弯
    expect(backtrack.backtrackPx).toBe(15);
    expect(backtrack.bendCount).toBeLessThan(clean.bendCount);
    expect(compareRouteCost(backtrack, clean)).toBeGreaterThan(0);
    expect(firstCostDifference(backtrack, clean)).toBe('backtrackPx');
  });

  it('末位 ordinal 破平: 全维同分时序号小的在前', () => {
    const a = routeCost(CLEAN, { ordinal: 0 });
    const b = routeCost(CLEAN, { ordinal: 1 });
    expect(firstCostDifference(a, b)).toBe('ordinal');
    expect(compareRouteCost(a, b)).toBeLessThan(0);
    expect(compareRouteCost(b, a)).toBeGreaterThan(0);
  });

  it('反对称: compare(a, b) 恒等于 -compare(b, a)', () => {
    const pairs: Array<[typeof CLEAN, typeof E5]> = [[CLEAN, E5], [E5, E8], [E8, CLEAN]];
    for (const [left, right] of pairs) {
      const a = routeCost(left), b = routeCost(right);
      expect(compareRouteCost(a, b)).toBe(-compareRouteCost(b, a));
    }
  });

  it('formatRouteCost: 跳过零值 · 全零输出 clean · ordinal 恒不进人读串', () => {
    expect(formatRouteCost(routeCost(E5))).toBe('backtrackPx 18px · bendCount 3个 · stretchMilli 1146');
    // ordinal 是破平用的序号, 不是代价 —— 即使 skipZero: false 也不该出现在人读串里
    expect(formatRouteCost(routeCost(CLEAN), { skipZero: false })).toContain('piercePx 0px');
    expect(formatRouteCost(routeCost(CLEAN), { skipZero: false })).not.toContain('ordinal');
    // 空折线: 每一维都是 0 → clean
    expect(formatRouteCost(routeCost([]))).toBe('clean');
  });
});

describe('口径同源: 代价与门禁同一把尺子', () => {
  it('backtrackPx > 0 当且仅当 firstBacktrackIndex 命中', () => {
    const samples = [CLEAN, E5, E8, [p(0, 0), p(100, 0), p(100, 20), p(100, 5)], [p(0, 0), p(0, 40)]];
    for (const pts of samples) {
      expect(routeCost(pts).backtrackPx > 0).toBe(firstBacktrackIndex(pts) >= 0);
    }
  });

  it('selfOverlapPx > 0 当且仅当 selfOverlapIndex 命中', () => {
    const hit = [p(0, 0), p(100, 0), p(100, 50), p(150, 50), p(150, 0), p(50, 0)];
    const miss = [p(0, 0), p(100, 0), p(100, 50), p(20, 50), p(20, 80)];
    expect(routeCost(hit).selfOverlapPx > 0).toBe(selfOverlapIndex(hit) >= 0);
    expect(routeCost(miss).selfOverlapPx > 0).toBe(selfOverlapIndex(miss) >= 0);
  });

  it('route 产物只在「竖直对顶相背」这一处回折 —— 已知死局被机器钉住', () => {
    const from = r(0, 0, 80, 40), to = r(300, 160, 80, 40);
    const sides = ['top', 'right', 'bottom', 'left'] as const;
    const backtracking: string[] = [];
    let selfOverlapping = 0;
    for (const fs of sides) {
      for (const ts of sides) {
        const cost = routeCost(routeOrthogonal({ from, fromPort: { side: fs }, to, toPort: { side: ts } }).points);
        if (cost.backtrackPx > 0) backtracking.push(`${fs}→${ts}`);
        if (cost.selfOverlapPx > 0) selfOverlapping += 1;
      }
    }
    // 自重叠: 16 个拓扑一个都不该有(现状择优保证)
    expect(selfOverlapping).toBe(0);
    // 回折: 只有 top→bottom 一处 —— 源(盒子在左上)从 top 出即**向上**, 目标(右下)从 bottom 进即**向下**,
    // 两根 stub 端点 a1=(40,-18) / b1=(340,218) 把竖腰线的可行域拧成空集: 竖腰线 Z 两侧要同时
    // 满足 "继续往上"(y < a1.y) 与 "从下方靠上去"(y > b1.y), 无解。route 只给这一族候选,
    // 于是兜底吐出 (40,0)→(40,-18)→(40,100)→(340,100)→(340,218)→(340,200), 两端各回折 18px = 36px。
    // 门禁 no_backtrack 会把它拦成 error, 但**路由层自己拿不出替代候选** ——
    // 横版对顶有 `transposedRoute` 顶上来, 竖版没做(走另一列的竖腰线能解, 见 TODO 同名条目)。
    // ⚠ 这是刻意的"边界钉子": 竖版补上之后它会红, 提醒把期望改成"零回折"。
    expect(backtracking).toEqual(['top→bottom']);
  });
});

describe('确定性与边界', () => {
  it('同输入两次逐字节相同', () => {
    const ctx = { edgeId: 'e1', nodeRects: [r(30, 20, 40, 40)], ordinal: 3 };
    expect(JSON.stringify(routeCost(CLEAN, ctx))).toBe(JSON.stringify(routeCost(CLEAN, ctx)));
  });

  it('退化输入不抛: 空折线 / 单点', () => {
    for (const pts of [[], [p(5, 5)]]) {
      const cost = routeCost(pts);
      expect(cost.bendCount).toBe(0);
      expect(cost.backtrackPx).toBe(0);
      expect(cost.stretchMilli).toBe(0);
    }
  });
});
