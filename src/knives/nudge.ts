// =====================================================================
// knives/nudge · 局部微调刀: align / distribute / snap
//
// 定位(TODO.md 的 M1 清单): 只修**局部坐标**, 不动拓扑。三把刀只碰 `rect.x` / `rect.y` ——
// 不改宽高、不改边表、不改折点列、不改节点顺序, 入参对象的其他字段(label / bounds_source /
// radius ...)原样带过。换层 / 换序 / 重路由这类**拓扑**修正要作者决策权, 不在本文件(设计稿 §九清仓表)。
//
// 三条硬纪律(与 core 其余部分同源, 调用方必读):
//   ① **纯函数不 mutate 入参**: 数组与对象一律换新实例(`[...items].sort`, 不是 `items.sort`)。
//      ⇒ 因为恒返回新实例, **不能**用 `===` 判"这次有没有动", 请看出口的 `moved`。
//   ② **字节确定性**: 每个写回的坐标都过 `round1`(1 位小数), 同输入两次调用逐字节相同 ——
//      这是 golden 与逐字节 diff 的前提。代价是吸附 / 等距可能留 ≤0.1px 量化残差(与 serialize 的
//      1 位小数出口同源), 别在调用侧再补一次取整(补了反而把残差变成新的不一致)。
//   ③ **"不知道"不许降级成"动一半"**: 任一 rect 非有限 → 整个操作返回 `items: null` 并被拦停,
//      不许跳过坏项只动好项(同 `polylineRectsClearance` 的"任一非法即整体 null": 静默降级会让
//      调用方以为整块都对齐好了)。参数非法(阈值 / 栅格步长 / 参考系)同样拦停, 且**与集合大小无关**
//      —— 空集也照样报。
//
// 出口形状统一是 `NudgeResult`; 诊断沿用 audit 的 `Diagnostic` 形状(必须带 supportedFixes ——
// 没有修法的报错等于让 agent 猜, 那是这条路线最贵的失败模式)。
// =====================================================================

import { isFiniteRect } from '../geometry/predicates';
import { type Rect, rectBottom, rectRight, round1 } from '../geometry/vec';
import { type Diagnostic } from './audit';

// --- 契约类型 ----------------------------------------------------------

/** 本刀的操作对象: 有 id 与 rect 就够 —— 节点的 label / bounds_source 等字段由泛型原样带过 */
export type NudgeItem = { id: string; rect: Rect };

/** 只动一个轴: align 的六个面各归其中一轴; distribute / snap 由调用方指定 */
export type NudgeAxis = 'x' | 'y';

/**
 * 三把刀统一的出口。
 * `items: null` = 输入非法, 整个操作被拦停(见文件头纪律 ③) —— 这是"不知道", 与"没动"是两回事;
 * `moved` = 坐标真的变了的 id(按入参序), 因为恒返回新实例, 它才是"这次动没动"的判据。
 */
export type NudgeResult<T extends NudgeItem> = {
  items: T[] | null;
  moved: string[];
  diagnostics: Diagnostic[];
};

// --- 小工具 ------------------------------------------------------------

const AXES: readonly NudgeAxis[] = ['x', 'y'];
/** 面上的三个候选点: 前缘 / 中线 / 后缘 */
const FACE_FRACTIONS: readonly number[] = [0, 0.5, 1];

const startOf = (r: Rect, axis: NudgeAxis): number => (axis === 'x' ? r.x : r.y);
const sizeOf = (r: Rect, axis: NudgeAxis): number => (axis === 'x' ? r.w : r.h);
/** 该轴上的面坐标: frac 0 = 前缘, 0.5 = 中线, 1 = 后缘 */
const faceAt = (r: Rect, axis: NudgeAxis, frac: number): number => startOf(r, axis) + sizeOf(r, axis) * frac;

/** 只换一个轴: 宽高与其他字段一律不碰 */
const withAxis = (rect: Rect, axis: NudgeAxis, v: number): Rect => (axis === 'x' ? { ...rect, x: v } : { ...rect, y: v });

