---
name: svg-infovis-roadmap
description: "svg-infovis 的立项依据、当前能力与后续方向"
tags: [svg-infovis, roadmap]
date: 2026-09-23T16:00:00+08:00
---

# ROADMAP

## 立项依据

- 独立、零运行时依赖、不上 build step 是刻意的前提 —— 大目录云同步环境里, 构建产物会与版本库互相抢成旧内容, 维护撞墙。
- 立项实测: 8 张真实 Mermaid 结构图上, 纯几何门禁只喊 3 声(召回 ≈ 21%), 而肉眼每图 1–2 处想改(分层被排成阶梯 / 组内空白 41–80% / 长边横扫)。结论: 疼在**意图表达与排布旋钮**, 不在像素精度 —— 需要一个"零运行时依赖、字节确定、排布归作者"的 diagramming 几何内核, 门禁 fail-closed、旋钮显式。

## 当前能力(v0.1 · v0.2 排版层)

- **geometry**: 向量 / 圆角路径解算 / 几何谓词 / 行块堆法 / box·grid·pack·place 版式原语(`place` 是 260925 补的"盒摆到另一个盒某侧", 与 `pack` 并列 —— pack 管一列 / 一行, place 管两个盒的关系)
- **knives**: 正交路由(`via` 声明、腰线分配)、门禁审计(十九项 + 密度四项警示)、fit 盒反算、describe 读数板、nudge 微调、cluster 组语义、一维约束账本
- **shapes / serialize / theme**: 三形态节点、标签遮罩几何、7 tone × 3 mode × 3 variant、字节确定序列化
- **排版层(v0.2, 260925)**: `shapes/` 补三件**无数值语义**的排版件(stat 大数字块 / badge 徽章与列表行 / heading 标题梯级与分隔线); 新建顶层 `blocks/` 层收**带数值语义**的组合块(progress 单值条与堆叠条 / pictogram 图标阵列) —— 块契约 `{ shape, bounds }`, 独立 `exports` 子路径且**不进 barrel**; 划界与排期见 `docs/infograph-roadmap.md`
- **export**: `tryExport`(迭代草稿)/ `exportScene`(fail-closed 交付)/ auto-fit
- **templates**: sequence / layered / lifecycle 三套可填参骨架
- **examples**: 五桶 23 项示例 + PNG 快照(项数 = `examples/manifest.ts` 的 `EXAMPLES` 长度, 数它别数人脑); 配方与架构文档齐备
- **素材链**: 图标走 `lucide-static` 依赖 + lazy 读盘; 整幅外来 SVG 走 fail-closed 素材链
- **CLI `svginfo`**: authoring 入口(run / inspect / render / new / icons), `bun link` 全局可用
- **契约文档(260926)**: `refs/layering.md`(七层 + 依赖方向 + 准入门槛 + 三条边界轴) · `refs/principles.md`(原则的代价与事故出处) · `refs/public-api.md`(exports 即公共面 / 变更分级 / 破坏性改动四步) · `refs/architecture-v3.svg`(现状分层图, core 自画自审; v1/v2 那份降级为演进史)

## 后续方向

- **契约归属三处错位(260926 审计, 动它们全是破坏性变更, 别顺手改)** —— 现状与判据见
  `refs/layering.md`「契约归属」: ① `Scene` / `SceneNode` / `SceneGroup` 契约住在 `knives/audit.ts`,
  `scene.ts` 只做加法扩展, 致 `scene` 运行时依赖 `audit`(正解是契约住 scene、audit 反读; 要同时动
  audit / scene / export 三个文件与类型出口, 性价比得单独算) ② `knives/measure` 是纯函数零依赖却被
  6 个形状/块件消费, 按"≥2 消费者"判据更像 `geometry/` 原语, 但搬家要改 `exports` 子路径 = L3 破坏
  ③ `theme` 反向依赖 `shapes/grid-pattern` 的 `GridDefaults`(纯 `import type`, 运行时无环) ——
  正解是该类型下沉到 `descriptor`, 小改但要连带 import 调整
