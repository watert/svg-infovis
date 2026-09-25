// =====================================================================
// audit 回归单测 · 四项几何门禁 + 两档判分 + 诊断可控性
//
// 与 examples/checks/audit-demo.ts 的分工: demo 是一份"大杂烩样本", 给人眼看诊断长什么样(那份"该抓的抓到、
// 该放的放过"的判据在 `test/audit-demo.test.ts`); 这份是**逐门禁的最小违例场景** —— 一个场景只埋一类违例,
// 断言"点名了哪个 id、severity 是什么、evidence 里的数是多少"。判据不是覆盖率, 而是"改错了会静默通过"的口子。
//
// 断言里刻意钉住的几条语义(都是实现里容易"顺手改坏"的地方):
//   · 越界容差 0.5px / 正交容差 0.01px 是绝对量, 不是方向量化(atn2 判正交是恒真式)
//   · label 的豁免只有一条: ownerEdge === 边 id; 其余边一律照查
//   · 命中式判据是 clearance + 1e-4 < threshold —— 恰好等于阈值 = 通过, 少不到 1e-4 也放行, 少 0.01px 就拦
//   · 正交是**无条件** error, 与 standard / showcase 无关
//   · min_label_clearance 无标签可测时是 -1(不是 0), 净空无法判定时同样不进测量
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { type AuditLevel, type Diagnostic, type Scene, type SceneEdge, type SceneLabel, THRESHOLDS, audit } from '../src/knives/audit';
import type { ClusterTier } from '../src/knives/cluster';

// --- 测试辅助 ----------------------------------------------------------

/** evidence 的值类型是宽联合(number | string | number[]), offenders 按字符串数组读 */
const offendersOf = (d: Diagnostic): string[] => d.evidence.offenders as unknown as string[];

/** 按 code 取唯一诊断: 场景是最小违例, 同一个 code 出现第二条本身就是断言失败 */
const findDiag = (diags: Diagnostic[], code: string): Diagnostic => {
  const hit = diags.filter((d) => d.code === code);
  expect(hit).toHaveLength(1);
  return hit[0];
};

/** `code:severity` 一览(排序后比对, 不看诊断顺序) */
const verdicts = (diags: Diagnostic[]): string[] => diags.map((d) => `${d.code}:${d.severity}`).sort();

/** 只取 code 一览(排序), 用来看"命中哪几个门禁" */
const codesOf = (diags: Diagnostic[]): string[] => diags.map((d) => d.code).sort();

/** 上下两层同宽节点, 上层底边在 y=70: y=69 → 重叠 1px, y=70 → 相触, y=71 → 相距 1px */
const stackedAt = (y: number): Scene => ({
  width: 300,
  height: 240,
  nodes: [
    { id: 'a', rect: { x: 20, y: 20, w: 100, h: 50 } },
    { id: 'b', rect: { x: 20, y, w: 100, h: 50 } },
  ],
  edges: [],
});

/** 水平边 y=100 + 一个贴在它上方 clearance px 处的标签(净空精确可控, 供命中式边界用) */
const labelAtClearance = (clearance: number): Scene => ({
  width: 300,
  height: 200,
  nodes: [],
  edges: [{ id: 'h', points: [{ x: 0, y: 100 }, { x: 200, y: 100 }] }],
  // 标签 h=16: 中心 y 减 8 是上沿, 上沿 + 16 是下沿, 于是下沿恰好落在 100 - clearance
  labels: [{ id: 'L', at: { x: 100, y: 100 - clearance - 8 }, width: 40, height: 16 }],
});

// --- 场景样本(每个只埋一类违例, 其余全合法) ----------------------------

/** 干净基线: 两节点 + 一条正交边 + 一个挂在自家边上的标签 */
const cleanScene: Scene = {
  width: 420,
  height: 260,
  nodes: [
    { id: 'x', rect: { x: 40, y: 30, w: 110, h: 44 } },
    { id: 'y', rect: { x: 250, y: 170, w: 110, h: 44 } },
  ],
  edges: [{ id: 'e', from: 'x', to: 'y', points: [{ x: 95, y: 74 }, { x: 95, y: 120 }, { x: 305, y: 120 }, { x: 305, y: 170 }] }],
  labels: [{ id: 'L', at: { x: 200, y: 120 }, width: 44, height: 16, ownerEdge: 'e' }],
};

/** 违例① finite_svg: 节点 rect 的 x 是 NaN */
const nanRectScene: Scene = {
  width: 300,
  height: 200,
  nodes: [{ id: 'nan-rect', rect: { x: NaN, y: 20, w: 60, h: 30 } }],
  edges: [],
};

/** 违例② finite_svg: 边折点 x 是 Infinity */
const infEdgeScene: Scene = {
  width: 300,
  height: 200,
  nodes: [],
  edges: [{ id: 'inf-edge', points: [{ x: 0, y: 20 }, { x: Infinity, y: 20 }] }],
};