/** 换新实例(rect 也换新): 输出绝不与入参共享 rect 对象, 否则调用方改输出会反噬入参 */
const cloneItem = <T extends NudgeItem>(it: T): T => ({ ...it, rect: { ...it.rect } });

/** 拦停出口: items 为 null 但诊断照给(给不出原因的 null 等于让调用方猜) */
const blocked = <T extends NudgeItem>(d: Diagnostic): NudgeResult<T> => ({ items: null, moved: [], diagnostics: [d] });

/**
 * 首个非有限 rect(全合法 → null); 连"哪个字段坏了"一起回, 好写进诊断。
 * 判据刻意与 `isFiniteRect` 逐字一致(只看有限性, 不看宽高正负): 宽高为负是上游建盒子的错,
 * 归 finite_svg / 结构断言去抓, 本刀不另立一套"合法矩形"的定义。
 */
function firstNonFinite(items: NudgeItem[]): { item: NudgeItem; field: string } | null {
  for (const item of items) {
    if (isFiniteRect(item.rect)) continue;
    // 走到这里必然有一个非有限(否则 isFiniteRect 会过), 所以最后的 'h' 兜底是准的
    const { x, y, w } = item.rect;
    const field = !Number.isFinite(x) ? 'x' : !Number.isFinite(y) ? 'y' : !Number.isFinite(w) ? 'w' : 'h';
    return { item, field };
  }
  return null;
}

// --- 拦停诊断 ----------------------------------------------------------

/** 非有限坐标: 报"哪一项 + 哪个字段", 修法与 audit 的 finite_svg 同方向(先修上游, 别在出口补默认值) */
function invalidRectDiagnostic(item: NudgeItem, field: string): Diagnostic {
  return {
    code: 'nudge_invalid_rect',
    severity: 'error',
    message: `节点 ${item.id} 的 rect.${field} 不是有限数 —— 坐标运算会算出 NaN, 本刀已拦停(不返回半成品)`,
    subject: { kind: 'node', id: item.id },
    evidence: { field, rect: [item.rect.x, item.rect.y, item.rect.w, item.rect.h] },
    supportedFixes: [
      { kind: 'fix-source', hint: '先修这个坐标的来源(多为除法 / 插值遇到空值)再重跑本刀 —— 不要在出口补默认值' },
      { kind: 'audit-first', hint: '跑 audit 的 finite_svg 门禁拿全域坏值清单: 一处坏值通常意味着上游有一处系统性 bug' },
    ],
  };
}

/** 参考系 / 参数里含非有限值: 锚点算不出来 = "不知道", 拦停 */
function invalidRefDiagnostic(ref: AlignRef): Diagnostic {
  const evidence: Diagnostic['evidence'] =
    ref.kind === 'canvas'
      ? { canvas: [ref.width, ref.height] }
      : ref.kind === 'rect'
        ? { rect: [ref.rect.x, ref.rect.y, ref.rect.w, ref.rect.h] }
        : { ref: ref.kind };
  return {
    code: 'nudge_invalid_rect',
    severity: 'error',
    message: `对齐参考系(${ref.kind})含非有限数值 —— 锚点算不出来, 本刀已拦停`,
    subject: { kind: 'scene', id: ref.kind },
    evidence,
    supportedFixes: [
      {
        kind: 'fix-input',
        hint: ref.kind === 'rect' ? '检查 anchor rect 的四个数是不是都有限' : '检查画布宽高是不是都有限',
      },
      { kind: 'use-selection', hint: "改用 { kind: 'selection' } 参考系(以选中集自身包围盒为准), 先把对齐跑出来" },
    ],
  };
}

