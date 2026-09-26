// =====================================================================
// knives/audit · 十九项门禁 + 诊断四元组
//
// audit 是这条路线的**导航仪**, 不是质检员: agent 靠诊断迭代, export 靠它 fail-closed。
// 所以每条诊断必须带 supportedFixes(修法) —— 没有修法的报错等于让 agent 猜, 一轮几千 token。
//
// 门禁清单: ① finite_svg ② single_svg ③ orthogonal_edges ④ label_clearance ⑤ node_gap/overlap
// ⑥ text_clearance ⑦ label_fit ⑧ edge_node_clearance ⑨ no_backtrack
// ⑩ port_crowding ⑪ endpoint_approach ⑫ edge_overlap ⑬ edge_degenerate(260918 第四轮, Mermaid 对账)
// ⑭ text_overlap(260918: 文本与**实体**抢地 —— ④⑥ 都只拿文本与「边」比, 文本压节点盒全绿放行)。
// ⑮-⑱ 组语义自洽四条(260918, 与 archify 对账后落地, 见 `knives/cluster.ts`):
//    cluster_member_outside / cluster_frame_cross / cluster_nesting_contradiction(仅 tree 档) /
//    cluster_border_clearance —— 组框 rect 过去**从不参与任何净空判定**, 是结构性缺口
//    其中两条 ⑪end_band 与 ⑫near_parallel 是**可读性**判断 → warning, 不拦出口(启发式不许 fail-closed);
//    余下(端口拥挤 / 折点顶箭头 / 两条边叠成一条线)是几何事实 → error。
// 另有密度**四项**警示挂在 `knives/density`(启发式, 永不进 fail-closed): 组内空白走廊 / 混组层 /
// 长边, 外加一条组框互叠 `cluster_overlap` —— 别按"密度四项"数。
//
// 码的**单一来源**在 `knives/codes.ts`: 本文件发射的码一律从 `AUDIT_CODES` 取, `Diagnostic.code`
// 的类型面也只认那份注册表 —— 消费方(demo 的覆盖表)遍历 `DIAGNOSTIC_CODES` 即可, 不必手抄。
//
// 出参 `diagnostics` 按 (code, subject.kind, subject.id, message) 稳定排序: 报告与**输入序无关**,
// 才能逐字节 diff。门禁是导航仪, 诊断顺序一变, agent 的"上一条说了什么"就对不上了。
//
// 输入一律是 **scene(结构化几何)**, 不是 SVG 文本: 我们的 path 里含 A 圆弧命令,
// 从裸 SVG 反推点列会解析出垃圾(scout R9 实测)。吃陌生 SVG 是 L 级适配器的活, 不在核心路径。
//
// 两档判分沿用 Archify: standard 宽松(2px) / showcase 严格(4px), 同一份 metrics 两把尺子。
// =====================================================================

import { type Pt, type Rect, clamp, expandRect, rectBottom, rectRight, round1 } from '../geometry/vec';
import {
  isFinitePoint, isFiniteRect, isOrthogonalPolyline, firstBacktrackIndex, selfOverlapIndex,
  orthogonalDeviation, pointRectDistance, polylineCrossings, polylineRectsClearance, rectsOverlap,
  segmentRectIntersectionLength, normalizeRoutePoints, segmentRectClearance, projectedPortsCoincide,
  sameAxisOverlapLength, parallelSegmentGap, segmentAxis, polylineLength, ORTHO_EPS,
} from '../geometry/predicates';
// 组框标签的归属位与渲染共用同一个 labelAnchor: 本文件只读它的产物(见 `groupLabelBox`)
import { groupLabelRect, type GroupLabelPlacement } from '../shapes/group';
import { AUDIT_CODES } from './codes';
import type { Tone, Variant } from '../theme';
// 形状词表与 `nodeShape` 同源(`NODE_SHAPE_KINDS`) —— scene 的形状槽必须是那个词表, 不许各写一份。
// `NODE_TEXT_LAYOUT` 同理(260920 起): 门禁要替作者算"折成 N 行后盒高至少多少", 用的字号 / 行距
// 必须与 `nodeShape` 真画上去的同一份 —— 手抄一个 13 就是第二个会漂的源头。**字重同规矩**:
// `label_fit` 量的字重取节点的 `weight`(缺省 `NODE_TEXT_LAYOUT.weight`), 与渲染同一处取值。
import { NODE_TEXT_LAYOUT, type NodeAlign, type NodeShapeKind } from '../shapes/node';
// 图标是**纯类型依赖**(audit 不读它, 见 `SceneNode.icon` 的说明) —— 只为了让 scene 的那个槽
// 与渲染面共用同一个形状, 不在这里重写一份 `{ asset, size, gap … }`
import type { NodeIcon } from '../shapes/icon';
// 外部素材同理是纯类型依赖(见 `Scene.embeds`)
import type { SceneEmbed } from '../shapes/embed';
// 行块几何(260920): `reflow-label` 的 h 补丁要按"折成 N 行"算盒高 —— 与 nodeShape / nodeFit 同一份公式
import { rowBlock } from '../geometry/text-rows';
import { measureText } from './measure';
import { density } from './density';
import { clusterAudit, type ClusterTier } from './cluster';
// 尺子的定义在 thresholds。这里再导出同一绑定, 本地判据也读这一份
export { type AuditLevel, PIERCE_MIN, STUB_MIN, THRESHOLDS } from './thresholds';
import { type AuditLevel, PIERCE_MIN, STUB_MIN, THRESHOLDS } from './thresholds';

// --- 契约类型 ----------------------------------------------------------

export type SubjectKind = 'scene' | 'node' | 'edge' | 'label' | 'group' | 'text';
export type Severity = 'error' | 'warning' | 'info';

/** 诊断四元组(设计稿 §三: supportedFixes 是这路线的 token 节流阀, 不许砍) */
export type Diagnostic = {
  /**
   * 门禁码 —— 取值面是 `knives/codes.ts` 的注册表, 三把刀发射时一律从那里取(`AUDIT_CODES.xxx`),
   * 判据是 `test/codes-registry.test.ts`: **实际产出的码集合 ⊆ 注册表**。
   *
   * ⚠ 类型**刻意留宽**(`string`): 消费方常有 `code: string` 的变量在查表(立项期那份簇成员
   * 归属探针就是 `codes.includes(code)`), 收窄成 `DiagnosticCode`
   * 会把它们全卡在编译期。想让自己的码表吃编译期检查的一方, 用导出类型 `DiagnosticCode` 标注它。
   */
  code: string;
  severity: Severity;
  message: string;
  subject: { kind: SubjectKind; id: string };
  /** 证据只放可 JSON 化的原始值(数值 / 字符串 / 它们的数组), 保证诊断能逐字节 diff */
  evidence: Record<string, number | string | Array<number | string>>;
  supportedFixes: Array<{ kind: string; hint: string; patch?: Record<string, unknown> }>;
};

export type SceneNode = {
  id: string;
  rect: Rect;
  /** 主标签(可含 `\n`: 逐行照画 —— 宽按最长行算、高按行数给, 三处同源) */
  label?: string;
  /**
   * 次标签(小两号、更淡, 主标签行块下方, **同样支持 `\n`**)。**进 scene 才能被 `label_fit` 审到** ——
   * 与 `texts` / `group.labelRect` 同一条教训: 看不见的东西没法审。
   *
   * ⚠ 盒高这一侧没有门禁(`label_fit` 只判宽): 盒一律走 `nodeFit` 反算, 别手写 rect。
   */
  sub?: string;
  /** 主标签字号(缺省 13, 必须与 `nodeShape` 的缺省同源, 否则门禁量的是另一个盒子) */
  fontSize?: number;
  radius?: number;
  /**
   * 节点肤色 —— **语义位, 不是样式参数**(260918 进 scene)。
   *
   * 判据: 参照实现的设计是"组件 schema 里**零样式词汇**, 颜色由节点 `type` 推出";
   * core 没有 `type`, **`tone` 就是那个语义位的替身**(类型 → 肤色), 所以它该跟几何一起进 scene
   * —— 与"scene 自解释"一致。样式参数(字号 / 圆角 / 单点 fill·stroke)继续留在调用方的覆盖表。
   *
   * 为什么必须进 (`作者写了却不上屏` 同族第四次): 过去 `tone` 只能靠 `ExportOptions.nodeStyles`
   * 逐 id 注入, 于是**作者在数据表里写的 tone 是死数据** —— archify 复刻实测两张 SVG 只有 7 个色值、
   * 全是 slate 灰阶, 一处 emerald / amber / rose / violet / teal 都没有; 连带 `NOTES §7.1`
   * "7 槽 tone 跟 archify type 一一对应"这个对齐点在产物层面是假的。
   *
   * 不进审计: 颜色不是几何事实(决策 14) —— 这里**不加任何门禁**, tone 只被渲染面读。
   */
  tone?: Tone;
  /**
   * 描边(`outline`, 缺省)还是实色底(`solid`)。**与 tone 同属那个语义位**:
   * 主题约定里 `solid` 只用来表达强调, 而"这一格是强调"是作者的**语义声明**(参照实现里就是
   * 另一种组件 type), 不是事后调色 —— 半个语义位留在覆盖表里, 只会让"哪一格该抢眼"重新变成
   * 一处看不见的决策。所以它跟 `tone` 一起进 scene, 由作者在 scene 里点。
   */
  variant?: Variant;
  /**
   * 节点**形状**: `rect` 圆角矩形(缺省) / `diamond` 菱形(判定) / `cylinder` 圆柱(数据存储)。
   * 与 `tone` / `variant` 同属那个**语义槽**(这一格在图上是什么角色) —— 三种形态的几何 bbox
   * 恒等于 `rect`, 但"我是菱形"这件事推不出来, 只能由作者点。
   *
   * 为什么必须进 scene(260919, "作者写了却不上屏"同族第五次): 形状过去只能靠
   * `ExportOptions.nodeStyles[id].shape` 进图, 于是复刻图那类"在数据表里声明形状"的写法里,
   * 菱形 / 圆柱是**死数据** —— 与 `tone` 当年一模一样。覆盖表仍是逐 id 逃生口(优先级更高)。
   * 不进审计: 形状是语义不是几何事实(决策 14), 这里不加门禁, 只被渲染面读。
   */
  shape?: NodeShapeKind;
  /**
   * 整节点淡化(0~1)。**语义槽**(260919): ghost 处理("这格已废弃")的一半, 与 `struck` 配套。
   * 与 `tone` / `variant` 同族进 scene, 不进审计(不是几何事实), 只被渲染面读。
   */
  opacity?: number;
  /**
   * 废除叉(红 X 压盒)。**语义槽**(260919): "这格被废除"是图在说什么 —— 与 `tone` 同族,
   * 进 scene 由出口统一渲染(裸装饰函数没有合法注入点: `sceneChildren` 是渲染面唯一映射)。
   * 不进审计: 叉是装饰线, 故意压在节点身上, 净空门禁不该管它。
   */
  struck?: boolean;
  /**
   * **主标签的字重**(缺省 `NODE_TEXT_LAYOUT.weight` = 600 标题档)。
   *
   * 为什么进 scene: 「这一格是标题还是正文」是**语义**, 而它同时是一个**几何量** ——
   * 400 与 600 的估算宽差 3%, 于是 `label_fit` 量宽、`nodeFit` / `cardFit` 算盒、`nodeShape`
   * 画字三方必须读同一个数。作者不写 = 老行为(600), 既有 scene 一个字节不变。
   */
  weight?: number;
  /**
   * **标签的水平对齐**(缺省 `center` 居中; `start` = 左对齐)。**排版语义槽**, 与 `tone` 同族。
   *
   * 存在理由(260920 卡片): "Object Type: Airport / Object: JFK / Properties: ..." 这类
   * 逐行说明块必须**左对齐**(居中会让每行的起点参差, 而说明文字是按行读的)。
   * ⚠ 它**不是纯样式**: 左对齐时文字起点是 `rect.x + padX`, 而 `label_fit` 判的是
   * "文字宽 > 盒宽 − 2 × 该档呼吸位" —— 两边的内边距必须是同一个数, 由出口按档位填
   * (`ExportOptions.level` 只有出口知道, 几何层不预扣呼吸位)。
   */
  align?: NodeAlign;
  /**
   * **图标**(画在盒正上方的素材)。**语义槽**: "这一格是什么东西"的视觉替身 —— 与 `tone` 同族。
   * 进 scene 的是解析好的原语表(`iconAsset(name)` 的产物), 于是**渲染路径不读盘**:
   * 只要 scene 在, 换台机器 / 换运行时也出同一张图。
   *
   * 不进审计: 它是压在版式上的墨迹(同 `struck` 叉线 / 网格底纹那一档), 不是参与排版的对象。
   * 想让图标与别的格子保持距离, 用 `cardFit` 反算的 `block` 留位 —— 那是作者决策。
   * (这条缺口登记在 `ROADMAP.md`「后续方向」: 图标目前只进 `contentBounds`, 不进任何净空判据。)
   */
  icon?: NodeIcon;
};
/**
 * 边。`tone` 是**语义槽**(这条边属于哪一族: 主干 / 可选步骤 / 异常回流), 与 `SceneNode.tone`
 * 同一口径 —— 渲染面读 scene, `edgeStyles[id].tone` 是逐 id 逃生口(显式给了值才顶掉)。
 * 取色槽(为什么落 outline 描边槽)见 `edgeShape`。
 */
export type SceneEdge = {
  id: string;
  points: Pt[];
  from?: string;
  to?: string;
  label?: string;
  tone?: Tone;
  /**
   * **纯视觉基准线豁免**(260920): 这条边不是"关系", 而是版式基准线(泳道线 / 坐标系轴线 /
   * 扫描线那一类)—— 贯穿全图、撞上节点是它的常态, 用途就是当背景。
   *
   * 命名与语义都随 `SceneGroup.noCheck`(同一天落地, 同一套话语体系: tsconfig `noCheck` /
   * eslint disable)—— **不是"别审我", 是"这一位不属于那条判据的适用面"**。
   *
   * **豁免面必须最小, 且要说清为什么**(照抄 group 那条纪律, 否则就成了"一开全关"的滑坡):
   *   · 跳 **`edge_node_clearance`**(穿盒)—— 基准线被自己的装饰覆盖是常态而非事故
   *     (活体: 序列图的激活条骑在泳道线上, 条是不透明填充, 那截"线在盒内"图上根本看不见)
   *   · 其余**一律照旧**: 正交 / 折回 / 自重叠 / 端点贴盒 / 端口拥挤 / 共线重叠 —— 一条基准线
   *     同样该正交、同样不该叠自己; 这些判据与"它是不是关系边"无关
   *   · 可读性判定(`label_clearance` / `text_clearance` / `text_overlap`)**也不让步** ——
   *     标签压着泳道线照样报(视觉分区不豁免可读性, 与 group 那条一字不差)
   *
   * ⚠ 豁免加在**边**上, 不加在装饰物(节点)上, 这是刻意的: 若改成"给激活条开豁免",
   * 连带会放过"跨列消息横穿中间泳道的激活条"—— 那才是真事故(线横在色条上)。加在泳道线上,
   * 恰好只豁免"泳道线穿过自己的装饰"这一点。
   */
  noCheck?: boolean;
};
/**
 * 标签 = **几何 + 文字**。两个字段各有分工:
 * · `at`/`width`/`height`: 审计用的检测矩形(同时也是上屏遮罩片的矩形 —— 同一份数字, 不许各算一遍)
 * · `text`: 要画的文字。**缺省不上屏** —— 只给位置的 label 是"占位"(几何上存在、图上没有),
 *   数量统计在 `metrics.phantom_labels` 里; 不要让它静默地只活在审计里
 */
