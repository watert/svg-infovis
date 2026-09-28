---
name: svg-infovis-examples
description: "svg-infovis 的四张参考图(序列 / 阶段带 / 学术 / 判定流): 每张配一份仓内源文件的逐字节副本, 让只装了 skill 的 agent 也能对着'真图 + 真代码'校准观感与写法"
tags: [svg-infovis, examples, reference, png, recipe]
date: 2026-09-26T23:35:00+08:00
---

# 参考图 · 四张真图 + 真代码(随 skill 发布)

本 skill 其余几份是散文(选型表 / 缺省值 / 坑清单) —— 它们给的是**参数**。这个目录给的是**样本**:
一张合格的结构图长什么样, 以及画出它的那份代码。**配上读**, 比十段散文都管用。

⚠ 三份 `.ts` 是仓内源文件的**逐字节副本**, import 走**仓根相对路径**(`../../src/index`) ——
它们在这里**不能直接跑**, 是**读本**不是可运行副本。要真跑: 改 import 见「import 换算」, 或直接用现成的可跑起手件见「想要一份**能跑**的」。

## 四张表

| key | 图 | 代码 | 读它读什么 |
|---|---|---|---|
| `sequence-archify-style` | [`sequence-archify-style.png`](./sequence-archify-style.png) | [`sequence-archify-style.ts`](./sequence-archify-style.ts) | **序列 / 泳道图能到什么观感**: paper 主题 + 全 `tint` 参与者 + 消息按语义分色 + phase 分隔带 + 激活条 + 纸感底纹 |
| `lifecycle-agent-run` | [`lifecycle-agent-run.png`](./lifecycle-agent-run.png) | [`lifecycle-agent-run.ts`](./lifecycle-agent-run.ts) | **阶段带(状态机)的完整形态**: 三段 × 10 状态 + 向下岔路 + 跨全图回流, 深色主题带图例 —— 手排参照实现(339 行), 也是"手排税"的测量载体 |
| `academic-figure` | [`academic-figure.png`](./academic-figure.png) | [`academic-figure.ts`](./academic-figure.ts) |
| `decision-tree-effort` | [`decision-tree-effort.png`](./decision-tree-effort.png) | [`decision-tree-effort.ts`](./decision-tree-effort.ts) | **判定流 / 决策树的紧凑树形**: 单主干中轴直下 + 分支短探快收 + 贴中轴回边, 625×667 showcase 0 诊断 | **学术风 + 四件槽**: paper 墨线观感 / `tint` 角色框 / `struck` + `opacity` 废除格 / `SceneText` 的 weight 与 color, 外加"有意让两栏同层"的白名单写法 |

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

### `decision-tree-effort` —— 判定流: 重点读"单主干怎么收紧"

- 判定流(配方 6)的**树形答案**: 主干 8 节点一根中轴直下, 支路全部**短探快收**(实现支路探出后
  汇回下游菱形、旁支探出即终结、max 作底部终点小注), 回边贴中轴左侧小回环 —— 对照组是
  "左右各拉一列"的画法, 那张把树读成了网。
- 文件头记了 260928 实测的四条坑, 两条最值钱: ① 同轴对齐只认一把尺子 —— `box(cx - w/2)`
  **别取整**(奇数宽取整让同轴中心差 0.5px, router 插 0.25 小折, `endpoint_approach` 当场红);
  ② 回边的 `via` 要避开对端面的试算 stub 区, 否则 `no_backtrack` 吐自重叠折线。
- 紧凑化的有效旋钮也在里面: 节点 padding 收窄、行距按「有没有边标签」分档、主干直连的
  stub 随行距收缩; 以及一条反直觉结论 —— **画布宽度地板由必须保留的旁注决定**, 压宽度先砍
  旁注文案, 不是砍节点间距。

## import 换算(要在这里跑起一份, 照这张表改)

