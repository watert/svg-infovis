// =====================================================================
// knives/cluster · 组语义: membership 声明制 + 自洽四条门禁
//
// 由来(260917 与 archify 全面摸底, TODO「archify 对比立项候选」①②): core 的组在 scene 里
// 过去**只是一条画在底下的圆角矩形** —— 没有成员语义、没有父子关系。归属只能靠 density 刀
// 按矩形包含**反推**, 于是"声明"与"几何"被合成一个来源, 而两者恰恰会漂开: 成员跑到框外 /
// 子框整跑父框外 / 两框交叉而成员重合 —— 四类事故过去零诊断, 或归因错到无法行动
// (只说"框被拉得比内容长", 作者看不出是**哪个成员**不在这框里)。
//
// archify 的处置被整体抄来: 平铺 membership(`wraps`) + 全画布绝对坐标 + 组框由成员派生 +
// audit 强制自洽。**不做嵌套坐标系** —— 局部坐标 / transform 层级方案已被否(与 core 全绝对
// 坐标哲学相悖, 命中测试 / audit / nudge 全链都得多穿一层 transform, 收益为零)。
// 输出层按 membership 包一层 <g> 是语义化, **坐标不跟着嵌套**。
//
// 两个语义档**显式选**(archify 原话: boundaries are sets, not an implied ownership tree):
//   · `set`(缺省) —— 集合: 允许共享成员 / 正交 scope 交叉
//   · `tree`(opt-in, `Scene.clusterTier` 或 `audit(s, { clusterTier })`) —— 层级 ownership:
//     额外启用"框包含关系必须与成员包含关系一致"那条(cluster_nesting_contradiction)
//
// 四条门禁都是**声明与几何的矛盾** → 几何事实 → error(与穿盒 / 折回 / 叠成一条线同档):
//   ① cluster_member_outside  声明的成员不在框内(含"子框整个跑到父框外" / 成员 id 不存在)
//   ② cluster_frame_cross     两框部分重叠且成员有重合 → 谁装谁说不清(列 shared / only-in-A / only-in-B)
//   ③ cluster_nesting_contradiction  框包含与成员包含矛盾(**仅 tree 档**)
//   ④ cluster_border_clearance 组框描边与其它几何的空间关系(框线切节点 / 框内节点呼吸位不足 /
//                              边横穿组框 / 边沿框跑)—— 组框 rect 过去**从不参与任何净空判定**
//                              (`edge_node_clearance` 只看 `scene.nodes`), 是结构性缺口
//
// membership 的解析口径(本文件最容易读错的地方): **`contains` 缺省 ≠ 空集**
//   · 声明了 → 以声明为准(哪怕与几何不符 —— 那是要报出来的事, 不是该悄悄纠正的事)
//   · 没声明 → 四条门禁一概不管(没有声明就没有"声明与几何的矛盾"可谈);
//     density 的**启发式**度量回落几何反推(启发式不许因作者没声明就静默失效),
//     差集由 `undeclared_groups` metric 暴露出来
//
// **框的来源**(`SceneGroup.frame`, 260918 与 archify 复刻对账后加的第三维):
//   · 不写 / `'members'` → 框是派生量(成员并集 + pad), 四条门禁照旧按 `g.rect` 判
//   · `'declared'` → 框是作者声明的 frame(泳道横铺全宽这类), `g.rect` 就是那个框, 派生不会覆盖它。
//     门禁**一个字都不用改**: "声明与几何的矛盾"仍是事实级 error —— 变的是**修法**,
//     对声明框说"按成员并集重算"等于让 agent 去覆盖作者的值, 所以那三处 `fit-frame` 换成手工改框的提示。
// =====================================================================

import { type Pt, type Rect, codepointSort, rectBottom, rectRight, round1 } from '../geometry/vec.js';
import {
  isFiniteRect, normalizeRoutePoints, parallelSegmentGap, pointInRect, rectEdges,
  rectsOverlap, segmentRectIntersectionLength,
} from '../geometry/predicates.js';
import type { Diagnostic, Scene, SceneGroup } from './audit.js';
import { CLUSTER_CODES } from './codes.js';
// 穿透长度与穿盒门禁同一把尺子(thresholds 的 PIERCE_MIN)
import { PIERCE_MIN } from './thresholds.js';

