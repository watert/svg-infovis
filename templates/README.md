# templates/ · 模板层宪章

> 模板层是「配方 prose」与「core 几何」之间的**薄封装**: 把一类图型的**起手骨架**写成可填参的函数,
> 底层仍是 `src/` 的几何刀 + `exportScene` 的门禁。**原则是不动 core**, 也不替作者做决策 ——
> 动过 core 两次, 都记在文末「已知 core 缺口」: ① 260920 为激活条补的 `SceneEdge.noCheck`
> (**旋钮位**, 判据一条没加); ② 260920 的「沉淀上收」把模板的两处**自造件**搬进了 core
> (`labelBoxSize` / `resolveKnobs`)—— 那不是"绕开内核", 是**内核缺了通用零件**: 判据是
> "这条政策/公式与内核已有的某条是同一句话吗", 是则上收, 否则留在模板层。
>
> 起因: 对照 archify 五套模板做过一次评估 ——
> archify 是"声明式 JSON → 确定性 renderer", 本仓是"命令式 TS 直调几何内核",
> 两边范式正交, 正确借鉴是**把自家的配方知识升级成薄封装**, 不是搬它的 HTML 那套。

## 边界宪章(一句话)

**模板只封装起手骨架 + audit 调用, 绝不封装决策。**

| | 内容 |
|---|---|
| **决策**(调用方给全) | 几个泳道 / 谁在左 / 消息先后(行序) / 成员 / **语义槽**(`tone` `variant` `shape`) |
| **骨架**(模板该算) | 盒宽盒高(走 `nodeFit`) · 列距(盒净空 / 标签宽 / 版式下限取 max) · 行距 · 端口偏移 · 标签落位 · 画布边界 · audit 与出口调用 |

**判据**: 换一组入参, 图讲的必须是**另一件事**。若模板已经决定了"谁在左 / 谁先", 那就越界了 ——
参数少了 agent 绕开它自己写, 参数多了就是亲手造 archify 二号机(赔上 core 的可组合性与门禁)。

## 与 prose 配方的关系: 补充, 不是替代

[`refs/recipes.md`](../refs/recipes.md) **仍是第一入口**(尤其"选哪种图型"这一步)。模板只对**结构高度规整、
每次都长一个样**的图型成立; 模板没覆盖的构图照旧"读配方 → 自己写 TS" —— 这条路永远在。

## 现役模板

| 模板 | 图型 | 入口 | 版式缺省 |
|---|---|---|---|
| `sequence.ts` | 序列 / 泳道(带 lifeline 的有序消息) | `buildSequence(spec)` → scene / `emitSequence(spec)` → 产物 | `SEQ_DEFAULTS` |
| `layered.ts` | 分层带(带框图: 每层的层距由一维账本解出来) | `buildLayered(spec)` → scene / `emitLayered(spec)` → 产物 | `LAYERED_DEFAULTS` |
| `lifecycle.ts` | 状态机 / 阶段带(共享列空间: 段带跨度 + 带间走廊 + 回边) | `buildLifecycle(spec)` → scene / `emitLifecycle(spec)` → 产物 | `LIFECYCLE_DEFAULTS` |

### `sequence.ts` · 契约

```ts
emitSequence({
  actors:   [{ id, label, sub?, tone?, variant? }],   // 列序 = 数组序(作者决策)
  messages: [{ from, to, label?, tone? }],            // 行序 = 数组序; from === to = 自调用
  activations: [{ actor, from, to, tone?, variant? }],// 激活条: **消息下标**区间(含两端), 可缺省
  out: '/tmp/seq.svg',                                // 产物由脚本自己写(不经 shell 重定向)
  // 旋钮(全有缺省, 见 SEQ_DEFAULTS): colGapMin / boxGap / labelGap / labelLift / rowGap / headGap /
  //   tail / loopW / loopH / msgInset / barW / barMinH / margin / level / theme / title / edgeStyles
  //   —— 校验与缺省回落走 core 的 `resolveKnobs`(键集 = SEQ_DEFAULTS 的键: **那张表就是旋钮的声明**)
});
```

激活条(`activation bar`)是泳道线上的**纵向圆头竖条** —— "从第几条消息到第几条消息, 这一列在忙"。
区间用**消息下标**给(`from`/`to` 含两端), 不用像素: 这正是模板该干的活(参照实现里那一项是
作者手写 y 坐标, 改一行消息就得重排一次激活条)。`from === to` 覆盖单条消息, 高度落到 `barMinH`。

