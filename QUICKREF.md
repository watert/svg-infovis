# svg-infovis · 速查

> 画图**只读这一页**。起手代码、缺省值、误用、动手前的问题都在这。
> 图型骨架在 `refs/recipes.md`, 函数与 API 索引在 `README.md`, 何时用与改内核的纪律在 `SKILL.md`。
> `src/` 是给改内核的人读的。出图时翻源码是纯浪费。

## 30 秒起手

```ts
import { writeFileSync } from 'node:fs';
// 安装后从包名引; 在本仓内开发时也可相对路径引 `./src/index.ts`。这是唯一的起手代码。
import { THEMES, nodeFit, routeOrthogonal, tryExport } from 'svg-infovis';

const f = nodeFit({ label: 'A', sub: 'note', level: 'showcase' });   // 盒宽走反算, 不手定
const a = { x: 40, y: 40, w: f.w, h: f.h }, b = { x: 40, y: 200, w: f.w, h: f.h };
const r = routeOrthogonal({ from: a, fromPort: { side: 'bottom' }, to: b, toPort: { side: 'top' } });

const scene = {
  width: 300, height: 300,
  nodes: [{ id: 'a', rect: a, label: 'A', sub: 'note' }, { id: 'b', rect: b, label: 'B' }],
  edges: [{ id: 'e', from: 'a', to: 'b', points: r.points }],
};
const { svg, report, draft } = tryExport(scene, { level: 'showcase', theme: THEMES.light, fit: true });
writeFileSync('/tmp/d.svg', svg);                       // 产物归脚本自己写, 不经 shell 重定向
if (draft) console.error('⚠ 草稿图(门禁没过 / 含估算值 / 缓存陈旧) —— 别直接交付');
if (!report.pass) {
  for (const d of report.diagnostics) console.error(`[${d.severity}] ${d.code}: ${d.message}`, d.evidence);
  process.exitCode = 1;                                 // ← 判决必须落到 exit code
}
```

```bash
bun run d.ts                                                   # → /tmp/d.svg
./scripts/svg2png.sh /tmp/d.svg /tmp/d.png 1200
```

交付前把 `tryExport` 换成 `exportScene`(不带 `force`)—— 它才是保险丝, 不过就抛 `ExportBlockedError`。

**先选图型, 再写坐标** —— 这里是选型表。骨架与坑在 `refs/recipes.md`
(序列 / 泳道 `templates/sequence.ts`、分层带 `templates/layered.ts`、状态机 / 阶段带 `templates/lifecycle.ts` 已有可跑骨架, 能填参就别手写):

| 你要讲的是 | 用哪种图型 | 关系怎么画 |
|---|---|---|
| 分层 / 泳道里的归属 | 三层带(分组框) —— **分层带 ✅ 有骨架, 别手写: `templates/layered.ts`** | 框 = 归属 |
| 版本演进 / 事件序列 | 时间线(单列同轴, 盒居中对齐) —— 若这条链带**段落 / 岔路 / 回流**, 那是阶段带: ✅ 有骨架, 别手写 `templates/lifecycle.ts` | 边 = 下一步 |
| 模块依赖 / 调用关系 | 依赖图(hub 居中 + 叶在外圈) | 边 = 调用 |
| 一源多目标 | fan-out(**先选画法**: 共享端点为**默认** —— 端口无语义就什么都不写; 端口有语义才 `assignLanes`, 骨架见 `refs/recipes.md` §4) | 边 = 分叉(共享端点长出主干 + 总线) |
| **谁 × 谁 的多对多关系** | **访问矩阵(点阵, 关系用点、实体用框)** | **点 = 有这条关系** |
| **判定 / 分流去向** | **判定流(菱形 + 多路散开, 竖向漏斗)** | 边 = 分支条件 |
| **一次连接的代价差** | **边形态编码边界(跨进程粗实线 / 进程内点线)** | **边的画法 = 边界类型** |
| **哪个格子是空的** | **二维定位(细节点当轴 + 两排块右对齐)** | 位置 = 两个维度 |
| **一次调用的先后(谁在什么时刻调谁)** | **序列 / 泳道 —— ✅ 有骨架, 别手写: `templates/sequence.ts`** | **横线 = 一次消息, 行的先后 = 时间顺序** |
| **一个对象在哪几段之间流转 / 哪些岔路能暂停它 / 哪些出口没回头路** | **阶段带(lifecycle: 横向主链 + 段落 + 向下岔路 + 一条回流)** —— ✅ 有骨架, 别手写: `templates/lifecycle.ts`(手排参照 `examples/gallery/lifecycle-agent-run.ts` 仍可对读) | **主链箭头 = 下一步 · 向下 = 岔路 · 向上 = 可重试** |
| **一个领域里有哪些实体 / 各自的属性 / 谁能碰到谁** | **本体图(图标在上 + 多行说明卡片在下)** —— 无模板, 活体参照 `examples/gallery/ontology-icons.ts` | **线 = 关系; 同一对实体上的两条关系走 `routePair`(成对双线)** |
| **现成图表与结构的关系**(指标面板 / 看板: 把 echarts 那种整幅图当底板) | **图表底板(整幅外来 SVG 进 `scene.embeds`)** —— 骨架见 `refs/recipes.md` §12, 活体 `examples/gallery/embed-panel.ts` | **边 = 结构关系; 图表是底板(z 序在底, 边与标签压在它上面)** |
| **要投稿味的克制观感**(学术图) | **不是图型, 是风格族**: `THEMES.paper` + `tint`/`struck`/`weight` 四个槽 —— 图型仍从上面选, 清单见 `refs/recipes.md` §13 | **—(风格不动拓扑)** |

**别一路只用分组框** —— "并排几栏 + 矩形节点"能表达的东西最少(只有归属), 而读者常问的是**关系**(谁连谁 / 谁碰谁)与**边界**(哪一段跨了进程)。四个以上分区就说明该换图型了。

**布局 / 门禁看不动时**(先读数, 别写 debug 脚本):

```bash
bun run scripts/inspect.ts /path/to/my-scene.ts          # 逐对象 x/y/w/h + R/B + 折点列 + 诊断挂到对象下
bun run scripts/inspect.ts /path/to/my-scene.ts --metrics --rows=80 --showcase
# 退出码: 0 通过 / 1 门禁不过(读数照打全) / 2 用法错
```

## 缺省值表(全部核自源码; 文档没写时不必去翻)

