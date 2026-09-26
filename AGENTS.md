# svg-infovis · agent 须知

几何内核仓(圆角路径解算 / 几何谓词 / shapes descriptor / 字节确定的 SVG 序列化)。零运行时依赖, 仓内 bun 直跑, **对外是 npm 包**(`exports` 指向 `dist/` 编译产物)。

## 全局包链路(bun link)

本仓经 `bun link` 注册为全局包 `svg-infovis` + 全局 CLI `svginfo`, 全链是 symlink, 没有副本:

```text
~/.bun/bin/svginfo  →  ../install/global/node_modules/@watert/svg-infovis/dist/scripts/cli.js
~/.bun/install/global/node_modules/@watert/svg-infovis  →  <本仓>(~/github 是 ~/www/github 的软链)
```

消费侧另有自己 `node_modules/` 里的一条 link 指回本仓 —— 裸 import(`from '@watert/svg-infovis/knives/fit'`)只在这种已 `bun link @watert/svg-infovis` 的项目里可解析; 全局 CLI `svginfo` 只要 PATH 命中就能用。⚠ **链的末端落在 `dist/`**: link 只负责把包目录接过来, 解析走 `exports` —— 所以"链通"≠"最新", 判据见下节。

CLI 是**双运行时**: shebang `#!/usr/bin/env node`, `svginfo` 优先用 PATH 里的 `bun` 跑用户的 `.ts` 场景文件, 没有 bun 则走 node ≥22.6 的类型剥离, 两者都没有则退出码 2 并说明装 bun。

## 铁律: 改完源码必须构建, 否则消费者看到的还是上一版

- `package.json` 的 `exports` 指向 **`dist/`**(三条件映射 `types` / `import` / `default`, 逐子路径显式列举, **不用通配** —— 通配会让内部文件自动变成公共面, 违反白名单纪律)。`dist/` 是**派生产物**: gitignored、不进版本库、**一个字都不许手改**; 源码仍是唯一事实
- 「源码一存盘就立刻对所有消费者生效」这条老优势**作废**: 下游(link 过来的项目 / npm 装的用户)拿到的是构建产物 —— 改了源码不构建, 他们跑的还是上一版
- 所以「改完是否已同步」== 是否**全绿**: 每次改完源码必须跑 `bun run verify`(=`bun run build` + `bun test` + `tsc --noEmit`), 绿了才算完成。**只跑 `bun test` 不算** —— 它不看产物, 而产物才是别人吃的那份
- `prepare` 脚本让 `bun link` / 从 git URL 安装时自动跑一遍 `tsc -p tsconfig.build.json`: 消费者拿到的是刚构建的产物; 仓内改完源码则自己跑 `bun run verify`
- 源码里的相对 import 一律带显式 **`.js` 扩展名**(磁盘上仍是 `.ts`, 靠 TS 的 `.js → .ts` 映射)—— 消费侧 `moduleResolution: nodenext` 认的就是它, 新文件漏了这条, 构建产物在 node 侧直接解析不到
- 半成品没有版本号兜底、没有回滚窗口, 会当场炸到所有下游(vault 的画图 skill / vite 项目 / htmls 脚本); 发布版更狠 —— 装上就坏, 变更分级见 `refs/public-api.md`
- verify 红就是没完成, 不许交付; 汇报里附命令与结果(exit code / 通过数)
- 唯一要重新 `bun link` 的场景: 本仓**路径变更 / 重命名**, **包名变更**(260926: `svg-infovis` → `@watert/svg-infovis`), 或 `~/.bun/install/global` 被清, 或 **`package.json` 的 `bin` 目标变了** —— 那时本仓 `bun link` 重注册, 各消费者再 `bun link @watert/svg-infovis` 重建本地链。⚠ 第三条 260926 真炸过一次: `bin` 改指 `dist/scripts/cli.js` 后, 旧链还指着 `scripts/cli.ts`, 而 shebang 已换成 node, 于是全局 `svginfo` 当场 `ERR_UNKNOWN_FILE_EXTENSION: ".ts"` —— 只改 `bin` 而不重注册 = CLI 直接死, 而且只在"真去调它"时才暴露

