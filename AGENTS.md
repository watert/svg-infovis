# svg-infovis · agent 须知

几何内核仓(圆角路径解算 / 几何谓词 / shapes descriptor / 字节确定的 SVG 序列化)。零运行时依赖, bun 直跑, **无构建步骤**。

## 全局包链路(bun link)

本仓经 `bun link` 注册为全局包 `svg-infovis` + 全局 CLI `svginfo`, 全链是 symlink, 没有副本:

```text
~/.bun/bin/svginfo  →  ../install/global/node_modules/svg-infovis/scripts/cli.ts
~/.bun/install/global/node_modules/svg-infovis  →  <本仓>(~/github 是 ~/www/github 的软链)
```

消费侧另有自己 `node_modules/` 里的一条 link 指回本仓 —— 裸 import(`from 'svg-infovis/knives/fit'`)只在这种已 `bun link svg-infovis` 的项目里可解析; 全局 CLI `svginfo` 只要 PATH 命中就能用。

## 铁律: 没有「同步全局包」这个动作

- `package.json` 的 `exports` 直指 `./src/*.ts`(纯 TS, 无 `dist/`, 不发 npm): 源码一存盘就经 symlink 链**立刻**对所有消费者生效
- 所以「改完是否已同步」== 是否**全绿**: 每次改完源码必须跑 `bun run verify`(=`bun test` + `tsc --noEmit`), 绿了才算完成
- 半成品没有版本号兜底、没有回滚窗口, 会当场炸到所有下游(vault 的画图 skill / vite 项目 / htmls 脚本)
- verify 红就是没完成, 不许交付; 汇报里附命令与结果(exit code / 通过数)
- 唯一要重新 `bun link` 的场景: 本仓**路径变更 / 重命名**, 或 `~/.bun/install/global` 被清 —— 那时本仓 `bun link` 重注册, 各消费者再 `bun link svg-infovis` 重建本地链
- 若将来引入构建产物(`dist/` 或真发 npm), 本节整段作废: 流程改成「commit 后重新构建 + 同步全局」, 并同步改本文件

## 验证链路三件套

```bash
readlink ~/.bun/bin/svginfo                             # → ../install/global/node_modules/svg-infovis/scripts/cli.ts
readlink ~/.bun/install/global/node_modules/svg-infovis  # → 本仓真实路径
cd /tmp && svginfo --help                                # 能出用法表即链路通
```

## 读哪一份

- 画图 → `QUICKREF.md`(起手代码 / 缺省值表, 数字只在那里) · `refs/recipes.md`(图型骨架) · `templates/*.ts`
- 改内核 → `SKILL.md` 的「纪律」+ 源码; API 索引在 `README.md`; 未做项在 `ROADMAP.md`
- **拿不准某件东西该放哪层 / 哪条边界规则管它** → `refs/layering.md`(七层 / 依赖方向 / 准入门槛 / 三条边界轴)
- **想知道为什么这么切** → `refs/principles.md`(每条原则的代价与逼它出来的实跑事故)
- **要动公共面(exports 子路径 / 门禁码)** → `refs/public-api.md`(变更分级 + 破坏性改动四步 + 下游清单)
- `refs/architecture.md` 是 v0.1 产品管线的**演进史存档**(决策层与 blink 已废弃), 别拿它回答现状问题
- 三条口吻: 零运行时依赖 · 字节确定性(禁 `Date.now` / `Math.random`) · 一处事实一处
