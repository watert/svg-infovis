// =====================================================================
// knives/fit · 按内容反算盒(构建期 helper: 节点 / 卡片 / 旁注)
//
// 由来(260918 archify 复刻实测): `web-app` 有 2 条 `label_fit` —— `Auth Provider` 主标签
// 106px、`Browser / Mobile` 副标签 107.2px, 都塞不进 120px 盒(showcase 档两侧各留 10px →
// 可用 100px)。**盒宽手定**是作者的常规动作, 而"多大的盒子装得下这行字"是纯几何计算:
// archify 由渲染管线自动做, core 的冻结图哲学里它该是**构建期 helper** —— 算一次, 把结果
// 写死进 scene(`node.rect.w/h`), 与零运行时 / 字节确定完全兼容。
//
// 为什么落在 `knives/fit.ts` 而非别处:
//   · 不进 `measure.ts` —— 那个文件的边界注释明写"单行度量, 多行是调用方 split 的活; 不做换行 /
//     截断 / 缩字, 布局决策不归 core"。本刀要算**两行(nodeShape 的主/次标签排布)**的并集高,
//     正是它自己划出去的界; 塞进去等于自打脸, 且会让 measure 那个"纯度量"的定位糊掉。
//   · 不进 `shapes/node.ts` —— 那边是**descriptor 出口**(产 SVG 元素), 本刀产的是数字, 不画东西。
//   · 不进 `scene.ts` —— scene 是产物与戳, 不是计算入口。
//   密度归 `density.ts`、组语义归 `cluster.ts`, 本刀的主题是**合身度**: 与门禁 ⑦ `label_fit`
//   同题(一个判、一个算), 分居两文件而共用同一批常量 —— 这正是本仓"按语义主题开刀"的口径。
//
// 与 `label_fit` 门禁**同源**(这是本刀存在的全部理由, 各写一份是本仓最贵的事故):
//   · 缺省内边距 = `THRESHOLDS[level].labelInset`(直接从 `thresholds.ts` 读, **不复制字面量**);
//     门禁判的是"文字宽 > 盒宽 − 2×labelInset", 本刀反解成"盒宽 = 文字宽 + 2×内边距(向上取整)"
//     —— 与门禁自己那条 `widen-node` 修法的 `Math.ceil(textWidth + 2 * inset)` 逐字同式。
//   · 字号 / 次标签缩量 / 两行行距取 `NODE_TEXT_LAYOUT`(渲染 `nodeShape` 用的同一份数字);
//     字重取 600 / 400, 与 `nodeShape` 画上去的、门禁量宽用的三者一致。
//   · 多行 `\n` 的口径也与门禁一致: 宽取**最宽的一行**。
//
// ⚠️ 缺省同源 ≠ "算出来一定过门禁": 门禁的 inset 钉死在 `THRESHOLDS` 里, **不认作者自己的内边距**。
// 传比呼吸位更小的 `padding`(如 standard 档传 0)算出来的盒, 门禁照旧判它溢出 2×inset —— 那不是 bug,
// 是门禁要的是"呼吸位"而非"不溢出"。所以覆盖内边距只有两个方向用得上: ① 给**更大**的值(形态选择);
// ② 用元组的 y 向(竖直方向门禁不管, 想给两行多留点空气时用)。
//
// 明确不做(别在这里加):
//   · 渲染期自适应 —— 违反冻结图哲学; 本刀只在构建期算一次, 结果由作者写死进 scene。
//   · shrink-to-fit(缩字号自救)—— 本仓已拍板次序: "先让盒子长大, 装不下再缩字号", 它排在本刀之后。
//   · 换行 / 截断 —— 文案是人的决定, 几何不算命。
//
// 输出永远是**估算值**(`measureText` 自带 1.5% 余量, 方向宁宽不窄), 所以算出的盒宽比真排版略宽;
// 门禁判的是"装得下", 略宽只会多留白不会误报。盒子尺寸本身是作者写死的几何, 不走 bounds 那套。
//
// **形状**(260918 菱形 / 圆柱落地时接上): 本刀输出的 `{w, h}` 是**文字块的矩形解**, 再经
// `nodeOuterSize` 换算成形状外壳(rect 恒等 / 菱形两轴 ×2 / 圆柱高度 ×2)。为什么要落在本刀而不是
// 写进文档当一条"记得乘二"的纪律: 门禁 `label_fit` 量的是 `rect`, **看不见形状** —— 菱形按矩形口径
// 给盒照样过门禁(漏报), 于是"按形状给盒"这件事没有第二个人能替作者做; 而换算只有一份(与
// `nodeTextArea` 互为逆), 写成纪律就是又一份会漂的系数。
//
// ⚠️ 仍值导入 `audit.ts`(取 `SCENE_TEXT_DEFAULTS` 与 scene 文本类型)。阈值走 `thresholds.ts`。
// **audit 不许反过来 import 本文件**, 会成环。
// =====================================================================