/** 违例③ single_svg: 节点 rect 右沿 220 > 画布宽 200 */
const outsideNodeScene: Scene = {
  width: 200,
  height: 120,
  nodes: [{ id: 'too-wide', rect: { x: 120, y: 10, w: 100, h: 40 } }],
  edges: [],
};

/** 违例④ single_svg: 边折点 x=240 越出画布宽 200 */
const outsideEdgeScene: Scene = {
  width: 200,
  height: 120,
  nodes: [],
  edges: [{ id: 'over-hang', points: [{ x: 10, y: 10 }, { x: 240, y: 10 }] }],
};

/** 违例⑤ orthogonal_edges: 第 2 段 (140,40)→(146,90) 斜了 6px */
const slantScene: Scene = {
  width: 400,
  height: 300,
  nodes: [],
  edges: [{ id: 'slant', points: [{ x: 40, y: 40 }, { x: 140, y: 40 }, { x: 146, y: 90 }, { x: 146, y: 130 }] }],
};

/** 一条竖直线 + 一个正压在它身上的标签(净空 0) */
const verticalEdge: SceneEdge = { id: 'v', points: [{ x: 100, y: 20 }, { x: 100, y: 280 }] };
const labelOnLine: SceneLabel = { id: 'L-cross', at: { x: 100, y: 150 }, width: 40, height: 16 };
const labelHitScene: Scene = { width: 400, height: 300, nodes: [], edges: [verticalEdge], labels: [labelOnLine] };
/** 同一个标签, 但声明了 ownerEdge 就是这条边 → 豁免 */
const labelOwnedScene: Scene = {
  ...labelHitScene,
  labels: [{ ...labelOnLine, ownerEdge: 'v' }],
};

/** 违例⑥ node_gap: 两节点垂直间距 4px(< standard 的 8, 也 < showcase 的 12) */
const gap4Scene: Scene = {
  width: 300,
  height: 240,
  nodes: [
    { id: 'top', rect: { x: 20, y: 20, w: 120, h: 50 } },
    { id: 'bottom', rect: { x: 20, y: 74, w: 120, h: 50 } },
  ],
  edges: [],
};

/** node_overlap: 同样的布局改成真重叠 80x30 */
const overlapScene: Scene = {
  width: 300,
  height: 240,
  nodes: [
    { id: 'a', rect: { x: 20, y: 20, w: 120, h: 50 } },
    { id: 'b', rect: { x: 60, y: 40, w: 120, h: 50 } },
  ],
  edges: [],
};

/** 两档判分用的场景: 间距 4px + 标签净空 0 → 两档都命中, 只有 severity 不同 */
const warnScene: Scene = {
  width: 400,
  height: 300,
  nodes: [
    { id: 'top', rect: { x: 20, y: 20, w: 120, h: 50 } },
    { id: 'bottom', rect: { x: 20, y: 74, w: 120, h: 50 } },
  ],
  edges: [{ id: 'v', points: [{ x: 320, y: 20 }, { x: 320, y: 280 }] }],
  labels: [{ id: 'L', at: { x: 320, y: 150 }, width: 40, height: 16 }],
};

/** 阈值差异用的场景: 间距 10px + 标签净空 3px → standard 全过, showcase 两条都拦 */
const looseScene: Scene = {
  width: 400,
  height: 300,
  nodes: [
    { id: 'a', rect: { x: 20, y: 20, w: 120, h: 50 } },
    { id: 'b', rect: { x: 20, y: 80, w: 120, h: 50 } },
  ],
  edges: [{ id: 'h', points: [{ x: 0, y: 200 }, { x: 300, y: 200 }] }],
  // 标签 h=16 中心在 y=189 → 下沿 197, 距 y=200 的边恰好 3px
  labels: [{ id: 'L3', at: { x: 150, y: 189 }, width: 40, height: 16 }],
};

/** 两条交错边(真穿越 1 次) */
const crossScene: Scene = {
  width: 300,
  height: 240,
  nodes: [],
  edges: [
    { id: 'h', points: [{ x: 0, y: 80 }, { x: 240, y: 80 }] },
    { id: 'v', points: [{ x: 120, y: 20 }, { x: 120, y: 200 }] },
  ],
};
/** 同样的两条边改成 T 形相触(竖线端点搭在横线内部) —— proper 相交不算 */
const tTouchScene: Scene = {
  ...crossScene,
  edges: [crossScene.edges[0], { id: 't', points: [{ x: 120, y: 80 }, { x: 120, y: 200 }] }],
};

/** 偏离量不同的两条斜边: small = 3px, big = 10px */
const smallSlantScene: Scene = {
  width: 400,
  height: 300,
  nodes: [],
  edges: [{ id: 'small', points: [{ x: 0, y: 0 }, { x: 3, y: 20 }, { x: 3, y: 40 }] }],
};
const bigSlantScene: Scene = {
  width: 400,
  height: 300,
  nodes: [],
  edges: [{ id: 'big', points: [{ x: 100, y: 0 }, { x: 100, y: 20 }, { x: 110, y: 20 }, { x: 120, y: 30 }] }],
};