| 常量 | 值 | 位置 | 含义 / 什么时候会被它绊到 |
|---|---|---|---|
| `stub` | **18** | `route.ts` | 出盒后的直段长。**`via` 点落进"盒边 + 18px"这段距离内 → 折回自己**(实测: 盒底 y=675 时 via 给 670/680/690 全中招, **y≥693 才干净** → 吐 5 点坏折线 + `viaInfeasible`) |
| `LANE_STEP_MIN` | **15** | `lanes.ts` | `assignLanes` 同带内相邻腰线的最小间距(`= OVERLAP_MIN 8 + PARALLEL_GAP_MAX 7`)。**与 `edge_overlap` 修法里喊的"错开至少 15px"是同一个数** —— 门禁喊哪个值, 分配器就用哪个值 |
| `BORDER_CLEARANCE` | **24** | `cluster.ts` | 组成员距框线的门禁内距(`cluster_border_clearance`) |
| `GROUP_FIT_PAD` | **28** | `cluster.ts` | 派生框缺省 pad = 24 + 4px 余量。**刚派生的框必然过门禁, 不必再调** |
| `BORDER_RUN_GAP` | **6** | `cluster.ts` | 边"沿框线跑"的垂距上限(还要投影重叠 ≥ 24px) |
| `STUB_MIN` | **10** | `audit.ts` | 端点前直段下限 —— 仅**存在折弯**时才判(直连边不在此列, 否则与 `node_gap` 打架) |
| `END_BAND` | **18** | `audit.ts` | 倒数第二段"蹭"本端盒的距离; 这条是 **warning**, 不拦出口 |
| `PORT_SHARED_ATTACH` | **3** | `audit.ts` | 端口同源的"贴住"档(分工: ≤2px 且同向 / ≤3px 不问方向 / 更远但 clamp 回盒重合) |
| `NODE_TEXT_LAYOUT.fontSize` | **13** | `shapes/node.ts` | 节点主标签字号。**`nodeFit` 与 `nodeShape` 共用的唯一一份** |
| `.subSizeDelta` | **2** | `shapes/node.ts` | 次标签 = 主字号 − 2 |
| `.lineGapEm` | **1.25** | `shapes/node.ts` | 两行**行中心**距 = 字号 × 1.25 |
| `THRESHOLDS.standard` | 净空 **2** / 间距 **8** / 呼吸位 **6** | `audit.ts` | 起手档(也是 `nodeFit` 的缺省档) |
| `THRESHOLDS.showcase` | 净空 **4** / 间距 **12** / 呼吸位 **10** | `audit.ts` | 交付档。**两档呼吸位差 2×(10−6) = 8px 可用宽** |
| `fit` 缺省 | `bleed 1` / `padding 16` | `export.ts` | `fit: true` = 用这对缺省 |
| 端口缺省 | 面中点 | `route.ts` | `portPoint` 取值序: `at` → `t` → `0.5` |
| 自重叠 `eps` | **0.5px** | `predicates.ts` | 非相邻段同轴反向的投影重叠阈值 |
| `PIERCE_MIN` | **0.5px** | `audit.ts` | 边穿盒 / 端点擦边的**半像素**分界。导出是给 `route-cost` 当尺子用的 —— 门禁与代价层同一把尺子, 别另定一个数 |
| `CYLINDER_CAP_RATIO` | **1/8** | `shapes/node.ts` | 圆柱盖高占盒高的比例 ⇒ 盒高 +4×盖高 = **×2**(与菱形两轴 ×2 同档)。`nodeFit({ shape: 'cylinder' })` 已含这一步 |
| `BASELINE_FACTORS.central` | **0.35em** | `descriptor.ts` | `baselineY` 的 central 折算 = 行心 + 0.35em, **纯公式、无 px 修正**(实测墨心: CJK 0.3555–0.3594em / 大写 0.3636 / 小写 0.3413, 残差 ≤0.1px)。⚠ 曾有一个 `OPTICAL_CENTRAL_FIX = 1.2`(260917 按两行块校准的常数补偿), 260925 已移除 —— 那是**内容依赖**的修正, 进了共享折算层就把每个单行场景(节点单标签 / 边标签 / 旁注 / 组标题)统一往下推 1.2px |
| `GRID_ID` | **`md-grid`** | `shapes/grid-pattern.ts` | 底纹 `<pattern>` 的缺省 id。**一图铺两种网格 / 同页多张带网格的图必须各自给 id** —— 重复 id 下 `url(#md-grid)` 全解析到第一个定义(实测四格整片渲染成第一种) |
| `measureText` 常量 | `0.6em / 1.4 / 1.015 / 0.03` | `measure.ts` | 半角宽 / 行高 / 估宽安全系数 / 粗体增益 |
| `SCENE_TEXT_DEFAULTS.fontSize` | **11** | `knives/audit.ts` | 旁注(`SceneText` / `textFit` / `textNote`)缺省字号 —— 与 `SceneText` 渲染上屏(`export.ts` 的 `t.fontSize ?? …`)同源, 没给 `fontSize` 时两边吃同一个数 |
| `SCENE_OWNER_KINDS` | **`node` / `edge` / `group`** | `knives/audit.ts` | `SceneText.owner.kind` 的词表(引用本 scene 里的节点 / 边 / 组)。词表外的 `kind` 由 `owner_ref` 当场报, **不静默当"没写归属"**; 三个 kind 里只有 `edge` 拿得到豁免(见「常见误用」表的 `owner` 行) |
| `ICON_DEFAULTS` | 边长 **64** / 到盒顶间隙 **12** | `shapes/icon.ts` | 图标缺省尺寸与"图标 → 卡片"的间距。图标**画在盒正上方**(水平居中)且**不进任何净空门禁** —— 想让图标与别的格子保持距离, 靠 `cardFit` 的 `block` 留位(作者决策), 别指望门禁喊 |
| `CARD_WEIGHT` | **400** | `knives/fit.ts` | `cardFit` 算盒时的基底字重。**渲染必须写同一个数**(`SceneNode.weight`) —— 节点缺省 600, 400/600 的估宽差 **3%**, 不同源就是"盒按一个字重量、字按另一个字重画" |
| `LABEL_BOX_DEFAULTS` | 字号 **11** / padX **3** / padY **1** · 行高口径 `MASK_ROW_INK_EM` **1.15**(墨迹) | `shapes/edge.ts` | 标签遮罩片**尺寸公式的唯一一份系数**(上屏那块与 audit 的 `labelRect` 同吃它)。要"这块标签多宽"只走 `labelBoxSize(content)`。**宽 = 最宽一行 + 2×padX · 高 = 行块并集 + 2×padY**, 行高取**墨迹**(`fontSize × 1.15 × 安全系数` = 11 号 12.8), 不取 `measureText` 那个 1.4em 行盒(11 号 = 15.6) —— 后者是**行距口径**服务多行 pitch, 含上下各 ~0.2em 空白, 给遮罩就是"盒按排版行盒给、字按墨迹画"。单行 11 号 = 12.8 + 2 = **14.8**; 多行 = `(n−1)×gap + 12.8 + 2`, gap 仍 `lineGapEm × 字号`。⚠ 三轮换代改过字节(19 → 23.6 → 19.6 → 14.8), `examples/images/*` 已重出; **节点外盒 / `textFit` 不受影响**(它们仍吃 `measureText` 的行盒) |
| `PAIR_GAP` | **22** | `knives/route-pair.ts` | 成对双线的**中心距**(线到线) —— 够放一个 11px 标签 + 两侧各一点呼吸位 |
| `PAIR_LABEL_GAP` | **14** | `knives/route-pair.ts` | 成对标签离**自己那条线**的距离(与 `PAIR_GAP` 分工不同: 那是线距, 这是线到字; 落位 = `gap/2 + offset` 的外侧) |
| `SEQ_DEFAULTS` | 列距 **132** / 行距 **56** / 盒净空 **18** / 标签净空 **12** / 首行留白 **52** / 尾量 **56** / 环 **36×30** / 端点间隙 **7** | `templates/sequence.ts` | 序列图骨架的版式缺省; **列距与右缘还会被"标签宽"顶开**(逐格取 max), 别拿 132 当"一定够" |
| `LAYERED_DEFAULTS` | 盒距 **56** / 盒高下限 **0** / 行距 **56** / 层内边距 **40** / 层间走廊 **96** / 腰线留白 **16** / stub **18** / 画布留白 **40** | `templates/layered.ts` | 分层带骨架的版式缺省; **层距还会被"内容高 + 走廊腰线条数"顶开**(两条约束竞争, `plan.gaps[].by` 指名谁顶开的), 别拿 96 当"一定够"。⚠ `nodeH: 0` = 盒高只吃 `nodeFit` 内容下限 —— 版式行高是作者旋钮, 不是缺省 |
| `LIFECYCLE_DEFAULTS` | 列距 **200** / 盒净空 **24** / 带内行距 **28** / 带间走廊 **104** / 跨度余量 **16** / 段标签↔段带缘 **12** / 分隔线抬升 **40** / 段标签抬升 **22** / 标签净空 **12** / 横段错开 **14** / 回边净空 **16** / 走廊↔分隔线净空 **40** / 图例引导 **48** / 图例预留 **0** / 画布留白 **40** | `templates/lifecycle.ts` | 状态机 / 阶段带骨架的版式缺省; **列距会被五类需求顶开**(盒宽 / `colGapMin` / 标签宽 / **跨列段带声明** / **回边竖走廊净空** —— 逐格**累积**取大, `plan.needs[].by` 指名谁顶开的), 别拿 200 当"一定够"; **带间走廊**同理(下限 104, 不够时按"标签 + 通道 + 分隔线"反算顶开)。⚠ `legendReserve: 0` = 图例是调用方义务(模板只给 `plan.legendAnchor` 的位, 一个图例节点都不出) |
| 网格底纹 `opts.grid` | 线: step **10** / 线宽 **1** / opacity **0.1** · 点: step **10** / 直径 **2** / opacity **0.2** · 墨色 **#999999** | `shapes/grid-pattern.ts` | ① **paper 主题自带一层**(`Theme.grid`), 不写也有; `opts.grid` 逐字段盖它(只写要改的那位), `false` 关掉 ② 深浅精度是 serialize 的 1 位小数档(写 `0.06` 变 `0.1`) —— 要更细**只能**把 alpha 编进 `color`(`#9999991a` / `rgba(153,153,153,0.06)`, rsvg 两种都认) ③ `width` 是**视觉**尺寸: 线宽内部声明 2 倍(平铺裁掉 tile 外那半) ④ 它不进 scene, 不参与 audit |
| 外部素材 `embedAsset` | id 前缀 = **`name`**(不给名字则 `emb-`) · 嵌套 `<svg>` 的 `preserveAspectRatio` 恒为 **`xMidYMid meet`** | `embed/svg-asset.ts` · `serialize.ts` | ① **同一张图放两份素材必须给不同前缀**(echarts 的 id 从 `zr0` 起算, 同前缀时 `url(#…)` 全解析到第一份定义上 —— 与网格 `pattern` id 串台同族) ② `meet` = contain: 宿主矩形与素材 viewBox 宽高比不同时**居中留边**, 不会拉伸; 想不留边就按比值给 `w/h` ③ 素材**不进任何净空门禁**(与图标同档), 只进 `contentBounds` / `single_svg` / 读数板 |

