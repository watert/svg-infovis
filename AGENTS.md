# svg-infovis · agent 须知

几何内核仓(圆角路径解算 / 几何谓词 / shapes descriptor / 字节确定的 SVG 序列化)。零运行时依赖, 仓内 bun 直跑, **对外是 npm 包**(`exports` 指向 `dist/` 编译产物)。

## 全局包链路(bun link)

本仓经 `bun link` 注册为全局包 `svg-infovis` + 全局 CLI `svginfo`, 全链是 symlink, 没有副本:

```text
~/.bun/bin/svginfo  →  ../install/global/node_modules/svg-infovis/dist/scripts/cli.js
~/.bun/install/global/node_modules/svg-infovis  →  <本仓>(~/github 是 ~/www/github 的软链)
```

消费侧另有自己 `node_modules/` 里的一条 link 指回本仓 —— 裸 import(`from 'svg-infovis/knives/fit'`)只在这种已 `bun link svg-infovis` 的项目里可解析; 全局 CLI `svginfo` 只要 PATH 命中就能用。⚠ **链的末端落在 `dist/`**: link 只负责把包目录接过来, 解析走 `exports` —— 所以"链通"≠"最新", 判据见下节。

CLI 是**双运行时**: shebang `#!/usr/bin/env node`, `svginfo` 优先用 PATH 里的 `bun` 跑用户的 `.ts` 场景文件, 没有 bun 则走 node ≥22.6 的类型剥离, 两者都没有则退出码 2 并说明装 bun。

## 铁律: 改完源码必须构建, 否则消费者看到的还是上一版

- `package.json` 的 `exports` 指向 **`dist/`**(三条件映射 `types` / `import` / `default`, 逐子路径显式列举, **不用通配** —— 通配会让内部文件自动变成公共面, 违反白名单纪律)。`dist/` 是**派生产物**: gitignored、不进版本库、**一个字都不许手改**; 源码仍是唯一事实
- 「源码一存盘就立刻对所有消费者生效」这条老优势**作废**: 下游(link 过来的项目 / npm 装的用户)拿到的是构建产物 —— 改了源码不构建, 他们跑的还是上一版
- 所以「改完是否已同步」== 是否**全绿**: 每次改完源码必须跑 `bun run verify`(=`bun run build` + `bun test` + `tsc --noEmit`), 绿了才算完成。**只跑 `bun test` 不算** —— 它不看产物, 而产物才是别人吃的那份
- `prepare` 脚本让 `bun link` / 从 git URL 安装时自动跑一遍 `tsc -p tsconfig.build.json`: 消费者拿到的是刚构建的产物; 仓内改完源码则自己跑 `bun run verify`
- 源码里的相对 import 一律带显式 **`.js` 扩展名**(磁盘上仍是 `.ts`, 靠 TS 的 `.js → .ts` 映射)—— 消费侧 `moduleResolution: nodenext` 认的就是它, 新文件漏了这条, 构建产物在 node 侧直接解析不到
- 半成品没有版本号兜底、没有回滚窗口, 会当场炸到所有下游(vault 的画图 skill / vite 项目 / htmls 脚本); 发布版更狠 —— 装上就坏, 变更分级见 `refs/public-api.md`
- verify 红就是没完成, 不许交付; 汇报里附命令与结果(exit code / 通过数)
- 唯一要重新 `bun link` 的场景: 本仓**路径变更 / 重命名**, 或 `~/.bun/install/global` 被清 —— 那时本仓 `bun link` 重注册, 各消费者再 `bun link svg-infovis` 重建本地链

## 产物

- **`dist/`**: 源码之外的第二类产物 —— gitignored, 但**进 npm 包**(`files` 白名单里有它); 派生的、可重出的, 所以**永不手改、永不 commit**
- **图片(260926 起)**: 仓库不囤图片 —— PNG 快照那一套已退役(`examples/images/` 整目录 + `scripts/build-example-pngs.sh` 一并删除, `package.json` 的 `pngs` 也随之撤): 出图产物就是 SVG 文本, 全量出图归网站管线(→ `website/public/svg/`, gitignored), 回归对账走 **SVG 文本 diff**(同输入 → 同字节, 比 PNG 像素精确)
- 唯一 committed 的图是 `assets/hero.svg`(README 首图): `bun run examples/start/full-chain.ts > assets/hero.svg` 重出(**别 `2>&1`**), 字节守卫在 `test/hero-svg.test.ts` —— 内核改了字节而它没重出, `bun test` 当场红
- 栅格化仍走 `scripts/svg2png.sh`(通用工具, 产物落在调用方指定的地方); 别再立新的产物目录