- **④ 阈值那半已收口(260926), Scene 契约仍未动** —— `AuditLevel` / `THRESHOLDS` / `PIERCE_MIN` /
  `STUB_MIN` 住在 `knives/thresholds.ts`(不是 `geometry/predicates`: 这些数是判决档, 不是几何谓词)。
  `audit` 再导出同一绑定, 公开路径没断。`route` 不再值导入 `audit`。`cluster` 里手写的 `0.5` 改读这一份。
  端口公式同时下沉到 `geometry/port.ts`, `geometry → route → audit` 这条链断开。Scene 系列类型仍住
  `audit.ts`(与 ① 一起做; 半搬会长出两个 `Scene`)。barrel 书写顺序仍只是阅读导航, 不许靠重排假装收口

- **行内标记的第二档** —— v1(260925)只有四种样式: `**粗**` / `*斜*` / `~~删~~` / `[字]{tone|#hex}`。未做且已知: ① 等宽 `code`(加一种 `InlineKind` + `INLINE_STYLE` 一行即可: 样式袋 / `DTextSpan.attrs` 都吃得下 `font-family` —— 刻意**没**预置空字段, 见 QUICKREF「边界」那条"不提前给空位"); ② 链接 / 上标 / 名字引用(`name` / `link` / `sup`); ③ 着色的 **tint 底**(现在只改文字色, 给底就得同时动 `labelBoxShape` 的背景片); ④ **落单标记的报位诊断**(`TextRun.start/end` 已经带出来了, 门禁还没拿它指路); ⑤ `knives/describe.ts` 的读数板走 `textUnits(原串)` —— 带标记的标签在终端里会多算那几个标记字符(`cells(plainText(s))` 一行可收, 但那会改 `describe` 的既有输出字节, 等下次一并做)。前三项都要"先有真需求再开", 第四项等下一次"作者写歪了却没人喊"的实例
- **web playground / 薄壳演示页** —— ✅ 260926 已起步: `website/`(Vite + React 静态站, 独立
  package, 依赖单向 —— core 一行不动、零依赖不破; 画廊 SVG 全走 prerender 管线直出, hero 是内核在
  浏览器里现场算)。原记作 "v0.2", 而 v0.2 这个号 260925 起归排版层; 后续(playground 交互编辑 /
  React 薄壳狗粮场)仍按 `docs/infograph-roadmap.md` 的"划界"排
- **动画: descriptor 缺"随时间变的量"这一维(260926 缺口盘点, 按证据排期, 别当 v0.4 的并列项)** ——
  全仓零动画能力: `Attrs` 是**静态**的, 值在构造时定死; 无插值、无 easing、无薄壳。三档成本差三个数量级:
  ① **SVG 内建动画(SMIL / CSS `@keyframes`)** —— 最便宜且**不破任何现有纪律**: 动画在浏览器端跑,
  产物仍是静态字节, 所以字节确定 / golden / `禁 Date.now` 全不受影响, 门禁也不用动(动画走轴二
  "不进净空门禁"那一档, 与图标 / 网格底纹同族)。✅ **地基已落地(260926)**: `DAnimate` +
  `DStyle` + `EASING_SPLINES`(唯一缓动表, 词表同源写错即抛) + serialize 两 case, 纯加法、golden
  逐字节不变; 实测口径(SMIL 目标是父元素 / 非继承属性走 href 逃生舱)钉在 `descriptor.ts` 动画段注释
  与 `test/animate.test.ts`。而且它服务核心定位: 导出的 .svg **自己就会动, 零 JS** —— 静态产物 + 播放能力, 是延伸不是转向。
  ⚠ **隐藏前置(260926-17:05 补记): 选择器 hook 通道** —— ✅ **当日已落地**: `ExportOptions.hooks`
  (缺省关, 关时产物逐字节不变; `src/export.ts` 的 `hookAttrs` 单点派生)。恒吐 `id` + `data-kind`;
  有值才吐 `data-tone` / `data-variant`; `data-form` 恒吐节点形态(不用 `data-shape` —— 那名字被形状层
  占着且一词两义)。设计判据(仍是口径): SMIL 档要的是 **id 透传**(跨元素时序 `begin="other.end"` /
  交互 `begin="click"`, animate 本身是目标元素的子元素, 不靠选择器); CSS 档才要语义 hook, 且用
  **data-\***(`data-kind` / `data-tone`, 与 `data-draft="1"` 同族)不用自由 class —— class 命名空间会和
  作者手写的撞, 五张图五种命名就是又一个 P4。CSS `@keyframes` 另有一条口吻约束: 样式表只能
  **内嵌 `<style>`**(`DStyle` 已落地) —— 靠宿主页面 CSS 的产物离开宿主就死, 与「自包含 SVG」撞车
  ② **时间序列多态 + JS 驱动** —— 消费侧拿纯函数 `sampleAt(t)`, 标量插值(`{x,y,w,h}` / tone / opacity)
  对本仓极自然。⚠ **路径 morph 是真难点**: 一条边从折点列变到另一个要等参数化(按弧长重采样), 而
  `orthogonal_deviation` / `no_backtrack` 全建立在"折点是整数坐标 + 正交"上, 一插值立刻违反 —— **别一上来
  就碰它**, 先做横移型(节点移动 / 高亮切换)
  ③ **播放状态机** —— 已焊进「不做」, 别再想
  判据: 动画是**装饰性需求**还是**信息性需求**? 前者按「不做投影」同款判词留在外面, 后者才立项。
  真要做的第一件事是**先有一张要动的真图** —— 跟「≥3 张真实样本才升级为判据」同精神