import { ShapeInputError, assertFiniteNumber, assertOneOf } from '../guard';
import { type Pt, type Rect, round1 } from '../geometry/vec';
// 落点改走盒查询(`placeRect` + `rectAnchor`): 手写 `at - w/2` 这类减法只该有一份口径
import { type AnchorName, placeRect, rectAnchor } from '../geometry/box';
import { rowBlock } from '../geometry/text-rows';
// 对齐词表取 descriptor 那一份(运行时值与类型同源): "字按 start 对齐"与"盒左端落在锚点上"是同一件事
import { TEXT_ANCHORS, type TextAnchor } from '../descriptor';
import { NODE_TEXT_LAYOUT, type NodeShapeKind, assertCapRadius, assertNodeShape, nodeOuterSize } from '../shapes/node';
// 卡片可以带图标, 而"图标离卡片多远"只有一个缺省 —— 读它, 不在本文件重写一个 12
import { ICON_DEFAULTS } from '../shapes/icon';
// `SCENE_TEXT_DEFAULTS` 跟 `SceneText` 住在 audit; 呼吸位跟别的尺子住在 thresholds。两边都读, 都别抄
import { type SceneOwner, type SceneText, SCENE_TEXT_DEFAULTS } from './audit';
import { type AuditLevel, THRESHOLDS } from './thresholds';
import { measureText } from './measure';

/**
 * 主 / 次标签的字重。主标签 600 是 `nodeShape` 画上去的那个值(声明在 `NODE_TEXT_LAYOUT.weight`,
 * 这里只是**引用**它 —— 260920 起它可以被节点覆盖, 于是需要一份单一来源);
 * 次标签 400 是它的缺省(SVG 继承值), 也是门禁量宽时用的那个数。
 * **改渲染字重时, 这里与 `audit.ts` 的 `checkLabelFit` 要一起改**。
 */
const LABEL_WEIGHT = NODE_TEXT_LAYOUT.weight;
const SUB_WEIGHT = 400;

/** 卡片正文的基底字重(400): 卡片是说明文字不是标题 —— 与 `SceneNode.weight` 的缺省同一个数 */
const CARD_WEIGHT = 400;

export type NodeFitOptions = {
  /** 主标签(可含 `\n`: 宽取最宽一行, **高按行数算**; 空串 / 不给 = 没有这一行) */
  label?: string;
  /** 次标签: 小两号、400 字重的后续行(**可含 `\n`: 逐行算宽与行数**, 与 `nodeShape` 同源) */
  sub?: string;
  /** 主标签字号(px)。缺省走 `NODE_TEXT_LAYOUT.fontSize`(13) —— 与 `nodeShape` 同一个缺省 */
  fontSize?: number;
  /**
   * 主标签**字重**(缺省 600, 即 `nodeShape` 画上去的那个)。**必须与节点的 `weight` 同源** ——
   * 它是"卡片正文"这类场景的旋钮: 正文用 400, 只有行内 `**粗**` 那截吃粗体加宽。
   * 不同源就又是"盒按一个字重量、字按另一个字重画"的老病(实测: 600 与 400 相差 3% 宽)。
   */
  weight?: number;
  /**
   * 审计档位, 决定**内边距缺省**取哪一档的呼吸位: standard 6px / showcase 10px。
   * 缺省 `standard`(门禁的缺省档)。作者按 showcase 出图就传 `level: 'showcase'`,
   * 否则算出来的盒宽会在 showcase 门禁下差 4px。
   */
  level?: AuditLevel;
  /**
   * 两侧 / 上下的内边距(px)。语义同 `THRESHOLDS[level].labelInset` 的**内边距**含义(不是坐标位移)。
   * 给单值 = 四边同值; 给 `[x, y]` = 左右 / 上下(与 `groupShape` 的 `labelInset` 同序)。
   * **不传就与门禁同源**(取该档呼吸位), 这是推荐用法。
   *
   * 传了就得知道两件事: ① 门禁的 inset 是钉死的, 传**比它更小**的 x 向值 → 算出来的盒会被判溢出
   * (要的是"呼吸位"不是"不溢出"); ② y 向不受门禁管, 想让两行多留点空气就传元组。
   */
  padding?: number | [number, number];
  /**
   * 形状(缺省 `rect`)。**菱形 / 圆柱的文字可用区比同尺寸矩形小得多**, 盒要按形状换算:
   * `diamond` 两轴 ×2 / `cylinder` 高度 ×2(缺省盖高下)。换算走 `nodeOuterSize` ——
   * 与 `nodeGeometry` 的 `nodeTextArea` **互为逆**, 不在这里另写一份系数(系数各写一份 = 漂开)。
   *
   * ⚠ 门禁 `label_fit` 量的是 **rect**, 它看不见形状: 拿矩形口径的盒去装菱形文字, 门禁照样放行
   * (文字捅出斜边) —— 所以按形状算盒这件事只能靠这里, 别指望门禁提醒。
   */
  shape?: NodeShapeKind;
  /** 圆柱盖高(px)。缺省与 `nodeShape` 同一处(盒高 × `CYLINDER_CAP_RATIO`); 给了就按 4×它加高 */
  capRadius?: number;
};

