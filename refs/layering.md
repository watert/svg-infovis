---
name: svg-infovis-layering
description: "svg-infovis 现行分层契约: 七层的职责与依赖方向 · 准入门槛 · 三条边界轴(数值归作者 / 门禁三档 / 决策与推导分离)"
tags: [svg-infovis, architecture, layering, boundary]
date: 2026-09-26T01:10:00+08:00
---

# 现行分层契约与边界规则

> 这篇是**模块分层**的权威。`refs/architecture.md` 讲的是另一件事 —— v0.1 的**产品管线**五层
> (决策 / 缓存 / 内核 / 出口 / 分发)与 blink、HTML 骨架两段已废弃路线, 已降级为演进史存档。
> 两篇的分层不是一回事: 那篇分的是**一次出图经过几道工序**, 这篇分的是**代码按什么职责摆**。
> 配图见 `refs/architecture-v3.svg`(core 自画自审, 重跑 `bun run refs/build-arch-v3.ts`)。
> 原则出处(为什么这么切) → `refs/principles.md`; 对外承诺面与破坏性变更 → `refs/public-api.md`。

## 七层

| 层 | 位置 | 收什么 | 出口形态 |
|---|---|---|---|
| 作者声明 | 仓外(你的 `.ts` / agent 写的 `.ts`) | 坐标 / 比例 / 计数 / 折点 / 间距 | scene + 块参数 |
| `templates/` | 仓内顶层 | 场景骨架, 槽位吃 block | 填参后的 scene |
| `shapes/` | `src/shapes/` | **无数值语义**的排版件(props → descriptor) | `DGroup` + 盒 |
| `blocks/` | 顶层, 独立子路径 | **带数值语义**的组合块(一个数 → 一段几何) | `{ shape, bounds }` |
| `geometry/` | `src/geometry/` | 纯几何原语(vec / 谓词 / 行块 / pack / place / grid) | 坐标、盒、并集 |
| `knives/` | `src/knives/` | 构建期**推导**与**判决** | 折点列、盒反算、诊断、读数 |
| `serialize` / `export` | `src/` | descriptor → 字符串; 门禁 + 画布算出血 | SVG 字符串 |

外加两处不在分层里、但纪律上同族的目录: `src/icons/` + `src/embed/`(素材链, 唯一 `node:fs` 读盘处)、
`assets/embeds/`(外来图表底板)。

## 依赖方向: 单向, 不可逆

```text
主链(墨迹从声明走到字符串)  ──  零弯折的六盒竖排, 见 refs/architecture-v3.svg
  作者声明 ─┬─▶ shapes/  ─┐
            │             ├─▶ serialize(唯一字符串出口) ─▶ export(fail-closed) ─▶ 烘焙 SVG
            ├─▶ blocks/  ─┤
            └─▶ templates/┘   骨架吃块: 与 blocks 同为 descriptor 供给方, 不在 blocks 之后

底座(被依赖, **不在数据流上**)
  shapes/ · blocks/ · templates/ ──▶ geometry/(纯原语)

判决(读 scene, 不写 scene)
  作者声明的 bounds ──▶ knives/(audit 判决) ──▶ export 决定出不出图 ──▶ 作者改旋钮
```

- **几何层不知道形状层**: `geometry/` 不得 import `shapes/` / `blocks/` / `knives/`(例外见下)。
- **形状层不知道块层**; `blocks/` 只组合 `src/` 的刀, 不引第三方。
- **`knives/` 不写 scene**: 判决是读数, 旋钮归作者(`assignLanes` 不显式调用就完全不发生分配)。
- **core 永不引 React / vite / 浏览器**; 依赖方向永远是 `core ← 薄壳 ← 上层`, 反向即破。

### 已知越层(现状, 不是设计意图 —— 别当规律抄)

"无环"不等于"单向"。全仓**没有真正的 import 环**, 但下列反向依赖确实存在, 查依赖图时按"已备案"读:

- ⚠ **`geometry/{box,grid,place}` → `knives/route`(三处, 不是一处)**: 都为复用 `portPoint` / `sideDir`
  (面上的点只许一份公式)。三者的文件头都自称"README 分层段记的那条有意例外", 而 README 只在
  `geometry/box` / `geometry/grid` 两行零散提到 —— **以本节为准**。它们是"纯函数"但**不是零内部依赖**,
  纯函数 ≠ 无依赖。新增几何件若也要 `route` 的东西, 先问"能不能把那份公式提到更底下", 别再叠一个反向 import。
- **`knives/fit` → `shapes/node` / `shapes/icon`**(值导入 `NODE_TEXT_LAYOUT` / `assertNodeShape` /
  `nodeOuterSize` / `ICON_DEFAULTS`): 盒反算与上屏共用同一份字号与外径公式, 是**有意的同源**,
  方向为 knives → shapes。
- **`scene` → `knives/audit` / `knives/cluster`**(值导入 `groupLabelBox` / `GROUP_FIT_PAD` /
  `declaredMemberIds` …): 缓存层依赖判决层。根因见下"契约归属"。