/** 吸附参数非法(阈值 / 栅格步长): 拦停而不是"当作 0 用" —— 同 predicates 的 null 纪律 */
function invalidSnapParamDiagnostic(opts: SnapOptions, offenders: string[]): Diagnostic {
  return {
    code: 'nudge_invalid_param',
    severity: 'error',
    message: `吸附参数非法(${offenders.join(' / ')}) —— 阈值必须是非负有限数, 栅格步长必须是正有限数, 本刀已拦停`,
    subject: { kind: 'scene', id: 'snap' },
    evidence: { offenders, threshold: opts.threshold },
    supportedFixes: [
      { kind: 'fix-threshold', hint: '阈值给非负有限数(常用 4~12px); 负数没有物理含义, 不许当 0 用' },
      { kind: 'fix-grid', hint: '栅格步长给正有限数(如 8 / 20); 不想吸某轴就整轴不给 step' },
      { kind: 'disable-snap', hint: '确实不想吸附就别调 snap —— 调了却一个靶子都不给只能静默返回原坐标' },
    ],
  };
}

/** 吸附一个靶子都没有: 静默返回原坐标会被读成"已经吸好了", 所以必须报 warning 并把三类靶子列出来 */
function noSnapTargetsDiagnostic(threshold: number): Diagnostic {
  return {
    code: 'snap_no_targets',
    severity: 'warning',
    message: `吸附没有靶子(grid / others / guides 一个都没给) —— 坐标原样返回, 请求的 ${threshold}px 阈值没生效`,
    subject: { kind: 'scene', id: 'snap' },
    evidence: { threshold },
    supportedFixes: [
      { kind: 'add-grid', hint: '给 `grid`: 规则化网格的图一律用栅格吸附(常用 8 / 20)' },
      { kind: 'add-others', hint: '给 `others`: 传未参与微调的节点, 让选中项吸到邻居的前缘 / 中线 / 后缘' },
      { kind: 'add-guides', hint: '给 `guides`: 传作者画的对齐线坐标(每轴一组数)' },
    ],
  };
}

/**
 * 空间不够: 等距间距为负 → 落位后节点互相压。
 * 不拦停(坐标照给): "先压着"有时是作者的中间状态, 但必须报出来 —— 静默压上去会被当成"分布对了"。
 */
function distributeOverflowDiagnostic(
  ordered: NudgeItem[],
  axis: NudgeAxis,
  gap: number,
  total: number,
  span: number,
): Diagnostic {
  return {
    code: 'distribute_overflow',
    severity: 'warning',
    message:
      `${ordered.length} 个节点在 ${axis} 轴上共占 ${round1(total)}px, 但两端之间只有 ${round1(span)}px —— ` +
      `等距间距为 ${round1(gap)}px, 落位后节点会重叠`,
    subject: { kind: 'node', id: ordered[0].id },
    evidence: { axis, count: ordered.length, gap: round1(gap), total: round1(total), span: round1(span), ids: ordered.map((n) => n.id) },
    supportedFixes: [
      { kind: 'shrink-nodes', hint: '收窄节点或缩短标签(在 HTML 侧改), 让总宽回到可用跨度内' },
      { kind: 'grow-canvas', hint: '把画布 / 容器放宽, 给这一排腾出跨度' },
      { kind: 'split-ranks', hint: '内容确实超载: 拆成两排(改的是层 / 序这类决策, 不是坐标)' },
    ],
  };
}

// --- ① align: 对齐到参考系的一个面 --------------------------------------

export type AlignAxis = 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom';

/**
 * 参考系三选一(缺省 `selection`):
 * · `selection`: 选中集**自身**的包围盒 —— "以选中项为准"对齐; 单元素时退化成不动
 * · `rect`: 显式锚矩形 —— 对齐到场景里某个已有元素(标题条 / 图例框 / 另一个节点)
 * · `canvas`: 画布边界与中线 —— 即 0 / width / width/2(y 轴同理)
 */
export type AlignRef =
  | { kind: 'selection' }
  | { kind: 'rect'; rect: Rect }
  | { kind: 'canvas'; width: number; height: number };

/** 对齐面 → (动哪个轴, 面在该轴上的占比) */
function alignFace(axis: AlignAxis): { axis: NudgeAxis; frac: number } {
  switch (axis) {
    case 'left': return { axis: 'x', frac: 0 };
    case 'centerX': return { axis: 'x', frac: 0.5 };
    case 'right': return { axis: 'x', frac: 1 };
    case 'top': return { axis: 'y', frac: 0 };
    case 'centerY': return { axis: 'y', frac: 0.5 };
    case 'bottom': return { axis: 'y', frac: 1 };
  }
}

