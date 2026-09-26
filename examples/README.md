# examples/

> 本仓的**出图示例** —— 每个示例证明一件事。想知道"某个图型该怎么起手 / 某个旋钮怎么转",
> 在这里按桶找。API 看 `../README.md`, 缺省值和误用看 `../QUICKREF.md`, 这里只讲**图**。

## 桶表

`bun run examples/<file>` 逐条可跑;**键名**(下面表格第一列)就是 `bun run examples/manifest.ts` 的名字,
也是 `scripts/build-example-pngs.sh <键名>` 的选择器 —— 一处改名三处同步是过去的老毛病, 现在只有一份清单
(`examples/manifest.ts`, 机读走 `--tsv`)。

> ⚖ **本表与清单的同步由 `test/examples-manifest.test.ts` 看着**(逐键一致 / 文件落盘 / 快照已出 /
> 脚本里没有第二份 ITEMS 表)。改清单不加这一表、或加了表不登记清单, `bun test` 当场红。

### start · 起手教学 —— 抄这个开新图

| 键名 | 文件 | 这张图证明什么 |
|---|---|---|
| `basic` | `start/basic.ts` | 描述符层最小路径: 直出 descriptor(**不经 scene、不过门禁**); 坐标全走派生(`nodeFit` 盒 / `packCol` 列 / `rectFace` 端点 / `bounds` 组框) |
| `full-chain` | `start/full-chain.ts` | 主路径全链 `scene → route → audit → export`; `--golden` 出 sha256 供字节对账 |

要开一张新图**从 `full-chain` 抄** —— 它的出口是 fail-closed 的标准姿势(现在收在 `scripts/runner.ts`)。

### checks · 机制对照 —— 一个旋钮/门禁的两种画法

| 键名 | 文件 | 这张图证明什么 |
|---|---|---|
| `audit-demo` | `checks/audit-demo.ts` | 门禁诊断长什么样: **四类违例** + 干净对照, 四个违例元素挨个标出 —— 节点与边**描红**(红指向真凶 `evidence.other`, 不是被点名的受害者), 标签没有 `labelStyles` 通道, 走自身 `bg` / `color` 徽章(含 `evidence` / `supportedFixes`) |
| `lanes-fanout` | `checks/lanes-fanout.ts` | fan-out 三种画法对照 —— **产物只画 ①** 共享端点(零手工, pass); ② 端口摊开并轨(10 条 `edge_overlap`, fail)与 ③ `assignLanes` 错开(pass)**不出图**, 只在 stderr 报条数 |
| `port-folds` | `checks/port-folds.ts` | 端口朝向 → 折法参考卡: 四格盒位**逐字相同**, 只换端口两面(端口是作者的旋钮) |

### gallery · 能力举证 —— 这类图 core 画得出来

| 键名 | 文件 | 这张图证明什么 |
|---|---|---|
| `node-forms` | `gallery/node-forms.ts` | 形状三态(矩形 / 菱形 / 圆柱)同框, 盒宽一律 `nodeFit({ shape })` 反算 |
| `ontology-icons` | `gallery/ontology-icons.ts` | 本体图: 图标当视觉替身 + 逐行说明卡片 + 成对双线 + 沿线旋转标签 |
| `academic-figure` | `gallery/academic-figure.ts` | 学术风(`THEMES.paper`)复刻: tint 分区 / 废除格(`struck` + `opacity`) / 多行文本 |
| `lifecycle-agent-run` | `gallery/lifecycle-agent-run.ts` | 深色阶段带图: 三段 × 10 状态 + 分岔 / 合流 / 回流(版式判据在 `test/lifecycle-agent-run.test.ts`) |
| `harness-arch` | `gallery/harness-arch.ts` | **真实规模**手排样本: 15 节点装配链路(立项实验的对照组 / 手排税测量载体, 依据见 `../ROADMAP.md`「立项依据」) |
| `embed-panel` | `gallery/embed-panel.ts` | **外部素材链**: echarts 出的整幅 SVG 当底板嵌进面板(嵌套 `<svg>`, 素材 z 序在底) |
| `stat` | `infograph/stat.ts` | **大数字块 4 块排成 2×2**: 块宽高走 `statFit` 反算 + 格位走 `grid`(统一格取最大那块), 生成图里一个手写坐标都没有; delta 标记是路径小三角(mono 字体栈下 `▲` 实测出 tofu) |
| `badge-list` | `infograph/badge-list.ts` | **编号徽章 + 列表行 5 行**: `listRowFit` 的返回面**直接喂** `packCol` 堆成一列; 徽章一图摆出 tone × variant 三档(颜色是语义槽, 哪步算"走完"归作者) |
| `heading` | `infograph/heading.ts` | **标题梯级 + 分隔线**: kicker / 标题 / 副标题三档字号只在 `HEADING_LAYOUT` 写一次(量宽与画字同一份), 每块位置从上一块底边加缝推(`below`), 一个 y 都不手拍 |
| `progress` | `infograph/progress.ts` | **blocks/ 第一件**: 两条单值进度条 + 一条三段堆叠条 —— `ratio` 是作者算好的数(kernel 不归一化), 盒交给 `packCol` 摆完再**摊回声明重画**(逐位相同), `above` / `inside` 两档标签位置都画出来 |
| `pictogram` | `infograph/pictogram.ts` | **blocks/ 第二件**: ISOTYPE 图标阵列(单行 10 染 7 / 4×5 格 20 染 13) —— `N` 与 `k` 由作者声明, 尺寸走 `pictogramFit` 反算, 素材名字在构建期经 `iconAsset` 读一次盘 |
| `anim-flow` | `gallery/anim-flow.ts` | **动画 ① 档 · 在跑**: 四条蚂蚁线走 `attrs.href` 指 path 自己的 `stroke-dashoffset`(非继承属性挂组上不动), 四环按 `begin="<id>.end"` 时序链点亮(⚠ 同步基 id 不许带连字符) |
| `anim-progress` | `gallery/anim-progress.ts` | **动画 ① 档 · 长出来**: 条宽 0 → 声明比例走 `href` 指 rect 的 `width`, 阵列前 10/15 格按 `keyTimes` 逐格 `visibility` 点亮(静态帧即末态, href 不能指块内部的 fill —— 缺口记在文件头) |
| `anim-interactive` | `gallery/anim-interactive.ts` | **动画 ① 档 · 交互轨**: `begin="click"` 点节点 → 该节点与相关边 `fill="freeze"` 亮住(只点不灭), 悬停微反馈 + 呼吸点走内嵌 CSS —— SMIL 轨与 CSS 轨各管一个属性 |