## 素材库(图标 / 图表底板)

两处素材都**不进净空门禁**, 也不进 `src/` 的运行时依赖链 —— 它们是"构建期读一次、写进 scene 的纯数据":

- **图标**: 来自 npm 依赖 `lucide-static`(ISC; kebab-case 名, lazy 单图标读盘, 不 vendoring 进仓)。取素材走 `iconAsset('plane')`(⚠ 从 `.../icons/lucide` 引, 它不在 barrel); 按概念找名 `findIcon('airplane')`(读包内 `tags.json`)。
- **图表底板**: `assets/embeds/echarts-{bar,line,pie,scatter}.svg` 四张现成素材, 喂 `embedAsset` 进 `scene.embeds`(版式与坑见 `refs/recipes.md` §12; 来源与许可见 `assets/embeds/LICENSE-APACHE-2`)。

## 坐标纪律(`fit` 会平移, 不会缩放)

- `routeOrthogonal` 出的是**你给的盒坐标**下的折点列。`audit(scene)` 直接审这份 —— **排查几何时用它**。
- `exportScene(..., { fit: true })` 是 **先平移、再 audit**: 平移量 `pad − contentBounds.x/y`, 只动原点, **不缩放、不改任何相对几何**。
- ⇒ **几何判决与手工 audit 一致**。唯一会变的判据是 `single_svg` —— 画布跟着内容重算, 越界自然消失(这正是 fit 的目的)。
- ⇒ 但 **诊断 `evidence` 里的坐标是平移后的**。拿 `exportScene` 报的 `[17,17,160,46]` 去对照脚本里的 `rect.x = 300` 会对不上 —— 要按原坐标排查就**直接 `audit(scene)`**。

## 交付尺寸: 根 `<svg>` 的 `width` 就是读者看到的大小

交付件是 SVG, 进帖 / README / deck 时按**容器宽**缩(只缩不放)—— 一张 `width="844"` 的图放在 700px 宽的栏里, 13px 的正文字号实际渲染成 ~10.8px。**门禁全绿也救不了这件事**: 没有任何判据看"字会不会被缩到读不动"(`single_svg` 只管越界)。

- 经验档: **自然宽压到 ≤900**。超了就减文案 / 换纵向版式, **不是**加宽画布 —— 加宽只是把字缩得更小
- 出图后顺手读一眼: `head -c 120 out.svg`(根元素的 `width=`), 再决定要不要重排

## 语义槽怎么选(tone / variant / struck / noCheck)

角色进 scene, 例外进覆盖表 —— 判据就这一条。**肤色 / 强调不进审计**(颜色不是几何事实), 所以这几位全凭作者判断。

