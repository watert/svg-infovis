// =====================================================================
// lanes · 批量腰线分配(`assignLanes`)与腰线可行域(`laneSlot`)
//
// 本文件钉住三件事:
//   ① **可行域与路由同源** —— `laneSlot` 说得出"这条边能吃在哪一段", 且分配出的值喂回
//      `routeOrthogonal` **永不被投影**(这是双源会立刻暴露的地方)
//   ② **最小干预** —— 本来就不撞的边一个字节都不动; 全挤一处的以理想位中枢**对称摊开**
//   ③ **能力的理由(集成)** —— 一束 fan-out 边共用一条腰线时, `audit` 的 `edge_overlap` 归零
//
// 事故背景(260919): 一个 subagent 画"来源树", 7 条边只能挤一条 `lane`, 两条共线 106px、
// 三条改走 `via` 又自重叠, 最后**把边整个删掉**交付。门禁早喊对了方向("错开至少 15px"),
// 缺的是工具 —— 本文件就是那个工具的判据。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { assignLanes, LANE_STEP_MIN } from '../src/knives/lanes';
import { laneSlot, routeOrthogonal } from '../src/knives/route';
import { audit } from '../src/knives/audit';
import { type Pt } from '../src/geometry/vec';

const R = (x: number, y: number, w = 100, h = 60) => ({ x, y, w, h });

/**
 * 一束 fan-out 请求: 同一个源盒的 bottom 面出线, 落到同一层 4 个目标盒的 top 面。
 * 4 条边的 `a1.y` / `b1.y` 全相同 ⇒ 自动中线(preferred)全相同 ⇒ 不给 lane 就一定共线。
 */
function fanOut(spread = 140) {
  const src = R(100, 40, 100, 60);                       // bottom y = 100
  const targets = [0, 1, 2, 3].map((i) => R(300 + i * spread, 300, 100, 60));
  return targets.map((t, i) => ({
    from: src,
    fromPort: { side: 'bottom' as const, t: i / 3 },
    to: t,
    toPort: { side: 'top' as const, t: 0.5 },
  }));
}

/** 一束边在 scene 里的折点列(逐条 route) */
const pointsOf = (reqs: Parameters<typeof routeOrthogonal>[0][]) => reqs.map((r) => routeOrthogonal(r).points);

describe('laneSlot · 腰线可行域(与 route 的 laneFor 同源)', () => {
  it('竖直对顶(bottom→top): 轴为 y, 可行域 = 两 stub 之间, preferred = 中点', () => {
    const s = laneSlot({ from: R(100, 40, 100, 60), fromPort: { side: 'bottom' }, to: R(100, 300, 100, 60), toPort: { side: 'top' } });
    expect(s).not.toBeNull();
    // from bottom y=100 + stub 18 = 118; to top y=300 - 18 = 282
    expect(s!.axis).toBe('y');
    expect(s!.lo).toBe(118);
    expect(s!.hi).toBe(282);
    expect(s!.preferred).toBe(200);
    expect(s!.origin).toBe(150);            // a1.x = 盒中线 150
    expect(s!.span).toEqual([150, 150]);    // 两端同列 ⇒ 腰线段是一个点(退化, 但仍要参与聚带)
  });

  it('竖直对顶: 端口错开时 span 是两端 x 的区间, origin 是出口 x', () => {
    const s = laneSlot({
      from: R(100, 40, 100, 60), fromPort: { side: 'bottom', t: 0 },
      to: R(300, 300, 100, 60), toPort: { side: 'top', t: 1 },
    })!;
    expect(s.origin).toBe(100);             // a1.x = 盒左缘
    expect(s.span).toEqual([100, 400]);     // a1.x=100, b1.x=400
  });

  it('水平-水平相向(right→left): 轴为 x, 可行域 = 两 stub 之间', () => {
    const s = laneSlot({ from: R(40, 80, 100, 50), fromPort: { side: 'right' }, to: R(400, 80, 100, 50), toPort: { side: 'left' } });
    expect(s).not.toBeNull();
    expect(s!.axis).toBe('x');
    expect(s!.lo).toBe(158);                // 40+100+18
    expect(s!.hi).toBe(382);                // 400-18
    expect(s!.preferred).toBe(270);
  });

  it('L 形(bottom→left)不吃 lane: 给 null', () => {
    expect(laneSlot({ from: R(40, 40), fromPort: { side: 'bottom' }, to: R(300, 300), toPort: { side: 'left' } })).toBeNull();
  });

  it('给了非空 via 不吃 lane(与 laneIgnored 同一立场): 给 null', () => {
    expect(laneSlot({
      from: R(40, 40), fromPort: { side: 'bottom' }, to: R(40, 300), toPort: { side: 'top' },
      via: [{ x: 200, y: 200 }],
    })).toBeNull();
  });

  it('水平对顶且**两 stub 朝外**(背对背)不吃竖腰线: 给 null', () => {
    // 两 stub 同行 ⇒ 竖腰线 Z 退化成一条横线(先西出 18px 再东进 436px 又西进 18px), 必然回折;
    // route 已改走横腰线, 这条边给 lane 也是徒劳 —— 与 route 的实际判决同源(折线实测, 不另立判据)
    expect(laneSlot({ from: R(100, 80, 100, 60), fromPort: { side: 'left' }, to: R(400, 80, 100, 60), toPort: { side: 'right' } })).toBeNull();
  });

  it('竖向背对背(bottom 出 / top 进, 但目标在上方)同样不吃 lane: 给 null', () => {
    expect(laneSlot({ from: R(100, 300), fromPort: { side: 'bottom' }, to: R(100, 40), toPort: { side: 'top' } })).toBeNull();
  });
});