前六张(v0.1 那一族, `node-forms` → `embed-panel`)**不合并**: 图型、主题、参照源各不相同, 硬合只会得到一个"什么都有一点"的杂烩。

260925 起的五张(v0.2 排版层)是另一族: **单件组件的观感举证** —— 画的是压在版式上的墨迹, 没有可审计的
拓扑, 所以都走描述符层直出(与 `basic` 同档, **不过门禁**)。它们又是三层 API 的**递进**举证:
`stat` 只到 `statFit` + `grid` 摆格位 → `heading` 用 `below` 把块接着排 → `progress` / `pictogram` 走块契约
(`{ shape, bounds }`)让盒能被当盒摆 —— 硬合一处就把这层递进抹平了。

260926 起的三张(`anim-*`)**又是一族: 时间轴压在旧版式上**。版图与一张静态图一字不差, 产物里多出来的
只是 `<animate>` / 内嵌 `<style>` —— 于是它们同时举证了 ROADMAP 动画条 ① 档那句承诺: 动画在浏览器端跑,
**产物本身仍是静态字节**(字节确定 / golden / 门禁一条都不动)。三张各钉一个机制, 别当同一个示例的三种配色:

- `anim-flow` —— `href` 逃生舱(非继承属性只能指名道姓)+ `begin="<id>.end"` 时序链
- `anim-progress` —— 非继承属性 `width` 的 href 寻址 + 逐格 `visibility` 的 `keyTimes` 错峰
- `anim-interactive` —— 事件轨(`begin="click"` + `fill="freeze"`)与 CSS 轨(悬停 / `@keyframes`)的分工

⚠ **PNG 快照只有第一帧**(rsvg 不跑 SMIL/CSS 动画), 静态消费看到的是"末态 / 常态"—— 这正是"静态帧即末态"
那条设计的用意(产物离开播放器仍是一张完整的图)。动起来什么样写在各自的文件头; 判据在
`../test/anim-examples.test.ts`(SMIL 关键词在场 / XML 结构合法 / 两次导出逐字节全等)。

### labs · 样式矩阵 —— 缺省值就是这样定档的

| 键名 | 文件 | 这张图证明什么 |
|---|---|---|
| `style-lab-light` | `labs/style-lab.ts light` | 主题矩阵 light: 7 tone × outline/solid 的色值与对比度 |
| `style-lab-dark` | `labs/style-lab.ts dark` | 主题矩阵 dark: 同上, 核 solid 上的字还看不看得见 |
| `style-lab-grid` | `labs/style-lab.ts grid` | 底纹对照: 线格 / 点阵 × 两档密度 |

⚠ **这两半是特意合成一张的**(260920): 主题那一半核色, 底纹那一半核深浅 —— 同属"画布长什么样"的缺省值,
而 260920 起网格已进 `Theme.grid` 主缺省, 分两个文件反而把"主题 = 色 + 字体 + 底纹"割裂。
**这三个 key 都是"非出口示例"**(同一个 `style-lab.ts` 分出三档: light / dark 是主题那一半, grid 是底纹那一半):
并排对照卡, 直接出图**不过门禁**, 判据归 `test/`(这一档量的是观感 —— 观感还没有断言看着它; 而网格那一半的**产物纪律**已有判据 `test/style-lab-grid.test.ts`: 四格 id 两两不同 + 零 `transform`)。

### templates · 模板示范(源在 `templates/`, 快照仍在这一处)