/** 显式参考系是否可用: 只看有限性(selection 由 items 自身的有限性保证) */
function isFiniteRef(ref: AlignRef): boolean {
  switch (ref.kind) {
    case 'selection': return true;
    case 'rect': return isFiniteRect(ref.rect);
    case 'canvas': return isFiniteRect({ x: 0, y: 0, w: ref.width, h: ref.height });
  }
}

/** 参考系 → 锚矩形(前提: items 非空且 `isFiniteRef` 已过, 所以这里不会算不出数) */
function refRect(ref: AlignRef, items: NudgeItem[]): Rect {
  switch (ref.kind) {
    case 'selection': {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const it of items) {
        x0 = Math.min(x0, it.rect.x);
        y0 = Math.min(y0, it.rect.y);
        x1 = Math.max(x1, rectRight(it.rect));
        y1 = Math.max(y1, rectBottom(it.rect));
      }
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }
    case 'rect': return ref.rect;
    case 'canvas': return { x: 0, y: 0, w: ref.width, h: ref.height };
  }
}

/**
 * 对齐: 把每一项的某个面移到参考系的对应面上, **单轴单趟**, 不做迭代收敛。
 *
 * 为什么不做迭代: 以"选中集包围盒"为参考系时, 迭代会把手脚伸向参考系本身 ——
 * 每轮包围盒都随落位而变, 结果是"对齐"变成"整块慢慢挪", 与作者的预期正好相反。
 * 参考系统一取**进入本次操作时**的值, 这也是所有编辑器里 align 的语义。
 *
 * 非法输入(项里坏 rect / 显式参考系含非有限值)整体拦停 → `items: null` + 诊断; 空集返回空数组。
 */
export function align<T extends NudgeItem>(
  items: T[],
  axis: AlignAxis,
  ref: AlignRef = { kind: 'selection' },
): NudgeResult<T> {
  const bad = firstNonFinite(items);
  if (bad) return blocked<T>(invalidRectDiagnostic(bad.item, bad.field));
  // 显式参考系先验(与集合大小无关): 锚都算不出来的请求, 不因为"恰好没元素"就默认成功
  if (!isFiniteRef(ref)) return blocked<T>(invalidRefDiagnostic(ref));
  // 空集是合法退化(没有可动的东西), 放在参考系解析之后: 空集的包围盒根本没定义, 不去算它
  if (!items.length) return { items: [], moved: [], diagnostics: [] };

  const anchor = refRect(ref, items);
  const { axis: ax, frac } = alignFace(axis);
  const target = faceAt(anchor, ax, frac);
  const moved: string[] = [];
  const out = items.map((it) => {
    const next = round1(target - sizeOf(it.rect, ax) * frac);
    if (next === startOf(it.rect, ax)) return cloneItem(it);
    moved.push(it.id);
    return { ...it, rect: withAxis(it.rect, ax, next) };
  });
  return { items: out, moved, diagnostics: [] };
}

// --- ② distribute: 等距分布 --------------------------------------------

/**
 * 等距分布(水平 / 垂直)。
 *
 * **口径: 间距相等(净空相等), 不是中心距相等。** 三条理由:
 *   ① 眼睛读的是两块之间的**空白**, 不是两条中线之间的距离 —— 宽窄不一的节点排一排时,
 *      中心距口径会让宽节点那侧显得挤、窄节点那侧显得空; 间距口径下空白一律相等。
 *   ② core 自己的门禁 `node_gap` 量的就是矩形之间的净空, 间距口径直接对齐那把尺子。
 *   ③ 等尺寸节点下两种口径退化成同一个结果 —— 间距口径是严格更一般的那一个。
 *
 * 保两端: 按前缘排序后, 首项前缘与末项后缘不动(与 Figma 的 distribute 同约定), 让整块占位不漂移。
 * 排序判据三级(前缘 → 中线 → 入参下标), 保证同输入必得同序; 输出仍与入参同序同长。
 * 空间不够(间距为负)时不拦停, 出 `distribute_overflow` warning + 坐标 —— 压着是临时状态, 报而不拦。
 */