| 你想表达的 | 写什么 | 说明 |
|---|---|---|
| 这一格是**哪一类东西**(类型 → 肤色) | `SceneNode.tone` / `SceneGroup.tone`(7 档) | 语义槽, 跟几何一起进 scene; `tone` 不给就沿用主题缺省 |
| **唯一主角 / 当前焦点** | `variant: 'solid'` | 只给它一个, 想强调第二个就忍住 —— 架构图那张全图只有两处 solid |
| **角色框**(上下文 / 状态; 学术风) | `variant: 'tint'` | 浅色底 + 深一档描边。三档语义: `outline` 默认 / `tint` 角色 / `solid` 强调 |
| **这格被废除** | `SceneNode.struck: true` + `opacity` | 红 X + 淡化; 叉线不参与净空审计(它没有合法注入点) |
| 旁注要**加粗 / 上色** | `SceneText.weight` / `color` | 缺省 `theme.label` / 400 |
| 边标签的字色要**跟着这条边的肤色**走 | `edgeLabel({ id, points, tone }, text)`(边带 `tone` 就继承)或 options 的 `{ tone }`; 单点例外走 `{ color }` / `{ bg }` | 烘焙期写进 `SceneLabel.tone`, 出口取 `tones[tone].text` —— **文字槽**, 不是边线那个 `border` 槽(线是描边、字是填充, 浅色系 border 当字色看不清)。三个模板已接线(`sequence` / `layered` / `lifecycle` 的 `tone` **一处给全**, 线与标签共用同一个值)。⚠ 遮罩片缺省**与画布同色 = 隐形**(只剩"切断穿过的线"的本职), 要徽章观感才显式给 `bg`; `labelChip` 是徽章语义, 缺省仍 `theme.labelBg` |
| 这条线是**版式基准线**(泳道线 / 坐标轴 / 分隔线) | `SceneEdge.noCheck: true` + 样式里 `end: 'none'` | 豁免面**只有穿盒一档**; 不写 `end: 'none'` 会在右端长出一个三角 |
| 这个框是**纯视觉分区**(band / region, 泳道线横穿是常态) | `SceneGroup.noCheck: true`(别写 `contains`) | 写 `contains` 会被 `cluster_border_clearance` 判成"切断分组" |
| **单点例外**(这一格就是那个颜色) | 出口覆盖表 `nodeStyles` / `edgeStyles` / `groupStyles` | 逃生口, 优先级永远最高 —— 但"角色"该写在 scene 里, 别让"哪一格是什么角色"只活在一张按 id 索引的表里 |

## 行内标记(一行字里的四种样式) — 260925

任何**文字内容串**里都能写字面标记(`label` / `sub` / `SceneText.text` / `edgeLabel` 的 content / 组框标签): 三个渲染面(节点标签 / 边标签遮罩片 / 旁注)与度量面(`measureText` ← `label_fit` / `nodeFit` / `labelBoxSize`)**读同一份 run 表**, 所以量出来的宽就是画出来的宽。

| 写什么 | 效果 | 例 |
|---|---|---|
| `**粗**` | 粗体。**唯一会改宽**的标记(推进宽 +3%), 档位 `max(行字重, 600)` | `Object Type: **Airport**` |
| `*斜*` | 斜体(`font-style`)。最长匹配: 先认 `**` 再认 `*` | `*见附录 B*` |
| `~~删~~` | 删除线(`text-decoration` 属性, 不画线) | `~~旧接口~~` |
| `[字]{accent}` | 这段字**着色**: `{…}` 里是 tone 名(`slate` / `blue` / `emerald` / `amber` / `rose` / `violet` / `teal`, 取该族的**文字槽**)或直接写 `#hex` / CSS 色 | `[危险]{rose}` / `[注]{#b91c1c}` |

四条规矩(每条都有反证用例):

1. **成对才作数, 落单退字面量** —— `a ** b` 里的星号**留在图上**(看得见, 于是自己暴露), 不吞字符、不抛错
2. **标记紧贴内容**(开标记右边、闭标记左边不能是空白) —— 通配符 `agent/* 与 tools/* 瀑布` 是两个星号, **不是**一段斜体。要写紧贴空白的字面星号用 `\*`
3. **转义**: `\*` `\~` `\[` `\]` `\{` `\}` `\\` 拿掉反斜杠留字符, 且该字符不参与配对
4. **嵌套只认不交叉** —— `**粗 *斜* 粗**` 两条都在(样式合并); 交叉(`*a **b* c**`)时**内层那个开标记退字面量**

样式**从不改变文本长度**(`runs.join('') === plainText(text)` 是硬不变式), 斜体 / 删除 / 着色也**都不改宽高** —— 只有粗体那截吃掉 3% 推进宽。定位靠 `TextRun.start/end`(原串下标): 报"第几列写歪了"用得上。

```ts
nodeShape({ x, y, w, h, label: 'Status: **ready** · 见 [附录]{blue}' })
edgeLabel(edge, '**过审** 才往下走')          // 边标签一样认(旧版这里画的是两个字面星号)
```

新增一种样式只改 `geometry/inline-text.ts` 的 `INLINE_STYLE` 表一处(标记 / 加宽 / 渲染属性同一处声明)。上屏入口是 `shapes/inline.ts` 的 `inlineTextRow` —— **别再手写第二份 `<tspan>` 拼装**。

## 诊断怎么读

每条诊断 = `code / severity / message / subject / evidence / supportedFixes`。**`evidence` 里已经是原始数值, 不要手算**:

```jsonc
// 标签净空不足(实测输出)
{"edgeId":"e3","clearance":0,"threshold":4,"labelAt":[220,160]}
// 节点文字装不下(实测输出)
{"field":"label","content":"…","textWidth":146.8,"available":128,"overflow":18.8,"inset":10,"nodeRect":[40,60,148,31]}
```

`supportedFixes` 是**可执行修法**(带 `kind` 与可选 `patch`), 照它改, 不要猜。

**诊断是一张按 `(code, kind, id)` 排的平表** —— 要"看清哪条挂在哪个对象上"用读数板(`describeScene` / `scripts/inspect.ts`), 它把诊断挂回对象旁边, 并顺带打出该对象的真实坐标。

⚠ **`metrics` 里的 `-1` = 没有测量对象, 不是"合格"**。例: 标签压自家边时 `min_label_clearance = -1`,
因为 `ownerEdge` 让自家边豁免、没有可测对象 —— 它既不报错也不代表"净空无穷大"。
同族(260923): 旁注声明了 `owner` 指向某条边时, 那条边也退出它的可测集合 —— 一段字只压在自家边上
就是 `min_text_clearance = -1`(`owner_ref` 那格反过来: `0` = 引用全对得上, 不是"没测")。

## 候选折线哪条更好

`routeCost` 是读数, 不是门禁。维度表、门槛从哪来、怎么加一维, 都在 `README.md` 的 `knives/route-cost.ts` 段。

**改择优不用记得跑什么** —— 288 组端口×盒位×lane 的逐字节基线住在 `test/route-pick-equivalence.test.ts`, `bun run verify` 里就带着它: 任何静默改择优当场红。差异是想要的再重写基线:

```bash
UPDATE_BASELINE=1 bun test test/route-pick-equivalence.test.ts
```

## 三套符号对照(同一个"边距", 三个方向)

盒子往哪边让出距离, 三处口径**各不相同** —— 拿错方向就是图上一像素不差的错位(门禁还照样全绿):

| 符号 | 长在哪 | 正数朝哪 | 反向 / 备注 |
|---|---|---|---|
| `offset` | `rectFace(r, side, { offset })` | 沿该面**朝外**法线(`sideDir`): 底面往下 · 顶面往上 · 左面往左 | 负 = 朝内(左缘往里 12 写 `{ offset: -12 }`) |
| `pad` | `insetRect(r, pad)` · `bounds(rects, { pad })` | **边界给内容让出的空档**: `insetRect` 收边界(内缩) · `bounds` 放边界(并集外扩, 框把 children 包住) | 负 = 反向; 可给 `[x, y]`(左右 / 上下) |
| `expandRect` | `vec.ts` 的 `expandRect(r, by)` | 只缩放盒本身, **向外**扩 | 负 = 内缩; 只吃单值 —— 与 `pad` 方向相反、名字也不同, 三者不许互相代用 |

