---
name: consuming
description: "装包消费侧的须知: 运行时(优先 bun, node 退路) · moduleResolution 与 ESM-only · engines 低线 · lucide-static 这唯一可选依赖 · CLI 五个子命令 · npm 页面与包内容白名单"
tags: [svg-infovis, install, runtime, esm, cli, lucide]
date: 2026-09-26T23:05:00+08:00
---

# 装包消费 · 须知

这一页只回答"装上以后要注意什么"。是什么 / 怎么起手见 `../README.md` 与 `../QUICKREF.md`; 子路径清单见 `api-index.md`。

## 运行时: 优先 bun

- 场景文件是 `.ts` —— `bun run scene.ts` / `svginfo run scene.ts` **直跑**, 零配置零 flag, 产物即 SVG
- **没有 bun 的退路**: `svginfo` 自动改用 node ≥22.6 的类型剥离跑同一个文件(实测产物**逐字节相同**); 22.6 以下得自己带 `--experimental-strip-types`
- 只 import 库本体(构建期算坐标 / 服务端出图)则无所谓: `engines: node >= 20.16` 是那条低线(源指纹那档走 `process.getBuiltinModule`, 20.16 起回移可用)
- bun 版本本身不设 `engines` 门槛 —— 仓内开发用的就是它

## 模块系统

- **ESM-only**, 不发 CJS
- `moduleResolution` 用 `bundler` 或 `nodenext` 都行; **老式的 `node`(node10 档)不支持**
- `bun` / `vite` / `esbuild` 消费零配置可用(实测)

## 唯一的第三方依赖: `lucide-static`(optional)

- 图标素材来自 npm 依赖 [`lucide-static`](https://www.npmjs.com/package/lucide-static)(ISC 许可), 声明为 **optional dependency**: 不装它也能用库本体与 barrel, 只有 `svg-infovis/icons/lucide` 与 `svginfo icons` 需要它
- 读法是 **lazy 单图标读盘**(`require.resolve('lucide-static/icons/<name>.svg')`), 不 vendoring SVG 进仓, 也不走 barrel 全量 eager load
- 按概念找名走 `findIcon('airplane')` —— 读包内 `tags.json`(name → tags, 含同义词)
- 解析器 `parseIconSvg` 只认七种几何原语、零 `<g>` / 零 `transform`, 见到即抛(静默跳过 = 画出少几笔的图标)
- 升级走 lockfile + PR, 保字节确定

## CLI

```bash
npx svginfo --help          # run / inspect / render / new / icons
```

装了包就用 `npx svginfo`; 在 clone 的本仓里 `bun link` 后是全局 `svginfo`。

## 已知不支持

- **浏览器侧算源指纹(`decisionDigest`)** —— 那一步要 sha256, 走 bun 或 node 内置, 浏览器里没有。

## npm 页面 vs 仓库里

- 发布的包只带 `dist/` · `src/` · `blocks/` · `scripts/` · `templates/` · `assets/` · `skills/` 与 `README.md` / `LICENSE`(`files` 白名单, 逐条在 `package.json`)
- **不进包**的: `refs/` · `docs/` · `examples/` · `test/` · `website/` · `ROADMAP.md` —— 指向这些的相对链接只在**仓库**里有效, 读不到就换 [GitHub 仓库](https://github.com/watert/svg-infovis)
- 仓内开发是另一条路(会用到 `examples/` 与 `scripts/`), 见 `contributing.md`