export type NodeFitResult = {
  /** 盒宽: `ceil(宽度外壳)` —— rect 是 `内容宽 + 2×padX`(与门禁 ⑦ 的 `widen-node` 修法同式), 菱形再 ×2 */
  w: number;
  /**
   * 盒高: `ceil(高度外壳)`。**行数说了算** —— label 里的 `\n` 每多一行就多一个行距 + 一个行盒,
   * 次标签也算一行(与 `nodeShape` 的真排布逐行同源); 菱形 ×2、圆柱 + 4×盖高。
   * 这是**内容驱动的下限**, 不是"该给多少": 版式节奏想给更高的盒(复刻图里两行节点
   * 给到 60/64) 照样给 —— 只要别低于这个数。
   */
  h: number;
  /** 本次采用形状(缺省 `rect`) */
  shape: NodeShapeKind;
  /**
   * 真会画出来的行数 = `\n` 拆出的 label 行 + 可选的次标签行。**`contentH` 就是按它给的** ——
   * 想对账"盒高是不是漏算了行", 拿它去比 `nodeShape` 实际吐出的 `<text>` 条数即可。
   */
  lines: number;
  /** 主标签估算宽(px); 没有主标签则 0。可与门禁的 `evidence.textWidth` 直接对账 */
  labelWidth: number;
  /** 次标签估算宽(px); 没有则 0 */
  subWidth: number;
  /** 内容高(不含内边距): 一行 = 那个行盒; 两行 = 行距 + 两行盒高均值 */
  contentH: number;
  /** 实际采用的内边距 `[x, y]` —— 用它复算 `w - 2*padding[0]` 就是门禁的可用宽 */
  padding: [number, number];
  /** 实际采用的主标签字号 */
  fontSize: number;
};

/** 一行 / 多行文本的估算盒: 宽取最宽一行(与门禁同口径); `lines` = 真会画几行(`\n` 拆出来的), 供行块几何用 */
function lineBox(text: string, fontSize: number, weight: number): { width: number; height: number; lines: number } {
  const perLine = text.split('\n').map((t) => measureText(t, { fontSize, weight }));
  return { width: Math.max(...perLine.map((r) => r.width)), height: perLine[0].height, lines: perLine.length };
}

/**
 * 两种内边距的提示语 —— 节点上它是**门禁要的呼吸位**, 旁注上它是**检测盒余量**(没有宽度门禁)。
 * 提示语分两份是因为这两个语义真不同, 合成一句会让作者按错的那半边理解。
 */
const HINT_NODE_PAD = '不传就与门禁同源(取 THRESHOLDS[level].labelInset); 传了就得自己保证装得下';
const HINT_TEXT_PAD = '旁注没有宽度门禁, 所以这里不是呼吸位而是检测盒余量; 想贴住墨迹就给 0(缺省)';

/** 归一内边距并守卫: 非有限值 / 负值都是编程错误(non-有限走 guard 口径当场抛, 不静默成 0) */
function resolvePadding(
  padding: number | [number, number] | undefined, fallback: number,
  owner = 'nodeFit', hint = HINT_NODE_PAD,
): [number, number] {
  const raw: [number, number] =
    padding === undefined ? [fallback, fallback]
    : typeof padding === 'number' ? [padding, padding]
    : padding;
  assertFiniteNumber(owner, 'padding[0]', raw[0], hint);
  assertFiniteNumber(owner, 'padding[1]', raw[1], hint);
  if (raw[0] < 0 || raw[1] < 0) {
    throw new ShapeInputError(owner, 'padding', `为负(${raw})`, '内边距是尺寸不是增量; 要贴边就给 0');
  }
  return raw;
}

