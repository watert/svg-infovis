// svg-infovis core · barrel 出口
// 消费者(demo / playground)只从这里或其子路径 import, 不碰 src 内部相对路径。

export * from './geometry/vec';
export * from './geometry/rounded-path';
export * from './geometry/predicates';
// 行块几何(260920): 多行文本"居中堆叠"的**唯一一份**公式 —— 节点标签(shapes/node.ts) /
// 旁注(export.ts) / 反算(knives/fit.ts) 三方共读。排在最前的几何层: 它零依赖
export * from './geometry/text-rows';
// 行内文字标记(`**粗**`)的解析(260920): 度量(knives/measure)与渲染(shapes/node)同一份来源。
// 排在最前的几何层 —— 它零依赖
export * from './geometry/inline-text';
export * from './descriptor';
export * from './theme';
export * from './serialize';
export * from './guard';
export * from './shapes/node';
export * from './shapes/edge';
export * from './shapes/group';
export * from './shapes/text';
// 图标(260920): **纯解析**那一半进 barrel(`parseIconSvg` / 原语类型), 读盘那一半
// (`src/icons/lucide.ts` 的 `iconAsset`)刻意不进 —— 它有 `import 'node:fs'`, 挂上 barrel
// 就让浏览器消费方(bundle 整个 barrel)当场炸。要素材名字 → 子路径 import
export * from './icons/svg-parse';
// `path` 的 `d` 坐标改写(260920): 与 svg-parse 同层同纪律 —— 纯字符串处理、零依赖。
// 排在这里是因为 `shapes/icon` 要对 path 调它(`node` 对 `edge` 也是这个顺序: 被依赖的先出)
export * from './icons/path-data';
export * from './shapes/icon';
// 外部素材链(260920): 整幅外部 SVG(echarts 这类图表)当素材嵌进宿主 —— 走**嵌套 `<svg>`**,
// 素材内部标记原样透传(与图标链那条"烘平坐标"是两条路, 为什么各走各的见 `embed/svg-asset` 文件头)。
// 解析那一半**不读盘**(素材文本由调用方给), 所以进 barrel; `shapes/embed` 与 `shapes/icon` 同层,
// 排在解析件之后(被依赖的先出)
export * from './embed/svg-asset';
export * from './shapes/embed';
// 网格底纹(260920; 同日改名 `grid-pattern` 让位于 `geometry/grid` 的版式格子): 画布装饰层,
// 由 `ExportOptions.grid` 显式开启 —— 不进 scene, 故不参与 audit
export * from './shapes/grid-pattern';
export * from './knives/measure';
export * from './knives/fit';
export * from './knives/route';
// 盒查询(260920): 面 / 锚 / 内缩 / 并集 / 摆放 —— 构建期算位置, 产物照旧是写死的绝对坐标。
// 它归几何层(纯函数, 不判任何事), 但**不是零依赖**: `rectFace` 复用 route 的 `portPoint` /
// `sideDir`(面上的点只许一份), 所以按"读 barrel 的顺序即依赖顺序"排在 route 之后
export * from './geometry/box';
// 均匀格子(260920): box 的格位糖 —— `face` 复用 `rectFace`、格心复用 `rectAnchor`, 故排在 box 之后
export * from './geometry/grid';
// 摆放列 / 行(260920): 把一串盒摞起来或铺开 —— 并集复用 `box.bounds`(并集只许一份公式),
// 故排在 box 之后; 它**不**碰 route(pack 没有"面上的点")
export * from './geometry/pack';
// 成对连线(260920): 单线路由**跑一次**再沿法线平移两条 —— 是 route 的包装, 不是第二个路由器
export * from './knives/route-pair';
// 一维约束账本 + 最长路(260922): `route`(一条边) / `assignLanes`(一束边) / `nodeFit`(一个盒) /
// `nudge`(一组矩形) 全是**局部**刀 —— 这是 core 第一把**跨对象**求解器: "从 a 到 b 至少 N" 的一串
// 要求 → 一串位置。不注入任何缺省间距(见文件头边界宪章), 只依赖 guard + vec, 故排在刀族最前
export * from './knives/constraints';
// 批量腰线分配(260919): route 的**帮手**, 不是它的自动行为 —— 单边路由一字不改, 只有显式调用
// 本刀才发生分配。排在三把刀之前(它只依赖 codes 与 route, 不依赖 audit)
export * from './knives/lanes';
// 门禁码注册表(单一来源): 三把刀(audit / cluster / density)的码都在这里登记, 消费方遍历
// `DIAGNOSTIC_CODES` 做覆盖检查。排在三把刀**之前** —— 读 barrel 的顺序即依赖顺序
export * from './knives/codes';
export * from './knives/audit';
export * from './knives/density';
export * from './knives/cluster';
// nudge 的 align / distribute / snap 是裸名(与 TODO 措辞一致) —— 已核当前无重名;
// 将来若与其他刀撞名, 改后来者, 别在这里加前缀把 API 直觉弄丢
export * from './knives/nudge';
// 代价向量(260919): 候选折线的**量化读数 + 字典序比较**。依赖 `audit` 的阈值(判决与排序同一把尺子),
// 所以必须排在 audit 之后。它是**读数不是门禁** —— 不返回 pass/fail、不抛异常、不新增阈值;
// 现阶段的定位是"把审美从控制流里提出来", route 尚未消费它(接线分两阶段, 见文件头)
export * from './knives/route-cost';
export * from './export';

// scene 的 SceneNode 与 audit 同名(它是 audit 的扩展, 多了 bounds_source) ——
// barrel 里给 audit 让位: 需要 scene 版节点类型时用 SceneDoc['nodes'][number]
export {
  createScene, markHtmlChanged, applyBounds, sceneStatus, assertFreshForExport, SceneStaleError,
  deriveGroupRect, fitGroupFrames,
  decisionDigest, decisionSourceText, normalizeSourceText,
  type BoundsSource, type SceneStamp, type SceneDoc, type SceneInput,
  type CreateSceneOptions, type BoundsPatch, type ApplyBoundsResult, type SceneStatus,
  type DecisionSource, type FreshnessBasis, type StaleReason,
} from './scene';

// 场景读数板(260919): **几何 × 判决的 join** —— 排在最后是因为它同时依赖 `audit`(判决)与
// `scene`(派生框), 是 barrel 里唯一的"下游消费者"。它不判任何事(零新码 / 零阈值), 只把 audit 的
// 诊断按 `subject` 挂回对象旁边 —— 别把它当第四个判据源往里面塞门禁
export * from './knives/describe';
