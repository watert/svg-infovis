// =====================================================================
// shapes/node · 节点 descriptor (圆角矩形 / 菱形 / 圆柱三态)
//
// 形状是**语义**的载体: 菱形 = 判定(decision), 圆柱 = 数据存储(db) —— 流程图与架构图里
// 约 80% 的形状缺口就是这两个(260918 与 archify 对账的 B 档缺口, 现状只有圆角矩形一种)。
//
// 落点: 形状是 `NodeProps` 上的一个**语义槽**(与 `tone` 同族), 出入口仍只有 `nodeShape` 一个。
// 为什么不另开 `diamondShape` / `cylinderShape` 两个出口:
//   · scene 是**数据**, 形状得能写进 JSON —— 函数式出口进不了 scene, 迟早还得补一个判别字段,
//     分发点于是又长回来(而它只能落在 node.ts 或出口那一层)
//   · 三种形态的**文字排布一字不差**(两个新形状的文字带都以盒中心对称, 见 nodeTextArea):
//     各开一个文件 = 各抄一遍文本发射, 那是本仓最贵的事故
//   · "文字可用区 ↔ 外壳尺寸"是一对互逆函数, 只许有一份(几何与 `nodeFit` 共用)
// 机制仍是"新形状 = 新写一个吐 d 的纯函数": 加第四种就往 `NODE_SHAPE_KINDS` 加个词、
// `nodeGeometry` 加一支, 没有注册表 / 插件 / 类。真长到读不动时把几何主体抽去 node-form.ts,
// **出入口保持 nodeShape 一个**(零注册表的实质在这条, 不在文件怎么切)。
//
// 几何来自 radiusPolygonPath(菱形 = 四边中点的凸四边形, 与矩形共用同一套圆角解算),
// 且把解算结果(切点 / 圆心 / 实际半径)一并交出来 —— "哪个角被邻段钳制到违规"这件事,
// audit 要能直接读到, 不靠猜 path 字符串。
//
// 配色走主题语义槽: `tone`(哪一色) × `variant`(outline 描边 / solid 实底) × `theme`(明暗)。
// 需要单点例外(如 audit 演示里的违规红)时才用 fill/stroke/textColor 直接覆盖。
// =====================================================================

import { type Attrs, type DGroup, type Descriptor, anchorAttrs, baselineY, group, path, richText, text } from '../descriptor';
import { DEFAULT_THEME, type Theme, type Tone, type Variant, toneStyle } from '../theme';
import { ShapeInputError, assertFiniteNumber, assertFiniteRect, assertOneOf } from '../guard';
import { type Tangent, radiusPolygonPath } from '../geometry/rounded-path';
import { rowBlock } from '../geometry/text-rows';
import { parseTextRuns } from '../geometry/inline-text';
import { type Pt, type Rect, fmt, round1 } from '../geometry/vec';
import { type NodeIcon, iconRect, iconShape } from './icon';

/** 形状词表。**运行时值与类型同源**(`NodeShapeKind` 由它推出) —— 加一种形状只改这里一处 */
export const NODE_SHAPE_KINDS = ['rect', 'diamond', 'cylinder'] as const;

/** 标签的水平对齐词表(`nodeShape` 的 `align`); 与形状同规矩: 运行时可查, 写错当场抛 */
export const NODE_ALIGN_KINDS = ['center', 'start'] as const;
export type NodeAlign = (typeof NODE_ALIGN_KINDS)[number];

/**
 * 节点的**形状词汇**: `rect` 圆角矩形(缺省) / `diamond` 菱形(判定 decision) / `cylinder` 圆柱(数据存储 db)。
 * 与 `tone` 同族 —— 它说的是"这一格在图上是什么角色", 不是"怎么画"(那是样式参数的事)。
 */
export type NodeShapeKind = (typeof NODE_SHAPE_KINDS)[number];

