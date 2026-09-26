---
name: contributing
description: "在 svg-infovis 仓里动手: clone 起手 · 常用入口表 · verify 是唯一验收动作 · 产物与栅格化纪律 · 纪律与边界去哪读"
tags: [svg-infovis, contributing, dev, verify, scripts]
date: 2026-09-26T23:05:00+08:00
---

# 仓内开发

改内核 / 跑示例 / 出图。**装包消费**是另一条路, 见 `consuming.md`。

## 起手

```bash
git clone https://github.com/watert/svg-infovis.git && cd svg-infovis
bun install                                            # 只有图标素材是依赖; 库本体零运行时依赖
bun run examples/start/basic.ts > /tmp/basic.svg        # descriptor 层最小路径
bun run examples/start/full-chain.ts > /tmp/chain.svg   # scene → route → audit → export 全链
./scripts/svg2png.sh /tmp/chain.svg                     # 可选: 本地栅格化(rsvg / qlmanage, 毫秒级零浏览器)
```

## 常用入口

- `bun run examples/manifest.ts` —— 全部示例清单(键名 / 桶 / 这张图证明什么)
- `bun run scripts/inspect.ts <scene.ts>` —— 布局读数板, 不出图; 退出码 0 通过 / 1 门禁不过 / 2 用法错
- `bun run scripts/svg-varflatten.ts <in.svg> [out.svg]` —— 外来 SVG 的 CSS 变量展平
- `svginfo run <scene.ts> -o out.svg` —— CLI 入口(`run` / `inspect` / `render` / `new` / `icons`)
- `bun run verify` —— 改完源码跑这个, 见下

## 验证: `bun run verify` 是唯一的验收动作

```bash
bun run build       # tsc -p tsconfig.build.json → dist/(派生产物, gitignored)
bun test            # 纯函数单测(零依赖直跑)
bun run verify      # 上面两步 + tsc --noEmit
```

- `exports` 指向 **`dist/`**, 而 `dist/` 是派生产物: **永不手改、永不 commit**
- 所以**只跑 `bun test` 不算完成** —— 它不看产物, 而产物才是别人吃的那份; verify 红就是没完成, 不许交付
- 源码里的相对 import 一律带显式 **`.js` 扩展名**(磁盘上仍是 `.ts`, 靠 TS 的 `.js → .ts` 映射)

## 会咬人的两个坑

- **出图命令别加 `2>&1`**: 图走 stdout、诊断走 stderr, 合并会把诊断写进 SVG 文件头部, 而文件照样以 `</svg>` 收尾、退出码照样 0 —— 失败长得像成功。`svg2png.sh` 自带产物守卫会拦这种脏文件
- **外来 SVG 靠 `var(--x)` 上色时**(archify 的 viewer 导出就是), rsvg / qlmanage 会把填充描边一并丢掉、渲成"深底黑块"而**不报错** —— 先 `svg-varflatten.ts` 展平再栅格化; 本仓自产的图属性内联、没有变量, 不走这一步

## 纪律与边界去哪读

一份事实一个家 —— 下面这些**不在本文重述**:

- 缺省值 / 误用 / 起手代码 → `../QUICKREF.md`(**画图只读这一页**, 数字只在它手里)
- 图型骨架 → `refs/recipes.md`; 何时用与**改内核的纪律** → `skills/svg-infovis/SKILL.md`
- 分层契约 / 依赖方向 / 准入门槛 → `refs/layering.md`; 每条原则的代价与事故 → `refs/principles.md`
- 公共面与破坏性改动四步 → `refs/public-api.md`
- 仓库结构与产物纪律(网站管线 / 仓库不囤图片 / 软链布局)→ `../AGENTS.md`
- 未做项 → `../ROADMAP.md`

## 许可

MIT(见 `../LICENSE`)。图标素材 `lucide-static` 为 ISC; `assets/embeds/` 底板为 Apache 2.0。