- **`export` → `scene`**(值导入 `assertFreshForExport` / `sceneStatus`): 但 `src/index.ts` 里
  `export` 的 barrel 行号(86)**排在** `scene`(90)之前, 违反"读 barrel 的顺序即依赖顺序"。
  不会 TDZ 崩(引用在函数体内, 调用发生在运行时), 属**纪律擦伤**而非 bug。
- **`geometry/inline-text` → `descriptor`**: geometry 内向根层回引。"geometry 是零依赖底层"这条对
  `inline-text` 不成立(它 barrel 里排最前, 自称零依赖)。
- **两处类型层擦边**(靠 `import type` + 注释守住运行时无环, 不算违规但要知道):
  `theme` → `shapes/grid-pattern`(`GridDefaults`, 最底层反向依赖形状层的类型 —— 正解是该类型下沉到
  `descriptor`); `shapes/edge` → `knives/audit`(`SceneLabel`, 为契约同源)。

## 准入门槛: 什么时候一个新件配得上进某一层

- `src/geometry/` —— **≥2 个消费者才上提**(一处事实一处)。第一次需要某原语时**先在块内私有**;
  等第二个消费者也要、且口径一致, 再提进 core。一个消费者的"通用件"不是 core 的一部分。
- `src/shapes/` —— 判据是**几何里有没有一个比例 / 计数**。没有 → shapes; 有 → blocks。
  stat 的大数字是**字**(几何不编码数值), 所以它在 shapes; 进度条的 `ratio` 是几何, 所以它在 blocks。
- `blocks/` —— 必须满足**块契约**(下节); 不满足的先用 shapes 垫, 别硬塞。
- barrel(`src/index.ts`) —— 默认进 barrel; 两类刻意**不进**: `icons/lucide`(有 `node:fs`, 挂上 barrel
  就炸浏览器消费方)与 `blocks/*`(数值语义关在这一层, 走独立子路径)。barrel 的**书写顺序只是阅读导航**,
  不构成纪律(见下"机器判决")。
- `templates/` —— **不在 `exports` 里**, 仓内按路径引。它是骨架不是库件, 出公共面要付版本债。
- 一个文件**一个主出口**。别开 `xShape` / `xFit` / `xBlock` 五件套 —— 读数盒可以多吐, 主出口只许一个。
- **测试住哪**: 判据写进 `.test.ts`, **新件与源旁**(一个 describe 块)—— 这是 v0.2 起的规矩,
  `blocks/` 全员与 `shapes/{stat,badge,heading}` 遵守; 内核既有件仍在 `test/`(`test/*.test.ts`, 82 个文件)。
  两套并存是历史分层, **新件不许再进 `test/`**; 改既有件时顺手搬不搬随意, 别为了"统一"制造大 diff。
- `examples/` 只展示, 清单只有 `examples/manifest.ts` 一份。

## 块契约(blocks/ 的宪法)

```ts
type Block = { shape: DGroup; bounds: Rect };   // 主出口恒返回这两位
```

- `bounds` 是**墨迹盒, 不加内边距**(与 `statFit` / `nodeFit` 同纪律: 盒是墨迹的, 留白是作者的 `gap`)。
  它能被 `pack` / `place` 当一个盒摆, 也能当别的块的输入 —— 这就是"块能嵌套"的全部含义。
- **幂等**: 摆完把盒摊回声明再画一次, 墨迹与盒逐位相同。⚠ 前提是**块内旋钮不占用 `h`**
  (盒高是推导结果, 吃掉它就会画出 36 高的条而不报错)。
- 契约是结构型, **暂不设共享类型模块**: 少一个公共 import 点, 层还在长, 别急着立宪法。
- 细则与现役成员表 → `blocks/README.md`(一处事实一处, 本篇不抄)。

## 契约归属: 三处已知错位(现状记录, 动它们是破坏性变更)

- **`Scene` 契约住在 `knives/audit.ts`**, `scene.ts` 只做 `SceneNode = AuditSceneNode & { bounds_source? }`。
  事实上的单一来源成立(渲染面与审计面读同一个类型), 但**住错了文件**: 场景契约该住在 `scene.ts`
  或独立契约模块, 由 audit 反过来读它。现在 `scene` 因此运行时依赖 `audit`。
- **`knives/measure` 位置可疑**: 纯函数、零依赖、被 6 个形状/块件消费(`badge` / `edge` / `group` /
  `heading` / `stat` / `progress`)—— 按"≥2 消费者 + 无数值语义 + 纯函数"的判据, 它更像 `geometry/`
  的原语, 住在 `knives/` 是历史位置。搬家要改 `exports` 子路径 = **L3 破坏**(见 `public-api.md`),
  收益中等, 别顺手改。
- **`guard` 是零依赖根层横切**, 但异常名 `ShapeInputError` 暗示 shapes 层, 实际 `geometry/pack` 与
  `geometry/place` 也抛它。命名债, 不影响分层。

## 机器判决: 本文的门槛由 `test/layering.test.ts` 守着

文档若只给人读, 它就是装饰。本文以下四条有运行时后果的准入门槛已变成断言(每条配反例自证):