一句话记: `offset` 是**点**沿法线挪, `pad` 是**盒与内容之间**留白(看清楚"边界"是哪个), `expandRect` 只动盒子尺寸。

## box / grid / pack

九点锚、面上的点、`bounds` 对 `fitGroupFrames` 的二选一留在下面 (这是拿错就全绿但错位的部分)。函数签名见 `README.md`。

九点锚名(y-down): `nw` 左上 · `n` 上中 · `ne` 右上 · `w` 左中 · `center` 心 · `e` 右中 · `sw` 左下 · `s` 下中 · `se` 右下。锚点查询叫 `rectAnchor` 而**不叫** `rectAt` —— `PortRef.at` 是绝对坐标, `at` 一词不许两义。
面上点只有一份: `rectFace(r, side, { t, at, offset })` = `portPoint` 加 `offset × sideDir` —— 它**不另起端口协议**(`t` / `at` 与 `PortRef` 同源)。

### `bounds()` 还是 `fitGroupFrames`?(框从哪来 —— 二选一, 不留第三条路)

| 框是什么 | 走哪条 | 写法 |
|---|---|---|
| **版式本身**(先定框, 内容往框里摆; 泳道横铺全宽 / region 到 x=N 为止) | 构建期 `bounds()` 算盒, 写进 scene | `{ id, rect: bounds(children, { pad })!, frame: 'declared', contains: [...] }` |
| **跟随内容**(内容先摆好, 框是结果) | 让 `fitGroupFrames` 派生, **禁止手写** | 组框 `rect` 给个占位, 交 `fitGroupFrames(scene)` 刷 |

两个反模式(误用表也点名): ① 用 `bounds()` 算完**再**交给 `fitGroupFrames` 派生 = **pad 两次**(算出 28, 派生再吃一次 28 = 56); ② 用 `bounds()` 绕过 `fitGroupFrames` = 组框与成员**脱钩**(成员挪了框不动, membership 自洽那四条门禁的前提没了)。

## 版式原语怎么选

签名和示例在 `README.md` 的 `box` / `grid` / `pack` 段。画图时只记这几条:

- **两轴都等距 → `grid`; 只在一个轴上等距、尺寸可以参差 → `pack`。** `grid` 不是默认版式, 硬套会把作者决策抹平。
- **`hGutter` / `vGutter` 是缝的正中**, 不是「这里一定放得下」。缝里常常要排基准线 + 标签 + 折线三层。
- **`pack` 的 `x` / `y` 是对齐线**, 不是左缘 / 顶边。`align: 'center'` 时它是每项的中心线。
- **`pack` 构建期造 rect, `nudge` 事后微移**, 两件事不合并。
- **已经摆好的盒子只差对齐 / 等距 / 吸附 → `nudge` 三刀**(`align` / `distribute` / `snap`): 只动 `x`/`y`, 不改宽高与拓扑, 非法输入**整体拦停**(不给半成品)。它修的是"手摆出来的 ±2px 抖动", 不是"版式不对" —— 版式不对要重排(见 `refs/recipes.md`)。

## 常见误用(左边都实测踩过)