/** 组语义档: `set`(缺省, 平铺集合) / `tree`(层级 ownership, opt-in) */
export type ClusterTier = 'set' | 'tree';

/** 成员身份: 节点或子框 —— 组框也能被声明为成员(「子框整个跑到父框外」就是这么抓到的) */
export type MemberRef = { id: string; kind: 'node' | 'group'; rect: Rect };

/** 成员整体落在框内的容差(与 density 的老口径同源) */
const MEMBER_EPS = 1;
/**
 * 框内元素与框线之间的最小呼吸位(px)。派生组框的缺省 pad 比它大 4px ——
 * 别让 `fitGroupFrames` 派出来的框恰好卡在这条门禁线上(擦边通过比 FAIL 更危险)。
 */
export const BORDER_CLEARANCE = 24;
/** 派生组框的缺省 padding(= 呼吸位 + 4px 余量) */
export const GROUP_FIT_PAD = BORDER_CLEARANCE + 4;
/** 边与框线并行时"贴着跑"的最大垂距(含 0 = 与框线共线) */
const BORDER_RUN_GAP = 6;
/** ... 且投影重叠至少这么长才算"沿框跑"(短 stub 上的擦过不算) */
const BORDER_RUN_MIN = 24;
/** 判"进到框里"时把框线内缩半像素: 端点相切不算穿越 */
const BORDER_INSET = 0.5;

// --- membership 解析 ---------------------------------------------------

/** 按 id 取成员几何(节点盒 / 组框); 找不到给 null —— 声明了不存在的 id 也要报, 不能静默丢 */
export function memberRef(s: Scene, id: string): MemberRef | null {
  const n = s.nodes.find((x) => x.id === id);
  if (n) return { id, kind: 'node', rect: n.rect };
  const g = (s.groups ?? []).find((x) => x.id === id);
  if (g) return { id, kind: 'group', rect: g.rect };
  return null;
}

/** 作者声明的成员 id(去重 + codepoint 序); **`undefined` = 没声明**, 与"声明为空"是两回事 */
export function declaredMemberIds(g: SceneGroup): string[] | undefined {
  if (g.contains === undefined) return undefined;
  return codepointSort([...new Set(g.contains)]);
}

/**
 * 框是**作者声明的 frame** 吗(`frame: 'declared'`)。
 *
 * 四条门禁一律按 `g.rect` 判 —— 声明框下, 这个 `rect` 就是作者亲手给的那个框(派生不会覆盖它,
 * 见 `deriveGroupRect` / `fitGroupFrames`), 于是"声明与几何的矛盾"照旧是事实级 error, 一个字都不用改。
 * 但**修法不能一样**: 对派生框说"按成员并集重算"是对的, 对声明框说这句话等于让 agent 去覆盖作者的值
 * (泳道横铺全宽的那种框, 成员并集永远算不出来)。所以本函数唯一的用途是挑修法。
 */
export const isDeclaredFrame = (g: SceneGroup): boolean => g.frame === 'declared';

/** 几何反推归属: 节点盒整个落在框内 —— density 在作者**未声明**时的回落口径 */
export function inferredMemberIds(s: Scene, g: SceneGroup): string[] {
  return codepointSort(s.nodes.filter((n) => insideRect(n.rect, g.rect, MEMBER_EPS)).map((n) => n.id));
}

/** 一个组的成员: 作者声明优先, 未声明回落几何反推; `declared` 说明这份归属来自哪一侧 */
export function groupMembers(s: Scene, g: SceneGroup): { ids: string[]; declared: boolean } {
  const decl = declaredMemberIds(g);
  return decl ? { ids: decl, declared: true } : { ids: inferredMemberIds(s, g), declared: false };
}

// --- 几何小工具 --------------------------------------------------------

/** 矩形包含(eps 为容差, 逐轴判 —— 不做"最近边"折算, 见决策: 盒内点是 identity) */
const insideRect = (inner: Rect, outer: Rect, eps = 0): boolean =>
  inner.x >= outer.x - eps && inner.y >= outer.y - eps
  && rectRight(inner) <= rectRight(outer) + eps && rectBottom(inner) <= rectBottom(outer) + eps;

const insetRect = (r: Rect, by: number): Rect =>
  ({ x: r.x + by, y: r.y + by, w: Math.max(0, r.w - 2 * by), h: Math.max(0, r.h - 2 * by) });

