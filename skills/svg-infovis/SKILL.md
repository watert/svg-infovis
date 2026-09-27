---
name: svg-infovis
description: "何时用 / 怎么用 svg-infovis 画结构图: 写一段 TS 调 core 的 shape / route / audit, bun 直跑出 SVG, scripts/svg2png.sh 本地栅格化验证(毫秒级, 不用开浏览器)。当用户要画或改流程 / 时序 / 架构图、要在文档或 deck 里嵌 SVG 配图、要检查图的几何质量(正交 / 净空 / 标签压线 / 节点重叠)、要画图标 + 说明卡片的本体图 / 关系图(图标走 lucide-static)、或要改内核本身时使用。画图只读 QUICKREF; 图型骨架 refs/recipes.md; 三层入口与 Scene 契约 refs/contract.md; 三张参考图(图 + 代码)在 examples/; API 一览 README.md。"
tags: [svg-infovis, svg, diagram, geometry, layout, bun]
date: 2026-09-26T23:50:00+08:00
---

# svg-infovis · 何时用 / 怎么用

README 回答"这是什么"; 本文件回答**你(coding agent)什么时候该拿它画图、画图时守什么**。

**本 skill 自带什么**: 本文件 + `QUICKREF.md` + `refs/{recipes,contract,diagnostics,aesthetics}.md` + `examples/`(三张参考图 + 各自的源码副本) —— 下面就写这些相对路径, 它们与 `SKILL.md` 同装在一个目录里(仓内真身在 `skills/svg-infovis/`)。
**每层的受众分得开**: 本 skill 只装"画图现场用得上"的; 分层契约 / **内核**设计意图 / 公共面(改内核与发布才用)在**仓内 `docs/internals/`**, 不随 skill 也不进 npm 包 —— 下表凡标"仓内"的都属后者。
**运行时优先 bun**: 场景文件是 `.ts`, `bun run scene.ts` 直跑零配置; 没有 bun 时 `svginfo` 退回 node ≥22.6 的类型剥离, 产物逐字节相同。

## 何时用 / 何时别用

- **用**: 要往文档 / deck 里放结构图(流程 / 时序 / 架构), 主路径该由作者画、出厂前要过门禁; 或要改几何内核本身
- **别用**: 随手草图交给 Mermaid; data visualization(比例尺绑数据)交给 d3 类库; 要交互 viewer 不是本仓的活

## 读哪一份

一份事实一个家。出图不要翻 `src/`。缺省值表里没有的数是文档缺口, 记进 `ROADMAP.md`, 不要现猜。

| 你在做 | 只读 |
|---|---|
| **第一张图 / 拿不准怎么起手** | [`QUICKREF.md`](./QUICKREF.md) — 起手代码、缺省值、误用、动手前的问题。**数字只在那张缺省值表** |
| **想知道 API 的协议与意图**(三层入口怎么选、`Scene` 逐字段、出口三件套、为什么这么切) | [`refs/contract.md`](./refs/contract.md) —— 作者契约。签名的单一来源仍是源码 / 包内 `.d.ts` |
| **报出一条诊断, 不知这个码什么意思 / 要不要紧 / 往哪修** | [`refs/diagnostics.md`](./refs/diagnostics.md) —— **24 个门禁码全表**(按档位 / 含义 / 修法), 外加不进门禁的三族 |
| **想先看一张真图长什么样** | [`examples/`](./examples/README.md) —— 三张参考图 + 源码副本(序列 / 阶段带 / 学术风), 配上读 |
| 选图型、抄骨架 | [`refs/recipes.md`](./refs/recipes.md)。序列 / 分层 / 阶段带别手写, 用 `templates/{sequence,layered,lifecycle}.ts`(仓内; 也可 `svginfo new <name>` 拷一份起手) |
| 查函数 / 门禁判据 / 模块在哪 | 子路径一览在 `README.md`, 逐条在 `docs/api-index.md`(仓内; 包内只有 `README.md` 那份一览) |
| 改内核 | 仓内 `docs/internals/policies.md`(纪律全表 13 条)+ 源码。美学草案 [`refs/aesthetics.md`](./refs/aesthetics.md) **不许写成门禁** |
| 拿不准某件东西该放哪层 / 哪条边界规则管它 | 仓内 `docs/internals/layering.md` —— 七层 / 依赖方向 / 准入门槛 / 三条边界轴(配图 `docs/internals/architecture-v3.svg`) |
| 要知道**内核**为什么这么切(代价 / 退出条件 / 实跑事故) | 仓内 `docs/internals/principles.md` —— 作者视角那份短的在 [`refs/contract.md`](./refs/contract.md) §四 |
| 要动公共面(exports 子路径 / 门禁码 / 发布形态) | 仓内 `docs/internals/public-api.md` —— 变更分级与破坏性改动四步 |
| 看未做项 | `ROADMAP.md`(仓内) |

