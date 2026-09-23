// =====================================================================
// cluster · 组语义(membership 声明制)与自洽四条门禁
//
// 这一刀的验收纪律与别处不同: 它管的是**作者声明**与**几何**是否自洽, 所以每条门禁都要
// 两个方向都举证 —— ① 会喊疼(声明跑偏时点到具体成员/具体边, 而不是笼统说"框有点怪");
// ② 照 `supportedFixes` 真能修好(把 patch 套回去重审, 那条诊断必须消失)。
// 第三条同样重要: **不许误伤** —— 合法嵌套 / 进出组框的边 / 端点落在框线上的跨层边, 全是
// 正常写法, 必须安静。260917 的教训: 门禁 pass ≠ 有效, 但也别忘了假警报比漏报更快毁掉信用。
//
// 四条门禁的判据性质(为什么是 error 而不是 warning): 它们都是"声明与几何的矛盾",
// 属几何**事实**, 不是可读性判断 —— 与密度四项(启发式, 一律 warning)分属两档。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { type Scene, type SceneGroup, audit } from '../src/knives/audit';
import { clusterAudit, declaredMemberIds, groupMembers } from '../src/knives/cluster';
import { createScene, deriveGroupRect, fitGroupFrames } from '../src/scene';

type NodeSpec = { id: string; x: number; y: number; w?: number; h?: number };
const node = ({ id, x, y, w = 100, h = 40 }: NodeSpec) => ({ id, rect: { x, y, w, h }, label: id });
const group = (id: string, x: number, y: number, w: number, h: number, contains?: string[]): SceneGroup =>
  ({ id, rect: { x, y, w, h }, label: id, ...(contains ? { contains } : {}) });
const scene = (parts: Partial<Scene> & Pick<Scene, 'nodes' | 'groups'>): Scene =>
  ({ width: 800, height: 500, edges: [], ...parts });

const diags = (s: Scene, code: string, opts?: Parameters<typeof audit>[1]) =>
  audit(s, opts).diagnostics.filter((d) => d.code === code);
/** 把某条修法的 patch 里那个"重算过的框"套回 scene(修法闭环测的就是它真能修好) */
const applyFramePatch = (s: Scene, d: { supportedFixes: Array<{ kind?: string; patch?: Record<string, unknown> }> }, gid: string): Scene => {
  const rect = d.supportedFixes.find((f) => f.kind === 'fit-frame' && Array.isArray(f.patch?.rect))?.patch?.rect as number[];
  return {
    ...s,
    groups: (s.groups ?? []).map((g) => (g.id === gid ? { ...g, rect: { x: rect[0], y: rect[1], w: rect[2], h: rect[3] } } : g)),
  };
};

