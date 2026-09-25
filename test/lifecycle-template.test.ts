// =====================================================================
// templates/lifecycle 的判据 —— 六条, 一条一个 `it`
//
// 为什么这个模板值得有判据: 它要替掉的正是**门禁审不到的那部分**(手排示例
// `examples/gallery/lifecycle-agent-run.ts` 339 行 + 它自己那三条版式判据)。
// 所以这里的断言分三层:
//   · 地板: showcase 档 0 error(①)
//   · 语义: 版式判据的**语义**必须原样保留(②) —— 门禁全绿也可能是一张烂版式
//   · 机制: 跨列声明真能顶开列距(③) / **纵轴走廊的账也读得出谁顶开的**(附) / 决策变了产物就变且可复现(④) /
//     畸形当场抛(⑤) / 决策量确实比手排小一个量级(⑥)
//
// ⚠ `long_edge` 白名单(① 里点名): 门禁的门槛是"边长 > 画布对角的 40%", 而**段带分隔线按定义
//   就比它长**(一段跨 3 列的分隔线 ≈ 画布宽的一半)。手排示例同图有 4 条这类警示, 在它自己的
//   文件头白名单里逐条声明为"有意"。本模板照同一纪律: 白名单**写死列出**, 多一条就红。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { audit, type SceneEdge } from '../src/knives/audit';
import { fitScene } from '../src/export';
import { ShapeInputError, THEMES, labelBoxSize } from '../src/index';
import { DEMO_LIFECYCLE, LIFECYCLE_DEFAULTS, buildLifecycle, decorateDemoLegend, emitLifecycle, type LifecycleSpec } from '../templates/lifecycle';

const FIT = { padding: 30 } as const;
const built = buildLifecycle(DEMO_LIFECYCLE);
const scene = built.scene;

/** 白名单(见文件头那条纪律): 只有**段带分隔线**这条基准线会被 long_edge 判成"横扫全图" */
const LONG_EDGE_WHITELIST = ['warning:long_edge:band-main', 'warning:long_edge:band-wait'];

const edgeOf = (id: string): SceneEdge => {
  const e = scene.edges.find((x) => x.id === id);
  if (!e) throw new Error(`scene 里没有 ${id} 这条边 —— 改名了就把判据一起改`);
  return e;
};
const nodeOf = (id: string) => {
  const n = scene.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`scene 里没有 ${id} 这个节点`);
  return n;
};

/** 四条"同列下落"的边: 源与目标同列 ⇒ 端口同 x ⇒ 本该是一条直线 */
const VERTICALS: Array<[edge: string, from: string, to: string]> = [
  ['e-approval-needed', 'executing', 'approval'],
  ['e-review-blocked', 'reviewing', 'blocked'],
  ['e-approval-cancelled', 'approval', 'cancelled'],
  ['e-block-expired', 'blocked', 'expired'],
];

/** 轴对齐矩形是否被线段切到(端点盒子由调用方排除) */
const hitsRect = (a: SceneEdge['points'][number], b: SceneEdge['points'][number], r: { x: number; y: number; w: number; h: number }): boolean => {
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  return x1 >= r.x && x0 <= r.x + r.w && y1 >= r.y && y0 <= r.y + r.h;
};

/** 只换段带表的某个字段(其余决策原样), 用来单点变异 */
const withBand = (id: string, patch: Partial<LifecycleSpec['bands'][number]>): LifecycleSpec => ({
  ...DEMO_LIFECYCLE,
  bands: DEMO_LIFECYCLE.bands.map((b) => (b.id === id ? { ...b, ...patch } : b)),
});

/** 抓住抛出来的东西(畸形入参要么当场抛, 要么就是 bug) */
const grab = (spec: LifecycleSpec): Error | null => {
  try {
    buildLifecycle(spec);
    return null;
  } catch (e) {
    return e as Error;
  }
};

