---
name: svg-infovis
description: "何时用 / 怎么用 svg-infovis 画结构图: 写一段 TS 调 core 的 shape / route / audit, bun 直跑出 SVG, scripts/svg2png.sh 本地栅格化验证(毫秒级, 不用开浏览器)。当用户要画或改流程 / 时序 / 架构图、要在文档或 deck 里嵌 SVG 配图、要检查图的几何质量(正交 / 净空 / 标签压线 / 节点重叠)、要画图标 + 说明卡片的本体图 / 关系图(图标走 lucide-static)、或要改内核本身时使用。画图只读 QUICKREF; 图型骨架 refs/recipes.md; API 索引 README.md。"
tags: [svg-infovis, svg, diagram, geometry, layout, bun]
date: 2026-09-26T18:45:14+08:00
---

# svg-infovis · 何时用 / 怎么用

README 回答"这是什么"; 本文件回答**你(coding agent)什么时候该拿它画图、画图时守什么**。

**本 skill 自带什么**: 本文件 + `QUICKREF.md` + `refs/{recipes,layering,principles,public-api,aesthetics}.md` —— 下面就写这些相对路径, 它们与 `SKILL.md` 同装在一个目录里(仓内真身在 `skills/svg-infovis/`)。
**运行时优先 bun**: 场景文件是 `.ts`, `bun run scene.ts` 直跑零配置; 没有 bun 时 `svginfo` 退回 node ≥22.6 的类型剥离, 产物逐字节相同。
仓里另有 `README.md`(API 索引) / `ROADMAP.md` / `templates/` / `examples/` / `src/` —— **不随 skill 走**, 全在 clone 的仓里(npm 装的那份见包内 `node_modules/@watert/svg-infovis/`)。

## 何时用 / 何时别用

- **用**: 要往文档 / deck 里放结构图(流程 / 时序 / 架构), 主路径该由作者画、出厂前要过门禁; 或要改几何内核本身
- **别用**: 随手草图交给 Mermaid; data visualization(比例尺绑数据)交给 d3 类库; 要交互 viewer 不是本仓的活

## 读哪一份

一份事实一个家。出图不要翻 `src/`。缺省值表里没有的数是文档缺口, 记进 `ROADMAP.md`, 不要现猜。

| 你在做 | 只读 |
|---|---|
| 画一张图 | [`QUICKREF.md`](./QUICKREF.md) — 起手代码、缺省值、误用、动手前的问题。**数字只在那张缺省值表** |
| 选图型、抄骨架 | [`refs/recipes.md`](./refs/recipes.md)。序列 / 分层 / 阶段带别手写, 用 `templates/{sequence,layered,lifecycle}.ts` |
| 查函数 / 门禁判据 / 模块在哪 | `README.md` 的 API 索引(仓内; 装包则在 `node_modules/@watert/svg-infovis/`) |
| 改内核 | 本文件「纪律」+ 源码。美学草案 [`refs/aesthetics.md`](./refs/aesthetics.md) **不许写成门禁** |
| 拿不准某件东西该放哪层 / 哪条边界规则管它 | [`refs/layering.md`](./refs/layering.md) —— 七层 / 依赖方向 / 准入门槛 / 三条边界轴(配图 `refs/architecture-v3.svg`, 仓内) |
| 想知道为什么这么切 | [`refs/principles.md`](./refs/principles.md) —— 原则、代价、逼它出来的实跑事故 |
| 要动公共面(exports 子路径 / 门禁码) | [`refs/public-api.md`](./refs/public-api.md) —— 变更分级与破坏性改动四步 |
| 看未做项 | `ROADMAP.md`(仓内) |

## 三步

起手代码只有一份, 在 QUICKREF「30 秒起手」(`nodeFit` + `tryExport` + 自己 `writeFileSync`)。不要再写一份不过门禁的 `toSVG`。

⚠ **三条路别混**: ① **仓内开发**(本节这些 `bun run examples/...` / `scripts/*.ts` 命令)只在 clone 的本仓里成立; ② **装包消费**(`bun add @watert/svg-infovis`)从包名引子路径, 包里既没有 `examples/` 也没有 `test/` —— 起手照抄 QUICKREF 那一段, 别去 `bun run` 本仓的示例; ③ **只装了本 skill**(既没 clone 也没装包)时手上只有这几份文档 —— 真要画图先 `bun add @watert/svg-infovis` 拿到 API, 再照 QUICKREF 起手, 别对着文档里的 `bun run examples/...` 发愣。

```bash
bun run examples/start/full-chain.ts > /tmp/d.svg     # 抄 full-chain 开新图
./scripts/svg2png.sh /tmp/d.svg /tmp/d.png 1200       # 本地栅格化看一眼
bun run scripts/inspect.ts <scene.ts>                 # 布局看不清 → 读数板(不出图)
```

