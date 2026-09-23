// =====================================================================
// guard · shape 入参守卫 —— 把 NaN 拦在源头, 而不是等渲染器静默吞掉元素
//
// 260917 实测咬了三次同一类事故: 调用方写 `nodeShape({ ...n })`(本意是展开 rect),
// 于是 x/y/w/h 全 undefined → 算出 NaN → 序列化写出 NaN → 渲染器**静默丢弃整个元素**
// (整排节点消失 / 组框消失), **而 audit 全过** —— 因为它审的 scene 用的是正确的 rect。
//
// 这是"门禁看不见"的又一类: 送审 scene 正确, 但渲染 children 错。门禁永远看不到它,
// 所以守卫必须落在 shape 的**入参边界**上, 而不是指望下游任何一道门。
//
// 语义: 畸形入参是**编程错误**, 不是数据错误 —— 一律当场抛, 不做 dev/prod 分档。
// 报错文案必须直接指向那个常见写法, 否则 agent 会在几十个字段里瞎猜(token 节流阀的又一环)。
//
// 260920 加了本文件的唯一**复合件** `resolveKnobs`(版式旋钮: 缺省回落 + 同一套守卫),
// 缘由写在它自己的段落注释里 —— 一句话: 那条政策与 `assertFiniteRect` 对宽高说的
// 是同一句话, 只是要**批量**做, 而批量那版让每张模板重抄一遍是不划算的。
// =====================================================================

/** shape 入参畸形。带上 shape 名与字段名, 便于机器分流(与 Diagnostic 的 subject 同思路) */
export class ShapeInputError extends TypeError {
  readonly shape: string;
  readonly field: string;
  /** 字段的类别词(报错文案里的那个名词); 缺省按数值参数说 —— 词表参数另给, 免得报错说"数值"却拿到一个字符串 */
  constructor(shape: string, field: string, reason: string, hint?: string, kind = '必填数值参数') {
    super(`${shape}: ${kind} "${field}" ${reason}${hint ? ` —— ${hint}` : ''}`);
    this.name = 'ShapeInputError';
    this.shape = shape;
    this.field = field;
  }
}

/** 值是不是可用的有限数(undefined / NaN / ±Infinity 全拦) */
const bad = (v: unknown): string | null => {
  if (typeof v !== 'number') return `不是数字(拿到 ${v === undefined ? 'undefined' : typeof v})`;
  if (Number.isNaN(v)) return '是 NaN';
  if (!Number.isFinite(v)) return `是 ${v > 0 ? 'Infinity' : '-Infinity'}`;
  return null;
};

/** 常见踩法: 把整个 SceneNode 展开进 shape(本意是展开它的 rect) */
export const HINT_SPREAD_RECT =
  '若传入的是 SceneNode, 写 `{ ...n.rect }` 而不是 `{ ...n }`(rect 是个嵌套对象, 展开错了不会报错, 只会算出 NaN)';

/** 单个必填数值 */
export function assertFiniteNumber(shape: string, field: string, v: unknown, hint?: string): void {
  const why = bad(v);
  if (why) throw new ShapeInputError(shape, field, why, hint);
}

/** 矩形四元 x / y / w / h(宽高为负同样是坏几何 —— 负半径路径会画出反向的框) */
export function assertFiniteRect(
  shape: string,
  r: { x?: unknown; y?: unknown; w?: unknown; h?: unknown },
  hint: string = HINT_SPREAD_RECT,
): void {
  assertFiniteNumber(shape, 'x', r.x, hint);
  assertFiniteNumber(shape, 'y', r.y, hint);
  for (const k of ['w', 'h'] as const) {
    assertFiniteNumber(shape, k, r[k], hint);
    if ((r[k] as number) < 0) throw new ShapeInputError(shape, k, `为负(${r[k]})`, '宽高是尺寸不是增量; 传绝对值, 方向交给 x/y');
  }
}

/**
 * 词表槽(形状 / 变体这类枚举值)必须落在词表里。`undefined` = 没写, 走缺省, 不算错。
 *
 * 与 NaN 同一档, 理由也同源: **写错的形状词会静默回落成缺省形态** —— 作者写 `'diamon'`,
 * 图上得到一个圆角矩形, 而 audit 全过(它审的是 rect)。数据驱动 / 反序列化的调用方
 * TS 拦不住, 只有运行时拦得住 —— 这是"作者写了却不上屏"的又一副面孔。
 */
