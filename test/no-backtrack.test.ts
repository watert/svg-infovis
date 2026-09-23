// =====================================================================
// no_backtrack · 折线不准原地折回 (门禁⑨)
//
// 与 `orthogonal_edges` 的分工: 那个管"拐得正不正", 这个管"有没有原路返回"。
// 两者**可以同时成立** —— 260917 手排实测的两条坏折点列既正交、又叠在自己身上,
// 而当时七项门禁一条都看不见。所以本文件的样本直接用那两条实测数据, 不另造。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { type Diagnostic, audit } from '../src/knives/audit';
import { firstBacktrackIndex, isBacktrackingPolyline, selfOverlapIndex } from '../src/geometry/predicates';

const only = (r: { diagnostics: Diagnostic[] }, c: string) => r.diagnostics.filter((d) => d.code === c);
const sceneWith = (points: Array<{ x: number; y: number }>) => ({
  width: 1200, height: 800,
  nodes: [
    { id: 'a', rect: { x: 1080, y: 20, w: 120, h: 60 }, label: 'A' },
    { id: 'b', rect: { x: 400, y: 700, w: 120, h: 60 }, label: 'B' },
  ],
  edges: [{ id: 'e', from: 'a', to: 'b', points }],
});

describe('no_backtrack · 折线自重叠', () => {
  it('谓词本身: 相邻段反向才叫回折, 直角拐弯与共线都不算', () => {
    expect(firstBacktrackIndex([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }])).toBe(-1);      // 共线
    expect(firstBacktrackIndex([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }])).toBe(-1);     // 直角
    expect(firstBacktrackIndex([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 4, y: 0 }])).toBe(1);        // 折回
    expect(isBacktrackingPolyline([{ x: 0, y: 0 }, { x: 0, y: 5 }, { x: 0, y: 2 }])).toBe(true);   // 竖直折回
    // 零长段不归它管(那是 normalizeRoutePoints 的活)
    expect(firstBacktrackIndex([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 5, y: 0 }])).toBe(-1);
  });

  it('反证: 260917 实测的两条坏折点列 —— 正交但叠自己, 现在必须喊疼', () => {
    // e5: lane 越界 → 先越过目标再折回
    const e5 = [{ x: 1150, y: 150 }, { x: 1150, y: 200 }, { x: 513, y: 200 }, { x: 513, y: 152 }, { x: 513, y: 170 }];
    expect(firstBacktrackIndex(e5)).toBe(3);
    // e8: 端口法线与目标反向 → 出 18px 又原路退回
    const e8 = [{ x: 841, y: 277 }, { x: 859, y: 277 }, { x: 390, y: 277 }, { x: 390, y: 620 }];
    expect(firstBacktrackIndex(e8)).toBe(1);

    for (const pts of [e5, e8]) {
      const r = audit(sceneWith(pts) as never, { level: 'showcase' });
      const d = only(r, 'no_backtrack')[0];
      expect(d).toBeDefined();
      expect(d.severity).toBe('error');
      expect(d.message).toContain('原地折回');
      expect(r.pass).toBe(false);
      expect(r.metrics.backtracks).toBe(1);
    }
    // 这两条**同时**过正交门禁 —— 证明两道门禁确实各管一件事, 不能互相替代
    expect(only(audit(sceneWith(e8) as never), 'orthogonal_edges')).toEqual([]);
  });

  it('修法闭环: 按诊断给的折点下标把那个折点去掉, 门禁立刻过', () => {
    const bad = [{ x: 841, y: 277 }, { x: 859, y: 277 }, { x: 390, y: 277 }, { x: 390, y: 620 }];
    const at = Number(only(audit(sceneWith(bad) as never), 'no_backtrack')[0].evidence.index);
    const fixed = bad.filter((_, i) => i !== at); // 去掉那个 stub 折点
    expect(only(audit(sceneWith(fixed) as never), 'no_backtrack')).toEqual([]);
    expect(audit(sceneWith(fixed) as never).pass).toBe(true);
  });

  it('每条诊断带非空修法(三种修法方向都在), evidence 可复算', () => {
    const r = audit(sceneWith([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 60 }]) as never);
    const d = only(r, 'no_backtrack')[0];
    expect(d.supportedFixes.map((f) => f.kind)).toEqual(['reroute', 'clamp-lane', 'drop-stub']);
    expect(d.supportedFixes.every((f) => f.hint.length > 0)).toBe(true);
    expect(d.evidence.at).toEqual([50, 0]);
    expect((d.evidence.points as number[]).length).toBe(8); // 4 点 × (x,y)
  });

  it('不许误伤: 合法的 Z 形 / L 形 / 回环绕行都不报', () => {
    const legal = [
      [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 80 }, { x: 200, y: 80 }],           // Z
      [{ x: 0, y: 0 }, { x: 0, y: 60 }, { x: 180, y: 60 }],                             // L
      [{ x: 0, y: 0 }, { x: -40, y: 0 }, { x: -40, y: 120 }, { x: 200, y: 120 }, { x: 200, y: 60 }], // 绕行
    ];
    for (const pts of legal) expect(only(audit(sceneWith(pts) as never), 'no_backtrack')).toEqual([]);
  });

  it('谓词本身: 非相邻段同轴反向重叠才叫自重叠; 相邻那档不归它', () => {
    // 越过端口所在 x 再回退 18px 进端口: 干线(段0)与末段(段6)在 y=200 上反向叠 18px
    const blind = [{ x: 250, y: 200 }, { x: 450, y: 200 }, { x: 450, y: 320 }, { x: 382, y: 320 },
      { x: 382, y: 240 }, { x: 418, y: 240 }, { x: 418, y: 200 }, { x: 400, y: 200 }];
    expect(firstBacktrackIndex(blind)).toBe(-1); // 相邻段一个都没反 —— 老谓词全瞎
    expect(selfOverlapIndex(blind)).toBe(0);

    // 隔得更远也抓得到: 段3(x=100, 向北) 与段7(x=100, 向南) 反向叠 40px
    const mid = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 120 }, { x: 100, y: 120 },
      { x: 100, y: 60 }, { x: 40, y: 60 }, { x: 40, y: 80 }, { x: 100, y: 80 }, { x: 100, y: 140 }];
    expect(firstBacktrackIndex(mid)).toBe(-1);
    expect(selfOverlapIndex(mid)).toBe(3);

    // 反证(不误伤): 直角 / 平行不共线 / 同轴反向但投影分离 / 同向共线(口径只管"反向")
    expect(selfOverlapIndex([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 40 }, { x: 80, y: 40 }])).toBe(-1);
    const disjoint = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 60 }, { x: 90, y: 60 }, { x: 90, y: 0 }, { x: 50, y: 0 }];
    expect(firstBacktrackIndex(disjoint)).toBe(-1); // y=0 上那两段确实一东一西…
    expect(selfOverlapIndex(disjoint)).toBe(-1); // …但投影不相交(x∈[0,40] 与 [50,90] 分离)
    const sameDir = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 60 }, { x: 20, y: 60 }, { x: 20, y: 0 }, { x: 90, y: 0 }];
    expect(selfOverlapIndex(sameDir)).toBe(-1); // 同向共线叠 20px 不归它 —— 口径是"反向", 这档口子记录在案

    // 亚半像素: 重叠 0.4px 是轴容差噪声, 0.75px 就算"画了两遍"(判据是重叠 > eps=0.5)
    const thin = (end: number) => [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }, { x: 10, y: 30 }, { x: 10, y: 0 }, { x: end, y: 0 }];
    expect(selfOverlapIndex(thin(9.6))).toBe(-1); // 重叠 0.4
    expect(selfOverlapIndex(thin(9.25))).toBe(0); // 重叠 0.75

    // 退化与非有限: 零长段跳过、非有限段跳过(与本文件同族口径 —— 非有限归 finite_svg 喊疼)
    expect(selfOverlapIndex([])).toBe(-1);
    expect(selfOverlapIndex([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }])).toBe(-1);
    expect(selfOverlapIndex([{ x: NaN, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 10 }])).toBe(-1);
    expect(selfOverlapIndex(blind.map((p, i) => (i === 5 ? { x: Infinity, y: p.y } : p)))).toBe(0); // 只跳过非有限那几段, 其余照判
  });

  it('门禁: 非相邻同轴反向重叠 → kind=self_overlap, error, 修法给的是作者能拧的旋钮', () => {
    const blind = [{ x: 250, y: 200 }, { x: 450, y: 200 }, { x: 450, y: 320 }, { x: 382, y: 320 },
      { x: 382, y: 240 }, { x: 418, y: 240 }, { x: 418, y: 200 }, { x: 400, y: 200 }];
    const r = audit(sceneWith(blind) as never, { level: 'showcase' });
    const d = only(r, 'no_backtrack')[0];
    expect(only(r, 'no_backtrack')).toHaveLength(1); // 同一条边只报一处
    expect(d.severity).toBe('error'); // 几何事实 → error(决策 14)
    expect(d.evidence.kind).toBe('self_overlap');
    expect(d.evidence.index).toBe(0); // 段号(不是点号)
    expect(d.evidence.other).toBe(6);
    expect(d.evidence.overlap).toBe(18);
    expect(d.message).toContain('同轴反向重叠 18px');
    expect(d.message).toContain('折线叠在自己身上');
    expect(r.pass).toBe(false);
    expect(r.metrics.backtracks).toBe(1);
    // 修法必须是作者能拧的旋钮(端口 side/t/at · lane · 手写折点列), 不引不存在的 API
    expect(d.supportedFixes.map((f) => f.kind)).toEqual(['move-port', 'lane-shift', 'reroute']);
    expect(d.supportedFixes.every((f) => f.hint.length > 0)).toBe(true);
    for (const f of d.supportedFixes) expect(f.hint).not.toContain('via');
    // 这条折点列**全程正交** —— 证明"拐得正不正"与"有没有叠自己"确实两道门禁各管一件事
    expect(only(r, 'orthogonal_edges')).toEqual([]);
  });

  it('修法闭环: 把干线挪离端口所在的 y 之后, 非相邻重叠消失、门禁立刻过', () => {
    const bad = [{ x: 250, y: 200 }, { x: 450, y: 200 }, { x: 450, y: 320 }, { x: 382, y: 320 },
      { x: 382, y: 240 }, { x: 418, y: 240 }, { x: 418, y: 200 }, { x: 400, y: 200 }];
    expect(only(audit(sceneWith(bad) as never), 'no_backtrack')).toHaveLength(1);
    // 修法①"错开折点列": 干线改走 y=260, 末段的 x 区间不再落进任何同 y 段
    const fixed = bad.map((p, i) => (i < 2 ? { x: p.x, y: 260 } : p));
    expect(only(audit(sceneWith(fixed) as never), 'no_backtrack')).toEqual([]);
    expect(audit(sceneWith(fixed) as never).pass).toBe(true);
  });

  it('去重: 相邻与非相邻同时命中时只报一处(报最显眼的相邻档)', () => {
    // 上面那条自重叠折线, 末尾再叠一个"出 10px 又退回"的相邻回折
    const both = [{ x: 250, y: 200 }, { x: 450, y: 200 }, { x: 450, y: 320 }, { x: 382, y: 320 },
      { x: 382, y: 240 }, { x: 418, y: 240 }, { x: 418, y: 200 }, { x: 400, y: 200 }, { x: 410, y: 200 }];
    expect(firstBacktrackIndex(both)).toBe(7);
    expect(selfOverlapIndex(both)).toBe(0); // 两档都成立
    const d = only(audit(sceneWith(both) as never), 'no_backtrack');
    expect(d).toHaveLength(1); // 一条边一处诊断
    expect(d[0].evidence.kind).toBe('adjacent');
    expect(d[0].message).toContain('原地折回');
  });

  it('指标: 干净场景给 0(不是 -1) —— 这个零是真的"测过了, 结果为零"', () => {
    const r = audit(sceneWith([{ x: 0, y: 0 }, { x: 100, y: 0 }]) as never);
    expect(r.metrics.backtracks).toBe(0);
    // 而坐标非有限时短路分支给 -1(没得测)
    const bad = audit({ width: 100, height: 100, nodes: [{ id: 'n', rect: { x: NaN, y: 0, w: 1, h: 1 } }], edges: [] });
    expect(bad.metrics.backtracks).toBe(-1);
  });
});
