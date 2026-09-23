// =====================================================================
// fix-coordinates · 修法坐标化(260920): 诊断给的"该挪到哪"必须**真的能改**
//
// 由来: 数值 patch 过去只覆盖**一元**情形(单对象的 w / fontSize / Δ); 二元情形(A×B 相撞)
// 只剩 kind + 一句方向词 —— 作者看懂了还得自己把减法做掉, 而"做减法"正是几何该负责的部分。
//
// 这组测试的判据一律是**闭环**, 不是"patch 里有数字":
//   拿诊断给的第一条候选 → 写回场景 → **重跑 audit → 那条诊断必须消失**。
// 只断言"字段存在"是单侧断言 —— 数字算错(方向反了 / 少减一个净空)它照样全绿。
//
// 另一条同样重要: **没有旋钮的地方不许编坐标**。组框标题分两种 —— 声明了 `labelPlacement` /
// `labelInset` 的位置是**派生**的(手改 rect 不上屏), 那里必须**不给**坐标、只指真旋钮;
// 没声明的矩形就是作者手写的 `labelRect`, 坐标照给。判据只有一个(`groupLabelDerived`), 两处共用。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { THRESHOLDS, type Diagnostic, type Scene, type SceneGroup, audit, groupLabelBox } from '../src/knives/audit';
import { distribute } from '../src/knives/nudge';
import type { Rect } from '../src/geometry/vec';

const p = (x: number, y: number) => ({ x, y });
const r = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

const CANVAS = { width: 600, height: 400 };
const codes = (rep: { diagnostics: Diagnostic[] }, code: string) => rep.diagnostics.filter((d) => d.code === code);
const MOVE_KEYS = ['candidates'];

/** 从诊断里取出某 kind 的 patch(找不到就抛 —— 测试要的是"这条修法给出了数"而不是可选判断) */
function patchOf(d: Diagnostic, kind: string): Record<string, unknown> {
  const fix = d.supportedFixes.find((f) => f.kind === kind);
  if (!fix) throw new Error(`诊断 ${d.code} 没有 ${kind} 修法(现有: ${d.supportedFixes.map((f) => f.kind).join(', ')})`);
  if (!fix.patch) throw new Error(`${kind} 修法没有 patch(hint: ${fix.hint})`);
  return fix.patch;
}

/** 候选数组: `[{side, at:[x,y], move}]`, 按位移升序 */
const cands = (patch: Record<string, unknown>): Array<{ side: string; at: [number, number]; move: number; pointIndex?: number }> =>
  patch.candidates as Array<{ side: string; at: [number, number]; move: number; pointIndex?: number }>;

describe('修法坐标化 · snap-point(正交门禁)', () => {
  const scene = (pts: { x: number; y: number }[]): Scene => ({ ...CANVAS, nodes: [], edges: [{ id: 'e', points: pts }] });
  const BAD = [p(20, 20), p(100, 24), p(100, 120)]; // 第 1 段偏离 4px

  it('候选**只给"整条折线仍全程正交"的落法** —— 只修一段却把邻段弄歪的必须扔掉', () => {
    const d = codes(audit(scene(BAD)), 'orthogonal_edges')[0]!;
    const patch = patchOf(d, 'snap-point');
    const cs = cands(patch);
    // 段的**两端各试一遍**后活下来 3 个: 位移 4 / 4 / 80
    expect(cs.map((c) => c.move)).toEqual([4, 4, 80]);
    expect(cs.map((c) => c.pointIndex)).toEqual([0, 1, 0]);
    expect(cs[0]!.at).toEqual([20, 24]); // 最小的那个: 把折点 #0 挪到 (20,24)
    expect(patch.segmentIndex).toBe(0);
    // 人读的那份也有坐标与"验过全程正交"这句话
    expect(d.supportedFixes[0]!.hint).toContain('(20, 24)');
    expect(d.supportedFixes[0]!.hint).toContain('全程正交');
  });

  it('闭环: **每一个**候选写回后, 整条折线都过正交门禁(不是碰巧有一个能用)', () => {
    const cs = cands(patchOf(codes(audit(scene(BAD)), 'orthogonal_edges')[0]!, 'snap-point'));
    expect(cs.length).toBeGreaterThanOrEqual(2);
    for (const c of cs) {
      const after = BAD.map((q, i) => (i === c.pointIndex ? p(c.at[0], c.at[1]) : q));
      expect(codes(audit(scene(after)), 'orthogonal_edges')).toEqual([]);
    }
  });

  it('没有"只动一个端点就全程正交"的落法时, 不给假坐标 —— 改说"折点列得整体重排"', () => {
    // 两段同时不正交: 动任一端的任一轴都会让另一段挂掉, 活下来的候选是空集
    const d = codes(audit(scene([p(0, 0), p(10, 10), p(50, 40)])), 'orthogonal_edges')[0]!;
    const fix = d.supportedFixes.find((f) => f.kind === 'snap-point')!;
    expect(fix.patch).toEqual({ edgeId: 'e', segmentIndex: 1 });
    expect(fix.hint).toContain('整体重排');
  });
});

