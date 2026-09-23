// =====================================================================
// 分叉 / 汇合豁免 · 判据(260920)
//
// 门禁必须把「共享主干的正常拓扑」与「两条边画成一条」分开 —— 判据是**有没有拓扑解释**:
// 两条边各自两端都归到了节点上、且**只共享一个**节点 = 分叉或汇合, 那是真拓扑。
//
// 这份测试钉住**两个方向**(只证明"不抛"等于没验):
//   · 正例: 一源两目标共用主干 + 两源一目标共用汇合段 → 两档零诊断(改前 standard 4 条 error, fail-closed 出不了图)
//   · 反例三条: 同对节点重复边 / 中段并轨 / 悬浮端点同点出发 → **照旧报**(放宽不许把真缺陷放走)
//
// 数据只有一份: 场景具名导出自同目录的 `trunk-split-probe.ts` / `shared-trunk-probe.ts`
// (探针负责把数打印给人看, 本文件负责判决)—— 判据归 test, 示例只负责展示, 见 SKILL「示例: 判据归 test」。
//
// 口径出处: 代价层 `route-cost` 的 `sharedCorridorPx` 早就写着 `if (nb.sharesEndpoint) continue`
// (借参照实现 `routeInteractionMetrics`); 门禁此前没接这条线, 于是同一件事两层给相反答案。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { type Diagnostic, audit } from '../src/knives/audit';
import { CASES, scene } from './trunk-split-probe';
import { sceneA, sceneB, sceneC } from './shared-trunk-probe';

const codesOf = (diags: Diagnostic[]): string[] => [...new Set(diags.map((d) => d.code))];

describe('分叉 / 汇合豁免 · 正例', () => {
  it('一源两目标共用主干: 共享段贴着源端口 → 不报 edge_overlap(是分叉, 不是"两条边画重了")', () => {
    const rep = audit(scene, { level: 'standard' });
    expect(codesOf(rep.diagnostics)).toEqual([]);
    expect(rep.pass).toBe(true);
  });

  it('两源一目标共用汇合段: 同点进同一个端口 → 不报 port_crowding(是汇合, 不是挤在一个点)', () => {
    const rep = audit(scene, { level: 'standard' });
    expect(rep.diagnostics.filter((d) => d.code === 'port_crowding')).toHaveLength(0);
    expect(rep.metrics.port_crowding).toBe(0);
  });

  it('豁免不等于不量: 原始几何读数照旧给出(免得"静默"变成"没测")', () => {
    const rep = audit(scene, { level: 'standard' });
    // 主干确实重合了 95px —— 判决说它合法, 读数照旧能看见它
    expect(rep.metrics.edges).toBe(3);
    expect(rep.metrics.min_edge_length).toBeGreaterThan(0);
  });

  it('showcase 档的其余门禁照旧工作(豁免只放走这两把刀, 不是整张图放行)', () => {
    // 探针场景在 showcase 档仍有一条 label_fit(ov 盒宽装不下 'Order Validate')
    const rep = audit(scene, { level: 'showcase' });
    expect(rep.pass).toBe(false);
    expect(codesOf(rep.diagnostics)).toEqual(['label_fit']);
  });
});

describe('分叉 / 汇合豁免 · 反例(放宽不许把真缺陷放走)', () => {
  for (const c of CASES) {
    it(`${c.name} → 必须报 ${c.want.join(' + ')}`, () => {
      const codes = codesOf(audit(c.scene, { level: 'standard' }).diagnostics);
      for (const w of c.want) expect(codes).toContain(w);
    });
  }

  it('N1 不许被"两端全同"蒙混: 同对节点的重复边只共享两端 → 两个方向都不豁免', () => {
    const n1 = CASES[0].scene;
    const codes = codesOf(audit(n1, { level: 'standard' }).diagnostics);
    expect(codes).toContain('edge_overlap');   // 重叠本身照旧报
    expect(codes).toContain('port_crowding');  // 同点附着也照旧报(共享两端 ⇒ 不是分叉)
  });

  it('N2 只豁免"贴着共干段"的重叠: 中段并轨的重叠段两端都不含端口 → 照旧报', () => {
    const codes = codesOf(audit(CASES[1].scene, { level: 'standard' }).diagnostics);
    expect(codes).toEqual(['edge_overlap']);
  });

  it('N4 身份条件过了也要看几何: 公共前缀非空(真共享过一段), 但重叠段不盖住分叉点 → 照旧报', () => {
    // 这一例是 `onAxisSegment(prefixEnd, lo, hi)` 那条几何条件的**唯一**托底 ——
    // 松成"只要有公共前缀就豁免"时, 它静默通过(变异实测), 其余用例全绿 ⇒ 少了它这条条件就是死代码
    const rep = audit(CASES[3].scene, { level: 'standard' });
    expect(codesOf(rep.diagnostics)).toEqual(['edge_overlap']);   // 共干段自己豁免掉了, 重新并轨的那段照报
    expect(rep.metrics.edge_collinear).toBeGreaterThan(0);
  });
});

// =====================================================================
// 共享端点模式(fan-out 的默认画法) · 260920 补
//
// 豁免的几何条件是「重叠段盖住**两条边从共享端起的公共前缀末端点**」—— 端口点是它在 k=1 时的
// 特例。这条比"端口落在重叠段上"宽: 它认得**主干 + 水平总线**(公共前缀是主干 `(170,100)→(170,200)`,
// 重叠段是它后面的总线) —— 那正是教科书树形图, 人眼沿主干走到分叉点就能读出谁连谁。
// 而"端口摊开 + 同一条 lane"的公共前缀只剩端口一个点, 重叠段离它十万八千里 ⇒ 不豁免(真丢信息)。
//
// 实测对照见 `shared-trunk-probe.ts` 四形态; 示例 `examples/lanes-fanout.ts` 展示画法对比。
// =====================================================================
describe('共享端点模式 · 主干 + 总线', () => {
  it('同端口 fan-out: 主干与水平总线共线 → 零诊断(公共前缀末端点落在重叠段上)', () => {
    const rep = audit(sceneA, { level: 'standard' });
    expect(codesOf(rep.diagnostics)).toEqual([]);
    expect(rep.pass).toBe(true);
  });

  it('对照: 同一个源改成"端口摊开 + 同一条 lane" → 中段并轨照旧报', () => {
    // 公共前缀**空**(第一个点就不同) → 无从谈起"共干段", 与 N2 是同一档的另一个边界
    const codes = codesOf(audit(sceneC, { level: 'standard' }).diagnostics);
    expect(codes).toEqual(['edge_overlap']);
  });

  it('对照: 同端口 + assignLanes 也全绿 —— 两条路都通, 但长出的是两种图(树 vs 阶梯)', () => {
    expect(audit(sceneB, { level: 'standard' }).pass).toBe(true);
  });

  it('豁免的范围没扩大: 端口摊开的那一支(示例里的反例)照旧红', () => {
    // 防止未来有人把 sharedPrefixEnd 松成"只要有公共前缀就豁免" —— 那 C 就会静默通过
    const cRep = audit(sceneC, { level: 'standard' });
    expect(cRep.metrics.edge_collinear).toBeGreaterThan(0);
    expect(cRep.pass).toBe(false);
  });
});