describe('assignLanes · 分配', () => {
  it('fan-out 四条全挤一处 → 按 step 两两错开, 且**对称**摊在理想位两侧', () => {
    const reqs = fanOut();
    const { reqs: out, plan } = assignLanes(reqs);
    expect(plan.bands.length).toBe(1);              // 四条的水平段互相重叠 ⇒ 一个带
    expect(plan.diagnostics).toEqual([]);
    const lanes = plan.lanes as number[];
    expect(lanes.every((v) => v !== null)).toBe(true);
    for (let i = 1; i < lanes.length; i++) expect(lanes[i] - lanes[i - 1]).toBeGreaterThanOrEqual(LANE_STEP_MIN - 1e-9);
    // 理想位都是 200(两 stub 中点) ⇒ 四条应摊成 200±22.5 / 200±7.5 —— 单向推会得到 200/215/230/245, 那会白扔一半走廊
    expect(lanes).toEqual([177.5, 192.5, 207.5, 222.5]);
    expect(out.map((r) => r.lane)).toEqual(lanes);
  });

  it('保序: 出口位置递增 ⇒ 分到的腰线也递增(顺序对了边才不交叉)', () => {
    const reqs = fanOut();
    const { plan } = assignLanes(reqs);
    const slots = reqs.map((r) => laneSlot(r)!);
    const byOrigin = reqs.map((_, i) => i).sort((a, b) => slots[a].origin - slots[b].origin || a - b);
    const lanes = byOrigin.map((i) => plan.lanes[i] as number);
    for (let k = 1; k < lanes.length; k++) expect(lanes[k]).toBeGreaterThan(lanes[k - 1]);
  });

  it('最小干预: 水平段区间不重叠的边不参与分配(值给 null, 原 lane 原样带过)', () => {
    // 两条边各自从源盒的两侧出线、落到相隔很远的目标 ⇒ 腰线段毫无交集, 不该被拉来一起错开
    const reqs = [
      { from: R(300, 40, 100, 60), fromPort: { side: 'bottom' as const, t: 0 }, to: R(40, 300, 100, 60), toPort: { side: 'top' as const, t: 0.5 } },
      { from: R(300, 40, 100, 60), fromPort: { side: 'bottom' as const, t: 1 }, to: R(900, 300, 100, 60), toPort: { side: 'top' as const, t: 0.5 } },
    ];
    const { reqs: out, plan } = assignLanes(reqs);
    expect(plan.lanes).toEqual([null, null]);
    expect(plan.bands).toEqual([]);
    expect(out[0].lane).toBeUndefined();
  });

  it('null 的语义是"不干涉": 入参已有的 lane 原样留着, 不被抹掉', () => {
    const reqs = [
      { from: R(300, 40, 100, 60), fromPort: { side: 'bottom' as const, t: 0 }, to: R(40, 300, 100, 60), toPort: { side: 'top' as const, t: 0.5 }, lane: 130 },
      { from: R(300, 40, 100, 60), fromPort: { side: 'bottom' as const, t: 1 }, to: R(900, 300, 100, 60), toPort: { side: 'top' as const, t: 0.5 } },
    ];
    const { reqs: out, plan } = assignLanes(reqs);
    expect(plan.lanes).toEqual([null, null]);
    expect(out[0].lane).toBe(130);
  });

  it('走廊装不下 → lane_band_overflow warning, 且带上 need / have / 成员清单', () => {
    // 目标层紧贴源层: 可行域只剩 4px, 四条边要 45px
    const src = R(100, 40, 100, 60);                                  // bottom 100 → a1.y 118
    const targets = [0, 1, 2, 3].map((i) => R(300 + i * 140, 140, 100, 60));  // top 140 → b1.y 122
    const reqs = targets.map((t, i) => ({
      from: src, fromPort: { side: 'bottom' as const, t: i / 3 },
      to: t, toPort: { side: 'top' as const, t: 0.5 },
    }));
    const { plan } = assignLanes(reqs);
    expect(plan.bands.length).toBe(1);
    expect(plan.bands[0].slack).toBeLessThan(0);
    expect(plan.diagnostics.length).toBe(1);
    const d = plan.diagnostics[0];
    expect(d.code).toBe('lane_band_overflow');
    expect(d.severity).toBe('warning');                              // 装不下是事实, 但不当"错"拦出口
    expect(d.evidence.count).toBe(4);
    expect(d.evidence.need).toBe(45);
    expect(d.evidence.have).toBe(4);
    expect(d.supportedFixes.length).toBeGreaterThanOrEqual(2);        // 没有修法的报错等于让 agent 猜
  });

  it('不吃 lane 的边参与不了分配(via / L 形), 也不影响别的带', () => {
    const reqs = [
      ...fanOut(),
      { from: R(100, 40, 100, 60), fromPort: { side: 'bottom' as const }, to: R(900, 300, 100, 60), toPort: { side: 'left' as const } },
    ];
    const { plan } = assignLanes(reqs);
    expect(plan.lanes[4]).toBeNull();          // L 形那条
    expect(plan.lanes.slice(0, 4).every((v) => v !== null)).toBe(true);
  });

  it('不 mutate 入参, 出口是新实例(与 nudge 同纪律)', () => {
    const reqs = fanOut();
    const snapshot = JSON.stringify(reqs);
    const { reqs: out } = assignLanes(reqs);
    expect(JSON.stringify(reqs)).toBe(snapshot);                       // 入参一个字节没动
    expect(out[0]).not.toBe(reqs[0]);
    expect(out[0].from).toBe(reqs[0].from);                            // 浅带过几何引用(只换外层)
  });

  it('字节确定性: 同输入两次分配逐字节相同', () => {
    const reqs = fanOut();
    expect(JSON.stringify(assignLanes(reqs))).toBe(JSON.stringify(assignLanes(reqs)));
  });

  it('step 非正有限 → 当场抛(畸形入参是编程错误, 不静默兜底)', () => {
    expect(() => assignLanes(fanOut(), { step: 0 })).toThrow(RangeError);
    expect(() => assignLanes(fanOut(), { step: Number.NaN })).toThrow(RangeError);
  });

  it('空集与单条都不炸: 没有需要错开的对儿', () => {
    expect(assignLanes([]).plan).toEqual({ lanes: [], bands: [], diagnostics: [] });
    expect(assignLanes(fanOut().slice(0, 1)).plan.lanes).toEqual([null]);
  });
});