1. **运行时依赖图无环** —— 有环 = 半个模块图 + TDZ。⚠ 纯 `import type` 与纯 type specifier 不算
   运行时依赖(不参与求值), 否则 `geometry/inline-text → descriptor` 这类同层回引会被误判。
2. **`geometry/` 不依赖 `shapes/` / `blocks/`** —— 连纯类型依赖也判红(底座知道外壳的形状就是层裂);
   `geometry/` 依赖 `knives/` 的**只在备案名单**(`box` / `grid` / `place`, 见「已知越层」)——
   备案一旦被清掉(例如端口公式下沉到 geometry), 测试会红, 那正是提醒你更新名单的时刻。
3. **`blocks/` 只组合 `../src/<刀>`** —— 禁第三方、禁 `node:`、**禁走 barrel**(barrel 带 `node:fs`)。
4. **`package.json#exports` 的子路径都落在真实文件上** —— 子路径是公共面, 指向不存在的文件要说得清。

⚠ **曾经被写成纪律、现已作废的一条**: "读 barrel 的顺序即依赖顺序, 被依赖的先出"。260926 一次探测就在
`src/index.ts` 里抓出 11 处违反, 而它对运行时零影响(ESM 按模块图拓扑求值)—— 没人守的纪律等于没纪律,
写进注释只会让人以为该找的都找过了。底层刀反向吃高层阈值(例 `knives/route` 值导入 `knives/audit` 的
`PIERCE_MIN`)不是顺序问题而是**层次倒置**, 归 `ROADMAP.md` 的契约归属待办。

## 三条边界轴

### 轴一 · 数值归作者声明, kernel 只算几何

作者声明 `ratio` / `N` / `k`; kernel **不归一化、不换算百分数、不从任何数字反推**, 更不画刻度与轴。
一旦从数据推几何, 就滑向 chart 库 —— 真图表走 `embed` 链(echarts 底板), 不在内核重造。
反面教材: 模型会把 1234 收成 1200(**数必须是作者写的那个数**)。

### 轴二 · 门禁三档, 别把新判据塞错档

| 档 | 谁 | 语义 |
|---|---|---|
| **fail-closed** | `audit` 的 error | 挡出口。`exportScene` 拒出图, 想强出必须显式 `force` 且产物打 `data-draft` |
| **warning** | `audit` warning / `density` / `route-cost` | 读数不是判据。启发式一律 warning —— 美学度量攒够 ≥3 张真实图样本才谈升级为判据 |
| **不进净空门禁** | 图标 / 网格底纹 / `embedAsset` / `blocks/*` / `struck` 叉线 | 压在版式上的墨迹, 不是参与排版的对象。离别的距离靠**作者留位**, 别指望门禁替你喊 |

两档严格度(`standard` / `showcase`)只调 `THRESHOLDS` 三个数(labelClearance / nodeGap / labelInset),
不新增判据。规模: 门禁"**十九项**" = 几何十四项 + 结构校验一项 + 组语义四条; 码注册表
`DIAGNOSTIC_CODES` 全长 24(audit 16 + cluster 4 + density 4) —— **两个数都对, 别互相打脸**
(一项判据可以发多个码, 反之亦然), 详见 `src/knives/codes.ts` 文件头。

### 轴三 · 决策与推导分离, core 无写决策的入口

core 没有任何 API 能改"谁在前、谁在后、谁是成员"这类决策; `nudge` 只动坐标不动拓扑,
`knives/*` 只给读数与判决。理由不是洁癖, 是历史: 曾经 DOM 顺序 / `scene.order` /
`reduce_crossings` 三个权威打架, "工具不许偷偷改序"当场破功。

## 横切纪律

- **零运行时依赖**: 库本体 0 dependency; `lucide-static` 是构建期读盘的既有例外, 素材不经它上运行时。
- **字节确定**: 禁 `Date.now` / `Math.random`; 几何数过 `round1`; 集合按 codepoint 序; 同输入逐字节同输出。
- **一处事实一处**: 字号字重取 `NODE_TEXT_LAYOUT`, 取色取 `toneStyle` + 语义槽, 度量走 `measureText`,
  盒并集走 `geometry/box` 的 `bounds`, 圆角走 `geometry/rounded-path` —— 新代码不另立第二份权威。
- **坏输入当场抛**: `guard` 的 `ShapeInputError` 带真修法; 不 clamp、不静默回落、不画出装不下的东西。
- **语义进 scene, 样式留覆盖表, 覆盖表永远赢**: `tone` / `variant` / `shape` 是语义, 样式是覆盖。
- **渲染面 = 审计面**: 出图走 `sceneChildren`, 别手拼 children; 出图后 `grep NaN` 产物。

## 相关

- 原则与事故出处 → `refs/principles.md` · 演进史 → `refs/architecture.md`
- 图型骨架 → `refs/recipes.md` · 数字只在一处 → `../QUICKREF.md`
- 纪律全表 → `../SKILL.md` · 未做项 → `../ROADMAP.md` · infograph 划界 → `../docs/infograph-roadmap.md`