`buildSequence(spec)` 另外返回 `plan`(可观测): `columns`(列心 x) · `gaps`(逐格列距) ·
`rows`(逐行 y) · `needs`(每格列距的 `box / label / used` 三份账 —— 谁把这一格顶开的) ·
`bars`(每条激活条的矩形 + 它由哪两条消息翻译而来) · `lifelineBottom` / `width` / `height`。
想接着手改就停在 `buildSequence`, 别去改模板。

命令行(内置示例直跑, 当冒烟用):

```bash
bun run templates/sequence.ts --out=/tmp/seq.svg [--dark]
```

**三条实测出来的坑**(改模板前先读):

1. **消息边一律不写 `from`/`to`** —— 写了会被 `port_crowding` 的第三档
   (`shared_projected_port`)判成"同一端口出发"。那一档把"端点在盒外"读成手写错误, 而序列图的
   消息端点**天然全在盒外**(在泳道线上), 同一条泳道的两条消息必然被 clamp 回盒后重合。
   实测(260919): 给内置示例的 8 条消息补上 `from`/`to`, 诊断从 **0 → 9 条 error**(端点相距
   392px 也照报)。泳道线相反 —— 端点在盒底边上, 是唯一一端, 写 `from`/`to` 无害且有语义。
2. **消息标签横向只许落在一个列距内** —— 跨列消息(如 `网关 → 数据库`, 中间隔着缓存泳道)的
   标签若居中放, 必被中间那条泳道线穿过 → `label_clearance` error。落法是"贴源侧的第一个列距中点",
   列距由该标签的宽度反算顶开。自调用环的标签同理(放在环右侧, 需求算进同一格列距)。
3. **激活条与 lifeline 是一对: 那条泳道线必须标 `noCheck`**(260920 加 bar 时实测)。
   bar 骑在泳道线中心, 不处理的话 lifeline 穿过它, `edge_node_clearance` 报 3 条 error
   (穿透 392 / 112 / 56px)。两种修法都实测过: **分段绕开**(线真的不画, 但一条泳道线在数据里
   碎成 N 条边, 产物边数膨胀、id 变 `life:gw#0`、`long_edge` 基线被拉低而误报) vs
   **`SceneEdge.noCheck`**(纯视觉基准线豁免, 只在有 bar 的泳道线上标 —— 老产物字节不变)。
   模板取后者。⚠ 豁免加在**边**上、不加在 bar 上: 给 bar 开豁免会连带放过"跨列消息横穿中间
   泳道的 bar", 那才是真事故。实测证据: 变体 E 照报不误(同图把 bar 拉长到跨列边必经之处)。
   ⚠ 层序是硬约束(边画在节点之上), 所以那截虚线**看得见**地走在色条中央 —— 要彻底看不见只能分段。

### `layered.ts` · 契约

```ts
emitLayered({
  layers: [{ id, label, tone?, rows: [[node…], …] }],  // 层序 = 数组序; 行序 = rows 序; 列序 = 数组序
  edges:  [{ from, to, label?, tone?, fromSide?, toSide?, fromT?, toT?, labelDy? }], // from/to = 节点 id **或**层 id
  frame: 'derived' | 'band',                           // 层框形态(决策): 成员派生 / 显式铺满全宽
  out: '/tmp/arch.svg',                                // 产物由脚本自己写(不经 shell 重定向)
  // 旋钮(全有缺省, 见 LAYERED_DEFAULTS): nodeGapX / nodeH / rowGap / layerPad / layerGap /
  //   laneGutter / edgeStub / margin + level / theme / title / fontFamily / 三张样式覆盖表
  //   —— 校验与缺省回落走 core 的 `resolveKnobs`(键集 = LAYERED_DEFAULTS 的键)
});
```

**决策(调用方给全)**: 有几层 / 层序 / 每层几行 / 谁在哪一行哪一格 / 谁连谁 / 每条边吃哪个端口面 /
语义槽(`tone` `variant` `shape`) · **骨架(模板该算)**: 盒宽盒高(走 `nodeFit`) · 行位 ·
**层距(一维账本解)** · 层框(成员派生) · 走廊腰线(`assignLanes`) · 画布边界 · audit 与出口调用。

