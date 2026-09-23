// =====================================================================
// route · 可行性(对顶 stub / 腰线投影 / 拐法自选 / 作者折点 via)
//
// 260917 手排实测: 老 route **会吐出原地折回的坏几何**, 而这些几何能过当时全部门禁。
// 本文件把三条可行性约束逐条钉住 —— 不管输入多刁, 输出都不许自重叠。
//
// 260918 追加 via(作者给的中间折点, 对标 archify `connections[].via`):
//   这是"作者权威"的声明式折点 —— 引擎不许投影改写它, 也不许在它不可行时偷偷换一条。
//   本文件既验拼接语义与优先级标志, 也验 **标志不许撒谎**(报了 viaInfeasible 就必须真不可行),
//   最后用一条 route → audit 的集成用例交付"能力的理由": 中间横着一个盒子时门禁归零。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { routeOrthogonal } from '../src/knives/route';
import { audit } from '../src/knives/audit';
import { ShapeInputError } from '../src/guard';
import { firstBacktrackIndex, isOrthogonalSegment, pointSegmentDistance, sameAxisOverlapLength, selfOverlapIndex } from '../src/geometry/predicates';
import { type Pt } from '../src/geometry/vec';

const R = (x: number, y: number, w = 100, h = 50) => ({ x, y, w, h });
const flat = (pts: Array<{ x: number; y: number }>) => pts.map((p) => `${p.x},${p.y}`).join(' → ');

/**
 * 折线里**任意两段**(相邻与非相邻都算)同轴、共线、方向相反的重叠长度最大值。
 * 这就是 ⑥ 的坏几何: `route` 的干线把端口 x 甩在身后再折回 18px 进端口 ——
 * `firstBacktrackIndex` 只看相邻段(这里恰好也判得出), 但"干线 vs 末段"这类
 * **隔着几段**的叠要靠全对儿扫描, 否则修完相邻段仍可能留一条(门禁侧同款判据)。
 */
function oppositeOverlap(pts: Pt[]): number {
  let worst = 0;
  for (let i = 1; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    const [a1, a2, b1, b2] = [pts[i - 1], pts[i], pts[j - 1], pts[j]];
    const dot = (a2.x - a1.x) * (b2.x - b1.x) + (a2.y - a1.y) * (b2.y - b1.y);
    if (dot >= 0) continue; // 只抓反向: 同向共线是"接着走", 不是折回
    worst = Math.max(worst, sameAxisOverlapLength(a1, a2, b1, b2));
  }
  return worst;
}

/**
 * 折线是否经过这个点(线段距离 0)。
 * via 点被 `normalizeRoutePoints` 吃掉是**规范化**(它本来就是共线的冗余折点), 不是改写 ——
 * 所以判据取"落在折线上"而不是"必须是折点之一": 前者才真的拦得住"引擎偷偷换了一条路"。
 */
function onPolyline(p: Pt, pts: Pt[]): boolean {
  for (let i = 1; i < pts.length; i++) {
    const d = pointSegmentDistance(p, pts[i - 1], pts[i]);
    if (d !== null && d < 1e-6) return true;
  }
  return false;
}

