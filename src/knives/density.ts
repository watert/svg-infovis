// =====================================================================
// knives/density · 密度与长边 —— 补上"几何合法但看着业余"的那一维
//
// 由来(260917 §十 Mermaid 喊疼率实验): 六项几何门禁在 8 张真实图上只喊 3 声, 而肉眼
// 14 处想改 —— 穿盒 0 / 压线 0 / 重叠 0 全绿, 病全在**密度与意图**: 组框里平均一半是空的
// (0.41-0.80)、最长边横跨 0.47 倍画布对角、作者写明的分层被摊成阶梯。
//
// 所以本刀只回答三件事, 且**全是警示级**(warning, 不参与 fail-closed):
//   ① 组内空白走廊 —— 组框在主轴上被拉多长(口径换过, 见下)
//   ② 最长边 / 画布对角 —— 边横扫多远
//   ③ 混组层数 —— 同一层里挤了几个分组(实验里 3 处真痛中的 2 处靠它抓到)
//
// ① 的口径为什么从"面积比"换掉(260917, TODO 门禁第三轮 ④): 旧口径量的是
// "组框面积里没被节点占掉的比例", 在层带型图上**系统性误报** —— 我们 `run` 组报 70%,
// Mermaid 同层报 61%, 而两者都只是"3 节点装一条带"的固有属性: 带窄、节点小, 面积比自然高,
// 但肉眼看那条带是**合适的**。没行动价值的警示会连带毁掉整个警示层的信用。
// 新口径量的是"**主轴投影上最大的空白走廊**"(占比 + 绝对像素双条件): 几何自明、不需作者声明,
// 且更贴近人眼说的"空得发慌" —— 面积比分不清"三格挤一条带"与"中间一道大沟"。
// 同既有决策「转移冲突区 > 区内腾挪」一个路数: **换口径是根治, 分档是给错口径打补丁**。
//
// 为什么是警示不是硬失败: 这三项是**启发式**, 不是几何违规 —— 嵌套组、有意留白、一条
// 故意跨全图的主杆都可能是对的。把启发式焊成 fail-closed, 等于用审美否决正确排版。
//
// ⚠️ 归属口径(260918 改成**声明优先**): 组声明了 `contains` 就按声明算, 没声明才回落
// "节点矩形落在组框内"的几何反推 —— 差集由 `audit.metrics.undeclared_groups` 暴露。
// 为什么不干脆只认声明: 这三项是**启发式**(warning), 拿"作者漏写声明"当"框里没内容"报空框,
// 等于让一句漏写毁掉整条警示层; 而事实档门禁(组自洽四条)那边**只认声明** —— 口径分开是刻意的:
// 事实要的是"别拿推断冒充作者意图", 启发式要的是"别因为漏写就闭嘴"。
// =====================================================================

import type { Diagnostic, Scene } from './audit';
import { DENSITY_CODES } from './codes';
import { type Rect, rectBottom, rectRight, round1 } from '../geometry/vec';
import { polylineLength, rectsOverlap } from '../geometry/predicates';
import { groupMembers } from './cluster';

export type DensityOptions = {
  /**
   * 空白走廊**占比**阈值(缺省 0.25 = 最大空隙超过所在轴长度四分之一)。
   * 小图里有效(36px 的 padding 在小框上占比很高); 大图里几乎不会触发, 靠下面那条尺度判据。
   */
  corridorRatio?: number;
  /** 空白走廊**绝对宽度**下限(px, 缺省 48) —— 与其它条件是"与"关系, 不到这个宽度不算一道沟 */
  corridorMin?: number;
  /**
   * 走廊 / **节点尺度**阈值(缺省 1.0 = 空档宽过一个节点, 即"中间能再塞一个")。
   * 这条是"大图也能报"的主力: 大图里 corridor/span 永远偏小(实测 9 节点一条带上
   * 175px 的间隙只占 span 的 0.10), 而"空档比节点还宽"才是人眼说的"稀";
   * 且它天然放过"框正好包住内容"的层带型(那儿只剩 padding 那么宽)。
   * 260917 校准(8 张 Mermaid 真图 + 自家产物): factor=1.0 时喊 6 处, 全部是
   * 人眼判读的"摊开"型痛点; harness-arch / 架构图 / 层带型 fixture 均安静。
   */
  corridorFactor?: number;
  /** 长边阈值: 边长 / 画布对角线(缺省 0.4) */
  longEdgeRatio?: number;
};