export type NodeProps = {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 主标签(可含 `\n`: 逐行照画, 行块对盒中心对称) */
  label?: string;
  /** 次标签(小两号、更淡, 主标签行块下方)。**同样支持 `\n`** —— 与 `label` 同一行距口径 */
  sub?: string;
  radius?: number;
  /** 形状(缺省 `rect`)。**几何 bbox 恒等于 rect** —— 三种形态都顶满盒子, 见 NodeGeometry.rect */
  shape?: NodeShapeKind;
  /**
   * 圆柱盖高(椭圆半轴, px)。缺省 = 盒高 × `CYLINDER_CAP_RATIO`(此时文字可用区恰是盒的中央一半);
   * 上限 `h/2`(再高两个盖就相交), 被钳制时 `NodeGeometry.capClamped` 为 true。
   */
  capRadius?: number;
  /**
   * **主标签的字重**(缺省 600, 即标题档)。**卡片这类"正文块"要显式给 400** ——
   * 400 与 600 的估算宽差 3%, 所以它必须与 `nodeFit` / `cardFit` 算盒时用的那个数同源,
   * 否则又是"盒按一个字重量、字按另一个字重画"。
   * (行内 `**粗**` 那几截恒取 `max(字重, 600)` —— 与 `measureText` 里那条逐字同源。)
   */
  weight?: number;
  /**
   * **标签的水平对齐**: `center`(缺省, 居中)/ `start`(左对齐)。
   *
   * 左对齐时 x = `rect.x + padX` —— 于是 `padX` 就是**左右内边距**, 与门禁 `label_fit` 的
   * `THRESHOLDS[level].labelInset` 是同一个量。谁把这个数给进来: **出口**(`export.ts` 知道档位,
   * 由它按节点上的 `padX` 或该档呼吸位填)。core 的几何层**不预扣呼吸位**(与 `nodeTextArea`
   * 那条口径一致: 呼吸位是门禁的事), 所以这里缺省 0 = 贴盒边。
   */
  align?: NodeAlign;
  /** 左对齐时的左内边距(px)。语义见 `align`; 缺省 0(几何不预扣呼吸位) */
  padX?: number;
  /**
   * **图标**(画在盒正上方, 语义槽): 由 `knives/fit.ts` 的 `cardFit({ iconSize })` 反算位置,
   * 渲染走 `iconShape`。不参与任何净空门禁(见 `shapes/icon.ts` 文件头的"门禁边界")。
   */
  icon?: NodeIcon;
  /** 色调(默认 slate 中性) */
  tone?: Tone;
  /** outline(默认) / solid(实色底) */
  variant?: Variant;
  theme?: Theme;
  /** 单点覆盖(少数例外才用) */
  fill?: string;
  stroke?: string;
  textColor?: string;
  strokeWidth?: number;
  dash?: string;
  fontSize?: number;
  /**
   * 整节点淡化(0~1, 缺省 1 不输出属性)。**语义槽**: ghost 处理("这格已被废弃/不再参与")
   * 与红 X(`struck`)配套 —— 参考图 260919 学术风对照里的 Ephemeral Reasoning 一格。
   * 进 scene(`SceneNode.opacity`), 不进审计(颜色透明度不是几何事实)。
   */
  opacity?: number;
  /**
   * 废除叉(红 X 压在节点上, 画在文字**之后**所以连文字一起划掉)。**语义槽**:
   * "这格被废除"是图在说什么, 不是怎么画 —— 与 `tone` / `variant` 同族, 进 scene。
   * 叉色取 `theme.tones.rose.solidBorder`(深红), 线宽 2, 端点贴盒角(不出盒, 不参与净空审计)。
   */
  struck?: boolean;
};

