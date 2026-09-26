---
name: svg-infovis-contract
description: "svg-infovis 的作者契约: 三层入口(描述符直出 / scene 全链 / CLI)怎么选怎么引、Scene 逐字段数据契约、出口三件套与 ExportOptions 的分工, 以及这些边界的**作者视角意图**。带可跑的最小代码片段。签名的单一来源仍是源码/包内 .d.ts"
tags: [svg-infovis, contract, scene, api, export, reference]
date: 2026-09-26T23:55:00+08:00
---

# 作者契约: 入口 / 数据 / 出口 / 为什么

本 skill 里另外三份的分工: `QUICKREF.md` 答"这个旋钮怎么转", `refs/recipes.md` 答"这类图长什么样",
`examples/` 给样本。**本文件答这三件它们都不答的事**:

1. **三层入口**各是什么协议、什么时候用哪层;
2. **`Scene` 的数据契约** —— 有哪些字段、不给它会怎样;
3. **这些边界的意图** —— **作者视角的 why**。(内核开发者的 why: 每条原则的代价与逼它出来的实跑事故,
   在**仓内 `refs/principles.md`** —— 那份不随 skill 走、也不进 npm 包, 因为它的读者是改了 core 的人。)

⚠ **签名的单一来源是源码**: 装包后读 `node_modules/@watert/svg-infovis/dist/**/*.d.ts`, 仓内读 `src/`。
本文件是**地图**不是副本 —— 改了源码顺手核这里。下面每段代码都是**真跑过**的最小片段(数值 / 缺省 / 误用
一律以 QUICKREF 为准, 这里只交代**顺序与形状**)。

## 一、三层入口: 先选层, 再写坐标

| 层 | 入口 | 过门禁 | 什么时候用 |
|---|---|---|---|
| ① **描述符层** | `descriptor` 的 `rect` / `text` / `group` / `path` … + `serialize`(或 `svg()` 壳) | ✗ | 只画**墨迹**: 大数字块 / 徽章列表 / 图标阵列 / 标题梯级 —— 压在版式上、**没有可审拓扑**的图 |
| ② **scene 全链(主路径)** | `Scene` → `routeOrthogonal` / `pack*` / `bounds` → `tryExport` / `exportScene` | ✓ | 有**实体与关系**的图: 流程 / 时序 / 架构 / 阶段带 / 本体图 |
| ③ **CLI** | `svginfo run <scene.ts> [-o out.svg]` | ✓ | 场景文件只 `export default scene` 时, 让 CLI 代管出口纪律 |

判据是**"有没有可审的拓扑"**, 不是"图复不复杂" —— 一张 20 块的精致排版件仍走 ①。①②各一段最小代码:

```ts
// ① 描述符层 —— 直出 descriptor, 不经 scene、不过门禁
import { svg, text } from '@watert/svg-infovis/descriptor';
import { toSVG } from '@watert/svg-infovis/serialize';
process.stdout.write(toSVG(svg(320, 120, [text(24, 60, 'Hello', { 'font-size': 30 })])));
```

```ts
// ② scene 全链 —— 决策表在上, 几何在下; 出图过门禁(完整起手见 QUICKREF「30 秒起手」)
import { THEMES, exportScene, nodeFit, routeOrthogonal, type Scene } from '@watert/svg-infovis';

const f = nodeFit({ label: 'A', sub: 'note', level: 'showcase' });   // 盒宽反算, 不手定
const a = { x: 60, y: 60, w: f.w, h: f.h };
const b = { x: 60, y: 220, w: f.w, h: f.h };
const r = routeOrthogonal({ from: a, fromPort: { side: 'bottom' }, to: b, toPort: { side: 'top' } });

const scene: Scene = {
  width: 0, height: 0,                                               // 0×0 + 出口 fit: 画布按内容重算
  nodes: [{ id: 'a', rect: a, label: 'A', sub: 'note' }, { id: 'b', rect: b, label: 'B' }],
  edges: [{ id: 'e', from: 'a', to: 'b', points: r.points }],
};
console.log(exportScene(scene, { level: 'showcase', theme: THEMES.light, fit: true }).svg);
```