/** 框内元素到框线的最近距离(只在"整体在框内"时有意义) */
const borderGap = (inner: Rect, outer: Rect): number =>
  Math.min(inner.x - outer.x, inner.y - outer.y, rectRight(outer) - rectRight(inner), rectBottom(outer) - rectBottom(inner));

/** 元素超出框的最大量(> 0 = 在框外; 四边取最大, 等于"要挪多远才回得来") */
const overflowOf = (inner: Rect, outer: Rect): number => Math.max(
  outer.x - inner.x, outer.y - inner.y, rectRight(inner) - rectRight(outer), rectBottom(inner) - rectBottom(outer), 0,
);

const rectArr = (r: Rect): number[] => [r.x, r.y, r.w, r.h];
/** 成员清单写成诊断文案: `"a", "b"`; 空集写 `(无)` —— 差集必须看得见 */
const quoted = (ids: string[]): string => (ids.length ? ids.map((id) => `"${id}"`).join(', ') : '(无)');

/** 推导成员包围盒(成员几何的并集, 不 pad); 一个成员都没有 → null */
export function membersBBox(s: Scene, g: SceneGroup): Rect | null {
  const refs = (declaredMemberIds(g) ?? []).map((id) => memberRef(s, id)).filter((m): m is MemberRef => m !== null && m.id !== g.id);
  if (!refs.length) return null;
  const x = Math.min(...refs.map((m) => m.rect.x));
  const y = Math.min(...refs.map((m) => m.rect.y));
  return {
    x: round1(x), y: round1(y),
    w: round1(Math.max(...refs.map((m) => rectRight(m.rect))) - x),
    h: round1(Math.max(...refs.map((m) => rectBottom(m.rect))) - y),
  };
}

// --- 门禁 ① 声明的成员不在框内 ------------------------------------------

function checkMembersOutside(s: Scene, groups: SceneGroup[]): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const g of groups) {
    const decl = declaredMemberIds(g);
    if (!decl) continue;
    for (const id of decl) {
      if (id === g.id) continue; // 自指: 框不装自己(等价于没写)
      const m = memberRef(s, id);
      if (!m) {
        out.push({
          code: CLUSTER_CODES.cluster_member_outside,
          severity: 'error',
          message: `组框 ${g.id} 声明的成员 ${id} 不在 scene 里 —— 归属声明指向了一个不存在的 id`,
          subject: { kind: 'group', id: g.id },
          evidence: { kind: 'unknown_member', member: id, frame: g.id, declared: g.contains ?? [] },
          supportedFixes: [
            { kind: 'redeclare-member', hint: `核对 id 拼写; 节点/子框改名会让声明失效, 要么改声明要么把 id 改回去`, patch: { groupId: g.id, remove: id } },
            { kind: 'add-member', hint: `若这个成员本该存在: 先在 scene.nodes(或 groups)里补上 ${id}, 再重算几何` },
          ],
        });
        continue;
      }
      if (insideRect(m.rect, g.rect, MEMBER_EPS)) continue;
      const overflow = round1(overflowOf(m.rect, g.rect));
      const disjoint = !rectsOverlap(m.rect, g.rect);
      out.push({
        code: CLUSTER_CODES.cluster_member_outside,
        severity: 'error',
        message: m.kind === 'group'
          ? `组框 ${g.id} 声明的子框 ${id} ${disjoint ? '整个跑到框外' : '有一部分越出框外'}(${overflow}px) —— 框的包含关系与声明矛盾`
          : `组框 ${g.id} 声明的成员 ${id} 不在框内(越出 ${overflow}px) —— 声明与几何漂开了`,
        subject: { kind: 'group', id: g.id },
        evidence: {
          kind: m.kind === 'group' ? (disjoint ? 'nested_frame_outside' : 'nested_frame_straddle') : 'node_outside',
          member: id, memberKind: m.kind, frame: g.id, overflow,
          frameRect: rectArr(g.rect), memberRect: rectArr(m.rect), declared: decl,
        },
        supportedFixes: [
          ...(isDeclaredFrame(g)
            ? [{
                kind: 'resize-frame',
                hint: `框是**作者声明的 frame**(frame: 'declared'), 派生不会替你改它 —— ${id} 要么挪进框内, 要么把框手工改到装得下它`,
              }]
            : [{
                kind: 'fit-frame',
                hint: '首选: 框是**派生量** —— 按成员包围盒 + pad 重算(见 `fitGroupFrames` / `deriveGroupRect`), 别手写坐标',
                patch: { groupId: g.id, rect: derivedPatch(s, g) },
              }]),
          { kind: 'move-member', hint: `若归属没错、框也想保持现状: 把 ${id} 挪进框内(或把 ${g.id} 的框拉大)` },
          { kind: 'redeclare-member', hint: `若 ${id} 本来就不属于 ${g.id}: 从句法里删掉(成员少写一个不会有人发现, 只会继续漂)`, patch: { groupId: g.id, remove: id } },
        ],
      });
    }
  }
  return out;
}