export type SceneLabel = {
  id: string; at: Pt; width: number; height: number; ownerEdge?: string; text?: string; fontSize?: number;
  /**
   * **绕 `at` 旋转的角度**(度, 屏幕顺时针为正; 缺省 0 = 不旋转)。
   *
   * 存在理由(260920 ontology 图): 边标签沿着**自己的那条线**排 —— 竖线旁的 "Flown By" 得竖着读,
   * 斜线旁的 "Hub For" 得斜着读。这是"这段文字属于哪条边"的排版表达, 不是装饰。
   *
   * 口径(审计与渲染共用 `labelRect`): 检测矩形取**旋转后矩形的轴对齐包围盒**
   * (`w|cos| + h|sin|` × `w|sin| + h|cos|`, 中心仍是 `at`)。90° 的整数倍下它是**精确**的
   * (宽高互换); 其它角度下它是**保守**的(比真墨迹大, 门禁宁可多报不放过)。
   * 这条必须写在这里: 门禁只认轴对齐矩形, 若还拿未旋转的 w×h 去量, 一条 45° 的标签
   * 会以"很窄"的身份通过所有净空判定 —— 而它斜着占的位置是两倍大。
   */
  rotate?: number;
  /**
   * 标签**肤色**(语义槽, 与 `SceneNode.tone` / `SceneEdge.tone` 同一口径): 这块标签属于哪一族,
   * 字色就跟着哪一族走 —— 出口取 `tones[tone].text`(**文字槽**, 不是边线用的 border 槽:
   * 线是描边、字是填充, 各吃各槽; 浅色系的 border 当字色看不清)。
   *
   * 缺省不写 = 中立标签, 字色回落 `theme.label`。它由 `edgeLabel()` **构建期烘进来**
   * (边有 tone 则标签继承), 渲染期不回头去 join `scene.edges`。
   */
  tone?: Tone;
  /** 遮罩底色的**显式覆盖**(缺省不写 ⇒ 出口用 `theme.canvas`, 遮罩与画布同色即隐形) */
  bg?: string;
  /** 文字色的**显式覆盖**(优先级高于 `tone`, 缺省不写 ⇒ 出口按 `tone` → `theme.label` 取值) */
  color?: string;
};
/**
 * 自由文本块(旁注 / 组框说明这类**不属于任何节点标签**的说明文字)。
 * `rect` 是文本**实际占据的包围盒**(渲染就居中于它, 不另算位置) —— core 不猜文本尺寸;
 * 宽度走 `measureText` 估算或量框实测。`anchor` 只管水平对齐(垂直一律居中):
 * 左对齐(`start`)的包围盒左端就是文字左端。`text` 缺省不上屏, 计入 `metrics.phantom_texts`。
 */
export type SceneText = {
  id: string; rect: Rect; text?: string; fontSize?: number;
  anchor?: 'start' | 'middle' | 'end';
  /**
   * 字重(缺省 400)。**排版语义**(260919): "这是标题/这是警示注" —— 与 `fontSize` 同族,
   * 进 scene; 度量(`measureText`)与渲染必须同源, 否则 label_fit 量的是另一个宽度的字。
   */
  weight?: number;
  /** 文字色(缺省 `theme.label`)。同族语义: 红字警示注 / 强调标题这类"这段话什么角色" */
  color?: string;
  /**
   * **归属位**(260923): 这段自由文本在图上**属于谁**。
   *
   * 与 `SceneLabel.ownerEdge` 完全对位 —— owner 只做两件事: **声明归属** + **收窄豁免面**;
   * **不做落位**(位置仍由构建期算好写进 `rect`, 这是"决策在作者的数据里"那条边界)。
   * 不做自动落位 / 不做 owner 继承: 要动位置就动 `rect`。
   *
   * 唯一豁免面: `text_clearance` 里**命中 owner 的那一条边**(组 / 节点不豁免任何东西 ——
   * 压在它们的框线上算不算事故还没定, 别提前给空位)。压在节点盒上照旧报 `text_overlap`。
   *
   * ⚠ 引用必须真实存在: 幽灵归属(deleted 的边还留着 owner)会让豁免静静失效 ——
   * 由 `owner_ref` 门禁拦下(它就是这么一条: 结构校验, error 级, 拦出口)。
   */
  owner?: SceneOwner;
};
/** `SceneText.owner` 的取值 —— 指向本 scene 里的一个对象(引用, 不是内联几何) */
export type SceneOwner = { kind: 'node' | 'edge' | 'group'; id: string };
/** owner 的词表(运行时值): 类型由它推出, 写错的 kind 由 `owner_ref` 当场报, 不静默当"没有归属" */
export const SCENE_OWNER_KINDS = ['node', 'edge', 'group'] as const;
/**
 * `SceneText` 的**渲染缺省** —— 缺省跟类型住一起, 只此一份。
 *
 * 谁读它: `export.ts`(真画字时的 `t.fontSize ?? …`)与 `knives/fit.ts` 的 `textFit`(构建期反算盒)。
 * 各写一份字面量 = "盒子按一个字号算, 字按另一个字号画", 正是本仓最贵的那类事故
 * (同族: `NODE_TEXT_LAYOUT` 被三处共读)。
 */
export const SCENE_TEXT_DEFAULTS = { fontSize: 11 } as const;
/** 框的来源: `'members'`(缺省, 派生量) / `'declared'`(作者声明的 frame) */
export type FrameSource = 'members' | 'declared';

export type SceneGroup = {
  id: string; rect: Rect; label?: string;
  /**
   * 标签的包围盒。**有它才有净空保护** —— 只给 label 字符串时 audit 算不出它在哪,
   * 于是就看不到它(组框标题就是这么漏的)。
   *
   * 两种给法(缺省行为与过去一字不差):
   * · **不声明** `labelPlacement` / `labelInset` → 这里就是作者手写的值(`groupLabelRect()` 生成, 别手估)
   * · **声明了**归属位 → 本字段由 core 从同一个 `labelAnchor` 派生(`groupLabelBox`), 手写值不占优
   */
  labelRect?: Rect;
  /**
   * 框的来源声明 —— 「框由作者定」是**第三种表达**, 与 `contains`(成员声明) / `clusterTier`(语义档)并列:
   * · 不写 / `'members'`: 框是**派生量** —— `deriveGroupRect` / `fitGroupFrames` 按成员并集 + pad 重算
   * · `'declared'`: 框是**作者声明的 frame**(泳道横铺全宽 / region 到 x = N 为止), `rect` 就是框本身,
   *   派生一律跳过 —— 作者给的值不许被成员并集覆盖
   *
   * **为什么只声明来源、不再给一个 Rect**: 框的位置本就只该有一份(`rect`), 这里声明的是"这份 rect
   * 谁说了算" —— 与 `SceneNode.bounds_source` 同一手法。再给第二个 Rect 就是第二个几何真相,
   * 而"同一个东西算两遍"正是本仓最贵的那类事故(NaN 静默丢元素 / fit 与审计不同源 / 组框标签双源)。
   *
   * **为什么必须有这一位**: archify 复刻实测量出 15 条 `cluster_border_clearance`, 其中 12 条是
   * 节点距泳道框线**恰好 18px** —— 那不是作者摆错, 而是**成员派生框的几何必然**(成员并集 + pad
   * 派出来的框, 成员必然贴框线)。archify 的泳道是**横跨画布的一等公民**, 成员的并集从来不是它。
   * 这里缺的不是阈值, 是表达。
   */
  frame?: FrameSource;
  /** 组框标签字号(缺省 12)。进 scene 才谈得上同源: 渲染与审计的标签盒都要用它 */
  fontSize?: number;
  /**
   * 组框肤色(语义位, 与 `SceneNode.tone` 同一口径; `groupShape` 本就吃这个参数)。
   * 组框的"哪一层/哪一类区域"同样是类型语义 —— 不写就是 slate 中性。
   */
  tone?: Tone;
  /**
   * 组框标签的**归属位**: `inner`(缺省, 框内左上; Archify 观感) / `outer`(框上方外侧, 组内被折线占满时用)。
   * 声明了它(或 `labelInset`)之后, `labelRect` 由 core 用 `groupLabelRect` **派生** —— 作者只写一次
   * placement, 审计(`textBlocks` 读到的那份矩形)与渲染(`groupShape` 按同一 placement 落位)从此同源。
   *
   * **为什么这条字段是结构修**(同族第四次): 过去 `labelPlacement` 只有 `groupShape` 认, `SceneGroup`
   * 上没有它 —— 作者只能自己调 `groupLabelRect({ labelPlacement: 'outer' })` 手算 `labelRect` 塞进 scene
   * (审计面), 而渲染走 `groupShape` 的缺省 `inner`(渲染面), 出口从不读 `labelRect`。结果: 审计在为
   * **没画出来的那个框**判定, 真画出来的那个框没人审(复刻图实测 `text_overlap` ×2 + `text_clearance` ×1
   * 全是幽灵)。判据见决策 16: **渲染面必须是 scene 的满射**。
   */
  labelPlacement?: GroupLabelPlacement;
  /** 标签位移(相对框左上角); 与 `groupShape` 的 `labelInset` 同一语义、同一缺省(inner `[14,18]` / outer `[0,-12]`)。同样触发 labelRect 派生 */
  labelInset?: [number, number];
  /**
   * **成员声明**(membership 声明制, 260918): 这个框装了谁 —— 节点 id 或**子框 id** 都行
   * (「子框整个跑到父框外」就是靠后者抓到的)。
   *
   * 两种写法语义**不同**, 别混:
   * · `contains: [...]` —— 作者声明。audit 拿它跟几何对账(成员在不在框里 / 框交不交叉),
   *   `density` 的度量也以它为准
   * · 不写 —— 没有声明。四条组自洽门禁**一概不管**(没有声明就没有"声明与几何的矛盾"可谈);
   *   `density` 的启发式回落"几何包含反推", 差集由 `metrics.undeclared_groups` 暴露
   *
   * 归属是**决策**, 权威在 HTML; 这里声明只是把它带进场景好让门禁审得到。
   */
  contains?: string[];
  /**
   * 纯视觉分区豁免(260920, 命名随 tsconfig `noCheck` / eslint disable 的话语体系):
   * band / region 这类**纯版式框** —— archify 的 phase 分隔带是活体案例 —— 框线被泳道线
   * 横穿是它的常态, 而「框 = 这些属于一伙」的语义判读对它不成立。置位后:
   *   · 四条组自洽门禁**整体跳过**(它不进 cluster 度量, `undeclared_groups` 也不计)
   *   · density 启发式不管它(空框走廊 / 混组层都是对"分组"说的话)
   *   · `text_overlap` 里它的框线**不再是文本的障碍**(标签压 band 边线是合法构图)
   * 仍然生效的: `single_svg`(它也在画布内) 与它**标签**的 `text_clearance`(文字压线照样报 ——
   * 视觉分区不豁免可读性)。**别写 `contains`**: 声明了成员却不审, 差集不可见, 违反纪律 8。
   */
  noCheck?: boolean;
};
export type Scene = {
  width: number; height: number;
  nodes: SceneNode[];
  edges: SceneEdge[];
  labels?: SceneLabel[];
  groups?: SceneGroup[];
  /**
   * 旁注类自由文本。**过去它们不进 scene, 于是 audit 物理上看不见** ——
   * 260917 实测: 架构图的折线从组框标题身上穿过去, 全部门禁照样 pass。
   * 看不到的东西没法审, 所以文本块必须先成为 scene 的第一类元素。
   */
  texts?: SceneText[];
  /**
   * **外部素材**(260920): 整幅别人画的画 —— echarts 出的图表这种"这一格的数据"。
   * 与 `SceneNode.icon` 同族(一次"素材上屏"的声明), 素材在构建期已由 `embedAsset()` 收拾干净,
   * 渲染路径不读盘不解析 SVG。
   *
   * **明确不加任何门禁**: 素材是压在版式上的墨迹(同图标 / 网格底纹 / `struck` 叉线那一档),
   * 不是参与排版的对象。它只进 `contentBounds`(auto-fit 不裁素材)与 `single_svg`(画布装不下
   * 照样是事实 —— 那一档本来就在逐集合枚举, 见 `checkSingleCanvas`)。
   * "边 / 标签压在图表上"这条缺口登记在 `ROADMAP.md`「后续方向」, 要收口得先按纪律 9 举证 + 纪律 11 给旋钮。
   */
  embeds?: SceneEmbed[];
  /**
   * 组语义档(默认 `'set'`)。**显式选**: `set` = 平铺集合(允许共享成员 / 正交 scope 交叉),
   * `tree` = opt-in 的层级 ownership(额外启用 `cluster_nesting_contradiction`)。
   * `audit` 的选项可临时覆盖它。
   */
  clusterTier?: ClusterTier;
};

export type AuditReport = {
  level: AuditLevel;
  pass: boolean;
  /** 一律给出的量化指标(诊断之外的"看起来没事但也有数") */
  metrics: Record<string, number>;
  diagnostics: Diagnostic[];
};

/**
 * label 的遮罩矩形(Archify 的 c-mask 就是检测矩形本身)。
 *
 * 旋转(`SceneLabel.rotate`)时返回**旋转后矩形的轴对齐包围盒**(中心不变) —— 门禁只认轴对齐矩形,
 * 而渲染面画的正是那块旋转的遮罩片。90° 整数倍下这就是它的真矩形(宽高互换), 其它角度下是它的
 * 外接矩形(保守: 门禁宁可多报)。**渲染面读同一个函数** —— 两边算的必须是同一块地方。
 */
export const labelRect = (l: SceneLabel): Rect => {
  const a = ((l.rotate ?? 0) * Math.PI) / 180;
  if (!a) return { x: l.at.x - l.width / 2, y: l.at.y - l.height / 2, w: l.width, h: l.height };
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  // round1 收口: 90° / 180° 这类角度的 cos/sin 是 6e-17 级的浮点噪声, 不收口会让 evidence 里
  // 冒出 `30.000000000000004` 这种"看着像算错了"的数
  const w = round1(l.width * c + l.height * s);
  const h = round1(l.width * s + l.height * c);
  return { x: round1(l.at.x - w / 2), y: round1(l.at.y - h / 2), w, h };
};

/** 一块要被审计查净空的文本 */
export type TextBlock = { id: string; rect: Rect; content?: string };

/**
 * 组框标签在 scene 里的**归属位** —— 审计要量的那个矩形, 也是渲染要画的那个位置。
 *
 * · 声明了 `labelPlacement` / `labelInset` → 现算: 走 `groupLabelRect`(与 `groupShape` 共用同一个
 *   `labelAnchor`)。**这是杀双源的那一刀** —— 作者只写一次 placement, 三方(作者 / 审计 / 渲染)
 *   读同一个函数, 逐像素同源。
 * · 没声明 → 用作者手写的 `labelRect`(手工算框的路径仍在, 缺省行为一字不改)。
 *
 * 四条退化保护(audit 是导航仪, 坏输入该由 `finite_svg` 去报, 不在这里抛异常):
 * 框 rect / `fontSize` / `labelInset` 任一不是有限数时**回落手写值**, 而不是让 `guard` 把整份审计炸掉。
 * `fontSize` 那条是 260919 补的: 它过去只管 rect 与 inset, 于是 `fontSize: NaN` 一路走到
 * `groupLabelRect` 的 `assertFiniteNumber` —— 门禁变报错, 恰好违反本函数自己写下的那句承诺。
 * 现在两头都焊上了: 这里退化(直接调用方不受惊), 门禁那边由 `finite_svg` 点名(`SceneGroup.fontSize`
 * 进了检查面) —— **不抛 ≠ 不报**, 病灶仍由源头门禁喊出来。
 */
export function groupLabelBox(g: SceneGroup): Rect | undefined {
  if (g.labelPlacement === undefined && g.labelInset === undefined) return g.labelRect;
  if (!g.label || !isFiniteRect(g.rect)) return g.labelRect;
  if (g.fontSize !== undefined && !Number.isFinite(g.fontSize)) return g.labelRect;
  if (g.labelInset && !g.labelInset.every((n) => Number.isFinite(n))) return g.labelRect;
  return groupLabelRect({
    ...g.rect, label: g.label, fontSize: g.fontSize,
    labelPlacement: g.labelPlacement, labelInset: g.labelInset,
  }) ?? undefined;
}

/**
 * scene 里所有**有位置**的文本块: 旁注(texts) + 分组标题(见 `groupLabelBox`)。
 * 没有位置的文本不算 —— 那不是"干净", 是"看不见": audit 只能声明它漏了什么, 不能假装它没问题。
 */
export const textBlocks = (s: Scene): TextBlock[] => [
  ...(s.texts ?? []).map((t) => ({ id: t.id, rect: t.rect, content: t.text })),
  ...(s.groups ?? []).flatMap((g) => {
    const box = groupLabelBox(g);
    return box ? [{ id: groupLabelId(g.id), rect: box, content: g.label }] : [];
  }),
];

/** 组框标题在文本块里的 id 形态 —— **一处定义**(过去有三处各写一遍 `group-label:` 前缀) */
export const groupLabelId = (groupId: string): string => `group-label:${groupId}`;

/** `group-label:<gid>` → 那个组。修法要按"标题矩形是不是派生的"分流, 就得拿回组对象 */
const groupLabelIndex = (s: Scene): Map<string, SceneGroup> =>
  new Map((s.groups ?? []).map((g) => [groupLabelId(g.id), g]));