- **descriptor 的双态承诺没有归属(260926 缺口)** —— `src/descriptor.ts` 文件头写着"双态序列化的分界点:
  `serialize.ts` → SVG 字符串 / **react 薄壳 → JSX 元素**", `layering.md` 的依赖方向也给它留了位, 但
  **ROADMAP 里没有任何 React 消费面的立项**, `public-api.md` 的变更分级也没给它预算(它不是子路径)。
  倾向的归属(**待定, 别先焊**): **薄壳建在仓外**(vault 的 htmls / skill 侧), core 只保证 descriptor
  表达力够薄壳用 —— 这样"react / vite / esbuild 一律不引"那条红线**一个字都不用破**。于是这个立项
  真正要回答的不是"要不要建 react 包", 而是"**descriptor 要不要为时间维度设计**"
- **npm 发包** —— 另立项; 在此之前 `bun link` 或 git URL 引入
- **美学度量校准** —— 攒够 ≥3 张真实图的踩坑样本后才谈把警告升级为判据(现在启发式一律 warning)
- **一维约束账本之上的列心求解 / 回吐重解、跳线(line jump)** —— 按证据排期
- **整幅外来素材不进净空门禁** —— 图标 / 网格底纹 / `embedAsset` 同档, 边与标签压在图表上眼下无人管; 要收口得先按纪律 9 举证 + 纪律 11 给旋钮, 现在靠作者留位(见 `QUICKREF.md` 误用表)
- **几何谓词层的坏中间量没有出口(260926 对账记下, 不立项)** —— `guard` 守的是**传入**的坏值
  (shape 入参的 rect / points / 旋钮 / 词表), 守不到**推导出来的**: `orthogonalDeviation` 的偏差 /
  `measureText` 的估宽 / 凸包遇退化点列 / 半剖面 profile 遇自交。按"启发式一律 warning、攒够 ≥3 个
  真实样本才谈升级为判据"的既有纪律, 现在**只记不动**; 先等一个"agent 手写 scene 推出一个坏中间量、
  且没有一道门喊"的真实例。对账详见 `docs/avatar-lab-parity.md`

## 不做

- 不做 data visualization, 不做自动排布(排布是作者决策, core 不猜意图)
- **播放状态机 / 播放器状态不进 core(260926 焊死)** —— 谁在播 / 播到哪 / loop·ping-pong·暂停补偿
  是**消费态**不是作者声明, 与「轴三 · 决策与推导分离」同族: 几何内核没有它的位置。真要动画,
  消费侧自己拿纯函数 `sampleAt(t)` 驱动, 别让 core 持有时钟
- **不做投影 / 3D 几何(260926 对账焊死)** —— 深度、透视、遮挡排序一律不进内核; 视觉立体感走
  `theme` 的 7 tone × `solid`/`variant`。证据: 外部那份纯解析投影 + 凸包剪影的 3D 渲染器
  (`docs/avatar-lab-parity.md`) 绕过的每一样东西在 SVG 语境里都不需要, 立体感可以完全由轮廓承担 ——
  "给节点加个投影显得立体"是装饰性需求, 不是几何需求
- 不引入 npm 之外的运行时依赖, 不上 build step(react / vite / esbuild 一律不引)
- 不为第三方图标库的破坏性升级做兼容层(升版走 PR)
