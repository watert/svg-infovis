# blocks/ · 组合块层

> v0.2「排版层」起(决策原文见 `docs/infograph-roadmap.md`)。这里收**带数值语义的组合组件**;
> `src/shapes/` 只收无数值语义的排版件。一句话判据: **它的几何里有没有一个比例 / 计数**。

## 定位: 数值语义关在这一层

- `src/shapes/` —— 无数值语义的排版件。stat 的大数字是**字**(几何不编码数值), 徽章 / 标题 / 分隔线同理。
- `blocks/` —— **一个数值 → 一段几何**的组件。进度条的 `ratio`、pictogram 的 `k/N`、donut 的占比
  全落这里。它们不该进 `src/shapes/`(今天放进度条, 明天就有人要轴), 也不该流落仓外。

**反比例尺口子**(本层存在的理由): 作者声明 `ratio` / `N` / `k`, kernel 只做几何 —— 不归一化、不换算
百分数、不从任何数字反推, 更不画刻度与轴。`ratio` 是**已算好的数**, 它是怎么来的(分子分母 / 采样口径)
是作者的事。kernel 一旦从数据推几何, 就滑向 chart 库, 与 `assets/embeds/` 的 echarts 底板链正面撞车
—— **真图表走 embed, 不在内核重造**(与 `ROADMAP.md` 的红线同一条)。

## 块契约

```ts
type Block = { shape: DGroup; bounds: Rect };   // 主出口恒返回这两位
```

- `shape` —— 块的墨迹 group, 直接进 `svg(…)` 的 children。
- `bounds` —— 块的**墨迹盒**: **不加内边距**(与 `statFit` / `nodeFit` 同纪律: 盒是墨迹的, 留白是
  作者的 `gap`)。它能**被 `geometry/pack` / `geometry/place` 当一个盒直接摆**, 也能当别的块的输入
  —— 这就是"块能嵌套"的全部含义。
- **幂等**: 摆完把盒摊回声明再画一次(`{ ...声明, ...摆好的盒 }`), 画出来的墨迹与摆的盒逐位相同。
  ⚠ 这条有个前提: **块内的旋钮别占用 `h`**。盒高是推导结果, 谁把盒高当旋钮, 摊回来时就会被静默
  喂进去(`progressBlock` 的条高因此叫 `barH`)—— 这类错不会有人喊, 只会画出一根 36 高的条。
- 除契约两位, 各块可以多吐几个**读数盒**(`ProgressBlock` 的 `bar` / `fill` / `label`,
  `StackedBarBlock` 的 `segments`), 供作者垫图例 / 摆标签; 它们不并进 `shape` 的 attrs(描述符是纯数据)。
- 契约不是新发明: `shapes/badge.ts` 的 `listRowShape` 早就长这样(`{ shape, bounds }`), 本层只是把它
  **明写成规矩**, 并让每个主出口都遵守。
- 契约是**结构型**, 暂时**不设共享类型模块**: 每个块给结果起自己的名字(`ProgressBlock` / `Pictogram`),
  只要那两位在。少一个 `blocks/block.ts` = 少一处"谁都得 import"的公共点(层还在长, 别急着立宪法)。

## 版式纪律

- **块压在版式上, 不进净空门禁** —— 与图标 / 网格底纹 / `struck` 叉线同档: 它们是压在版式上的墨迹,
  不是参与排版的对象。块与别的元素保持距离靠**作者留位**(`pack` 的 `gap` / 列距), 别指望门禁替你喊。
- **排布归作者** —— 块摆在哪、块与块隔多远不是块的事(块只在盒内落位)。不做自动布局, 不做自动换行。
- **块内不画壳** —— 底 / 描边 / 加框 / 画布留白是作者的事(要壳就自己垫一个 `nodeShape` 或 `rect`)。

## 工程纪律(与本仓其余部分同一条)

- **零运行时依赖**: 只组合 `src/` 的刀(`descriptor` / `theme` / `geometry/*` / `shapes/*` / `knives/measure`),
  不引第三方(唯一的 npm 依赖 `lucide-static` 是构建期读盘的既有例外)。
- **字节确定**: 禁 `Date.now` / `Math.random`; 同输入逐字节同输出; 几何数过 `round1`(序列化取 1 位小数)。
- **一处事实**: 字号 / 字重取 `NODE_TEXT_LAYOUT`, 取色取 `toneStyle` + 语义槽, 度量走 `measureText`,
  盒并集走 `geometry/box` 的 `bounds`, 圆角走 `geometry/rounded-path` —— 块里不另立第二份权威。
  缺省值只声明在块自己的 `*_LAYOUT` 一处, 守卫的提示文案指着它。
- **坏输入当场抛**(`guard` 的 `ShapeInputError`, 附真修法): 比例越界不 clamp, 词表外的档不静默回落,
  装不下的标签不当场画出来, 结构性错误(条身装不下轨道 / 堆叠合计 > 1)一律拦停。
- **`src/geometry/` 准入门槛: ≥2 个消费者才上提**(一处事实一处)。第一次需要某个几何原语时**先在块内
  私有**; 等第二个块也要它、且口径一致, 再提进 `src/geometry/`(那里只收纯几何原语: arc 极坐标、
  polygon 堆叠)。一个消费者的通用件不进 core。
- **目录形状**: 一个块一个文件 + 隔壁 `.test.ts`(`bun test`, 一个 describe 块); 主出口**一个**
  (别开 `xShape` / `xFit` / `xBlock` 五件套); 集成时在 `package.json` 补一条 `./blocks/<name>` exports。

## 现役成员

| 文件 | 主出口 | 它编码什么 |
|---|---|---|
| `progress.ts` | `progressBlock` · `stackedBarBlock` | 一个比例(进度条) / 一组比例(100% 堆叠条) |
| `pictogram.ts` | `pictogramShape`(配 `pictogramFit`) | 一个计数 `k / N`(ISOTYPE 图标阵列) |

> 加块就补这一行 —— 与 `examples/manifest.ts` 那条"清单只有一份"同族: 缺行不至于出事, 但下一个人
> 就得自己翻目录才知道这层有哪些东西。

## 动笔新块之前

逐条答得出来再写第一个坐标(答不出来说明"这个数该由谁声明"还没想清):

1. **它编码的数是哪个** —— 作者声明的那一位叫什么名字(`ratio` / `n` / `k`), 越界怎么办?
2. **块压在哪** —— 谁给盒(`x/y/w` 与那个推导出来的高), 盒外的距离归谁(`pack` 的 `gap`)?
3. **盒会不会掉进"盒高当旋钮"那个坑** —— 块内的尺寸旋钮有没有占用 `h`?
4. **有没有第二个消费者** —— 这次要的几何原语是私有的, 还是已经有别人在用(README 的准入门槛)?

值得对读的三个邻居: `src/shapes/stat.ts`(盒与字同源 + 墨迹盒), `src/shapes/badge.ts`(`{ shape, bounds }`
的先例), `src/shapes/heading.ts`(把块当盒接着排 —— `below(head.block, …)`)。