/**
 * 组框标题的矩形是不是**派生**的 —— 判据就是 `groupLabelBox` 里分流那一行的条件
 * (声明了 `labelPlacement` / `labelInset` 即派生)。
 *
 * 这一位决定"坐标对作者有没有用", 所以修法必须按它分流:
 *   · **派生** ⇒ 出口读的是 placement, 手改矩形不上屏 ⇒ 给坐标 = 指错门
 *   · **没声明** ⇒ 矩形就是作者手写的 `labelRect`(手工算框这条路仍在) ⇒ 坐标直接可抄
 * 两处 `move-text` 都按它分流, 免得同一件事在两个调用点给出相反的答案 —— 那就是双源。
 */
const groupLabelDerived = (g: SceneGroup): boolean =>
  g.labelPlacement !== undefined || g.labelInset !== undefined;

/**
 * 有位置、没内容的文本块 —— 它们**不上屏, 却仍在参与净空审计**(幽灵)。
 *
 * 为什么不报诊断: 只给位置的 label 可以是作者有意留的"净空占位"(先占住位置再定文案),
 * 把合法排版判成错与 density 三项同一立场。但它必须**可见** —— 计数进 metrics。
 * 260917 同族三次事故( NaN 静默丢元素 / fit 与审计不同源 / labels·texts 不上屏)
 * 的病根都是同一件事: **审计面与渲染面的差集静默存在**。
 */
export const phantomCount = (s: Scene): number => (s.labels ?? []).filter((l) => l.text === undefined).length;
export const phantomTextCount = (s: Scene): number => (s.texts ?? []).filter((t) => t.text === undefined).length;

/**
 * 画布容差。取 1 而不是 0.5: 描边是**居中描边**(`strokeWidth` 1.5 → 向外扩 0.75),
 * 元素恰好贴边时 (x + w == width) 外扩那半条已经在画布外 —— 0.5 的容差盖不住它。
 */
const CANVAS_EPS = 1;

const inCanvas = (r: Rect, s: Scene, eps = CANVAS_EPS): boolean =>
  r.x >= -eps && r.y >= -eps && rectRight(r) <= s.width + eps && rectBottom(r) <= s.height + eps;

// --- 门禁 ① finite_svg: 坐标必须全是有限数 -----------------------------

/** 声明式数值字段: `undefined` = 没写(走缺省, 不算错), 写了就必须是有限数 */
const maybeFinite = (v: number | undefined): boolean => v === undefined || Number.isFinite(v);

/**
 * `labelInset` 这类定长数值对: 没写走缺省; 写了就逐项查, 顺带查元数 ——
 * 少一项会让下游 `const [ix, iy] = ...` 解构出 undefined, 那是另一场抛异常。
 */
const maybeFinitePair = (v: readonly number[] | undefined): boolean =>
  v === undefined || (Array.isArray(v) && v.length === 2 && v.every((n) => Number.isFinite(n)));

/**
 * **检查面 = scene 里所有"决定几何或文字盒的数值字段"**, 不只是坐标。
 *
 * 为什么把可选字段也收进来(260919): 只查坐标时, 一个坏数的下场会分裂成三种, 每一种都比
 * 直接报出来难查 ——
 *   · `SceneLabel.height` 漏检 → `single_svg` 拿 NaN 比较(恒假) 误报"越出画布", 而
 *     `label_clearance` 退化成"净空判不了"的 null 档: **病根被两处歪打正着地遮住**;
 *   · `SceneGroup.fontSize` 漏检 → `groupLabelRect` 的 `assertFiniteNumber` 当场抛 ShapeInputError,
 *     audit 从"返回诊断"变成"报错"(文件头把这条列为最致命的病: 门禁变报错 = fail-closed 破产);
 *   · `SceneNode.fontSize` 漏检 → `label_fit` 拿 NaN 算出"超过可用宽 NaNpx"的垃圾诊断。
 * 三副面孔同一个病根: 门禁只看了**一部分**数。所以口径收成一句人话 —— 作者写进 scene 的每个数
 * 都该是有限数, 不有限就在这道门上一次点清; 后面那些门禁再也不用各自将就坏输入。
 */
function checkFinite(s: Scene): Diagnostic[] {
  const bad: string[] = [];
  if (!Number.isFinite(s.width) || !Number.isFinite(s.height)) bad.push('scene:canvas');
  for (const n of s.nodes) if (!isFiniteRect(n.rect) || !maybeFinite(n.fontSize) || !maybeFinite(n.radius)) bad.push(`node:${n.id}`);
  for (const e of s.edges) if (!e.points.every(isFinitePoint)) bad.push(`edge:${e.id}`);
  for (const g of s.groups ?? []) if (!isFiniteRect(g.rect) || !maybeFinite(g.fontSize)) bad.push(`group:${g.id}`);
  for (const l of s.labels ?? []) {
    if (!isFinitePoint(l.at) || !Number.isFinite(l.width) || !Number.isFinite(l.height) || !maybeFinite(l.fontSize)) bad.push(`label:${l.id}`);
  }
  for (const t of s.texts ?? []) if (!isFiniteRect(t.rect) || !maybeFinite(t.fontSize)) bad.push(`text:${t.id}`);
  for (const g of s.groups ?? []) {
    if ((g.labelRect && !isFiniteRect(g.labelRect)) || !maybeFinitePair(g.labelInset)) bad.push(`group-label:${g.id}`);
  }
  if (!bad.length) return [];
  return [{
    code: AUDIT_CODES.finite_svg,
    severity: 'error',
    message: `${bad.length} 处数值不是有限数 —— 序列化会写出 NaN, 产物当场报废`,
    subject: { kind: 'scene', id: bad[0] },
    evidence: { offenders: bad },
    supportedFixes: [
      { kind: 'fix-source', hint: '定位这些 id 的数值来源: 多为除法/插值遇到空值; rect 之外的 fontSize / radius / height 这类可选字段同样要查' },
      { kind: 'assert-upstream', hint: '在上游(量框写回 / route 输出 / 文字度量)加 isFinitePoint / assertFiniteNumber 守卫, 让坏值在入口就暴露' },
    ],
  }];
}

// --- 门禁 ② single_svg: 所有几何落在同一张画布坐标系里 -----------------

function checkSingleCanvas(s: Scene): Diagnostic[] {
  const out: string[] = [];
  for (const n of s.nodes) if (!inCanvas(n.rect, s)) out.push(`node:${n.id}`);
  for (const g of s.groups ?? []) if (!inCanvas(g.rect, s)) out.push(`group:${g.id}`);
  // labels 与 texts 的包围盒过去没查(现成的 labelRect 一直没被用上) —— 它们同样会被裁
  for (const l of s.labels ?? []) if (!inCanvas(labelRect(l), s)) out.push(`label:${l.id}`);
  for (const t of s.texts ?? []) if (!inCanvas(t.rect, s)) out.push(`text:${t.id}`);
  // 外部素材也是画布内的元素: 它没有"越界也照样画出来"的特权(见 `Scene.embeds`)
  for (const b of s.embeds ?? []) if (!inCanvas(b.rect, s)) out.push(`embed:${b.id}`);
  for (const b of textBlocks(s)) if (b.id.startsWith('group-label') && !inCanvas(b.rect, s)) out.push(b.id);
  for (const e of s.edges) {
    if (e.points.some((p) => p.x < -0.5 || p.y < -0.5 || p.x > s.width + 0.5 || p.y > s.height + 0.5)) out.push(`edge:${e.id}`);
  }
  if (!out.length) return [];
  return [{
    code: AUDIT_CODES.single_svg,
    severity: 'error',
    message: `${out.length} 个元素越出画布(viewBox 装不下) —— 产物会被裁切或隐式缩放`,
    subject: { kind: 'scene', id: out[0] },
    evidence: { canvas: [s.width, s.height], offenders: out },
    supportedFixes: [
      { kind: 'grow-canvas', hint: `把 viewBox 放大到覆盖全部元素(当前 ${s.width}x${s.height})` },
      { kind: 'shift-scene', hint: '整体平移, 让最小 x/y 归到 0 附近, 再等比放大画布' },
    ],
  }];
}

// --- 门禁 ③ orthogonal_edges: 折线全程正交(无条件硬失败) ---------------

function checkOrthogonal(s: Scene): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const e of s.edges) {
    // 非有限折点交给 finite_svg 报 —— 在这里算偏离只会得到 NaN 与无意义的修法提示
    // (曾经缺这道守卫: orthogonalDeviation(NaN) 让 indexOf 返回 -1, 随后 points[-1].x 直接抛错)
    if (!e.points.every(isFinitePoint) || e.points.length < 2) continue;
    if (isOrthogonalPolyline(e.points)) continue;
    const devs = e.points.slice(1).map((p, i) => orthogonalDeviation(e.points[i], p));
    // 显式求最大值下标: 不用 indexOf(它在 NaN 上会回 -1, 是上面那次崩溃的帮凶)
    let worst = -Infinity;
    let at = 0;
    devs.forEach((v, i) => { if (Number.isFinite(v) && v > worst) { worst = v; at = i; } });
    if (!Number.isFinite(worst)) continue;
    // 坐标**算进 patch**(260920): 过去这两个数只活在 hint 字符串里, 机器读不到 ——
    // 自动修复与前端面板都只能再解析一遍文案。
    //
    // 候选的生成比"把末点吸到前点的 x 或 y"多两道: ① 段的**两端各试一遍**
    // (折点贴哪边都能修); ② 落位后**整条折线必须仍然全程正交** —— 只修这一段而把邻段
    // 弄歪的候选必须扔掉, 否则标题写着"照它改就行", 改完门禁照旧红。
    // 落位后过 `normalizeRoutePoints` 再判: 与门禁其余部分同一套归一化口径(共线中点会被吃掉)。
    const snaps: Array<{ side: string; at: [number, number]; move: number; pointIndex: number }> = [];
    for (const idx of [at, at + 1]) {
      const self = e.points[idx];
      const other = e.points[idx === at ? at + 1 : at];
      const tries: Array<{ side: string; to: Pt }> = [
        { side: 'vertical', to: { x: other.x, y: self.y } },
        { side: 'horizontal', to: { x: self.x, y: other.y } },
      ];
      for (const t of tries) {
        const next = e.points.map((q, i) => (i === idx ? t.to : q));
        if (!isOrthogonalPolyline(normalizeRoutePoints(next))) continue;
        snaps.push({
          side: t.side,
          at: [t.to.x, t.to.y],
          move: round1(Math.hypot(t.to.x - self.x, t.to.y - self.y)),
          pointIndex: idx,
        });
      }
    }
    snaps.sort((p, q) => p.move - q.move || p.pointIndex - q.pointIndex || (p.side < q.side ? -1 : p.side > q.side ? 1 : 0));
    const best = snaps[0];
    out.push({
      code: AUDIT_CODES.orthogonal_edges,
      severity: 'error',
      message: `边 ${e.id} 第 ${at + 1} 段不正交(偏离 ${worst.toFixed(2)}px)`,
      subject: { kind: 'edge', id: e.id },
      evidence: { deviation: worst, segmentIndex: at, points: e.points.map((p) => [p.x, p.y]).flat() },
      supportedFixes: [
        snaps.length
          ? {
              kind: 'snap-point',
              hint: `吸附第 ${at + 1} 段的端点(共 ${snaps.length} 个候选, 都验过整条折线仍全程正交): 把折点 #${best!.pointIndex} 改成 (${round1(best!.at[0])}, ${round1(best!.at[1])}) 位移 ${best!.move}px, 最小的就是它`,
              patch: { edgeId: e.id, segmentIndex: at, candidates: snaps },
            }
          : {
              kind: 'snap-point',
              hint: '这一段没有"只动一个端点就全程正交"的落法(两端都受邻段钳制) —— 折点列得整体重排, 或直接用 route 按端口重算',
              patch: { edgeId: e.id, segmentIndex: at },
            },
        { kind: 'reroute', hint: '若是手写坐标, 改用 route: 传端口(side)而不是折点' },
      ],
    });
  }
  return out;
}

// --- 门禁 ④ label_clearance: 标签遮罩与线的最小净空 --------------------

function checkLabelClearance(s: Scene, level: AuditLevel): { diags: Diagnostic[]; minClearance: number; measured: boolean } {
  const thr = THRESHOLDS[level].labelClearance;
  const diags: Diagnostic[] = [];
  let min = Infinity;
  let measured = false;
  for (const l of s.labels ?? []) {
    const chip = labelRect(l);
    for (const e of s.edges) {
      if (l.ownerEdge && e.id === l.ownerEdge) continue; // 唯一豁免: 自家边(Archify 同规定)
      const d = polylineRectsClearance(e.points, [chip]);
      if (d === null) {
        diags.push({
          code: AUDIT_CODES.label_clearance,
          severity: 'error',
          message: `标签 ${l.id} 与边 ${e.id} 的净空无法判定(输入非法) —— 按"不知道"处理, 不放行`,
          subject: { kind: 'label', id: l.id },
          evidence: { edgeId: e.id, clearance: 'null' },
          supportedFixes: [{ kind: 'fix-input', hint: '检查标签 at/width 与折点列是否有 NaN/Infinity' }],
        });
        continue;
      }
      min = Math.min(min, d);
      measured = true;
      if (d + 1e-4 < thr) {
        diags.push({
          code: AUDIT_CODES.label_clearance,
          severity: level === 'showcase' ? 'error' : 'warning',
          message: `标签 ${l.id} 压到边 ${e.id}(净空 ${d.toFixed(2)}px < ${thr}px)`,
          subject: { kind: 'label', id: l.id },
          evidence: { edgeId: e.id, clearance: d, threshold: thr, labelAt: [l.at.x, l.at.y] },
          supportedFixes: [
            { kind: 'offset-label', hint: `沿标签法线偏移 labelDy+=${Math.ceil(thr - d + 2)}`, patch: { labelId: l.id, labelDy: Math.ceil(thr - d + 2) } },
            { kind: 'lane-shift', hint: '把这条边整体让开(route 的 lane 参数), 代价是主路径折点数 +1', patch: { edgeId: e.id } },
            { kind: 'chip-on', hint: '给标签加遮罩片(背景 chip) —— 视觉上切断线, 但 clearance 仍为 0, 只在 standard 档可接受' },
          ],
        });
      }
    }
  }
  return { diags, minClearance: measured ? min : 0, measured };
}

// --- 门禁 ⑥ text_clearance: 旁注文本与线的最小净空 --------------------

// --- 门禁 ⑲ owner_ref: 归属引用必须真实存在(结构校验) ----------------

/**
 * `SceneText.owner` 的引用校验: 指向的对象必须在本 scene 里真的存在, 且 `kind` 在词表里。
 *
 * 为什么这是**门禁**而不是"构建期守卫": 归属驱动一条**豁免**(`text_clearance` 的自家边)。
 * 幽灵归属(对象改了 id、owner 没跟着改)会让豁免**静静失效** —— 作者以为"我配了归属, 压自家边
 * 已经不算事", 门禁照旧报, 于是他去猜别的旋钮; 反过来它也**静默放行**: 那段字明明躺在别人家的线上,
 * 却因为"看起来配了归属"被当成有意为之。两种错都是"看着配好了"的假安全感, 比漏报更贵 ——
 * 与 `knives/cluster.ts` 那四条"声明与几何矛盾"同族(声明制的东西, 声明本身要能被对账)。
 *
 * 词表外的 `kind`(只剩 JSON 反序列化这条路能造出来)一并拦: **不认识的归属等于没有归属**,
 * 不许静默当成"没写 owner"。
 */
