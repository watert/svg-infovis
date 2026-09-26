// =====================================================================
// knives/thresholds · 门禁与排序共用的尺子(只有数字, 零依赖)
//
// 260926 从 `audit.ts` 底部抽出。route 为了比较 `endpointBitePx < 0.5` 值导入整座门禁,
// 代价层、盒反算、组框穿越各需要同一把尺子。数字放在判决函数旁边, 低层刀就得反向吃 audit。
//
// 不放进 `geometry/predicates`: 净空 / 间距 / 呼吸位是判决档, 不是几何谓词。
// `audit` 再导出同一绑定, 旧路径 `knives/audit` 不变。barrel 不要另写一条 `export *`。
// =====================================================================

export type AuditLevel = 'standard' | 'showcase';

/**
 * 两档严格度只调这三个数, 不新增判据。
 * `labelInset`: 节点内文字两侧的呼吸位。standard 允许字几乎贴边(6px), showcase 要求留白(10px)。
 */
export const THRESHOLDS: Record<AuditLevel, { labelClearance: number; nodeGap: number; labelInset: number }> = {
  standard: { labelClearance: 2, nodeGap: 8, labelInset: 6 },
  showcase: { labelClearance: 4, nodeGap: 12, labelInset: 10 },
};

/**
 * 穿透长度阈值: 半像素以下算擦边(折线起点正好落在盒边上), 不算穿。
 * 穿盒门禁、代价层的穿盒 / 端点擦边、组框穿越, 都读这个数。
 * 各自另写一个 0.5 就会出现「门禁说没穿、排序说穿了」。
 */
export const PIERCE_MIN = 0.5;

/** 端点前的死区: 首/末段短于此值且存在折弯 → 折弯顶在箭头下面。直连边不在此列。 */
export const STUB_MIN = 10;