export type ClusterDensity = {
  id: string;
  area: number;
  /** 走廊所在主轴的长度(向宽组看 w, 向高组看 h) */
  span: number;
  /** 该主轴投影上最大的一段无内容区间(px, 含首尾 padding) */
  corridor: number;
  /** corridor / span */
  corridorRatio: number;
  /** 走廊方向: 'x'(左右一道竖沟) / 'y'(上下一条横沟) */
  axis: 'x' | 'y';
  /** 成员在走廊方向上的**尺度中位数** —— "空档能塞下几个节点"的尺度参照 */
  nodeSpan: number;
  nodes: number;
};

export type DensityMetrics = {
  /** -1 = 没有分组可测(与会话约定一致: 不用 0 冒充"测过了, 结果是零") */
  cluster_corridor_max: number;
  cluster_corridor_avg: number;
  /** 最宽的那道沟有多少 px(绝对值 —— 人眼论"空得发慌"看的是这个数) */
  cluster_corridor_px_max: number;
  /** 组框并集 / 画布面积 */
  cluster_coverage: number;
  cluster_overlap: number;
  rows: number;
  mixed_cluster_rows: number;
  edge_max_rel: number;
  edge_avg_rel: number;
  /** 边长 / 画布对角的**中位数** —— 本刀的"本图典型边长"基线 */
  edge_med_rel: number;
  long_edges: number;
};

export type DensityReport = { metrics: DensityMetrics; diagnostics: Diagnostic[] };

/** 节点在视觉上的占位(矩形外扩): 挨着框边的节点也该算"占住了这块地方" */
const FOOTPRINT_PAD = 14;

const area = (r: Rect): number => r.w * r.h;
const grow = (r: Rect, p: number): Rect => ({ x: r.x - p, y: r.y - p, w: r.w + 2 * p, h: r.h + 2 * p });