describe('assignLanes · 分配器与路由的口径必须同源', () => {
  it('分配出的每一个值喂回 route 都**不被投影**, 也不触发不可行标志', () => {
    // 这条是"双源"的探针: 若分配器另算一套可行域(哪怕只差一点), 值就会被 laneFor 判越界,
    // 于是一门之隔的两份结论互相打脸 —— 门禁继续喊 edge_overlap, 而分配器说"我已经错开了"
    const cases: Array<ReturnType<typeof fanOut>> = [
      fanOut(),
      fanOut(60),
      // 端口打到盒缘(可行域边界)的情形
      [0, 1, 2, 3].map((i) => ({
        from: R(100, 40, 100, 60), fromPort: { side: 'bottom' as const, t: i / 3 },
        to: R(300 + i * 90, 300, 100, 60), toPort: { side: 'top' as const, t: 0.5 },
      })),
    ];
    for (const reqs of cases) {
      const { reqs: out } = assignLanes(reqs);
      out.forEach((r) => {
        const res = routeOrthogonal(r);
        expect(res.laneProjected).toBeUndefined();
        expect(res.laneInfeasible).toBeUndefined();
        expect(res.laneIgnored).toBeUndefined();
      });
    }
  });
});

describe('assignLanes · 能力举证(集成): fan-out 共线 → audit 的 edge_overlap 归零', () => {
  it('同一条走廊上四条边不给 lane 就必然共线; 交给分配器后门禁全绿', () => {
    // 这就是本项存在的理由: 根因不是几何算错, 而是作者**没有错开一束腰线的工具**
    const reqs = fanOut();
    const src = reqs[0].from;
    const nodes = [
      { id: 'src', rect: src, label: 'root' },
      ...reqs.map((r, i) => ({ id: `t${i}`, rect: r.to, label: `T${i}` })),
    ];
    const scene = (pts: Pt[][]) => ({
      width: 1000, height: 460, nodes,
      edges: reqs.map((_, i) => ({ id: `e${i}`, from: 'src', to: `t${i}`, points: pts[i] })),
    });

    const before = audit(scene(pointsOf(reqs)), { level: 'showcase' });
    const collinearBefore = before.diagnostics.filter((d) => d.code === 'edge_overlap');
    expect(collinearBefore.length).toBeGreaterThan(0);                 // 起点: 真的在共线
    expect(collinearBefore.some((d) => d.evidence.kind === 'collinear')).toBe(true);

    const { reqs: laned } = assignLanes(reqs);
    const after = audit(scene(pointsOf(laned)), { level: 'showcase' });
    expect(after.diagnostics.filter((d) => d.code === 'edge_overlap')).toEqual([]);
    expect(after.metrics.edge_collinear).toBe(0);
    expect(after.pass).toBe(true);
  });
});