export type NodeGeometry = {
  /** 本次解算的形状(缺省 `rect`) */
  shape: NodeShapeKind;
  rect: Rect;
  d: string;
  /** 只描不填的附加线(圆柱前缘弧), 顺序即绘制顺序; 其余形态为空 */
  details: string[];
  /**
   * **文字可用区**(内接于形状的矩形, 全画布绝对坐标)。
   *
   * 为什么几何要把它交出来: 三种形态里只有矩形"看起来 = 装上", 菱形 / 圆柱都比同尺寸矩形小得多,
   * 而 audit 的 `label_fit` 量的是 `rect`。渲染、`nodeFit`、作者三方读同一份换算(见 `nodeTextArea`),
   * 不然就是"门禁量一个盒、渲染画另一个盒"的老病。
   */
  textRect: Rect;
  /** 圆柱实际盖高(非圆柱为 0) */
  capRadius: number;
  /** 作者的盖高被 `h/2` 上限钳过 —— 钳制要报一声, 不许静默改写调用方参数 */
  capClamped: boolean;
  corners: Tangent[];
  /** 期望半径被邻段钳制过的角下标 */
  clamped: number[];
  /** 最小可用半径的下限(供 audit 判"半径被压到不成圆角"); 圆柱没有多边形角 → 0 */
  minActualRadius: number;
};

/**
 * 圆柱盖高(椭圆半轴) = 盒高 × 本值。
 *
 * 取 1/8 的理由是**它与"中央一半"这条口径咬得上**: 文字上沿受顶盖前缘弧的最低点(盒顶下 2·ry)所限、
 * 下沿对称, 故文字可用高 = h − 4·ry = h/2 —— 与菱形的文字带同一条口径(盒的中央一半),
 * 于是 `nodeOuterSize` 的反解也是同一个 ×2, 没有第二套系数好记。
 */
export const CYLINDER_CAP_RATIO = 1 / 8;

const rectPoints = (x: number, y: number, w: number, h: number): Pt[] => [
  { x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h },
];

/** 菱形: 四顶点落在盒的四边中点 —— 于是**几何 bbox 恒等于 rect**, 与矩形同口径(edge 路由 / 穿盒门禁 / auto-fit 全吃 rect) */
const diamondPoints = (x: number, y: number, w: number, h: number): Pt[] => [
  { x: x + w / 2, y }, { x: x + w, y: y + h / 2 }, { x: x + w / 2, y: y + h }, { x, y: y + h / 2 },
];

/**
 * 圆柱盖高的实际取值: 作者值 → 缺省(盒高 × `CYLINDER_CAP_RATIO`)→ 上限 `h/2`。
 * 与 `radiusPolygonPath` 对圆角半径的处置同一口径: **钳制而不静默丢弃**, 钳了在几何里报一声。
 */
const capRadiusOf = (h: number, capRadius?: number): number =>
  Math.min(capRadius ?? h * CYLINDER_CAP_RATIO, h / 2);

/**
 * 圆柱外形 path + 前缘弧。两条 `A` 各是**半个椭圆**(起终点是椭圆的对径点, 于是弧唯一, 不需要大弧标志):
 *   · 顶盖: 从左端点经盒顶到右端点(sweep=1 = 屏幕顺时针)
 *   · 底盖: 从右端点经盒底回左端点(同 sweep, 弧继续鼓向盒外)
 * 末尾 `Z` 收的是左边那条直线 —— 侧边不是"画"出来的, 是闭合路径的必然。
 * 前缘弧(只描不填)是顶盖的**下半个**: 同起终点、sweep 取反 → 鼓向盒内, 一眼看出这是"口朝上的柱"。
 */
function cylinderPath(x: number, y: number, w: number, h: number, ry: number): { d: string; rim: string } {
  const rx = w / 2;
  const topCy = y + ry; // 顶盖椭圆心
  const botCy = y + h - ry; // 底盖椭圆心
  const arc = (toX: number, toY: number, sweep: 0 | 1): string => `A ${fmt(rx)} ${fmt(ry)} 0 0 ${sweep} ${fmt(toX)} ${fmt(toY)}`;
  return {
    d: [`M ${fmt(x)} ${fmt(topCy)}`, arc(x + w, topCy, 1), `L ${fmt(x + w)} ${fmt(botCy)}`, arc(x, botCy, 1), 'Z'].join(' '),
    rim: `M ${fmt(x)} ${fmt(topCy)} ${arc(x + w, topCy, 0)}`,
  };
}

