// =====================================================================
// export · scene → 烘焙 SVG (fail-closed 出口)
//
// 出口的语义是硬的(设计稿 §4.3): audit 不过就**拒出图**, 不是警告一下照样吐文件。
// 唯一放行通道是显式 force, 且产物打 `data-draft="1"` 标 —— 草稿图能看, 交付图必须干净。
//
// 输出走 serialize 那一层, 所以字节确定性由那边统一保证(本文件不许自己拼字符串)。
// =====================================================================

import { type Attrs, type Descriptor, group, svg as svgRoot } from './descriptor.js';
import { DEFAULT_THEME, type Theme, type Tone, type Variant, canvasLayer } from './theme.js';
import { type AuditReport, type Scene, SCENE_TEXT_DEFAULTS, audit, groupLabelBox, labelRect } from './knives/audit.js';
import { type AuditLevel, THRESHOLDS } from './knives/thresholds.js';
import { type SceneDoc, assertFreshForExport, sceneStatus } from './scene.js';
import { toSVG } from './serialize.js';
import { type EdgeProps, edgeShape } from './shapes/edge.js';
import { type GroupProps, groupShape } from './shapes/group.js';
import { type NodeProps, type NodeShapeKind, DEFAULT_NODE_SHAPE, nodeShape, NODE_TEXT_LAYOUT } from './shapes/node.js';
import { iconInkRect } from './shapes/icon.js';
import { embedShape } from './shapes/embed.js';
import { labelBoxShape, textShape } from './shapes/text.js';
import { type GridProps, gridLayer } from './shapes/grid-pattern.js';
import { rowBlock } from './geometry/text-rows.js';
import { type Pt, type Rect, rectBottom, rectRight, round1 } from './geometry/vec.js';

/** audit 未过时的拒绝出口: 带上完整报告, 调用方不必再跑一次 audit 去取诊断 */
export class ExportBlockedError extends Error {
  readonly report: AuditReport;
  /**
   * 门禁没过也**照样生成**的那份草稿产物。
   *
   * 为什么不省掉它(260918): 门禁给的是 binary 判决("净空 0"), 而迭代时真正要判断的是
   * "缩一格就过" 还是 "整个版式要重排" —— 那只有图说得清。诊断文本与图是**互补的两半**,
   * 少一半 agent 只能盲改。于是 catch 住就能直接 `writeFile(e.draft.svg)` 看图对照。
   *
   * fail-closed 语义不破: 异常仍被抛出(没被吞), 交付路径拿不到"合法"产物;
   * 草稿一律带 `data-draft="1"`, 机器可查。
   */
  readonly draft: ExportResult;
  constructor(report: AuditReport, draft: ExportResult) {
    const first = report.diagnostics.find((d) => d.severity === 'error');
    super(
      `export 被门禁拦下(${report.level} 档, ${report.metrics.errors} 个 error): ` +
        (first ? `${first.code} @ ${first.subject.kind}:${first.subject.id} — ${first.message}` : '见 report') +
        `\n  ↳ 草稿图已生成: catch 后写 e.draft.svg 就能看图对照, 或改用 tryExport() 直奔草稿`,
    );
    this.name = 'ExportBlockedError';
    this.report = report;
    this.draft = draft;
  }
}

