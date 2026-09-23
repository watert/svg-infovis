// =====================================================================
// knives/codes · 门禁码注册表(**单一来源**)
//
// 为什么要有它: 门禁码是跨仓公共契约 —— demo 的覆盖表 / 报告的高亮 / agent 的按码分流都要认它。
// 过去码只以字面量活在发射点里, 消费方**只能手抄一份**(260919 实测: demo 侧手抄了 23 个码,
// 还在注释里写下"core 至今没有导出码注册表")。手抄清单必然与真值漂开, 于是"门禁加了、
// 覆盖表不知道"是迟早的事 —— 而覆盖表的信用一旦破, 它证明的"全绿"就全是假证据。
//
// 纪律(改码的人照做):
//   · 三把刀(audit / cluster / density)发射诊断时**一律从这里取码**, 不许再写字面量 ——
//     "注册表 + 各文件各写一份再汇总"是假单一来源, 加码时照样漏改, 那正是本文件要杀的那件事
//   · 加新码 = 往对应表里加一行, 发射点从表里取; 消费方遍历 `DIAGNOSTIC_CODES` 即可
//   · 判据在 `test/codes-registry.test.ts`: 三把刀在样本 scene 上**实际产出的码集合 ⊆ 注册表**
//     (差集必须可见 —— 码会不会喊疼由真实样本证明, 别再手抄期望值)
//
// 键与值写成同一个字符串是刻意的: 表本身就是可人读的码表, 且 `grep finite_svg src/` 同时命中
// 注册行与发射点(键值不同名的话, 码字面量就只剩注册表一处, 再也搜不到"谁在用它")。
//
// **两个数都对, 别互相打脸**: audit 口径说"**十九项**门禁", 那是把 `node_gap` / `node_overlap`
// 算作**一项**(一枚硬币的两面: 贴太近 / 重叠, 同一条判据的两个出口); 而 `AUDIT_CODES` 按
// **16 个 code 键**数 —— 门禁清单里的每一项可以发**多于一个码**。`DIAGNOSTIC_CODES` 全长 24
// (audit 16 + cluster 4 + density 4), 即 demo 侧那张覆盖表的规模。
// (260923 追 `owner_ref`: 自由文本的归属引用是**结构校验**不是几何量, 但它同样拦出口
//  —— 幽灵归属会让归属豁免静静失效, 那种"看起来配了豁免"的假安全感比漏报更贵。)
// =====================================================================

/**
 * `audit()` 的码: **十六个键** —— 十五个几何键(`node_gap` / `node_overlap` 是同一判据的两个出口,
 * 门禁清单里算**一项** ⇒ 几何门禁十四项) + 一项结构校验(`owner_ref`)。
 * 十四项 + 组语义四条 = 上面那个"十九项"。
 */
export const AUDIT_CODES = {
  finite_svg: 'finite_svg',
  single_svg: 'single_svg',
  orthogonal_edges: 'orthogonal_edges',
  node_gap: 'node_gap',
  node_overlap: 'node_overlap',
  label_clearance: 'label_clearance',
  text_clearance: 'text_clearance',
  text_overlap: 'text_overlap',
  label_fit: 'label_fit',
  edge_node_clearance: 'edge_node_clearance',
  no_backtrack: 'no_backtrack',
  edge_degenerate: 'edge_degenerate',
  port_crowding: 'port_crowding',
  endpoint_approach: 'endpoint_approach',
  edge_overlap: 'edge_overlap',
  // 结尾追码(不插队): 印刷顺序即注册顺序, 既有码的相对次序别动
  owner_ref: 'owner_ref',
} as const;

/** `clusterAudit()` 的码: 组语义自洽四条(声明与几何的矛盾 → error, 进 fail-closed) */
export const CLUSTER_CODES = {
  cluster_member_outside: 'cluster_member_outside',
  cluster_frame_cross: 'cluster_frame_cross',
  cluster_nesting_contradiction: 'cluster_nesting_contradiction',
  cluster_border_clearance: 'cluster_border_clearance',
} as const;