/** 形状词表守卫(三个公开入口共用一道): 写错的形状词会静默回落成矩形 —— 当场抛, 别让作者以为画上了 */
export const assertNodeShape = (owner: string, v: unknown): void =>
  assertOneOf(owner, 'shape', v, NODE_SHAPE_KINDS, 'rect 是缺省形态');

/**
 * 盖高守卫: **负值是尺寸写反**(弧会反向), 不是"小一点" —— 与 `w`/`h` 的负值同一口径。
 * (登记: 兄弟参数 `radius` 至今没有负值守卫, 与 w/h 口径不一致 —— 不在本轮范围, 未动。)
 */
export function assertCapRadius(owner: string, v: unknown): void {
  if (v === undefined) return;
  assertFiniteNumber(owner, 'capRadius', v);
  if ((v as number) < 0) throw new ShapeInputError(owner, 'capRadius', `为负(${v})`, '盖高是尺寸不是增量; 想画平盖就给 0');
}

export type NodeAreaOptions = { capRadius?: number };

/**
 * 形状内接的**文字可用区**(纯换算; 守卫在公开入口, 这里不管畸形值)。
 *
 * 三种形态共用一条口径: **文字带 = 盒的中央一半**(纵向), 于是一段主/次两行的居中排布代码
 * 与形状**无关**(见 nodeShape 的文本段: 形状只换 d, 一个字都没改)。逐个说清:
 *   · `rect`     可用区 = 整个盒(呼吸位是门禁 `labelInset` 的事, 几何不预扣)
 *   · `diamond`  内部满足 |x|/(w/2) + |y|/(h/2) ≤ 1 → 在 |y| = h/4 处可用半宽 = w/4, 故内接矩形是
 *                **中央半宽 × 中央半高**(面积只有盒的 1/4)。这就是"菱形装字难"的全部真相: 是几何, 不是排版
 *   · `cylinder` 上沿受顶盖前缘弧的最低点(盒顶下 2·ry)所限、下沿对称 → 可用高 = h − 4·ry;
 *                缺省 ry = h/8 时恰是 h/2 —— 与菱形同一条"中央一半"
 */
export function nodeTextArea(shape: NodeShapeKind, rect: Rect, opts: NodeAreaOptions = {}): Rect {
  if (shape === 'diamond') return { x: rect.x + rect.w / 4, y: rect.y + rect.h / 4, w: rect.w / 2, h: rect.h / 2 };
  if (shape === 'cylinder') {
    const ry = capRadiusOf(rect.h, opts.capRadius);
    return { x: rect.x, y: rect.y + 2 * ry, w: rect.w, h: Math.max(0, rect.h - 4 * ry) };
  }
  return { ...rect };
}

/**
 * `nodeTextArea` 的**反解**: 装下 `w × h` 的文字块需要多大的形状外壳(`nodeFit` 用它)。
 * 两式互为逆 —— 测试里当闭环钉住(算出的盒再喂回 `nodeTextArea` 必须恰好装下内容)。
 *
 *   · `diamond`  两轴 ×2: 内接约束 `W/w + H/h ≤ 1` 在 `w = 2W / h = 2H` 处**取等** —— 即文字块
 *                四角恰好落在菱形边上, 是紧解不是拍的系数; 顺带盒的宽高比 = 文字块的宽高比
 *   · `cylinder` 高度 + 4·ry(缺省 ry = h/8 ⇒ h = 2H, 与菱形同一个 2); 宽度不变 —— 侧边是直的, 不吃宽
 *   · `rect`     恒等(与既有 `nodeFit` 输出逐字相同)
 */