describe('templates/lifecycle · 判据', () => {
  it('① demo 用同拓扑 ⇒ showcase 档 0 error; 警示只剩段带分隔线的 long_edge(白名单点名)', () => {
    // 两遍: 骨架本体 + demo 层那一笔图例(调用方义务件也在内容里, 同一份白名单要对两者成立)
    const variants: Array<[why: string, s: typeof scene]> = [
      ['骨架', scene],
      ['骨架 + demo 层图例', decorateDemoLegend(scene, built.plan, THEMES.light)],
    ];
    for (const [why, s] of variants) {
      const rep = audit(fitScene(s, FIT), { level: 'showcase' });
      const codes = rep.diagnostics.map((d) => `${d.severity}:${d.code}:${d.subject.id}`).sort();
      expect({ why, errors: rep.diagnostics.filter((d) => d.severity === 'error').map((d) => d.code) }).toEqual({ why, errors: [] });
      expect({ why, pass: rep.pass }).toEqual({ why, pass: true });
      expect({ why, codes }).toEqual({ why, codes: LONG_EDGE_WHITELIST });
    }
  });

  it('② 版式判据语义不变: 同列下落边是直线 / 走廊上无第三个盒子 / 两个状态同排相邻', () => {
    for (const [id] of VERTICALS) {
      const e = edgeOf(id);
      expect({ id, n: e.points.length }).toEqual({ id, n: 2 });
      expect({ id, dx: e.points[1].x - e.points[0].x }).toEqual({ id, dx: 0 });
    }
    for (const [id, from, to] of VERTICALS) {
      const [a, b] = edgeOf(id).points;
      const blocked = scene.nodes.filter((n) => n.id !== from && n.id !== to && hitsRect(a, b, n.rect));
      expect({ id, blocked: blocked.map((n) => n.id) }).toEqual({ id, blocked: [] });
    }
    const f = nodeOf('failed').rect, a = nodeOf('approval').rect;
    expect({ disjoint: f.x + f.w <= a.x || a.x + a.w <= f.x }).toEqual({ disjoint: true });
    expect(f.y).toBe(a.y);
  });

  it('③ 跨列段带声明 ⇒ 列距按累积顶开, 且 plan 读得出是谁顶开的', () => {
    const base = buildLifecycle(DEMO_LIFECYCLE);
    const wide = buildLifecycle(withBand('wait', { spanMin: 900 }));
    const wider = buildLifecycle(withBand('wait', { spanMin: 1200 }));
    const across = buildLifecycle(withBand('wait', { spanMin: 900, from: 1, to: 4 }));
    // 要求是**沿链累积**的, 不是全图铺开: 声明区间之外的格一个字节都不动
    expect(wide.plan.gaps[0]).toBe(base.plan.gaps[0]);
    expect(wide.plan.gaps[3]).toBe(base.plan.gaps[3]);
    expect(across.plan.gaps[0]).toBe(base.plan.gaps[0]);
    // 跨过的格被顶开, 且账上写着是谁
    expect([1, 2].some((i) => wide.plan.gaps[i] > base.plan.gaps[i])).toBe(true);
    expect([1, 2].flatMap((i) => wide.plan.needs[i].by)).toContain('band:wait');
    // 实际跨度 ≥ 声明; 声明更大 ⇒ 顶得更开; 声明跨到第 4 列 ⇒ 那一格也开始分账
    const spanOf = (p: typeof base): number => p.plan.bands.find((b) => b.id === 'wait')!.span;
    expect(spanOf(wide)).toBeGreaterThanOrEqual(900);
    expect(spanOf(wider)).toBeGreaterThan(spanOf(wide));
    expect(across.plan.gaps[3]).toBeGreaterThan(base.plan.gaps[3]);
    expect(across.plan.gaps[3] > base.plan.gaps[3]).toBe(true);
  });

  it('④ 改一个决策 ⇒ 产物变; 同 spec 跑两遍 ⇒ 逐字节相同', () => {
    const before = emitLifecycle(DEMO_LIFECYCLE).svg;
    expect(emitLifecycle(DEMO_LIFECYCLE).svg).toBe(before); // 逐字节稳定(同 spec 两遍)
    // 换段序(段序 = 数组序, 这是**决策**)
    const reordered: LifecycleSpec = {
      ...DEMO_LIFECYCLE,
      bands: [DEMO_LIFECYCLE.bands[1], DEMO_LIFECYCLE.bands[0], DEMO_LIFECYCLE.bands[2]],
    };
    expect(emitLifecycle(reordered).svg).not.toBe(before);
    // 挪一个状态到另一列(段带声明仍然装得下, 否则该走守卫那条路 —— 见 ⑤)
    const moved: LifecycleSpec = {
      ...DEMO_LIFECYCLE,
      states: DEMO_LIFECYCLE.states.map((s) => (s.id === 'expired' ? { ...s, col: 2, row: 1 } : s)),
    };
    expect(emitLifecycle(moved).svg).not.toBe(before);
  });

  it('⑤ 畸形入参当场抛, 点名出错字段与已知的段带 / 状态 id', () => {
    const cases: Array<[why: string, spec: LifecycleSpec, mustSay: string[]]> = [
      ['段带 id 不认识', {
        ...DEMO_LIFECYCLE,
        states: DEMO_LIFECYCLE.states.map((s) => (s.id === 'queued' ? { ...s, band: 'ghost' } : s)),
      }, ['states[0].band', 'ghost', 'main / wait / term']],
      ['迁移指到不存在的状态', {
        ...DEMO_LIFECYCLE,
        transitions: [{ from: 'queued', to: 'nowhere' }, ...DEMO_LIFECYCLE.transitions],
      }, ['transitions[0].to', 'nowhere', 'executing']],
      ['两个状态挤在同一格', {
        ...DEMO_LIFECYCLE,
        states: DEMO_LIFECYCLE.states.map((s) => (s.id === 'failed' ? { ...s, col: 2, row: 0 } : s)),
      }, ['states[6].id', 'approval', 'failed']],
      ['跨列声明装不下成员', withBand('wait', { from: 2, to: 3 }), ['bands[1].from', 'failed', '[2, 3]']],
      ['via 不是有限坐标', {
        ...DEMO_LIFECYCLE,
        transitions: DEMO_LIFECYCLE.transitions.map((t) => (t.id === 'e-failed-retry' ? { ...t, via: [{ x: 0, y: Number.NaN }] } : t)),
      }, ['transitions[9].via[0]', '有限坐标']],
    ];
    for (const [why, spec, mustSay] of cases) {
      const err = grab(spec);
      expect({ why, threw: err instanceof ShapeInputError }).toEqual({ why, threw: true });
      for (const frag of mustSay) expect({ why, frag, says: (err as Error).message.includes(frag) }).toEqual({ why, frag, says: true });
    }
  });

  it('⑥ 决策量比手排小一个量级 —— demo 的 spec 行数 vs 手排示例的 339 行', () => {
    const src = readFileSync(new URL('../templates/lifecycle.ts', import.meta.url), 'utf8');
    const from = src.indexOf('export const DEMO_LIFECYCLE');
    const specLines = src.slice(from, src.indexOf('\n};', from)).split('\n').length;
    const hand = readFileSync(new URL('../examples/gallery/lifecycle-agent-run.ts', import.meta.url), 'utf8').trimEnd().split('\n').length;
    // 判据: ≤ 1/3(手排那份是几何 + 决策混在一起写; 这里只有决策)
    expect(specLines * 3).toBeLessThanOrEqual(hand);
    // 手排量是历史证人, 变了就说明审的不是同一张图。
    // 260923: 341 → 339 —— 手搓旁注 helper 收敛到 `textNote` 少了 2 行, 图本身一字未动
    // (同日的产物 metrics 逐字段对照相同, 见 `examples/gallery/lifecycle-agent-run.ts` 的验证)
    expect(hand).toBe(339);
  });

  it('附 · via 永远赢(声明折点按原样走, plan 标 declarative)', () => {
    const via = [{ x: 300, y: 900 }, { x: 300, y: 20 }, { x: 746, y: 20 }];
    const spec: LifecycleSpec = {
      ...DEMO_LIFECYCLE,
      transitions: DEMO_LIFECYCLE.transitions.map((t) => (t.id === 'e-failed-retry' ? { ...t, via } : t)),
    };
    const r = buildLifecycle(spec);
    const route = r.plan.routes.find((x) => x.id === 'e-failed-retry')!;
    expect(route.declarative).toBe(true);
    expect(route.points).toContainEqual(via[0]);
    expect(route.points).toContainEqual(via[2]);
    // 回边读得出走的是哪条走廊(默认那条 = 段带分隔线上方的横向走廊 + 一格列间隙)
    expect(buildLifecycle(DEMO_LIFECYCLE).plan.routes.find((x) => x.id === 'e-failed-retry')!.corridor)
      .toBe('above:main/gap:col1|col2');
  });

  it('附 · via 族的标签落在声明折点串的中段**上方 h**(不是"目标带上方的凭空位置", 也不骑线)', () => {
    // 实测(260925): `via` 的 `s.lane` 恒为 -1(③ 段只给 down / back 发通道), 旧式落位
    // `laneY(kb, -1)` 算出的是"目标带分隔线上方 + 一格 laneStep" —— 一个与作者声明折点
    // **毫无关系**的凭空位置(同一条 via 换一组折点, 标签纹丝不动)。
    // 同日的第二刀: 中段**中点**是"字面骑线" —— 遮罩片(缺省与画布同色)会把那一段线切一个洞,
    // 观感与 chain / down / back 三族的"抬到线上方 h"不一致 ⇒ via 也抬 h。
    const via = [{ x: 300, y: 900 }, { x: 300, y: 20 }, { x: 746, y: 20 }];
    const spec: LifecycleSpec = {
      ...DEMO_LIFECYCLE,
      transitions: DEMO_LIFECYCLE.transitions.map((t) => (t.id === 'e-failed-retry' ? { ...t, label: 'retry', via } : t)),
    };
    // 折线 = [源盒面, ...声明折点, 目标盒面] 去共线后 5 点 ⇒ 中段 = via[1] → via[2](y = 20 的那条横段)
    const atOf = (s: LifecycleSpec): { x: number; y: number } => {
      const l = (buildLifecycle(s).scene.labels ?? []).find((x) => x.id === 'L-e-failed-retry');
      if (!l) throw new Error('scene 里没有 via 那条迁移的标签 —— 改名了就把判据一起改');
      return l.at;
    };
    // 口径与邻支同源: 抬 = 自身半高 + labelGap(那两个数都从模板自己的声明里取, 不另抄一份)
    const LIFT = labelBoxSize('retry').height / 2 + LIFECYCLE_DEFAULTS.labelGap;
    expect(atOf(spec)).toEqual({ x: (via[1].x + via[2].x) / 2, y: via[2].y - LIFT });
    // 判据的要点是"落位跟着**声明折点**走": 折点挪一截, 标签跟着挪(旧式落位不会动)
    const moved: LifecycleSpec = {
      ...spec,
      transitions: spec.transitions.map((t) => (t.id === 'e-failed-retry' ? { ...t, via: [via[0], via[1], { ...via[2], x: 500 }] } : t)),
    };
    expect(atOf(moved)).toEqual({ x: (via[1].x + 500) / 2, y: via[2].y - LIFT });
    // "抬 h"落到观感上就一句话: 遮罩片下缘离那条线正好 labelGap(不骑线, 线不被切出洞)
    expect(atOf(spec).y + labelBoxSize('retry').height / 2).toBeCloseTo(via[2].y - LIFECYCLE_DEFAULTS.labelGap, 9);
  });

  it('附 · 纵轴走廊也上账本: 旋钮与"标签 + 通道"需求各喂一条, `yNeeds[].by` 读得出谁顶开的', () => {
    const p = buildLifecycle(DEMO_LIFECYCLE).plan;
    // demo 实测: 01 带上方要容回边通道 ⇒ 那段走廊被 `corridor:wait` 顶开; 02→03 之间只有旋钮下限
    expect(p.yNeeds.map((n) => n.by)).toEqual([['corridor:wait'], ['bandGap']]);
    // 账目自洽: 段距 = 带内容高 + 走廊高, 且走廊从不低于旋钮下限(账本只会按需顶开, 不压扁)
    for (const n of p.yNeeds) expect(n.used - n.content).toBeGreaterThanOrEqual(LIFECYCLE_DEFAULTS.bandGap);
    // 旋钮压到需求之下 ⇒ 两段走廊都改判给需求 —— `by` 是解出来的, 不是写死的
    expect(buildLifecycle({ ...DEMO_LIFECYCLE, bandGap: 40 }).plan.yNeeds.map((n) => n.by))
      .toEqual([['corridor:wait'], ['corridor:term']]);
  });
});