| ✗ 这么写 | ✓ 应该 | 后果 |
|---|---|---|
| `fromPort: { side: 'bottom', at: 0.9 }` 当比例用 | `t: 0.9`(比例) 或 `at: <绝对 px>` | `at` 是**绝对坐标** → 端口落到 x=0.9, 边横穿整张图(实测) |
| `nodeFit({ fontSize: 12 })` 算盒, 节点不写 `fontSize`(缺省 13) | 同源: 两边都 13, 或都 12 | 盒宽差 **11px** → `label_fit` 报溢出 **18.8px** |
| 按 `standard` 算盒, 按 `showcase` 出图 | `nodeFit({ level: 'showcase' })` | 可用宽差 8px → `label_fit` 照样溢出 |
| 只打 `d.code: d.message` | 连 `d.evidence` 一起打 | 净空 `0.00px` 的原始矩形本就在 evidence 里 |
| 布局靠心算 / 自己写 debug 脚本 dump rect | `describeScene(scene)` 或 `bun run scripts/inspect.ts <file>` | 按 `curY += 180` 累加而盒高实为 **229** → 四个框互叠, 只好临时写脚本 dump rect 对坐标 |
| 端口**有语义**(每条边必须从自己的口出)却全写**同一个** `lane`(或都不写) | 整束交给 `assignLanes(reqs)` | 端口摊开时中段共线是**真丢信息**(读者追不出哪条进哪条出)→ `edge_overlap` error(实测 5 条边报 10 条); 手算 N 个值要同时满足"各自可行域 + 两两错开", 于是人**放弃画边** |
| 一束 fan-out 边都吃**同一个**端口, 看到"共线了"就想一条条错开 | **什么都别写** —— 那是主干 + 水平总线, 门禁认得(「分叉 / 汇合」豁免) | 共享端点模式下"自动中线全相同"是**特性**不是事故: 零手工长出树形图(260920)。错开掉反而得到一束挤成一团的平行线(三态对照见 `examples/checks/lanes-fanout.ts`) |
| `via` 点离盒边 < 18px | 挪到 stub 之外 | 吐自重叠折线(先走满 stub 再回退) + `viaInfeasible` |
| 同层多列组框(并排的几栏), 列距 ≤ 56px | 列距 **> 56**(派生框两侧各吃 28) | 派生框**必然交叠** → `cluster_overlap` warning(实测 260919: 列距 28/30 全中招)。竖排的组间距同理要看标签占位 |
| 组框里想"框顶多留一点给标题" | 要么 `frame: 'declared'` 手工给框, 要么把标题挪到 `'outer'` | 派生框的顶永远是 `成员顶 − 28`; 想留 40+ 给 inner 标题只能声明框(否则标题压节点 → `text_overlap`) |
| `bounds(children, { pad })` 算完框**再**交给 `fitGroupFrames` 派生 | 二选一: 框是版式 → `bounds()` 算好写进组框 `rect` + `frame: 'declared'`; 框跟随内容 → 只交给 `fitGroupFrames` | **pad 两次**(算出的 28 再被派生吃一次) → 框比该有的大一圈, 成员与框线也离得莫名远 |
| 用 `bounds()` 绕过 `fitGroupFrames`(成员后来挪了, 框没跟着动) | 内容先摆好就该派生: 组框 `rect` 给占位, 交 `fitGroupFrames(scene)` 刷 | 组框与成员**脱钩** —— membership 自洽与四条 cluster 门禁的前提没了 |
| 把 `metrics` 的 `-1` 读成"通过" | `-1` = 未测量 | 把"没量"当"没问题" |
| `catch` 后正常返回 | `process.exitCode = 1` | 门禁在 shell 层失效, `&&` 链揣着坏图一路过 |
| `> out.svg 2>&1` | 诊断走 stderr, 图走文件 | 诊断霸占文件头部, 且 **exit 0** |
| 菱形节点给 `t: 0.3` 摊多条出边 | 菱形只有四个**面中点**落在轮廓上, 一个面一条边; 三路分叉交给矩形 | 端点跑到菱形外的空气里, 边像悬空长出来 |
| 改 `SceneEdge` 想给边加虚线 / 换端点形态 | `tryExport(scene, { edgeStyles: { e1: { dash, width, end } } })` | `SceneEdge` 只有 `id/points/from/to/label/tone` —— 那四项在 scene 里没处放。⚠ `edgeStyles` / `nodeStyles` / `groupStyles` **都是 `ExportOptions` 的字段**: 写进 `Scene`(或喂给 `exportScene` 的第二个参数以外的地方)**不报错也不生效**, 产物只是悄悄退回主题默认值 —— bun 不做类型检查, 只有 `tsc` 报 `TS2353`(260920 实测踩中两次, 产物"看着正常"骗过了肉检) |
| 想给节点"浅色强调底"(角色框: 上下文/状态/当前步) | `variant: 'tint'`(**语义槽**, 进 scene 或覆盖表) | 学术图三态 outline/tint/solid 的中间档(260919): tint 填充 + solidBorder 深描边; 只有 outline/solid 时要么太素要么太重 |
| 节点标签 / 旁注 / 边标签要两行 | `label` / `sub` / `SceneText.text` / `edgeLabel` 的 content 里直接写 `\n`(260920 起渲染同拍拆行, 与 `label_fit` / `nodeFit` 同源; **边标签 260923 接通**, 旧口径"遮罩片只吃一行"已废) | 此前"审计认可、渲染不拆"是欠账, `sub` 那份是同病灶的第二半(度量子按行、渲染发整串 ⇒ 盒窄字宽且**门禁全绿**)。⚠ 边标签多行**改了字节**: 检测盒高换了公式 ⇒ **所有 `edgeLabel` 产物的字节都变了**, `examples/images/*` 已重出(数与来龙去脉见缺省值表的 `LABEL_BOX_DEFAULTS`)。活体: `examples/gallery/academic-figure.ts` 的 `loop` —— 双行说明从两条 `SceneText` 收回 `labels[]`, 代价是 `SceneLabel` 没有 `weight` 槽、主/次字重差随之消失(明写的取舍) |
| paper/mono 主题里写 Unicode 下标(ₜ/₋₁) | LaTeX 记法(`o_t` / `Σ_{t-1}`) | mono 字体 + rsvg 管线**没有字形回退**, 实测 tofu(260920) |
| 想画 phase band / region 这类**纯视觉分区框**(泳道线横穿是常态) | `SceneGroup.noCheck: true`(别写 `contains`) | 缺位时 `cluster_border_clearance` 把"泳道线横穿 band"判成切断分组(实测 12 条 error) —— 组框语义是"这些属于一伙", 纯版式框不成立, 得显式豁免 |
| 想换全局字体 | `THEMES.<mode>.fontFamily`(主题级)或出口 `opts.fontFamily`(覆盖) | 三级取值: 出口覆盖 → 主题槽 → sans 栈; 内置 light/dark 无槽, 字节不变 |
| 想画"这格被废除"(ghost) | `SceneNode.struck: true`(红 X 语义槽) + `opacity`(淡化), 进 scene | 裸装饰函数在 `sceneChildren` 唯一映射下**没有合法注入点**; `struck` 由出口统一渲染, 叉线不参与净空审计 |
| 想在 `Scene.texts` 里上色 / 加粗 | `SceneText.color` / `weight`(260919 进 scene) | 此前 `SceneText` 没有色槽只能绕小节点; 现在标题/警示注直接写(缺省仍 `theme.label` / 400, 老产物字节不变) |
| 边标签比两端节点的间距还长 | 缩标签, 或把这段间距拉到 > 标签宽 | `text_overlap`: 标签同时压住两端节点(实测间距 132px 装不下 157px 的标签) |
| 盒宽/列宽手定一个"看着舒服"的数(如 392) | `Math.max(...全部内容 fit.w) + 16` —— 两列等宽就取全局 max | ⚠ **门禁只查"装不装得下", 不查"空不空"**: 实测列宽手定 392 而内容只需 263 → 每格左右各空 96px, 而 audit **0 error / 0 warning 照样全绿**。这是 aesthetics 说的"门禁管不着的那半"的又一实例 —— **唯一发现手段是栅格化后目视** |
| `new URL('./x.svg', import.meta.url).pathname` 当落盘路径 | `fileURLToPath(new URL('./x.svg', import.meta.url))` | `URL.pathname` 会 **percent-encode**: 路径含**空格**或 `~` 时吐 `%20` / `%7E` → `writeFileSync` **ENOENT**。磁盘上任何带空格的目录都会撞上它, 想"产物归脚本自己写"就用 `fileURLToPath` |
| 序列图给消息边写 `from`/`to`(想表达"这条消息属于谁") | 留空; **泳道线**才写 `from`/`to` | `port_crowding` 的 `shared_projected_port` 把"端点在盒外"读成手写错误 —— 而序列图的端点天然在盒外: 实测 8 条消息报 **9 条 error**(端点相距 392px 也照报)。走 `templates/sequence.ts` 不会撞上 |
| 一条边是**版式基准线**(泳道线 / 坐标轴 / 扫描线): 撞上节点是常态, 那条判据对它根本不成立 | `SceneEdge.noCheck: true`(260920) | 缺位时 `edge_node_clearance` 把"泳道线被自己的装饰骑住"读成"线压着盒子走"(序列图激活条实测 3 条 error, 穿透 392 / 112 / 56px)。⚠ 豁免面**只有穿盒这一档** —— 正交 / 折回 / 端点贴盒 / 共线 / 端口拥挤与文本可读性全照旧, 它不是免死金牌(举证 `test/edge-no-check.test.ts`) |
| 序列图要画**激活条**(泳道线上的纵向圆头竖条: "这一列这段时间在忙") | `templates/sequence.ts` 的 `activations: [{ actor, from, to }]` —— **消息下标**区间, 不是像素 | 手写的话三件事都得自己算: 条的 y 由起止消息行反算 · **该列 lifeline 必须标 `noCheck`**(条骑在线上) · **`barW/2` 要小于 `msgInset`**(否则消息端点落进条里)。⚠ 层序固定"边在节点之上", 所以那截泳道线**看得见**地走在色条中央 —— 要彻底看不见只能把 lifeline 按条区间分段(代价: 一条泳道线在数据里碎成 N 条边) |
| 一张图里并排铺**两种网格**(或同页 inline 多张带网格的图) | 每处显式给 `id`(`opts.grid.id` / `GridProps.id`) | 缺省 id 一律 `md-grid`, 而**重复 id 下 `url(#md-grid)` 全解析到第一个定义** —— 实测 `examples/labs/style-lab.ts grid` 四格(线10 / 线8 / 点14 / 点10)整片渲染成**线 10**, dot 格纵向量到的间距是 10 不是 14。⚠ 一图只铺一种网格时最常见的写法(不传 id)没事 |
| 用 `SceneEdge` 画**分隔线 / 泳道线 / 坐标轴**(不是关系边) | ① `noCheck: true` ② 样式里**必须写 `end: 'none'`** | `edgeShape` 的缺省端点是 `arrow-triangle` —— 不写就在基准线**右端长出一个三角**(260920 实测: 三条段落分隔线各长一个)  |
| 关系边**走在基准线上**(候选线 / 泳道线 / 分隔线是同一条几何线 —— 比如管道网格的 pipe、时间线的轨) | ① 基准线是**候选线**: 关系边占走的那一段**就别画基准线**(按区间挖断, 断口 ≥7px, 让关系边"点亮"那一段) ② 基准线是**版式分区**: 让关系边错开 **≥8px** | 两条同向共线重叠 ≥8px 就是 `edge_overlap` **error**(画成一条, 信息丢了); 同向近平行(垂距 >0 且 <7px、投影重叠 ≥8px)是同码的 **warning** 档 —— 相邻太近同样读成"贴着基准线跑"(活体段注 `examples/gallery/lifecycle-agent-run.ts:226`, 那是 lane 落在分隔线 12px 外的实测记录)。⚠ 挖断只改"哪几段画", 折点列一字不动(它仍是 `routeOrthogonal` 吐的那份) |
| 想画"阶段带"(lifecycle / 状态机的段落) | ✅ 有骨架: `templates/lifecycle.ts`(分隔线 / 标签槽 / 走廊全由它算); 手写则分隔线走上面那行, **段落标签放左边槽**, 竖向脊柱要落在标签 x 区间**之外** | 脊柱落进标签盒 = `text_clearance` error(模板那条实测坑记的是同一件事)。另: 同列上下两状态之间**要留走廊**, 否则中间那条边只能绕行(参照实现的坏法; 加 `via` 绕过去门禁全绿, 所以判据在 `test/lifecycle-agent-run.test.ts`) |
| 想给画布加底纹 | `tryExport(scene, { grid: { style: 'line' \| 'dot', step, color, opacity, width } })` | `undefined` = 不铺(老产物逐字节不变); 它不进 scene、**不参与 audit**(网格是版式不是信息)。dark 主题**刻意不带**底纹, 想要就自己给(活体: `examples/gallery/lifecycle-agent-run.ts` 用 `rgba(148,163,184,0.06)` 的细线格) |