/**
 * 按内容反算节点盒: 输入主 / 次标签(字号 + 内边距), 输出能装下它们的 `{ w, h }` + 可复算证据。
 *
 * 典型用法(构建期算一次, 结果写死进 scene):
 * ```ts
 * const fit = nodeFit({ label: 'Auth Provider', sub: 'OAuth 2.0' });  // standard 档
 * const n = { id: 'auth', rect: { x: 40, y: 110, w: fit.w, h: fit.h }, label: 'Auth Provider', sub: 'OAuth 2.0' };
 * ```
 *
 * 竖直方向的口径: 逐行按 `nodeShape` 的真排布算 —— label 的每一行(`\n` 拆出来的)各占一行,
 * 次标签(`sub`)跟在其后, 所有相邻行共用同一个行距 `NODE_TEXT_LAYOUT.lineGapEm × 主字号`;
 * 整块高取这些行盒的**并集**(走 `geometry/text-rows`, 与 `nodeShape` / `export.ts` 同一份公式)。
 * `sub` **单独**给也算一行(按它的字号), 但 `nodeShape` 不画没有主标签的次标签 ——
 * 那是坏 scene, 由作者修, 不在这里猜。
 *
 * 多行口径(260920 修): `\n` 是**作者写下的换行**, `nodeShape` 逐行照画 —— 所以宽取最宽行
 * (与门禁同口径), **高按行数给**。修之前这两件事是互相矛盾的: 渲染已经拆行, 本刀还把整串当
 * 一行给高, 于是 N 行标签的盒比字矮(实测 3 行泳道名按 39px 的盒画进 51px 的字),
 * 而 `label_fit` **只判宽** ⇒ 门禁全绿出厂。本刀仍然**不替作者决定在哪换行** ——
 * 文案是人的决定, 它只忠实按已经写下的 `\n` 算。
 *
 * ⚠️ 高度这一侧**没有任何门禁**: `label_fit` 判的是"文字宽 > 盒宽 − 2×inset", 高度全靠作者
 * 按本刀给的数自己给盒。所以手写 rect(不走本刀)的作者把 N 行塞进矮盒时 audit 不会响 ——
 * 本刀是这一侧的**唯一**保障, 闭环断言在 `test/node-fit.test.ts`(渲染行心 === 行块偏移)。
 *
 * 形状口径(260918 落菱形 / 圆柱时补): 上述 `{w, h}` 是**文字块的矩形解**, 再经 `nodeOuterSize`
 * 换算成形状外壳 —— rect 恒等(所以既有调用一字不变), 菱形两轴 ×2, 圆柱高度 ×2。为什么值得放在这里:
 * 门禁 `label_fit` 只量 `rect` 宽, 它**看不见形状** —— 菱形按矩形口径给盒照样过门禁, 但字会捅出斜边。
 * 所以"按形状给盒"这件事只有本刀能做, 且必须与几何(`nodeTextArea`)互为逆。
 */
export function nodeFit(opts: NodeFitOptions): NodeFitResult {
  const size = opts.fontSize ?? NODE_TEXT_LAYOUT.fontSize;
  assertFiniteNumber('nodeFit', 'fontSize', size, '字号是必填几何量; 不传就走 NODE_TEXT_LAYOUT.fontSize');
  assertNodeShape('nodeFit', opts.shape);
  assertCapRadius('nodeFit', opts.capRadius);
  const shape: NodeShapeKind = opts.shape ?? 'rect';
  const [padX, padY] = resolvePadding(opts.padding, THRESHOLDS[opts.level ?? 'standard'].labelInset);

  // 真值口径与 `nodeShape` 的 `if (p.label && p.sub)` 一致: 空串 = 没有这一行
  const subSize = size - NODE_TEXT_LAYOUT.subSizeDelta;
  const labWeight = opts.weight ?? LABEL_WEIGHT;
  const lab = opts.label ? lineBox(opts.label, size, labWeight) : null;
  const sb = opts.sub ? lineBox(opts.sub, subSize, SUB_WEIGHT) : null;

  const contentW = Math.max(lab?.width ?? 0, sb?.width ?? 0);
  // 行块: label 的每一行各占一行(走 `size`), 次标签的**每一行**跟在其后(自己那号字) ——
  // 与 `nodeShape` 的 rows 同序同长。**次标签也要按 `\n` 拆**(260920 之后补): 这一份此前只给
  // 次标签记 1 行, 于是 N 行 sub 的盒高少算 (N−1) 个行距 —— 而高度这一侧没有任何门禁,
  // 少算的行全画到盒外去了(`label_fit` 只判宽)。宽那一侧本来就用 `lineBox` 取最长行, 两半不同源。
  // 堆叠公式走 `geometry/text-rows` 那一份(渲染 / 出口 / 这里三方共用): 260920 事故的病灶正是
  // 这套"中心对称堆叠"被写了三份, 而本文件这份漂在旧口径(整串当一行)。
  const rowHeights = [
    ...Array.from({ length: lab?.lines ?? 0 }, () => lab?.height ?? 0),
    ...(sb ? Array.from({ length: sb.lines }, () => sb.height) : []),
  ];
  const contentH = rowBlock(rowHeights.length, size * NODE_TEXT_LAYOUT.lineGapEm, rowHeights).height;

  // 形状外壳: rect 恒等(既有输出逐字不变), 菱形 / 圆柱按 nodeTextArea 的反解放大
  const outer = nodeOuterSize(shape, contentW + 2 * padX, contentH + 2 * padY, { capRadius: opts.capRadius });

  return {
    w: Math.ceil(outer.w),
    h: Math.ceil(outer.h),
    shape,
    lines: rowHeights.length,
    labelWidth: lab?.width ?? 0,
    subWidth: sb?.width ?? 0,
    contentH,
    padding: [padX, padY],
    fontSize: size,
  };
}