function checkOwnerRef(s: Scene): Diagnostic[] {
  const diags: Diagnostic[] = [];
  const pools: Record<string, string[]> = {
    node: s.nodes.map((n) => n.id),
    edge: s.edges.map((e) => e.id),
    group: (s.groups ?? []).map((g) => g.id),
  };
  const kinds: readonly string[] = SCENE_OWNER_KINDS;
  for (const t of s.texts ?? []) {
    const o = t.owner as SceneOwner | undefined;
    if (o === undefined) continue;
    if (typeof o !== 'object' || o === null) {
      diags.push({
        code: AUDIT_CODES.owner_ref, severity: 'error',
        message: `文本 ${t.id} 的归属不是 {kind, id} 形态`,
        subject: { kind: 'text', id: t.id },
        evidence: { ownerKind: String((o as { kind?: unknown }).kind) },
        supportedFixes: [
          { kind: 'fix-owner-id', hint: '写成 `{ kind: "node" | "edge" | "group", id: "…" }`' },
          { kind: 'drop-owner', hint: '这段字确实不归属任何对象: 删掉 owner', patch: { textId: t.id } },
        ],
      });
      continue;
    }
    const kindOk = typeof o.kind === 'string' && kinds.includes(o.kind);
    const idOk = typeof o.id === 'string' && o.id.length > 0;
    if (kindOk && idOk && pools[o.kind].includes(o.id)) continue;
    const detail = !kindOk
      ? `owner.kind 不在词表里(拿到 ${typeof o.kind === 'string' ? `"${o.kind}"` : typeof o.kind}; 只认 ${kinds.join(' / ')})`
      : !idOk ? 'owner.id 不是非空字符串'
      : `${o.kind} "${o.id}" 不在本 scene 里`;
    const cands = kindOk ? pools[o.kind] : [];
    const shown = cands.slice(0, 5);
    diags.push({
      code: AUDIT_CODES.owner_ref, severity: 'error',
      message: `文本 ${t.id} 的归属引用不存在: ${detail}`,
      subject: { kind: 'text', id: t.id },
      evidence: { ownerKind: String(o.kind), ownerId: String(o.id) },
      supportedFixes: [
        {
          kind: 'fix-owner-id',
          hint: shown.length
            ? `写对引用 —— 本 scene 的 ${o.kind} id: ${shown.join(' / ')}${cands.length > shown.length ? ` …(共 ${cands.length} 个)` : ''}`
            : '写对一个本 scene 里存在的引用(kind 与 id 都要对)',
          patch: { textId: t.id, ownerKind: String(o.kind), candidates: shown },
        },
        {
          kind: 'drop-owner',
          hint: '这段字确实不归属任何对象: 删掉 owner(代价是它压到任何一条线都得自己让开)',
          patch: { textId: t.id },
        },
      ],
    });
  }
  return diags;
}

/**
 * 自由文本与线的净空。与 `label_clearance` 的唯一区别是**豁免面**: 标签订在自己的边上(缺省豁免),
 * 而自由文本**缺省压到任何一条线都算事故** —— 想豁免就得**声明归属**(`SceneText.owner` 指向那条边),
 * 且**只豁免那一条**(260923)。
 *
 * 为什么不是"所有归属都豁免": 一段字声明属于某条边, 不等于它压别的线就合理 —— 与
 * `label_clearance` 的 `ownerEdge` 同一条口径(那边也只豁免自家边, 所以"孤零零的标签躺在别人线上"
 * 照样报)。
 *
 * 判据与阈值跟 label_clearance 同源(同一把尺子), 但修法提示不同: 标签订在边上, 挪一点就行;
 * 文本是独立摆的, 更该改的是**折线的腰线位置**(route 的 lane)。
 */
function checkTextClearance(s: Scene, level: AuditLevel): { diags: Diagnostic[]; minClearance: number; measured: boolean } {
  const thr = THRESHOLDS[level].labelClearance;
  // 组框标题的坐标可不可动, 判据与 `text_overlap` 那侧同一个(`groupLabelDerived`) —— 一处判据两处调用
  const groupOf = groupLabelIndex(s);
  // 归属豁免表: 只认 `kind: 'edge'`(节点 / 组不豁免任何东西, 见 `SceneText.owner` 的口径)
  const ownerEdge = new Map<string, string>();
  for (const t of s.texts ?? []) {
    if (t.owner?.kind === 'edge' && typeof t.owner.id === 'string') ownerEdge.set(t.id, t.owner.id);
  }
  const diags: Diagnostic[] = [];
  let min = Infinity;
  let measured = false;
  for (const t of textBlocks(s)) {
    const mine = ownerEdge.get(t.id);
    for (const e of s.edges) {
      if (mine !== undefined && e.id === mine) continue; // 唯一豁免: 自家边(与 label_clearance 同规定)
      const d = polylineRectsClearance(e.points, [t.rect]);
      if (d === null) {
        diags.push({
          code: AUDIT_CODES.text_clearance,
          severity: 'error',
          message: `文本 ${t.id} 与边 ${e.id} 的净空无法判定(输入非法) —— 按"不知道"处理, 不放行`,
          subject: { kind: 'text', id: t.id },
          evidence: { edgeId: e.id, clearance: 'null' },
          supportedFixes: [{ kind: 'fix-input', hint: '检查文本 rect 与折点列是否有 NaN/Infinity' }],
        });
        continue;
      }
      min = Math.min(min, d);
      measured = true;
      if (d + 1e-4 < thr) {
        // 障碍是**折线**, 不是矩形 —— 拿它的包围盒外扩一个 thr 当障碍**有保证**:
        // 折线 ⊆ 包围盒, 文本落在"外扩 thr 的包围盒"之外 ⇒ 到折线每一点的距离都 ≥ thr。
        // 代价是可能挪得比必要更远(包围盒比折线粗), 所以标成次选。候选只算一次。
        const cands = outsideCandidates(t.rect, expandRect(edgeBBox(e.points), thr), 0);
        const g = groupOf.get(t.id);
        // 组框标题 + 位置派生 ⇒ 坐标对作者没用, 改说该动哪个旋钮(口径同 `moveTextFix` 的 group 分支)
        const movable = !g || !groupLabelDerived(g);
        diags.push({
          code: AUDIT_CODES.text_clearance,
          severity: level === 'showcase' ? 'error' : 'warning',
          message:
            d === 0
              ? `文本 ${t.id} 被边 ${e.id} 穿过(净空 0)`
              : `文本 ${t.id} 距边 ${e.id} 只有 ${d.toFixed(2)}px(< ${thr}px)`,
          subject: { kind: 'text', id: t.id },
          evidence: {
            edgeId: e.id, clearance: d, threshold: thr,
            textRect: [t.rect.x, t.rect.y, t.rect.w, t.rect.h],
            content: t.content ?? t.id,
          },
          supportedFixes: [
            {
              kind: 'lane-shift',
              hint: '首选: 改这条边的腰线(route 的 lane)让它绕开文本 —— 折线该适应版式, 不是反过来',
              patch: { edgeId: e.id },
            },
            movable
              ? {
                  kind: 'move-text',
                  hint: `次选: 把文本挪出这条边的包围盒(外扩 ${thr}px, 保证净空够): ${describeCandidates(cands)} —— 按包围盒算, 挪完重跑 audit`,
                  patch: { ...(g ? { groupId: g.id } : { textId: t.id }), candidates: cands, basis: 'edge_bbox' },
                }
              : {
                  kind: 'move-text',
                  hint: '次选: 这是**组框标题**, 位置由 `labelPlacement` / `labelInset` 派生(见 groupLabelBox) —— 改那两处(inner ↔ outer), 手改矩形不上屏; 或按首选改这条边的腰线绕开',
                },
            { kind: 'move-port', hint: '也可换出口面/端口位置, 让这条边从一开始就不经过这里' },
          ],
        });
      }
    }
  }
  return { diags, minClearance: measured ? min : 0, measured };
}

// --- 门禁 ⑭ text_overlap: 文本与**实体**抢地(过去只查线, 不查盒子) -------

/**
 * 文本块压到**实体**身上: 节点盒 / 另一块文本 / 组框边线。
 *
 * 260918 由用户看图捉出（"左侧 label 跟 rect 有重叠"）：④ label_clearance 与 ⑥ text_clearance
 * **都只拿文本与「边」比**，于是四类最显眼的事故全部放行 —— 实测四例，audit 全绿：
 *   ① 旁注整个盖在节点盒上 ② 边标签遮罩压在节点上 ③ 旁注压组框边线 ④ 两块旁注互压。
 * 缺口根因：文本的对家被写死成「边」，而文本真正的对家是**一切占地方的东西**。
 *
 * 分对象判据（这是本项唯一不对所有对家一视同仁的地方）：
 * · 节点盒 / 另一块文本 —— 矩形重叠，穿透深度 > SLOP 即报
 * · 组框 —— 文本落在框**内**是正常的，只有**压到框线**才算事故
 *
 * 无条件 error（与穿盒 / 折回 / 叠成一条线同档）：这是几何**事实**（矩形真的叠上了），
 * 不是可读性判断。阈值只有 0.5px 估算容差（与 LABEL_FIT_SLOP 同一立场）。
 */
const TEXT_OVERLAP_SLOP = 0.5;

/** 两矩形相交的**穿透深度**(px)：两轴重叠量取小；不相交 / 仅相切 → 0 */
function overlapDepth(a: Rect, b: Rect): number {
  if (!isFiniteRect(a) || !isFiniteRect(b)) return 0;
  const dx = Math.min(rectRight(a), rectRight(b)) - Math.max(a.x, b.x);
  const dy = Math.min(rectBottom(a), rectBottom(b)) - Math.max(a.y, b.y);
  return dx > 0 && dy > 0 ? Math.min(dx, dy) : 0;
}

/** 文本块是否整个落在组框内（落在框内正常；只有这样才排除“压框线”） */
const insideRect = (inner: Rect, outer: Rect): boolean =>
  inner.x >= outer.x && inner.y >= outer.y
  && rectRight(inner) <= rectRight(outer) && rectBottom(inner) <= rectBottom(outer);

// --- 修法坐标化(260920): 二元情形的"该挪到哪" -------------------------
//
// 由来(与立项期"代价向量 → 工具化"那份评估的下半同一条): 诊断承诺"照它改就行", 可数值 patch
// 过去只覆盖**一元**情形(单对象的 w / fontSize / Δ); 二元情形(**A×B 相撞该挪到哪**)只剩
// kind + 一句方向词 —— 作者看懂了, 还得自己把那道减法做掉。而"做减法"正是几何该负责的部分。
//
// 参照实现(`workflow-compiler.mjs` 的 `suggest*Fix`)就是干这个的: `below = obstacle.y + h + 14`,
// 给两三个**算好的**候选, 调用方照抄即可。本仓此前只有 `widen-node` / `lower-font` / `offset-label`
// 三处真的算了数 —— 这里把它推广到"两个对象"的情形。
//
// 三条纪律(与 audit 全局一致):
//   · **不留第二把尺子**: 候选留的净空一律取 `THRESHOLDS[level]` 里**已经存在**的那个数
//     (节点之间用 `nodeGap`, 文本与线用 `labelClearance`), 否则就会出现"门禁说过、修法说不过"的双源。
//   · **候选按位移升序**: 数组顺序 = 推荐顺序(与 `nudge.snap` 的"同距先到者胜"同一套直觉),
//     人读第一条通常就够。
//   · **只做算术, 不改版式**: 候选是纯平移(另一个轴原样), 给的是"这么挪就不撞了"的**局部解** ——
//     选哪个、要不要连别的对象一起挪, 仍是作者的决定。所以每条提示都要求挪完重跑 audit。

/** 一个"挪到哪"的候选: `at` 是**新坐标**(不是增量), `move` 是这次平移的距离(px) */
type MoveCandidate = { side: string; at: [number, number]; move: number };

/** 折点列的包围盒(空列 → 退化成一个点粗的盒; 调用方保证 points 已非空) */
function edgeBBox(points: Pt[]): Rect {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of points) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** 两轴上的重叠深度(任一 ≤0 即该轴不相交) */
const overlapsAlong = (a: Rect, b: Rect): { dx: number; dy: number } => ({
  dx: Math.min(rectRight(a), rectRight(b)) - Math.max(a.x, b.x),
  dy: Math.min(rectBottom(a), rectBottom(b)) - Math.max(a.y, b.y),
});

/** 候选定序: 按位移升序, 同距按 side 字典序 —— 数组顺序 = 推荐顺序 */
const rankCandidates = (inner: Rect, raw: Array<{ side: string; at: [number, number] }>): MoveCandidate[] =>
  raw
    .map((c) => ({ ...c, move: round1(Math.hypot(c.at[0] - inner.x, c.at[1] - inner.y)) }))
    .sort((p, q) => p.move - q.move || (p.side < q.side ? -1 : p.side > q.side ? 1 : 0));

/** 四个"贴着外缘"的落点(左 / 右 / 上 / 下), 纯平移: 挪左/右时 y 不动, 挪上/下时 x 不动 */
const outsideRaw = (inner: Rect, outer: Rect, clear: number): Array<{ side: string; at: [number, number] }> => [
  { side: 'left', at: [outer.x - clear - inner.w, inner.y] },
  { side: 'right', at: [rectRight(outer) + clear, inner.y] },
  { side: 'above', at: [inner.x, outer.y - clear - inner.h] },
  { side: 'below', at: [inner.x, rectBottom(outer) + clear] },
];

/**
 * 把 `inner` 整个挪出 `outer` 的四个候选, 按位移升序。
 *
 * 为什么不"沿最短轴推一点就完": 那是"不重叠"的解, 不是**版式上说得过去**的解 ——
 * 推到盒子的另一侧(左/右/上/下贴着放)才是作者真会做的事。想要最小位移就取第一条,
 * 想要"换个位置"就从后面挑 —— 两条信息在同一个数组里。
 */
function outsideCandidates(inner: Rect, outer: Rect, clear: number): MoveCandidate[] {
  return rankCandidates(inner, outsideRaw(inner, outer, clear));
}

/**
 * 跨在框线上的文本: 说得过去的落法只有两种 —— **整个进框内** / **整个出框外**
 * (跨在线上是两头不讨好的位置, 这正是这条诊断在喊的事), 两种都算好。
 *
 * "进框内"的候选只在**装得下**时给(框的可用区比文本块还小的时候, 那个 clamp 会退化成
 * 一个假坐标); 装不下就不给, 而不是给一个挪过去仍然跨线的数。
 */
function straddleCandidates(inner: Rect, frame: Rect, clear: number): MoveCandidate[] {
  const fitsInside = frame.w - 2 * clear >= inner.w && frame.h - 2 * clear >= inner.h;
  const inside: Array<{ side: string; at: [number, number] }> = fitsInside
    ? [{
        side: 'inside',
        at: [
          clamp(inner.x, frame.x + clear, rectRight(frame) - clear - inner.w),
          clamp(inner.y, frame.y + clear, rectBottom(frame) - clear - inner.h),
        ],
      }]
    : [];
  return rankCandidates(inner, [...inside, ...outsideRaw(inner, frame, clear)]);
}

/**
 * 两块矩形是不是"同层/同列"。
 *
 * 判据: **垂直轴的**重叠超过较薄那方的**高度**一半, 就是同一排(axis='x', 该沿水平均分);
 * 反之按同列(axis='y')。这里的两个"轴"别搞混 —— 判"是不是一排"看的是**另一个轴**,
 * 而"薄"要拿**该轴自己的尺寸**(拦一排时薄不薄是高度说了算, 不是宽度)。
 */
const sameBand = (a: Rect, b: Rect, axis: 'x' | 'y'): boolean => {
  const o = overlapsAlong(a, b);
  const thin = axis === 'x' ? Math.min(a.h, b.h) : Math.min(a.w, b.w);
  return (axis === 'x' ? o.dy : o.dx) > thin / 2;
};

/**
 * `repack` 的参数: 同层(或同列)那一排的 id + 该沿哪个轴均分 —— 直接喂给 `nudge.distribute`。
 * 口径说明写在这里而不是调用方: `distribute` 量的是**间距相等**(净空相等), 与 `node_gap` 这把
 * 尺子同源(门禁量的也是矩形净空), 所以这条修法与判决**天然对齐**, 不需要再折算。
 *
 * **给不出就返回 null**(调用方据此不发这条修法): 两个盒子在两个轴上都算不上同排/同列时,
 * "均分重排"这一招根本无处落脚 —— 发一条改不了的修法, 比不发更贵(作者会照着做一遍再发现没用)。
 */
function repackParams(s: Scene, a: Scene['nodes'][number], b: Scene['nodes'][number]): { axis: 'x' | 'y'; ids: string[]; count: number } | null {
  const axis: 'x' | 'y' | null = sameBand(a.rect, b.rect, 'x') ? 'x' : sameBand(a.rect, b.rect, 'y') ? 'y' : null;
  if (!axis) return null;
  const ids = s.nodes
    .filter((n) => n.id === a.id || sameBand(n.rect, a.rect, axis))
    .map((n) => n.id);
  // 一排至少要两个才谈得上"重排"; 只有一个说明这一排就它自己, 无从均分
  return ids.length >= 2 ? { axis, ids, count: ids.length } : null;
}

/**
 * `move-text` 的修法: 按**主体种类**决定坐标写进哪里 —— 三种主体的可动面完全不同, 混成一句
 * "把文本挪开"就是让作者去猜。
 *
 * · `text`(旁注) —— 动 `SceneText.rect.x/y`(**它就是实际占位**, 挪完要同步更新, 否则审计与上屏漂开)
 * · `label`(边标签) —— 动 `SceneLabel.at`(检测矩形 = 上屏遮罩片, 同一份数字)
 * · `group`(组框标题) —— **分两种**(判据见 `groupLabelDerived`, 别一律说不给坐标):
 *   声明了 `labelPlacement` / `labelInset` 的 ⇒ 位置派生, 手改矩形不上屏 ⇒ 不给坐标, 只指那个真旋钮;
 *   没声明的 ⇒ 标题矩形就是作者手写的 `labelRect` ⇒ 坐标照给(动它真的上屏)。
 */