| 要按内容反算间距 / 列距 / 图例宽度: 得先知道"这块标签多宽" | `labelBoxSize(content, { fontSize?, padX?, padY? })` | 它是遮罩片尺寸的**唯一来源**(与 `edgeLabel` 上屏那块、audit 的 `labelRect` 逐字同源), 多行(260923)按 `\n` 拆行算 —— 公式与缺省系数见上文缺省值表的 `LABEL_BOX_DEFAULTS`, 高不再是"字号 + 2×padY"。⚠ **宽高口径不同源**(260925): 宽吃 `measureText`(宁宽不窄), 高吃**墨迹**行高 1.15em —— 反算列距只用宽, 别顺手把 `.height` 当成"行盒高"去用。⚠ 别自己估宽(两份口径必然漂), **也别造一条假边喂 `edgeLabel` 再抠 `.width`** —— 260920 之前 `templates/sequence.ts` 就是这么绕的, 缺口已补 |
| 自建旁注(`Scene.texts`)的 rect: 拿 `measureText(整串)` 量多行文案 | **逐行量 + 走 `rowBlock`**: 宽取最宽行、高取行块并集(与 `nodeShape` / `SceneText` 的渲染**同一份堆法**), `align` 决定 rect 哪条边落在 `at` 上 | `measureText` **不拆 `\n`** —— 整串喂进去量到的是"所有行拼成一行"的宽, 检测盒比真墨迹窄, 于是 `text_overlap` / `text_clearance` 全绿而字压在别人身上(260920 自建 helper 实测踩中; 三处示例的旁注 helper 也都只处理单行)。同族: `nodeFit` 的 `lineBox` 才是"拆行量宽"那一层 |
| 想在 `Scene.texts` 里说清"这段字属于谁"(或让它别报自家边的净空) | `SceneText.owner = { kind: 'node' \| 'edge' \| 'group', id }`(`textNote({ owner })` 原样透传) | 它只做两件事: **声明归属** + **收窄豁免面**;**不做落位**(位置仍由 `rect` 说了算), 也没有 owner 继承。唯一豁免面 = `text_clearance` 里**命中 `owner.id` 的那一条边**(与 `SceneLabel.ownerEdge` 同规定) —— `kind: 'node' / 'group'` **什么都不豁免**: 那段字压在节点盒上照旧 `text_overlap`, 压别的线照旧 `text_clearance`。活体: `examples/gallery/academic-figure.ts` 的 `discard` 图注 |
| `owner_ref` error: 归属引用不存在 | 按 `evidence` 的 `ownerKind` / `ownerId` 对账本 scene 的 id(修法 `fix-owner-id` 的 hint 里会列候选 id), 或 `drop-owner` 承认这段字不归属任何对象 | 四种各报一条: 指到的 id 在本 scene 里不存在 / `kind` 不在词表(`node` / `edge` / `group`) / `id` 不是非空字符串 / `owner` 根本不是 `{kind, id}` 对象。⚠ 幽灵归属贵在**假安全感**: 豁免静静失效, 而作者以为"我配了归属、压自家边不算事", 于是去猜别的旋钮。`drop-owner` 的代价是那段字压到任何一条线都得自己让开。读数板 `texts` 行会打 `owner=<kind>:<id>`(在 `anchor=` 与 `fs` 之间, 没声明就没有) |
| 自己写 spec 驱动的函数(模板 / 场景脚本), 手上又攒出"缺省回落 + 逐个校验"的样板 | `resolveKnobs(shape, defaults, spec)` 一行收齐 | 键集由 `defaults` 决定 —— **那张缺省表就是旋钮的声明**; 只守调用方给的值, 非有限 / 负值当场抛(提示同 `assertFiniteRect`: 尺寸不是增量)。⚠ 代价: 拼错的旋钮名被静默无视(tsc 拦得住字面量, JSON 进来的拦不住, 用例 `test/guard.test.ts` 把这个代价钉住了) |
| 手工推导了落位, 却"先建 `SceneLabel` 再把 `at` 覆盖掉" | `edgeLabel(edge, text, { at })` | 先建后改等于请 core 算一个马上被扔掉的落点, 而且从调用点上看不出"这个落位是自定义的"; `at` 一给, `labelAnchor` 整段让位(也不再读 `dy`) |
| 节点带图标(图标在盒**上方**), 边却拿**卡片盒**当端口 | 端口对着 `iconInkRect(card, { size, gap })`(整块的外廓) | 线从图标身上穿过去, 而 **`edge_node_clearance` 一声不响** —— 图标压根不是节点盒、不进净空门禁。活体: `examples/gallery/ontology-icons.ts` 的 `at(id)` |
| 卡片正文不写 `weight`(节点缺省 **600** = 标题档) | `weight: fit.weight`(`cardFit` 产出 = 400) | 盒按 400 算、字按 600 画(估宽差 **3%**)→ 长行照样 `label_fit` 溢出。同族: 字号同源(`cardFit({ fontSize })` ↔ `SceneNode.fontSize`)、档位同源(`level`) |
| 同一对实体上两条关系, 手写两条边各给一个 `at` 偏移 | `routePair({ ..., gap })` + `pairLabels(pair, [关系A, 关系B])` | 手算偏移**必然不平行、间距必然不等**(实测 `at` 差 3px 就能看出来); 成对路由是"中线跑一次 + 沿法线平移 ±gap/2", **凭构造保证平行**。`pair.onFace` 报"端点滑出面"但不替你挪端口(端口是作者决策) |
| 竖线 / 斜线旁的标签横着写 | `rotate: labelAngle(pts)`(成对标签由 `pairLabels` 内置) | 竖线旁的 "Flown By" 要竖着读才顺。角度归一化到 `[-90, 90)`, **竖线一律 -90°**(文字永不倒着写)。⚠ 旋转是全仓**唯一**用 `transform` 的地方, 且审计取的是旋转后的轴对齐包围盒(`labelRect`)—— 两边读的是同一块地方, 不是双源 |
| 以为落单的 `**` 也是加粗开关(如 `Object: **JFK** (**推定**)` 之类写歪一处) | 落单的 `**` 是**字面星号**; 只有**成对**的才开关加粗 | 旧解析见 `**` 就切换: `a ** b` 会把星号吞掉、还把后半段误加粗。现在 `runs.join('') === plainText(text)` 是硬不变式(度量与渲染同一份, 见 `geometry/inline-text.ts`) |
| 想给一行字里某几个字加粗 / 斜体 / 删除线 / 换个色, 于是**拆成多个 `<text>` 元素**自己累加 x | 就在**一个内容串**里写标记: `**粗**` / `*斜*` / `~~删~~` / `[字]{rose}` | 拆成多个 `<text>` 的段间距由你的估算宽决定, 而渲染器用的是真字体 —— 两把尺子必然在接缝处露出破绽(挤在一起或裂开一条缝)。`<tspan>` 让渲染器自己接。⚠ 标记**紧贴内容**才算: `agent/* 与 tools/* 瀑布` 是两个通配符不是斜体(260925 实测: 少了这条判据, 两张既有架构图的星号被吃掉、盒宽跟着变小) |
| 素材名写 `iconAsset('plane.svg')` / 传个路径 | 名字是**不带扩展名的 kebab-case**: `iconAsset('plane')` | 拿不准概念用 `findIcon('airplane')` 找名字, 全量名字走 `iconNames()`(读包内 `tags.json`); 传错当场抛而不是给你一个空图标 |
| 自己的 SVG 素材里有 `<g>` / `transform` | 先拍平(Inkscape / `svgo --pretty`), 或换一张 | `parseIconSvg` 见到就抛 —— 静默跳过等于画出一个**少几笔的图标**, 而图上没人看得出丢了一根线 |
| 一整幅外部 SVG(echarts 图表)也想喂 `parseIconSvg` | 走**素材链**: `embedAsset(svgText)` → `scene.embeds`(嵌套 `<svg>`, 内部标记原样透传) | 那套解析器只认七原语且零 `<g>` / 零 `transform` —— 实测 echarts 四份产物**全在第一个 `class` 属性上抛**。别为一条支路把它撑开 |
| 两个素材(或同一张图放两份)不给前缀 | `embedAsset(svg, { name: 'left' })` / `{ idPrefix: 'left.' }` —— **各给不同的** | echarts 的 id 从 `zr0` 起算(`id="zr1-c0"` + `url(#zr1-c0)`), 同前缀时 `url(#…)` 全解析到**第一份定义**上: 看着两张图各画各的, 实际第二张的裁剪/引用全走第一张 |
| 想"顺手把素材的 markup 重新缩进一下"(为了产物好读 / diff 好看) | **一个字都别动** —— `serialize` 对它不做任何格式化 | `<text>` 元素内部的首尾空白会真影响渲染: 给居中标签插一个换行, 文字就被推偏一格, 而图上没人看得出这是"排版美化"干的 |
| 手搓 `Scene` 时把素材摆上屏, 却只顾着给节点 / 边算包围盒 | 素材的 `rect` 也要进 `contentBounds`(用 `exportScene(scene, { fit: true })` 就自动带上) | 少了它 `auto-fit` 会把整块图表裁掉; 而素材不进净空门禁 ⇒ **没有任何门禁会喊**(只有 `single_svg` 在越出画布时报, 而 fit 之后它也没了) |
| 以为"素材进了 scene 就有人管它压没压着别人" | 别指望 —— 素材**不进任何净空门禁**(与图标 / 网格底纹同档), 边与标签压在图表上现在**无人管** | 想让线与图表保持距离是**作者留位**(面板列距 / 端口位置); 这条缺口记在 `ROADMAP.md`, 要收口得先按纪律 9 举证 + 纪律 11 给旋钮 |