**③ 的两条命令**(CLI 随包发, 仓内 / 装包后都能用; 图走 stdout / 诊断走 stderr / 退出码 0 过 1 有病 2 用法错):

```bash
svginfo run scene.ts -o out.svg          # 出一张图(认出图脚本 / 纯场景模块两种入口)
svginfo inspect scene.ts --fit           # 只读数不出图(布局看不清时先来这条)
svginfo render scene.ts --png out.png    # SVG + 本地栅格化成 PNG
svginfo new seq                          # 拷 templates/sequence.ts 起手
```

**引法两条路(同一份 API)**:

- **装包消费**: `import { exportScene } from '@watert/svg-infovis'`(起手照抄 QUICKREF「30 秒起手」);
- **仓内开发**: 相对引 `./src/index.ts`(仓内那些 `bun run examples/...` 也只在这里成立)。

⚠ `src/` `templates/` `scripts/` `blocks/` `assets/` **随包发布**(能**读**), 但**不在 `exports` 白名单里** ——
不能用包名 import 它们。模板的可用路径是 `svginfo new <name>` 拷一份, 或直接读包内 `templates/*.ts`。

## 二、`Scene` 的数据契约

一张 scene = **六张表 + 两个数**。除 `width` / `height` / `nodes` 外全部可选 ——
但"可选"不等于"随便": 每个字段下面都写着**不给它会怎样**。先把它们装成一份:

```ts
import { THEMES, edgeLabel, exportScene, nodeFit, routeOrthogonal, textNote, type Scene } from '@watert/svg-infovis';

const f = nodeFit({ label: 'A', sub: 'note', level: 'showcase' });
const a = { x: 60, y: 60, w: f.w, h: f.h };
const b = { x: 60, y: 220, w: f.w, h: f.h };
const r = routeOrthogonal({ from: a, fromPort: { side: 'bottom' }, to: b, toPort: { side: 'top' } });

const scene: Scene = {
  width: 0, height: 0,                                     // 两个数: 0×0 + 出口 fit 交给 core 重算
  nodes: [                                                 // 六张表 ↓
    { id: 'a', rect: a, label: 'A', sub: 'note', tone: 'blue', variant: 'tint' },
    { id: 'b', rect: b, label: 'B' },
  ],
  edges: [{ id: 'e', from: 'a', to: 'b', points: r.points, tone: 'blue' }],
  labels: [edgeLabel({ id: 'e', points: r.points, tone: 'blue' }, '过审')],
  texts: [textNote({ id: 'note', content: '旁注两行\n第二行', at: { x: 260, y: 150 } })],
  // groups: [{ id: 'g', rect: bounds([a, b], { pad: 28 })!, frame: 'declared', label: 'Layer', contains: ['a', 'b'] }],
  // embeds: [embedAsset(echartsSvg, { name: 'left' })],   // 整幅外来 SVG: 只进 contentBounds / single_svg
};

exportScene(scene, { level: 'showcase', theme: THEMES.light, fit: true });   // 交付档: 不过就抛
```

### 顶层 `Scene`

| 字段 | 必填 | 作用 | 不给会怎样 |
|---|---|---|---|
| `width` / `height` | ✅ | 画布 | 约定写 `0×0` + 出口 `fit: true` 让 core 按内容重算; 手算画布是白算(见 examples/README 那条"五种写法并存"的教训) |
| `nodes` | ✅ | 节点 | — |
| `edges` | | 关系边, 也用来画基准线(泳道线 / 分隔线) | 空数组 |
| `groups` | | 组框: 归属框 / 纯视觉分区 | 无分组 |
| `labels` | | 边标签的检测盒(同时是上屏的遮罩片) | 关系上没有字 |
| `texts` | | 旁注 / 自由文本块 | ⚠ **不进 scene 的文案 audit 物理上看不见** —— 历史上折线穿过组框标题而门禁全绿, 就是这么来的 |
| `embeds` | | 整幅外来 SVG(echarts 那种) | 走 `embedAsset()`; 它只进 `contentBounds` / `single_svg`, **不进任何净空门禁** |
| `clusterTier` | | `set`(缺省, 平铺集合) / `tree`(额外的层级 ownership 门禁) | 平铺集合 |