## 三步

**决策表 → 几何 → 出口**, 就这三步。下面是**骨架**(只交代顺序与形状); **权威起手**(带缺省值的参数逐个解释)
在 QUICKREF「30 秒起手」—— **数值 / 缺省 / 误用一律以那份为准**, 别在这里找第二份。唯一不许省的是**出口**:
不要自己写一份不过门禁的 `toSVG`。

```ts
import { writeFileSync } from 'node:fs';
// 装包后从包名引; 仓内开发也可相对引 `./src/index.ts`(你是哪一档见下面「三条路」表)
import { THEMES, nodeFit, routeOrthogonal, tryExport } from '@watert/svg-infovis';

// ① 决策表: 谁在图上 / 谁连谁(几何一个数都不手填)
const f = nodeFit({ label: 'A', sub: 'note', level: 'showcase' });       // 盒宽反算, 不手定
const a = { x: 60, y: 60, w: f.w, h: f.h }, b = { x: 60, y: 220, w: f.w, h: f.h };

// ② 几何: 折点列由 core 解算 —— `via` 是作者声明, 不是避障
const r = routeOrthogonal({ from: a, fromPort: { side: 'bottom' }, to: b, toPort: { side: 'top' } });
const scene = {
  width: 0, height: 0,                                                   // 0×0 + 出口 fit: 画布按内容重算
  nodes: [{ id: 'a', rect: a, label: 'A', sub: 'note' }, { id: 'b', rect: b, label: 'B' }],
  edges: [{ id: 'e', from: 'a', to: 'b', points: r.points }],
};

// ③ 出口: 迭代用 tryExport(不过也给草稿), 交付换成 exportScene(不过就抛 ExportBlockedError)
const { svg, report, draft } = tryExport(scene, { level: 'showcase', theme: THEMES.light, fit: true });
writeFileSync('/tmp/d.svg', svg);                                        // 产物归脚本自己写, 不经 shell 重定向
if (draft || !report.pass) process.exitCode = 1;                          // 判决必须落到 exit code
```

字段与协议的完整地图(三层入口怎么选、`Scene` 逐字段、出口三件套)在 [`refs/contract.md`](./refs/contract.md)。

⚠ **三条路别混 —— 先确认你手上有哪一档, 再决定能跑什么**(写死在这里, 因为文档里的路径确实指向外面):

| 你的处境 | 手上有 | 能跑的命令 | 起手代码 |
|---|---|---|---|
| ① **clone 了本仓** | 全部(`src/` `examples/` `test/` `templates/` `scripts/` `docs/` …) | 本节这些 `bun run examples/...` / `scripts/*.ts` 命令**只在这里成立** | 抄 `examples/start/full-chain.ts` |
| ② **装了包**(`bun add @watert/svg-infovis`) | 包里的 `dist/` `src/` `blocks/` `scripts/` `templates/` `assets/` `skills/` + `README.md` | `svginfo run/inspect/render/new/icons`(CLI 随包发) | 照抄 [`QUICKREF.md`](./QUICKREF.md)「30 秒起手」 |
| ③ **只装了本 skill** | 这七份(`SKILL.md` / `QUICKREF.md` / `refs/{recipes,contract,diagnostics,aesthetics}.md` / `examples/`) | **什么都没有** —— skill 里没有可跑的代码 | 先按②装包拿到 API, 再照 QUICKREF 起手 |

- ②③ 手上**没有** `examples/` 与 `test/`(不在包内), 所以文档里凡是 `bun run examples/…` 的示例命令都别照打 —— 它们是①的路径。
- ③ 想看"一张真图长什么样"就看 [`examples/`](./examples/README.md): 三张 PNG + 各自的源码副本(读本, 不可直接跑; 换算见那份 README)。
- `templates/` 比较特殊: 源码**随包发**(能读), 但**没有包名子路径** —— 起手走 `svginfo new <name>`。

**一条链跑到底**(每个示例都是这个形状; ② 把那两条 `bun run` 换成 `svginfo run` / `svginfo inspect`):

```bash
bun run examples/start/full-chain.ts > /tmp/d.svg  # ① clone 本仓: 抄 full-chain 开新图(出口是 fail-closed 的标准姿势)

bun run d.ts > /tmp/d.svg        # 自己那份场景: 图走 stdout, 诊断只走 stderr —— **绝不 `2>&1`**
echo "exit=$?"                   # 0 过 / 1 门禁没过(草稿照给, data-draft="1") / 2 用法错
./scripts/svg2png.sh /tmp/d.svg /tmp/d.png 1200   # 本地栅格化看一眼(rsvg, 否则 qlmanage)
bun run scripts/inspect.ts d.ts --fit             # 布局看不清 → 读数板(不出图; 与出口同一次序)
```