export function distribute<T extends NudgeItem>(items: T[], axis: NudgeAxis = 'x'): NudgeResult<T> {
  const bad = firstNonFinite(items);
  if (bad) return blocked<T>(invalidRectDiagnostic(bad.item, bad.field));
  if (items.length < 2) return { items: items.map(cloneItem), moved: [], diagnostics: [] };

  // 排序只为决定**谁排第几**, 输出一律回到入参序; 用副本排, 绝不原地 sort 入参
  const order = items
    .map((it, index) => ({ it, index }))
    .sort(
      (a, b) =>
        startOf(a.it.rect, axis) - startOf(b.it.rect, axis) ||
        faceAt(a.it.rect, axis, 0.5) - faceAt(b.it.rect, axis, 0.5) ||
        a.index - b.index,
    );
  const head = order[0].it;
  const tail = order[order.length - 1].it;
  const span = faceAt(tail.rect, axis, 1) - faceAt(head.rect, axis, 0);
  const total = order.reduce((s, o) => s + sizeOf(o.it.rect, axis), 0);
  const gap = (span - total) / (order.length - 1);

  const diagnostics: Diagnostic[] = [];
  if (gap < 0) diagnostics.push(distributeOverflowDiagnostic(order.map((o) => o.it), axis, gap, total, span));

  // cursor 保持未收口(精度只在写回时丢一次) —— 这样末项后缘在代数上仍等于原值, 两端锚得住
  const placed = new Map<number, Rect>();
  let cursor = startOf(head.rect, axis);
  for (const { it, index } of order) {
    placed.set(index, withAxis(it.rect, axis, round1(cursor)));
    cursor += sizeOf(it.rect, axis) + gap;
  }

  const moved: string[] = [];
  const out = items.map((it, index) => {
    const rect = placed.get(index) ?? it.rect; // 排序后每个下标必有位; ?? 只是给类型收口
    if (startOf(rect, axis) === startOf(it.rect, axis)) return cloneItem(it);
    moved.push(it.id);
    return { ...it, rect };
  });
  return { items: out, moved, diagnostics };
}

// --- ③ snap: 吸附 ------------------------------------------------------

export type SnapOptions = {
  /**
   * 吸附阈值(px), **必填**: 阈值是画风的旋钮(4px 与 12px 是两种图), core 不替调用方定。
   * 必须是非负有限数; NaN / Infinity / 负数 → 拦停(不当 0 用, 同 predicates 的 null 纪律)。
   */
  threshold: number;
  /** 栅格步长: 数字 = 两轴同值; `{x,y}` 分开给(某轴不给就不吸该轴)。步长必须正且有限 */
  grid?: number | { x?: number; y?: number };
  /** 不参与移动的其他元素(只当靶子): 取它们的前缘 / 中线 / 后缘。传选中集自己会退化成吸自己 */
  others?: NudgeItem[];
  /** 显式对齐线(作者画的那几条): 每轴一组坐标 */
  guides?: { x?: number[]; y?: number[] };
};

/** 取某轴的栅格步长(normalize `number` 与 `{x,y}` 两种写法); 未给 → undefined */
function gridStep(grid: SnapOptions['grid'], axis: NudgeAxis): number | undefined {
  if (grid === undefined) return undefined;
  return typeof grid === 'number' ? grid : grid[axis];
}

/** 参数校验(第一道闸, 与集合大小无关): 阈值非负有限 / 每个给到的栅格步长为正有限 */
function snapParamOffenders(opts: SnapOptions): string[] {
  const bad: string[] = [];
  if (!Number.isFinite(opts.threshold) || opts.threshold < 0) bad.push('threshold');
  const { grid } = opts;
  if (grid !== undefined) {
    if (typeof grid === 'number') {
      if (!(Number.isFinite(grid) && grid > 0)) bad.push('grid');
    } else {
      for (const axis of AXES) {
        const step = grid[axis];
        if (step !== undefined && !(Number.isFinite(step) && step > 0)) bad.push(`grid.${axis}`);
      }
    }
  }
  return bad;
}

