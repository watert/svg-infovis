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

- **行内标记的第二档** —— v1(260925)只有四种样式: `**粗**` / `*斜*` / `~~删~~` / `[字]{tone|#hex}`。未做且已知: ① 等宽 `code`(加一种 `InlineKind` + `INLINE_STYLE` 一行即可: 样式袋 / `DTextSpan.attrs` 都吃得下 `font-family` —— 刻意**没**预置空字段, 见 QUICKREF「边界」那条"不提前给空位"); ② 链接 / 上标 / 名字引用(`name` / `link` / `sup`); ③ 着色的 **tint 底**(现在只改文字色, 给底就得同时动 `labelBoxShape` 的背景片); ④ **落单标记的报位诊断**(`TextRun.start/end` 已经带出来了, 门禁还没拿它指路); ⑤ `knives/describe.ts` 的读数板走 `textUnits(原串)` —— 带标记的标签在终端里会多算那几个标记字符(`cells(plainText(s))` 一行可收, 但那会改 `describe` 的既有输出字节, 等下次一并做)。前三项都要"先有真需求再开", 第四项等下一次"作者写歪了却没人喊"的实例
- **web playground / 薄壳演示页** —— 另立项(原记作 "v0.2", 而 v0.2 这个号 260925 起归排版层, 编号待重定 —— 判据是 `docs/infograph-roadmap.md` 的"划界"); core 不引前端框架, 依赖单向
- **npm 发包** —— 另立项; 在此之前 `bun link` 或 git URL 引入
- **美学度量校准** —— 攒够 ≥3 张真实图的踩坑样本后才谈把警告升级为判据(现在启发式一律 warning)
- **一维约束账本之上的列心求解 / 回吐重解、跳线(line jump)** —— 按证据排期
- **整幅外来素材不进净空门禁** —— 图标 / 网格底纹 / `embedAsset` 同档, 边与标签压在图表上眼下无人管; 要收口得先按纪律 9 举证 + 纪律 11 给旋钮, 现在靠作者留位(见 `QUICKREF.md` 误用表)

## 不做

- 不做 data visualization, 不做自动排布(排布是作者决策, core 不猜意图)
- 不引入 npm 之外的运行时依赖, 不上 build step(react / vite / esbuild 一律不引)
- 不为第三方图标库的破坏性升级做兼容层(升版走 PR)