## skill 与文档的真身在哪(260926 起)

- **分治原则**: skill 只装**画图现场用得上**的四份 —— `SKILL.md` + `QUICKREF.md` + `refs/{recipes,aesthetics}.md`, 真身全在 `skills/svg-infovis/`。受众是内核开发者 / 发布者的那几份(`layering` · `principles` · `public-api` · `architecture`)留在**仓根 `refs/`**, 既不进 skill 也不随 npm 包 —— 别因为"顺手"把它们塞进 skill: 只装 skill 的 agent 拿不到源码, 那些契约对它无用
- 仓根的 `QUICKREF.md` 与 `refs/{recipes,aesthetics}.md` 是**指向真身的软链** —— 改内容一律改真身(`skills/svg-infovis/`), 对着软链原子写会把链替换成普通文件
- ⚠ **根目录永远不许放 `SKILL.md`**: skills CLI 的发现规则是"根目录的 SKILL.md 盖住 `skills/` 下的"(实测: 根那份会把 `skills/` 里的顶掉), 且会把**整仓**当成 skill 拷给消费者(实测 3.3 MB, 连 `test/` 与 `website/` 一起); 真身只可能在 `skills/svg-infovis/`
- 软链方向选"真身在 skill、仓根留链", 因为反方向会让 `npx skills add` 的**软链物化**成为外部用户能否拿到文档的前提 —— 那是 CLI 未文档化的实现细节; 现在的方向下 skill 目录里全是真身, 换哪个版本都装得对
- Windows 上 `core.symlinks=false` 的 checkout 会把仓根那 3 条软链落成"一行路径"的文本文件; 不影响 `src/` / `dist/` / npm 包(软链本来就不进包), 但别在那台机器上改它们
- 验收: `npx skills add <本仓路径 或 watert/svg-infovis> --list` 应**只列 `svg-infovis` 一个** skill; 装出来应是**四份真身**, 多了就是又把仓内 refs 塞进 skill 了。布局守卫在 `test/npm-package.test.ts`(双向: 该真身的不能是软链, 该留仓根的不能变软链)

## 产物

- **`dist/`**: 源码之外的第二类产物 —— gitignored, 但**进 npm 包**(`files` 白名单里有它); 派生的、可重出的, 所以**永不手改、永不 commit**
- **图片(260926 起)**: 仓库不囤图片 —— PNG 快照那一套已退役(`examples/images/` 整目录 + `scripts/build-example-pngs.sh` 一并删除, `package.json` 的 `pngs` 也随之撤): 出图产物就是 SVG 文本, 全量出图归网站管线(→ `website/public/svg/`, gitignored), 回归对账走 **SVG 文本 diff**(同输入 → 同字节, 比 PNG 像素精确)
- 唯一 committed 的图是 `assets/hero.svg`(README 首图): `bun run examples/start/full-chain.ts > assets/hero.svg` 重出(**别 `2>&1`**), 字节守卫在 `test/hero-svg.test.ts` —— 内核改了字节而它没重出, `bun test` 当场红
- 栅格化仍走 `scripts/svg2png.sh`(通用工具, 产物落在调用方指定的地方); 别再立新的产物目录

## 验证链路三件套

```bash
readlink ~/.bun/bin/svginfo                             # → ../install/global/node_modules/@watert/svg-infovis/dist/scripts/cli.js
readlink ~/.bun/install/global/node_modules/@watert/svg-infovis  # → 本仓真实路径
cd /tmp && svginfo --help                                # 能出用法表即链路通
```

⚠ 三件套只证明"链通", **不证明产物是新的** —— 改完源码没构建时它照样全绿; 产物新鲜的唯一判据是 `bun run verify`。