## 动手前

写第一个坐标之前逐条回答, 答不出来就别动笔。答案落进 scene 注释, 收尾时当白名单。
`refs/aesthetics.md` 是这套问题的理论草案, 阈值没校准, **不许按它写门禁**, 也别把它当阅读路径。

1. **主路径**是哪条链, 够不够直
2. **方向**: 主流向从左到右还是从上到下, 全图是否一致
3. **分层**: 几层、每层放什么。主轴一定下来, 组框标题必须整段落在主轴某一侧, 否则 `inner` / `outer` 都会被竖杆穿过
4. **分组**: 每个框是语义边界还是装饰。装饰 (band / region) 用 `noCheck`, 别写 `contains`
5. **主角**: 视觉焦点是谁。`solid` 只给它, 还想强调第二个就忍住
6. **规模**: 单层或组内扫不扫得完。超了拆图, 不硬塞
7. **画布**: 纵横比配不配得上拓扑。自然宽见上文「交付尺寸」, 经验档 ≤900。加宽画布只会把字缩得更小
8. **分叉的端口有没有语义**。没有 → 共享端点, 什么都不写。有 → 端口摊开 + `assignLanes`。判据只有一条: 读者能不能沿线追出哪条进哪条出 (`refs/recipes.md` §4)

收尾: 对一遍上面的回答 → `audit` 全绿只是地板 → density 警示里, 设计期声明过的跳过, 没声明的问一句是漏写还是没想到 → `scripts/svg2png.sh` 看一眼。警示不是命令。

## 边界(别越界)

- **core 不猜意图** —— 层序 / 端口 / 折点 / 分组全是作者决策; `via` 是**声明**不是避障
- **有些墨迹天生不进门禁** —— 图标 / 网格底纹 / `struck` 叉线都不进净空审计(它们是压在版式上的墨迹, 不是参与排版的对象)。要是图说"这两块别贴太近"就自己用 `cardFit` 的 `block` / 列距留位 —— **别指望门禁替你喊**
- **门禁审不到的东西别指望它** —— 忘记重测 HTML 走 `sceneStatus`; 出图后顺手 `grep NaN 产物`
- **择优不是门禁, 门禁也不是择优** —— 前者回答"哪个更好"(不拦出口), 后者回答"能不能出"(不排先后); 别拿代价向量当第二道门禁, 也别指望门禁告诉你"这条边画得丑"
- **只有改内核时才读源码** —— 出图遇到问题时先查本页; 图型看 `refs/recipes.md`, 函数看 `README.md`。三处都没有才是内核缺口, 记进 `ROADMAP.md`, 不要硬猜