`from` / `to` 写成**层 id** 就是"这条边指向整带"(archify 的 `FLAG --> ctx`), 端口落在层框边上 ——
与 `sequence` 的消息边相反, 这里的端点在盒面上, 所以**要写** `from`/`to`(串起端口归属与
"以该层框为端点"的豁免)。

`buildLayered(spec)` 另外返回 `plan`(可观测): `layers`(内容顶 / 层框 / 各行 y / 成员) ·
`gaps`(逐段层距的 `content / lanes / used / by` 四份账 —— `by` 就是**压住这一段**的 contributor) ·
`corridors`(框线净空) · `boxes`(逐节点盒) · `edges`(两端面 + `fromBasis`/`toBasis` + 折点 + 腰线) ·
`lanes`(`assignLanes` 的带账与 diagnostic) · `width/height`。想接着手改就停在 `buildLayered`。

命令行(内置示例直跑, 当冒烟用):

```bash
bun run templates/layered.ts --out=/tmp/arch.svg [--dark]
```

内置示例 = `examples/gallery/harness-arch.ts`(15 节点, **手排 166 行**)的**同拓扑同标签**版 ——
两边的差值就是"起手骨架"替作者算掉的那部分。

**四条实测出来的坑**(改模板前先读):

1. **端口选面只有一种情形能自动** —— 相邻层之间的**竖直通道**(上端在上层末行 ∧ 下端在下层首行,
   或那一端就是层框)。同层边 / 自环 / 跳层边 / 源在中间行一律**当场抛**。实测: 把 `LOOP` 放到服务层
   中排行、再显式给 `bottom` —— 单腰线 Z 会穿过它下面那几行的节点(`edge_node_clearance`, 穿透 54px)。
   所以"能力在下一排、消费方在上一排"这种对位是**决策**, 模板不猜(它只负责把选面依据写进 `plan`)。
2. **同层相邻两盒之间的净空(56px)塞不下一条边标签** —— 标签遮罩片约 85-100×23.6px, 落在行内必压两侧盒
   (`text_overlap`)。带标签的边要做成**跨相邻两行的竖直对**(标签落进行间隙走廊), 且两条标签别塞同一
   条行间隙。层内跑**无标签**的管线(如内置示例的装配链)则不受这条约束。
3. **层框标题是文本块, 也参与净空** —— `labelPlacement: 'inner'` 的标题既与节点争 `text_overlap`,
   又与**任何**一条折线争 `text_clearance`(4px 内就报)。所以 `layerPad` 的下限不是留白口味, 而是
   标题盒底边(`groupLabelRect` 现算, 不抄常量); 又因为派生框宽 = 成员盒并集 + pad ⇒ **层标题比该层
   内容还宽时当场抛**, 而不是让它悄悄戳出框线。
4. **`band` 形态的固有成本** —— 显式铺满全宽时框会比内容宽得多, core 的 `cluster_corridor` 会把
   "框被拉得比内容长"读成 warning。那是泳道观感的代价, 不是 bug: 想要它就接受这两条 warning。

### `lifecycle.ts` · 契约

```ts
emitLifecycle({
  bands:       [{ id, label, from?, to?, spanMin?, tone? }], // 数组序 = 自上而下的段序(作者决策)
  states:      [{ id, label, sub?, band, col, row?, tone?, variant?, radius?, focus? }],
  transitions: [{ id?, from, to, label?, tone?, via?, fromSide?, toSide? }], // 数组序 = 先后
  out: '/tmp/life.svg',                                      // 产物由脚本自己写(不经 shell 重定向)
  // 旋钮(全有缺省, 见 LIFECYCLE_DEFAULTS): colGapMin / boxGap / rowGap / bandGap / bandPad /
  //   bandLabelGap / ruleRaise / bandLabelRaise / labelGap / laneStep / railClear / corridorClear /
  //   legendLead / legendReserve / margin
  //   —— 校验与缺省回落走 core 的 `resolveKnobs`(键集 = LIFECYCLE_DEFAULTS 的键)
});
```

