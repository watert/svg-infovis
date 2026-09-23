// =====================================================================
// lifecycle-agent-run 的判据
//
// 为什么这个示例值得有判据(它跟 harness-arch / node-forms 那类纯展示不同):
// 它示范的是一条**门禁审不到的东西** —— "同列的上下两个状态之间必须是直线"。
//
// 举证(260920 实跑两个变异, **两个方向都验了**):
//   · M1 `cancelled.col 2 → 1` —— 取消线不再是直线(变成 Z)。
//     **门禁: pass=true / 0 error / exit 0**(一条合法的折线), 而下面的 ②**红**。
//     ⇒ 这正是"judgment 归 test"要覆盖的缝: 版式坏了, 几何却完全合法。
//   · M2 `failed.col 1 → 2` —— 与 Needs Approval 挤进同一格。
//     门禁这次会红(`node_overlap` + `edge_overlap`), 判据 ③④ 也红。
//     ⇒ 说明门禁抓得到"硬撞", 抓不到"绕一下也行"。
//
// 三条断言钉的是 scene 的**版式意图**, 不是 core 的几何:
//   ① 出口档全绿(地板)
//   ② 四条"同列下落边"是直线(2 点 + 同 x)
//   ③ 那四条直线的走廊上**没有第三个盒子** —— 这条是护栏: 走廊被占时, 作者最容易的
//      修法是加 `via` 绕过去(**门禁会全绿**), 而正解是挪盒子。判据把"挪盒子"这个前置
//      条件钉住, 于是"绕行版"根本不会被写出来
//   ④ Failed 必须是 Needs Approval 的**同排邻居**(x 区间不相交) —— 参照实现是把它摞在
//      同一列的下方, 于是取消线只能绕它右侧, 出口落在盒子 2/3 高度、最后一段 13px 顶箭头
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { audit, type SceneEdge } from '../src/knives/audit';
import { fitScene } from '../src/export';
import { FIT, LEVEL, scene } from '../examples/gallery/lifecycle-agent-run';

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

describe('lifecycle-agent-run · 版式判据', () => {
  it('出口档(showcase)全绿 —— 地板', () => {
    const rep = audit(fitScene(scene, FIT), { level: LEVEL });
    expect(rep.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(rep.pass).toBe(true);
  });

  it('同列的下落边是**直线**(2 点 / 同 x / 零折弯)', () => {
    for (const [id] of VERTICALS) {
      const e = edgeOf(id);
      expect({ id, n: e.points.length }).toEqual({ id, n: 2 });
      expect({ id, dx: e.points[1].x - e.points[0].x }).toEqual({ id, dx: 0 });
    }
  });

  it('那四条直线的走廊上**没有第三个盒子** —— 取消线不绕行', () => {
    for (const [id, from, to] of VERTICALS) {
      const e = edgeOf(id);
      const [a, b] = e.points;
      const blocked = scene.nodes.filter(
        (n) => n.id !== from && n.id !== to && hitsRect(a, b, n.rect),
      );
      expect({ id, blocked: blocked.map((n) => n.id) }).toEqual({ id, blocked: [] });
    }
  });

  it('Failed 与 Needs Approval 是**同一排的邻居**, 不是上下摞', () => {
    // 判据: 两者的 x 区间不相交 —— 相交就说明取消线又要绕行(参照实现犯的正是这条)
    const f = nodeOf('failed').rect, a = nodeOf('approval').rect;
    const disjoint = f.x + f.w <= a.x || a.x + a.w <= f.x;
    expect({ disjoint }).toEqual({ disjoint: true });
    expect(f.y).toBe(a.y); // 同一排
  });
});