/** `fit-frame` 修法带的 patch 值: 成员并集 + 缺省 pad(直接能套回 scene, 供"照修法真能修好"闭环) */
function derivedPatch(s: Scene, g: SceneGroup): number[] | string {
  const bb = membersBBox(s, g);
  if (!bb) return 'no-declared-members';
  return [round1(bb.x - GROUP_FIT_PAD), round1(bb.y - GROUP_FIT_PAD), round1(bb.w + 2 * GROUP_FIT_PAD), round1(bb.h + 2 * GROUP_FIT_PAD)];
}

// --- 门禁 ② 两框交叉且成员重合 ------------------------------------------

function checkFrameCross(groups: SceneGroup[]): Diagnostic[] {
  const out: Diagnostic[] = [];
  const sets = groups.map((g) => new Set(declaredMemberIds(g) ?? []));
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      // 先按 id 码点序定 (A, B): 诊断的文案与 subject 不许取决于 `groups` 的书写顺序
      // (同 `ownerAtEnd` 的破平理由 —— 确定性一旦靠运气, 报告就 diff 不动了)
      const swap = groups[i].id > groups[j].id;
      const [a, b] = swap ? [groups[j], groups[i]] : [groups[i], groups[j]];
      const sa = sets[swap ? j : i];
      const sb = sets[swap ? i : j];
      if (!rectsOverlap(a.rect, b.rect)) continue;
      // 一个装住另一个(含完全重合) = 嵌套, 不是"交叉" —— 那是 ③ 的地盘
      if (insideRect(b.rect, a.rect) || insideRect(a.rect, b.rect)) continue;
      const shared = codepointSort([...sa].filter((id) => sb.has(id)));
      if (!shared.length) continue;
      const onlyA = codepointSort([...sa].filter((id) => !sb.has(id)));
      const onlyB = codepointSort([...sb].filter((id) => !sa.has(id)));
      out.push({
        code: CLUSTER_CODES.cluster_frame_cross,
        severity: 'error',
        message: `组框 ${a.id} 与 ${b.id} 部分重叠, 成员也有重合(shared: ${quoted(shared)}; only in "${a.id}": ${quoted(onlyA)}; only in "${b.id}": ${quoted(onlyB)}) —— 谁装谁说不清`,
        subject: { kind: 'group', id: a.id },
        evidence: {
          other: b.id, shared, onlyInA: onlyA, onlyInB: onlyB,
          aRect: rectArr(a.rect), bRect: rectArr(b.rect),
        },
        supportedFixes: [
          { kind: 'keep-nesting', hint: '要么让一个框**完全**包住另一个, 并把共享成员两边都写上(层级就清楚了)' },
          { kind: 'split-membership', hint: `要么断开共享: 把 ${quoted(shared)} 判给其中一边(正交 scope 也可以有交集, 但得说清哪边是"主")` },
          { kind: 'separate-frames', hint: '要么把两个框挪开 —— 交叉的框在图上读作"这两个区域重叠", 而成员会打架' },
        ],
      });
    }
  }
  return out;
}

// --- 门禁 ③ 框包含 × 成员包含 矛盾(仅 tree 档) -------------------------

/**
 * 仅在 **tree 档**启用(archify 的 `engineering_profile` 就是这个开关的形态):
 * 声明成层级 ownership 时, "框包住"必须蕴含"成员也包住"。
 * 集合档不跑这条 —— 正交 scope 允许交叉, 拿层级去要求它就是用错模型否决正确版式。
 */