export type ExportOptions = {
  level?: AuditLevel;
  /**
   * 显式放行: 门禁没过(audit 未过 / 缓存陈旧)也能出图 —— 产物一律打草稿标(`data-draft="1"`)。
   * 这是**唯一**的放行通道: 交付路径不许用。
   */
  force?: boolean;
  /** 只出图不审计 —— 仅用于调试, 交付路径不许用 */
  skipAudit?: boolean;
  fontFamily?: string;
  nodeRadius?: number;
  edgeRadius?: number;
  theme?: Theme;
  /**
   * 画布外扩(元素贴边时留点余量); scene 尺寸本身不变。
   * 与 `fit` 互斥: 同时给时 `fit` 胜(它的 padding 自己带)。
   */
  padding?: number;
  /**
   * **按内容重定画布**: 平移到原点 + 按内容 + 出血 + padding 算宽高。
   *
   * 为什么需要它(260917 nudge 面板实拍两次): ① `svg(w, h)` 的宽高由调用方给, core 过去
   * **不校验内容是否出界** —— 内容超出就被裁; ② 描边是**居中描边**(1.5 → 外扩 0.75),
   * viewBox 算到 `x + w` 正好裁掉外侧那半条, 看着就像"border 被切了"。
   *
   * `true` = 用缺省参数(bleed 1 / padding 16); 也可传 `{ bleed, padding }`。
   * 开了 fit 就**不看 scene.width/height**, 且审计吃的是 fit 之后的 scene —— 不然 audit 会
   * 先以"内容越界"把出口拦死, auto-fit 就成了马后炮。
   */
  fit?: boolean | FitOptions;
  title?: string;
  /**
   * **语义 hook 通道**(缺省关): 把 scene 的 id 与语义槽派生到每个元素产物**顶层**的 `data-*` 上
   * —— 产物里第一次有了**不靠位置**的选择器(`:nth-child` 那种玄学不是抓手)。
   *
   * 由来(ROADMAP「动画」条目的隐藏前置): 现状导出链一个抓手都不吐, scene 的 id / tone /
   * variant / shape 过完渲染映射全不落盘。SMIL 档要的是 **id 透传**(`begin="other.end"` /
   * `begin="click"`), CSS `@keyframes` 档才要语义 hook —— 两样都从**这一处**派生, 不许作者
   * 在 styles 覆盖表里手写(那是第二个来源, 五张图五种命名就是又一个 P4)。
   *
   * 为什么用 `data-*` 不用 class: class 命名空间会和作者手写的撞; 且与 `data-draft="1"` 同族。
   * 为什么是布尔而不是细档: id 与语义槽同出一处派生, 拆两档只会让调用方纠结"要不要 id" ——
   * 真要只取一半, 拿到产物后按属性筛即可。
   *
   * 派生表(逐条判据写在 `hookAttrs` 那**唯一一处**):
   *   · `id` = scene 元素 id, 原样透传(SMIL 的跨元素引用靠它可预测;
   *     ⚠ 同页多图 / 同图多素材要避开固定 id —— 网格 pattern 的 `md-grid`, 同族事故见
   *     `GridProps.id` 的注释)
   *   · `data-kind` = `node` / `edge` / `group` / `label` / `text` / `embed` —— 恒吐
   *   · `data-tone` / `data-variant` —— 语义槽**有值才吐**(undefined 不落盘; 判据是 undefined 而非
   *     "与缺省值相等", 作者显式写的 `slate` 照样落盘)。`variant` 只有节点有, `text` / `embed`
   *     没有可派的槽
   *   · `data-form` = **节点形态**(`rect` / `diamond` / `cylinder`), 且**恒吐** —— 缺省形态也吐,
   *     选择器不该猜缺省值(缺省那个词从 `shapes/node` 的 `DEFAULT_NODE_SHAPE` 读, 出口不抄字面量)
   *
   * ⚠ **缺省关 = 产物逐字节不变**(判据: `examples/start/full-chain.ts --golden` 的 sha256):
   * 合并全在 `withHooks` 里, 它在 off 时**原样返回同一个 descriptor**。
   * 不进 audit: 门禁读 scene 不读产物, 天然碰不到这条通道。
   */
  hooks?: boolean;
  /**
   * **逐元素渲染覆盖**(key = id), 优先级**最高** —— 真正的**样式**参数(字号 / 圆角 / dash /
   * 单点 fill·stroke)走这里; 单点例外(如 audit 演示的违规红)也走这里。
   *
   * 260918-260919 口径变更: **语义槽**(`tone` / `variant` / `shape` 三件)过去也塞在这张表里,
   * 现**跟几何一起进 scene**(判据见 `SceneNode.tone`: 那是语义位, 不是样式参数)。这里仍接受
   * 它们 —— 覆盖表仍然赢 —— 但作者该写在 scene 里, 别让"哪一格是什么色 / 什么形状"只活在一张
   * 按 id 索引的表里。边同理: `SceneEdge.tone` 是作者该写的那一位, `edgeStyles[id].tone` 只是逃生口。
   * 而**不要**另拼一份 children: 那正是渲染面与审计面漂开的入口(③ 号病症)。
   */
  nodeStyles?: Record<string, Omit<NodeProps, 'x' | 'y' | 'w' | 'h'>>;
  groupStyles?: Record<string, Omit<GroupProps, 'x' | 'y' | 'w' | 'h'>>;
  edgeStyles?: Record<string, Omit<EdgeProps, 'points'>>;
  /**
   * **画布网格底纹**(260920): 在画布底色之上、所有内容之下铺一层细线格(`line`)或点阵(`dot`)。
   *
   * 三级取值(与 `fontFamily` 同族, 只多一档"关"):
   *   · `undefined` → 用**主题的缺省**(`Theme.grid`) —— paper 自带一层细线格(纸感的一半),
   *     light/dark 不设槽 ⇒ 那两档的老产物**逐字节不变**
   *   · 对象 → 与主题缺省**逐字段合并**: 主题给底, 作者只写要改的那几位(例如 `{ style: 'dot' }`),
   *     不必把 step / 色 / 深浅整套重述一遍
   *   · `false` → 显式关掉, 连主题的也不铺(想要干净底就这一位)
   *
   * 它不进 scene, 因此**不参与 audit** —— 网格是版式装饰不是信息, 门禁不该把它当元素审。
   */
  grid?: GridProps | false;
};