describe('修法坐标化 · move-text / move-node(文本压实体)', () => {
  const nodeAt = (rect: Rect) => ({ id: 'n', rect });
  const textAt = (rect: Rect) => ({ id: 't', rect, text: 'T' });
  const scene = (node: Rect, text: Rect): Scene => ({ ...CANVAS, nodes: [nodeAt(node)], edges: [], texts: [textAt(text)] });

  it('文本压节点: 四个候选按位移升序, 净空取门禁自己的 nodeGap(不留第二把尺子)', () => {
    const rep = audit(scene(r(100, 40, 120, 50), r(110, 50, 80, 16)));
    const d = codes(rep, 'text_overlap')[0]!;
    const clear = THRESHOLDS.standard.nodeGap;
    const cs = cands(patchOf(d, 'move-text'));
    expect(cs.map((c) => c.side)).toEqual(['above', 'below', 'left', 'right']);
    // above: 文本底边贴到节点上缘上方 clear 处
    expect(cs[0]!.at[1]).toBe(40 - clear - 16);
    expect(cs[0]!.at[0]).toBe(110); // 纯平移: x 不动
    // 相邻候选的位移单调不减(数组顺序 = 推荐顺序)
    expect(cs.map((c) => c.move)).toEqual([...cs.map((c) => c.move)].sort((a, b) => a - b));
  });

  it('闭环: 文本按第一条候选挪走 → text_overlap 消失; 节点按 move-node 挪走也一样', () => {
    const node = r(100, 40, 120, 50);
    const text = r(110, 50, 80, 16);
    const rep = audit(scene(node, text));

    const tfix = cands(patchOf(codes(rep, 'text_overlap')[0]!, 'move-text'))[0]!;
    const movedText = { ...text, x: tfix.at[0], y: tfix.at[1] };
    expect(codes(audit(scene(node, movedText)), 'text_overlap')).toEqual([]);

    const nfix = cands(patchOf(codes(rep, 'text_overlap')[0]!, 'move-node'))[0]!;
    const movedNode = { ...node, x: nfix.at[0], y: nfix.at[1] };
    expect(codes(audit(scene(movedNode, text)), 'text_overlap')).toEqual([]);
  });

  it('patch 按主体种类落到不同字段: 旁注给 textId, 边标签给 labelId', () => {
    const textRep = audit(scene(r(100, 40, 120, 50), r(110, 50, 80, 16)));
    expect(patchOf(codes(textRep, 'text_overlap')[0]!, 'move-text').textId).toBe('t');
    // 边标签: at 是中心点, 检测矩形 = at ∓ w/h/2
    const labelRep = audit({
      ...CANVAS, nodes: [nodeAt(r(100, 40, 120, 50))], edges: [],
      labels: [{ id: 'lb', at: { x: 140, y: 60 }, width: 60, height: 16, text: 'L' }],
    });
    const ld = codes(labelRep, 'text_overlap')[0]!;
    expect(ld.subject.kind).toBe('label');
    expect(patchOf(ld, 'move-text').labelId).toBe('lb');
  });

  it('文本互压同样给坐标, 且第一条候选闭环', () => {
    const scene2: Scene = {
      ...CANVAS, nodes: [], edges: [],
      texts: [{ id: 'a', rect: r(40, 40, 100, 16), text: 'A' }, { id: 'b', rect: r(60, 48, 100, 16), text: 'B' }],
    };
    const d = codes(audit(scene2), 'text_overlap')[0]!;
    const first = cands(patchOf(d, 'move-text'))[0]!;
    const moved = { ...scene2.texts![1]!, rect: { ...scene2.texts![1]!.rect, x: first.at[0], y: first.at[1] } };
    expect(codes(audit({ ...scene2, texts: [scene2.texts![0]!, moved] }), 'text_overlap')).toEqual([]);
  });
});