- 图走文件或 stdout, 诊断只走 stderr。**绝不 `2>&1`**。验尸: `head -c 200` 必须是 `<svg` 或 `<?xml`。`svg2png.sh` 会拦脏文件。
- 栅格化用 `svg2png.sh`(rsvg, 否则 qlmanage) —— 本仓自产的图**不需要** Chrome headless。⚠ 但**外来** SVG 若整张靠 CSS 变量上色(archify 的 viewer 导出即如此), rsvg 会渲成"深底黑块"且不报错: 先 `bun run scripts/svg-varflatten.ts` 展平, 或干脆起 Chrome 截图。
- 读者看到的大小是根 `<svg>` 的 `width`。经验档 ≤900, 细则在 QUICKREF「交付尺寸」。
- 读数板退出码 0 通过 / 1 门禁不过 / 2 用法错。别自己 dump rect。

交付前把 `tryExport` 换成 `exportScene`(不带 `force`)。迭代用 `tryExport`: 不过也给草稿, `draft === true` 就不能当交付。诊断日志带上 `evidence`, 不要只打 `code` 和 `message`。

## 出口

机制只活在 `scripts/runner.ts` 的 `runScene`。新图照 `examples/start/full-chain.ts` 抄: 顶层纯几何, `isMainModule(import.meta.url)` 里调用一次(`src/runtime.ts` 的 `./runtime` 子路径)。⚠ 别再用 `import.meta.main` —— bun 认它、node 下它是 `undefined`, 会让 CLI 静默不出图。

- 不手写 `catch` + `process.exitCode` —— 出口纪律收在一处, 别每份示例各守一遍。
- `refs/build-arch*.ts` 走 `audit()` 直调, **不是**抄写范本。
- 判据放 `test/`, 示例只展示。清单只有 `examples/manifest.ts` 一份。见 `examples/README.md`。

## 这件事用哪个函数

| 要做的 | 用 |
|---|---|
| 盒宽 | `nodeFit` / 卡片 `cardFit` + `placeCard`。字号、字重、`level` 必须和节点、出图档位同源 |
| 折点 | `routeOrthogonal`。中间有盒子用 `via` (作者折点, 不是避障) |
| 一源多目标 | 先选画法, 见 `refs/recipes.md` §4。共享端点什么都不写; 端口有语义才 `assignLanes` |
| 成对关系 | `routePair` + `pairLabels` |
| 组框 | 跟随内容: `fitGroupFrames`。版式本身: `bounds` + `frame: 'declared'`。不要两套都走 |
| 摆一行 / 一列 / 等距格 | `packRow` / `packCol` / `grid`。签名在 README |
| 边标签 | `edgeLabel`(`content` 里的 `\n` 拆多行; `tone` 跟边色走字, 遮罩缺省同画布色 = 隐形)。要宽度只认 `labelBoxSize` |
| 一行字里**加粗 / 斜体 / 删除线 / 着色** | 内容串里直接写标记: `**粗**` `*斜*` `~~删~~` `[字]{rose}`(或 `[字]{#b91c1c}`) —— 三处文字面(节点标签 / 边标签 / 旁注)同一份解析与发射器。规矩与落单退字面量见 `QUICKREF.md` 的「行内标记」 |
| 旁注 / 自由文本块 | `textFit` + `placeText`, 一步到位用 `textNote`; 声明归属加 `owner`(只声明归属, 不做落位) |
| 图标 | `iconAsset` 从 `svg-infovis/icons/lucide` 引 (不进 barrel)。边对着 `iconInkRect` |
| 整幅外来 SVG | `embedAsset` → `scene.embeds`。不进净空门禁 |
| 出图 | `tryExport` 改图, `exportScene` 交付。渲染只用 `sceneChildren`, 别手拼 children |

`icons/lucide.ts` 走子路径。`jointVariants` / `diamondPoints` / `derivedPatch` / `viaRoute` / `buildViaRoute` 是内部符号, 不要 import。

## 纪律 (改 core 时也不许破)

> **先看硬度, 再看条文** —— 同一份表里混着三种东西, 语气一样不代表后果一样:
> - `[硬]` 违反必红或必出错图(有机器守卫 / 有实跑事故) —— 不许破, 破了就是 bug
> - `[换]` 有明确代价的取舍 —— 代价可接受时能换, 换前先看它的退出条件
> - `[味]` 偏好, 无守卫也无事故出处 —— 它是 review 话题, 不是判决依据
>
> 「为什么」与「什么时候该推翻它」只在 [`refs/principles.md`](./refs/principles.md) 一份, 本表不重述。

