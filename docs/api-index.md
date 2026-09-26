---
name: api-index
description: "svg-infovis 的 exports 子路径逐条索引: 每个子路径里有什么、契约是什么。从 README 抽出, 签名细节仍以源码为单一来源"
tags: [svg-infovis, api, exports, reference]
date: 2026-09-26T23:05:00+08:00
---

# API 索引(按 `package.json` `exports` 子路径分组)

全部子路径从包名引(`import { nodeFit } from '@watert/svg-infovis/knives/fit'`); 仓内开发也可相对路径引 `./src/...`。签名细节与判据以**源码为单一来源**, 本表只做"什么在哪个子路径"的地图。想要一眼版(只看分组与主要导出)去 `../README.md`。

## 总入口

- `.` —— barrel 聚合出口(纯函数侧; `node:fs` 读盘的图标模块刻意不在内)

## `geometry/` — 纯函数几何(构建期算坐标, 无副作用 / 不 mutate)

- `./geometry/vec` — 向量 / 矩形原语(`mid` = 两点中点), `round1` / `fmt` / `codepointSort`
- `./geometry/rounded-path` — 圆角路径逐角解算 + 端点标记 / 线端内缩
- `./geometry/predicates` — 几何谓词(相交 / 净空 / 正交 / 自重叠 / 有限性守卫)
- `./geometry/text-rows` — 多行文本行块堆法(度量与渲染共用)
- `./geometry/inline-text` — 行内标记解析(`**粗**` / `*斜*` / `~~删~~` / `[字]{accent}`; 度量与渲染同一份 run 表 + 一张 `INLINE_STYLE`)
- `./geometry/port` — 面的朝外法线与面上的点(`Side` / `sideDir` / `portPoint` / `PortRef`)。`knives/route` 再导出同一绑定
- `./geometry/box` — 面上的点 / 九点锚 / `bounds` / `placeRect`(面上点复用 `geometry/port` 的 `portPoint`)
- `./geometry/grid` — 均匀格子(格位 / 格心 / 格面 / 缝中线)
- `./geometry/pack` — 行 / 列摆放(`packRow` / `packCol`; 主轴间距 `gap`(缝, 单值或**逐项**数组)与 `pitch`(节距)二选一)
- `./geometry/place` — 锚点糖面(`rightOf` / `leftOf` / `below` / `above` / `centeredOn`: 把盒摆到另一个盒的某侧)

## descriptor 与序列化

- `./descriptor` — 纯数据描述符(`path/circle/rect/text/group/svg/pattern/embed` 构造器; **动效**: `animate()` 吐 SMIL `<animate>` / `<animateTransform>`、`style()` 吐内嵌样式表, 缓动词表 `EASING_SPLINES` 全仓唯一 —— 名字写错当场抛, 见 `animation-roadmap.md`)
- `./serialize` — descriptor → SVG 字符串(唯一字符串出口, 属性键 codepoint 序)

## `shapes/` — props → descriptor

- `./shapes/node` — 三形态节点(`rect` / `diamond` / `cylinder`)
- `./shapes/edge` — 边装配 + `edgeLabel` / `labelBoxSize`(标签遮罩尺寸唯一来源)
- `./shapes/group` — 分组框 + 标签定位
- `./shapes/text` — 文本 / 标签遮罩几何
- `./shapes/inline` — 行内标记的**唯一上屏器**(行内容串 → `<text>` ± `<tspan>`; 节点标签 / 边标签 / 旁注三家共用)
- `./shapes/grid-pattern` — 画布网格底纹(`line` / `dot`)
- `./shapes/icon` — 图标槽几何(`iconInkRect` 等)
- `./shapes/embed` — 整幅外来 SVG 的嵌套 `<svg>` 渲染
- `./shapes/stat` — 大数字块(数字 + 标签 ± delta; 盒由 `statFit` 反算, delta 标记是几何不是字形)
- `./shapes/badge` — 徽章与列表行(`badgeFit` / `listRowFit`; `{ shape, bounds }` 契约的先例)
- `./shapes/heading` — 标题梯级与分隔线(kicker / 标题 / 副标题三档 + `dividerShape`)

