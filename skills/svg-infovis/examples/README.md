---
name: svg-infovis-examples
description: "svg-infovis 的三张参考图(序列 / 阶段带 / 学术): 每张配一份仓内源文件的逐字节副本, 让只装了 skill 的 agent 也能对着'真图 + 真代码'校准观感与写法"
tags: [svg-infovis, examples, reference, png, recipe]
date: 2026-09-26T23:35:00+08:00
---

# 参考图 · 三张真图 + 真代码(随 skill 发布)

本 skill 其余几份是散文(选型表 / 缺省值 / 坑清单) —— 它们给的是**参数**。这个目录给的是**样本**:
一张合格的结构图长什么样, 以及画出它的那份代码。**配上读**, 比十段散文都管用。

⚠ 三份 `.ts` 是仓内源文件的**逐字节副本**, import 走**仓根相对路径**(`../../src/index`) ——
它们在这里**不能直接跑**, 是**读本**不是可运行副本。要真跑, 见下面「import 换算」。

## 三张表

| key | 图 | 代码 | 读它读什么 |
|---|---|---|---|
| `sequence-archify-style` | [`sequence-archify-style.png`](./sequence-archify-style.png) | [`sequence-archify-style.ts`](./sequence-archify-style.ts) | **序列 / 泳道图能到什么观感**: paper 主题 + 全 `tint` 参与者 + 消息按语义分色 + phase 分隔带 + 激活条 + 纸感底纹 |
| `lifecycle-agent-run` | [`lifecycle-agent-run.png`](./lifecycle-agent-run.png) | [`lifecycle-agent-run.ts`](./lifecycle-agent-run.ts) | **阶段带(状态机)的完整形态**: 三段 × 10 状态 + 向下岔路 + 跨全图回流, 深色主题带图例 —— 手排参照实现(339 行), 也是"手排税"的测量载体 |
| `academic-figure` | [`academic-figure.png`](./academic-figure.png) | [`academic-figure.ts`](./academic-figure.ts) | **学术风 + 四件槽**: paper 墨线观感 / `tint` 角色框 / `struck` + `opacity` 废除格 / `SceneText` 的 weight 与 color, 外加"有意让两栏同层"的白名单写法 |

### `sequence-archify-style` —— 序列图: 先看骨架, 再看后处理

- 全图**一个坐标都没手写**: 消息流 / 泳道 / 激活条交给 `templates/sequence.ts` 的 `buildSequence`,
  本文件只做**后处理**(换主题、按语义分色、加 phase 带、色调收口)。
- **该抄的是这个分工**: 决策表(`SequenceSpec`)在上, 几何推导在下。你写上面那张表, 别抄下面的推导。
- 两处细节值得单独看: ① phase 带用 `noCheck` + `frame: 'declared'`, 左右边界走 `bounds(actor 盒, { pad })`
  现算 —— 文件里留着"手定魔数 90 会怎样"的实测记录(左 67 / 右 53.5 忽远忽近, 而 `noCheck` 让门禁一言不发);
  ② 底纹**一行都不用写** —— paper 主题自带(`Theme.grid`), 那两行示范注释是留给"要换 / 要关"的。
- 想自己画序列图: `svginfo new seq`(拷模板起手), 或读包内 `templates/sequence.ts`; 缺省值见 QUICKREF 的 `SEQ_DEFAULTS`。

### `lifecycle-agent-run` —— 阶段带: 重点读"为什么和参照实现不一样"

- 文件头「与参照实现**故意不同**的两处」是全篇最值钱的: ① 参照实现把三个状态摞在同一个 x 上, 于是某条边
  **只能绕行**(出口在 2/3 高度、最后一段只剩 13px) —— **那不是路由器的锅, 是版式没给走廊**;
  ② 边的肤色按**去向属于哪一族**给, 不按来源。
- 图里那条段注(`lane` 落在分隔线 12px 外)是 `edge_overlap` **warning 档**的活体记录。
- ⚠ 手排 339 行 = 这个图型的成本上限; 同拓扑用模板(`templates/lifecycle.ts`)的 spec 约 1/10。**能填参就别手排。**
- 版式判据(门禁审不到的那三条)在仓内 `test/lifecycle-agent-run.test.ts`。

### `academic-figure` —— 学术风: 重点读"槽位怎么选"

- 四件槽的活体示范: `THEMES.paper` / `variant: 'tint'`(角色框) / `SceneNode.struck` + `opacity`(废除格) /
  `SceneText.weight` + `color`(面板标题与红蓝小标题)。选槽规矩见 QUICKREF「语义槽怎么选」。
- 文件头那段**白名单**示范了怎么把"有意的 warning"讲清楚: `mixed_cluster_row` ×3 报的是"两栏被同层打散",
  而**两栏并排就是这张图的全部版式** —— 门禁放过但要说一声时, **声明比沉默强**。

## import 换算(要在这里跑起一份, 照这张表改)

| 副本里写的 | 换成 |
|---|---|
| `'../src/index'` · `'../../src/index'` | `'@watert/svg-infovis'` |
| `'../../src/runtime'` · `'../src/runtime'` | `'@watert/svg-infovis/runtime'` |
| `'../scripts/runner'` · `'../../scripts/runner'` | 包内**没有**这条导出 —— 出口换成 QUICKREF「30 秒起手」那几行, 或克隆本仓 |
| `'./sequence'`(模板) | `svginfo new seq` 拷一份起手, 或读包内 `templates/sequence.ts` |

装包消费时 `src/` `templates/` `scripts/` `blocks/` `assets/` **都在包里**(能读), 但**不在 `exports` 白名单**里 ——
不能用包名 import 它们。三层入口与引法的完整口径见 [`../refs/contract.md`](../refs/contract.md)。

## 重出这三张(改了内核 / 改了示例之后)

```bash
bun run scripts/build-skill-shots.ts    # 副本 + PNG + shots.json 一起重出
```

- `shots.json` 是机读清单(源路径 / 副本路径 / PNG 尺寸与字节 / **导出指纹**), 由脚本写, **别手改**。
- 守卫在仓内 `test/skill-shots.test.ts`: 副本逐字节 == 源 · 导出指纹没过期 · PNG 头与尺寸对得上 · 图没超体积预算 · 本表与清单逐键一致。
- 三张图出盘时过一道 **pngquant 调色板量化**(≤256 色, 保留 alpha): 三张 336 kB → 90 kB, 是包内最重的一项, 所以有预算守卫(单张 ≤ 80 kB)。
  ⚠ **别改成 JPEG**: 这类"大色块 + 细线 + 小字"的图, DCT 既糊字又更肥 —— 实测 q88(4:4:4)比原 PNG 还大 40%, 只有 `lifecycle-agent-run` 那张勉强小 10%。
- ⚠ **PNG 不做字节守卫**: 栅格化器随机器而变(`rsvg-convert` / `qlmanage`), 拿字节当基线会在别人机器上假红。
  钉住的是**导出指纹**(= `bun run <源>` 的 stdout sha256)那一层 —— 内核一改字节它就过期, 提醒重出。
- PNG 是**放大到 1200 宽的渲染**(矢量重渲, 不糊), 只为让人眼 / agent 看清;**交付尺寸永远看根 `<svg>` 的 `width`**。