// --- 卡片(左对齐多行说明块, 260920 ontology 图) ---------------------------
//
// 由来: "图标 + 说明卡片" 那类图里, 卡片装的是**逐行的说明文字**(`Object Type: **Airport**` /
// `Object: JFK` / `Properties: ...`), 而 `nodeFit` 那份口径是"主标签 + 次标签"的**居中**排布:
//   · 它按 600 字重算宽(那是标题的字重), 而卡片正文是 400 —— 混用会让盒宽差 3%(老病: 盒与字不同源)
//   · 它只回答一个盒, 而这里要的是"图标 + 间隙 + 卡片"整块 —— 图标画在盒**上方**, 它占的高度
//     必须从块高里扣, 否则两张卡片按同一 y 摆会一个压住另一个的图标
// 所以这里是**第二个反函数**, 不是一个新引擎: 度量还是 `measureText`(行内 `**粗**` 也在那一层算),
// 堆叠还是 `rowBlock`, 内边距缺省还是 `THRESHOLDS[level].labelInset`。它与 `nodeFit` 共享全部零件,
// 只是把"排布口径"换成左对齐正文 + 上方图标。
//
// **为什么不做成 `nodeFit` 的一个开关**: 那个函数的返回面是"盒 + 主/次标签宽"(`labelWidth` /
// `subWidth` / `contentH`), 加一路 icon 会让每个消费方都得判"这几位这时是什么意思"。两个场景、
// 两份口径、两个函数 —— 各自的返回面都说得清自己。

export type CardFitOptions = {
  /** 逐行文字(每行一个元素; 行内 `**粗**` 走 `geometry/inline-text` 解析, 与渲染同源) */
  lines: readonly string[];
  /** 正文字号(px), 缺省 `NODE_TEXT_LAYOUT.fontSize`(13) —— 必须与节点的 `fontSize` 同源 */
  fontSize?: number;
  /** **基底**字重(缺省 400: 卡片是正文, 不是标题)。行内 `**粗**` 那几截另算 600 */
  weight?: number;
  /** 审计档位 → 内边距缺省取该档呼吸位(standard 6 / showcase 10), 与 `label_fit` 同源 */
  level?: AuditLevel;
  /** 内边距(px)。单值 = 四边; `[x, y]` = 左右 / 上下。不传即与门禁同源 */
  padding?: number | [number, number];
  /** 图标边长(px)。**给了才算进块高** —— 不给就是一张纯文字卡片 */
  iconSize?: number;
  /** 图标与卡片顶边的间隙(px), 缺省 `ICON_DEFAULTS.gap`(12)。只在给了 `iconSize` 时有意义 */
  iconGap?: number;
};

export type CardFitResult = {
  /** 卡片盒宽(含内边距) —— 与门禁 `label_fit` 的 `widen-node` 修法同式 */
  w: number;
  /** 卡片盒高(含内边距) —— 行数说了算(与 `nodeShape` 的行块同源) */
  h: number;
  /** 整块(图标 + 间隙 + 卡片)的宽高; 没给 `iconSize` 时等于 `{ w, h }` */
  block: { w: number; h: number };
  /** 图标矩形, 坐标是**相对卡片左上角**的(y 必为负: 图标在卡片上方); 没给 `iconSize` 就是 null */
  icon: Rect | null;
  /** 实际采用的内边距 */
  padding: [number, number];
  /** 实际采用的正文字号 */
  fontSize: number;
  /** 实际采用的基底字重(渲染时写进节点的 `weight`) */
  weight: number;
  /** 逐行估算宽(对账用: 与门禁 `evidence.textWidth` 比的就是这里的 max) */
  lineWidths: number[];
  /** 行数(`\n` 不算 —— 这里 each 元素就是一行; 空行也算一行) */
  lines: number;
};

/**
 * 按内容反算**卡片**(左对齐多行正文, 可选上方图标)。
 *
 * 典型用法: 先算, 再摆, 最后把 `w/h/weight` 写进节点(scene 里存的是算好的几何, 不是这个函数):
 * ```ts
 * const f = cardFit({ lines: ['Object Type: **Airport**', 'Object: JFK'], iconSize: 72, level: 'showcase' });
 * const { card, icon } = placeCard(f, { x: 500, y: 300 });      // 传的是**整块的中心**
 * const node = { id: 'airport', rect: card, label: lines.join('\n'), align: 'start', weight: f.weight,
 *                icon: { asset: iconAsset('plane'), size: f.block ? ... } };
 * ```
 * ⚠ 卡片是**左对齐**的, 所以它的左右内边距就是**真的留白**(`nodeShape` 用同一个数落 x);
 * 居中排布的节点不看这两个数。
 */