export function nodeOuterSize(shape: NodeShapeKind, w: number, h: number, opts: NodeAreaOptions = {}): { w: number; h: number } {
  if (shape === 'diamond') return { w: 2 * w, h: 2 * h };
  if (shape === 'cylinder') return { w, h: opts.capRadius === undefined ? 2 * h : h + 4 * opts.capRadius };
  return { w, h };
}

/** 纯几何: 形状 path + 每角解算 + **文字可用区** */
export function nodeGeometry(p: NodeProps): NodeGeometry {
  // 两个函数都是公开入口, 各自守一道(重复四次比较换"报错里出现对的名字", 值得)
  assertFiniteRect('nodeGeometry', p);
  if (p.radius !== undefined) assertFiniteNumber('nodeGeometry', 'radius', p.radius);
  assertNodeShape('nodeGeometry', p.shape);
  assertCapRadius('nodeGeometry', p.capRadius);
  const shape: NodeShapeKind = p.shape ?? 'rect';
  const rect: Rect = { x: p.x, y: p.y, w: p.w, h: p.h };
  const textRect = nodeTextArea(shape, rect, { capRadius: p.capRadius });

  // 圆柱不走多边形那一套(它是两条弧, 没有"角"): 角解算三件套给空数组 / 0, 不用 NaN 冒充
  if (shape === 'cylinder') {
    const capRadius = capRadiusOf(p.h, p.capRadius);
    const { d, rim } = cylinderPath(p.x, p.y, p.w, p.h, capRadius);
    return {
      shape, rect, d, details: [rim], textRect, capRadius,
      capClamped: p.capRadius !== undefined && p.capRadius > p.h / 2,
      corners: [], clamped: [], minActualRadius: 0,
    };
  }

  const r = p.radius ?? 10;
  const pts = shape === 'diamond' ? diamondPoints(p.x, p.y, p.w, p.h) : rectPoints(p.x, p.y, p.w, p.h);
  const { d, tangents } = radiusPolygonPath(pts, r);
  const clamped = tangents.map((t, i) => (t.actualRadius < r - 0.05 ? i : -1)).filter((i) => i >= 0);
  return {
    shape, rect, d, details: [], textRect, capRadius: 0, capClamped: false,
    corners: tangents,
    clamped,
    minActualRadius: Math.min(...tangents.map((t) => t.actualRadius)),
  };
}

/** 节点的 SVG 属性(供 descriptor 与 React 薄壳共用) */
export function nodeAttrs(p: NodeProps): Attrs {
  const st = toneStyle(p.theme ?? DEFAULT_THEME, p.tone, p.variant);
  return {
    fill: p.fill ?? st.fill,
    stroke: p.stroke ?? st.stroke,
    'stroke-width': p.strokeWidth ?? st.strokeWidth,
    'stroke-dasharray': p.dash,
  };
}

/**
 * 节点内标签的**排布参数** —— 渲染(`nodeShape`)与几何 helper(`knives/fit.ts` 的 `nodeFit`)
 * 共用的唯一一份数字。为什么值得单拎出来: `nodeFit` 要按内容反算"多大的盒子装得下这两行",
 * 算的时候用的字号 / 行距 / 次标签缩量必须与真画上去的一模一样 —— 各写一份, 迟早变成
 * 盒按 13px 算、字按 12px 画, 于是 `label_fit` 量的是另一个盒子。
 */
export const NODE_TEXT_LAYOUT = {
  /** 主标签缺省字号(px) */
  fontSize: 13,
  /** 次标签字号 = 主标签字号 − 本值(px) */
  subSizeDelta: 2,
  /** 两行**行中心**的间距 = 字号 × 本值(em); 字号大时不至于两行挤在一起 */
  lineGapEm: 1.25,
  /**
   * 主标签缺省字重(600 = 标题档)。260920 起这一位可被 `NodeProps.weight` 覆盖(卡片正文用 400),
   * 于是它必须有一份**声明**: `nodeShape` / `nodeFit` / audit 的 `label_fit` 三方都从这儿取,
   * 谁都不许再写字面量 600(三者量的必须是同一段字)。
   */
  weight: 600,
} as const;