/** 标签 vs 边: 标签遮罩矩形含 NaN → 净空"无法判定", 不许当成 0 或直接放行 */
const unknownClearanceScene: Scene = {
  width: 400,
  height: 300,
  nodes: [],
  edges: [{ id: 'h', points: [{ x: 0, y: 100 }, { x: 200, y: 100 }] }],
  labels: [{ id: 'L-nan', at: { x: NaN, y: 40 }, width: 40, height: 16 }],
};

/** 五类 error 齐活的场景(supportedFixes / 确定性 用): 重叠 + 非有限 + 越界 + 斜段 + 标签压线 */
const dirtyScene: Scene = {
  width: 300,
  height: 200,
  nodes: [
    { id: 'p', rect: { x: 20, y: 20, w: 60, h: 40 } },
    { id: 'q', rect: { x: 30, y: 30, w: 60, h: 40 } }, // 与 p 真重叠
    { id: 'nan', rect: { x: NaN, y: 150, w: 40, h: 20 } }, // 非有限坐标
    { id: 'out', rect: { x: 280, y: 10, w: 60, h: 30 } }, // 越出画布(右沿 340)
  ],
  edges: [
    { id: 'slanted', points: [{ x: 0, y: 180 }, { x: 40, y: 186 }, { x: 40, y: 195 }] }, // 第 1 段斜 6px
    { id: 'crossed', points: [{ x: 0, y: 60 }, { x: 250, y: 60 }] }, // 被下面的标签压住
    { id: 'infinite', points: [{ x: 0, y: 100 }, { x: Infinity, y: 100 }] }, // 净空无法判定
  ],
  labels: [{ id: 'clash', at: { x: 100, y: 60 }, width: 40, height: 16 }],
};

/**
 * ⑮-⑱ 组语义自洽四条(membership 声明跑偏的四种方式)的样本。
 * 前三条在缺省 set 档就该出场; `cluster_nesting_contradiction` **只在 tree 档**启用,
 * 所以这一份样本按 tree 档跑 —— 四条 code 一次收集齐(样本脏得刚好: 不短路, 也不互相吃掉)。
 */
const clusterScene: Scene = {
  width: 800,
  height: 500,
  nodes: [
    { id: 'a', rect: { x: 60, y: 60, w: 100, h: 40 } },
    { id: 'b', rect: { x: 220, y: 60, w: 100, h: 40 } }, // 骑在 g1 右框线上 + 贴 g2 左框线
    { id: 'far', rect: { x: 600, y: 300, w: 100, h: 40 } }, // 被 g1 声明为成员, 人却在外面
    { id: 'w', rect: { x: 140, y: 290, w: 100, h: 40 } }, // nin 的成员, 不在 nout 的声明里
    { id: 'z', rect: { x: 350, y: 290, w: 60, h: 40 } }, // nout 的成员
  ],
  edges: [
    { id: 'ecross', points: [{ x: 20, y: 240 }, { x: 460, y: 240 }] }, // 横穿 nout(两端都在框外)
    { id: 'erun', points: [{ x: 300, y: 158 }, { x: 450, y: 158 }] }, // 在 g2 内沿它的下框线跑(垂距 2px)
  ],
  groups: [
    { id: 'g1', rect: { x: 40, y: 40, w: 240, h: 120 }, contains: ['a', 'b', 'far'] },
    { id: 'g2', rect: { x: 220, y: 40, w: 240, h: 120 }, contains: ['b'] }, // 与 g1 交叉, 共享 b
    { id: 'nout', rect: { x: 40, y: 220, w: 400, h: 200 }, contains: ['z'] },
    { id: 'nin', rect: { x: 100, y: 260, w: 240, h: 120 }, contains: ['w'] }, // 框被 nout 包住, 成员却没被声明
  ],
};

/**
 * 剩下的 error 门禁(`text_clearance` / `label_fit` / `no_backtrack` / `owner_ref`)的样本。
 * 它们不脏到会短路(没有非有限值), 但同场出现即可 —— 目的只有一个: 让下面"每条诊断都带修法"的巡检
 * 覆盖到**全部十九类 error**, 而不是自欺地在名单外空转。
 */
const otherErrorsScene: Scene = {
  width: 600,
  height: 400,
  nodes: [
    { id: 'long', rect: { x: 40, y: 40, w: 90, h: 40 }, label: '这是一个非常非常长的节点主标题' }, // label_fit
  ],
  edges: [
    // 第 2 个折点原地折回 → no_backtrack; 首段横穿下面的旁注 → text_clearance
    { id: 'bt', points: [{ x: 40, y: 300 }, { x: 200, y: 300 }, { x: 150, y: 300 }, { x: 150, y: 360 }] },
    { id: 'ghost', points: [{ x: 400, y: 40 }] }, // 1 点边 → edge_degenerate(其余边级门禁全跳过它)
  ],
  texts: [
    { id: 'note', rect: { x: 120, y: 292, w: 120, h: 20 }, text: '旁注' },
    // ⑲ owner_ref: 归属指向一条不存在的边(幽灵引用) —— 位置挑在空处, 免得顺手再喊别的门禁
    { id: 'ghost-owner', rect: { x: 320, y: 60, w: 90, h: 18 }, text: '幽灵归属', owner: { kind: 'edge', id: 'no-such-edge' } },
  ],
};