export type FitOptions = {
  /** 内容四周留白(px), 缺省 16 */
  padding?: number;
  /** 居中描边的外扩补偿(px), 缺省 1(= strokeWidth 1.5 的一半再富余一丝) */
  bleed?: number;
};

export type ExportResult = {
  svg: string;
  report: AuditReport;
  /** true = 草稿图: 门禁没过被 force 放行, **或**含 estimate 坐标 */
  draft: boolean;
  /** 仍是估算值的节点 id(空 = 全部实测/手改) —— 交付前必须清零 */
  estimated_nodes: string[];
};

/**
 * 入参是不是带缓存戳的 SceneDoc。带版本号才跑缓存有效期门禁 ——
 * 纯几何 Scene(手写 golden / 反序列化片段)没有版本号可判, 也没有"陈旧"可言。
 */
const asSceneDoc = (scene: Scene | SceneDoc): SceneDoc | null => {
  const s = scene as Partial<SceneDoc>;
  return typeof s.html_rev === 'number' && typeof s.scene_rev === 'number' ? (scene as SceneDoc) : null;
};

/** 把 scene 整体平移(几何搬家, 不改拓扑); 尺寸可选重设 */
export function translateScene(scene: Scene, dx: number, dy: number, size?: { width: number; height: number }): Scene {
  if (!dx && !dy && !size) return scene;
  const r = (rect: Rect): Rect => ({ x: round1(rect.x + dx), y: round1(rect.y + dy), w: rect.w, h: rect.h });
  const p = (pt: Pt): Pt => ({ x: round1(pt.x + dx), y: round1(pt.y + dy) });
  return {
    ...scene,
    width: size ? size.width : scene.width,
    height: size ? size.height : scene.height,
    nodes: scene.nodes.map((n) => ({ ...n, rect: r(n.rect) })),
    edges: scene.edges.map((e) => ({ ...e, points: e.points.map(p) })),
    labels: scene.labels?.map((l) => ({ ...l, at: p(l.at) })),
    groups: scene.groups?.map((g) => ({ ...g, rect: r(g.rect), labelRect: g.labelRect ? r(g.labelRect) : undefined })),
    texts: scene.texts?.map((t) => ({ ...t, rect: r(t.rect) })),
    embeds: scene.embeds?.map((e) => ({ ...e, rect: r(e.rect) })),
  };
}

/**
 * 内容包围盒 —— **带位置的东西全数在内**: 节点 / 分组框 / 分组标题 / 标签遮罩 / 旁注文本 / 折点。
 * 空 scene 返回 `null`(无内容无包围盒, 不编一个 0x0 出来)。
 */
