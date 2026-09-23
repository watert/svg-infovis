---
name: svg-infovis-roadmap
description: "svg-infovis 的立项依据、当前能力与后续方向"
tags: [svg-infovis, roadmap]
date: 2026-09-23T16:00:00+08:00
---

# ROADMAP

## 立项依据

- 本项目从私人笔记库迁出为独立开源仓 —— 笔记库的云同步在大目录上反复把构建产物与版本库抢成旧内容, 维护撞墙, 一句带过不再展开。
- 迁出前的实测: 8 张真实 Mermaid 结构图上, 纯几何门禁只喊 3 声(召回 ≈ 21%), 而肉眼每图 1–2 处想改(分层被排成阶梯 / 组内空白 41–80% / 长边横扫)。结论: 疼在**意图表达与排布旋钮**, 不在像素精度 —— 需要一个"零运行时依赖、字节确定、排布归作者"的 diagramming 几何内核, 门禁 fail-closed、旋钮显式。

## 当前能力(v0.1)

- **geometry**: 向量 / 圆角路径解算 / 几何谓词 / 行块堆法 / box·grid·pack 版式原语
- **knives**: 正交路由(`via` 声明、腰线分配)、门禁审计(十九项 + 密度四项警示)、fit 盒反算、describe 读数板、nudge 微调、cluster 组语义、一维约束账本
- **shapes / serialize / theme**: 三形态节点、标签遮罩几何、7 tone × 3 mode × 3 variant、字节确定序列化
- **export**: `tryExport`(迭代草稿)/ `exportScene`(fail-closed 交付)/ auto-fit
- **templates**: sequence / layered / lifecycle 三套可填参骨架
- **examples**: 五桶 12 项示例 + PNG 快照; 配方与架构文档齐备
- **素材链**: 图标走 `lucide-static` 依赖 + lazy 读盘; 整幅外来 SVG 走 fail-closed 素材链
- **CLI `svginfo`**: authoring 入口(run / inspect / render / new / icons), `bun link` 全局可用

## 后续方向

- **web playground / 薄壳演示页** —— 另立项(v0.2); core 不引前端框架, 依赖单向
- **npm 发包** —— 另立项; 在此之前 `bun link` 或 git URL 引入
- **美学度量校准** —— 攒够 ≥3 张真实图的踩坑样本后才谈把警告升级为判据(现在启发式一律 warning)
- **一维约束账本之上的列心求解 / 回吐重解、跳线(line jump)** —— 按证据排期
- **整幅外来素材不进净空门禁** —— 图标 / 网格底纹 / `embedAsset` 同档, 边与标签压在图表上眼下无人管; 要收口得先按纪律 9 举证 + 纪律 11 给旋钮, 现在靠作者留位(见 `QUICKREF.md` 误用表)

## 不做

- 不做 data visualization, 不做自动排布(排布是作者决策, core 不猜意图)
- 不引入 npm 之外的运行时依赖, 不上 build step(react / vite / esbuild 一律不引)
- 不为第三方图标库的破坏性升级做兼容层(升版走 PR)