describe('route · 折点列可行性', () => {
  it('对顶 stub: 两个盒贴得比 stub×2 还近时, stub 自动对半收 —— 不产生回折', () => {
    // 上下两盒只隔 24px, 而 stub 缺省 18 → 两个 stub 会互穿(旧版就在这里折回)
    const r = routeOrthogonal({ from: R(0, 0), fromPort: { side: 'bottom' }, to: R(0, 74), toPort: { side: 'top' } });
    expect(firstBacktrackIndex(r.points)).toBe(-1);
    // 两根 stub 各让到 12px 处正好在中间对接, 共线点被规范化吃掉 → 退化成一条直线
    expect(flat(r.points)).toBe('50,50 → 50,74');
  });

  it('对顶 stub 贴到只剩 4px: stub 收到 2px, 仍然是一条干净的直线', () => {
    const r = routeOrthogonal({ from: R(200, 200), fromPort: { side: 'right' }, to: R(304, 200), toPort: { side: 'left' } });
    expect(firstBacktrackIndex(r.points)).toBe(-1);
    expect(flat(r.points)).toBe('300,225 → 304,225');
  });

  it('对顶 stub + 越界 lane → 投影进可行区间, 并置 laneProjected 让调用方看见', () => {
    const r = routeOrthogonal({ from: R(0, 0), fromPort: { side: 'bottom' }, to: R(400, 300), toPort: { side: 'top' }, lane: 9999 });
    expect(firstBacktrackIndex(r.points)).toBe(-1);
    expect(r.laneProjected).toBe(true);
    // 投影到上界 = 目标 stub 端点(300 - 18)
    expect(r.points[1].y).toBe(282);
  });

  it('平行 stub 的缺省 lane 落在最小可行位 —— 不传 lane 就是最优, 且不算"投影"', () => {
    // 左出左入: 竖直腰线必须落在两个 stub 端点之外(即源盒/目标盒左侧), 缺省取最近的那个
    const r = routeOrthogonal({ from: R(250, 240), fromPort: { side: 'left' }, to: R(90, 40), toPort: { side: 'left' } });
    expect(firstBacktrackIndex(r.points)).toBe(-1);
    expect(r.laneProjected).toBeUndefined();
    // 72 = 目标左侧端口(90) 外一个 stub
    expect(flat(r.points)).toBe('250,265 → 72,265 → 72,65 → 90,65');
  });

  it('平行 stub + 落在出口反侧的 lane → 投影并报(静默忽略调用方参数是不允许的)', () => {
    const r = routeOrthogonal({ from: R(250, 240), fromPort: { side: 'left' }, to: R(90, 40), toPort: { side: 'left' }, lane: 400 });
    expect(firstBacktrackIndex(r.points)).toBe(-1);
    expect(r.laneProjected).toBe(true);
    expect(r.points[1].x).toBe(72);
  });

  it('混合朝向、目标在出方向背面 → 自动换用另一个 L 拐法(旧的唯一拐法会原路退回)', () => {
    // 从右侧端口出, 但目标在左边: 旧版"先横到目标列"会把 18px 的 stub 原路退回
    const r = routeOrthogonal({ from: R(678, 270, 163, 54), fromPort: { side: 'right' }, to: R(692, 650, 577, 204), toPort: { side: 'top' } });
    expect(firstBacktrackIndex(r.points)).toBe(-1);
    expect(r.bends).toBe(1); // 第一段朝右出去后直接下行 —— 只拐一次
    expect(r.points[1].x).toBeGreaterThan(r.points[0].x);
  });

  it('不许退化: 两盒拉开且都水平对顶时, 折线仍是直线(bends=0, stub 被规范化吃掉)', () => {
    const r = routeOrthogonal({ from: R(77, 80, 146, 54), fromPort: { side: 'right' }, to: R(296, 80, 168, 54), toPort: { side: 'left' } });
    expect(flat(r.points)).toBe('223,107 → 296,107');
    expect(r.bends).toBe(0);
  });

  it('对顶水平 · 两盒同排(左出/右入): 干线不许穿过端口 x 再回退 —— 改走横腰线绕顶', () => {
    // 260918 复现(⑥): 旧输出 `200,225 → 182,225 → 438,225 → 420,225`
    //   —— 源向西出 18px 后立刻东折, 干线把目标端口 x=420 甩在身后, 末段再西折 18px 进端口;
    //   首段×干线×末段两两同轴反向叠 18px, 而边级门禁全是边×边, 这条自重叠无人喊疼
    const r = routeOrthogonal({ from: R(200, 200), fromPort: { side: 'left' }, to: R(320, 200), toPort: { side: 'right' } });
    expect(firstBacktrackIndex(r.points)).toBe(-1);
    expect(oppositeOverlap(r.points)).toBe(0);
    // 两端口同排 → 竖腰线 Z 的可行域是空集, 只剩"绕顶"或"绕底"(等长时取绕顶, 字节确定)
    expect(flat(r.points)).toBe('200,225 → 182,225 → 182,182 → 438,182 → 438,225 → 420,225');
  });

  it('对顶水平 · 两端口错行: 横腰线落在两行之间的自然位 —— 不必绕盒', () => {
    const r = routeOrthogonal({ from: R(200, 200), fromPort: { side: 'left' }, to: R(320, 400), toPort: { side: 'right' } });
    expect(firstBacktrackIndex(r.points)).toBe(-1);
    expect(oppositeOverlap(r.points)).toBe(0);
    expect(flat(r.points)).toBe('200,225 → 182,225 → 182,325 → 438,325 → 438,425 → 420,425');
  });

  it('对顶水平 · 作者给了 lane: 这拓扑里竖腰线无处可落 → 走横腰线并置 laneInfeasible 报一声', () => {
    // lane 越界值一并验证: 投影出来的边界值随竖腰线候选一起被弃, 只报"无法落位"(不报"已投影")
    for (const lane of [250, 9999]) {
      const r = routeOrthogonal({ from: R(200, 200), fromPort: { side: 'left' }, to: R(320, 200), toPort: { side: 'right' }, lane });
      expect(firstBacktrackIndex(r.points)).toBe(-1);
      expect(oppositeOverlap(r.points)).toBe(0);
      expect(r.laneInfeasible).toBe(true);
      expect(r.laneProjected).toBeUndefined();
    }
  });

  it('对顶水平穷举一批布局: 同排 / 错行 / 远近 / 反向管道 × 各种 lane, 一律不自重叠且全程正交', () => {
    const tos: Array<[number, number]> = [[320, 200], [600, 200], [320, 400], [600, -200], [60, 200]];
    const lanes = [undefined, -100, 250, 460, 9999];
    let checked = 0;
    for (const [tx, ty] of tos) for (const lane of lanes) {
      const r = routeOrthogonal({ from: R(200, 200), fromPort: { side: 'left' }, to: R(tx, ty), toPort: { side: 'right' }, lane });
      if (firstBacktrackIndex(r.points) >= 0 || oppositeOverlap(r.points) > 0) {
        throw new Error(`自重叠: to=(${tx},${ty}) lane=${lane} :: ${flat(r.points)}`);
      }
      for (let i = 1; i < r.points.length; i++) expect(isOrthogonalSegment(r.points[i - 1], r.points[i])).toBe(true);
      checked++;
    }
    expect(checked).toBe(tos.length * lanes.length);
  });

  it('穷举一批**像人写的**组合: 任何朝向 / 任何 lane / 任何间距, 输出都不许自重叠', () => {
    // 行 = [源端口, 目标端口, 目标盒左上角]; 刻意都构成"端口朝外对着目标"的真实拓扑
    const rows: Array<[string, string, [number, number]]> = [
      ['right', 'left', [304, 200]],   // 贴到 4px 的管道
      ['right', 'left', [320, 200]],
      ['right', 'left', [600, 200]],
      ['left', 'right', [60, 200]],   // 反向管道(往左接)      ['bottom', 'top', [200, 254]],
      ['bottom', 'top', [200, 600]],
      ['top', 'bottom', [200, 100]],
      ['right', 'top', [320, 30]],     // 混合朝向(L 拐法要自选)
      ['right', 'bottom', [320, 380]],
      ['left', 'top', [100, 30]],
      ['bottom', 'left', [320, 254]],
      ['bottom', 'right', [100, 254]],
      ['left', 'left', [90, 40]],      // 平行 stub: 绕左侧回环
      ['right', 'right', [400, 40]],   // 平行 stub: 绕右侧回环
    ];
    const lanes = [undefined, -500, 0, 137, 9999];
    let checked = 0;
    for (const [a, b, [tx, ty]] of rows) for (const lane of lanes) {
      const r = routeOrthogonal({
        from: R(200, 200), fromPort: { side: a as 'top' }, to: R(tx, ty), toPort: { side: b as 'top' }, lane,
      });
      if (firstBacktrackIndex(r.points) >= 0) throw new Error(`出现回折: ${a}→${b} @(${tx},${ty}) lane=${lane} :: ${flat(r.points)}`);
      expect(r.points.length).toBeGreaterThanOrEqual(2);
      checked++;
    }
    expect(checked).toBe(rows.length * lanes.length);
  });

  it('边界(不保证): 端口背对背、必须绕行时, 只保证"仍是正交折线" —— 绕行归 v0.2', () => {
    // 源从底边朝下出, 目标却在**上方**且要求从顶边进 → Z 形无解, 得走 U 形绕行
    const r = routeOrthogonal({ from: R(200, 200), fromPort: { side: 'bottom' }, to: R(200, 80), toPort: { side: 'top' } });
    expect(firstBacktrackIndex(r.points)).toBeGreaterThanOrEqual(-1);
    expect(flat(r.points).split(' → ').length).toBeGreaterThanOrEqual(2);
    // 至少必须**保持正交** —— 这是本函数任何情况下都不破的底线
    for (let i = 1; i < r.points.length; i++) {
      const dx = Math.abs(r.points[i].x - r.points[i - 1].x);
      const dy = Math.abs(r.points[i].y - r.points[i - 1].y);
      expect(dx < 1e-9 || dy < 1e-9).toBe(true);
    }
  });

  it('退化输入(记录现状): 两个盒紧贴时端口重合, route 吐 1 点 —— 不崩, 但这条边会隐形(见 TODO)', () => {
    const r = routeOrthogonal({ from: R(200, 200), fromPort: { side: 'left' }, to: R(100, 200), toPort: { side: 'right' } });
    // 两个端口都是 (200,225) —— 无路可走, 诚实地返回 1 点而**不是**造一段零长折线
    expect(r.points).toEqual([{ x: 200, y: 225 }]);
    expect(r.bends).toBe(0);
  });

  it('字节确定性: 同输入两次调用逐字节相同', () => {
    const req = { from: R(10, 20), fromPort: { side: 'right' as const }, to: R(300, 200), toPort: { side: 'top' as const }, lane: 250 };
    expect(JSON.stringify(routeOrthogonal(req))).toBe(JSON.stringify(routeOrthogonal(req)));
  });

  // --- via: 作者给的中间折点(见文件头 260918 段) -----------------------

  it('via · 单折点链绕开中间的盒子: 折点原样落进输出, 首末段仍是端口法线上的 stub', () => {
    // a(右出) → c(左入) 中间横着 b; 不给 via 时是一根直线, 直接穿过 b
    const base = { from: R(40, 80), fromPort: { side: 'right' as const }, to: R(460, 80), toPort: { side: 'left' as const } };
    expect(flat(routeOrthogonal(base).points)).toBe('140,105 → 460,105');
    const via = [{ x: 158, y: 40 }, { x: 442, y: 40 }];
    const r = routeOrthogonal({ ...base, via });
    expect(flat(r.points)).toBe('140,105 → 158,105 → 158,40 → 442,40 → 442,105 → 460,105');
    expect(firstBacktrackIndex(r.points)).toBe(-1);
    expect(selfOverlapIndex(r.points)).toBe(-1);
    expect(r.viaInfeasible).toBeUndefined();
    expect(r.laneIgnored).toBeUndefined();
    for (const v of via) expect(onPolyline(v, r.points)).toBe(true);
  });

  it('via · 相邻锚点不共轴时两种拐法都试: 取到不自重叠的那组(不是"先横后竖"一条道走到黑)', () => {
    // 两个斜置的 via 点 → 三个关节各两种拐法; 只有 "H,V,V" 这组既不过回折也不自重叠
    const r = routeOrthogonal({
      from: R(0, 200, 100, 50), fromPort: { side: 'right' }, to: R(600, 400, 100, 50), toPort: { side: 'left' },
      via: [{ x: 300, y: 100 }, { x: 400, y: 500 }],
    });
    expect(flat(r.points)).toBe('100,225 → 300,225 → 300,100 → 400,100 → 400,500 → 582,500 → 582,425 → 600,425');
    expect(firstBacktrackIndex(r.points)).toBe(-1);
    expect(selfOverlapIndex(r.points)).toBe(-1);
    for (let i = 1; i < r.points.length; i++) expect(isOrthogonalSegment(r.points[i - 1], r.points[i])).toBe(true);
  });

  it('via 与 lane 同时给: via 优先, lane 全程不参与 —— 折点逐字节相同且报 laneIgnored', () => {
    const req = {
      from: R(40, 80), fromPort: { side: 'right' as const }, to: R(460, 80), toPort: { side: 'left' as const },
      via: [{ x: 158, y: 40 }, { x: 442, y: 40 }],
    };
    const withLane = routeOrthogonal({ ...req, lane: 9999 });
    expect(flat(withLane.points)).toBe(flat(routeOrthogonal(req).points));
    expect(withLane.laneIgnored).toBe(true);
    // lane 连投影都没做, 所以那两个"处理过作者的 lane"的标志一律不许出现
    expect(withLane.laneProjected).toBeUndefined();
    expect(withLane.laneInfeasible).toBeUndefined();
    expect(routeOrthogonal(req).laneIgnored).toBeUndefined();
  });

  it('via 点落在竖腰线可行域之外 → 原样保留(作者折点不被 laneFor 投影改写)', () => {
    // 竖腰线的可行域是 [68, 282]; 折点 x=600 明显在外面, 但它是作者给的, 一律照走
    const r = routeOrthogonal({
      from: R(0, 0), fromPort: { side: 'bottom' }, to: R(400, 300), toPort: { side: 'top' },
      via: [{ x: 600, y: 150 }], lane: 9999,
    });
    expect(flat(r.points)).toBe('50,50 → 50,68 → 600,68 → 600,150 → 450,150 → 450,300');
    expect(r.laneIgnored).toBe(true);
    expect(r.laneProjected).toBeUndefined();
    expect(firstBacktrackIndex(r.points)).toBe(-1);
  });

  it('via 拼接后不可行(折点落在 stub 身后): 原样返回作者的折点 + viaInfeasible —— 不投影也不替换', () => {
    const r = routeOrthogonal({
      from: R(40, 140), fromPort: { side: 'right' }, to: R(460, 140), toPort: { side: 'left' },
      via: [{ x: 120, y: 165 }],   // 折点在出 stub(158)的**身后** —— 必然原路折回
    });
    expect(r.viaInfeasible).toBe(true);
    expect(firstBacktrackIndex(r.points)).toBeGreaterThanOrEqual(0);
    // 折点还是作者给的那个: 引擎只连起来 + 报一声, 不替作者想一条
    expect(r.points).toContainEqual({ x: 120, y: 165 });
    expect(r.points[0]).toEqual({ x: 140, y: 165 });
    expect(r.points[r.points.length - 1]).toEqual({ x: 460, y: 165 });
  });

  it('via 空数组 = 没给中间折点: lane 照常参与(且不报 laneIgnored)', () => {
    const req = { from: R(0, 0), fromPort: { side: 'bottom' as const }, to: R(400, 300), toPort: { side: 'top' as const }, lane: 9999 };
    const empty = routeOrthogonal({ ...req, via: [] });
    expect(flat(empty.points)).toBe(flat(routeOrthogonal(req).points));
    expect(empty.laneProjected).toBe(true);
    expect(empty.laneIgnored).toBeUndefined();
    expect(empty.viaInfeasible).toBeUndefined();
  });

  it('畸形 via 当场抛(不是静默剔除): 非有限点 / 缺字段 / 非数组, 且报错文案指路正确写法', () => {
    const base = { from: R(0, 0), fromPort: { side: 'right' as const }, to: R(400, 0), toPort: { side: 'left' as const } };
    const bad = (via: unknown) => () => routeOrthogonal({ ...base, via } as never);
    expect(bad([{ x: Number.NaN, y: 10 }])).toThrow(ShapeInputError);
    expect(bad([{ x: 10, y: Number.POSITIVE_INFINITY }])).toThrow(/via\[0\]\.y/);
    expect(bad([{ x: 10 }])).toThrow(/via\[0\]\.y/);
    expect(bad([{ x: 300, y: 10 }, { x: 320, y: 10 }])).not.toThrow();
    expect(bad(null)).toThrow(/不是折点数组/);
    // 报错必须说清"不含端口点", 否则作者会把端口点也写进 via 重复一遍
    expect(bad([{ x: Number.NaN, y: 10 }])).toThrow(/不含两端端口点/);
  });

  it('超长 via 链(> 8 个关节): 走 O(n) 的确定性退化, 仍给一条全程正交的折线而不是炸掉', () => {
    const via = Array.from({ length: 9 }, (_, i) => ({ x: 120 + i * 40, y: i % 2 ? 40 : 200 }));
    const r = routeOrthogonal({ from: R(40, 80), fromPort: { side: 'right' }, to: R(460, 80), toPort: { side: 'left' }, via });
    for (let i = 1; i < r.points.length; i++) expect(isOrthogonalSegment(r.points[i - 1], r.points[i])).toBe(true);
    expect(r.points[0]).toEqual({ x: 140, y: 105 });
    expect(r.points[r.points.length - 1]).toEqual({ x: 460, y: 105 });
  });

  it('穷举一批 via 链 × 布局: 折线全程正交、via 点一个都不丢, 且 viaInfeasible **不许撒谎**', () => {
    const cases: Array<[string, string, [number, number], Pt[]]> = [
      ['right', 'left', [460, 80], [{ x: 158, y: 65 }, { x: 442, y: 65 }]],     // 绕顶
      ['right', 'left', [460, 80], [{ x: 158, y: 165 }, { x: 442, y: 165 }]],   // 绕底
      ['right', 'left', [460, 380], [{ x: 158, y: 65 }, { x: 442, y: 65 }]],    // 目标错行 + 绕顶
      ['right', 'top', [320, 300], [{ x: 420, y: 120 }, { x: 380, y: 260 }]],
      ['bottom', 'left', [460, 200], [{ x: 120, y: 120 }, { x: 120, y: 300 }]], // 折点越过入行再折回 → 真不可行
      ['left', 'right', [60, 200], [{ x: 120, y: 120 }, { x: 120, y: 170 }]],
      ['top', 'bottom', [200, 400], [{ x: 120, y: 120 }, { x: 300, y: 120 }]],
      ['right', 'left', [460, 80], [{ x: 120, y: 105 }]],                        // 折点在 stub 身后
      ['bottom', 'top', [200, 74], [{ x: 300, y: 40 }]],                         // 两盒贴得比 2×stub 还近
    ];
    let checked = 0, infeasible = 0;
    for (const [a, b, [tx, ty], via] of cases) {
      const r = routeOrthogonal({ from: R(40, 80), fromPort: { side: a as 'top' }, to: R(tx, ty), toPort: { side: b as 'top' }, via });
      const genuinelyBad = firstBacktrackIndex(r.points) >= 0 || selfOverlapIndex(r.points) >= 0;
      expect(Boolean(r.viaInfeasible)).toBe(genuinelyBad);   // 报了就必须真坏, 真坏了就必须报
      for (let i = 1; i < r.points.length; i++) expect(isOrthogonalSegment(r.points[i - 1], r.points[i])).toBe(true);
      // 作者权威: 每个 via 点都要落在最终折线上(被 normalize 吃掉的共线冗余点也算"落在线上", 改写不算)
      for (const v of via) expect(onPolyline(v, r.points)).toBe(true);
      checked++;
      if (genuinelyBad) infeasible++;
    }
    expect(checked).toBe(cases.length);
    expect(infeasible).toBe(2);   // 两个"真不可行"样本: 标志与几何都验过, 不是空跑
  });

  it('via · 字节确定性: 同输入两次调用逐字节相同', () => {
    const req = {
      from: R(40, 80), fromPort: { side: 'right' as const }, to: R(460, 80), toPort: { side: 'left' as const },
      via: [{ x: 158, y: 40 }, { x: 442, y: 40 }], lane: 250,
    };
    expect(JSON.stringify(routeOrthogonal(req))).toBe(JSON.stringify(routeOrthogonal(req)));
  });

  it('能力举证(集成): 中间横着一个盒子 → via 给绕行折点, audit 的 edge_node_clearance 归零', () => {
    // 这就是本项存在的理由: 穿盒的根因不是算错, 而是作者没有"指定折点"的手段
    const nodes = [
      { id: 'a', rect: R(40, 80), label: 'A' },
      { id: 'b', rect: R(250, 80), label: 'B' },
      { id: 'c', rect: R(460, 80), label: 'C' },
    ];
    const scene = (points: Pt[]) => ({ width: 620, height: 220, nodes, edges: [{ id: 'e', from: 'a', to: 'c', points }] });
    const req = { from: nodes[0].rect, fromPort: { side: 'right' as const }, to: nodes[2].rect, toPort: { side: 'left' as const } };
    const before = audit(scene(routeOrthogonal(req).points), { level: 'showcase' });
    expect(before.metrics.edge_node_pierce).toBe(1);
    expect(before.diagnostics.filter((d) => d.code === 'edge_node_clearance').length).toBe(1);
    const after = audit(scene(routeOrthogonal({ ...req, via: [{ x: 158, y: 40 }, { x: 442, y: 40 }] }).points), { level: 'showcase' });
    expect(after.diagnostics.filter((d) => d.code === 'edge_node_clearance')).toEqual([]);
    expect(after.metrics.edge_node_pierce).toBe(0);
    expect(after.metrics.min_edge_node_clearance).toBeGreaterThan(20);
    expect(after.pass).toBe(true);
  });
});