### `SceneNode`

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` / `rect` | ✅ | `rect` **一律反算**(`nodeFit` / `cardFit`), 别手写 |
| `label` / `sub` | | 主 / 次标签, 都吃 `\n` 与行内标记 |
| `fontSize` / `weight` | | ⚠ **必须与算盒那一份同源**(不同源 = 盒按一个字重量、字按另一个画: 实测差 11px / 3%) |
| `tone` / `variant` | | 语义槽: 哪一类东西(7 档) / `outline` 缺省 · `tint` 角色框 · `solid` 强调(**全图只给一个**) |
| `shape` | | `rect`(缺省) / `diamond`(判定) / `cylinder`(存储) —— 几何 bbox 三者相同, "我是菱形"推不出来, 只能作者点 |
| `opacity` / `struck` | | "这格被废除"的两个槽(淡化 + 红 X) |
| `align` | | `center`(缺省) / `start`(逐行说明块必须左对齐) |
| `icon` | | `iconAsset(name)` 的产物(解析好的原语, **渲染期不读盘**) |
| `bounds_source` | | 数据来源档(`layout` / `manual` / `estimate`)—— 声明制那半, 出草稿图时要清零 |

### `SceneEdge`

`id` `points` ✅ · `from` / `to`(**泳道线才写**; 序列图的消息边留空) · `label` · `tone` · `noCheck`(基准线豁免)。

### `SceneGroup`

`id` `rect` ✅ · `label` + `labelRect` / `labelPlacement` / `labelInset`(声明了后半组, `labelRect` 由 core 派生)
· `frame: 'declared'`(框由作者定; 不给 = 按成员并集派生) · `contains`(成员声明) · `tone` · `fontSize`(缺省 12)
· `noCheck`(纯视觉分区: band / region)。

⚠ **别两套都走**: `bounds()` 算框再交给 `fitGroupFrames` = pad 吃两次; 只交 `fitGroupFrames` 而不写 `contains` = 框与成员脱钩。

### `SceneLabel`(边标签)

`id` `at` `width` `height` ✅ —— **四个数都走 `edgeLabel()` / `labelBoxSize()`, 别手算** · `text`(缺省不上屏 → 计入 `phantom_labels`)
· `ownerEdge`(只声明归属并收窄豁免面, 不做落位) · `tone` · `rotate`(沿线标签) · `bg` / `color`(单点例外)。
⚠ 遮罩缺省**与画布同色 = 隐形**(只剩切断穿线那点本职); 要徽章观感才给 `bg`。

### `SceneText`(旁注)

`id` `rect` ✅(走 `textFit` → `placeText`, 或一步 `textNote`; **逐行量**, 别拿整串喂 `measureText`) · `text`
· `fontSize`(缺省 11) · `weight` · `color` · `anchor`(`start` / `middle` / `end`, 只管水平)
· `owner`(`{ kind: 'node' | 'edge' | 'group', id }`)。
⚠ `owner` 只做两件事: 声明归属 + 收窄豁免面(`kind: 'edge'` 才豁免, 且只豁免命中那一**条**边), **不做落位**。

### 三条跨表纪律

1. **语义进 scene, 样式留覆盖表** —— `tone` / `variant` / `shape` / `struck` 是**语义**(这一格是什么角色)进 scene;
   单点色 / 线宽 / 虚线 / 网格留 `ExportOptions`。覆盖表**优先级永远最高**。
2. **看不见的东西没法审** —— 只给位置不给文字 = 占位, 数量记在 `metrics.phantom_labels` / `phantom_texts`, **不许静默**。
3. **手写 scene 不带版本戳** —— `SceneDoc` 那套 `html_rev` / `scene_rev` / `html_hash` 是给"HTML 决策源 → 几何缓存"
   那条下游用的(它多一档"缓存陈旧"门禁); 手写几何的 scene 不必带, 也不会有"陈旧"可言。

## 三、出口协议

| 函数 | 角色 | 门禁没过时 |
|---|---|---|
| `tryExport(scene, opts?)` | **迭代档** | 照给草稿图, 且 `draft === true`(还有 `estimated_nodes` 要清零) |
| `exportScene(scene, opts?)` | **交付档, 保险丝** | 抛 `ExportBlockedError` |
| `audit(scene, opts?)` | 只审不出图(排查几何用这个, 坐标是**原坐标**) | 返回 report |
| `describeScene(scene)` | 读数板: 逐对象坐标 + 诊断挂回对象下 | 同上 |
| `runScene(scene, opts?)` | 出口纪律(图走 stdout / 诊断走 stderr / 退出码 0·1·2) | 仓内 `scripts/runner.ts` / CLI 的 `run` |

```ts
import { audit, exportScene, tryExport } from '@watert/svg-infovis';

