---
name: icon-source
description: "lucide 图标数据源说明: npm 依赖 lucide-static (ISC), 包无 exports 字段故深路径靠裸解析, 不保留本地 SVG 副本, 升版走 PR"
tags: [icons, lucide, provenance, npm]
date: 2026-09-23T16:30:00+08:00
---

# assets/icons · 图标数据源

本目录**不再保留任何 SVG 本地副本**。图标素材与名字索引全部来自 npm 依赖 [`lucide-static`](https://www.npmjs.com/package/lucide-static)(`package.json` 里声明为 **optionalDependency**: 不装它也能用库本体与 barrel, 只有 `./icons/lucide` 与 `svginfo icons` 需要它):

- **来源**: `lucide-static`(上游 [lucide-icons/lucide](https://github.com/lucide-icons/lucide)), 许可 **ISC**(与本仓 MIT 兼容; 允许任意用途, 保留版权声明即可)
- **用到的包内文件**:
  - `icons/<name>.svg` —— 单图标 lazy 读盘(`src/icons/lucide.ts` 的 `iconAsset` 走 `readFileSync(require.resolve(...))`, 首次访问才读, 之后进 cache)
  - `tags.json` —— `{ name → tags[] }`, 提供名字全集(`iconNames`)与按概念找名字(`findIcon`)
- **深路径为什么可用**: 该包 package.json **没有 `exports` 字段**(只有 `main`/`module`), 于是 `require.resolve('lucide-static/icons/plane.svg')` 这类深路径裸解析直接可用 —— 本仓依赖这一条, **不是**被任何子路径导出承诺过的 API
- **不走 barrel 入口**: `import * as lucide from 'lucide-static'` 是全量 re-export, 会 eager load ~1848 个模块 —— 与"库本体不引第三方、不 eager load"的约束自相矛盾
- **categories 不在包内**: 那是 lucide 仓 per-icon `.json` 旁路文件, 未发布进 npm 包; `findIcon` 只用 tags, 主动放弃 categories
- **升版纪律**: 版本锁在 `bun.lock`; 升级 `lucide-static` 一律走 PR(审 diff: name 集合变化 + 抽样 `parseIconSvg` 产物 sha), 不做兼容层