## 验证链路三件套

```bash
readlink ~/.bun/bin/svginfo                             # → ../install/global/node_modules/svg-infovis/dist/scripts/cli.js
readlink ~/.bun/install/global/node_modules/svg-infovis  # → 本仓真实路径
cd /tmp && svginfo --help                                # 能出用法表即链路通
```

⚠ 三件套只证明"链通", **不证明产物是新的** —— 改完源码没构建时它照样全绿; 产物新鲜的唯一判据是 `bun run verify`。

## website/(260926 起)

展示站(Vite + React + TS, 纯静态 → GitHub Pages)。**独立 package**: 自己的 `package.json` / `tsconfig.json` / `node_modules`, 框架依赖全关在这个目录 —— 内核的零运行时依赖红线只管 `src/`(`dist/` 是它的编译产物, 依然一个第三方包都不引), 而 `website/` 那套构建与对外发 npm 包是两件互不相干的事; 依赖方向单向(website → src 只读 import, 内核不许回头)。

- 数据链: `bun run --cwd website prerender`(= `website/scripts/prerender.ts`)跑 `examples/manifest.ts` 全部出图入口 → `website/public/svg/<key>.svg` + `website/src/generated/examples.json`(产物 gitignored, 连跑逐字节一致)。**新增示例只要登记 manifest, 站点自动多一张卡**, 不许在 website 里维护第二份清单
- 画廊 SVG 一律**内联直出**, 不用 `<img>` / 不引 PNG; 站点 hero 图是内核在浏览器里现场算的(活证据, 别换成静态产物) —— ⚠ 与 README 首图 `assets/hero.svg`(committed, 守卫在 `test/hero-svg.test.ts`)**不是同一张**, 别互相替换
- dev: `bun run --cwd website dev`(默认端口 **5180**, 不是 vite 的 5173 —— 那口撞别的项目); build: `bun run --cwd website build`
- 部署: `.github/workflows/pages.yml`(push main → prerender + build → deploy-pages); 需要仓库 Settings → Pages 的 Source = GitHub Actions
- 根 `tsconfig.json` 的 `include` **刻意不含** `website/`(它有自己的 DOM lib 配置); website 侧验证走 `bun run --cwd website check` + `build`

## 读哪一份

- 画图 → `QUICKREF.md`(起手代码 / 缺省值表, 数字只在那里) · `refs/recipes.md`(图型骨架) · `templates/*.ts`
- 改内核 → `SKILL.md` 的「纪律」+ 源码; API 索引在 `README.md`; 未做项在 `ROADMAP.md`
- **拿不准某件东西该放哪层 / 哪条边界规则管它** → `refs/layering.md`(七层 / 依赖方向 / 准入门槛 / 三条边界轴)
- **想知道为什么这么切** → `refs/principles.md`(每条原则的代价与逼它出来的实跑事故)
- **要动公共面(exports 子路径 / 门禁码 / 发布形态: dist · files · engines)** → `refs/public-api.md`(变更分级 + 破坏性改动四步 + 下游清单)
- **要加动效 / 动动画相关内核** → `docs/animation-roadmap.md`(三个消费场景 / 两条腿 / 方向清单 / 边界 / 待拍板)
  · `docs/animation-parity.md`(Remotion 生态对账: 可搬什么、为什么、对方自己哪里错了)
- `refs/architecture.md` 是 v0.1 产品管线的**演进史存档**(决策层与 blink 已废弃), 别拿它回答现状问题
- 三条口吻: 零运行时依赖(唯一例外 `./icons/lucide` 读 optional 依赖 `lucide-static`) · 字节确定性(禁 `Date.now` / `Math.random`) · 一处事实一处