function moveTextFix(
  kind: SubjectKind,
  id: string,
  cands: MoveCandidate[],
  group?: SceneGroup,
): Diagnostic['supportedFixes'][number] {
  if (kind === 'text') {
    return {
      kind: 'move-text',
      hint: `把旁注挪出障碍: ${describeCandidates(cands)}(rect 是它的实际占位, 挪完同步更新)`,
      patch: { textId: id, candidates: cands },
    };
  }
  if (kind === 'label') {
    return {
      kind: 'move-text',
      hint: `把标签挪出障碍: ${describeCandidates(cands)}(改 \`at\`, 检测矩形与遮罩片是同一份数字)`,
      patch: { labelId: id, candidates: cands },
    };
  }
  if (group && !groupLabelDerived(group)) {
    return {
      kind: 'move-text',
      hint: `把组框标题挪出障碍: ${describeCandidates(cands)}(这条框**没声明** placement / inset ⇒ 标题矩形就是你手写的 \`labelRect\`, 改它即上屏)`,
      patch: { groupId: group.id, candidates: cands },
    };
  }
  return {
    kind: 'move-text',
    hint: '组框标题的位置是 `labelPlacement` / `labelInset` **派生**的(见 groupLabelBox) —— 改那两处(inner ↔ outer), 直接挪矩形不上屏',
  };
}

/** 候选列表 → 一句人读的话(前两条就够; 坐标是机器读的那份) */
function describeCandidates(cands: MoveCandidate[]): string {
  return cands
    .slice(0, 3)
    .map((c) => `${c.side} (${round1(c.at[0])}, ${round1(c.at[1])}) 位移 ${c.move}px`)
    .join(' / ');
}

function checkTextOverlap(s: Scene, level: AuditLevel): { diags: Diagnostic[]; count: number } {
  const diags: Diagnostic[] = [];
  // 挪开一块文本要留多少净空: 取**已有的**节点间距阈值, 不另立一个"呼吸位"
  const clear = THRESHOLDS[level].nodeGap;
  // 参与审计的文本块 = 旁注 + 分组标题(textBlocks) + 边标签遮罩片(labels)。
  // chip 一并入列的理由: 它也是**上屏的文字**，压到盒子同样是事故 ——
  // “它钉在边上、不该单独挪”不是豁免理由，改 labelDy / 端口位一样能解。
  // 组框标题的修法要按"矩形是不是派生的"分流, 所以把组对象一并带上(判据见 `groupLabelDerived`)
  const groupOf = groupLabelIndex(s);
  const blocks: Array<{ id: string; kind: SubjectKind; rect: Rect; group?: SceneGroup }> = [
    ...textBlocks(s).map((t) => ({
      id: t.id,
      kind: (groupOf.has(t.id) ? 'group' : 'text') as SubjectKind,
      rect: t.rect,
      group: groupOf.get(t.id),
    })),
    ...(s.labels ?? []).map((l) => ({ id: l.id, kind: 'label' as SubjectKind, rect: labelRect(l) })),
  ];
  let count = 0;

  for (const b of blocks) {
    const rect = [b.rect.x, b.rect.y, b.rect.w, b.rect.h];
    for (const n of s.nodes) {
      const d = overlapDepth(b.rect, n.rect);
      if (d <= TEXT_OVERLAP_SLOP) continue;
      count++;
      diags.push({
        code: AUDIT_CODES.text_overlap,
        severity: 'error',
        message: `文本 ${b.id} 压在节点 ${n.id} 上(重叠 ${round1(d)}px)`,
        subject: { kind: b.kind, id: b.id },
        evidence: { nodeId: n.id, overlap: round1(d), textRect: rect, nodeRect: [n.rect.x, n.rect.y, n.rect.w, n.rect.h] },
        supportedFixes: [
          moveTextFix(b.kind, b.id, outsideCandidates(b.rect, n.rect, clear), b.group),
          {
            kind: 'move-node',
            hint: `若该让路的是节点, 反过来把 ${n.id} 挪开: ${describeCandidates(outsideCandidates(n.rect, b.rect, clear))}`,
            patch: { nodeId: n.id, candidates: outsideCandidates(n.rect, b.rect, clear) },
          },
          { kind: 'shorten-text', hint: '窄空间里优先砍文案, 别硬塞' },
        ],
      });
    }
    // 文本互压：按字典序只报一次（一对报两次是噪声，不是信息）
    for (const o of blocks) {
      if (o.id <= b.id) continue;
      const d = overlapDepth(b.rect, o.rect);
      if (d <= TEXT_OVERLAP_SLOP) continue;
      count++;
      diags.push({
        code: AUDIT_CODES.text_overlap,
        severity: 'error',
        message: `文本 ${b.id} 与 ${o.id} 互相重叠(重叠 ${round1(d)}px)`,
        subject: { kind: b.kind, id: b.id },
        evidence: { textId: o.id, overlap: round1(d), textRect: rect, otherRect: [o.rect.x, o.rect.y, o.rect.w, o.rect.h] },
        supportedFixes: [
          moveTextFix(b.kind, b.id, outsideCandidates(b.rect, o.rect, clear), b.group),
          { kind: 'move-text-other', hint: `反过来挪 ${o.id} 也一样可解 —— 两块文本互压时没有"谁该让路"的客观答案, 挑动一处即可` },
        ],
      });
    }
    // 组框：只有**压到框线**才算; `noCheck` 组是纯视觉分区, 框线不构成障碍(260920)
    for (const g of s.groups ?? []) {
      if (g.noCheck) continue;
      if (!rectsOverlap(b.rect, g.rect) || insideRect(b.rect, g.rect)) continue;
      count++;
      diags.push({
        code: AUDIT_CODES.text_overlap,
        severity: 'error',
        message: `文本 ${b.id} 压在组框 ${g.id} 的边线上(一半在内一半在外)`,
        subject: { kind: b.kind, id: b.id },
        evidence: { groupId: g.id, textRect: rect, groupRect: [g.rect.x, g.rect.y, g.rect.w, g.rect.h] },
        supportedFixes: [
          // 两种说得过去的落法都算好: 整个进框内 / 整个出框外(跨在线上正是这条诊断在喊的事)
          moveTextFix(b.kind, b.id, straddleCandidates(b.rect, g.rect, clear), b.group),
          { kind: 'resize-group', hint: `若该让路的是框: 把 ${g.id} 框线挪到不切它 —— 左边 ≥ x=${round1(b.rect.x - clear)} 或 右边 ≤ x=${round1(rectRight(b.rect) + clear)}(y 向同理)`, patch: { groupId: g.id, keepOutX: [round1(b.rect.x - clear), round1(rectRight(b.rect) + clear)] } },
        ],
      });
    }
  }
  return { diags, count };
}

// --- 门禁 ⑦ label_fit: 节点内文字装不装得下 --------------------------

/** `nodeShape` 的主标签缺省字号 —— 直接取 `shapes/node.ts` 的那份常量(手抄一个 13 = 第二个会漂的源头) */
const NODE_FONT_SIZE = NODE_TEXT_LAYOUT.fontSize;
/** `measureText` 自带 1.5% 余量, 小于此值的"溢出"可能只是估算余量 —— 不报, 免得假警报刷屏 */
const LABEL_FIT_SLOP = 0.5;

/**
 * 节点内文字**装不装得下**。过去无人管: 窄盒长文能带着 audit 全过的章出厂, 溢出到框外。
 *
 * 与 `label_clearance` / `text_clearance` 的分工: 那两项管"文字与**边**抢道", 本项管"文字与**框**不合身"。
 * 量的是 `measureText` 估算宽度(blink 不在场时的唯一尺子), 所以阈值挂在**两侧呼吸位**上, 不是纯溢出。
 *
 * **只判宽度**(260920 复核后维持): 高度这一侧仍然是空白 —— 多行标签折 3 行塞进 1 行高的盒,
 * 本门禁一声不吭(`nodeShape` 逐行画出框外)。core 现在**算得出**那个高度(`geometry/text-rows`
 * 的行块并集高 + `measureText` 的行盒高), 所以缺的已经不是"行盒排布没人猜"而是**一道判决**;
 * 加不加是独立决定, 见 TODO。在那之前: 高度靠 `nodeFit` 反算 + `test/node-fit.test.ts` 的闭环断言守,
 * 而本门禁的 `reflow-label` 修法**把换行后需要的盒高一并算出来**(不然照它做必然出框)。
 */
function checkLabelFit(s: Scene, level: AuditLevel): { diags: Diagnostic[]; maxOverflow: number; measured: boolean } {
  const inset = THRESHOLDS[level].labelInset;
  const diags: Diagnostic[] = [];
  let max = -Infinity;
  for (const n of s.nodes) {
    const size = n.fontSize ?? NODE_FONT_SIZE;
    const fields: Array<{ kind: 'label' | 'sub'; text: string; fontSize: number; weight: number }> = [];
    if (n.label) fields.push({ kind: 'label', text: n.label, fontSize: size, weight: n.weight ?? NODE_TEXT_LAYOUT.weight });
    // 次标签用 size-2 与 400 字重 —— 与 nodeShape 的两行排布同源
    if (n.sub) fields.push({ kind: 'sub', text: n.sub, fontSize: size - 2, weight: 400 });
    for (const f of fields) {
      // 多行标签: 逐行量取最宽的一行(换行是调用方的活, core 不猜)
      const textWidth = Math.max(...f.text.split('\n').map((t) => measureText(t, { fontSize: f.fontSize, weight: f.weight }).width));
      const available = round1(n.rect.w - 2 * inset);
      const overflow = round1(textWidth - available);
      max = Math.max(max, overflow);
      if (overflow <= LABEL_FIT_SLOP) continue;
      diags.push({
        code: AUDIT_CODES.label_fit,
        severity: 'error',
        message: `节点 ${n.id} 的${f.kind === 'label' ? '主' : '次'}标签宽 ${textWidth}px, 超过可用宽 ${available}px(溢出 ${overflow}px; 两侧各留 ${inset}px)`,
        subject: { kind: 'node', id: n.id },
        evidence: {
          field: f.kind, content: f.text, textWidth, available, overflow, inset,
          nodeRect: [n.rect.x, n.rect.y, n.rect.w, n.rect.h],
        },
        supportedFixes: [
          { kind: 'widen-node', hint: `把盒宽加到至少 ${textWidth + 2 * inset}px`, patch: { nodeId: n.id, w: Math.ceil(textWidth + 2 * inset) } },
          { kind: 'reflow-label', hint: reflowHint(f, available, inset), patch: reflowPatch(n.id, f, available, inset) },
          { kind: 'shorten-label', hint: '缩短文案, 或把细节移到旁的旁注文本(texts)上' },
          { kind: 'lower-font', hint: `字号降到 ${Math.max(9, f.fontSize - 1)}px(牺牲可读性, 次于改字/改盒)`, patch: { nodeId: n.id, fontSize: Math.max(9, f.fontSize - 1) } },
        ],
      });
    }
  }
  return { diags, maxOverflow: Number.isFinite(max) ? max : -1, measured: Number.isFinite(max) };
}

/**
 * "折成几行才够宽"的**下限**(260920): 把标签所有字符拼成一行量总宽, 再除以可用宽 ——
 * 等宽折行所能达到的最少行数。它**不是**"该怎么折"(折在哪仍是作者的决定, core 不算命),
 * 而是"至少需要几行", 因为下面要拿它算盒高。
 *
 * 便宜且诚实: 少于现有行数没有意义(拼窄了反而变宽), 所以夹一个下界。
 */
function reflowLines(f: { text: string; fontSize: number; weight: number }, available: number): number {
  const current = f.text.split('\n').length;
  const flat = measureText(f.text.split('\n').join(''), { fontSize: f.fontSize, weight: f.weight }).width;
  return Math.max(current, Math.ceil(flat / Math.max(1, available)));
}

/** `reflow-label` 的修法文案: 行数下限 + **换行后盒高要加到多少**(行数一变盒高就变, 说"不动版式"是错的) */
function reflowHint(f: { text: string; fontSize: number; weight: number }, available: number, inset: number): string {
  const lines = reflowLines(f, available);
  return `换行写(标签里插入 \\n): 折成 ${lines} 行(下限)就够宽 —— 但**盒高要跟着加到 ≥${reflowBoxH(f, lines, inset)}px**, 行数一变盒高就变`;
}

/** `reflow-label` 的数值补丁: 折成 N 行后盒高至少要多少(宽由作者折, 高按同一份行块几何算) */
function reflowPatch(nodeId: string, f: { text: string; fontSize: number; weight: number }, available: number, inset: number): Record<string, unknown> {
  const lines = reflowLines(f, available);
  return { nodeId, lines, h: reflowBoxH(f, lines, inset) };
}

/** 折成 `lines` 行后, 盒高至少要多高 = 行块并集高 + 上下呼吸位(与 `nodeFit` 同一份公式) */
function reflowBoxH(f: { fontSize: number }, lines: number, inset: number): number {
  const lineH = measureText('x', { fontSize: f.fontSize }).height;
  const gap = f.fontSize * NODE_TEXT_LAYOUT.lineGapEm;
  const rows = Array.from({ length: lines }, () => lineH);
  return Math.ceil(rowBlock(lines, gap, rows).height + 2 * inset);
}

// --- 门禁 ⑧ edge_node_clearance: 边不许穿过节点盒 ---------------------

/** 端点吸附容差: 折线端点到节点盒 ≤ 此值即认为这条边"属于"它(用于排除自身端节点) */
const EDGE_OWNER_EPS = 14;
/**
 * 这条边的两端节点。优先信 `from`/`to`, 但它们**可能是组 id**(跨层边就常这么写), 匹配不上就落空。
 * 落空时按端点就近吸附兜底 —— 与手的"这条线从哪出来"直觉一致。
 */
function edgeOwnerNodes(s: Scene, e: SceneEdge): number[] {
  const byId = s.nodes.map((n, i) => (n.id === e.from || n.id === e.to ? i : -1)).filter((i) => i >= 0);
  if (byId.length) return byId;
  if (!e.points.length) return [];
  const head = e.points[0];
  const tail = e.points[e.points.length - 1];
  return s.nodes
    .map((n, i) => ({ i, d: Math.min(pointRectDistance(head, n.rect) ?? 1e9, pointRectDistance(tail, n.rect) ?? 1e9) }))
    .filter((o) => o.d <= EDGE_OWNER_EPS)
    .map((o) => o.i);
}

/**
 * 边**穿过节点盒**。
 *
 * 260917 手排实测发现的盲区: 一条直线横穿盒子时 `pass=true / errors=0 / diagnostics=(无)`
 * —— 最显眼的几何事故却完全不在门禁范围。谓词早就有(`segmentRectIntersectionLength`)。
 *
 * 只硬拦"穿透", 不设"贴近"预警: 折线贴着盒子边过在密集图里有时是**有意**的,
 * 把它焊成 error 或 warning 都会把正确排版判成错(与密度四项同一立场)。净空的最小值仍进 metrics。
 *
 * `SceneEdge.noCheck` 的边整条跳过 —— 判据在那边写着: 泳道线一类**视觉基准线**被自己的
 * 装饰物骑住是常态(260920 激活条), 而非"线压着盒子走"的事故。豁免面只有本项这一条。
 */
function checkEdgeNodeClearance(s: Scene): { diags: Diagnostic[]; pierced: number; minClearance: number; measured: boolean } {
  const diags: Diagnostic[] = [];
  let pierced = 0;
  let min = Infinity;
  let measured = false;
  s.edges.forEach((e) => {
    // 纯视觉基准线(泳道线一族)整条跳过 —— 见 `SceneEdge.noCheck` 的三条豁免面纪律。
    // 连 metrics 也不计: 它不参与测量, `min_edge_node_clearance` 由其余边决定(不与"没有测量对象 = -1"混淆)
    if (e.noCheck) return;
    const owner = edgeOwnerNodes(s, e);
    s.nodes.forEach((n, ni) => {
      if (owner.includes(ni)) return;
      let through = 0;
      for (let i = 1; i < e.points.length; i++) {
        through += segmentRectIntersectionLength(e.points[i - 1], e.points[i], n.rect) ?? 0;
      }
      const clear = polylineRectsClearance(e.points, [n.rect]);
      if (clear !== null) { min = Math.min(min, clear); measured = true; }
      if (through <= PIERCE_MIN) return;
      pierced++;
      diags.push({
        code: AUDIT_CODES.edge_node_clearance,
        severity: 'error',
        message: `边 ${e.id} 从节点 ${n.id} 身上穿过(穿透 ${through.toFixed(1)}px) —— 线压着盒子走`,
        subject: { kind: 'edge', id: e.id },
        evidence: { node: n.id, through: round1(through), nodeRect: [n.rect.x, n.rect.y, n.rect.w, n.rect.h] },
        supportedFixes: [
          { kind: 'lane-shift', hint: `给 ${e.id} 一条腰线(lane)绕开 ${n.id}; 或把腰线往空白带推`, patch: { edgeId: e.id, nodeId: n.id } },
          { kind: 'reorder', hint: `换层序/换序把 ${n.id} 挪出这条边的走廊 —— 长边的根因多半是两端被排到画布两侧`, patch: { edgeId: e.id } },
          { kind: 'move-node', hint: `把 ${n.id} 整体平移出走廊(只有它是"多余障碍"时才这么做)` },
          { kind: 'move-port', hint: '换出口面/端口位置, 让这条边从一开始就不走这条路' },
        ],
      });
    });
  });
  return { diags, pierced, minClearance: measured ? round1(min) : -1, measured };
}