export function contentBounds(scene: Scene, opts: { bleed?: number } = {}): Rect | null {
  const bleed = opts.bleed ?? 1;
  const rects: Rect[] = [
    // 带图标的节点: 图标画在盒**上方**, 它的矩形也在这份包围盒里 —— 少了它, `fit` 会把图标裁掉
    // (图标不进净空门禁, 但它毫无疑问是"图上的内容")
    ...scene.nodes.map((n) => (n.icon ? iconInkRect(n.rect, n.icon) : n.rect)),
    // 组框标签的包围盒走 `groupLabelBox`(与审计/渲染同一份) —— 画出来的东西都要进包围盒,
    // 否则声明了归属位的组, 它的标签会被 fit 后的画布裁掉
    ...(scene.groups ?? []).flatMap((g) => {
      const box = groupLabelBox(g);
      return box ? [g.rect, box] : [g.rect];
    }),
    ...(scene.labels ?? []).map(labelRect),
    ...(scene.texts ?? []).map((t) => t.rect),
    // 外部素材(260920): 它是"图上的内容", 少了它 `fit` 会把整块图表裁掉(素材不进净空门禁,
    // 但它毫无疑问占着版面)
    ...(scene.embeds ?? []).map((e) => e.rect),
  ];
  const pts = scene.edges.flatMap((e) => e.points);
  if (!rects.length && !pts.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, rectRight(r)); y1 = Math.max(y1, rectBottom(r));
  }
  for (const p of pts) {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
  }
  return { x: round1(x0 - bleed), y: round1(y0 - bleed), w: round1(x1 - x0 + 2 * bleed), h: round1(y1 - y0 + 2 * bleed) };
}

/** 按内容重定画布: 平移使内容贴住左上 padding, 并按内容算宽高。不改入参(纯函数) */
export function fitScene(scene: Scene, opts: FitOptions = {}): Scene {
  const pad = opts.padding ?? 16;
  const b = contentBounds(scene, { bleed: opts.bleed ?? 1 });
  if (!b) return { ...scene, width: round1(pad * 2), height: round1(pad * 2) };
  return translateScene(scene, round1(pad - b.x), round1(pad - b.y), {
    width: round1(b.w + pad * 2),
    height: round1(b.h + pad * 2),
  });
}

/** hook 通道的元素种类词表 —— `data-kind` 的取值只此一份 */
type HookKind = 'node' | 'edge' | 'group' | 'label' | 'text' | 'embed';
/** `hookAttrs` 认的三位语义槽: 要加第四位只改这里, 别在六个调用点各拼一份 */
type HookSlots = { id: string; tone?: Tone; variant?: Variant; shape?: NodeShapeKind };

/**
 * 语义 hook 的**唯一派生点**(一处出处): scene 语义槽 → `id` + `data-*` 属性袋; `hooks` 关时恒 `undefined`。
 *
 * 取值的两条判据:
 *   · `id` / `data-kind` **恒吐** —— 它们是抓手本身, 不是语义槽
 *   · `tone` / `variant` **有值才吐**: undefined 不落盘(`attrsToStr` 本来也丢 undefined,
 *     这里不写空位是"不提前给空位"那条纪律)。判据是 `undefined` 而**不是**"与缺省值相等" ——
 *     作者显式写的 `slate` 照样落盘, 选择器不必猜
 *
 * `data-form` 是节点**形态**, 且**恒吐**(缺省形态也吐): 选择器不该猜缺省值。缺省那个词从
 * `DEFAULT_NODE_SHAPE` 读 —— 形态缺省是 `nodeShape` 的事, 这里再写一遍 `'rect'` 就是第二个真相。
 * 属性名用它而不用 `data-shape`: 后者已被形状层占着(`node` / `edge` / `label-box` …), 一改就是一词两义;
 * `data-form` 早就是形态槽的单一出处(形态层"缺省不挂"那条是**产物字节**的历史包袱, 与这里无冲突)。
 */
const hookAttrs = (o: ExportOptions, kind: HookKind, el: HookSlots): Attrs | undefined =>
  o.hooks
    ? {
        id: el.id,
        'data-kind': kind,
        ...(el.tone === undefined ? {} : { 'data-tone': el.tone }),
        ...(el.variant === undefined ? {} : { 'data-variant': el.variant }),
        // 形态只对节点吐(只有 `SceneNode` 有这个槽), 且**恒吐** —— 缺省那个词从常量读, 不抄字面量
        ...(kind === 'node' ? { 'data-form': el.shape ?? DEFAULT_NODE_SHAPE } : {}),
      }
    : undefined;