export function cardFit(opts: CardFitOptions): CardFitResult {
  const size = opts.fontSize ?? NODE_TEXT_LAYOUT.fontSize;
  assertFiniteNumber('cardFit', 'fontSize', size);
  const weight = opts.weight ?? CARD_WEIGHT;
  assertFiniteNumber('cardFit', 'weight', weight);
  const [padX, padY] = resolvePadding(opts.padding, THRESHOLDS[opts.level ?? 'standard'].labelInset);
  const lines = [...opts.lines];
  if (!lines.length) {
    throw new ShapeInputError('cardFit', 'lines', '一行都没有', '空卡片是 0×0 的盒, 摆到图上没人看得出是漏了内容');
  }
  for (const l of lines) {
    if (typeof l !== 'string') {
      throw new ShapeInputError('cardFit', 'lines', `有一行不是字符串(拿到 ${typeof l})`, '逐行文字: 数组的每个元素就是一行', '文本数组');
    }
  }
  const perLine = lines.map((t) => measureText(t, { fontSize: size, weight }));
  const lineWidths = perLine.map((r) => r.width);
  const contentW = Math.max(...lineWidths);
  const contentH = rowBlock(perLine.length, size * NODE_TEXT_LAYOUT.lineGapEm, perLine.map((r) => r.height)).height;

  const w = Math.ceil(contentW + 2 * padX);
  const h = Math.ceil(contentH + 2 * padY);

  const iconSize = opts.iconSize;
  if (iconSize !== undefined) {
    assertFiniteNumber('cardFit', 'iconSize', iconSize);
    if (!(iconSize > 0)) {
      throw new ShapeInputError('cardFit', 'iconSize', `必须为正(拿到 ${iconSize})`, '图标边长是尺寸不是增量; 不要图标就别给这一位');
    }
  }
  const iconGap = opts.iconGap ?? ICON_DEFAULTS.gap;
  if (iconSize !== undefined) assertFiniteNumber('cardFit', 'iconGap', iconGap);
  if (iconSize !== undefined && iconGap < 0) {
    throw new ShapeInputError('cardFit', 'iconGap', `为负(${iconGap})`, '间隙是尺寸不是增量; 想贴住卡片就给 0');
  }

  return {
    w, h,
    block: iconSize === undefined ? { w, h } : { w: Math.max(w, iconSize), h: iconSize + iconGap + h },
    // 相对卡片左上角: 水平居中, 垂直负向(在卡片上方) —— `placeCard` 只做一次平移
    icon: iconSize === undefined ? null : { x: round1((w - iconSize) / 2), y: round1(-iconGap - iconSize), w: iconSize, h: iconSize },
    padding: [padX, padY],
    fontSize: size,
    weight,
    lineWidths,
    lines: lines.length,
  };
}

/**
 * 把反算好的卡片摆到画布上。入参 `at` 是**整块(含图标)的中心** —— 一张卡片带不带图标,
 * 它的"心"都在块上, 于是同一列里几个实体互换 y 不会因为图标有无而错位。
 *
 * 落点全部走 `geometry/box` 的 `placeRect`(缺省锚 = 心; 卡片贴块的底边中点 ⇒ 锚 `'s'`),
 * 手写减法只在图标那一处 —— 它是"相对卡片左上角"的平移, 不是一次独立落位。
 */
export function placeCard(fit: CardFitResult, at: { x: number; y: number }): { card: Rect; icon: Rect | null; block: Rect } {
  assertFiniteNumber('placeCard', 'at.x', at.x);
  assertFiniteNumber('placeCard', 'at.y', at.y);
  const block: Rect = placeRect(fit.block, at, { anchor: 'center' });
  // 卡片: 底边贴住块的底边、水平居中(块的 bottom 面中点是它的锚点)
  const card: Rect = placeRect({ w: fit.w, h: fit.h }, rectAnchor(block, 's'), { anchor: 's' });
  const icon: Rect | null = fit.icon
    ? { x: round1(card.x + fit.icon.x), y: round1(card.y + fit.icon.y), w: fit.icon.w, h: fit.icon.h }
    : null;
  return { card, icon, block };
}