function checkNestingContradiction(groups: SceneGroup[]): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      const a = groups[i], b = groups[j];
      const aWrapsB = insideRect(b.rect, a.rect);
      const bWrapsA = insideRect(a.rect, b.rect);
      if (aWrapsB === bWrapsA) continue; // 互不包含(并列)或完全重合: 都不是"框包含"
      const outer = aWrapsB ? a : b;
      const inner = aWrapsB ? b : a;
      const outerIds = declaredMemberIds(outer);
      if (!outerIds) continue; // 外层没声明成员 → 没有声明可矛盾
      const innerIds = declaredMemberIds(inner) ?? [];
      const set = new Set(outerIds);
      const escaped = codepointSort(innerIds.filter((id) => !set.has(id)));
      if (!escaped.length) continue;
      out.push({
        code: CLUSTER_CODES.cluster_nesting_contradiction,
        severity: 'error',
        message: `组框 ${outer.id} 的框包含 ${inner.id}, 但 ${inner.id} 声明的身份 ${quoted(escaped)} 不在 ${outer.id} 的声明里 —— 框的包含与成员归属矛盾`,
        subject: { kind: 'group', id: outer.id },
        evidence: {
          outer: outer.id, inner: inner.id, escaped,
          outerMembers: outerIds, innerMembers: innerIds,
          outerRect: rectArr(outer.rect), innerRect: rectArr(inner.rect),
        },
        supportedFixes: [
          { kind: 'extend-wraps', hint: `把 ${quoted(escaped)} 并进 ${outer.id} 的成员声明(层级本来就是这样: 子框的身份也是父框的身份)`, patch: { groupId: outer.id, add: escaped } },
          { kind: 'flatten-nesting', hint: `或者别让 ${inner.id} 落在 ${outer.id} 的框里(挪开 / 收框), 让几何与声明都不构成包含` },
          { kind: 'split-boundary', hint: '若两者其实是并列的两个 scope: 换回集合档(clusterTier: "set")并在文档里说明它们正交' },
        ],
      });
    }
  }
  return out;
}

// --- 门禁 ④ 组框描边与其它几何的空间关系 --------------------------------

/**
 * 三种子情形(判据都是声明之外**纯几何**的, 未声明 membership 的框也照查 —— 框线穿节点
 * 这类事故跟"框声明装谁"无关):
 *   · `node_crosses_border`  框线切过节点(一半在内一半在外)/ 框整个嵌在节点里
 *   · `node_border_too_close` 框内节点距框线 < BORDER_CLEARANCE —— 视觉上分不清它在不在框里
 *   · `edge_crosses_frame`   边**横穿**框(进出两趟): 端点落在框内 = "进/出框", 不算穿
 *   · `edge_runs_along_border` 边与框线并行且贴得近(含共线) → 读成框线的一部分
 */