const it = tryExport(scene, { level: 'showcase', theme: THEMES.light, fit: true });   // 迭代: 不过也给草稿
if (it.draft) console.error('⚠ 草稿图, 别交付', it.estimated_nodes);

const out = exportScene(scene, {                                                      // 交付: 不过当场抛
  level: 'showcase', theme: THEMES.light, fit: true,
  nodeStyles: { b: { tone: 'rose' } },              // 覆盖表 = 逐 id 逃生口(永远赢)
  edgeStyles: { e: { dash: '5 4', end: 'arrow-line' } },
  grid: { style: 'dot', step: 14 },
});

console.log(audit(scene).diagnostics);              // 只审: 坐标是**原坐标**(fit 之前那份)
```

`ExportResult` = `{ svg, report, draft, estimated_nodes }`。⚠ `exportScene` 的 `fit: true` 是**先平移再 audit**:
诊断 `evidence` 里的坐标是平移后的 —— 按原坐标排查就**直接 `audit(scene)`**。

`ExportOptions` 分三组(细节与数字见 QUICKREF / README, 这里只给骨架):

- **档位**: `level`(`standard` / `showcase`) · `theme` · `force` · `skipAudit`(只给调试, 交付路径不许用);
- **画布**: `fit` / `padding` · `title` · `fontFamily` · `nodeRadius` / `edgeRadius`;
- **覆盖表(逃生口, 永远赢)**: `nodeStyles` / `groupStyles` / `edgeStyles` / `grid` / `hooks`。

⚠ **覆盖表是 `ExportOptions` 的字段**: 写进 `scene`(或喂给 `exportScene` 第二个参数以外的任何地方)**不报错也不生效**,
产物只是悄悄退回主题缺省。`bun` 不做类型检查 ⇒ 只有 `tsc` 报 `TS2353`; 这条实测骗过肉检两次。

## 四、意图(作者视角的 why)

每条都能对回 `SKILL.md` 的「纪律」表; 代价 / 退出条件 / 事故出处一律在仓内 `refs/principles.md`, 本文件不重述。

1. **决策在你手里** —— 几条泳道 / 谁在左 / 端口朝哪 / 折点走哪, core 一律**不猜**(不自动 rank、不避障、不分组、不换行)。
   它只回答"你声明的这份几何对不对"。自动层一旦进来, 几何纪律就退化成建议。
2. **门禁只管几何** —— 颜色 / 语义 / 好不好看它一声不响。`tone` 进 scene 是为了**渲染**, 不是为了让人审它。
3. **门禁绿只是地板** —— 它答"能不能出", 不答"画得好不好"; `audit` 通过之后, 那半还得靠你看图(栅格化一眼)。
   反向也成立: 择优(`routeCost`)不是第二道门禁, 门禁也不是择优。
4. **产物要能被别人重出** —— 字节确定: 无时间戳、无随机、无环境依赖。你交的是图, 也是一份**可 diff / 可对账的文本**。
5. **一处事实一处** —— 同一个数不许算两遍(盒宽、标签宽、画布一律走反算); 文档同样, 一个事实一个家。
6. **能填参就别手写** —— 序列 / 分层 / 阶段带已有可跑骨架; 你只需要给**决策表**。手排是兜底, 不是默认。
7. **出图别翻源码** —— `src/` 是给改内核的人读的。出图遇到问题先查 QUICKREF, 图型查 `refs/recipes.md`,
   函数与子路径查 `README.md` / `docs/api-index.md`; **三处都没有才是内核缺口**, 记进 `ROADMAP.md`, 不要现猜。
