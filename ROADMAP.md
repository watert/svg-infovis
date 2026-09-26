---
name: svg-infovis-roadmap
description: "svg-infovis 的立项依据、当前能力与后续方向"
tags: [svg-infovis, roadmap]
date: 2026-09-26T00:00:00+08:00
---

# ROADMAP

## 立项依据

- 独立、零运行时依赖是刻意的前提; 为发布 npm 包补了一档 `dist/` 构建(260926), 但它是派生产物、gitignored —— 版本库里仍不囤构建产物, 大目录云同步环境不会与版本库抢成旧内容。
- 立项实测: 8 张真实 Mermaid 结构图上, 纯几何门禁只喊 3 声(召回 ≈ 21%), 而肉眼每图 1–2 处想改(分层被排成阶梯 / 组内空白 41–80% / 长边横扫)。结论: 疼在**意图表达与排布旋钮**, 不在像素精度 —— 需要一个"零运行时依赖、字节确定、排布归作者"的 diagramming 几何内核, 门禁 fail-closed、旋钮显式。

## 当前能力(v0.1 · v0.2 排版层)

- **geometry**: 向量 / 圆角路径解算 / 几何谓词 / 行块堆法 / box·grid·pack·place 版式原语(`place` 是 260925 补的"盒摆到另一个盒某侧", 与 `pack` 并列 —— pack 管一列 / 一行, place 管两个盒的关系)
- **knives**: 正交路由(`via` 声明、腰线分配)、门禁审计(十九项 + 密度四项警示)、fit 盒反算、describe 读数板、nudge 微调、cluster 组语义、一维约束账本
- **shapes / serialize / theme**: 三形态节点、标签遮罩几何、7 tone × 3 mode × 3 variant、字节确定序列化
- **排版层(v0.2, 260925)**: `shapes/` 补三件**无数值语义**的排版件(stat 大数字块 / badge 徽章与列表行 / heading 标题梯级与分隔线); 新建顶层 `blocks/` 层收**带数值语义**的组合块(progress 单值条与堆叠条 / pictogram 图标阵列) —— 块契约 `{ shape, bounds }`, 独立 `exports` 子路径且**不进 barrel**; 划界与排期见 `docs/infograph-roadmap.md`
- **export**: `tryExport`(迭代草稿)/ `exportScene`(fail-closed 交付)/ auto-fit
- **templates**: sequence / layered / lifecycle 三套可填参骨架
- **examples**: 五桶示例(项数 = `examples/manifest.ts` 的 `EXAMPLES` 长度, 数它别数人脑); PNG 快照 260926 已退役 —— 出图产物就是 SVG 文本; 配方与架构文档齐备
- **素材链**: 图标走 optional 依赖 `lucide-static` + lazy 读盘; 整幅外来 SVG 走 fail-closed 素材链
- **CLI `svginfo`**: authoring 入口(run / inspect / render / new / icons) —— `bun link` 后全局可用, 或 `npx svginfo`; 双运行时(有 bun 走 bun, 否则 node ≥22.6 的类型剥离)
- **发布形态(260926)**: `exports` 全部指向 `dist/`(三条件映射、逐条列举、不通配)、ESM-only、`engines >= 20.16`、`files` 白名单(详见下节「npm 发包」)
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
  ⚠ **archify 对账(260926 调研, ① 档的待办清单)** —— archify 动画 95% 是宿主 viewer 的运行时叠加
  (rAF / 相机 / motion-governor / WebM), 机制不可搬(与零运行时 / 字节确定撞车, 且 ③ 档已焊死);
  可搬的只有它那小段声明式产物动画的**表达式与节拍**, 按成本从低到高:
  ⓪ 文档补齐: `README.md` 的 descriptor 索引与 `QUICKREF.md` 还没列 `animate()` / `style()` / `EASING_SPLINES`;
  ⓵ `animateMotion`(`DAnimate` 加一个 kind 分支, 纯加法): 语义 token 沿真实 authored 路径跑,
  `calcMode="spline"` + `keySplines` + `rotate="auto"`, 比 dashoffset 更"信息性"(方向 + 语义种类同时表达),
  是 archify 全仓唯一 SMIL 用法、可验证;
  ⓶ `TIMING` 节拍表(对称于 `EASING_SPLINES` 的单一真值): 蚂蚁线 / 节点脉冲 / stagger 基底的时长与延迟各收敛一处,
  archify 参考节拍 160(stagger 步长)/ 780(token 单程)/ 2400(边流)/ 3600(节点脉冲)ms, 当参考不抄写;
  ⚠ 表内分两类(260926-18:38 补判据): **正确性常量**(缝重叠量)**不暴露**给作者, **风格旋钮**(节拍快慢)**暴露可覆写** ——
  混在一起, 作者能配出一个"无重叠"的错觉参数, 缝就回来了(参照 `slide` 那条"避免白缝"的手艺: 它只活在源码注释里, 不是旋钮)
  ⓷ stagger 的正确姿势: 作者数组顺序 → 步进索引 → 延迟, 只压视觉不动语义顺序。
  ⚠ **"cap 在上界 12" 这个方案已否(260926-18:38 外部对账)**: 索引 cap 会丢掉第 12 个之后**所有元素的顺序信息**
  (它们全同时起)。正解是 cap 从"数量上限"换成"**时间跨度上限**, 用缓动压分布": `delay = S · e(i/(n-1))`,
  e 严格递增且 e(0)=0 / e(1)=1; n 超阈值时**不动顺序、只固定 S、把 e 换成前快后慢**。
  且现方案的数字**自相矛盾**: 160ms × 11 = 1760ms, 是 token 单程 780ms 的 2.3 倍 —— 数要重定,
  建议 `TIMING` 直接写毫秒(`staggerSpan`), 不写个数
  ⓸ `prefers-reduced-motion` 兜底配方(**已订正 260926-18:38: 不是一刀切**): 原记的 `animation: none !important`
  会把位移类与淡入类一起打死。正解**分两类** —— 位移类瞬间落到终态、淡入类照常渐变。
  另有一条**结构性差异**: `style()` 档能自己包 `@media (prefers-reduced-motion: reduce)`,
  **SMIL 档没有等价钩子**(CSS 管不到行内 SMIL)。⇒ 选型判据: **纯装饰优先走 `style()`(可自我关闸),
  SMIL 留给需要属性插值的场合(transform / stroke-dashoffset)并配 `fill="freeze"` 兜底**
  ⓹ finite + settled 纪律: 动画一次跑完永久回到 authored 静态样式, 不重播 —— 对"golden 是静帧"的仓
  这条纪律比动画本身值钱, 与下面"装饰性 vs 信息性"判据同源(archify 版判词: 动效要说明一个有名字的
  系统行为, 并且停在可读的静帧)。**且它可机器验证**: `serialize(sampleAt(末)) === serialize(静态产物)`
  另: ① 档现存缺口一并记账 —— `<set>` / `<discard>` 未做; 形状 descriptor 无 animate 子槽
  (动 `r`·`cx` 只能 href + 作者给 id, 另一件立项); `skewX/Y` 词表外(故意); 逐段 `values` 缓动只能手写 attrs
  (⚠ 260926-18:38 补: 这条有个**没定的取舍** —— SMIL 的 `keyTimes` 是归一化 0..1, 没有"帧"这回事,
  要逐段缓动必须知道**每段占多少时间**, 于是只剩"强制作者同时给 `keyTimes`"或"等分(等于没表达力)"两条路;
  **取舍没定之前不要立项**); **缓动词的准入硬约束(260926-18:38 规范定案)**: SMIL `keySplines` 四值
  **必须 ∈ [0,1]** ⇒ `back` / bounce / elastic / 有回弹的 spring **在单段里根本表达不了**(CSS `cubic-bezier`
  允许 y 越界, SMIL 不允许 —— 这是两边的分界点, 不是实现差异), 只能走多段 `values`;
  `EASING_SPLINES` 要加一条机器守卫(词表 10 条今天全合规);
  WebM 拖尾算法(均匀采样 → 拖尾折线 → `alpha = 0.42 + sin(π·p)·0.5`)是纯函数, 真需要时可做 `knives/`
  级纯计算 util 供宿主驱动, **不进 core 产物链**; infinite 循环装饰不做(website 画廊同页多份内联, 无限动画是灾难)
  ② **时间序列多态 + JS 驱动** —— 消费侧拿纯函数 `sampleAt(t)`, 标量插值(`{x,y,w,h}` / tone / opacity)
  对本仓极自然。**260926-18:38 补: 这条现在有了明确的消费方** —— 帧驱动渲染(Remotion 这类宿主逐帧截图)。要点:
  ① 它**作用于 scene 参数层**(`sceneFn(t) => Scene`), 与 ① 档作用在 descriptor 属性层**不同层**, 共享的只有
  真值表(`EASING_SPLINES` / `TIMING`)—— **别强行统一机制**(那是第二权威); ② 求值出来是**普通 scene**,
  现有 `audit` / `exportScene` 一行不改 ⇒ 副产品是"**视频的每一帧都过几何门禁**"(别的视频管线做不到);
  ③ 反过来 ① 档在帧驱动宿主里**必须关掉**(SMIL / CSS 的时钟与帧号不同步, 会得到随机帧)——
  "禁令适不适用"取决于**消费侧是不是帧驱动宿主**
  ⚠ **路径 morph 是真难点**: 一条边从折点列变到另一个要等参数化(按弧长重采样), 而
  `orthogonal_deviation` / `no_backtrack` 全建立在"折点是整数坐标 + 正交"上, 一插值立刻违反 —— **别一上来
  就碰它**, 先做横移型(节点移动 / 高亮切换)。**补证据(260926-18:38)**: remotion 的 `interpolatePath` 是
  顶点按索引 lerp + 点数补齐, **不是弧长重采样**, 中间态既非整数也不正交 ⇒ 这条现在不是"还没实现",
  而是"**那套东西解决的不是我们的问题**"
  ③ **播放状态机** —— 已焊进「不做」, 别再想
  判据: 动画是**装饰性需求**还是**信息性需求**? 前者按「不做投影」同款判词留在外面, 后者才立项。
  真要做的第一件事是**先有一张要动的真图** —— 跟「≥3 张真实样本才升级为判据」同精神
  ⚠ **调研归档(260926-18:38)**: 外部对账(Remotion / motion / 官方 skills 三仓: 可搬什么、为什么、
  对方自己哪里错了) → `docs/animation-parity.md`; 消费面规划(三个场景 / 两条腿 / 方向清单 / 边界 /
  待拍板) → `docs/animation-roadmap.md`。**两篇是这条目的展开, 排期前先读**