// --- 旁注块(自由文本, 260923): 第三把"按内容反算盒"的刀 ---------------------
//
// 由来(`textFit` 立项, 260923 落地): 前两把刀管节点(`nodeFit`)与卡片(`cardFit`),
// 而**旁注(`Scene.texts`)的 rect 一向靠每处手搓**。260922 清点 examples: 五份 helper 三套高度
// 口径(`size×1.4` / `m.height` / `size×1.25`), 且**多数只处理单行** —— 自建 helper 把多行文案
// 整串喂 `measureText`(它明写不拆 `\n`, 见该文件边界), 于是 rect 按"所有行拼成一行"算宽,
// 而渲染按 `\n` 逐行画 ⇒ **检测盒比真墨迹窄**: `text_overlap` / `text_clearance` 全绿而字压别人。
// 与 `labelBoxSize`(遮罩片尺寸的唯一来源)同一路数: 先把"尺寸的唯一来源"收成一刀, 再谈别的。
//
// 与渲染**逐字同源**(`export.ts` 那段 `scene.texts` 的上屏), 四件事各自只有一份:
//   · 行数 = `content.split('\n')`; 宽取**最宽一行**; 高取 `rowBlock` 的**行块并集**
//     (与 `shapes/node.ts` / `export.ts` / `nodeFit` 共用同一份堆法公式, 见 `geometry/text-rows`)
//   · 行距 = `fontSize × NODE_TEXT_LAYOUT.lineGapEm` —— 渲染写死的就是它, 所以本刀**不给**
//     `lineGapEm` 旋钮: 给了就是第二个权威(盒按一个行距算、字按另一个画)
//   · 缺省字号 = `SCENE_TEXT_DEFAULTS.fontSize`(11, 缺省跟 `SceneText` 类型住一起)
//   · `anchor` 决定 rect 的**哪条边落在锚点上**(start = 左中 / middle = 盒心 / end = 右中),
//     与 `placeRect` 的 `'w' | 'center' | 'e'` 一一对应 —— 渲染取 x 用的也是这三条边
//
// `padding` 与 `nodeFit` 的那个**不是一回事**: 节点上它是门禁要的呼吸位(`label_fit` 判宽度),
// 旁注上没有任何宽度门禁(`text_clearance` / `text_overlap` 判的是 rect 与线、与别的文本的净空),
// 所以它是**检测盒余量** —— 缺省 **0**(贴住墨迹盒)。⚠ 它只把**检测盒**撑大(门禁更保守),
// **不移动文字**: 落位按 rect 的锚点边 / 中心, 而那正是 `at`(`placeText` 保证这一条)。
//
// 输出永远是**估算值**(`measureText` 自带 1.5% 余量, 方向宁宽不窄), `w` / `h` 一律 `Math.ceil`
// (与 `nodeFit` 同口径)。盒子尺寸是作者写死的几何, 不走 bounds 那套。
//
// 分段与 `labelBoxSize` / `edgeLabel` 那次拆分同一条理由: "量多大"与"放哪"合在一个函数里,
// 于是只要尺寸的调用方无路可走(序列图模板曾伪造一条 1px 的假边去抠宽度)。三个出口各司其职:
//   · `textFit`   —— 只回答"这块字要多大"(尺寸 + 可复算证据)
//   · `placeText` —— 把尺寸落成 rect(`at` 是**锚点要落的位置**)
//   · `textNote`  —— 一步产出 `SceneText`(旁注的常规用法; 内部就是前两者 + id/color)

export type TextFitOptions = {
  /** 旁注文字(可含 `\n`: 逐行照画, 行块对盒中心对称) */
  content: string;
  /** 字号(px)。缺省 `SCENE_TEXT_DEFAULTS.fontSize`(11) —— 与渲染同一个缺省 */
  fontSize?: number;
  /** 字重(缺省 400, 即 `SceneText.weight` 的缺省)。行内 `**粗**` 那几截另算 600 */
  weight?: number;
  /** 水平对齐 / 锚点边(缺省 `middle`): 同时决定文字怎么排与 rect 的哪条边落在 `at` 上 */
  anchor?: TextAnchor;
  /** 检测盒余量(px)。单值 = 四边; `[x, y]` = 左右 / 上下。**不是呼吸位**(旁注没有宽度门禁) */
  padding?: number | [number, number];
};

export type TextFitResult = {
  /** 盒宽: `ceil(最宽一行 + 2×padX)`(宁宽不窄, 与 `nodeFit` 同口径) */
  w: number;
  /** 盒高: `ceil(行块并集高 + 2×padY)` —— **行数说了算**(`\n` 是作者写下的换行) */
  h: number;
  /** 最宽一行的估算宽(不含内边距); 可与 `text_overlap` 的证据直接对账 */
  contentW: number;
  /** 行块并集高(不含内边距): 一行 = 那个行盒; N 行 = `rowBlock` 的并集 */
  contentH: number;
  /** 真会画出来的行数(`\n` 拆出来的) —— 拿它比渲染吐出的 `<text>` 条数即可 */
  lines: number;
  /** 逐行估算宽(对账用: `max` 就是 `contentW`) */
  lineWidths: number[];
  /** 本次采用的水平对齐 */
  anchor: TextAnchor;
  /** 实际采用的检测盒余量 `[x, y]` */
  padding: [number, number];
  /** 实际采用的字号 */
  fontSize: number;
  /** 实际采用的基底字重 */
  weight: number;
  /** 实际采用的行距(px) = `fontSize × NODE_TEXT_LAYOUT.lineGapEm`; 与渲染同一份 */
  lineGap: number;
};

/**
 * 按内容反算**旁注块**的尺寸: 逐行度量取最宽 + 行块并集高, 再各加内边距。
 *
 * 典型用法(构建期算一次, 结果写死进 `scene.texts`):
 * ```ts
 * const fit = textFit({ content: 'GHOST\n(discarded)', fontSize: 11 });
 * const note: SceneText = { id: 'ghost-note', rect: placeText(fit, { x: 550, y: 660 }), ... };
 * // 或一步到位: const note = textNote({ id: 'ghost-note', content: '…', at: { x: 550, y: 660 } });
 * ```
 *
 * ⚠ 高度这一侧**没有任何门禁**(`text_overlap` 只在两块文本真的重叠时报, 它不知道"你本来想要多高"),
 * 所以本刀是"盒装得下这些行"的**唯一**保障 —— 手写 rect 的作者把 N 行塞进矮盒时, 门禁只在真撞上
 * 别人时才响。
 */
