---
name: svg-infovis-infograph-roadmap
description: "从 diagram 跨向 infograph 的性价比路线图: 划界 / 需求全景 / 排期与状态"
tags: [svg-infovis, infograph, roadmap]
date: 2026-09-26T00:03:04+08:00
---

# Infograph 路线图(v0.2 起)

> 🕒 更新 260926-00:03: 对照 vault 两篇调研(见文末「外部依据」)补强 —— 划界补三刀判据与 Flint 印证; 门禁边界点明构图/缺陷张力; 需求全景补 AntV 七类对照; v0.4 色板改走派生思路。
> 上一更 260925-23:59: v0.2 已交付, 全文补状态标注; callout 归位 knives/shapes(不进 blocks); 自动换行从 v0.4 拆出单列并标不动点风险; v0.3 补 examples 欠账与时间线/lifecycle 复用判据。

## 划界: 什么算 infograph 需求, 什么不碰

沿用 `ROADMAP.md` 红线(不做 data visualization、不做自动排布), 它恰好把 infograph 需求切成两半:

- **做**: 作者声明数值/比例, kernel 只做几何 —— 大数字、进度条、图标阵列、时间线。无比例尺、无数据绑定、无坐标轴。
- **不碰**: 真 chart(轴 / 比例尺 / 序列数据)。这块**已被覆盖** —— `assets/embeds/` 的 echarts 底板 + `shapes/embed.ts` 整幅外来素材链, 真图表走 embed, 不在内核重造。

**反比例尺口子**: 进度条停在"作者声明 ratio", pictogram 停在"作者声明 N 和 k"。kernel 一旦从数据推几何, 就滑向 chart 库, 与 echarts embed 链正面撞车。

这条口子的理论地基是切图三刀里的第二刀: **挪一个标记, 命题变不变** —— 变就是编码(归 chart/embed), 不变只是更好看就是排版(归内核)。"数值语义判据"(几何里有没有一个比例/计数)是它的工程化。行业侧同一结论已被两头印证: 微软 Flint 不让模型吐完整 spec、只标语义类型, 比例尺与配色交给编译器; 公开复盘里模型会把 1234 收成 1200 —— **数必须是作者写的那个数**, 所以数值归作者声明、几何归内核, 模型在两头的自由都砍掉。

## 需求全景 × 现状覆盖(260925 盘点, v0.2 交付后刷新)

1. 标题层级(kicker / 大标题 / 小节头 / 来源行) —— ✅ v0.2 `shapes/heading`
2. 大数字 stat(数字 + 标签 + delta) —— ✅ v0.2 `shapes/stat`(fit 反算盒)
3. 列表与步骤(编号徽章 / bullet 行) —— ✅ v0.2 `shapes/badge`
4. 图标叙事(ISOTYPE 式 pictogram 阵列) —— ✅ v0.2 `blocks/pictogram`
5. 单值比例(进度条 / 100% 堆叠条) —— ✅ v0.2 `blocks/progress`; donut 仍无
6. 经典结构(时间线 / 金字塔 / 漏斗 / 2x2 / 对比双栏) —— 半有(lifecycle/sequence/layered 是 diagram 视角)
7. 引线标注 callout —— 半有(`route` 缺"指向任意点"的端口语义)
8. 装饰(分隔线 / 引文块 / 徽标) —— 半有(heading 带 divider; 引文块仍无, trivial)
9. 正文自动换行 —— 无(只认手动 `\n`, `measure` 在但无 wrap)
10. 分类色板 —— 7 tone × 3 variant 对 diagram 够, 对分类编码偏紧

**对照 AntV Infographic 七类分类学校验**(list / compare / sequence / hierarchy / relation / geographical / statistical): 本仓覆盖 list(v0.2)、sequence(半, v0.3 补叙事时间线)、compare(v0.3); hierarchy 是 diagram 主业已有模板; relation 即内核老本行; geographical 不做(与红线一致); statistical 走 embed 链。缺口全是刻意的, 不追求七类全覆盖 —— 那份分类学服务的是模板库打法(93 个模板), 我们走的是证据排期。

## 分层决策(260925): 数值语义不进 shapes, 走 blocks/ 扩展层

判据: **离 chart 多近**。shape 层只收无数值语义的排版组件 —— stat 的数字是"字"(几何不编码数值), 徽章 / 标题同理。凡是"一个数值 → 一段几何"的(进度条的 ratio、pictogram 的 k/N、donut 的占比、金字塔的层级量)一律不进 core shapes —— 那是 chart 的胚芽, 今天进度条明天就有人要轴。

但这类东西也不该流落仓外: 契约就是 **`{ shape: DGroup, bounds: Rect }`**(v0.2 批次一已自发出现: `listRowShape` / `headingGeometry` 都长这样), 纯组合 core 的刀、零新依赖。故立三层:

- `src/geometry/` —— 只收纯几何原语(arc 极坐标路径、polygon 堆叠); 准入门槛: **≥2 个消费者才上提**(一处事实一处), 第一次需要时在 blocks 内私有
- `src/shapes/` —— 无数值语义的排版组件(stat / badge / heading / divider)
- `blocks/`(新, 仓内顶层, 独立 exports 子路径) —— 组合 block, 满足块契约, 可被 `pack`/`place` 嵌套摆放; 数值语义全关在这层(作者声明 ratio / N / k, kernel 不推)
- `templates/` —— 场景骨架, 槽位吃 block