## `blocks/` — 带数值语义的组合块(独立子路径, **不进 barrel**)

判据是"几何里有没有一个比例 / 计数": 只收"一个数值 → 一段几何"的组件, 契约 `{ shape, bounds }`(块能被 `pack` / `place` 当盒摆)。版式纪律与动笔前的四问见 `../blocks/README.md`。

- `./blocks/progress` — 单值进度条 / 100% 堆叠条(`ratio` 由作者算好, kernel 不归一化)
- `./blocks/pictogram` — 图标阵列(`k / N` 的 ISOTYPE 排布)

## `knives/` — 构建期推导与判决

- `./knives/route` — 正交路由(端口 → 折点列; `via` 是作者声明, 不是避障)
- `./knives/route-pair` — 成对双线 + 沿线标签
- `./knives/route-cost` — 候选折点列代价向量(读数, 不是门禁)
- `./knives/lanes` — 共享走廊的腰线批量分配(旋钮, 不是门禁)
- `./knives/constraints` — 一维约束账本 + 最长路("从 a 到 b 至少 N" → 位置列, 带归因)
- `./knives/thresholds` — 门禁与排序共用的尺子(`AuditLevel` / `THRESHOLDS` / `PIERCE_MIN` / `STUB_MIN`)。`knives/audit` 再导出同一绑定
- `./knives/audit` — 门禁审计(十九项 + 两档阈值) → `{ pass, metrics, diagnostics }`
- `./knives/measure` — 无浏览器文本估宽
- `./knives/fit` — `nodeFit` / `cardFit` / `textFit` 盒反算(与 `label_fit` 同源)
- `./knives/codes` — 诊断码注册表(单一来源)
- `./knives/density` — 密度 / 长边 / 混组层警示(全 warning, 不 fail-closed)
- `./knives/describe` — 场景读数板(几何 × 判决 join, 不新增判据)
- `./knives/nudge` — 对齐 / 等距 / 吸附(只动坐标, 不动拓扑)
- `./knives/cluster` — 组语义: membership 声明制 + 自洽四条门禁

## `icons/` 与 `embed/`

- `./icons/svg-parse` — 窄解析器(七原语, 零 transform)
- `./icons/path-data` — `path` 的 `d` 逐坐标改写(contain 缩放)
- `./icons/lucide` — 图标素材读盘(node 侧, 刻意不进 barrel; 数据来自 `lucide-static`)
- `./embed/svg-asset` — 整幅 SVG → 素材(fail-closed 消毒 + id 命名空间化)

## 核心出口

- `./scene` — scene 构造 / 组框派生 / 缓存新鲜度(源指纹优先, 计数兜底)
- `./export` — `tryExport`(迭代回路, 永不抛) / `exportScene`(fail-closed 交付) / `sceneChildren`(渲染面 = 审计面)
- `./theme` — 7 tone × light / dark / paper × outline / tint / solid
- `./guard` — shape 入参守卫(`ShapeInputError` / `resolveKnobs`, 把 NaN 拦在源头)
- `./runtime` — `isMainModule(import.meta.url)`: 可移植的"这个模块是入口吗"判定(bun 的 `import.meta.main` 在 node 下是 `undefined`)

模板层(`templates/{sequence,layered,lifecycle}.ts`)**不在 `exports` 里** —— 仓内按路径引入, 边界宪章与字段表见 `../templates/README.md`。

## 相关

- 子路径即 API 的承诺面、变更分级与破坏性改动四步 → `../refs/public-api.md`
- 消费侧须知(运行时 / 模块解析 / 可选依赖 / CLI)→ `consuming.md`
- 画图起手与缺省值 → `../QUICKREF.md`