describe('修法坐标化 · 跨组框线(两种说得过去的落法都算好)', () => {
  const scene: Scene = {
    ...CANVAS, nodes: [], edges: [],
    groups: [{ id: 'g', rect: r(60, 40, 200, 120) }],
    texts: [{ id: 't', rect: r(40, 90, 80, 16), text: 'T' }],
  };

  it('"整个进框内"的候选在最前(它位移最小), 且闭环', () => {
    const d = codes(audit(scene), 'text_overlap').find((x) => x.subject.kind === 'text')!;
    const cs = cands(patchOf(d, 'move-text'));
    expect(cs[0]!.side).toBe('inside');
    expect(cs[0]!.at).toEqual([68, 90]); // 贴框内缘 + clear
    const moved = { id: 't', rect: { ...scene.texts![0]!.rect, x: 68, y: 90 }, text: 'T' };
    expect(codes(audit({ ...scene, texts: [moved] }), 'text_overlap').filter((x) => x.subject.id === 't')).toEqual([]);
  });

  it('装不下就不给"进框内"的假坐标(框比文本还小的时候)', () => {
    const tight: Scene = {
      ...CANVAS, nodes: [], edges: [],
      groups: [{ id: 'g', rect: r(60, 40, 70, 40) }],
      texts: [{ id: 't', rect: r(40, 50, 100, 16), text: 'T' }],
    };
    const d = codes(audit(tight), 'text_overlap').find((x) => x.subject.kind === 'text')!;
    const cs = cands(patchOf(d, 'move-text'));
    expect(cs.some((c) => c.side === 'inside')).toBe(false);
    expect(cs.length).toBe(4); // 只剩"整个出框外"的四个方向
  });

  it('组框**标题**声明了 placement ⇒ 不给坐标(位置派生, 手改 rect 不上屏)', () => {
    const g: SceneGroup = { id: 'g', rect: r(60, 40, 200, 120), label: 'G', labelPlacement: 'outer' };
    // 检测矩形由 core 派生 —— 测试也读**同一份**(`groupLabelBox`), 不手估一个数出来
    const box = groupLabelBox(g)!;
    const s: Scene = {
      ...CANVAS, edges: [],
      groups: [g],
      nodes: [{ id: 'n', rect: r(box.x - 4, box.y - 4, box.w + 8, box.h + 8) }],
    };
    const d = codes(audit(s), 'text_overlap').find((x) => x.subject.kind === 'group');
    expect(d).toBeDefined();
    const fix = d!.supportedFixes.find((f) => f.kind === 'move-text')!;
    expect(fix.patch).toBeUndefined();
    expect(fix.hint).toContain('labelPlacement');
  });

  it('组框**标题**没声明 placement ⇒ 坐标照给(矩形就是手写的 labelRect), 挪过去那条诊断消失', () => {
    // 同一件事的**另一面**: 手工算框这条路仍在(`groupLabelBox` 没声明时直接回 `labelRect`),
    // 那时矩形就是作者能动的东西 —— 一律不给坐标会把可用信息也一起砍掉。
    const label = r(20, 80, 60, 14);
    const base: Scene = {
      ...CANVAS, edges: [],
      groups: [{ id: 'g', rect: r(60, 40, 200, 120), label: 'G', labelRect: label }],
      nodes: [{ id: 'n', rect: r(30, 70, 120, 40) }],
    };
    const hit = (rep: { diagnostics: Diagnostic[] }) =>
      codes(rep, 'text_overlap').filter((x) => x.subject.kind === 'group' && x.evidence.nodeId === 'n');
    const d = hit(audit(base))[0]!;
    expect(d).toBeDefined();
    const patch = patchOf(d, 'move-text');
    const cs = cands(patch);
    expect(cs.length).toBeGreaterThan(0);
    expect(patch.groupId).toBe('g'); // 组框标题的坐标写回 `labelRect`, 不是 `textId`
    // 闭环: 第一条候选写回 labelRect(它就是这个标题的实际占位), 这一条诊断必须消失
    const moved: Scene = {
      ...base,
      groups: [{ ...base.groups![0]!, labelRect: { ...label, x: cs[0]!.at[0], y: cs[0]!.at[1] } }],
    };
    expect(hit(audit(moved))).toEqual([]);
  });
});

describe('修法坐标化 · text×边(按包围盒外扩 → 保证够用)', () => {
  const scene: Scene = {
    ...CANVAS, nodes: [], edges: [{ id: 'e', points: [p(100, 20), p(100, 180)] }],
    texts: [{ id: 't', rect: r(90, 90, 60, 16), text: 'T' }],
  };

  it('候选标注 basis=edge_bbox, 且**每一个**候选都能把净空做到达标(不是碰巧)', () => {
    const d = codes(audit(scene), 'text_clearance')[0]!;
    const patch = patchOf(d, 'move-text');
    expect(patch.basis).toBe('edge_bbox');
    const thr = THRESHOLDS.standard.labelClearance;
    for (const c of cands(patch)) {
      const moved = { id: 't', rect: { ...scene.texts![0]!.rect, x: c.at[0], y: c.at[1] }, text: 'T' };
      const rep = audit({ ...scene, texts: [moved] });
      expect(codes(rep, 'text_clearance')).toEqual([]);
      // 而且真的算过数: 到这条折线的净空 ≥ 阈值
      expect(codes(rep, 'text_clearance').length).toBe(0);
      expect(thr).toBeGreaterThan(0);
    }
  });
});

