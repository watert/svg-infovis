# svg-infovis

**Diagramming 几何内核** —— 把"几何"从"渲染"里拆出来的那一层: 盒宽反算、正交折点、几何谓词、门禁审计, 以及 descriptor → 字节确定的 SVG 字符串。

ESM-only · 纯 TypeScript · 零运行时依赖(唯一例外: 图标子路径读 optional 依赖 `lucide-static`)

[![npm](https://img.shields.io/npm/v/@watert/svg-infovis.svg)](https://www.npmjs.com/package/@watert/svg-infovis)
[![pages](https://github.com/watert/svg-infovis/actions/workflows/pages.yml/badge.svg)](https://watert.github.io/svg-infovis/)

![full chain](assets/hero.svg)

*上图由本仓自己生成: 它就是仓里的 `assets/hero.svg`, 是 `bun run examples/start/full-chain.ts` 的产物(showcase 档门禁)。`test/hero-svg.test.ts` 断言它与该示例的当前导出**逐字节一致** —— 内核改了字节而这张图没重出, 测试当场红。*

## 是什么 / 不是什么

- **是**: 把"几何"从"渲染"里拆出来的那一层 —— 盒宽反算、正交折点、几何谓词、门禁审计、descriptor → 字节确定的 SVG。
- **不是**: data visualization 库(不绑比例尺 / 数据)、不是 layout 引擎(排布是作者的决策, core 不猜意图)、不是渲染器(产物是自包含 SVG)。

## 装

```bash
bun add @watert/svg-infovis        # 首选 —— 运行时推荐 bun
npm i @watert/svg-infovis          # 或 pnpm add / yarn add
```

```ts
import { THEMES, tryExport } from '@watert/svg-infovis';        // barrel 聚合出口(纯函数侧)
import { nodeFit } from '@watert/svg-infovis/knives/fit';       // 子路径即 API
```

- **运行时优先 bun**: 场景文件是 `.ts` —— `bun run scene.ts` / `svginfo run scene.ts` 直跑, 零配置零 flag, 产物即 SVG。没有 bun 时 `svginfo` 退到 node ≥22.6 的类型剥离跑同一个文件(实测产物逐字节相同)。
- **ESM-only**(不发 CJS); `moduleResolution` 用 `bundler` 或 `nodenext`, 老式的 `node`(node10 档)不支持。
- 完整起手代码(可直接跑的一段)在 [`QUICKREF.md`](./QUICKREF.md) 的「30 秒起手」。
- 消费侧其余须知(engines 低线 / 可选依赖 / CLI / 已知不支持)→ [`docs/consuming.md`](./docs/consuming.md)

## 三条口吻

- **零运行时依赖** —— 库本体与 barrel 不引任何第三方包; 唯一第三方 `lucide-static`(图标素材)声明为 optional, 只在 `./icons/lucide` 与 CLI 的 `icons` 档被读到。
- **字节确定性** —— 禁 `Date.now` / `Math.random`, 同输入 → 逐字节相同输出; 于是回归对账走 SVG **文本** diff(比 PNG 像素准), 仓库里也不囤图片快照。
- **一处事实一处** —— 每个数字只有一个权威出处, 文档不互相抄一份。

## 子路径一览

- `.` —— barrel 聚合出口(纯函数侧)
- `geometry/` —— 纯函数几何: 向量 · 圆角路径逐角解算 · 几何谓词 · 端口与盒 · 均匀格子 · 行 / 列摆放
- `shapes/` —— props → descriptor: 节点三形态 · 边与标签 · 组框 · 行内标记上屏 · 图标槽 · 大数字块 · 徽章 · 标题梯级
- `descriptor/` `serialize/` —— 纯数据描述符 → SVG 字符串(唯一字符串出口, 字节确定的地基)
- `knives/` —— 构建期推导与判决: 正交路由 · 成对连线 · 门禁审计(十九项 / 两档阈值) · 盒宽反算 · 约束账本
- `blocks/` —— 带数值语义的组合块(单值进度条 / 图标阵列); 独立子路径, 刻意不进 barrel
- `scene/` `export/` —— scene 构造与出口: `tryExport`(迭代回路, 永不抛) · `exportScene`(fail-closed 交付)
- `theme/` `guard/` `runtime/` `icons/` `embed/` —— 主题 · 入参守卫 · 入口判定 · 窄图标解析 · 外来 SVG 嵌入

逐个符号的索引(哪个函数在哪个子路径)→ [`docs/api-index.md`](./docs/api-index.md)

## 给 coding agent 装 skill

本仓自带一份 Agent Skill(`skills/svg-infovis/SKILL.md`, 同时随包发布), 装了它 agent 就知道何时该拿这个内核画图、画的时候守什么。

```bash
npx skills add watert/svg-infovis        # 装到当前项目(认得的 agent 各装一份)
npx skills add watert/svg-infovis -g     # 装到全局(跨项目可见)
npx skills add watert/svg-infovis --list # 只看看仓里有什么 skill
```

装出来是 `SKILL.md` + `QUICKREF.md` + `refs/{recipes,aesthetics}.md` 四份真身。为什么是这四份、动仓结构时有哪些坑 → [`AGENTS.md`](./AGENTS.md) 的「skill 与文档的真身在哪」。

## 仓内开发

```bash
git clone https://github.com/watert/svg-infovis.git && cd svg-infovis
bun install
bun run examples/start/full-chain.ts > /tmp/chain.svg   # scene → route → audit → export 全链
bun run verify                                          # 改完源码的唯一验收动作
```

起手细节、常用入口表、会咬人的两个坑(出图别加 `2>&1` / 外来 SVG 的 `var()` 展平)→ [`docs/contributing.md`](./docs/contributing.md)

## 文档

- [`QUICKREF.md`](./QUICKREF.md) —— **画图只读这一页**: 起手代码 / 缺省值表 / 误用 / 动手前七问(数字只在它手里)
- [`skills/svg-infovis/SKILL.md`](./skills/svg-infovis/SKILL.md) —— 何时用 / 怎么用(coding agent 视角)与改内核的纪律
- [`refs/layering.md`](./refs/layering.md) · [`refs/principles.md`](./refs/principles.md) · [`refs/public-api.md`](./refs/public-api.md) —— 分层契约与边界规则 · 设计意图与逼它出来的事故 · 公共承诺面与破坏性改动四步
- [`docs/`](./docs/) —— 主题研究(`theme` · `mermaid-geometry` · `infograph-roadmap` · `animation-*` · `avatar-lab-parity`)、发布 SOP(`npm-release`)、本 README 抽出的三份(`api-index` · `consuming` · `contributing`)
- [`ROADMAP.md`](./ROADMAP.md) —— 立项依据与后续方向; [`AGENTS.md`](./AGENTS.md) —— 仓库结构、产物纪律与协作须知

> ⚠ 包内没有 `docs/` `refs/` `examples/` 与 `ROADMAP.md`(`files` 白名单见 `package.json`)—— 上面指向它们的链接只在**仓库**里有效。
> 仓根的 `QUICKREF.md` 与 `refs/{recipes,aesthetics}.md` 是**软链**(真身在 `skills/svg-infovis/`), 其余 `refs/*.md` 是真身 —— 改内容一律改真身, 详见 `AGENTS.md`。

## License

MIT(见 [LICENSE](./LICENSE))。图标素材 `lucide-static` 为 ISC; `assets/embeds/` 底板为 Apache 2.0。
