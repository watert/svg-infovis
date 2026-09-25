---
name: svg-infovis-infograph-roadmap
description: "从 diagram 跨向 infograph 的性价比路线图: 划界 / 需求全景 / P0-P2 排期"
tags: [svg-infovis, infograph, roadmap]
date: 2026-09-25T18:00:00+08:00
---

# Infograph 路线图(v0.2 起)

## 划界: 什么算 infograph 需求, 什么不碰

沿用 `ROADMAP.md` 红线(不做 data visualization、不做自动排布), 它恰好把 infograph 需求切成两半:

- **做**: 作者声明数值/比例, kernel 只做几何 —— 大数字、进度条、图标阵列、时间线。无比例尺、无数据绑定、无坐标轴。
- **不碰**: 真 chart(轴 / 比例尺 / 序列数据)。这块**已被覆盖** —— `assets/embeds/` 的 echarts 底板 + `shapes/embed.ts` 整幅外来素材链, 真图表走 embed, 不在内核重造。

**反比例尺口子**: 进度条停在"作者声明 ratio", pictogram 停在"作者声明 N 和 k"。kernel 一旦从数据推几何, 就滑向 chart 库, 与 echarts embed 链正面撞车。

## 需求全景 × 现状覆盖(260925 盘点)

1. 标题层级(kicker / 大标题 / 小节头 / 来源行) —— 无
2. 大数字 stat(数字 + 标签 + delta) —— 无, 但 `knives/fit` + `measure` 够反算盒
3. 列表与步骤(编号徽章 / bullet 行) —— 无, `pack`/`place` 现成
4. 图标叙事(ISOTYPE 式 pictogram 阵列) —— 无, lucide 图标槽 + grid 都在
5. 单值比例(进度条 / 100% 堆叠条 / donut) —— 无, `DPath.d` 是裸字符串, arc 零额外成本
6. 经典结构(时间线 / 金字塔 / 漏斗 / 2x2 / 对比双栏) —— 半有(lifecycle/sequence/layered 是 diagram 视角)
7. 引线标注 callout —— 半有(`route` 缺"指向任意点"的端口语义)
8. 装饰(分隔线 / 引文块 / 徽标) —— 无, trivial
9. 正文自动换行 —— 无(只认手动 `\n`, `measure` 在但无 wrap)
10. 分类色板 —— 7 tone × 3 variant 对 diagram 够, 对分类编码偏紧

## 分层决策(260925): 数值语义不进 shapes, 走 blocks/ 扩展层

判据: **离 chart 多近**。shape 层只收无数值语义的排版组件 —— stat 的数字是"字"(几何不编码数值), 徽章 / 标题同理。凡是"一个数值 → 一段几何"的(进度条的 ratio、pictogram 的 k/N、donut 的占比、金字塔的层级量)一律不进 core shapes —— 那是 chart 的胚芽, 今天进度条明天就有人要轴。

但这类东西也不该流落仓外: 契约就是 **`{ shape: DGroup, bounds: Rect }`**(v0.2 批次一已自发出现: `listRowShape` / `headingGeometry` 都长这样), 纯组合 core 的刀、零新依赖。故立三层:

- `src/geometry/` —— 只收纯几何原语(arc 极坐标路径、polygon 堆叠); 准入门槛: **≥2 个消费者才上提**(一处事实一处), 第一次需要时在 blocks 内私有
- `src/shapes/` —— 无数值语义的排版组件(stat / badge / heading / divider)
- `blocks/`(新, 仓内顶层, 独立 exports 子路径) —— 组合 block, 满足块契约, 可被 `pack`/`place` 嵌套摆放; 数值语义全关在这层(作者声明 ratio / N / k, kernel 不推)
- `templates/` —— 场景骨架, 槽位吃 block

按此归位: pictogram 与进度条都是 block(各编码一个数), v0.2 顺手把 blocks/ 层立起来; 金字塔 / 漏斗 / donut / callout 将来全落 blocks/。

## 排期(性价比序)

### v0.2「排版层」 —— 零新几何, 全是 shapes/blocks 封装

- stat 大数字块(数字 + 标签 ± delta, fit 反算盒) —— shapes/
- 编号徽章 + 列表行(circle 徽章 + 文本行, pack 组列) —— shapes/
- 标题层级(section header / kicker / divider) —— shapes/
- pictogram 阵列(grid × icon 槽 × tone 染色, 作者声明 N 与 k) —— blocks/
- 进度条 / 比例条(作者声明 ratio, 两个 rect + 标签) —— blocks/(第一个公民, 顺手立层)

这批做完, 产物从"像流程图"跳到"像 infographic", 是感知上最大的一跳。每件 ~100 行内, 纯组合现有刀。

### v0.3「模板层」 —— templates/ 内闭环, 不动内核

- 竖版时间线(脊线 + 徽章 + 文本块, `place`/`pack` 组装)
- 对比双栏(vs) / 2x2 矩阵

### v0.4「blocks 扩充」 —— 按真实踩坑样本排(沿用"≥3 张真实图再升级"纪律)

- 金字塔 / 漏斗(block; polygon 原语有第二个消费者再上提 geometry)
- donut / 仪表盘(block; arc 数学同上)
- 引线 callout(block; 动 route 刀的"任意坐标端口"部分等证据)
- 正文自动换行(贪心 wrap; 动 `fit` 契约 —— "几行"从作者声明变推导结果, 防盒反算漂口径)
- 分类色板扩展(等真图样本)