export function textFit(opts: TextFitOptions): TextFitResult {
  const content = opts.content;
  if (typeof content !== 'string') {
    throw new ShapeInputError('textFit', 'content', `不是字符串(拿到 ${typeof content})`,
      '尺寸是从文字算出来的; 要摆一个尺寸自己定的盒子请直接写 `SceneText`');
  }
  if (!content) {
    throw new ShapeInputError('textFit', 'content', '是空串',
      '空文本量出来是 0 宽的盒, 摆到图上没人看得出是漏了内容(同 `cardFit` 对空 `lines` 的立场)');
  }
  assertOneOf('textFit', 'anchor', opts.anchor, TEXT_ANCHORS);
  const size = opts.fontSize ?? SCENE_TEXT_DEFAULTS.fontSize;
  assertFiniteNumber('textFit', 'fontSize', size, '字号是必填几何量; 不传就走 SCENE_TEXT_DEFAULTS.fontSize');
  if (!(size > 0)) {
    throw new ShapeInputError('textFit', 'fontSize', `不是正数(拿到 ${size})`, '字号是尺寸不是增量');
  }
  // 字重缺省 400 = `SceneText.weight` 的缺省(SVG 继承值), 也是 `measureText` 的缺省
  const weight = opts.weight ?? 400;
  assertFiniteNumber('textFit', 'weight', weight);
  const [padX, padY] = resolvePadding(opts.padding, 0, 'textFit', HINT_TEXT_PAD);

  const lines = content.split('\n');
  const perLine = lines.map((t) => measureText(t, { fontSize: size, weight }));
  const lineWidths = perLine.map((r) => r.width);
  const contentW = Math.max(...lineWidths);
  // 行距与堆法取渲染那一份: 同一个 `rowBlock`、同一个 `lineGapEm` —— 各写一份必然漂
  const lineGap = size * NODE_TEXT_LAYOUT.lineGapEm;
  const contentH = rowBlock(lines.length, lineGap, perLine.map((r) => r.height)).height;

  return {
    w: Math.ceil(contentW + 2 * padX),
    h: Math.ceil(contentH + 2 * padY),
    contentW, contentH,
    lines: lines.length,
    lineWidths,
    anchor: opts.anchor ?? 'middle',
    padding: [padX, padY],
    fontSize: size,
    weight,
    lineGap,
  };
}

/**
 * 把尺寸落成 rect: `at` 是 **`anchor` 指定的那条边**要落的位置
 * (`start` → 左中 / `middle` → 盒心 / `end` → 右中, 垂直一律取盒心)。
 *
 * 落点走 `placeRect`(手写 `at.x - w/2` 只该有一份口径), 与 `cardFit` 的 `placeCard` 同族:
 * 那边是"整块中心", 这里是"锚点边"。返回值就是 `SceneText.rect` ——
 * 渲染按它落位、审计按它量净空, 同一个矩形。
 */
export function placeText(fit: TextFitResult, at: Pt): Rect {
  assertFiniteNumber('placeText', 'at.x', at.x);
  assertFiniteNumber('placeText', 'at.y', at.y);
  const anchor: AnchorName = fit.anchor === 'start' ? 'w' : fit.anchor === 'end' ? 'e' : 'center';
  return placeRect({ w: fit.w, h: fit.h }, at, { anchor });
}

export type TextNoteOptions = TextFitOptions & {
  id: string;
  /** 锚点落点: 语义由 `anchor` 决定(`start` = 文字左端 / `middle` = 块心 / `end` = 文字右端) */
  at: Pt;
  /** 文字色(缺省 `theme.label`)。同族语义: 红字警示注 / 强调标题 */
  color?: string;
  /**
   * **归属声明**(缺省不声明)。原样透传给 `SceneText.owner` —— 本刀只做组装, 不解释它:
   * 豁免面在 `audit.ts` 的 `checkTextClearance` 里, 落位仍由这里的 `at` 说了算。
   */
  owner?: SceneOwner;
};

/**
 * 一步产出旁注 `SceneText`: 算尺寸 → 落位 → 组装。
 *
 * `fontSize` / `weight` / `anchor` / `owner` **原样透传**(没给就不上屏字段) —— 于是缺省由渲染与
 * `textFit` 各自从同一处取, 产物与手写的 `SceneText` 逐字节一致(补一个 `weight: 400` 会多输出一个属性)。
 * `rect` 用的是**解析后**的 fit, 所以缺省字号 / 缺省锚点下的盒子与实际画出来的字同源。
 */
export function textNote(o: TextNoteOptions): SceneText {
  const fit = textFit(o);
  return {
    id: o.id,
    rect: placeText(fit, o.at),
    text: o.content,
    fontSize: o.fontSize,
    weight: o.weight,
    anchor: o.anchor,
    color: o.color,
    owner: o.owner,
  };
}