// --- 门禁 ⑨ no_backtrack: 折线不许叠在自己身上 -------------------------

/**
 * `self_overlap` 的证据取值: 段 `i` 与哪个非相邻段反向叠、叠了多少。
 * 判定权全在 `selfOverlapIndex`(这里只挑一条最能说明问题的搭档), 所以取重叠最长的那条。
 * 找不到搭档就返 `j: -1` —— 理论上不会(谓词已判过), 但**不静默编造一个段号**。
 */
function selfOverlapPartner(pts: Pt[], i: number): { j: number; overlap: number } {
  let best = { j: -1, overlap: 0 };
  for (let j = 0; j + 1 < pts.length; j++) {
    if (Math.abs(j - i) < 2) continue; // 相邻那档归 firstBacktrackIndex
    const rev = (pts[i + 1].x - pts[i].x) * (pts[j + 1].x - pts[j].x)
      + (pts[i + 1].y - pts[i].y) * (pts[j + 1].y - pts[j].y) < 0;
    if (!rev) continue;
    const o = sameAxisOverlapLength(pts[i], pts[i + 1], pts[j], pts[j + 1]);
    if (o > best.overlap) best = { j, overlap: o };
  }
  return best;
}

/**
 * 折线叠在自己身上 —— 两档由 `evidence.kind` 区分, **同一条边只报一处**(取最狠的那个表征):
 *
 * · `adjacent`: 相邻两段反向(`firstBacktrackIndex`) —— 折点处原路折回, 一个看得见的尖点
 * · `self_overlap`: **非相邻**段同轴反向且投影区间重叠(`selfOverlapIndex`) —— 隔了几段又叠回来,
 *   折点列处处合法, 线却画了两遍
 *
 * 为什么两档同 code: 病是同一个(折线叠在自己身上), 只是病灶一个在相邻段、一个隔了几段。
 * 两档同时命中时报 `adjacent` —— 尖点折回是最显眼的那个表征, 报一处就够 agent 动手改。
 *
 * 与 `orthogonal_edges` 的关系: 那个管"拐得正不正", 这个管"有没有原路返回"。
 * 两者可以同时成立(260917 实测的 e5/e8 就是既正交、又叠自己), 所以必须分开两道。
 * 判据用 predicates 里的谓词 —— `route` 也拿 `firstBacktrackIndex` 挑拐法, 同源才不会漂开。
 * severity 一律 `error`: 折线叠回自己是几何事实(轴上的像素), 不是可读性判断(决策 14)。
 */
function checkBacktracks(s: Scene): { diags: Diagnostic[]; count: number } {
  const diags: Diagnostic[] = [];
  for (const e of s.edges) {
    const at = firstBacktrackIndex(e.points);
    if (at >= 0) {
      diags.push({
        code: AUDIT_CODES.no_backtrack,
        severity: 'error',
        message: `边 ${e.id} 在第 ${at + 1} 个折点原地折回 —— 折线叠在自己身上`,
        subject: { kind: 'edge', id: e.id },
        evidence: {
          kind: 'adjacent',
          index: at,
          at: [e.points[at].x, e.points[at].y],
          points: e.points.map((p) => [p.x, p.y]).flat(),
        },
        supportedFixes: [
          { kind: 'reroute', hint: '改用 routeOrthogonal 生成(它已按"不自重叠"在两个拐法里选); 手写折点时检查这三点方向是否反了' },
          { kind: 'clamp-lane', hint: '若是 lane 造成的: 腰线必须落在两个 stub 之间, 越界就会先越过目标再折回' },
          { kind: 'drop-stub', hint: '两个盒太近时 stub 会互穿: 调小 stub, 或拉开盒子间距' },
        ],
      });
      continue;
    }
    const seg = selfOverlapIndex(e.points);
    if (seg < 0) continue;
    const partner = selfOverlapPartner(e.points, seg);
    // 段号是**段**不是点: 说"第 k 段"而不是"第 k 个折点", 否则作者会去删错的那个点
    const where = partner.j >= 0 ? `与第 ${partner.j + 1} 段` : '与前面某段';
    const how = partner.overlap > 0 ? `同轴反向重叠 ${round1(partner.overlap)}px` : '同轴反向重叠';
    diags.push({
      code: AUDIT_CODES.no_backtrack,
      severity: 'error',
      message: `边 ${e.id} 的第 ${seg + 1} 段${where}${how} —— 折线叠在自己身上`,
      subject: { kind: 'edge', id: e.id },
      evidence: {
        kind: 'self_overlap',
        index: seg,
        other: partner.j,
        overlap: round1(partner.overlap),
        at: [e.points[seg].x, e.points[seg].y],
        otherAt: partner.j >= 0 ? [e.points[partner.j].x, e.points[partner.j].y] : [],
        points: e.points.map((p) => [p.x, p.y]).flat(),
      },
      supportedFixes: [
        { kind: 'move-port', hint: `换 ${e.id} 的端口面或沿面错开位置(side / t / at) —— 两根端口对面顶(left↔right / top↔bottom)时干线最容易越过端口坐标再退回; 换到相邻面, 或沿面把端口错开一截, 首段与末段就不再同轴` },
        { kind: 'lane-shift', hint: `给 ${e.id} 一条落在两段之间的腰线(lane): 腰线越过端口所在的坐标, 就会先冲过去再折回来(越界时 route 在 laneProjected 里报一声)` },
        { kind: 'reroute', hint: '手写折点列时把造成"回头"的那个折点挪出重叠区间(末段的投影别落回被叠的那段区间里), 或直接删掉多余折点' },
      ],
    });
  }
  return { diags, count: diags.length };
}

// --- 门禁 ⑤ node_gap: 节点重叠 / 贴太近 --------------------------------

function checkNodeGap(s: Scene, level: AuditLevel): Diagnostic[] {
  const gap = THRESHOLDS[level].nodeGap;
  const diags: Diagnostic[] = [];
  for (let i = 0; i < s.nodes.length; i++) {
    for (let j = i + 1; j < s.nodes.length; j++) {
      const a = s.nodes[i], b = s.nodes[j];
      if (!rectsOverlap(a.rect, b.rect, gap)) continue;
      const overlap = rectsOverlap(a.rect, b.rect, 0);
      const moves = outsideCandidates(b.rect, a.rect, gap);
      const repack = repackParams(s, a, b);
      diags.push({
        code: overlap ? AUDIT_CODES.node_overlap : AUDIT_CODES.node_gap,
        severity: overlap ? 'error' : level === 'showcase' ? 'error' : 'warning',
        message: overlap ? `节点 ${a.id} 与 ${b.id} 重叠` : `节点 ${a.id} 与 ${b.id} 间距不足 ${gap}px`,
        subject: { kind: 'node', id: a.id },
        evidence: { other: b.id, a: [a.rect.x, a.rect.y, a.rect.w, a.rect.h], b: [b.rect.x, b.rect.y, b.rect.w, b.rect.h], gap },
        supportedFixes: [
          {
            kind: 'nudge',
            hint: `把 ${b.id} 挪开(净空要 ${gap}px): ${describeCandidates(moves)}`,
            patch: { nodeId: b.id, candidates: moves },
          },
          // 参数**算好**交给 `nudge.distribute`: 它量的就是间距(净空)相等, 与 node_gap 同一把尺子,
          // 所以这条修法与判决天然对齐。过去只写一句"同层改用均分间距重排" —— 同层是哪几个、
          // 沿哪个轴, 都得作者自己算, 而"算"正是几何的活。算不出来(两盒两个轴都不同排)就不发。
          ...(repack
            ? [{
                kind: 'repack',
                hint: `同层(${repack.axis} 轴)${repack.count} 个节点改用均分间距重排: nudge.distribute(nodes, '${repack.axis}') —— 传 [${repack.ids.join(', ')}] 这一批`,
                patch: { axis: repack.axis, ids: repack.ids, api: 'nudge.distribute' },
              }]
            : []),
        ],
      });
    }
  }
  return diags;
}

// --- 门禁 ⑬ edge_degenerate: 看不见的边 -------------------------------
//
// 为什么单开一道: 其余所有边级门禁都以 `pts.length >= 2` 为前提, 于是"这条边根本画不出来"
// 反而落在**所有门禁的缝里** —— 两盒紧贴时 route 的端口会并成一个点, 它吐 1 个点, 产物上
// 既无长度也无箭头, 而审计全绿(260917 就已记录为"候选第十项", 今晚补上)。
//
// 三档(evidence.kind 区分): missing_points(原始折点不足 2 个) / collapsed(归一化后全重合) /
// zero_length(归一化后仍在, 但总长 < 0.5px —— 半像素以下肉眼不可见, 只剩一个孤立箭头)。

/** 边的最短可见长度(px): 与穿盒门禁的半像素口径一致 */
const EDGE_MIN_LENGTH = 0.5;

function checkEdgeDegenerate(
  s: Scene,
  norm: Map<string, Pt[]>,
): { diags: Diagnostic[]; count: number; minLength: number } {
  const diags: Diagnostic[] = [];
  let minLength = Infinity;
  for (const e of [...s.edges].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const raw = e.points as Pt[] | undefined;
    let kind: string | null = null;
    let len = -1;
    if (!Array.isArray(raw) || raw.length < 2) {
      kind = 'missing_points';
    } else {
      const pts = norm.get(e.id) ?? [];
      if (pts.length < 2) {
        kind = 'collapsed';
      } else {
        len = polylineLength(pts);
        minLength = Math.min(minLength, len);
        if (len < EDGE_MIN_LENGTH) kind = 'zero_length';
      }
    }
    if (!kind) continue;
    diags.push({
      code: AUDIT_CODES.edge_degenerate,
      severity: 'error',
      message:
        kind === 'missing_points'
          ? `边 ${e.id} 只有 ${Array.isArray(raw) ? raw.length : 0} 个折点(< 2) —— 画不出长度与箭头, 其余门禁全都跳过它`
          : kind === 'collapsed'
            ? `边 ${e.id} 的折点归一化后全部重合 —— 这条边画出来是一个点, 看不见`
            : `边 ${e.id} 总长只有 ${round1(len)}px(< ${EDGE_MIN_LENGTH}px) —— 肉眼不可见, 只剩一个孤立的箭头`,
      subject: { kind: 'edge', id: e.id },
      evidence: {
        kind, points: Array.isArray(raw) ? raw.length : 0,
        length: kind === 'zero_length' ? round1(len) : -1, limit: EDGE_MIN_LENGTH,
        raw: Array.isArray(raw) ? raw.flatMap((p) => [p.x, p.y]) : [],
      },
      supportedFixes: [
        { kind: 'gap-nodes', hint: '两盒紧贴/重叠时端口会并成一个点 —— 先把两端盒拉开(≥8px)再用 route 重算, 这是几何的必然结果, 不是文案问题' },
        { kind: 'reroute', hint: '用 routeOrthogonal 按两端端口重算折点列(手写坐标最容易在这里退化成单点)' },
        { kind: 'drop-edge', hint: '若这条边本来就不该存在(自反关系 / 已由分组表达): 从 scene 里删掉 —— 别留一条看不见的边在审计面里' },
        ...(kind === 'missing_points'
          ? [{ kind: 'add-points', hint: '补完整折点列(至少起终点两点, 且两端落在各自盒的边界上)' }]
          : []),
      ],
    });
  }
  return { diags, count: diags.length, minLength: Number.isFinite(minLength) ? round1(minLength) : -1 };
}

// --- 门禁 ⑩ 端口拥挤: 两条边在同一节点上"看起来同源" ------------------
//
// 三档同一个病, 用 evidence.kind 区分(取自 Mermaid validateLayout 的 20 类校验):
//   ① same_port_departure    —— 附着点距离 ≤2px 且**朝外方向**相同
//   ② shared_attachment_point —— 附着点距离 ≤3px(不问方向)
//   ③ shared_projected_port  —— **各自 bbox-clamp 回该节点盒后重合, 而原始距离 >3px**
//
// "朝外方向"= 附着点 → 该边的内侧邻点(start 取 pts[1] / end 取 pts[len-2]);
// 所以"一进一出但都往西走"仍算 ① —— 与 Mermaid `validateLayout.ts:1262-1268` 同构。
//
// ③ 的可达场景是**手写折点 / 组锚点**这类端点可以落在盒外的写法(route 的端口永远在边界上,
// 而边界点是 clamp 的不动点; `nudge` 只动 rect 不动端点)。它抓的是"看着不在一个位置, 其实同源"。
// 三档**互斥**(if/else if), 不像 Mermaid 那样 ① 与 ② 双报。

/** 附着点距离 ≤ 此值且朝外方向相同 → 同端口出发 */
const PORT_SAME_DEPARTURE = 2;
/** 附着点距离 ≤ 此值(不问方向) → 共享附着点; ③ 档的投影重合判据同用此值(参照实现只有一个常量) */
const PORT_SHARED_ATTACH = 3;

// --- 门禁 ⑪ 折点贴端点: stub 是门禁, 不是造型偏好 --------------------
//
// ① 首/末段长度 < 10px 且**至少有一个折弯**(归一化后 ≥2 段): 折弯顶在箭头底下。
//    无折弯的直连边不在此列 —— 两个节点离得近时直连是对的(参照实现同样包在 segments>=2 里,
//    否则 "nodeGap=8 允许" 与 "STUB_MIN=10 禁止" 两条门禁会互相打架)。
// ② 倒数第二段"蹭着"本端节点盒的侧面走: 平行 + 距离 **<18px** + 投影重叠过半 → **warning**。
//    为什么是 warning 而不是 error: 这是**可读性**判断(间距小的合法 Z 形路由天然会踩中它),
//    与密度四项同一立场 —— 启发式不许 fail-closed 否决正确版式。
// 量之前必须 `normalizeRoutePoints`: 否则共线中点会让首段看着很长。

/** 倒数第二段与本端节点盒的最大距离(严格小于); 同时要求投影重叠过半(过滤"只是路过") */
const END_BAND = 18;

// --- 门禁 ⑫ 边重叠: 完全叠线 + 没贴上但看不清 --------------------------
//
// ① 同向共线段重叠 ≥8px —— 两条边画在同一条线上, 视觉上变成一条(**error**: 信息丢失)。
// ② 同向近平行: 投影重叠 ≥8px 且 0 < 垂距 < 7px —— 没贴上, 但分不清是几条(**warning**: 可读性)。
// 去重: **同一对边只报一处**(共线优先, 各自取最狠的那处: 共线取最长重叠, 近平行取最小垂距)。
// 终端走廊豁免: 段的两端都落在本边原始端点的 8px 走廊内时跳过 —— 短 stub 上的重叠由
// `port_crowding` / `endpoint_approach` 负责, 一条缺陷只报一次(参照实现的 allInCorridor 同目的)。

/** 同向共线重叠长度下限 */
const OVERLAP_MIN = 8;
/** 近平行的垂距上限(等于 0 是共轴, 由 OVERLAP_MIN 那条管) */
const PARALLEL_GAP_MAX = 7;
/** 终端走廊: 段的两端都在本边端点的这个半径内 → 不算"边与边打架", 那是端口/stub 的事 */
const TERMINAL_CORRIDOR = 8;
/** 修法里建议的端口错开量 / 轨道间距 */
const PORT_OFFSET_MIN = 8;
const TRACK_SHIFT_MIN = OVERLAP_MIN + PARALLEL_GAP_MAX;

/**
 * 段的轴向+符号(E/S/W/N)。刻意**不用 atan2 量化** —— 那对非正交段是恒真式(见 audit.test.ts 头注);
 * 非正交段返 'X'(交给 `orthogonal_edges` 报, 不参与"朝外方向相同"的判定, 落进 ② 档)。
 */