| 键名 | 文件 | 这张图证明什么 |
|---|---|---|
| `sequence-demo` | `../templates/sequence.ts` | 模板层示范: 4 泳道 × 8 消息 + 3 条激活条(一次带缓存的读请求) —— 缺省主题下的模板原生观感, 对照 `archify-style` 那一档 |
| `sequence-archify-style` | `../templates/sequence-archify-style.ts` | 模板 + 后处理能到什么程度: paper + mono + 语义分色 + phase 带 + 激活条 |
| `layered-demo` | `../templates/layered.ts` | 模板层示范: 层框 + 整层锚点的跨层注入 → 15 节点装配链路排成三段分层图 |
| `lifecycle-demo` | `../templates/lifecycle.ts` | 模板层示范: 三段带 × 10 状态 + 分岔 / 合流 / 回流, 图例由调用方经 `decorate` 补 |

## 三个常跑的命令

```bash
bun run examples/manifest.ts                          # 清单(键名 / 桶 / 这张图证明什么)
bun run scripts/inspect.ts examples/gallery/harness-arch.ts --showcase   # 布局看不清 → 读一张表(不出图)
scripts/build-example-pngs.sh [键名...]                # 全量/指定出图 → examples/images/*.png
```

## 出口纪律(每个示例都守, 别再各写一遍)

1. **图走 stdout、诊断只走 stderr** —— 出图命令**永不加 `2>&1`**(合并会把诊断写进 SVG 头部, 而文件照样以
   `</svg>` 收尾、exit 照样 0: 失败长得像成功)。
2. **门禁判决落到退出码** —— 0 通过 / 1 门禁没过 / 2 用法错。
3. **门禁没过时草稿照给** —— 诊断与图是互补的两半, 少一半只能盲改。草稿带 `data-draft="1"`, 机器可查。

这三条**不再由每个示例各守一遍**: 260920 起全部收进 `scripts/runner.ts`(薄 runner)。示例的顶层保持纯几何
—— 出图调用一律在 `import.meta.main` 里, 于是 `inspect` / 将来的 web 展示 import 任何示例都不会往 stdout 吐图。

> 为什么 runner 住在 `scripts/` 而不是这里: 消费它的不只有 examples —— `templates/sequence-archify-style.ts`
> 也要。放进 `examples/` 就变成"模板层反向依赖示例层"。

## 加一个新示例

1. **想清楚"这张图证明什么"** —— 写不出这一句, 这个示例不该存在(它已经进了清单的 `what` 字段)。
2. 放对桶: `start/`(起手) · `checks/`(机制对照) · `gallery/`(能力举证) · `labs/`(样式矩阵)。
3. 出口走 `scripts/runner.ts` 的 `runScene(scene, {...})`, 调用收在 `import.meta.main` 里。
   顶层保持**纯几何**(`export const scene`), 这样读数板与 web 都能直接 import。
4. 登记进 `examples/manifest.ts`(key = PNG 名, 不许同义两名), **并补上本文件的桶表那一行** ——
   桶表是人读面、manifest 是机读面, **两处必须同一次改**(否则又长回"三份清单"那个老毛病), 最后跑
   `scripts/build-example-pngs.sh <key>` 出快照。
5. 要断言就写进 `test/` —— **判据归 test, 示例只负责展示**(断言长在示例内部时, 只有人真的跑那一次才生效)。
6. **画布按约定声明: `width: 0, height: 0` + 出口 `fit`** —— 声明值不上屏(`fitScene` 按
   `contentBounds` 重算), 手算画布是白算。现状**五种写法并存**, 这就是教训(**同一个语义五种字面量**,
   读者分不清哪个是真画布, 抓的人也就抓不住旧值): ① `0×0` + fit(`embed-panel` / `ontology-icons`)
   ② 非零魔数占位 + fit(`harness-arch` 1400×900 / `node-forms` 640×420) ③ 从 `bounds()` 现算 +
   fit(`port-folds`) ④ 手定常量且**不走** fit, 把画布自己算准(`full-chain` 的 `W`/`H`)
   ⑤ 每个分片各给一个常量、裸 `toSVG`(非出口示例 `audit-demo` 的 560×340 / 420×260)。
   ⚠ 两条代价: **读数板缺省不走 fit**(`scripts/inspect.ts` 直接 `audit(scene)`), 所以 `0×0` 在它眼里
   是"全员越界"(实测 `embed-panel`: `single_svg` 点 11 个 offenders / 画布 `[0,0]`)—— 那是
   **读数板误红**, 图本身没事(要看出口那份口径就加 `--fit`: 先 `fitScene` 再审, 与 `exportScene`
   同一次序); 而声明**非零**画布又**不走 fit** 就是真红: 内容越出声明值 →
   `single_svg` → 出口当场抛 `ExportBlockedError`。要么算准, 要么 `0×0` 交给 fit。

## images/

`examples/images/*.png` 是本仓**全部出图入口**的 PNG 快照, 由 `scripts/build-example-pngs.sh` 全量重出 ——
**别手改**(改 core 后重出一遍就是对回归的检查)。快照只留这一个目录: 源搬了家(如 `templates/`)快照也不跟走,
两个抽屉迟早漂。