/**
 * 把 hook 属性合进产物**顶层** descriptor 的 `attrs`。
 *
 * 走 spread 合并而不是改 shapes 的签名: 语义槽的注入点只有出口一处(`sceneChildren` 是渲染面唯一
 * 映射), 让六个 shape 各加一个 `attrs` 参数 = 六个可以各自漂开的来源。
 *
 * ⚠ `extra` 为 undefined 时**原样返回同一个对象** —— 缺省关那条"逐字节不变"就靠这一行。
 * `defs` 分支与 `if` 拆两条也是刻意的: 它是唯一没有 attrs 位的 descriptor, 窄化掉它之后
 * 剩下的联合每个都带 attrs, 那行"多余属性"检查才过得去(写成三元表达式 tsc 会报 TS2322)。
 */
const withHooks = (d: Descriptor, extra: Attrs | undefined): Descriptor => {
  if (!extra || d.kind === 'defs') return d;
  return { ...d, attrs: { ...d.attrs, ...extra } };
};

/**
 * scene 节点 → nodeShape, **渲染参数唯一的注入点**。
 *
 * **语义槽从 scene 读**(260918-260919 口径变更, 改的就是这里): `tone` / `variant` / `shape`
 * 是**语义**(类型 → 肤色 / 强不强调 / 什么形状), 不是样式参数 —— 参照实现的设计正是"组件 schema 里
 * 零样式词汇, 颜色与形态由节点 `type` 推出"; core 没有 `type`, 这几个槽就是那个语义位的替身,
 * 所以它们该进 scene。旧注释写的是"scene 只描述几何, 不描述肤色" —— 那句话错在把**语义**归进了
 * **样式**: 语义进 scene(几何与语义都是"图在说什么"), 样式(fill / dash / 字号这类"怎么画")
 * 留在覆盖表。代价是实测出来的: 只认覆盖表时, 作者在数据表里写的 tone / shape 一个都没上屏
 * (复刻图两张 SVG 只有 7 个色值、全是 slate 灰阶, 菱形与圆柱也一个没有) —— 同族第五次。
 *
 * **merge 顺序**(scene 打底 → 覆盖表收尾, 覆盖表永远赢):
 *   ① 盒几何 + label / sub / fontSize; `radius` 还吃 `opts.nodeRadius` 兜底
 *   ② **语义槽**: `tone` / `variant` / `shape` —— 取自 scene; 覆盖表里**显式写了值**才顶掉它
 *   ③ 覆盖表余下字段原样铺开(字号 / 圆角 / dash / 单点 fill·stroke)
 * ②里为什么用 `??` 而不是跟 ③ 一起铺: 调用方常按整张表 map 出覆盖项
 * (`NODES.map(n => ({ tone: n.tone, variant: n.variant, ... }))`), 未表态的键是 `undefined`
 * —— 直接铺上去会把 scene 的 tone 抹回 slate, 同一个病换个地方再犯一次。
 */
const renderNode = (n: Scene['nodes'][number], o: ExportOptions): Descriptor => {
  const { tone, variant, shape, struck, opacity, ...over } = o.nodeStyles?.[n.id] ?? {};
  // 语义槽的**分解值**先落到 const: 渲染与 hook 读的必须是同一个数(各写一遍 `?? ` 就是两个来源)
  const tone_ = tone ?? n.tone, variant_ = variant ?? n.variant, shape_ = shape ?? n.shape;
  const desc = nodeShape({
    ...n.rect,
    label: n.label,
    sub: n.sub,
    fontSize: n.fontSize,
    radius: n.radius ?? o.nodeRadius ?? 10,
    theme: o.theme,
    ...over,
    // 左对齐标签的左内边距: 作者的 `padX`(覆盖表) → 该档呼吸位(`label_fit` 用的那个数)。
    // **只有出口知道档位**, 所以这个数只能在这里填 —— 几何层不预扣呼吸位(见 nodeTextArea)
    padX: over.padX ?? THRESHOLDS[o.level ?? 'standard'].labelInset,
    tone: tone_,
    variant: variant_,
    shape: shape_,
    struck: struck ?? n.struck,
    opacity: opacity ?? n.opacity,
    // 字重与对齐是**语义槽**(进 scene), 覆盖表显式给值才顶掉 —— 与 tone / shape 同一口径
    weight: over.weight ?? n.weight,
    align: over.align ?? n.align,
    icon: over.icon ?? n.icon,
  });
  return withHooks(desc, hookAttrs(o, 'node', { id: n.id, tone: tone_, variant: variant_, shape: shape_ }));
};