| 副本里写的 | 换成 |
|---|---|
| `'../src/index'` · `'../../src/index'` | `'@watert/svg-infovis'` |
| `'../../src/runtime'` · `'../src/runtime'` | `'@watert/svg-infovis/runtime'` |
| `'../scripts/runner'` · `'../../scripts/runner'` | 包内**没有**这条导出 —— 出口换成 QUICKREF「30 秒起手」那几行, 或克隆本仓 |
| `'./sequence'`(模板) | `svginfo new seq` 拷一份起手, 或读包内 `templates/sequence.ts` |

装包消费时 `src/` `templates/` `scripts/` `blocks/` `assets/` **都在包里**(能读), 但**不在 `exports` 白名单**里 ——
不能用包名 import 它们。三层入口与引法的完整口径见 [`../refs/contract.md`](../refs/contract.md)。

## 想要一份**能跑**的: `svginfo new`(一行 import 都不用改)

上面四份是**读本**; **能跑的起手件是现成的** —— 装包之后:

```bash
svginfo new my-fig                                # 拷 templates/sequence.ts, 并把 import 就地改成包名
svginfo run my-fig.ts -o my-fig.svg               # 真出图(门禁不过也给草稿; 退出码 0/1/2 是判决)
svginfo inspect my-fig.ts --showcase --metrics    # ⚠ 见下: 起手件**不是** scene 模块
```

- 拷出来那份的 import 已经指向 `@watert/svg-infovis` 与 `.../runtime` —— 与上面那张换算表**是同一件事**,
  只是由命令做掉, 所以**一行都不用手改**。这就是"改一个参数就能跑"的那个最小输入。
- `svginfo new` 只从 `templates/sequence.ts` 起手(序列图); 另两类图型(分层带 / 阶段带)读包内
  `templates/{layered,lifecycle}.ts` 照抄, 或克隆本仓跑 `examples/`。
- ⚠ **起手件是「出图脚本」, 不是 scene 模块** —— 它有 `isMainModule(import.meta.url)` + `runScene`,
  而 `svginfo inspect` 要的是 `export default <scene>` / `export const scene = <scene>`。拿 `inspect`
  去点它, 会得到"没找到场景 + 该模块导出的是 …"(退出码 2)。想看某种摆法的**逐对象坐标**,
  自己把模板里那几十行收敛成一个只有 `scene` 的模块 —— 那才是 `inspect` 的常规用法。

## 重出这四张(改了内核 / 改了示例之后)

```bash
bun run scripts/build-skill-shots.ts    # 副本 + PNG + shots.json 一起重出
```

- `shots.json` 是机读清单(源路径 / 副本路径 / PNG 尺寸与字节 / **导出指纹**), 由脚本写, **别手改**。
- 守卫在仓内 `test/skill-shots.test.ts`: 副本逐字节 == 源 · 导出指纹没过期 · PNG 头与尺寸对得上 · 图没超体积预算 · 本表与清单逐键一致。
- 四张图出盘时过一道 **pngquant 调色板量化**(≤256 色, 保留 alpha): 四张 551 kB → 152 kB, 是包内最重的一项, 所以有预算守卫(单张 ≤ 80 kB)。
  ⚠ **别改成 JPEG**: 这类"大色块 + 细线 + 小字"的图, DCT 既糊字又更肥 —— 实测 q88(4:4:4)比原 PNG 还大 40%, 只有 `lifecycle-agent-run` 那张勉强小 10%。
- ⚠ **PNG 不做字节守卫**: 栅格化器随机器而变(`rsvg-convert` / `qlmanage`), 拿字节当基线会在别人机器上假红。
  钉住的是**导出指纹**(= `bun run <源>` 的 stdout sha256)那一层 —— 内核一改字节它就过期, 提醒重出。
- PNG 是**放大到 1200 宽的渲染**(矢量重渲, 不糊), 只为让人眼 / agent 看清;**交付尺寸永远看根 `<svg>` 的 `width`**。