/** `density()` 的码: 密度与长边三项 + 组框重叠一项(全是 warning, 永不进 fail-closed) */
export const DENSITY_CODES = {
  cluster_corridor: 'cluster_corridor',
  mixed_cluster_row: 'mixed_cluster_row',
  long_edge: 'long_edge',
  cluster_overlap: 'cluster_overlap',
} as const;

export type AuditCode = (typeof AUDIT_CODES)[keyof typeof AUDIT_CODES];
export type ClusterCode = (typeof CLUSTER_CODES)[keyof typeof CLUSTER_CODES];
export type DensityCode = (typeof DENSITY_CODES)[keyof typeof DENSITY_CODES];

/**
 * 三把刀的码合起来 —— 消费方(覆盖表 / 按码分流)遍历它做 ⊆ 校验, 不必知道码归哪把刀。
 * `readonly` 的数组而非集合: 印刷顺序即注册顺序, 报告里逐条列出来是人读的。
 */
export const DIAGNOSTIC_CODES = [
  ...Object.values(AUDIT_CODES),
  ...Object.values(CLUSTER_CODES),
  ...Object.values(DENSITY_CODES),
] as const;

/** 三把刀的码类型并集 —— `Diagnostic.code` 的静态面(见下面的 `DiagnosticCode`) */
export type KnifeCode = (typeof DIAGNOSTIC_CODES)[number];

/**
 * `nudge` 刀与 `scene` 层**暂未常量化**的码 —— 它们的发射点仍写手写字面量。
 *
 * 为什么不一起收编: 那两处不是"门禁"(一个管吸附/对齐, 一个管缓存陈旧), 门的口径与 fail-closed
 * 无关; 本轮只把**门禁三把刀**收成一份来源。但类型上仍登记在这里, 于是它们也吃
 * `Diagnostic.code: DiagnosticCode` 的编译期检查 —— 随手编一个码当场 tsc 红, 不会静默溜进报告。
 */
export type NudgeCode = 'nudge_invalid_rect' | 'nudge_invalid_param' | 'snap_no_targets' | 'distribute_overflow';

/**
 * `assignLanes()` 的码: 只发**走廊装不下**这一条 warning。
 *
 * 与 `nudge` 同类(常量化了, 但**不进** `DIAGNOSTIC_CODES`): 分配器是**旋钮不是门禁** ——
 * 它给的是建议值, 判不判 fail-closed 由 `audit()` 说了算。所以它不参与"三把刀的码"那张表,
 * demo 的覆盖表规模(24)也不因此变。
 */
export const LANE_CODES = {
  /** 带内 N 条边按最小间距铺开需要的跨度 > 公共可行域 —— 铺不开, 必有边被压在同一条腰线上 */
  lane_band_overflow: 'lane_band_overflow',
} as const;

export type LaneCode = (typeof LANE_CODES)[keyof typeof LANE_CODES];
export type SceneCode = 'manual_bounds_protected' | 'node_not_found' | 'scene_hash_missing';

/**
 * **内核认定的门禁码全集** —— 给消费方用: 拿它标注自己的码表(demo 的覆盖表 / 报告按码分流),
 * 拼错一个码 tsc 当场红。
 *
 * 注意 `Diagnostic.code` 本身仍是 `string`(宽度是刻意留的: 消费方常有 `code: string` 的变量在
 * 查表 —— 立项期的取证探针就直接 `codes.includes(code)`, 收窄会把他们全卡住)。所以内核侧对"码写没写错"的
 * 兜底不是类型, 而是 `test/codes-registry.test.ts` 的 ⊆ 判据 + 发射点一律从上面的注册表取。
 */
export type DiagnosticCode = KnifeCode | NudgeCode | SceneCode | LaneCode;