按此归位: pictogram 与进度条都是 block(各编码一个数), v0.2 顺手把 blocks/ 层立起来; 金字塔 / 漏斗 / donut 将来全落 blocks/。

**门禁边界(跨层纪律, 细节在 `blocks/README.md`)**: 块压在版式上, 不进净空门禁 —— 与图标 / 网格底纹同档; 块与别的元素保持距离靠**作者留位**(`pack` 的 `gap` / 列距), 别指望门禁替你喊。这条纪律同时是一道防线: pictogram 的"图标当数量"已经是**构图**与**缺陷**交界的灰区 —— 海报要重叠、要图标当数量、要留白当情绪, 那些在那边是构图, 在这边的门禁口径里全是缺陷。往信息图靠只走到"作者声明 N/k"为止; 海报式重叠 / 非正交装饰箭头 / 情绪化留白**永远不进**, 那是拿唯一值钱的几何纪律去跟 Illustrator 和模板库抢活。

## 排期(性价比序)

### v0.2「排版层」 —— ✅ 已交付(260925)

- ✅ stat 大数字块(数字 + 标签 ± delta, fit 反算盒) —— `shapes/stat.ts`
- ✅ 编号徽章 + 列表行 —— `shapes/badge.ts`
- ✅ 标题层级(section header / kicker / divider) —— `shapes/heading.ts`
- ✅ pictogram 阵列(grid × icon 槽 × tone 染色, 作者声明 N 与 k) —— `blocks/pictogram.ts`
- ✅ 进度条 / 比例条(作者声明 ratio) —— `blocks/progress.ts`(第一个公民, 顺手立层)

**估算校准**: 预估"每件 ~100 行内", 实测 `stat.ts` 344 行、`progress.ts` 491 行(均不含 ~230 行测试) —— "纯组合现有刀"的复杂度被低估约 3 倍, 磨合成本在契约细节(幂等 / 读数盒 / tone 接线)不在几何。v0.4 各项估算按此系数重打。

### v0.3「模板层」 —— templates/ 内闭环, 不动内核

- **examples 补 infograph 示例**(stat / pictogram / progress 各一, 入 `examples/manifest`) —— v0.2 欠账: "感知上最大的一跳"要靠 gallery 证明, 不能只有单测
- 竖版时间线(脊线 + 徽章 + 文本块) —— 先判与 `templates/lifecycle` 的关系: lifecycle 是 diagram 视角的事件流(带 via 折点与账本), 时间线是叙事排版; **能吃现有模板槽位就复用参数面, 不另起骨架**; 判据是两份声明能否共享 80% 字段
- 对比双栏(vs) / 2x2 矩阵

### v0.4「blocks 扩充」 —— 按真实踩坑样本排(沿用"≥3 张真实图再升级"纪律)

- 金字塔 / 漏斗(block; polygon 原语有第二个消费者再上提 geometry)
- donut / 仪表盘(block; arc 数学同上)
- **callout 归位**(260925 订正: 不进 blocks —— 引线指向点不编码数值, 按分层判据它无数值语义):
  - `route` 支持"任意坐标端口"是 **knives 增强**, 等证据再动
  - callout 形状(引文气泡 / 指向线)落 **shapes/**
- 分类色板扩展(pictogram 已在用 tone 染色, 真图样本会很快攒够) —— **优先抄 AntV 的派生思路而非堆 tone**: 少输入(主色 ± 背景 ± mode)在 OKLCH 空间派生语义色族, 对比度不足自动换文字色; "主色即设计意图"比"tone 从 7 加到 12"便宜且更难配丑

### v0.5「正文自动换行」 —— 单列, 全表唯一动内核契约的项

- **不动点风险**: wrap 依赖盒宽, `fit` 反算盒宽又依赖行数, 两者互相咬。动手前必须先回答"谁先收敛" —— 作者声明显式宽、行数变推导结果? 还是固定行高迭代到不动点? 没答案前不动 `fit` 契约("几行"从作者声明变推导结果, 盒反算口径会漂)
- 贪心 wrap 只是实现细节, 风险在契约不在算法, 故从 v0.4 拆出不与 trivial 项并列

## 外部依据

- vault `posts/260925-Infovis与信息图-范畴边界与AI实践.md` —— 切图三刀(天生空间 / 命题变不变 / 发现还是听讲); svg-infovis 定位"解说性示意图、信息图是下游客户"; 行业四管线与 Flint 语义标注实证; "模型把 1234 收成 1200"
- vault `posts/260925-AntV-Infographic-产品语境与Skill生态整合.md` —— 七类分类学; "DSL 给骨架、几何落到具体模板"(与本仓 templates/ 吃 block 同构); 主题派生(3 输入 → 语义色族); 反面对照: 它的容错解析哲学不适用于本仓 —— 本仓 fail-closed 双档(`tryExport` 草稿 / `exportScene` 交付)已是同问题的另一种答案, 不引