/**
 * ⑭ text_overlap 的样本: 旁注压在节点盒上。
 * 与 otherErrorsScene 分开摆 —— 那个样本的旁注是给 text_clearance 用的, 混在一起两条诊断的
 * subject id 会撞车(都叫 note), 读报告时对不上号。
 */
const textOverlapScene: Scene = {
  width: 400,
  height: 200,
  nodes: [{ id: 'box', rect: { x: 60, y: 50, w: 200, h: 60 }, label: '盒子' }],
  edges: [],
  texts: [{ id: 'note', rect: { x: 80, y: 70, w: 120, h: 18 }, text: '压在盒子上' }],
};

// --- 测试正文 ----------------------------------------------------------

/**
 * 第四轮三项(⑩ 端口拥挤 / ⑪ 折点贴端点 / ⑫ 边重叠)齐活的样本。
 * 它的作用不是覆盖率, 而是让下面那条"每条诊断都带修法"的巡检**不空转** —— 新增门禁时如果忘了补样本,
 * 末行的 code 全会当场提醒你。
 */
const fourthRoundScene: Scene = {
  width: 400,
  height: 300,
  nodes: [
    { id: 'h', rect: { x: 100, y: 100, w: 100, h: 60 } },
    { id: 't', rect: { x: 200, y: 220, w: 100, h: 60 } },
  ],
  edges: [
    // ⑩ 三条边都从 h 左边界同一个点、同一个方向出发(p1/p2 相距 1px, o1 与它们重合)
    { id: 'p1', from: 'h', points: [{ x: 100, y: 130 }, { x: 40, y: 130 }, { x: 40, y: 60 }] },
    { id: 'p2', from: 'h', points: [{ x: 101, y: 130 }, { x: 30, y: 130 }, { x: 30, y: 60 }] },
    { id: 'o1', from: 'h', points: [{ x: 100, y: 130 }, { x: 20, y: 130 }, { x: 20, y: 60 }] },
    // ⑪ 末段只有 4px(t 是它自己的端节点, 不算穿盒)
    { id: 's1', from: 'h', to: 't', points: [{ x: 200, y: 130 }, { x: 296, y: 130 }, { x: 296, y: 250 }, { x: 300, y: 250 }] },
  ],
};