/** 取 |位移| 更小的候选: 严格小于才替换 ⇒ 恰好同距时先到者胜, 迭代次序即优先级 */
const nearer = (best: number | null, delta: number): number => (best === null || Math.abs(delta) < Math.abs(best) ? delta : best);

/**
 * 吸附: 把每一项的某个面吸到最近的靶子上, 阈值之内才动。
 *
 * 逐轴独立: x 与 y 各找各自的最近靶子, 不搞对角吸附 —— 两个方向的位移互不影响,
 * 这样"只吸水平方向"是可期的, 也不会因为邻居斜着摆就把节点拽歪。
 *
 * 候选面: 每一项的前缘 / 中线 / 后缘各出一个候选(x 轴即 left / centerX / right)。
 * 靶子三类: ① `grid` 格点 ② `others` 里各矩形的前缘/中线/后缘(面 × 面全交叉: 左对左是"对齐",
 * 右对左是"贴边闭合", 两种在等距布局里都是常态) ③ `guides` 显式对齐线。
 * 取 |位移| 最小的候选; **恰好同距时先到者胜**, 候选生成次序就是优先级: guides → others → grid
 * (作者显式给的对齐线比"规则化格点"更贴近意图, 而邻居边是场景里真实存在的锚)。
 *
 * 命中判据 `|位移| <= threshold`(含边界, 与 audit 的"恰好等于阈值即通过"同向)。
 * 残差: 写回坐标过 round1, 所以命中后靶面可能落在目标 ±0.05px 内, 不是逐像素精确。
 *
 * 拦停: 阈值 / 栅格步长非法(含坏 rect, 项与 others 都算几何输入)→ `items: null` + 诊断。
 * 一个靶子都没给 → 不拦停, 原样返回 + `snap_no_targets` warning(静默返回会被读成"已经吸好了")。
 */
export function snap<T extends NudgeItem>(items: T[], opts: SnapOptions): NudgeResult<T> {
  const offenders = snapParamOffenders(opts);
  if (offenders.length) return blocked<T>(invalidSnapParamDiagnostic(opts, offenders));

  const guidesX = opts.guides?.x ?? [];
  const guidesY = opts.guides?.y ?? [];
  const others = opts.others ?? [];
  const hasGrid = gridStep(opts.grid, 'x') !== undefined || gridStep(opts.grid, 'y') !== undefined;
  if (!hasGrid && !guidesX.length && !guidesY.length && !others.length) {
    return { items: items.map(cloneItem), moved: [], diagnostics: [noSnapTargetsDiagnostic(opts.threshold)] };
  }

  const bad = firstNonFinite(items) ?? firstNonFinite(others);
  if (bad) return blocked<T>(invalidRectDiagnostic(bad.item, bad.field));

  const moved: string[] = [];
  const out = items.map((it) => {
    let rect = it.rect;
    for (const axis of AXES) {
      const step = gridStep(opts.grid, axis);
      const guides = axis === 'x' ? guidesX : guidesY;
      const start = startOf(rect, axis);
      let best: number | null = null;
      for (const frac of FACE_FRACTIONS) {
        const face = faceAt(rect, axis, frac);
        // 候选按优先级生成(严格小于才替换): 显式对齐线 → 邻居面 → 栅格
        for (const g of guides) best = nearer(best, g - face);
        for (const o of others) for (const f of FACE_FRACTIONS) best = nearer(best, faceAt(o.rect, axis, f) - face);
        if (step !== undefined) best = nearer(best, Math.round(face / step) * step - face);
      }
      if (best === null || Math.abs(best) > opts.threshold) continue;
      const next = round1(start + best);
      if (next !== start) rect = withAxis(rect, axis, next);
    }
    if (rect === it.rect) return cloneItem(it);
    moved.push(it.id);
    return { ...it, rect };
  });
  return { items: out, moved, diagnostics: [] };
}