export function assertOneOf(shape: string, field: string, v: unknown, allowed: readonly string[], hint?: string): void {
  if (v === undefined) return;
  if (typeof v !== 'string' || !allowed.includes(v)) {
    const got = typeof v === 'string' ? `"${v}"` : typeof v;
    throw new ShapeInputError(
      shape, field, `不在词表里(拿到 ${got})`,
      `${hint ? `${hint}; ` : ''}只认 ${allowed.join(' / ')}`, '词表参数',
    );
  }
}

/** 折点列: 至少两点, 且每个坐标都是有限数 */
export function assertFinitePoints(shape: string, pts: readonly { x?: unknown; y?: unknown }[], hint = 'route 的输出应已是有限数; 手写折点时检查每个点是否都有 x/y'): void {
  if (!Array.isArray(pts) || pts.length < 2) {
    throw new ShapeInputError(shape, 'points', `不足两点(拿到 ${Array.isArray(pts) ? pts.length : typeof pts} 个)`, '一条边至少要两个折点');
  }
  pts.forEach((p, i) => {
    const wx = bad(p?.x);
    const wy = bad(p?.y);
    if (wx) throw new ShapeInputError(shape, `points[${i}].x`, wx, hint);
    if (wy) throw new ShapeInputError(shape, `points[${i}].y`, wy, hint);
  });
}

// --- 版式旋钮解析(260920): 本文件唯一的**复合件** -------------------------
//
// 由来: `templates/sequence.ts` 自己写过一个 6 行的 `knob()`, 外加 12 行
// `const x = knob(spec.x, D.x, 'x')` 的搬运样板 —— 而那条政策(缺省回落 / 非有限抛 / 负值抛)
// 与 `assertFiniteRect` 对宽高说的**是同一句话**("尺寸不是增量"), 用的原语也全是本文件的。
// 于是它该在这: 模板层"只封装骨架不封装决策"那条宪章管不到它 —— 旋钮守卫是本文件的话题。

/** 版式旋钮表: **键集就是旋钮的声明**, 值是该旋钮的缺省(模板的 `SEQ_DEFAULTS` 即此型) */
export type KnobDefaults = Readonly<Record<string, number>>;

/** 旋钮越界的提示 —— 与 `assertFiniteRect` 对负宽高那条**逐字同源** */
export const HINT_KNOB_SIZE = '版式旋钮是尺寸不是增量; 想贴紧就给 0';

/**
 * 旋钮解析: 逐键回落缺省 → 非有限当场抛 → 负值当场抛。返回**全部键都齐全**的一袋值。
 *
 * 为什么值得上收(而不是各模板自己写一份): 旋钮是模板类工序的**通用形状** —— "一张缺省表 +
 * 调用方按需覆盖" 每张模板都长这样, 而"只校验被覆盖的那几个"这条口径**必须一致**:
 * 缺省值本身是常量(有限且非负), 只有调用方给的值才需要守 —— 否则每次改缺省都要重哄一遍守卫。
 *
 * 键集由 `defaults` 决定, `spec` 里的其余字段一律无视(它是**整份 spec**, 含 actors / messages
 * 这类决策表, 不是旋钮袋)。⚠ 代价: **拼错的旋钮名会被静默无视**。类型化字面量由 tsc 拦,
 * 但从 JSON 反序列化进来的拦不住 —— 与 `assertOneOf` 治的"写错的词静默回落"同族, 目前无解
 * (要拦得给 spec 立一份 schema, 那是另一件事)。
 */
export function resolveKnobs<D extends KnobDefaults>(
  shape: string,
  defaults: D,
  spec: object,
  hint: string = HINT_KNOB_SIZE,
): { [K in keyof D]: number } {
  const given = spec as Record<string, unknown>;
  const out = {} as { [K in keyof D]: number };
  for (const k of Object.keys(defaults) as (keyof D & string)[]) {
    const v = given[k];
    if (v === undefined) { out[k] = defaults[k]; continue; }
    assertFiniteNumber(shape, k, v, hint);
    if ((v as number) < 0) throw new ShapeInputError(shape, k, `为负(${v})`, hint);
    out[k] = v as number;
  }
  return out;
}