/**
 * **scene → children 的唯一映射**(③ 号病症的结构修法)。
 *
 * 260917 之前这条链只上屏 canvas/groups/nodes/edges —— `Scene.labels` 与 `Scene.texts`
 * 根本不上屏, 而 audit 在逐条审它们: 门禁在为**幽灵**判定。同族三次(NaN 静默丢元素 /
 * fit 与审计不同源 / labels·texts 不上屏)⇒ 缺的不是又一处补丁, 而是结构约束:
 * **渲染面必须是 scene 的满射**。要动渲染就改这里或往 scene 里加字段, 别在调用方手拼 children。
 *
 * 组框标签是这条约束的**第四次咬人**(260918): 作者把 `labelPlacement: 'outer'` 写在组上,
 * 渲染却只取 `rect + label` → `groupShape` 缺省落 `inner`, 而审计读的 `labelRect` 是 outer。
 * 于是审计在给一个**没画出来的框**判定, 真画出来的那个框没人审(复刻图实测 3 条幽灵)。
 * 焊法: 归属位与字号一律从 scene 读(见 `SceneGroup.labelPlacement` / `labelInset` / `fontSize`)。
 *
 * ⚠ 归属位是**决策不是样式**: 它放在 styles 覆盖表**之后** —— 允许 groupStyles 改它会重新长出
 * 第二个来源(渲染一套、审计一套)。字号按既有惯例留给覆盖表(与 `renderNode` 同一立场)。
 *
 * 层序(自下而上): 画布底 → (网格底纹) → **外部素材** → 组框 → 节点 → 边 → 标签 → 旁注文本。
 * 文字在最上, 遮罩片才遮得住线; 素材在底, 因为它就是那块版式的底板(见 `Scene.embeds`)。
 */