function checkBorderClearance(
  s: Scene,
  groups: SceneGroup[],
  norm: Map<string, Pt[]>,
): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const g of groups) {
    for (const n of s.nodes) {
      if (!isFiniteRect(n.rect) || !rectsOverlap(n.rect, g.rect)) continue;
      if (insideRect(n.rect, g.rect)) {
        const gap = round1(borderGap(n.rect, g.rect));
        // 框本身窄到装不下呼吸位时**不判这一档**: 那时无论作者怎么摆都过不了 ——
        // 一条"没有可行修法"的门禁等于让 agent 猜(与 Mermaid 那次的教训同一个道理)
        if (gap >= BORDER_CLEARANCE || g.rect.w < 2 * BORDER_CLEARANCE || g.rect.h < 2 * BORDER_CLEARANCE) continue;
        out.push({
          code: CLUSTER_CODES.cluster_border_clearance,
          severity: 'error',
          message: `节点 ${n.id} 在组框 ${g.id} 内距框线只有 ${gap}px(< ${BORDER_CLEARANCE}px) —— 视觉上分不清它在不在这个框里`,
          subject: { kind: 'group', id: g.id },
          evidence: {
            kind: 'node_border_too_close', node: n.id, gap, limit: BORDER_CLEARANCE,
            frameRect: rectArr(g.rect), nodeRect: rectArr(n.rect),
          },
          supportedFixes: [
            ...(isDeclaredFrame(g)
              ? [{ kind: 'resize-frame', hint: `框是**作者声明的 frame**: 手工把框拉大到装得下呼吸位(内边距 ≥ ${BORDER_CLEARANCE}px), 或把成员收拢 —— 派生不会替你改它` }]
              : [{ kind: 'fit-frame', hint: `按内容收紧/外扩框: 内边距至少 ${BORDER_CLEARANCE}px(缺省 ${GROUP_FIT_PAD}px 更稳)`, patch: { groupId: g.id, pad: GROUP_FIT_PAD } }]),
            { kind: 'move-node', hint: `或把 ${n.id} 往框内挪 ${round1(BORDER_CLEARANCE - gap)}px(它会退出框线附近的"归属模糊带")` },
            { kind: 'regroup', hint: `若 ${n.id} 本来就不属于这个框: 归到别的组, 或把框收小到只装它的成员` },
          ],
        });
        continue;
      }
      const swallowed = insideRect(g.rect, n.rect);
      out.push({
        code: CLUSTER_CODES.cluster_border_clearance,
        severity: 'error',
        message: swallowed
          ? `组框 ${g.id} 整个嵌在节点 ${n.id} 的盒里 —— 框线被节点盖住, 这条分组线等于没画`
          : `组框 ${g.id} 的框线切过节点 ${n.id}(一半在框内一半在外) —— 节点归属当场读不出来`,
        subject: { kind: 'group', id: g.id },
        evidence: {
          kind: swallowed ? 'frame_inside_node' : 'node_crosses_border', node: n.id,
          frameRect: rectArr(g.rect), nodeRect: rectArr(n.rect),
        },
        supportedFixes: [
          ...(isDeclaredFrame(g)
            ? [{ kind: 'resize-frame', hint: '框是**作者声明的 frame**: 手工把它挪到让节点整个在里或整个在外 —— 派生不会替你改它' }]
            : [{ kind: 'fit-frame', hint: '按成员包围盒重算框(框是派生量): 让节点要么整个在里、要么整个在外', patch: { groupId: g.id, pad: GROUP_FIT_PAD } }]),
          { kind: 'move-node', hint: `或把 ${n.id} 整体挪进/挪出框 —— 骑在框线上是最难读的位置` },
          { kind: 'regroup', hint: '若这个节点不该属这个框: 改归属声明, 别用"半进半出"表达' },
        ],
      });
    }

    for (const e of s.edges) {
      if (e.from === g.id || e.to === g.id) continue; // 跨层边以组框为端点: 终点就落在框线上, 合法写法
      const pts = norm.get(e.id) ?? [];
      if (pts.length < 2) continue;
      // 端点落在框内 = 这条边"进/出框"(成员进出是常态), 只有**穿过去**才是事故
      const terminatesInside = pts.some((p) => pointInRect(p, g.rect, MEMBER_EPS));
      const inner = insetRect(g.rect, BORDER_INSET);
      let through = 0;
      for (let i = 1; i < pts.length; i++) through += segmentRectIntersectionLength(pts[i - 1], pts[i], inner) ?? 0;
      if (!terminatesInside && through > PIERCE_MIN) {
        out.push({
          code: CLUSTER_CODES.cluster_border_clearance,
          severity: 'error',
          message: `边 ${e.id} 横穿组框 ${g.id}(框内走 ${round1(through)}px, 两端都在框外) —— 一条线把"这些属于一伙"的读法切断了`,
          subject: { kind: 'group', id: g.id },
          evidence: {
            kind: 'edge_crosses_frame', edge: e.id, through: round1(through), limit: PIERCE_MIN,
            frameRect: rectArr(g.rect), points: pts.flatMap((p) => [p.x, p.y]),
          },
          supportedFixes: [
            { kind: 'lane-shift', hint: `给 ${e.id} 一条腰线(lane)绕开 ${g.id} —— 折线该适应版式, 不是反过来`, patch: { edgeId: e.id, groupId: g.id } },
            { kind: 'move-port', hint: '换出口面/端口位置, 让这条边从一开始就不经过这个框' },
            { kind: 'reroute', hint: '用 routeOrthogonal 沿框外侧重算折点列(手写折点最容易在框上留一条"穿越线")' },
          ],
        });
        continue;
      }
      // 沿框跑: 与框线并行 + 贴得近 + 投影上重合足够长(共线也算 —— 那是最典型的"读成框线")
      let run: { gap: number; overlap: number } | null = null;
      for (let i = 1; i < pts.length; i++) {
        for (const [b1, b2] of rectEdges(g.rect)) {
          const pg = parallelSegmentGap(pts[i - 1], pts[i], b1, b2);
          if (!pg || pg.gap >= BORDER_RUN_GAP || pg.overlap + 1e-6 < BORDER_RUN_MIN) continue;
          if (!run || pg.gap < run.gap) run = pg;
        }
      }
      if (!run) continue;
      out.push({
        code: CLUSTER_CODES.cluster_border_clearance,
        severity: 'error',
        message: `边 ${e.id} 沿组框 ${g.id} 的框线跑 ${round1(run.overlap)}px(垂距 ${round1(run.gap)}px < ${BORDER_RUN_GAP}px) —— 两线在视觉上并成一条, 读不出哪条是框`,
        subject: { kind: 'group', id: g.id },
        evidence: {
          kind: 'edge_runs_along_border', edge: e.id, gap: round1(run.gap), overlap: round1(run.overlap),
          limit: BORDER_RUN_GAP, minOverlap: BORDER_RUN_MIN, frameRect: rectArr(g.rect),
        },
        supportedFixes: [
          { kind: 'lane-shift', hint: `把这条边的腰线推离框线至少 ${BORDER_RUN_GAP}px(按框的哪一边跑, 就往反方向推)`, patch: { edgeId: e.id, groupId: g.id, minGap: BORDER_RUN_GAP } },
          { kind: 'move-port', hint: '换端口面让这条边从框的另一侧走, 别跟框线平行' },
          ...(isDeclaredFrame(g)
            ? [{ kind: 'resize-frame', hint: '框是**作者声明的 frame**: 手工把它挪离这条边 —— 派生不会替你改它' }]
            : [{ kind: 'fit-frame', hint: '若是框贴得太近(内容本来就窄): 按内容收紧框, 让框线与这条边拉开', patch: { groupId: g.id, pad: GROUP_FIT_PAD } }]),
        ],
      });
    }
  }
  return out;
}