`bands[].from` / `to` 是**跨列声明**(列号区间, **含两端**; 缺省 = 该带成员的列区间) —— 声明装不下成员
**当场抛**; `spanMin` 把这段声明变成**一条跨格约束**("这一段要 N 像素宽"), 沿途每格列距按累积被顶开,
`plan.needs[].by` 记 `band:<id>`。`states[].col` 是**共享列空间**的下标(不是每带各解一次), **跨带对齐靠它** ——
不同带写同一个 `col` 就是同一列心; `row` 只管带内第几行。`transitions` 的**数组序 = 先后**, 也决定
同一条走廊里的通道序。

**决策(调用方给全)**: 几条段带 / 段序(数组序) / 谁在第几列第几行 / 迁移的先后 / 语义槽(`tone` `variant` `focus`) ·
**骨架(模板该算)**: 盒宽盒高(走 `nodeFit`) · **列距(一次 x 解跑统一列空间)** · 行 y 与带间走廊 ·
段带跨度与分隔线 + 段标签落位 · 断点路由四族(`same-col` / `chain` / `down` / `back`, 外加**声明的** `via`) ·
画布边界 · audit 与出口调用。

`buildLifecycle(spec)` 另外返回 `plan`(可观测): `columns`(列心 x) · `gaps`(逐格列距) ·
`needs`(逐格 `box / used / by` 三份账 —— 谁把这一格顶开的) · `boxes`(逐状态盒) ·
`bands`(声明区间 ↔ 实际跨度 + 分隔线区间 + 标签盒) · `routes`(每条迁移的 `family` / `corridor` / `declarative`) ·
`legendAnchor` / `width` / `height`。想接着手改就停在 `buildLifecycle`。

命令行(内置示例直跑, 当冒烟用):

```bash
bun run templates/lifecycle.ts --out=/tmp/life.svg [--dark]
```

内置示例 = `examples/gallery/lifecycle-agent-run.ts`(**3 段带 + 10 状态 + 10 迁移**, 手排 **341 行**)的
**同拓扑**版: 决策只有 **33 行 / 23 条** ⇒ 手排税的 **≈ 1/10**(差值就是"起手骨架"替作者算掉的那部分)。

**门禁口径(别把 warning 当成 0)**: 同拓扑下 showcase 档 **0 error**, 但**不是 0 warning** —— 还剩
**2 条 `long_edge`**(段带分隔线**按定义**就比"画布对角 40%"这条门槛长)。这不是没修: 同图的手排示例
也有 4 条同类警示, 在它文件头逐条声明为"有意"; 写手**没有**把分隔线切成 N 段去迁就门禁(那正是
`sequence.ts` 文件头批判的做法 —— 一条基准线在数据里碎成 N 条边), 而是把**白名单写死进测试**
(`test/lifecycle-template.test.ts`: `warning:long_edge:band-main` / `band-wait` 两条点名, **多出任何一条新警示就红**)。
另三条语义判据同处钉着(同列下落边是直线 / 那条走廊上没有第三个盒子 / 两个状态同排相邻) ——
门禁全绿也可能是一张烂版式。

**一处主动改进(记账)**: 回边走"源与目标之间**那一格列间隙**"(参照实现走最左外通道, 回边会胀到
画布对角的 **122%**, 必报 `long_edge`; 改走列间隙后 **~36%**)。

**两条实测出来的坑**(改这个文件前先读):

1. **列心只有一把尺子: `cxOf(盒面)`** —— 账本解出的是**名义**列心(带 0.1 尾巴), 而盒左缘是
   `Math.round` 过的整像素(模板政策); 两处各取各的就差出零点几像素 —— `orthogonal_edges` 报
   "第 N 段不正交", `no_backtrack` 还把那一丁点**横漂**读成"原地折回"(实测 **0.3px 就够报四条 error**)。
   所以竖线 / 横段的 x 一律**从盒反推**, 不从 `columns` 直接取。
2. **段带标签必须待在列区左侧**(右对齐到"段带左缘 − `bandLabelGap`") —— 跨带下落边要从分隔线上方的
   走廊一路竖扎到目标盒顶面, 那条竖线穿过分隔线与标签之间的整段高度; 标签若压在**任一**列心上,
   `text_clearance` 当场报(手排示例为同一件事把节点整体右移起排)。同族的还有 `corridorClear`:
   横向走廊与分隔线平行且 x 区间重叠, 贴太近踩 `edge_overlap` 的近共线档。