- 图走文件或 stdout, 诊断只走 stderr。**绝不 `2>&1`**。验尸: `head -c 200` 必须是 `<svg` 或 `<?xml`。`svg2png.sh` 会拦脏文件。
- 栅格化用 `svg2png.sh`(rsvg, 否则 qlmanage) —— 本仓自产的图**不需要** Chrome headless。⚠ 但**外来** SVG 若整张靠 CSS 变量上色(archify 的 viewer 导出即如此), rsvg 会渲成"深底黑块"且不报错: 先 `bun run scripts/svg-varflatten.ts` 展平, 或干脆起 Chrome 截图。
- 读者看到的大小是根 `<svg>` 的 `width`。经验档 ≤900, 细则在 QUICKREF「交付尺寸」。
- 读数板退出码 0 通过 / 1 门禁不过 / 2 用法错。别自己 dump rect。

交付前把 `tryExport` 换成 `exportScene`(不带 `force`)。迭代用 `tryExport`: 不过也给草稿, `draft === true` 就不能当交付。诊断日志带上 `evidence`, 不要只打 `code` 和 `message`。

## 出口

机制只活在 `scripts/runner.ts` 的 `runScene`。新图照 `examples/start/full-chain.ts` 抄: 顶层纯几何, `isMainModule(import.meta.url)` 里调用一次(`src/runtime.ts` 的 `./runtime` 子路径)。⚠ 别再用 `import.meta.main` —— bun 认它、node 下它是 `undefined`, 会让 CLI 静默不出图。

- 不手写 `catch` + `process.exitCode` —— 出口纪律收在一处, 别每份示例各守一遍。
- `docs/internals/build-arch*.ts` 走 `audit()` 直调, **不是**抄写范本。
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

## 纪律 (全表在仓内, 不在这里)

13 条纪律(硬度三档 + 每条守卫)的读者是**改了 core 的人**, 而只装 skill 的 agent 手上没有 `src/` ——
所以全表在**仓内 `docs/internals/policies.md`**, 不随 skill 也不进 npm 包。本文件只留下面的**操作禁令**。
出图现场够用的 why 是 [`refs/contract.md`](./refs/contract.md) §四 那七条短句, 不必翻全表。

## 别做 (操作层 · agent 高频误用)

> 这节是**出图时**的禁令, 语重是对的 —— prompt 是软约束, agent 必违规, 所以能焊进出口的就不留在这里(纪律 9 / 11)。
> 设计原则不在这里, 见上表与 `docs/internals/principles.md`。

- 别手写折点坐标
- 别把 `via` 或 `assignLanes` 当避障。`assignLanes` 不调用就完全不发生
- 别让 `describeScene` 报合身度或当判据。合身度是 `nodeFit`, 判决是 `audit`
- 深色底用 `canvasLayer`, 不用 CSS `background`
- 别为看一张图起浏览器

## 目录

**本 skill = 这七项**(仓内 `skills/svg-infovis/`; 也可 `npx skills add watert/svg-infovis` 装进任何认 skill 的 agent):

```
SKILL.md          本文件 —— 何时用 / 怎么用 / 操作禁令
QUICKREF.md       画图时只读这份 —— 起手代码与缺省值表在它手里
refs/recipes.md         十三条图型 / 风格配方
refs/contract.md        作者契约: 三层入口 / Scene 逐字段 / 出口三件套 / 作者视角的 why
refs/diagnostics.md     24 个门禁码全表 —— 每个码的档位 / 含义 / 往哪修
refs/aesthetics.md      美学评估草案(含目标函数选边), 不是操作手册
examples/               三张参考图 + 各自的源码副本(序列 / 阶段带 / 学术风)
```

**改内核 / 发布用得上的**(仓内 `docs/internals/`, 不随 skill 也不进 npm 包): `policies.md` 纪律全表 13 条 · `layering.md` 分层契约 · `principles.md` 意图与事故出处 · `public-api.md` 公共面与破坏性改动 SOP · `architecture.md` 演进史存档。
本仓其余那堆(`templates/` `examples/` `src/` `test/` `docs/` `assets/` …)同理 —— 完整清单与"该读哪份"看仓内 `AGENTS.md`, 本文件不复述。
⚠ 这个目录里**全是真身**(没有软链): 仓根那几条指向这里的是软链, 别反着写。

```bash
bun run verify      # 在 clone 的本仓里改完内核: 构建 + 全量测试 + 类型检查, 全绿才算完
```