// --- 主入口 ------------------------------------------------------------

export type ClusterReport = { diags: Diagnostic[]; metrics: Record<string, number> };

/**
 * 四条自洽门禁 + 组语义度量。**error 级**(几何事实), 进 fail-closed; 无 fail-closed 豁免。
 * `tier` 缺省 `set` —— 调用方(audit)已按 `Scene.clusterTier` / 选项归一化后再传进来。
 */
export function clusterAudit(s: Scene, opts: { tier?: ClusterTier } = {}): ClusterReport {
  const tier: ClusterTier = opts.tier ?? 'set';
  // `noCheck` 组(纯视觉分区)不进组语义审计 —— 它没声明任何"装谁", 四条门禁对它无话可说;
  // `undeclared_groups` 同步排除(作者已用 noCheck 表态, 不算"漏声明", 260920)
  const groups = (s.groups ?? []).filter((g) => isFiniteRect(g.rect) && !g.noCheck);
  const norm = new Map<string, Pt[]>();
  for (const e of s.edges) norm.set(e.id, normalizeRoutePoints(e.points));

  const declared = groups.map((g) => declaredMemberIds(g));
  const diags: Diagnostic[] = [
    ...checkMembersOutside(s, groups),
    ...checkFrameCross(groups),
    ...(tier === 'tree' ? checkNestingContradiction(groups) : []),
    ...checkBorderClearance(s, groups, norm),
  ];
  const count = (code: string): number => diags.filter((d) => d.code === code).length;
  const metrics: Record<string, number> = {
    cluster_member_outside: count(CLUSTER_CODES.cluster_member_outside),
    cluster_frame_cross: count(CLUSTER_CODES.cluster_frame_cross),
    cluster_nesting_contradiction: count(CLUSTER_CODES.cluster_nesting_contradiction),
    cluster_border_clearance: count(CLUSTER_CODES.cluster_border_clearance),
    // 声明了多少成员 / 还有多少组没声明(启发式回落几何反推的那部分) —— **差集必须可见**
    declared_members: declared.reduce((n, ids) => n + (ids?.length ?? 0), 0),
    undeclared_groups: declared.filter((ids) => ids === undefined).length,
    cluster_tier: tier === 'tree' ? 1 : 0,
  };
  return { diags, metrics };
}