describe('audit · 四项几何门禁与两档判分回归', () => {
  // 门禁① finite_svg --------------------------------------------------

  it('finite_svg: 节点 rect 含 NaN → 报出该节点 id, severity error', () => {
    const r = audit(nanRectScene);
    const d = findDiag(r.diagnostics, 'finite_svg');
    expect(d.severity).toBe('error');
    // subject.id 取 offenders[0], 也就是被点名的那个 id
    expect(d.subject).toEqual({ kind: 'scene', id: 'node:nan-rect' });
    expect(offendersOf(d)).toEqual(['node:nan-rect']);
    expect(r.pass).toBe(false);
  });

  it('finite_svg: 边 points 含 Infinity → 报出该边 id(不是 scene)', () => {
    const r = audit(infEdgeScene);
    const d = findDiag(r.diagnostics, 'finite_svg');
    expect(d.severity).toBe('error');
    expect(d.subject.id).toBe('edge:inf-edge');
    expect(offendersOf(d)).toEqual(['edge:inf-edge']);
  });

  // ⚠ 已知实现缺陷(本回归暴露, 此处只记录、不断言 —— 断言会红, 留给 src/ 修):
  //   ① 边折点含 **NaN** 时 audit() 直接抛 TypeError, 而不是返回 fail-closed 报告:
  //      orthogonalDeviation 对 NaN 端点是 Math.min(NaN, 0) = NaN → worst = NaN →
  //      devs.indexOf(NaN) === -1 → audit.ts:131 读 e.points[-1].x 崩。NaN 恰恰是
  //      finite_svg 要接住的输入, 门禁却先在③号门禁上炸了。
  //   ② 边折点含 **Infinity** 时正交门禁照样报 error, 但 evidence.deviation = 0、
  //      message 写"偏离 0.00px"(自相矛盾), 且 snap-point 修法指向几何上无意义的折点。

  it('finite_svg: 画布宽高非有限也抓(scene:canvas 前缀)', () => {
    const r = audit({ width: NaN, height: 200, nodes: [], edges: [] });
    const d = findDiag(r.diagnostics, 'finite_svg');
    expect(offendersOf(d)).toEqual(['scene:canvas']);
  });

  // 门禁② single_svg --------------------------------------------------

  it('single_svg: 节点越出画布 → offenders 带 node id, evidence.canvas 是画布尺寸', () => {
    const r = audit(outsideNodeScene);
    const d = findDiag(r.diagnostics, 'single_svg');
    expect(d.severity).toBe('error');
    expect(d.subject).toEqual({ kind: 'scene', id: 'node:too-wide' });
    expect(offendersOf(d)).toEqual(['node:too-wide']);
    expect(d.evidence.canvas).toEqual([200, 120]);
    expect(r.pass).toBe(false);
  });

  it('single_svg: 边折点越界 → offenders 带 edge id', () => {
    const r = audit(outsideEdgeScene);
    const d = findDiag(r.diagnostics, 'single_svg');
    expect(d.severity).toBe('error');
    expect(d.subject.id).toBe('edge:over-hang');
    expect(offendersOf(d)).toEqual(['edge:over-hang']);
    // 水平线本身正交, 越界违例只此一条
    expect(r.diagnostics).toHaveLength(1);
  });

  // 门禁③ orthogonal_edges(无条件硬失败) -----------------------------

  it('orthogonal_edges: 斜段命中, deviation / segmentIndex 指向正确段, 且两档都是 error', () => {
    const std = audit(slantScene, { level: 'standard' });
    const d = findDiag(std.diagnostics, 'orthogonal_edges');
    expect(d.subject).toEqual({ kind: 'edge', id: 'slant' });
    expect(d.evidence.deviation).toBe(6); // |146-140| = 6, |90-40| = 50 → min = 6
    expect(d.evidence.segmentIndex).toBe(1); // 第 2 段(0-based 1): (140,40)→(146,90)
    expect(d.evidence.points).toEqual([40, 40, 140, 40, 146, 90, 146, 130]);
    expect(d.message).toContain('第 2 段');

    // 正交是硬失败: 换档位不改 severity, 也不改 pass
    const show = findDiag(audit(slantScene, { level: 'showcase' }).diagnostics, 'orthogonal_edges');
    expect([d.severity, show.severity]).toEqual(['error', 'error']);
    expect(std.pass).toBe(false);
    expect(std.metrics.errors).toBe(1);
    expect(std.metrics.warnings).toBe(0);
  });

  it('orthogonal_edges: 0.5px 斜的"近似竖直"段照样算斜(判据是绝对容差, 不是方向量化)', () => {
    // 复用 predicates 对账钉住的坑: 方向量化看它是 S 轴, 但门禁必须判不正交
    const r = audit({
      width: 200,
      height: 200,
      nodes: [],
      edges: [{ id: 'nearly-v', points: [{ x: 20, y: 20 }, { x: 20.5, y: 120 }] }],
    });
    const d = findDiag(r.diagnostics, 'orthogonal_edges');
    expect(d.evidence.deviation).toBe(0.5);
    expect(d.severity).toBe('error');
  });

  // 门禁④ label_clearance --------------------------------------------

  it('label_clearance: 标签压在非自家边上命中(standard 是 warning), evidence 带边 id 与净空', () => {
    const r = audit(labelHitScene, { level: 'standard' });
    const d = findDiag(r.diagnostics, 'label_clearance');
    expect(d.severity).toBe('warning');
    expect(d.subject).toEqual({ kind: 'label', id: 'L-cross' });
    expect(d.evidence.edgeId).toBe('v');
    expect(d.evidence.clearance).toBe(0); // 线穿过标签遮罩 = 确知 0, 不是"不知道"
    expect(d.evidence.threshold).toBe(2);
    expect(r.metrics.min_label_clearance).toBe(0);
  });

  it('label_clearance: 标签 ownerEdge 就是这条边 → 豁免, 一条诊断都不产生', () => {
    const r = audit(labelOwnedScene, { level: 'showcase' });
    expect(r.diagnostics).toEqual([]);
    expect(r.pass).toBe(true);
    // 全部边都被豁免 → 无标签可测 → -1, 不是 0(0 是"确知净空为 0")
    expect(r.metrics.min_label_clearance).toBe(-1);
  });

  it('短路契约: 标签矩形非法时只报源头 finite_svg, 不再叠加几何诊断', () => {
    // 曾经会同时出 finite_svg + label_clearance("不知道")两条 —— 短路后只留源头:
    // 在坏值上继续算几何没有意义, 算出来的诊断是垃圾(实测极端情形还会把 audit 自己抛崩)
    const r = audit(unknownClearanceScene);
    expect(codesOf(r.diagnostics)).toEqual(['finite_svg']);
    expect(offendersOf(findDiag(r.diagnostics, 'finite_svg'))).toEqual(['label:L-nan']);
    expect(r.pass).toBe(false);
    // 未测量项一律 -1: 不要用 0 冒充"测过了, 结果是零"
    expect(r.metrics.min_label_clearance).toBe(-1);
    expect(r.metrics.max_orthogonal_deviation).toBe(-1);
    expect(r.metrics.crossings).toBe(-1);
  });

  // 门禁⑤ node_gap / node_overlap ------------------------------------

  it('node_gap: 间距 4px < 8px 命中(standard warning / showcase error), evidence.gap 跟档位走', () => {
    const std = audit(gap4Scene, { level: 'standard' });
    const d = findDiag(std.diagnostics, 'node_gap');
    expect(d.subject).toEqual({ kind: 'node', id: 'top' });
    expect(d.evidence.other).toBe('bottom');
    expect(d.evidence.gap).toBe(8);
    expect(std.diagnostics).toHaveLength(1);
    expect(std.pass).toBe(true); // 只有 warning

    const show = findDiag(audit(gap4Scene, { level: 'showcase' }).diagnostics, 'node_gap');
    expect(show.evidence.gap).toBe(12);
    expect(show.severity).toBe('error');
  });

  it('node_overlap / node_gap 分工: 真重叠(含仅 1px)是 node_overlap; 相触(0px)或贴太近(1px)是 node_gap', () => {
    const std = audit(overlapScene, { level: 'standard' });
    const d = findDiag(std.diagnostics, 'node_overlap');
    expect(d.severity).toBe('error');
    expect(d.evidence.other).toBe('b');
    expect(std.diagnostics.filter((x) => x.code === 'node_gap')).toHaveLength(0);
    expect(std.pass).toBe(false);
    expect(findDiag(audit(overlapScene, { level: 'showcase' }).diagnostics, 'node_overlap').severity).toBe('error');

    // 判定重叠用的是 gap=0 —— 只要真重叠(>0)就是 node_overlap, 不设"重叠多少才算"的容差
    expect(codesOf(audit(stackedAt(69)).diagnostics)).toEqual(['node_overlap']); // 重叠 1px
    expect(codesOf(audit(stackedAt(70)).diagnostics)).toEqual(['node_gap']); // 上下相触 0px
    // 不重叠但贴太近 → node_gap, standard 档仅 warning
    const apart = audit(stackedAt(71), { level: 'standard' });
    expect(codesOf(apart.diagnostics)).toEqual(['node_gap']);
    expect(apart.diagnostics[0].severity).toBe('warning');
  });

  it('node_gap 阈值边界: 相隔**恰**等于 gap 不报, 少 0.01px 才报(判定等价于"间距 < gap")', () => {
    // 上层底边 y=70, 下层从 70+gap 起就是"恰好 gap"
    // 口径与 archify `test/geometry.test.mjs:79-80` 同款(相隔恰 8px / required gap 8 → 不算太近):
    //   `rectsOverlap(a,b,gap)` 要求 `b.y < a.bottom + gap`, 等号那侧判"分开"
    // standard 档 gap=8
    expect(audit(stackedAt(78), { level: 'standard' }).diagnostics).toEqual([]);
    expect(codesOf(audit(stackedAt(77.99), { level: 'standard' }).diagnostics)).toEqual(['node_gap']);
    expect(audit(stackedAt(79), { level: 'standard' }).diagnostics).toEqual([]); // 比 gap 更大更是没事
    // showcase 档 gap=12
    expect(audit(stackedAt(82), { level: 'showcase' }).diagnostics).toEqual([]);
    expect(codesOf(audit(stackedAt(81.99), { level: 'showcase' }).diagnostics)).toEqual(['node_gap']);
  });

  // 两档判分 -----------------------------------------------------------

  it('两档判分: 同一 scene 下 standard 只出 warning, showcase 同样两条升级成 error', () => {
    const std = audit(warnScene, { level: 'standard' });
    const show = audit(warnScene, { level: 'showcase' });

    expect(verdicts(std.diagnostics)).toEqual(['label_clearance:warning', 'node_gap:warning']);
    expect(verdicts(show.diagnostics)).toEqual(['label_clearance:error', 'node_gap:error']);

    // 阈值本身也随档位走(evidence 里带的是当档阈值)
    expect(findDiag(std.diagnostics, 'label_clearance').evidence.threshold).toBe(2);
    expect(findDiag(std.diagnostics, 'node_gap').evidence.gap).toBe(8);
    expect(findDiag(show.diagnostics, 'label_clearance').evidence.threshold).toBe(4);
    expect(findDiag(show.diagnostics, 'node_gap').evidence.gap).toBe(12);

    // 默认档 = standard
    expect(audit(warnScene).level).toBe('standard');
    expect(audit(warnScene).diagnostics.map((d) => d.severity)).toEqual(['warning', 'warning']);
  });

  it('两档判分: 阈值确实不同 —— 净空 3px / 间距 10px 在 standard 全过, showcase 两条都拦', () => {
    expect(THRESHOLDS).toEqual({
      standard: { labelClearance: 2, nodeGap: 8, labelInset: 6 },
      showcase: { labelClearance: 4, nodeGap: 12, labelInset: 10 },
    });

    const std = audit(looseScene, { level: 'standard' });
    expect(std.diagnostics).toEqual([]); // 3 ≥ 2 且 10 ≥ 8
    expect(std.pass).toBe(true);
    expect(std.metrics.min_label_clearance).toBe(3);

    const show = audit(looseScene, { level: 'showcase' });
    expect(verdicts(show.diagnostics)).toEqual(['label_clearance:error', 'node_gap:error']); // 3 < 4 且 10 < 12
    expect(show.pass).toBe(false);
  });

  // 命中式边界 ---------------------------------------------------------

  it('命中式边界: 恰好等于阈值 / 少 5e-5(容差内) → 放行; 少 0.01px 与少 2e-4 → 拦(两档各验一次)', () => {
    // standard 阈值 2
    const at2 = audit(labelAtClearance(2), { level: 'standard' });
    expect(at2.diagnostics).toEqual([]);
    expect(at2.pass).toBe(true);
    expect(at2.metrics.min_label_clearance).toBe(2); // 确实被测到(不是 -1 那种"无标签可测")

    const just2 = audit(labelAtClearance(1.99), { level: 'standard' });
    const d = findDiag(just2.diagnostics, 'label_clearance');
    expect(d.severity).toBe('warning');
    expect(d.evidence.clearance as number).toBeLessThan(2);
    expect(d.evidence.clearance as number).toBeGreaterThan(1.9);
    expect(just2.pass).toBe(true); // standard 档只是 warning, 不进 errors
    expect(just2.metrics.min_label_clearance).toBe(1.99); // metrics 里的净空保留 2 位小数(不抖出 1.98999...)

    // 容差窗口 1e-4 是双向可验的: 少 5e-5 仍放行(比容差小), 少 2e-4 就拦(比容差大)
    expect(audit(labelAtClearance(1.99995), { level: 'standard' }).diagnostics).toEqual([]);
    expect(codesOf(audit(labelAtClearance(1.9998), { level: 'standard' }).diagnostics)).toEqual(['label_clearance']);

    // showcase 阈值 4: 恰好 4 放行, 3.99 拦
    expect(audit(labelAtClearance(4), { level: 'showcase' }).diagnostics).toEqual([]);
    const just4 = audit(labelAtClearance(3.99), { level: 'showcase' });
    const d4 = findDiag(just4.diagnostics, 'label_clearance');
    expect(d4.severity).toBe('error');
    expect(d4.evidence.threshold).toBe(4);
    expect(just4.pass).toBe(false);
  });

  // pass 语义 ----------------------------------------------------------

  it('pass 语义: 有 error → false; 只有 warning(standard 档) → true 且 metrics.errors 为 0', () => {
    const warnOnly = audit(warnScene, { level: 'standard' });
    expect(warnOnly.metrics.errors).toBe(0);
    expect(warnOnly.metrics.warnings).toBe(2);
    expect(warnOnly.pass).toBe(true);

    const hasError = audit(slantScene, { level: 'standard' });
    expect(hasError.metrics.errors).toBe(1);
    expect(hasError.pass).toBe(false);
    // pass 只由 error 决定: warning 永远不拦
    expect(hasError.metrics.warnings).toBe(0);
  });

  // supportedFixes -----------------------------------------------------

  it('supportedFixes: 每条诊断(尤其 error)都带非空修法, 且每条 fix 有 kind 与 hint', () => {
    const codes = new Set<string>();
    // finite_svg 短路后不再与几何门禁同场出现, 所以分两组取样:
    // 一组是合法但多处违例(几何四类), 一组是含非法坐标(源头一类)
    const mixed: Scene = {
      ...dirtyScene,
      nodes: dirtyScene.nodes.filter((n) => Number.isFinite(n.rect.x) && Number.isFinite(n.rect.y)),
      edges: dirtyScene.edges.filter((e) => e.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))),
    };
    const samples: Array<[string, Scene, AuditLevel, ClusterTier?]> = [
      ['合法但多处违例', mixed, 'showcase'],
      ['含非法坐标', dirtyScene, 'showcase'],
      ['第四轮三项(端口拥挤/折点贴端点/边重叠)', fourthRoundScene, 'showcase'],
      ['余下三类 error(文本净空/标签合身/回折)', otherErrorsScene, 'showcase'],
      ['⑭ 文本×实体(文本压节点盒)', textOverlapScene, 'showcase'],
      // 组语义四条里 `cluster_nesting_contradiction` 只在 tree 档启用 —— 这一份按 tree 档跑, 四条一次收齐
      ['⑮-⑱ 组语义自洽(membership 声明跑偏)', clusterScene, 'showcase', 'tree'],
    ];
    for (const [name, scene, level, tier] of samples) {
      const r = audit(scene, { level, ...(tier ? { clusterTier: tier } : {}) });
      expect(r.diagnostics.length, `${name} 应有诊断`).toBeGreaterThan(0);
      for (const d of r.diagnostics) {
        // 名单只收 **error**: 警示级(密度四项等)不参与 fail-closed, 样本里混进它们
        // 不该改变"error 门禁是否全覆盖"这份断言
        if (d.severity === 'error') codes.add(d.code);
        expect(d.supportedFixes.length).toBeGreaterThan(0);
        for (const f of d.supportedFixes) {
          expect(typeof f.kind).toBe('string');
          expect(f.kind.length).toBeGreaterThan(0);
          expect(typeof f.hint).toBe('string');
          expect(f.hint.length).toBeGreaterThan(0);
        }
        // 修法不重复: 同一条诊断里两种同一个 kind 的修法 = 清单被写坏(agent 会重复试同一个动作)
        expect(new Set(d.supportedFixes.map((f) => f.kind)).size).toBe(d.supportedFixes.length);
      }
      // 要求单列一遍: error 不带修法 = agent 只能猜(设计稿把 supportedFixes 当 token 节流阀, 不许砍)
      for (const d of r.diagnostics.filter((x) => x.severity === 'error')) {
        expect(d.supportedFixes.length).toBeGreaterThan(0);
      }
    }
    // **十九类 error 全部出场**, 否则上面的巡检可能整段空转(新增门禁时这里会当场提醒你补样本)
    expect([...codes].sort()).toEqual([
      'cluster_border_clearance', 'cluster_frame_cross', 'cluster_member_outside', 'cluster_nesting_contradiction',
      'edge_degenerate', 'edge_node_clearance', 'edge_overlap', 'endpoint_approach', 'finite_svg',
      'label_clearance', 'label_fit', 'no_backtrack', 'node_overlap', 'orthogonal_edges',
      'owner_ref', 'port_crowding', 'single_svg', 'text_clearance', 'text_overlap',
    ]);
  });

  // metrics ------------------------------------------------------------

  it('metrics.crossings: 两条交错边计 1; T 形相触不计', () => {
    expect(audit(crossScene).metrics.crossings).toBe(1);
    expect(audit(tTouchScene).metrics.crossings).toBe(0);
  });

  it('metrics.max_orthogonal_deviation: 取最大偏离(不是首条/末条/求和)', () => {
    expect(audit(smallSlantScene).metrics.max_orthogonal_deviation).toBe(3);
    expect(audit(bigSlantScene).metrics.max_orthogonal_deviation).toBe(10);
    const both = audit({ ...smallSlantScene, edges: [...smallSlantScene.edges, ...bigSlantScene.edges] });
    expect(both.metrics.max_orthogonal_deviation).toBe(10);
    expect(both.diagnostics.filter((d) => d.code === 'orthogonal_edges')).toHaveLength(2);
    // 全正交场景为 0(不是 NaN / 没算)
    expect(audit(cleanScene).metrics.max_orthogonal_deviation).toBe(0);
  });

  it('metrics.min_label_clearance: 没有标签可测时为 -1(不是 0)', () => {
    expect(audit(crossScene).metrics.min_label_clearance).toBe(-1); // 压根没有 labels
    expect(audit(labelOwnedScene).metrics.min_label_clearance).toBe(-1); // 标签全被豁免
    expect(audit(labelAtClearance(3), { level: 'showcase' }).metrics.min_label_clearance).toBe(3); // 测到了就是真值
  });

  it('metrics: 计数量与诊断计数自洽, 干净场景给出零诊断', () => {
    const r = audit(dirtyScene, { level: 'showcase' });
    expect(r.metrics.nodes).toBe(4);
    expect(r.metrics.edges).toBe(3);
    expect(r.metrics.labels).toBe(1);
    expect(r.metrics.errors).toBe(r.diagnostics.filter((d) => d.severity === 'error').length);
    expect(r.metrics.warnings).toBe(r.diagnostics.filter((d) => d.severity === 'warning').length);
  });

  // 确定性 -------------------------------------------------------------

  it('确定性: 同一 scene 连续两次审计, metrics 与 diagnostics 的 JSON 严格相等', () => {
    // 审计前后入参 scene 的 JSON 也必须逐字不变(审计是纯函数, 不许就地改写输入)
    const sceneBefore = JSON.stringify(dirtyScene, (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? String(v) : v));
    for (const level of ['standard', 'showcase'] as const) {
      const a = audit(dirtyScene, { level });
      const b = audit(dirtyScene, { level });
      expect(JSON.stringify(b.metrics)).toBe(JSON.stringify(a.metrics));
      expect(JSON.stringify(b.diagnostics)).toBe(JSON.stringify(a.diagnostics));
      expect(b.level).toBe(a.level);
      expect(b.pass).toBe(a.pass);
    }
    expect(JSON.stringify(dirtyScene, (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? String(v) : v))).toBe(sceneBefore);
  });

  // 干净场景 -----------------------------------------------------------

  it('干净 scene: 四项门禁全过, diagnostics 为空, pass 为 true(最严 showcase 档)', () => {
    const r = audit(cleanScene, { level: 'showcase' });
    expect(r.diagnostics).toEqual([]);
    expect(r.pass).toBe(true);
    expect(r.metrics).toMatchObject({
      crossings: 0,
      edges: 1,
      nodes: 2,
      labels: 1,
      min_label_clearance: -1, // 唯一标签挂在自家边上 → 无标签可测
      max_orthogonal_deviation: 0,
      errors: 0,
      warnings: 0,
    });
    // standard 档同样全过(干净场景不该有档位相关差异)
    expect(audit(cleanScene, { level: 'standard' }).diagnostics).toEqual([]);
  });
});