**语义立场: 段带刻意不是组框** —— 它给的是"段落感", **不是 ownership**; 真要表达归属得用 `SceneGroup`
(另一套语义)。也**不出图例节点**: 模板只给 `plan.legendAnchor` 的位, 图例是调用方义务
(走 `emitLifecycle` 的 `decorate` 口子进, 那条口子只追加、不改骨架的任何一步)。

**两处 core 缺口(未动, 记账)**: ① 没有"层内自动换行"政策(`nodeFit` 按行数给高, 单行更长只能推宽、
推不动带间距离) ② `assignLanes` 未用(签名不明, 且 `sequence.ts` 也没用过; 走廊错开现由模板自己的
`laneStep` 排)。详见文末「已知 core 缺口」。

## 什么时候该新写一个模板

三条**同时**成立才立项:

1. 骨架**每次都长一个样** —— 换的是内容不是结构。序列 / 泳道 / 时间线 / fan-out 符合;
   **依赖图 / 判定流 / 访问矩阵不符合**(拓扑形状每次由作者临场决定, 写成模板就是 `layout.suggest` 后门)
2. 骨架里有一处**手算容易翻车的推导** —— sequence 是"列距该给多少 / 跨列消息的标签放哪"
3. prose 只能给出"常见坑", **给不出公式**

**反例(别写)**: 场景 → 图型的**关键词路由**(那是知识, 至多往配方段加一张速查表) ·
只画一次的图 · 纯样式封装(那是 `edgeStyles` / `nodeStyles` 的活)。

## 下一批候选与排序 (260922 评估)

> 对 archify 剩余四套 renderer(architecture / dataflow / lifecycle / workflow)的评估结论。
> 结论已定稿, 本节只落盘, **不重开调研**。

**前提纠正: 它那四套大半没有骨架可移** —— 坐标是**外包给写 JSON 的模型**的, 三条实测证据:

- **architecture**: `components[].pos` / `size` **必给**, 5 个内置示例 **100% 手写 pos**, 零个用它的
  `layout.mode: "grid"`; `renderers/architecture/grid.mjs` 自述 "Not auto-layout — fixed cell math only",
  该 renderer 里 `rank|layer|topolog` grep **零命中**
- **dataflow**: 把「摆格」写进**必填字段** —— `stage` / `row` 是 required 整数, 像素由常量表算出,
  `colGap 215` 写死; 走线也不由 renderer 推导, 而是查**命名通道词表**(`straight` / `vertical-channel` /
  `bottom-channel`)。⚠ 实测订正: 两个示例的 flow 是 **6/10 与 1/12 条带手写 `via`**,
  其余走 `route` 预设 —— 我上一版把它写成「全手写 `via`」, 是**没数就写**; 结论方向(布局外包给作者)
  不变, 但论据只能是"格位必填 + 常量列距 + 命名通道", 不是 via 条数
- **lifecycle**: 是一张固定像素表(`phaseXs=[94,248,402,556,710]`, `col` 是它的**索引**)
- **只有 workflow 有真布局数学** —— `workflow-compiler.mjs` 4400 行里的 `createReadableLayout` 是
  **全仓唯一**布局求解器, `col` 是纯逻辑秩、像素是测得输出

所以「移植」实际是**我们自造骨架**。

**能搬的零件只有这些(大半已有替身)**:

- **自动端口扇出** `automaticPortSpread`(58 行) → 我们 `assignLanes` **更强**(区间图聚带 + PAVA 保序)
- **边界框** `boundaryRect`(成员包围盒 + pad + 标题位, 约 12 行) → **已有** `deriveGroupRect` / `fitGroupFrames`
- **画布反推** `autoViewBoxFor` → **半有**: `fitScene` 只 bbox + 平移
- **候选族枚举 + 11 维逐维比较**(不加权求和) → **已搬**(260919, `route-cost.ts` + 288 组等价基线)
- **差分约束 + longest-path 求列心** → **缺**(后续方向见 `ROADMAP.md`)
- **路由发现空间不够 → 回吐约束重解布局(≤3 轮)** → **缺**(我们单趟, 见 `ROADMAP.md`)
- 4400 行里**只有约 700 行是资产**, 其余是产品包袱(pin 冲突解释 541 行 / preset 拓扑自校验 419 行 /
  v1-v2 迁移 600+ 行) —— **别抄**