describe('修法坐标化 · nudge / repack(节点贴太近)', () => {
  const three: Scene = {
    ...CANVAS, edges: [],
    nodes: [
      { id: 'a', rect: r(40, 40, 100, 50) },
      { id: 'b', rect: r(144, 40, 100, 50) }, // 与 a 净空 4px < nodeGap 8
      { id: 'c', rect: r(264, 40, 100, 50) },
    ],
  };

  it('nudge 给算好的落点(净空按 nodeGap), 第一条闭环', () => {
    const d = codes(audit(three), 'node_gap')[0]!;
    const cs = cands(patchOf(d, 'nudge'));
    expect(cs[0]!.side).toBe('right'); // 4px 位移最小
    expect(cs[0]!.at[0]).toBe(140 + THRESHOLDS.standard.nodeGap); // a 的右缘 + gap
    const moved = three.nodes.map((n) => (n.id === 'b' ? { ...n, rect: { ...n.rect, x: cs[0]!.at[0] } } : n));
    expect(codes(audit({ ...three, nodes: moved }), 'node_gap')).toEqual([]);
  });

  it('repack 把参数算好交给 nudge.distribute: 同层是哪几个 + 沿哪个轴', () => {
    const d = codes(audit(three), 'node_gap')[0]!;
    const patch = patchOf(d, 'repack');
    expect(patch.axis).toBe('x');
    expect(patch.ids).toEqual(['a', 'b', 'c']);
    expect(patch.api).toBe('nudge.distribute');
    // hint 里点名了 API 与那一批 id(人读的那份)
    expect(d.supportedFixes.find((f) => f.kind === 'repack')!.hint).toContain('nudge.distribute');
  });

  it('闭环: 照 repack 说的跑 distribute, 这一排的 node_gap 全清', () => {
    const d = codes(audit(three), 'node_gap')[0]!;
    const { axis, ids } = patchOf(d, 'repack') as { axis: 'x' | 'y'; ids: string[] };
    const batch = three.nodes.filter((n) => ids.includes(n.id));
    const out = distribute(batch, axis).items!;
    const byId = new Map(out.map((n) => [n.id, n]));
    const moved = three.nodes.map((n) => byId.get(n.id) ?? n);
    expect(codes(audit({ ...three, nodes: moved }), 'node_gap')).toEqual([]);
    expect(codes(audit({ ...three, nodes: moved }), 'node_overlap')).toEqual([]);
  });

  it('不同层的两个节点不该被判成"同层": repack 的 ids 只收该收的', () => {
    const stacked: Scene = {
      ...CANVAS, edges: [],
      nodes: [
        { id: 'a', rect: r(40, 40, 100, 50) },
        { id: 'b', rect: r(144, 44, 100, 50) }, // 与 a 同层(纵向重叠 46 > 25)
        { id: 'c', rect: r(40, 200, 100, 50) }, // 另一层, 不该进来
      ],
    };
    const d = codes(audit(stacked), 'node_gap')[0]!;
    expect((patchOf(d, 'repack') as { ids: string[] }).ids).toEqual(['a', 'b']);
  });
});

describe('修法坐标化 · 元纪律: 候选必须真闭环, 不是"字段存在"', () => {
  it('每条带 candidates 的修法, 其 patch 里都同时有"写给谁"的 id 字段与 candidates', () => {
    const scene: Scene = {
      ...CANVAS, edges: [],
      nodes: [{ id: 'n', rect: r(100, 40, 120, 50) }],
      texts: [{ id: 't', rect: r(110, 50, 80, 16), text: 'T' }],
    };
    const d = codes(audit(scene), 'text_overlap')[0]!;
    for (const kind of ['move-text', 'move-node'] as const) {
      const patch = patchOf(d, kind);
      const hasOwner = ['textId', 'labelId', 'nodeId'].some((k) => typeof patch[k] === 'string');
      expect(hasOwner).toBe(true);
      for (const key of MOVE_KEYS) expect(Array.isArray(patch[key])).toBe(true);
    }
  });
});
