---
name: svg-infovis-theme
description: "core 主题系统的需求与现状: 7 色 tone × light/dark/paper × outline/tint/solid, 色值参考 tailwind 色阶"
tags: [svg-infovis, theme, color, svg, spec, todo]
date: 2026-09-17T20:20:00+08:00
---

# 主题系统 · 需求与现状

> 状态: **三个维度全部落地**(260917 建 / 260919 补 paper + tint / 260922 同步口径): `src/theme.ts` + shapes 全迁
> + `canvasLayer` + `Theme.grid`(paper 主题自带一层细线格)。
> **`Mode` = light / dark / paper; `Variant` = outline / tint / solid** —— `tint` 是 260919 为学术图加的中间档
> (浅色底 + 深一档描边, 见 `refs/recipes.md` §13)。
> **260918 口径落定**: `tone` / `variant` 是**语义槽**(类型 → 肤色 / 强不强调), 不是样式参数 —— 所以它们
> **跟几何一起进 scene**(`SceneNode.tone` / `SceneNode.variant` / `SceneGroup.tone`); 逐 id 的
> `nodeStyles` / `groupStyles` / `edgeStyles` 仍作**样式逃生口**, 优先级永远最高。
> 剩余: 组框的实底形态(组只有 `groupToneStyle`, 没有 `variant`) · 诊断在 demo 里的配色仍是调用方硬编码。

## 需求(原始口径)

- core 在**基础配置层**提供主题: 一套 theme 覆盖全部 shape(node / edge / group / text), 不是每个 demo 各调各的
- **rect 类节点要支持实色背景风格**, 命名 `solid`(备选 `contained`); **默认 `outline`**
- 色值**参考 tailwind 思路**, 默认 **7 种** tone(**含中性灰**)
- 要支持 **Dark Mode**

## 参考表现(输入参考图)

- 画布: 近黑深底, 白字, **等宽大写小标签**(letter-spacing 拉开)
- 主节点: **实色品牌蓝底 + 白字**(solid), 圆角不大
- 从节点: 深底 + 浅灰描边(outline), 白字
- 分组容器: 圆角浅描边大框 + 彩色标题(蓝), 与内容留出内边距
- 强调靠**单一品牌色 + 大面积中性底色**, 不靠多彩配色
- 虚线框 + 图标专用于"待定/可插拔"占位节点, 与实体节点区分

推论: 主题的价值不在"颜色多", 而在**同一套语义槽**能同时撑住 outline(克制的连线图)与 solid(演示稿级别的主视觉)。

## 用法约定(已落进实现)

- **默认 light + outline** —— `DEFAULT_THEME = THEMES.light`, `variant` 缺省 `outline`; 日常出图不用传任何主题参数
- **`solid` 用来表达强调** —— 唯一权威 / 门禁 / 当前焦点那几格; 满图实色等于没重点(参考 `refs/architecture.svg`: 全图只有两处 solid)

## 草案(已实施, 可推翻)

三个正交维度:

| 维度 | 取值 | 说明 |
|---|---|---|
| `tone` | `slate`(中性) / `blue` / `emerald` / `amber` / `rose` / `violet` / `teal` | 7 种; slate 兼作默认 |
| `variant` | `outline`(默认) / `tint` / `solid` | 描边 / 浅色强调底(角色框) / 实色底 |
| `mode` | `light` / `dark` / `paper` | 决定整套槽值, 不做颜色数学推导(paper = 墨水线 + 暖白 + 自带细线格) |

每个 tone × mode 给一组**语义槽**(shape 只读槽, 不认具体色值):

```
border / surface / text          → outline 态
solidBg / solidText / solidBorder → solid 态
tint                              → 浅色强调底(分组标题条 / 徽标)
```

- 色值直接抄 tailwind 色阶的 hex(不做 OKLCH 推导 —— "hardcode 配色"纪律不变, 只是从 3 套扩到 7×2 套)
- dark mode 下 outline 节点用 tone 的深色档做 border + 亮色档做 text; solid 节点用 500/600 档做底、50/900 档做字
- `amber` 这类浅色底要配深字(对比度), 不能无脑白字 —— 槽值里直接写死, 不靠运行时算

## 联系

- 实现: `src/theme.ts`(`THEMES` / `DEFAULT_THEME` / `toneStyle` / `groupToneStyle` / `canvasLayer`) —— 旧的
  `src/descriptor.ts` `PALETTES`(paper / cool / ink 三套)已由它取代, shapes 不再收 palette 入参
- 落定时一并改过: `shapes/{node,edge,group,text}.ts` 的取色口、`examples/*` 的 tone × variant 矩阵