**排序与判据**:

- **P0 · 一维约束账本 + 最长路**(本批已在实现) —— 三个候选模板的
  **共同地基**: architecture 的层距 / lifecycle 的跨带列距 / workflow 的秩间隙是**同一个问题**
  (跨多格取 max, 且要能读出「是谁顶开的」)
- **P1 · lifecycle / 状态机**(`stateMachine(states)`) —— 手排税证据最硬(`examples/gallery/lifecycle-agent-run.ts`
  **341 行**是全仓最大手写示例, 还专门配了版式判据 `test/lifecycle-agent-run.test.ts`); 骨架最规整
  (三条带 × 列推进); 硬骨头是真骨头 —— **终端态回归 / 回边**, archify 自己也没解决(靠作者手写绝对坐标
  `via`), 而这正是我们 260918 刚补的 `via` + 横腰线候选 + `assignLanes` 能吃掉的一口; 可借口径具体
  (列对齐约定: event / terminal 的 `col: N` ⇔ main 的 `col: N+2`; rail 反推; 通道 padding ±36/±34;
  legend 不得侵入状态区)
- **P2 · architecture / 分层带**(边界框 + 端口扇出) —— ⚠ **频次未统计**(见本节末「软肋」), 但「手排税」正是
  在这类图上实测出来的 (`examples/gallery/harness-arch.ts` 15 节点真实规模手排样本;
  手排税的真身不是写 30 个数字, 是没有任何东西告诉你写错了); 且 **core 已吸走一半**(框有
  `deriveGroupRect`、盒宽有 `nodeFit`、端口错开有 `assignLanes`、选路有候选族), 模板剩下的是
  「**账本 + 组装**」, 收益中等。**红线**: 层序(谁在哪层)**必须作者给** —— 模板一旦开始猜层序就越界,
  撞上文三条立项判据第 1 条与「依赖图不该模板化」那条线, 变成 `layout.suggest` 后门
- **P3 · dataflow —— 不排期**: `stage` / `row` 是把布局决策写进必填字段, `examples/checks/lanes-fanout.ts`
  已覆盖它最难的 fan-out。⚠ 订正: 「作者必须手写 viewBox 否则报错」**不属实**
  —— `meta.viewBox` 缺省 `[940,720]`, 内容超界只是报「请加大 viewBox」(容量检查, 把决策还给人)。
  它真正的毛病是**拿命名通道词表代替求解**(见上文 dataflow 条), 与 viewBox 无关

**P0 落地时一并立下的两条政策(别"顺手统一"掉)**:

- **精度有三把尺子, 分工写死**: 内核账本 `roundUp1`(向上取 0.1 —— 向下取会把「≥ N」舍成「差点不够」) ·
  几何 `round1`(四舍五入, 序列化口径) · 模板 `Math.ceil`(整像素, 那是**模板政策**不是内核政策)。
  谁把整像素政策塞进内核, 就是拿某张模板的口味焊死所有图
- **`templates/sequence.ts` 的列心故意自家累加、不走账本的 `positions`** —— 带小数的 origin 逐位取和会
  带进 ulp 级差异, 而该模板产物要求逐字节稳定(详见该文件 ⑤ 段注释)。这条保命政策此前**没有任何测试看着**,
  260922 补了 `emitSequence(DEMO_SEQUENCE)` 的 sha256 闸门(`test/sequence-template.test.ts`)
- **旁路(不是模板)**: workflow 的差分约束 + 反馈重解走 core(档 3.6 步 3/4), 它喂的不只是 workflow

**这套排序唯一的软肋 —— 真需求频次没有统计过**: P1 / P2 谁在前是按「骨架规整度 + 翻车推导的确定性」排的,
不是按频次排的。想要频次口径, 得先拿一批真实图按图型归档数一遍(**未做**)。

## 出口纪律(与 core 同一条, 见 SKILL.md「出口」)

模板的出口一律走 `tryExport`(**永不抛**, 门禁没过也给草稿 + `report.pass === false`) ·
诊断走 stderr / 图走文件(`spec.out`, 脚本自己 `writeFileSync`) · **判决由调用方落到 exit code**
(`if (!r.report.pass) process.exitCode = 1`) —— 库不擅自改 `process.exitCode`。