- **descriptor 的双态承诺没有归属(260926 缺口)** —— `src/descriptor.ts` 文件头写着"双态序列化的分界点:
  `serialize.ts` → SVG 字符串 / **react 薄壳 → JSX 元素**", `layering.md` 的依赖方向也给它留了位, 但
  **ROADMAP 里没有任何 React 消费面的立项**, `public-api.md` 的变更分级也没给它预算(它不是子路径)。
  倾向的归属(**待定, 别先焊**): **薄壳建在仓外**(vault 的 htmls / skill 侧), core 只保证 descriptor
  表达力够薄壳用 —— 这样"react / vite / esbuild 一律不引"那条红线**一个字都不用破**。于是这个立项
  真正要回答的不是"要不要建 react 包", 而是"**descriptor 要不要为时间维度设计**"
- **npm 发包(260926 已落地)** —— 发布形态: ESM-only; `exports` 全部指向 `dist/`(逐条三条件映射,
  **不用通配** —— 通配会让内部文件自动变成公共面); `bin.svginfo` 走 `#!/usr/bin/env node` + 双运行时;
  `files` 白名单只带 `dist` / `src` / `blocks` / `scripts` / `templates` / `assets` / `skills` + `README.md` / `LICENSE`
  (`test/` / `examples/` / `website/` / `docs/` / `refs/` / `.github/` / `ROADMAP.md` / `AGENTS.md` 不进包);
  **本仓同时是一份 Agent Skill** —— 真身在 `skills/svg-infovis/`(`npx skills add watert/svg-infovis` 可装),
  仓根的 `QUICKREF.md` 与 `refs/{recipes,layering,principles,public-api,aesthetics}.md` 是指向真身的软链:
  所以 QUICKREF 也在包里, 只是路径落在 `skills/svg-infovis/` 下(软链本身不进 npm 包)。
  布局纪律与两条实测坑见 `AGENTS.md` 的「skill 与文档的真身在哪」;
  `prepare` 保证 link / git URL 安装时自动构建。消费侧 `bun` / `vite` / `esbuild` / `tsc(bundler|nodenext)`
  零配置可用(实测)。**已知未覆盖**(别当支持): ① `moduleResolution: node`(node10 老档)不认;
  ② CJS `require` 不支持(ESM-only; 但 node ≥22.12 的 `require(ESM)` 能拿到它, 实测 269 个 key);
  ③ 浏览器侧算源指纹 `decisionDigest` 不支持(那一步要 sha256,
  走 bun 或 node 内置); ④ `engines >= 20.16`(20.16 起 `getBuiltinModule` 回移可用), 更低版本的纯 node 用户跑不动源指纹那档;
  ⑤ `refs/build-arch*.ts` 与 `test/*-probe.ts` 里还留着 bun 专有的 `import.meta.main`(两者都不进包、也不参与门禁,
  留作演进史与夹具的追认, 不跟着改); ⑥ `./icons/lucide` 在浏览器打包下两家行为不同 —— esbuild 硬失败(分层预期),
  vite 只给 warning 并把 `node:fs` 换成空壳对象, 要到运行时才炸成 `readFileSync is not a function`(vite 的规矩, 不是包的)。
  代价记账见 `refs/public-api.md`
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
- 不引入 npm 之外的运行时依赖(唯一第三方是 optional 的 `lucide-static`, 只有 `./icons/lucide` 读它);
  本体不引 react / vite / esbuild。⚠「不上 build step」260926 已修正 —— 发布 npm 包需要 `dist/`,
  但它是派生产物、gitignored, 版本库里仍不囤构建产物(代价见 `refs/public-api.md`)
- 不为第三方图标库的破坏性升级做兼容层(升版走 PR)