export function sceneChildren(scene: Scene, opts: ExportOptions = {}): Descriptor[] {
  const theme = opts.theme ?? DEFAULT_THEME;
  // 网格三级取值(与 fontFamily 同族, 只多一档"关"): 主题给底 → `opts.grid` 逐字段盖 → `false` 关。
  // 判定"有没有"必须看**两者之一非空**: `{ ...undefined, ...undefined }` 得到 `{}`, 那会被当成
  // "有网格"从而铺出整套缺省 —— 而作者根本没表态, 不该替他铺。
  const grid = opts.grid === false ? undefined
    : theme.grid || opts.grid ? { ...theme.grid, ...opts.grid } : undefined;
  return [
    canvasLayer(theme, scene.width, scene.height),
    // 网格底纹(260920): 紧贴画布底色之上 —— 组框/节点/边/文字全压在它上面(底纹是"地基"不是"图层")
    ...(grid ? gridLayer(scene.width, scene.height, grid) : []),
    // 外部素材(260920): z 序**在底** —— 紧跟画布与网格底纹之后、组框与节点之前。
    // 素材是这块版式的"底板"(面板里那张图表), 线与标签要压在它**上面**才读得出谁在说什么;
    // 反过来它压住节点, 整张图就没人看得懂了。
    ...(scene.embeds ?? []).map((e) =>
      withHooks(embedShape({ asset: e.asset, ...e.rect, opacity: e.opacity }), hookAttrs(opts, 'embed', { id: e.id }))),
    ...(scene.groups ?? []).map((g) => {
      // 缺省字段**不许显式传 undefined**: `groupShape` 认 `?? 'inner'`, 传进去会把覆盖表里的值顶掉
      const placed = g.labelPlacement === undefined && g.labelInset === undefined
        ? {}
        : { labelPlacement: g.labelPlacement, labelInset: g.labelInset };
      // 组色与 renderNode 同一口径: scene 的 `tone` 打底, 覆盖表**显式给了值**才顶掉(undefined 不算表态)
      const { tone, ...over } = opts.groupStyles?.[g.id] ?? {};
      const tone_ = tone ?? g.tone;
      return withHooks(groupShape({
        ...g.rect, label: g.label, fontSize: g.fontSize, theme: opts.theme,
        ...over, tone: tone_, ...placed,
      }), hookAttrs(opts, 'group', { id: g.id, tone: tone_ }));
    }),
    ...scene.nodes.map((n) => renderNode(n, opts)),
    // 边的 `tone` 与节点同一口径: scene 打底, 覆盖表**显式给了值**才顶掉它
    // (调用方按整张表 map 出覆盖项时, 未表态的键是 `undefined` —— 铺上去会把 scene 的语义抹回中性灰)
    ...scene.edges.map((e) => {
      const { tone, ...over } = opts.edgeStyles?.[e.id] ?? {};
      const tone_ = tone ?? e.tone;
      return withHooks(edgeShape({ points: e.points, radius: opts.edgeRadius ?? 10, theme: opts.theme, ...over, tone: tone_ }),
        hookAttrs(opts, 'edge', { id: e.id, tone: tone_ }));
    }),
    // 标签与旁注: 没给文字的不上屏(占位), 计数在 audit 的 metrics.phantom_* 里
    ...(scene.labels ?? []).flatMap((l) =>
      l.text === undefined
        ? []
        : [withHooks(labelBoxShape({
            x: l.at.x, y: l.at.y, w: l.width, h: l.height,
            content: l.text, fontSize: l.fontSize, rotate: l.rotate, theme,
            // 取色(260925): 显式 `color` 最高 → `tone` 的**文字槽**(边线取 border 是因为线是描边,
            // 字是填充 —— 浅色系 border 当字色看不清) → 缺省 `theme.label`(中立标签老观感不变)。
            // bg 不表态时 `labelBoxShape` 落 `theme.canvas`: 遮罩与画布同色即隐形。
            bg: l.bg,
            color: l.color ?? (l.tone ? theme.tones[l.tone].text : undefined),
          }), hookAttrs(opts, 'label', { id: l.id, tone: l.tone }))],
    ),
    ...(scene.texts ?? []).flatMap((t) => {
      if (t.text === undefined) return [];
      const anchor = t.anchor ?? 'middle';
      const x = anchor === 'start' ? t.rect.x : anchor === 'end' ? rectRight(t.rect) : round1(t.rect.x + t.rect.w / 2);
      // 多行(\n): 行块对检测矩形中心对称, 行距与节点同口径(NODE_TEXT_LAYOUT.lineGapEm) ——
      // 审计面(text_overlap)早已按 \n 逐行量宽, 渲染面同拍拆行(260920 还欠账)。
      // 行心偏移走 `geometry/text-rows`(与 shapes/node.ts / knives/fit.ts 同一份公式)
      const size = t.fontSize ?? SCENE_TEXT_DEFAULTS.fontSize;
      const lines = t.text.split('\n');
      const gap = size * NODE_TEXT_LAYOUT.lineGapEm;
      const midY = round1(t.rect.y + t.rect.h / 2);
      const block = rowBlock(lines.length, gap);
      const rows = lines.map((line, i) => textShape({
        x, y: round1(midY + block.offsets[i]),
        content: line, size, anchor, baseline: 'central',
        color: t.color ?? theme.label, weight: t.weight, theme: opts.theme,
      }));
      const hooks = hookAttrs(opts, 'text', { id: t.id });
      if (!hooks) return rows;
      // 多行旁注吐 N 个 `<text>` 而只有一个 scene id —— 同一个 id 写两遍是**非法文档**(选择器只会
      // 命中最先那个, 后面的行没有抓手), 所以多行时套一层 `<g>` 承载 hook; 单行(常态)直合, 不加壳
      return [rows.length === 1 ? withHooks(rows[0], hooks) : withHooks(group(rows), hooks)];
    }),
  ];
}