1. `[换]` **零运行时依赖**。依赖方向单向 `core ← 薄壳 ← 上层`(薄壳当前由 `website/` 担任, 将来可移到仓外), 反向即破。**唯一例外**: `./icons/lucide` 读 **optional 依赖** `lucide-static`(不装也能用库本体与 barrel), 其余子路径零依赖。对外发布形态(`dist/` · `files` · `engines`)见 `refs/public-api.md`; 代价与退出条件 → `ROADMAP.md` 立项依据 · principles 三条口吻
2. `[硬]` **descriptor 双态**。shape 吐纯数据, 字符串化归 `serialize`(唯一字符串出口)。守卫 `test/serialize.test.ts`
3. `[硬]` **字节确定性**。禁 `Date.now` / `Math.random`; 数值 `round1`; 集合按 codepoint 序。守卫 `test/hero-svg.test.ts`(字节等式) + `test/determinism.test.ts`(源码扫描: `src/` `blocks/` `templates/` 逐文件剥注释后零时间源/随机源) + `test/anim-examples.test.ts`(动画示例的产物字节)。**边界**: 它约束的是 core 产物 —— 出图工具要时间戳 / 随机抖动属另一层
4. `[换]` **不搞第二权威**。决策在作者的数据里, core 只算几何; 文档同样, 一个事实一处。**可判的那半点式同源**有守卫(`box` 与 `rectFace` / `portPoint` 一类, 见 `test/box.test.ts`); **"文档别互相抄"这半无守卫**, 靠 review —— 出口纪律被抄成 8 份, 就是栽在这上面
5. `[换]` **渲染器无关**。core 自产文本走 `baselineY`(不用 `dominant-baseline`)、箭端自算几何(不用 SVG `marker`), 换来产物在任意渲染器里长一样; **外来素材 markup 原样透传, 不受此限**。垂直居中 `central = 行心 + 0.35em` **纯公式**(实测墨心 CJK 0.3555–0.3594em, 残差 ≤0.1px)。教训: **别在渲染层加全局 px 补偿** → P6
6. `[硬]` **画布算出血**。描边居中, 外扩 `strokeWidth/2`; viewBox 别写死。
7. `[硬]` **渲染面必须是 scene 的满射**。出图走 `sceneChildren`; 出图后 `grep NaN` 产物。守卫 `test/scene-render-parity.test.ts` → P5
8. `[硬]` **文本要有位置才审得到, 要有内容才上得了屏**。差集在 `phantom_labels` / `phantom_texts`, 不许静默。守卫同上 → P5
9. `[换]` **新门禁自己举证**。两个方向的反例, 外加把每个豁免条件单独松掉的变异测试; 启发式一律 warning。**退出条件**: 假阳性成本超过漏报 → 删掉它, 不是降档 → P7
10. `[硬]` **语义进 scene, 样式留覆盖表, 覆盖表永远赢**。`tone` / `variant` / `shape` 是语义, 不是样式。
11. `[换]` **新判据必须写明作者用哪个旋钮修**。没有旋钮的报错不立项; 元判据在 `test/layering.test.ts` → P7
12. `[味]` **文档里的数字只核自源码, 只写进 `QUICKREF.md` 缺省值表**。本文件与 README 不另抄一份。"清单只有一份"那半有守卫(`test/examples-manifest.test.ts`), "缺省值表"这半无守卫。
13. `[换]` **core 不猜意图**。不自动 rank / 避障 / 分组 / 换行 —— 自动层一旦进来, 几何纪律就退化成建议。**退出条件**: 手写拓扑到人脑极限(约 20 节点以上) → 把"声明"降级为"描述意图 + 解算", 但**解算层必须落在 core 之外** → P2

## 别做 (操作层 · agent 高频误用)

> 这节是**出图时**的禁令, 语重是对的 —— prompt 是软约束, agent 必违规(P1)。
> 设计原则不在这里, 见上表与 `refs/principles.md`。

- 别手写折点坐标
- 别把 `via` 或 `assignLanes` 当避障。`assignLanes` 不调用就完全不发生
- 别让 `describeScene` 报合身度或当判据。合身度是 `nodeFit`, 判决是 `audit`
- 深色底用 `canvasLayer`, 不用 CSS `background`
- 别为看一张图起浏览器

## 目录

**本 skill 目录**(仓内 `skills/svg-infovis/`; 也可 `npx skills add watert/svg-infovis` 装进任何认 skill 的 agent):

```
SKILL.md         本文件
QUICKREF.md      画图时只读这份 —— 缺省值表在它手里
refs/recipes.md         十三条图型 / 风格配方
refs/layering.md        现行分层契约 + 边界规则(七层 / 依赖方向 / 三条边界轴)
refs/principles.md      设计意图与第一性原则(代价与事故出处)
refs/public-api.md      公共面 / 变更分级 / 破坏性改动 SOP
refs/aesthetics.md      美学研究草案(含目标函数选边), 不是操作手册
```

**clone 的本仓另有的**(不随 skill 走; 装包时 `templates/` / `src/` / `dist/` 那份在 `node_modules/@watert/svg-infovis/`):

```
README.md       API 索引 / 门禁判据导读
ROADMAP.md      立项依据与后续方向
templates/      序列 / 分层 / 阶段带三套骨架。宪章见 templates/README.md
examples/       五桶, 清单 examples/manifest.ts
assets/         hero.svg(README 首图, test/hero-svg.test.ts 守字节) · embeds/ 图表底板 4(Apache 2.0)
docs/           theme / mermaid-geometry / blink-archive / infograph-roadmap
refs/architecture.md + build-arch*.ts   v0.1 五层管线的演进史存档; 现状图 = refs/architecture-v3.svg
src/  test/  scripts/runner.ts  scripts/{inspect.ts, svg2png.sh, svg-varflatten.ts}
```

```bash
bun run verify
```