const median = (xs: number[]): number => {
  if (!xs.length) return -1;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** 若干矩形的并集面积(逐列条带扫; 矩形数量是图级别, 不必上扫描线) */
export function unionArea(rects: Rect[]): number {
  if (!rects.length) return 0;
  const xs = [...new Set(rects.flatMap((r) => [r.x, rectRight(r)]))].sort((a, b) => a - b);
  let sum = 0;
  for (let i = 0; i < xs.length - 1; i++) {
    const mid = (xs[i] + xs[i + 1]) / 2;
    const spans = rects.filter((r) => r.x <= mid && mid <= rectRight(r)).map((r) => [r.y, rectBottom(r)] as const).sort((a, b) => a[0] - b[0]);
    let cov = 0;
    let cur: [number, number] | null = null;
    for (const [a, b] of spans) {
      if (!cur) cur = [a, b];
      else if (a <= cur[1]) cur[1] = Math.max(cur[1], b);
      else { cov += cur[1] - cur[0]; cur = [a, b]; }
    }
    if (cur) cov += cur[1] - cur[0];
    sum += (xs[i + 1] - xs[i]) * cov;
  }
  return sum;
}

/**
 * 组框 → 成员节点下标。**声明优先**(`SceneGroup.contains`), 没声明才回落"节点盒落在框内"的
 * 几何反推 —— 见文件头的归属口径说明。
 *
 * 声明里的**子框 / 不存在的 id** 不进这张表: 这里是节点级度量(走廊 / 混组层), 组框不是节点。
 * 它们的合法性由 `knives/cluster` 的四条门禁去判, 不在这里静默吞掉。
 */
export function clusterMembers(s: Scene): number[][] {
  const at = new Map(s.nodes.map((n, i) => [n.id, i]));
  return auditableGroups(s).map((g) =>
    groupMembers(s, g).ids.map((id) => at.get(id)).filter((i): i is number => i !== undefined),
  );
}

/** 每个节点的层号(0 起)。层 = y 区间重叠过半的一组节点 —— 容忍"按中心对齐"与"按顶对齐"两种口径 */
export function sceneRows(s: Scene): number[] {
  const idx = s.nodes.map((_, i) => i).sort((a, b) => s.nodes[a].rect.y - s.nodes[b].rect.y);
  const row: number[] = new Array(s.nodes.length).fill(0);
  if (!idx.length) return row;
  let r = 0;
  let top = s.nodes[idx[0]].rect.y;
  let bot = rectBottom(s.nodes[idx[0]].rect);
  for (const i of idx) {
    const b = s.nodes[i].rect;
    const overlap = Math.min(bot, rectBottom(b)) - Math.max(top, b.y);
    if (overlap > 0.5 * Math.min(bot - top, b.h)) {
      top = Math.min(top, b.y);
      bot = Math.max(bot, rectBottom(b));
    } else {
      r++;
      top = b.y;
      bot = rectBottom(b);
    }
    row[i] = r;
  }
  return row;
}

/**
 * 组框 → 最大空白走廊。
 *
 * 做法: 把成员 footprint 分别投影到 x 与 y 轴, 各求相邻区间之间的最大空隙(首尾也算 ——
 * 首尾空隙就是"框比内容长"), **取两个方向里更宽的那道**。为什么两方向都算:
 * 260917 实测 Harness `ctx` 组(7 节点被摊成上下两行) —— 只投长边方向的话, 两行的 x 区间
 * 互相填补, 中间那条横沟看不见, 于是**最强的一处真痛反而不报警**。人眼不区分沟的方向。
 */
export function clusterCorridor(g: Rect, members: Rect[]): { corridor: number; span: number; ratio: number; axis: 'x' | 'y' } {
  const scan = (horizontal: boolean) => {
    const lo = horizontal ? g.x : g.y;
    const hi = horizontal ? rectRight(g) : rectBottom(g);
    const iv = members
      .map((r) => (horizontal ? [r.x, rectRight(r)] : [r.y, rectBottom(r)]) as [number, number])
      .map(([a, b]) => [Math.max(a, lo), Math.min(b, hi)] as [number, number])
      .filter(([a, b]) => b > a)
      .sort((p, q) => p[0] - q[0]);
    let best = 0;
    let cur = lo;
    for (const [a, b] of iv) {
      if (a > cur) best = Math.max(best, a - cur);
      cur = Math.max(cur, b);
    }
    return { corridor: Math.max(best, hi - cur), span: hi - lo };
  };
  const hx = scan(true);
  const vy = scan(false);
  const [pick, axis] = hx.corridor >= vy.corridor ? [hx, 'x' as const] : [vy, 'y' as const];
  return {
    corridor: round1(pick.corridor),
    span: round1(pick.span),
    ratio: pick.span > 0 ? round1(pick.corridor / pick.span) : 1,
    axis,
  };
}

export function clusterDensity(s: Scene): ClusterDensity[] {
  return auditableGroups(s).map((g, gi) => {
    const idx = clusterMembers(s)[gi];
    const members = idx.map((i) => grow(s.nodes[i].rect, FOOTPRINT_PAD));
    const c = clusterCorridor(g.rect, members);
    // 尺度参照用**未外扩**的节点尺寸(人眼说"空档比节点还宽"时看的是那个盒子)
    const nodeSpan = median(idx.map((i) => (c.axis === 'x' ? s.nodes[i].rect.w : s.nodes[i].rect.h)));
    return {
      id: g.id, area: round1(area(g.rect)), span: c.span, corridor: c.corridor,
      corridorRatio: c.ratio, axis: c.axis, nodeSpan, nodes: members.length,
    };
  });
}

/** `noCheck` 组(纯视觉分区)不参与密度启发式 —— 三处必须用同一谓词, 下标才对得齐(260920) */
const auditableGroups = (s: Scene) => (s.groups ?? []).filter((g) => !g.noCheck);

export function density(scene: Scene, opts: DensityOptions = {}): DensityReport {
  const corridorThr = opts.corridorRatio ?? 0.25;
  const corridorMinPx = opts.corridorMin ?? 48;
  const corridorFactor = opts.corridorFactor ?? 1;
  const longThr = opts.longEdgeRatio ?? 0.4;
  const diag: Diagnostic[] = [];
  const groups = auditableGroups(scene);
  const members = clusterMembers(scene);
  const perCluster = clusterDensity(scene);
  const rows = sceneRows(scene);
  const rowCount = scene.nodes.length ? Math.max(...rows) + 1 : 0;

  // ① 组内空白走廊
  perCluster.forEach((c) => {
    const empty = c.nodes === 0;
    // 三道闸: 绝对宽度(挡小图的正常留白) + 占比(小图敏感) 或 节点尺度(大图主力)
    const wide = c.corridorRatio > corridorThr || c.corridor >= corridorFactor * c.nodeSpan;
    if (!empty && (c.corridor < corridorMinPx || !wide)) return;
    diag.push({
      code: DENSITY_CODES.cluster_corridor,
      severity: 'warning',
      message: empty
        ? `分组 ${c.id} 里一个节点都没有(空框)`
        : `分组 ${c.id} 内最长一道空白走廊 ${c.corridor}px(${c.axis} 向, 占该轴 ${(c.corridorRatio * 100).toFixed(0)}%, 节点尺度 ${c.nodeSpan}px, 装了 ${c.nodes} 个节点) —— 框被拉得比内容长, 或有节点被排到了对面`,
      subject: { kind: 'group', id: c.id },
      evidence: {
        corridor: c.corridor, ratio: c.corridorRatio, axis: c.axis, span: c.span, nodeSpan: c.nodeSpan,
        threshold: corridorThr, minPx: corridorMinPx, factor: corridorFactor, area: c.area, nodes: c.nodes,
      },
      supportedFixes: [
        { kind: 'tighten-group', hint: '把组框收到"子节点包围盒 + padding"(框是派生量, 不该手写坐标)' },
        { kind: 'reorder', hint: '组内节点换序/并到同一层, 把主轴跨度压下来(改顺序比改坐标安全)' },
        { kind: 'regroup', hint: '中间那道沟若本来就分两簇, 拆成两个组比硬撑一个大组诚实' },
      ],
    });
  });

  // ② 混组层: 同一层里出现 >1 个分组的成员 —— 分组在视觉上被同层打散
  const clusterOf = scene.nodes.map((_, i) => members.findIndex((m) => m.includes(i)));
  const mixed: Array<{ row: number; ids: string[] }> = [];
  for (let r = 0; r < rowCount; r++) {
    const ids = [...new Set(clusterOf.filter((ci, i) => ci >= 0 && rows[i] === r).map((ci) => groups[ci].id))];
    if (ids.length > 1) mixed.push({ row: r, ids });
  }
  mixed.forEach((m) => diag.push({
    code: DENSITY_CODES.mixed_cluster_row,
    severity: 'warning',
    message: `第 ${m.row + 1} 层混了 ${m.ids.length} 个分组(${m.ids.join(' / ')}) —— 分组被同层打散, 常伴随横扫的长边`,
    subject: { kind: 'scene', id: 'scene' },
    evidence: { row: m.row, clusters: m.ids },
    supportedFixes: [
      { kind: 'reorder', hint: '把这几组的层序错开(每组独占一层), 或让小组挪到不抢层的方向' },
      { kind: 'regroup', hint: '若两个小组本是一件事, 合成一组; 若只是相邻, 允许它们不同层' },
      { kind: 'lane-shift', hint: '已打散但必须留: 给跨组的边指定腰线, 别让它从组间空地横穿' },
    ],
  }));

  // ③ 长边: 边长 / 画布对角线
  //
  // “长”必须是**相对本图其余边**而言的。首版只比绝对值, 结果在只有一条边的两节点图里
  // 必然报警(单边图里那条边当然占满全图) —— 那是废话不是病。所以加一道中位数基线:
  // 只有显著超出本图典型边长(max(绝对阈值, 3×中位数))的边才算“横扫”。
  // 稀疏图(边数 <= 2)天然落在此基线之下, 不需要额外特例。
  const diagLen = Math.hypot(scene.width, scene.height) || 1;
  const rel = scene.edges.map((e) => polylineLength(e.points) / diagLen);
  const med = median(rel);
  const longBaseline = Math.max(longThr, 3 * med);
  scene.edges.forEach((e, i) => {
    if (rel[i] <= longBaseline) return;
    diag.push({
      code: DENSITY_CODES.long_edge,
      severity: 'warning',
      message: `边 ${e.id} 长度是画布对角的 ${(rel[i] * 100).toFixed(0)}%(本图中位数 ${(med * 100).toFixed(0)}%) —— 横扫全图`,
      subject: { kind: 'edge', id: e.id },
      evidence: {
        ratio: round1(rel[i]), threshold: longThr, baseline: round1(longBaseline), median: round1(med),
        length: round1(polylineLength(e.points)), diagonal: round1(diagLen),
      },
      supportedFixes: [
        { kind: 'reorder', hint: '把目标节点换到近处(换序): 长边的根因九成是两端被排到画布两侧' },
        { kind: 'lane-shift', hint: '必须跨图: 用 route 的 lane 给它一条固定的腰线, 别让它自由横穿' },
        { kind: 'move-port', hint: '换出口面(端口位置), 有时能让长边贴着画布边缘走而不是穿过中间' },
      ],
    });
  });

  // ④ 组框互叠: 合法嵌套**不再**警示(260918 消误报), 剩下的才报
  //
  // 判据(与 `knives/cluster` 的四条门禁分工, 一条缺陷只报一次):
  //   · 框不重叠 → 无事
  //   · 一个框装住另一个 **且成员也同向包含** → 这就是"刻意嵌套", 是合法排版, 过去正是在这里误报
  //   · 框交叉 **且成员有重合** → audit 的 `cluster_frame_cross`(error)已经定性, 这里不重复喊
  //   · 剩下来的才是"几何上说不过去、又没人管"的那种: 框交叠而两边成员互不相干
  const containsRect = (outer: Rect, inner: Rect): boolean =>
    inner.x >= outer.x && inner.y >= outer.y && rectRight(inner) <= rectRight(outer) && rectBottom(inner) <= rectBottom(outer);
  const memberSets = groups.map((g) => new Set(groupMembers(scene, g).ids));
  const subsetOf = (a: Set<string>, b: Set<string>): boolean => [...a].every((id) => b.has(id));
  const sharedIds = (a: Set<string>, b: Set<string>): string[] => [...a].filter((id) => b.has(id));
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      // 按 id 码点序定 (a, b): 文案与 subject 不许取决于 `groups` 的书写顺序
      const swap = groups[i].id > groups[j].id;
      const [a, b] = swap ? [groups[j], groups[i]] : [groups[i], groups[j]];
      const sa = memberSets[swap ? j : i];
      const sb = memberSets[swap ? i : j];
      if (!rectsOverlap(a.rect, b.rect)) continue;
      const nested = (containsRect(a.rect, b.rect) && subsetOf(sb, sa))
        || (containsRect(b.rect, a.rect) && subsetOf(sa, sb));
      if (nested) continue;
      if (sharedIds(sa, sb).length) continue; // 交给 cluster_frame_cross
      diag.push({
        code: DENSITY_CODES.cluster_overlap,
        severity: 'warning',
        message: `分组 ${a.id} 与 ${b.id} 的框交叠, 而两边成员互不相干 —— 框要么分开, 要么用包含关系说清谁装谁`,
        subject: { kind: 'group', id: a.id },
        evidence: { other: b.id, shared: [] },
        supportedFixes: [
          { kind: 'move-group', hint: '把其中一个框整体挪开(框交叠但成员不相干, 图上只在骗人)' },
          { kind: 'tighten-group', hint: '两个框各自收紧到内容 —— 框交叠常常是"手写框太大"造成的' },
          { kind: 'declare-membership', hint: `刻意嵌套就把成员声明写清楚(${a.id} / ${b.id} 的 contains), 让包含关系可审` },
        ],
      });
    }
  }

  const ratios = perCluster.map((c) => c.corridorRatio);
  const corridors = perCluster.map((c) => c.corridor);
  const metrics: DensityMetrics = {
    cluster_corridor_max: ratios.length ? round1(Math.max(...ratios)) : -1,
    cluster_corridor_avg: ratios.length ? round1(ratios.reduce((a, b) => a + b, 0) / ratios.length) : -1,
    cluster_corridor_px_max: corridors.length ? round1(Math.max(...corridors)) : -1,
    cluster_coverage: round1(unionArea(groups.map((g) => g.rect)) / (scene.width * scene.height || 1)),
    cluster_overlap: diag.filter((d) => d.code === DENSITY_CODES.cluster_overlap).length,
    rows: rowCount,
    mixed_cluster_rows: mixed.length,
    edge_max_rel: rel.length ? round1(Math.max(...rel)) : -1,
    edge_avg_rel: rel.length ? round1(rel.reduce((a, b) => a + b, 0) / rel.length) : -1,
    edge_med_rel: rel.length ? round1(med) : -1,
    long_edges: rel.filter((v) => v > longBaseline).length,
  };

  return { metrics, diagnostics: diag };
}