export function exportScene(scene: Scene | SceneDoc, opts: ExportOptions = {}): ExportResult {
  const level = opts.level ?? 'standard';

  // 缓存有效期门禁(设计稿 §4.2): 陈旧缓存的旧坐标不许静默出厂。
  // 本文件是**唯一出口**, 门禁装在这里才算真焊上 —— 否则 SceneStaleError 就是个没人抛的摆设。
  const doc = asSceneDoc(scene);
  if (doc && !opts.force) assertFreshForExport(doc);

  // 画布准备: fit(按内容算) 或 padding(只外扩)。
  // **审计与渲染必须吃同一份 scene** —— 260917 的 NaN 事故根因正是两者不同源
  // (审的是对的 rect, 渲染的是坏的 children), 门禁因此永远看不见那类事故。
  const pad = opts.padding ?? 0;
  const prepared: Scene = opts.fit
    ? fitScene(scene, typeof opts.fit === 'object' ? opts.fit : {})
    : translateScene(scene, pad, pad, { width: round1(scene.width + pad * 2), height: round1(scene.height + pad * 2) });

  const report = opts.skipAudit
    ? { level, pass: true, metrics: {}, diagnostics: [] }
    : audit(prepared, { level });
  const blocked = !report.pass;

  // 第二档门槛(§4.2): estimate 坐标**不拦死**, 但一律降为草稿图 —— 交付图不许含估算值
  const status = doc ? sceneStatus(doc) : null;
  const estimated_nodes = status?.estimated_nodes ?? [];
  // 陈旧但被 force 放行也算草稿: force 的意义是"我知道它不该出厂, 先给我看一眼"
  const draft = blocked || estimated_nodes.length > 0 || (status?.stale ?? false);

  // children 全部来自 sceneChildren —— 审计与渲染吃同一份 scene(纪律: 先 fit 再审, 同一对象)
  const children = sceneChildren(prepared, opts);

  // 字体三级取值: 出口覆盖(opts.fontFamily) → 主题槽(theme.fontFamily, 260920) → sans 栈。
  // 内置 light/dark 不设槽 —— 老产物字节不变; 只有 paper(mono)声明了主题级缺省
  const theme_ = opts.theme ?? DEFAULT_THEME;
  const attrs: Attrs = { 'font-family': opts.fontFamily ?? theme_.fontFamily ?? 'ui-sans-serif, system-ui, "PingFang SC", sans-serif' };
  if (opts.title) attrs['aria-label'] = opts.title;
  if (draft) attrs['data-draft'] = '1'; // 草稿标: 机器可查, 不靠文件名

  const result: ExportResult = { svg: toSVG(svgRoot(prepared.width, prepared.height, children, attrs)), report, draft, estimated_nodes };

  // ⚠ 顺序是刻意的(260918): **先装配草稿, 再决定拦不拦**。
  // 过去是"先 throw 再装配" —— 于是被拦下的那次连图都没有, 而迭代时图恰恰是最该给的东西。
  // 门禁是**导航仪**: 它该拦的是"带病出厂", 不是"让人看不见自己错在哪"。
  if (blocked && !opts.force) throw new ExportBlockedError(report, result);
  return result;
}

/**
 * **迭代回路**出口: 与 `exportScene` 唯一的区别是**永不抛** —— 门禁没过也返回草稿
 * (`report.pass === false` + `draft === true` + `data-draft="1"`)。
 *
 * 两个入口分工明确, 别混用:
 * · **交付路径** → `exportScene`(不过就炸, 这是保险丝)
 * · **改图回路** → `tryExport`(永远有图可看), 或 catch `ExportBlockedError` 读 `.draft`
 *
 * 为什么不干脆让 exportScene 也不抛: 那样"带病产物"就只剩 `draft` 一个弱信号,
 * 而 prompt 是软约束、agent 必违规 —— **能焊进代码的就不留给自觉**。
 */
export function tryExport(scene: Scene | SceneDoc, opts: ExportOptions = {}): ExportResult {
  try {
    return exportScene(scene, opts);
  } catch (e) {
    // 只吞"门禁没过"; SceneStaleError 之类照旧上抛 —— 那类没有草稿可给, 而且是要先修的
    if (e instanceof ExportBlockedError) return e.draft;
    throw e;
  }
}

/** 便捷出口: 只要字符串, 失败了直接抛 */
export function toSceneSVG(scene: Scene | SceneDoc, opts: ExportOptions = {}): string {
  return exportScene(scene, opts).svg;
}