function axisSign(a: Pt, b: Pt): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dy) <= ORTHO_EPS && Math.abs(dx) > ORTHO_EPS) return dx > 0 ? 'E' : 'W';
  if (Math.abs(dx) <= ORTHO_EPS && Math.abs(dy) > ORTHO_EPS) return dy > 0 ? 'S' : 'N';
  return 'X';
}

/**
 * 某一条边的**某一端**属于哪个节点。优先信 `from`/`to`; 它们可能是组 id(匹配不上),
 * 落空时按该端点就近吸附兜底 —— 与 `edgeOwnerNodes` 同口径, 但分端判(端口检查要的是"这一端是谁")。
 *
 * 并列(到两个节点等距)时按 **id 码点序**破平: 否则结果取决于 `nodes` 的输入顺序,
 * 确定性就成了"靠运气"(实测打乱 nodes 顺序会让 min_port_attach_gap 从 15.6 变成 -1)。
 */
function ownerAtEnd(s: Scene, e: SceneEdge, end: 'start' | 'end'): number {
  const wanted = end === 'start' ? e.from : e.to;
  if (wanted) {
    const i = s.nodes.findIndex((n) => n.id === wanted);
    if (i >= 0) return i;
  }
  if (e.points.length < 2) return -1;
  const p = end === 'start' ? e.points[0] : e.points[e.points.length - 1];
  // 先按 id 排序成稳定的候选序列, 再取最近(严格小于 → 并列时保留码点序靠前者)
  const order = s.nodes
    .map((n, i) => ({ i, id: n.id }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((o) => o.i);
  let best = -1;
  let bestD = Infinity;
  for (const i of order) {
    const d = pointRectDistance(p, s.nodes[i].rect);
    if (d !== null && d < bestD) { bestD = d; best = i; }
  }
  return bestD <= EDGE_OWNER_EPS ? best : -1;
}

/**
 * 「分叉 / 汇合」豁免 —— 两条边的重叠(或同点附着)有没有**拓扑解释**。
 *
 * 判据(两件同时成立才算有解释):
 *   ① 两条边**各自两端都归到了节点上** —— 有一端没归属(手写悬浮端点 / 没写 from·to)
 *      就不算: 那类"看着同源"是画错了, 不是拓扑。
 *   ② 只共享**恰好一个**节点 —— 两端全同(同一对节点之间的两条关系, 如 request/response)
 *      没有"分叉"可解释, 叠在一起仍是"两条线画成一条"。
 *
 * 为什么要这条: 共享主干(总线/分叉/汇合)是**正常拓扑**, 而现判据把它读成"两条边画重了"。
 * 代价层 `route-cost` 的 `sharedCorridorPx` 早就写着 `if (nb.sharesEndpoint) continue`
 * (口径借自参照实现 `routeInteractionMetrics`, 见该文件 RouteCostNeighbor 注释) ——
 * 同一件事在两层给出相反答案, 正是本仓反复咬过的"双源"病。
 *
 * ⚠ **中段并轨不在此列**: 先各走各的、中途蹭到同一条轨上再分开, 读者追不出"哪条进、哪条出",
 * 那是真丢信息。所以 `edge_overlap` 还要叠加 `sharedPrefixOverlap` 那条几何条件。
 */
function sharedTopologyOwner(s: Scene, ea: SceneEdge, eb: SceneEdge): number | null {
  const endsOf = (e: SceneEdge): number[] | null => {
    const a = ownerAtEnd(s, e, 'start');
    const b = ownerAtEnd(s, e, 'end');
    if (a < 0 || b < 0) return null; // ① 有一端没归属 → 不受本豁免保护
    return [...new Set([a, b])];
  };
  const oa = endsOf(ea);
  const ob = endsOf(eb);
  if (!oa || !ob) return null;
  const shared = oa.filter((i) => ob.includes(i));
  return shared.length === 1 ? shared[0] : null; // ② 恰好一个
}

/** 这条边挂在节点 `ni` 上的那一端是 start 还是 end(没归属给 null) */
function endAtNode(s: Scene, e: SceneEdge, ni: number): 'start' | 'end' | null {
  for (const end of ['start', 'end'] as const) if (ownerAtEnd(s, e, end) === ni) return end;
  return null;
}

/** 点列按"从某一端向外"的方向取 */
function pointsFrom(pts: Pt[], end: 'start' | 'end'): Pt[] {
  return end === 'start' ? pts : [...pts].reverse();
}

/**
 * 两条边**从共享节点那一端起**的公共前缀 —— 主干 / 总线就是这段(两条边在这里完全同路)。
 * 与 `edge_overlap` 的豁免条件是配套的: 重叠段必须盖住这段公共前缀的**末端点**, 才说明
 * 重叠是"共干段"而不是"中途撞上同名的一条线"。
 *
 * 实测(260920, `test/shared-trunk-probe.ts` 四形态):
 * - 主干 + 水平总线(`(170,100)→(170,200)` 公共, 重叠段是它后面的水平段) —— **是**共干段,
 *   重叠段盖住公共前缀末端点 (170,200) ⇒ 豁免。这是最经典的树形 / 总线图, 人眼一眼读得懂。
 * - 端口摊开 + 同一条 lane(两条边各走各的竖直段, 中途才在同一条水平线上撞见) —— 公共前缀
 *   只剩端口一个点, 而**重叠段离端口十万八千里** ⇒ 不豁免(读者看不出哪条进哪条出)。对。
 */
function sharedPrefixEnd(s: Scene, pa: Pt[], pb: Pt[], ni: number, ea: SceneEdge, eb: SceneEdge): Pt | null {
  const endA = endAtNode(s, ea, ni);
  const endB = endAtNode(s, eb, ni);
  if (!endA || !endB) return null;
  const a = pointsFrom(pa, endA);
  const b = pointsFrom(pb, endB);
  let k = 0;
  while (k < a.length && k < b.length
    && Math.abs(a[k].x - b[k].x) < ORTHO_EPS && Math.abs(a[k].y - b[k].y) < ORTHO_EPS) k++;
  return k > 0 ? a[k - 1] : null; // k === 0 = 端口点都不是同一个(端口摊开) → 无从谈起
}

/** 点是否落在这段轴线(含两端)上 */
function onAxisSegment(p: Pt, a: Pt, b: Pt): boolean {
  return p.x >= Math.min(a.x, b.x) - ORTHO_EPS && p.x <= Math.max(a.x, b.x) + ORTHO_EPS
    && p.y >= Math.min(a.y, b.y) - ORTHO_EPS && p.y <= Math.max(a.y, b.y) + ORTHO_EPS;
}

type PortRef = { edge: string; end: 'start' | 'end'; nodeIndex: number; at: Pt; dir: string };

/** 归一化折点列按 edgeId 缓存一次(三把刀共用, 别在 O(E²) 的内层循环里重复归一化) */
const normalizedEdgePoints = (s: Scene): Map<string, Pt[]> => {
  const m = new Map<string, Pt[]>();
  for (const e of s.edges) m.set(e.id, normalizeRoutePoints(e.points));
  return m;
};

/** 各条边的两端附着点(归一化后取首/末点) */
function collectPorts(s: Scene, norm: Map<string, Pt[]>): { ports: PortRef[]; unresolved: number } {
  const out: PortRef[] = [];
  let unresolved = 0;
  for (const e of [...s.edges].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const pts = norm.get(e.id) ?? [];
    if (pts.length < 2) continue;
    (['start', 'end'] as const).forEach((end) => {
      const nodeIndex = ownerAtEnd(s, e, end);
      if (nodeIndex < 0) { unresolved++; return; } // 差集必须可见 → unresolved_port_ends
      const at = end === 'start' ? pts[0] : pts[pts.length - 1];
      const inner = end === 'start' ? pts[1] : pts[pts.length - 2];
      out.push({ edge: e.id, end, nodeIndex, at, dir: axisSign(at, inner) });
    });
  }
  return { ports: out, unresolved };
}

function checkPortCrowding(
  s: Scene,
  norm: Map<string, Pt[]>,
): { diags: Diagnostic[]; count: number; minGap: number; unresolved: number } {
  const diags: Diagnostic[] = [];
  const { ports, unresolved } = collectPorts(s, norm);
  // 同一个 (边, 节点) 只报一次: N 条边挤一个端口时不刷 C(N,2) 条诊断
  const reported = new Set<string>();
  const byId = new Map(s.edges.map((e) => [e.id, e]));
  let minGap = Infinity;
  for (let i = 0; i < ports.length; i++) {
    for (let j = i + 1; j < ports.length; j++) {
      const a = ports[i], b = ports[j];
      if (a.edge === b.edge || a.nodeIndex !== b.nodeIndex) continue;
      const d = Math.hypot(a.at.x - b.at.x, a.at.y - b.at.y);
      minGap = Math.min(minGap, d);
      const node = s.nodes[a.nodeIndex];
      let kind: string | null = null;
      if (d <= PORT_SAME_DEPARTURE && a.dir === b.dir && a.dir !== 'X') kind = 'same_port_departure';
      else if (d <= PORT_SHARED_ATTACH) kind = 'shared_attachment_point';
      else if (d > PORT_SHARED_ATTACH && projectedPortsCoincide(a.at, b.at, node.rect, PORT_SHARED_ATTACH)) kind = 'shared_projected_port';
      if (!kind) continue;
      // 分叉 / 汇合点豁免: 两条边各自两端都归到了节点上、且只共享这一个节点 —— 同点出发 / 同点汇入
      // 是**拓扑本身**(读者读成"一条线出去再分开"), 不是"两条边挤在一个点上"。判据见 sharedTopologyOwner。
      const ea = byId.get(a.edge), eb = byId.get(b.edge);
      if (ea && eb && sharedTopologyOwner(s, ea, eb) !== null) continue;
      const key = `${a.edge}|${node.id}`;
      if (reported.has(key)) continue;
      reported.add(key);
      diags.push({
        code: AUDIT_CODES.port_crowding,
        severity: 'error',
        message: kind === 'shared_projected_port'
          ? `边 ${a.edge} 与 ${b.edge} 的端点在 ${node.id} 上看似不同位置(相距 ${d.toFixed(1)}px), 但投影回节点盒后重合 —— 两条边其实从同一点出发`
          : `边 ${a.edge} 与 ${b.edge} 在 ${node.id} 上的附着点相距只有 ${d.toFixed(1)}px(${kind}), 两条边挤在一个点上`,
        subject: { kind: 'edge', id: a.edge },
        evidence: {
          other: b.edge, kind, node: node.id, gap: round1(d),
          a: [a.end, a.at.x, a.at.y, a.dir], b: [b.end, b.at.x, b.at.y, b.dir],
        },
        supportedFixes: [
          // 拓扑修法放首位: 回路纪律是「照 supportedFixes 改」, 缺这一条就等于把作者单向推向摊开(260920)
          { kind: 'share-port', hint: '若这是分叉 / 汇合拓扑(端口无语义): 让两条边吃同一个端口点(同一 side、都不写 t/at)→ 「分叉 / 汇合」豁免生效, 一个字都不用写; 端口有语义才错开' },
          { kind: 'offset-port', hint: `把两条边沿 ${node.id} 的边错开至少 ${PORT_OFFSET_MIN}px(给端口一个顺序位或手写 offset)`, patch: { edgeId: b.edge, nodeId: node.id, minOffset: PORT_OFFSET_MIN } },
          { kind: 'swap-port', hint: `换掉其中一条的出口面(side), 让它们从一开始就不抢同一个位置`, patch: { edgeId: b.edge } },
          { kind: 'reroute', hint: '改用 routeOrthogonal 并按端口顺序传 side —— 手写折点时最容易在这里留下两条同源边' },
        ],
      });
    }
  }
  return { diags, count: diags.length, minGap: Number.isFinite(minGap) ? round1(minGap) : -1, unresolved };
}

function checkEndpointApproach(
  s: Scene,
  norm: Map<string, Pt[]>,
): { diags: Diagnostic[]; count: number; minStub: number; shortStubs: number } {
  const diags: Diagnostic[] = [];
  let shortStubs = 0;
  let minStub = Infinity;
  for (const e of [...s.edges].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const pts = norm.get(e.id) ?? [];
    if (pts.length < 2) continue;
    const headStub = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    const tailStub = Math.hypot(pts[pts.length - 1].x - pts[pts.length - 2].x, pts[pts.length - 1].y - pts[pts.length - 2].y);
    minStub = Math.min(minStub, headStub, tailStub);
    // ① 只在**存在折弯**时判: 直连边(2 点)不是"折点贴端点", 否则会和 node_gap 打架
    if (pts.length >= 3) {
      const short: string[] = [];
      if (headStub + 1e-6 < STUB_MIN) short.push('start');
      if (tailStub + 1e-6 < STUB_MIN) short.push('end');
      if (short.length) {
        shortStubs++;
        diags.push({
          code: AUDIT_CODES.endpoint_approach,
          severity: 'error',
          message: `边 ${e.id} 的${short.includes('start') ? '起' : ''}${short.includes('end') ? '终' : ''}点前只有 ${round1(Math.min(headStub, tailStub))}px 直段(< ${STUB_MIN}px) —— 折弯会顶在箭头下面`,
          subject: { kind: 'edge', id: e.id },
          evidence: { kind: 'short_stub', ends: short, startStub: round1(headStub), endStub: round1(tailStub), limit: STUB_MIN },
          supportedFixes: [
            { kind: 'grow-stub', hint: `给 route 传更大的 stub(当前首/末段 ${round1(headStub)}/${round1(tailStub)}px, 至少 ${STUB_MIN}px); 注意 route 会把 stub 钳到两盒间距的一半以内`, patch: { edgeId: e.id, stub: STUB_MIN } },
            { kind: 'move-port', hint: '换出口面/端口位置, 让这条边不必在离端点这么近的地方拐弯' },
            { kind: 'gap-nodes', hint: '两盒本身离得太近(gap < 2×stub)时先拉开间距 —— 别靠缩短 stub 硬塞, 那是几何必然结果' },
          ],
        });
      }
    }
    // ② 终点平行带(可读性, warning): 只看终点那一侧 —— 它是箭头所在的一侧
    const owner = ownerAtEnd(s, e, 'end');
    if (owner < 0 || pts.length < 3) continue;
    const node = s.nodes[owner];
    const a = pts[pts.length - 3];
    const b = pts[pts.length - 2];
    const axis = segmentAxis(a, b);
    if (axis === 0) continue;
    const clear = segmentRectClearance(a, b, node.rect);
    if (clear === null || clear >= END_BAND) continue;
    const span = axis === 1 ? node.rect.w : node.rect.h;
    const lo = axis === 1 ? Math.min(a.x, b.x) : Math.min(a.y, b.y);
    const hi = axis === 1 ? Math.max(a.x, b.x) : Math.max(a.y, b.y);
    const from = axis === 1 ? node.rect.x : node.rect.y;
    const to = axis === 1 ? rectRight(node.rect) : rectBottom(node.rect);
    const overlap = Math.max(0, Math.min(hi, to) - Math.max(lo, from));
    if (span <= 0 || overlap < span / 2) continue;
    diags.push({
      code: AUDIT_CODES.endpoint_approach,
      severity: 'warning',
      message: clear === 0
        ? `边 ${e.id} 进 ${node.id} 前那一段紧贴/穿过本端盒边(距离 0) —— 入点的拐角被盒子吃掉`
        : `边 ${e.id} 进 ${node.id} 前那一段贴着盒边蹭过来(平行、距离 ${round1(clear)}px < ${END_BAND}px) —— 入点看不清是"进"还是"路过"`,
      subject: { kind: 'edge', id: e.id },
      evidence: {
        kind: 'end_band', node: node.id, clearance: round1(clear), limit: END_BAND,
        segment: [a.x, a.y, b.x, b.y], overlap: round1(overlap), nodeSpan: round1(span),
      },
      supportedFixes: [
        { kind: 'move-port', hint: `换 ${node.id} 的入口面: 从侧面进就不要贴着走`, patch: { edgeId: e.id, nodeId: node.id } },
        { kind: 'lane-shift', hint: `把这段的腰线再推离 ${node.id} 一些(注意: 两盒间距很小时 lane 会被投影回原位, 那种情况改端口或拉开间距)`, patch: { edgeId: e.id, nodeId: node.id } },
        { kind: 'gap-nodes', hint: '间距本来就小: 这是几何的必然结果 —— 拉开两盒间距, 或接受它(警示级不拦出口)' },
      ],
    });
  }
  return { diags, count: diags.length, minStub: Number.isFinite(minStub) ? round1(minStub) : -1, shortStubs };
}

function checkEdgeOverlap(
  s: Scene,
  norm: Map<string, Pt[]>,
): { diags: Diagnostic[]; count: number; minParallelGap: number; collinear: number } {
  const diags: Diagnostic[] = [];
  const edges = [...s.edges].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  let minParallelGap = Infinity;
  let collinear = 0;
  // 终端走廊豁免: 只在"这条边真的有内部结构"(≥3 点/≥2 段)时才成立 ——
  // 2 点直连边整条都是它的终端段, 若也豁免就等于"直连边永远不算重叠", 那是漏报。
  const inTerminalCorridor = (seg: [Pt, Pt], raw: Pt[]): boolean => {
    if (raw.length < 3) return false;
    const ends = [raw[0], raw[raw.length - 1]];
    const near = (p: Pt): boolean => Math.min(...ends.map((q) => Math.hypot(p.x - q.x, p.y - q.y))) <= TERMINAL_CORRIDOR;
    return near(seg[0]) && near(seg[1]);
  };
  for (let i = 0; i < edges.length; i++) {
    const ea = edges[i];
    const pa = norm.get(ea.id) ?? [];
    if (pa.length < 2) continue;
    for (let j = i + 1; j < edges.length; j++) {
      const eb = edges[j];
      const pb = norm.get(eb.id) ?? [];
      if (pb.length < 2) continue;
      // 「分叉 / 汇合」豁免(见 sharedTopologyOwner): 只共享一个端点节点头 → 候选豁免。
      // 但还要叠加一条**几何**条件: 重叠段必须盖住**两条边从共享端起的公共前缀末端点** ——
      // 那才叫共干段(主干 / 总线: 两条边在这里本来就同路)。先各走各的、中途并轨再分开的
      // 公共前缀只剩端口一个点, 重叠段离它十万八千里 ⇒ 不豁免(读者追不出哪条进哪条出)。
      const shared = sharedTopologyOwner(s, ea, eb);
      const prefixEnd = shared === null ? null : sharedPrefixEnd(s, pa, pb, shared, ea, eb);
      const splitOverlap = (lo: Pt, hi: Pt): boolean =>
        prefixEnd !== null && onAxisSegment(prefixEnd, lo, hi);
      let worstCollinear: { overlap: number; at: Pt; segStart: Pt } | null = null;
      let worstParallel: { gap: number; overlap: number; segStart: Pt } | null = null;
      for (let k = 1; k < pa.length; k++) {
        const a1 = pa[k - 1];
        const a2 = pa[k];
        if (inTerminalCorridor([a1, a2], ea.points)) continue;
        for (let l = 1; l < pb.length; l++) {
          const b1 = pb[l - 1];
          const b2 = pb[l];
          if (inTerminalCorridor([b1, b2], eb.points)) continue;
          const ov = sameAxisOverlapLength(a1, a2, b1, b2);
          if (ov >= OVERLAP_MIN) {
            // 重叠区间的**两端**(不是段起点) —— 诊断指哪儿, 作者就该看哪儿
            const axis = segmentAxis(a1, a2);
            const lo: Pt = axis === 1
              ? { x: Math.max(Math.min(a1.x, a2.x), Math.min(b1.x, b2.x)), y: a1.y }
              : { x: a1.x, y: Math.max(Math.min(a1.y, a2.y), Math.min(b1.y, b2.y)) };
            const hi: Pt = axis === 1
              ? { x: Math.min(Math.max(a1.x, a2.x), Math.max(b1.x, b2.x)), y: a1.y }
              : { x: a1.x, y: Math.min(Math.max(a1.y, a2.y), Math.max(b1.y, b2.y)) };
            // 豁免的重叠不记为"最狠处", 但**不 continue** —— 近平行那档仍要能冒出来
            // (干线没对准 = 差几 px 的糊线, 那正是 ② 要报的)
            if (!splitOverlap(lo, hi) && (!worstCollinear || ov > worstCollinear.overlap)) {
              worstCollinear = { overlap: ov, at: lo, segStart: a1 };
            }
          }
          const pg = parallelSegmentGap(a1, a2, b1, b2);
          if (pg && pg.gap > 0 && pg.gap < PARALLEL_GAP_MAX && pg.overlap >= OVERLAP_MIN) {
            minParallelGap = Math.min(minParallelGap, pg.gap);
            // 近平行的"最狠"= 垂距最小(越近越分不清), 与共线档取最长重叠不同
            if (!worstParallel || pg.gap < worstParallel.gap) worstParallel = { ...pg, segStart: a1 };
          }
        }
      }
      // 共线优先(信息丢失比看不清更严重), 一对边只出一条
      if (worstCollinear) {
        collinear++;
        diags.push({
          code: AUDIT_CODES.edge_overlap,
          severity: 'error',
          message: `边 ${ea.id} 与 ${eb.id} 有 ${round1(worstCollinear.overlap)}px 画在同一条线上 —— 两条边看起来是一条`,
          subject: { kind: 'edge', id: ea.id },
          evidence: { other: eb.id, kind: 'collinear', overlap: round1(worstCollinear.overlap), at: [worstCollinear.at.x, worstCollinear.at.y], segmentStart: [worstCollinear.segStart.x, worstCollinear.segStart.y] },
          supportedFixes: [
            // 拓扑修法放首位: 分叉意图 + 端口没对齐(差几 px)时报的正是这条, 只给 lane-shift 会把人推向一束平行线
            { kind: 'share-port', hint: '若这是分叉 / 汇合拓扑: 让两条边从共享端吃同一个端口点(端口写法一致)→ 共干段豁免生效, 一个字都不用写; 端口摊开才用下面的错开' },
            { kind: 'lane-shift', hint: `给其中一条换一条腰线(错开至少 ${TRACK_SHIFT_MIN}px); 两侧对称的边最容易叠在一起`, patch: { edgeId: eb.id } },
            { kind: 'nudge-track', hint: '用 nudge 把其中一条的中间段沿法线推开(端点钉住, 只动中段)' },
            { kind: 'reorder', hint: '换个顺序/换层, 让两条边不再共用同一条走廊' },
          ],
        });
      } else if (worstParallel) {
        diags.push({
          code: AUDIT_CODES.edge_overlap,
          severity: 'warning',
          message: `边 ${ea.id} 与 ${eb.id} 叠得太近(平行段相距 ${round1(worstParallel.gap)}px < ${PARALLEL_GAP_MAX}px, 重叠 ${round1(worstParallel.overlap)}px) —— 看不出是两条线`,
          subject: { kind: 'edge', id: ea.id },
          evidence: { other: eb.id, kind: 'near_parallel', gap: round1(worstParallel.gap), overlap: round1(worstParallel.overlap), at: [worstParallel.segStart.x, worstParallel.segStart.y] },
          supportedFixes: [
            { kind: 'share-port', hint: '若这是分叉 / 汇合拓扑但端口差了几 px: 对齐到同一点 → 豁免生效; 端口有语义才错开' },
            { kind: 'lane-shift', hint: `把两条的腰线各推开: 目标间距 ≥${TRACK_SHIFT_MIN}px`, patch: { edgeId: eb.id, minGap: TRACK_SHIFT_MIN } },
            { kind: 'nudge-track', hint: '用 nudge 的 distribute 把这一束边均分间距' },
            { kind: 'reroute', hint: '若两条边本来就该分开走: 换端口面/换顺序, 别靠贴线区分' },
          ],
        });
      }
    }
  }
  return { diags, count: diags.length, minParallelGap: Number.isFinite(minParallelGap) ? round1(minParallelGap) : -1, collinear };
}

// --- 主入口 ------------------------------------------------------------

/**
 * 跑全部门禁: 返回两档判分 + 量化指标 + 带修法的诊断。
 *
 * **短路契约**: `finite_svg` 一旦不过, 其余几何门禁**一律跳过**。
 * 理由有两层 —— ① 在 NaN/Infinity 上算几何没有意义, 算出来的诊断是垃圾;
 * ② 更致命的是它会反过来把 audit 自己弄崩(曾实测: NaN 边让 checkOrthogonal 抛 TypeError,
 * 门禁变报错, "fail-closed 导航仪"的承诺当场破产)。
 * 此时 metrics 里未测项一律给 -1(而不是 0) —— 不要用 0 冒充"测过了, 结果是零"。
 *
 * `opts.clusterTier` 覆盖 `scene.clusterTier`(缺省 `set`) —— 给"同一份几何按两种语义各审一遍"用。
 */
export function audit(s: Scene, opts: { level?: AuditLevel; clusterTier?: ClusterTier } = {}): AuditReport {
  const level = opts.level ?? 'standard';
  const tier: ClusterTier = opts.clusterTier ?? s.clusterTier ?? 'set';
  // 折点列不是数组时先兜成空数组: 既让 `edge_degenerate` 的 missing_points 档可达,
  // 也避免 finite_svg 在 `points.every` 上抛 TypeError(门禁变报错 = fail-closed 的承诺破产)。
  // ⚠ 这里只做**读侧**兜底, 不改入参(审计是纯函数)。
  const scene: Scene = { ...s, edges: (s.edges ?? []).map((e) => ({ ...e, points: Array.isArray(e.points) ? e.points : [] })) };
  const finiteDiags = checkFinite(scene);

  if (finiteDiags.length) {
    // 坐标非有限时密度度量同样无意义(组框/折线都是 NaN) —— 一律 -1, 不拿 0 冒充“测过”
    return {
      level,
      pass: false,
      metrics: {
        crossings: -1, edges: scene.edges.length, nodes: scene.nodes.length,
        labels: (scene.labels ?? []).length, texts: (scene.texts ?? []).length,
        min_label_clearance: -1, min_text_clearance: -1, max_orthogonal_deviation: -1,
        label_overflow_max: -1, label_slack_min: -1,
        edge_node_pierce: -1, min_edge_node_clearance: -1, backtracks: -1,
        port_crowding: -1, min_port_attach_gap: -1,
        endpoint_approach: -1, min_stub: -1, endpoint_short_stubs: -1,
        edge_overlap: -1, min_parallel_gap: -1, edge_collinear: -1, unresolved_port_ends: -1,
        degenerate_edges: -1, min_edge_length: -1,
        phantom_labels: phantomCount(scene), phantom_texts: phantomTextCount(scene),
        text_overlap: -1,
        owner_ref: -1,
        cluster_member_outside: -1, cluster_frame_cross: -1, cluster_nesting_contradiction: -1,
        cluster_border_clearance: -1, declared_members: -1, undeclared_groups: -1, cluster_tier: -1,
        cluster_corridor_max: -1, cluster_corridor_avg: -1, cluster_corridor_px_max: -1, cluster_coverage: -1,
        cluster_overlap: -1, rows: -1, mixed_cluster_rows: -1,
        edge_max_rel: -1, edge_avg_rel: -1, edge_med_rel: -1, long_edges: -1,
        errors: finiteDiags.length, warnings: 0,
      },
      diagnostics: finiteDiags,
    };
  }

  const lc = checkLabelClearance(scene, level); // 只算一次(它同时供诊断与 metrics 用)
  const tc = checkTextClearance(scene, level);
  const or = checkOwnerRef(scene); // 归属引用(结构校验): 不产任何几何读数, 只拦幽灵归属
  const lf = checkLabelFit(scene, level);
  const to = checkTextOverlap(scene, level);
  const ec = checkEdgeNodeClearance(scene);
  const bt = checkBacktracks(scene);
  const norm = normalizedEdgePoints(scene); // 新刀共用一次归一化(别在 O(E²) 内层重复算)
  const dg = checkEdgeDegenerate(scene, norm);
  const pc = checkPortCrowding(scene, norm);
  const ea = checkEndpointApproach(scene, norm);
  const eo = checkEdgeOverlap(scene, norm);
  const dn = density(scene); // 密度四项全是 warning: 启发式不参与 fail-closed
  const cl = clusterAudit(scene, { tier }); // 组语义自洽四条: 几何事实, error 进 fail-closed
  const diags: Diagnostic[] = [
    ...checkSingleCanvas(scene),
    ...checkOrthogonal(scene),
    ...or,
    ...ec.diags,
    ...bt.diags,
    ...pc.diags,
    ...ea.diags,
    ...eo.diags,
    ...dg.diags,
    ...lc.diags,
    ...tc.diags,
    ...to.diags,
    ...lf.diags,
    ...checkNodeGap(scene, level),
    ...cl.diags,
    ...dn.diagnostics,
  ];
  // 诊断顺序与**输入序解耦**(260918): 按 (code, subject.kind, subject.id, message) 稳定排序。
  // 门禁是 agent 的导航仪 —— 报告必须能逐字节 diff, 否则"上一条说了什么"就对不上了。
  diags.sort((x, y) =>
    (x.code < y.code ? -1 : x.code > y.code ? 1 : 0) ||
    (x.subject.kind < y.subject.kind ? -1 : x.subject.kind > y.subject.kind ? 1 : 0) ||
    (x.subject.id < y.subject.id ? -1 : x.subject.id > y.subject.id ? 1 : 0) ||
    (x.message < y.message ? -1 : x.message > y.message ? 1 : 0));

  // 交叉计数: 不判违例, 但要给数(agent 靠它决定要不要换序)
  let crossings = 0;
  for (let i = 0; i < scene.edges.length; i++) {
    for (let j = i + 1; j < scene.edges.length; j++) {
      crossings += polylineCrossings(scene.edges[i].points, scene.edges[j].points);
    }
  }

  const metrics: Record<string, number> = {
    crossings,
    edges: scene.edges.length,
    nodes: scene.nodes.length,
    labels: (scene.labels ?? []).length,
    texts: (scene.texts ?? []).length,
    // -1 = 无标签/无文本可测(全部被豁免或压根没有) —— 不用 0 冒充"净空为零", 那是两回事
    min_label_clearance: lc.measured ? Math.round(lc.minClearance * 100) / 100 : -1,
    min_text_clearance: tc.measured ? Math.round(tc.minClearance * 100) / 100 : -1,
    max_orthogonal_deviation: scene.edges.length
      ? Math.max(0, ...scene.edges.flatMap((e) => e.points.slice(1).map((p, i) => orthogonalDeviation(e.points[i], p))))
      : 0,
    // -1 = 没有可测项(无带标签节点 / 无分组 / 无边), 不用 0 冒充"测过了, 结果是零"。
    // 两个数各说一件事, 不给任何歧义空间: overflow = 最紧的那个标签溢出多少(健康时为 0),
    // slack = 最紧的那个标签还剩多少余量。若只给一个, "-1" 就会同时可能是"没标签"与"余 1px"。
    label_overflow_max: lf.measured ? Math.max(0, lf.maxOverflow) : -1,
    label_slack_min: lf.measured ? Math.max(0, -lf.maxOverflow) : -1,
    edge_node_pierce: ec.pierced,
    min_edge_node_clearance: ec.measured ? ec.minClearance : -1,
    backtracks: bt.count,
    // 第四轮三项: 端口拥挤 / 折点贴端点 / 边重叠。计数与最小间距并存 ——
    // "没有可测项"一律给 -1, 不用 0 冒充"测过了, 结果是零"(本文件的老规矩)
    port_crowding: pc.count,
    min_port_attach_gap: pc.minGap,
    // 端点没能归属到任何节点(组 id + 端点离所有盒都 >14px)的个数 —— 差集必须可见, 别静默丢弃
    unresolved_port_ends: pc.unresolved,
    endpoint_approach: ea.count,
    endpoint_short_stubs: ea.shortStubs, // 其中 error 级的那个子集(其余是 warning)
    min_stub: ea.minStub,
    edge_overlap: eo.count,
    edge_collinear: eo.collinear, // 其中 error 级的子集
    min_parallel_gap: eo.minParallelGap,
    // 看不见的边(1 点 / 塌缩 / 半像素以下): 计数 + 最短边长度, 别让"画不出来"变成静默通过
    degenerate_edges: dg.count,
    min_edge_length: dg.minLength,
    // 幽灵文本: 有位置、没内容 → 不上屏, 却仍在参与净空审计。计数暴露它, 不拦出口
    // (审计面与渲染面的差集必须可见 —— 同族三次事故的病根都是"差集静默存在")
    phantom_labels: phantomCount(scene),
    phantom_texts: phantomTextCount(scene),
    // ⑭ 文本×实体：文本对家不能只有边。无文本块时给 -1（不用 0 冒充“测过了，结果是零”）
    text_overlap: to.count,
    // ⑲ 归属引用：幽灵归属的个数（0 = 全部引用都对得上；没有 owner 的文本不计数）
    owner_ref: or.length,
    ...cl.metrics,
    ...dn.metrics,
    errors: diags.filter((d) => d.severity === 'error').length,
    warnings: diags.filter((d) => d.severity === 'warning').length,
  };

  return { level, pass: metrics.errors === 0, metrics, diagnostics: diags };
}