describe('cluster · membership 声明制与组自洽四条门禁', () => {
  it('membership 解析: 声明优先, 未声明才回落几何反推; `contains: []` 与"没写"是两回事', () => {
    const s = scene({
      nodes: [node({ id: 'a', x: 60, y: 60 }), node({ id: 'b', x: 400, y: 60 })],
      groups: [group('declared', 40, 40, 240, 120, ['b']), group('inferred', 40, 40, 500, 120)],
    });
    // 声明了就以声明为准 —— 哪怕 b 在框外(a 在框内): 那是要报出来的事, 不是该悄悄纠正的事
    expect(declaredMemberIds(s.groups![0])).toEqual(['b']);
    expect(groupMembers(s, s.groups![0])).toEqual({ ids: ['b'], declared: true });
    // 没声明 → 几何反推(节点盒整个落在框内), 且 `declared: false` 让调用方知道这是推断
    expect(groupMembers(s, s.groups![1])).toEqual({ ids: ['a', 'b'], declared: false });
    // 规范化: 去重 + codepoint 序(JSON 对账不该取决于作者写声明的先后)
    expect(declaredMemberIds({ id: 'g', rect: s.groups![0].rect, contains: ['b', 'a', 'b'] })).toEqual(['a', 'b']);
    // 未声明的组数可得 —— 启发式回落了哪几个框必须看得见
    expect(audit(s).metrics.undeclared_groups).toBe(1);
    expect(audit(s).metrics.declared_members).toBe(1);
  });

  it('① cluster_member_outside: 声明的成员在框外 → 点到具体成员与超出量, 且 fit-frame 修法真能修好', () => {
    const s = scene({
      nodes: [node({ id: 'a', x: 60, y: 60 }), node({ id: 'b', x: 400, y: 300 })],
      groups: [group('g', 40, 40, 240, 120, ['a', 'b'])],
    });
    const d = diags(s, 'cluster_member_outside');
    expect(d).toHaveLength(1);
    expect(d[0].severity).toBe('error'); // 声明与几何的矛盾 = 几何事实 → 拦出口
    expect(audit(s).pass).toBe(false);
    expect(d[0].subject).toEqual({ kind: 'group', id: 'g' });
    expect(d[0].evidence.member).toBe('b');
    expect(d[0].evidence.overflow as number).toBeGreaterThan(0);

    // 修法闭环: 框按"成员并集 + pad"重算之后, 这条诊断消失(且不再有别的 error)
    const fixed = applyFramePatch(s, d[0], 'g');
    expect(diags(fixed, 'cluster_member_outside')).toEqual([]);
    expect(audit(fixed).pass).toBe(true);
  });

  it('② cluster_member_outside 覆盖"子框整个跑到父框外"(成员可以是组框) + 不存在的 id 不许静默丢', () => {
    const nested = scene({
      nodes: [node({ id: 'a', x: 420, y: 300 })],
      groups: [group('outer', 40, 40, 200, 120, ['inner']), group('inner', 420, 280, 140, 80, ['a'])],
    });
    const d = diags(nested, 'cluster_member_outside');
    expect(d).toHaveLength(1);
    expect(d[0].evidence.kind).toBe('nested_frame_outside'); // 不是"部分越出", 是整个跑到外面
    expect(d[0].evidence.memberKind).toBe('group');

    // 声明了一个 scene 里没有的 id: 同样是"不在框内", 但必须报出来而不是悄悄跳过
    const ghost = scene({ nodes: [node({ id: 'a', x: 60, y: 60 })], groups: [group('g', 40, 40, 240, 120, ['a', 'nope'])] });
    const gd = diags(ghost, 'cluster_member_outside');
    expect(gd).toHaveLength(1);
    expect(gd[0].evidence.kind).toBe('unknown_member');
  });

  it('③ cluster_frame_cross: 框交叉 + 成员重合 → 列出 shared / only-in-A / only-in-B, 且拆开共享后即安静', () => {
    const s = scene({
      nodes: [node({ id: 'a', x: 60, y: 60 }), node({ id: 'b', x: 220, y: 60 })],
      groups: [group('g1', 40, 40, 240, 120, ['a', 'b']), group('g2', 180, 40, 240, 120, ['b'])],
    });
    const d = diags(s, 'cluster_frame_cross');
    expect(d).toHaveLength(1);
    expect(d[0].severity).toBe('error');
    expect(d[0].evidence.shared).toEqual(['b']);
    expect(d[0].evidence.onlyInA).toEqual(['a']);
    expect(d[0].evidence.onlyInB).toEqual([]);
    expect(d[0].message).toContain('谁装谁说不清');

    // 修法闭环(拆共享成员): 谁装谁说得清之后, 这条诊断消失
    const split = { ...s, groups: [s.groups![0], { ...s.groups![1], contains: [] }] };
    expect(diags(split, 'cluster_frame_cross')).toEqual([]);
    // 反证: 框交叉但成员互不相干 → 不是"说不出谁装谁", 只剩密度那边一条 warning
    const disjoint = { ...s, groups: [s.groups![0], { ...s.groups![1], contains: ['z'] }] };
    expect(diags(disjoint, 'cluster_frame_cross')).toEqual([]);
    expect(audit(disjoint).diagnostics.some((x) => x.code === 'cluster_overlap')).toBe(true);
  });

  it('④ cluster_nesting_contradiction: **仅 tree 档**启用, 同一份几何在 set 档是合法的正交 scope', () => {
    const s = scene({
      nodes: [node({ id: 'a', x: 80, y: 80 })],
      // 外层框包住内层框, 但外层只声明了 a —— 内层声明的 b 不在外层声明里
      groups: [group('outer', 40, 40, 400, 300, ['a']), group('inner', 200, 180, 180, 120, ['b'])],
    });
    expect(diags(s, 'cluster_nesting_contradiction')).toEqual([]); // 缺省 set 档: 集合语义, 交叉/包含不构成矛盾
    const d = diags(s, 'cluster_nesting_contradiction', { clusterTier: 'tree' });
    expect(d).toHaveLength(1);
    expect(d[0].severity).toBe('error');
    expect(d[0].evidence.escaped).toEqual(['b']);

    // 修法闭环(extend-wraps): 把逃逸的身份并进外层声明 → 框包含与成员包含一致, 诊断消失
    const fixed = { ...s, groups: [{ ...s.groups![0], contains: ['a', 'b'] }, s.groups![1]] };
    expect(diags(fixed, 'cluster_nesting_contradiction', { clusterTier: 'tree' })).toEqual([]);
    // 档位也能挂在 scene 上(显式选, 不靠调用方记得传选项)
    expect(diags({ ...s, clusterTier: 'tree' }, 'cluster_nesting_contradiction')).toHaveLength(1);
  });

  it('⑤ cluster_border_clearance: 框线切节点 / 框内节点呼吸位不足 → 点名节点与缺口, 挪开即安静', () => {
    const close = scene({
      nodes: [node({ id: 'n', x: 200, y: 60 })],
      groups: [group('g', 180, 40, 240, 300)],
    });
    const d = diags(close, 'cluster_border_clearance');
    expect(d).toHaveLength(1);
    expect(d[0].severity).toBe('error');
    expect(d[0].evidence.kind).toBe('node_border_too_close');
    expect(d[0].evidence.gap).toBe(20);
    // 修法闭环: 往框内挪够呼吸位 → 安静(门禁量的是"框线附近的归属模糊带", 不是绝对位置)
    const moved = { ...close, nodes: [node({ id: 'n', x: 210, y: 70 })] };
    expect(diags(moved, 'cluster_border_clearance')).toEqual([]);

    // 切过框线(一半在内一半在外)是另一档, 且比"太近"更硬: 没有可接受的间距
    const straddle = scene({ nodes: [node({ id: 'n', x: 140, y: 60 })], groups: [group('g', 180, 40, 240, 300)] });
    const sd = diags(straddle, 'cluster_border_clearance');
    expect(sd).toHaveLength(1);
    expect(sd[0].evidence.kind).toBe('node_crosses_border');
    expect(audit(straddle).pass).toBe(false);

    // 边界语义: 框窄到装不下呼吸位时不判"太近"那一档 —— 作者怎么摆都过不了的判据不配进 fail-closed
    const tiny = scene({ nodes: [node({ id: 'n', x: 120, y: 120, w: 40, h: 30 })], groups: [group('g', 110, 110, 50, 40)] });
    expect(diags(tiny, 'cluster_border_clearance')).toEqual([]);
  });

  it('⑥ cluster_border_clearance: 边横穿组框 → 报"穿"而不是"蹭", 且绕开即安静(端点落框内的边不算穿)', () => {
    const edges = [{ id: 'e', points: [{ x: 140, y: 320 }, { x: 340, y: 320 }, { x: 460, y: 320 }] }];
    const s = scene({
      nodes: [node({ id: 'a', x: 40, y: 300 }), node({ id: 'b', x: 460, y: 300 })],
      edges,
      groups: [group('g', 280, 40, 160, 340)],
    });
    const d = diags(s, 'cluster_border_clearance');
    expect(d).toHaveLength(1);
    expect(d[0].evidence.kind).toBe('edge_crosses_frame');
    expect(d[0].evidence.through as number).toBeGreaterThan(100);

    // 反证(不许误伤): 端点落在框内的边 = "进/出框", 成员进出组框是常态, 不是事故
    const entering = scene({
      nodes: [node({ id: 'a', x: 40, y: 300 }), node({ id: 'b', x: 280, y: 200 })],
      edges: [{ id: 'e', points: [{ x: 140, y: 320 }, { x: 330, y: 320 }, { x: 330, y: 240 }] }],
      groups: [group('g', 180, 40, 240, 340)],
    });
    expect(diags(entering, 'cluster_border_clearance')).toEqual([]);

    // 修法闭环(绕开): 把折线提到框上方走 → 诊断消失
    const outside = { ...s, edges: [{ id: 'e', points: [{ x: 140, y: 320 }, { x: 140, y: 20 }, { x: 460, y: 20 }, { x: 460, y: 320 }] }] };
    expect(diags(outside, 'cluster_border_clearance')).toEqual([]);
  });

  it('⑦ cluster_border_clearance: 边沿框线跑(含与框线共线) → 报"并成一条", 拉开即安静', () => {
    const s = scene({
      nodes: [node({ id: 'a', x: 40, y: 40 })],
      edges: [{ id: 'e', points: [{ x: 120, y: 202 }, { x: 520, y: 202 }, { x: 520, y: 160 }] }],
      groups: [group('g', 60, 200, 400, 200)], // 框顶边 y=200, 边在 202 —— 垂距 2px, 并行 400px
    });
    const d = diags(s, 'cluster_border_clearance');
    expect(d).toHaveLength(1);
    expect(d[0].evidence.kind).toBe('edge_runs_along_border');
    expect(d[0].evidence.gap).toBe(2);

    // 修法闭环: 把这条边推离框线(垂距 ≥ 门禁下限) → 安静
    const shifted = { ...s, edges: [{ id: 'e', points: [{ x: 120, y: 220 }, { x: 520, y: 220 }, { x: 520, y: 160 }] }] };
    expect(diags(shifted, 'cluster_border_clearance')).toEqual([]);

    // 边界语义: 短擦过(投影重叠 < 24px)不算"沿框跑" —— 只截一小段的边不该被喊
    const glance = { ...s, edges: [{ id: 'e', points: [{ x: 480, y: 202 }, { x: 520, y: 202 }, { x: 520, y: 160 }] }] };
    expect(diags(glance, 'cluster_border_clearance')).toEqual([]);
  });

  it('反证(消误报): 合法嵌套 + 端点在框线上的跨层边, 四条门禁一条都不喊', () => {
    const s = scene({
      nodes: [node({ id: 'a', x: 80, y: 80 }), node({ id: 'b', x: 240, y: 220 })],
      // 端点在**组框边线上**的跨层边(from/to 指组框)是既定写法 —— 组锚点必须豁免
      edges: [{ id: 'e', from: 'a', to: 'outer', points: [{ x: 180, y: 80 }, { x: 180, y: 40 }] }],
      groups: [group('outer', 40, 40, 380, 300, ['a', 'b']), group('inner', 200, 180, 180, 120, ['b'])],
    });
    const codes = audit(s).diagnostics.map((d) => d.code);
    for (const c of ['cluster_member_outside', 'cluster_frame_cross', 'cluster_border_clearance', 'cluster_overlap'])
      expect(codes).not.toContain(c);
    expect(audit(s).metrics.cluster_border_clearance).toBe(0);
    expect(audit(s).metrics.cluster_member_outside).toBe(0);
  });

  it('scene 层派生: deriveGroupRect = 成员并集 + pad; fitGroupFrames 批量刷框且丢掉过期 labelRect', () => {
    const s = scene({
      nodes: [node({ id: 'a', x: 60, y: 60 }), node({ id: 'b', x: 300, y: 60 })],
      groups: [{ ...group('g', 40, 40, 500, 200, ['a', 'b']), labelRect: { x: 54, y: 44, w: 10, h: 14 } }],
    });
    // 成员并集 (60,60)-(400,100) + 缺省 pad 28
    expect(deriveGroupRect(s, 'g')).toEqual({ x: 32, y: 32, w: 396, h: 96 });
    // 没声明成员 / 声明指向不存在的 id → 推不出来, 不许猜一个框
    expect(deriveGroupRect(s, 'ghost')).toBeNull();
    expect(deriveGroupRect(scene({ nodes: [], groups: [group('g', 0, 0, 10, 10)] }), 'g')).toBeNull();

    const fitted = fitGroupFrames(s);
    expect(fitted.changed).toEqual(['g']);
    expect(fitted.scene.groups![0].rect).toEqual({ x: 32, y: 32, w: 396, h: 96 });
    expect(fitted.scene.groups![0].labelRect).toBeUndefined(); // 按旧框算的标签盒必须作废, 不许留给 audit 审
    expect(s.groups![0].rect).toEqual({ x: 40, y: 40, w: 500, h: 200 }); // 纯函数: 入参不动
    expect(fitGroupFrames(s).scene.groups![0].labelRect).toBeUndefined();
    // 派生出来的框必然过呼吸位门禁(否则"照修法修好"就是假的)
    expect(audit(fitted.scene).diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('规范化与确定性: createScene 落缺省档 + 声明去重排序; 审计是纯函数(入参逐字节不变)', () => {
    const s = scene({ nodes: [node({ id: 'a', x: 60, y: 60 })], groups: [group('g', 40, 40, 240, 120, ['a', 'a'])] });
    const before = JSON.stringify(s);
    const r1 = clusterAudit(s);
    const r2 = clusterAudit(s);
    expect(JSON.stringify(r2)).toBe(JSON.stringify(r1)); // 诊断与度量都逐字节确定
    expect(JSON.stringify(s)).toBe(before);
    expect(r1.metrics.cluster_tier).toBe(0);
    expect(clusterAudit(s, { tier: 'tree' }).metrics.cluster_tier).toBe(1);

    // createScene 的组侧规范化(语义档落缺省 / 声明去重排序)
    const doc = createScene({ width: 600, height: 400, nodes: [], edges: [], groups: [group('g', 40, 40, 240, 120, ['b', 'a', 'b'])] });
    expect(doc.clusterTier).toBe('set');
    expect(doc.groups![0].contains).toEqual(['a', 'b']);
    // 档位取法: 场景自带优先, 缺省才吃 opts(scene.clusterTier ?? opts.clusterTier ?? 'set')
    expect(createScene({ width: 600, height: 400, nodes: [], edges: [], groups: [] }, { clusterTier: 'tree' }).clusterTier).toBe('tree');
    expect(createScene({ ...doc, clusterTier: 'tree' }, { clusterTier: 'set' }).clusterTier).toBe('tree');

    // 成对门禁(② / 嵌套矛盾)的文案与 subject **不随 groups 书写顺序变** —— 报告要能逐字节 diff
    const pair = scene({ nodes: [node({ id: 'a', x: 60, y: 60 }), node({ id: 'b', x: 220, y: 60 })], groups: [group('g1', 40, 40, 240, 120, ['a', 'b']), group('g2', 180, 40, 240, 120, ['b'])] });
    const reversed = { ...pair, groups: [...pair.groups!].reverse() };
    const pick = (x: Scene) => JSON.stringify(audit(x).diagnostics.filter((d) => d.code === 'cluster_frame_cross'));
    expect(pick(reversed)).toBe(pick(pair));
    expect(pick(pair)).not.toBe('[]');
  });

  // --- 显式 frame(框由作者定)------------------------------------------
  // 由来(260918 archify 复刻实测): 组框过去**只能是成员并集 + pad 的派生量**, 于是成员必然贴框线
  // (实测 12 个节点各差 18px, 是几何必然); 而 archify 的泳道是**横跨画布的一等公民**。
  // `frame: 'declared'` 就是那第三种表达 —— 门禁照旧按 `g.rect` 判(声明与几何的矛盾 = 事实级 error),
  // 但"按成员并集重算"这条修法对声明框不成立: 那会覆盖作者给的框。
  const laneScene = (frame?: 'declared'): Scene =>
    scene({
      nodes: [node({ id: 'a', x: 40, y: 60 }), node({ id: 'b', x: 300, y: 60 })],
      // 框横铺到 800(远宽于成员并集 40..400), 上下各留 60/86 呼吸位
      groups: [{ id: 'lane', rect: { x: 0, y: 0, w: 800, h: 200 }, label: 'lane', contains: ['a', 'b'], ...(frame ? { frame } : {}) }],
    });

  it('显式 frame · 正例: 作者框横铺全宽 → 成员全在框内, 四条门禁一条都不喊(派生框做不到这一点)', () => {
    const s = laneScene('declared');
    expect(audit(s).diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    // 同一份 rect, 区别只在"来源"这一位: 声明框原样返回作者的值(横铺全宽),
    // 未声明的按成员并集 + pad 派生 —— 泳道那种框, 派生的实现永远给不出来
    expect(deriveGroupRect(s, 'lane')).toEqual({ x: 0, y: 0, w: 800, h: 200 });
    expect(deriveGroupRect(laneScene(), 'lane')).toEqual({ x: 12, y: 32, w: 416, h: 96 });
  });

  it('显式 frame · 反例: 声明的成员跑到作者框外 → 照旧是 error, 且修法**不许**叫人去重算框', () => {
    const s = scene({
      nodes: [node({ id: 'a', x: 40, y: 60 }), node({ id: 'b', x: 720, y: 60 })], // b 右缘 820 > 框右缘 800
      groups: [{ id: 'lane', rect: { x: 0, y: 0, w: 800, h: 200 }, label: 'lane', contains: ['a', 'b'], frame: 'declared' }],
    });
    const d = diags(s, 'cluster_member_outside');
    expect(d.length).toBe(1);
    expect(d[0].evidence.overflow).toBe(20);
    expect(d[0].evidence.frameRect).toEqual([0, 0, 800, 200]); // 判的是**作者给的框**, 不是派生框
    // 声明框的唯一修法是手工改框/挪成员; "按成员并集重算 + 带 rect patch" 只会覆盖作者的值
    expect(d[0].supportedFixes.map((f) => f.kind)).toEqual(['resize-frame', 'move-member', 'redeclare-member']);
    // 对照: 同一个框**不声明** frame 时, fit-frame 立刻回来(这就是"来源"这一位在管的事)
    const derived = { ...s, groups: [{ ...s.groups![0], frame: undefined }] } as Scene;
    expect(diags(derived, 'cluster_member_outside')[0].supportedFixes[0].kind).toBe('fit-frame');
  });

  it('显式 frame · 呼吸位: 框线贴成员照旧报错, 但修法是"手工改框"而不是"让派生替你改"', () => {
    const s = scene({
      nodes: [node({ id: 'a', x: 14, y: 60 })], // 距框左缘只有 14px < BORDER_CLEARANCE(24)
      groups: [{ id: 'lane', rect: { x: 0, y: 0, w: 800, h: 200 }, label: 'lane', contains: ['a'], frame: 'declared' }],
    });
    const d = diags(s, 'cluster_border_clearance');
    expect(d.length).toBe(1);
    expect(d[0].evidence).toMatchObject({ kind: 'node_border_too_close', node: 'a', gap: 14, limit: 24 });
    expect(d[0].supportedFixes.map((f) => f.kind)).toEqual(['resize-frame', 'move-node', 'regroup']);
    // 派生框的同一处: 修法是 fit-frame(带 pad patch) —— 两条路的区别只在这一位
    const derived = { ...s, groups: [{ ...s.groups![0], frame: undefined }] } as Scene;
    expect(diags(derived, 'cluster_border_clearance')[0].supportedFixes[0].kind).toBe('fit-frame');
  });
});