/**
 * 节点 descriptor: 形状(缺省圆角矩形) + 可选的主/次标签(垂直居中排布)。
 * 标签位置由盒中心算出, 不依赖字体度量 —— 这是 core 侧的确定性排布。
 *
 * **文本段与形状无关**: 三种形态都是"盒中心对称 + 文字带 = 中央一半"(`nodeTextArea`),
 * 所以换形状只换 d 与附加线, 下面那段两行排布一个字都不用改 —— 这正是形状做成
 * `NodeProps` 上一个槽(而不是另开一套 shape 函数)的收益。
 *
 * 返回类型是 `DGroup` 而不是宽联合 `Descriptor`(260920 修正): 本函数**恒**返回一个 group,
 * 声明成联合是类型在撒谎 —— 代价是每个消费方都得写一遍 `kind === 'group' ? .children : []`
 * (260920 那批测试就是懒得写而让 `bun run check` 红了 13 条)。窄化返回类型是安全的
 * (DGroup ⊂ Descriptor, 只影响读得出 `.children`), 且把"这里一定有 children"交回给类型。
 */
export function nodeShape(p: NodeProps): DGroup {
  assertFiniteRect('nodeShape', p);
  if (p.fontSize !== undefined) assertFiniteNumber('nodeShape', 'fontSize', p.fontSize);
  if (p.opacity !== undefined) assertFiniteNumber('nodeShape', 'opacity', p.opacity);
  if (p.weight !== undefined) assertFiniteNumber('nodeShape', 'weight', p.weight);
  if (p.padX !== undefined) assertFiniteNumber('nodeShape', 'padX', p.padX);
  assertNodeShape('nodeShape', p.shape);
  assertOneOf('nodeShape', 'align', p.align, NODE_ALIGN_KINDS, 'center 是缺省(居中)');
  assertCapRadius('nodeShape', p.capRadius);
  const theme = p.theme ?? DEFAULT_THEME;
  const st = toneStyle(theme, p.tone, p.variant);
  const ink = p.textColor ?? st.text;
  const g = nodeGeometry(p);
  const attrs = nodeAttrs(p);
  const cx = p.x + p.w / 2;
  const cy = p.y + p.h / 2;
  const size = p.fontSize ?? NODE_TEXT_LAYOUT.fontSize;
  const subSize = size - NODE_TEXT_LAYOUT.subSizeDelta;
  const children: Descriptor[] = [path(g.d, attrs)];
  // 附加线(圆柱前缘弧)只描不填 —— 实底变体下填了会把前缘糊掉
  for (const d of g.details) children.push(path(d, { ...attrs, fill: 'none' }));
  // 图标: 盒**正上方**, 位置由 `iconRect` 算(与 `cardFit` / `contentBounds` 同一份换算)。
  // 排在文字之前 —— 它不压盒, 顺序只影响"谁压在谁身上"这种没人关心的细节
  if (p.icon) children.push(iconShape({ ...iconRect(p, p.icon), asset: p.icon.asset, color: p.icon.color, strokeWidth: p.icon.strokeWidth, theme }));

  // 文本行装配: **label 与 sub 都按 `\n` 拆行**。行块对盒中心对称, 行距 = 主字号 × lineGapEm;
  // sub 各行固定跟在 label 行块之后(同一行距、同一 subSize)。sub 不随 label 消失(老语义: 无 label 不渲染 sub)。
  //
  // 多行是**还账**, 而且是同一病灶的两半: ① label(260920)—— label_fit 早已按 \n 逐行量宽,
  // 渲染面却整个 text 不拆; ② sub(260920 之后补)—— `nodeFit` / `label_fit` 都按 `\n` 逐行量,
  // 这里却把整串塞进一个 <text> ⇒ 裸换行被 SVG 折成空格, 盒按最长行给、字按一整行画,
  // **门禁全绿而文字溢出盒外**。三处口径必须同源, 否则"量的是这串、画的是另一串"必然复发。
  // 不含 `\n` 的路径输出逐字节相同(`split` 单行恒返回 1 行)。
  //
  // 行心偏移走 `geometry/text-rows` 的**那一份**(与 export.ts 的旁注 / knives/fit.ts 的反算同源):
  // 260920 事故的病灶就是这套"中心对称堆叠"的公式被写了三份, 而 `nodeFit` 那份漂掉之后
  // 没有任何东西会响 —— 盒按一行给、字按 N 行画, 门禁只判宽, 全绿出厂。
  if (p.label) {
    const gap = size * NODE_TEXT_LAYOUT.lineGapEm;
    const rows: Array<{ content: string; rowSize: number; dim?: boolean }> = [
      ...p.label.split('\n').map((content) => ({ content, rowSize: size })),
      ...(p.sub ? p.sub.split('\n').map((content) => ({ content, rowSize: subSize, dim: true as const })) : []),
    ];
    const block = rowBlock(rows.length, gap);
    const left = round1(p.x + (p.padX ?? 0));
    const anchor = p.align === 'start' ? 'start' : 'middle';
    const anchorX = p.align === 'start' ? left : cx;
    const baseWeight = p.weight ?? NODE_TEXT_LAYOUT.weight;
    rows.forEach((row, i) => {
      const lineCy = cy + block.offsets[i];
      // 副标签恒 400(它是注释, 不跟主标签的字重走); 主标签行走 `p.weight`(缺省 600 = 老行为)
      const rowWeight = row.rowSize === size ? baseWeight : 400;
      const y = baselineY(lineCy, row.rowSize, 'central');
      const common: Attrs = {
        ...anchorAttrs(anchor), 'font-size': row.rowSize, fill: ink,
        ...(row.dim ? { opacity: 0.72 } : {}), 'font-family': 'inherit',
      };
      const runs = parseTextRuns(row.content);
      // 字重缺省值 400 不输出(老产物字节不变: 过去主标签写 600、次标签一个字都不写)
      if (!Number.isFinite(rowWeight)) {
        throw new ShapeInputError('nodeShape', 'weight', `不是有限数(${rowWeight})`, '字重是 CSS 数值, 缺省 600');
      }
      if (runs.length === 1 && !runs[0].bold) {
        children.push(text(anchorX, y, runs[0].text, {
          ...common, ...(rowWeight === 400 ? {} : { 'font-weight': rowWeight }),
        }));
      } else {
        // 行内 `**粗**`: 走 `<tspan>`(见 descriptor.richText)。粗体档取 `max(行字重, 600)` ——
        // 与 `measureText` 里逐 run 的加宽判据**逐字同源**, 两边算的是同一段文字
        children.push(richText(anchorX, y, runs.map((r) => ({
          text: r.text, weight: r.bold ? Math.max(rowWeight, 600) : rowWeight,
        })), common));
      }
    });
  }
  // 废除叉: 两条对角线压在文字**之后**(连文字一起划掉), 端点贴盒角不出盒 —— 装饰线不参与净空审计
  if (p.struck) {
    const x2 = p.x + p.w, y2 = p.y + p.h;
    children.push(path(`M ${fmt(p.x)} ${fmt(p.y)} L ${fmt(x2)} ${fmt(y2)} M ${fmt(x2)} ${fmt(p.y)} L ${fmt(p.x)} ${fmt(y2)}`, {
      fill: 'none', stroke: theme.tones.rose.solidBorder, 'stroke-width': 2, 'stroke-linecap': 'round',
    }));
  }
  // 缺省形态不挂 `data-form`: rect 的产物与加形状之前**逐字节相同**(形状词不进缺省产物);
  // opacity 缺省同样不输出属性(老产物字节不变)
  return group(children, {
    'data-shape': 'node',
    ...(g.shape === 'rect' ? {} : { 'data-form': g.shape }),
    ...(p.opacity === undefined ? {} : { opacity: p.opacity }),
  });
}