## 已知 core 缺口(模板侧规避 + 记账, 别在模板里再实现一份内核)

> `layered.ts`(260922)是**第一个零 core 改动**落地的模板: 它要的每一件(盒宽 / 单元格 / 账本 /
> 批量腰线)core 都已经有了, 缺的两处(换行政策 / 腰线可行域口径)记在下面, 都在模板侧规避。

- **没有换行政策** —— `nodeFit` 只量"作者写下的行"(`\n` 是作者的换行)。于是一个**单行**更长的标签
  只把盒**推宽**, 推不动层距: 层距公式里只有内容高(行数 × 盒高)。所以"label 换长 ⇒ 层距变大"这条
  判据在 core 下只对**多行**标签成立(两例都钉在 `test/layered-template.test.ts`)。要对单行也成立,
  得先给 core 一条折行政策(按哪一档的最大内容宽折), 那是另一个决定 —— **模板不自己造一份 wrap**。
- **`laneSlot` 对"直连边"不成其为退化** —— 两端 stub 同轴同点时 `hi-lo` 仍有 stub 间距那么宽
  (≥ `LANE_STEP_MIN`), 于是逐行的注入管线(同 y 的若干条直连边)会被 `assignLanes` 聚成一条假"带"。
  实测无害(各行可行域互不相交, 解 == `preferred`, 坐标一个字节不变), 但账目难读; 分层模板在
  **模板侧**用 `span[0] !== span[1]` 挡掉它(判据: 这条边压根没有会动的腰线段)。core 要不要收窄,
  等第二个消费者表态。
- **`port_crowding` 对 lifeline 拓扑系统性误报** —— 见上文坑 ①。规避在模板侧。要修得先想清"盒外端点"怎么区分"手写错"与"这一图的正常几何"。
- **图例(legend)仍缺** —— 内置示例用 `tone` 区分类别却不给图例。不是漏了: 图例该是 core 的
  可选 append(评估结论把它列为"剩余唯一要动 core 的一项"), 模板**不另造一份**(造了就是第二权威)。
- **已补, 不再是缺口: `SceneEdge.noCheck`**(260920)。激活条骑在泳道线上那道坎原本只有"把 lifeline
  分段绕开"一条路(数据碎成 N 条边 + 冒出一条假的 `long_edge`); 补了旋钮位之后泳道线整条不动,
  实测比分段更干净。它与 `SceneGroup.noCheck` 同族, 豁免面**只有 `edge_node_clearance`**。
- **已补, 不再是缺口: 标签尺寸度量 `labelBoxSize` + 旋钮守卫 `resolveKnobs`**(260920「沉淀上收」)。
  两件原本都长在模板里: 前者靠"造一条 1px 假边喂 `edgeLabel` 再抠 `.width`"来量标签, 后者是 6 行
  `knob()` + 12 行搬运样板。判据同一条 —— **它们与内核已有的某条是同一句话**(尺寸 = 遮罩片公式 /
  尺寸不是增量), 所以上收; 模板侧零语义变更(内置示例产物**逐字节不变**, 由 `test/` 的 sha256 闸门看着)。
- **登记(未做): 基准线的构造入口** —— `SceneEdge.noCheck` 的语义已写死"泳道线 / 坐标轴 / 扫描线
  一族", 但 core 没有 `guideEdge()` 这类入口, 模板得自己拼(`sequence.ts` 的 `lifelineStyle` + 条件性
  `noCheck` · `lifecycle.ts` 的 `bandRuleStyle`)。第二 / 第三张图型(**状态机·阶段带** + **分层带**)
  都**没用上**它 —— 阶段带的分隔线自己拼得动, 分层带压根不需要基准线, 所以缺口仍在: 等真有一张
  图型被它绊住再说, 不提前造抽象。
- **`lifecycle.ts`(260922)的两处缺口** —— 同上那条**没有换行政策**(同一件事在阶段带里表现为
  "单行更长只推宽, 带间距离不跟着长"), 以及 **`assignLanes` 在模板层仍无消费者**(签名不明 ——
  参数是"请求"还是"结果"没定, `sequence.ts` 也没用过; 走廊错开现由模板自己的 `laneStep` 排)。
  两处都在模板侧规避, 细节见上文 `lifecycle.ts` 契约段。