## website/(260926 起)

展示站(Vite + React + TS, 纯静态 → GitHub Pages)。**独立 package**: 自己的 `package.json` / `tsconfig.json` / `node_modules`, 框架依赖全关在这个目录 —— 内核的零运行时依赖红线只管 `src/`(`dist/` 是它的编译产物, 依然一个第三方包都不引), 而 `website/` 那套构建与对外发 npm 包是两件互不相干的事; 依赖方向单向(website → src 只读 import, 内核不许回头)。

- 数据链: `bun run --cwd website prerender`(= `website/scripts/prerender.ts`)跑 `examples/manifest.ts` 全部出图入口 → `website/public/svg/<key>.svg` + `website/src/generated/examples.json`(产物 gitignored, 连跑逐字节一致)。**新增示例只要登记 manifest, 站点自动多一张卡**, 不许在 website 里维护第二份清单
- 画廊 SVG 一律**内联直出**, 不用 `<img>` / 不引 PNG; 站点 hero 图是内核在浏览器里现场算的(活证据, 别换成静态产物) —— ⚠ 与 README 首图 `assets/hero.svg`(committed, 守卫在 `test/hero-svg.test.ts`)**不是同一张**, 别互相替换
- dev: `bun run --cwd website dev`(默认端口 **5180**, 不是 vite 的 5173 —— 那口撞别的项目); build: `bun run --cwd website build`
- 部署: `.github/workflows/pages.yml`(push main → prerender + build → deploy-pages); **站址 <https://watert.github.io/svg-infovis/>**(子路径站 —— `base` 已写死在 `website/vite.config.ts`, 别改成 `/`)
  - ⚠ 仓库的 Pages 站 260926 才建成(`build_type=workflow`)—— 在那之前两次 push 的部署都红在 `configure-pages` 的 `Get Pages site failed`。**见到这个错就是 Pages 没建/没设成 Actions, 不是 workflow 有病**: 重建 `gh api -X POST /repos/watert/svg-infovis/pages -f build_type=workflow`, 然后用 `gh run rerun <id>` 重跑那次失败(同一 commit 即可)
  - 建站后 `git push` 的副作用多了一条: 会真的把站点重新发一遍, 不再是"跑一下就红"
- 根 `tsconfig.json` 的 `include` **刻意不含** `website/`(它有自己的 DOM lib 配置); website 侧验证走 `bun run --cwd website check` + `build`

## 读哪一份

- 画图 → `QUICKREF.md`(起手代码 / 缺省值表, 数字只在那里) · `refs/recipes.md`(图型骨架) · `templates/*.ts`
- 改内核 → `skills/svg-infovis/SKILL.md` 的「纪律」+ 源码; 子路径一览在 `README.md`、逐条在 `docs/api-index.md`; 未做项在 `ROADMAP.md`
- **拿不准某件东西该放哪层 / 哪条边界规则管它** → `refs/layering.md`(七层 / 依赖方向 / 准入门槛 / 三条边界轴)
- **想知道为什么这么切** → `refs/principles.md`(每条原则的代价与逼它出来的实跑事故)
- **要动公共面(exports 子路径 / 门禁码 / 发布形态: dist · files · engines)** → `refs/public-api.md`(变更分级 + 破坏性改动四步 + 下游清单)
- **要加动效 / 动动画相关内核** → `docs/animation-roadmap.md`(三个消费场景 / 两条腿 / 方向清单 / 边界 / 待拍板)
  · `docs/animation-parity.md`(Remotion 生态对账: 可搬什么、为什么、对方自己哪里错了)
- `refs/architecture.md` 是 v0.1 产品管线的**演进史存档**(决策层与 blink 已废弃), 别拿它回答现状问题
- 三条口吻: 零运行时依赖(唯一例外 `./icons/lucide` 读 optional 依赖 `lucide-static`) · 字节确定性(禁 `Date.now` / `Math.random`) · 一处事实一处
