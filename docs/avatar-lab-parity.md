---
name: svg-infovis-avatar-lab-parity
description: "与 bible-strong-avatar-lab(解析式 3D 剪影渲染器)的纪律对账: 五条几何纪律本仓已领先, 一条边界负空间值得焊进红线, 一条待证据缺口"
tags: [svg-infovis, parity, geometry, guard, 3d, boundary]
date: 2026-09-26T18:05:00+08:00
---

# 外部对账 · 解析式 3D 剪影渲染器(avatar-lab)

> 🕒 更新 260926-18:05 首版。读 [bible-strong-avatar-lab](https://github.com/smontlouis/bible-strong-avatar-lab)
> (AGPL-3.0)的几何内核 `packages/avatar-core`, 与本仓纪律逐条对账。

## 为什么读它

它把 3D 数学全在 JS 里算完(姿态四元数 / 针孔投影 / 隐式曲面法线 / 透视下椭圆求交 / 2D 凸包求剪影),
**只输出 SVG path 字符串交给 `<path fill>`** —— 零 z-buffer、零光照、零材质。`CONTEXT.md` 自称
"3D-**inspired** geometry with SVG rendering",措辞诚实。

同为一个"几何算完就退化成矢量"的核,它的纪律面与本仓**大面积重合**,重合处本仓领先。所以这篇的
写法是**对账**而非建议: 五条本仓已领先的纪律(记下来, 免得将来以为自己独创)、一条边界负空间
(该焊进 ROADMAP 红线)、一条待证据缺口(不立项, 等样本)。

> 完整拆解在 vault `posts/260926-SVG解析式3D剪影渲染器拆解.md`。本篇只做纪律对照, 不复述数学。

## 对账一: 五条纪律本仓已领先

| # | avatar-lab 的做法 | 本仓对应 | 判词 |
|---|---|---|---|
| 1 | 缓存键手抄字段清单 `JSON.stringify([type, width, ...])` | `canonicalValue` + `decisionDigest`(`src/scene.ts`),键走 codepoint 序、`_`/`$`/`comment` 前缀剔除、数 `round1` | **本仓领先** |
| 2 | 防 NaN 靠散落的静默兜底:`Math.abs(den) < 1e-4 ? f/1e-4 : …`(同句重复三处)、满地 `\|\| 1` | `guard.ts` 的 `ShapeInputError` + `HINT_SPREAD_RECT`,横切纪律"坏输入当场抛,不 clamp、不静默回落" | **本仓领先** |
| 3 | `backPaths` 与 `backNodeIds` 靠位置对齐,错位不报错只是高亮错 | 横切纪律"渲染面 = 审计面" + `test/scene-render-parity.test.ts` 钉死 | **本仓领先** |
| 4 | `roundedRectangle` 先按 1.5px 步长均分离散(而且是**未投影**的局部坐标里的 1.5px),圆角半径 `min(halfH, halfW)` 宽高耦合 | `geometry/rounded-path.ts` 的 `cornerAt` 先解出 `actualRadius`/切点/圆心,再决定输出 | **本仓领先** |
| 5 | 节点没有自身 bounds,前后分层靠"中心 z + 深度半径 + 10% 魔法阈值"猜遮挡 | 块契约 `{ shape, bounds }` + `deriveGroupRect`(框是成员几何的**派生量**,永远自洽) | **本仓领先** |

### 第 1 条值得多说一句

它的动机不是"更严谨",是一条更朴素的性质: **计数只知道"落过盘", 说不出"内容变没变"** ——
同一轮改了又改回、或内容没变的重存, 都会被计数判成陈旧。指纹天然给出这个性质。

avatar-lab 的手抄字段清单还没有这个性质, 而且失效方式更阴: 往 `SurfaceConfig` 加一个新基元参数
忘了同步进那个数组, 缓存会**误命中** —— 两种不同几何共用同一份采样点, 画出来是错的, 不报错、
不报警、测试全绿。本仓的 `canonicalValue` 结构化规范化把这条路堵死了, 顺带白送"改了又改回不算陈旧"。

### 第 4 条的方法论价值

`roundedRectangle` 的病根是**次序错了**: 先离散、再不管。它反过来 —— 先解算圆角几何
(单位向量 / 内角 / 切点距离 / **被邻边钳制后的 `actualRadius`**), 再决定怎么输出。副产品是
"这个角半径被压到 1.2px, 画出来根本不是圆角"成了可查证的事实, 而不是一个无从查证的盲区。

⚠ 能搬的是**这个次序**, 不是输出形式: 它的眼睛要逐点投到球面, SVG 的 `A` 命令穿不过投影。
本仓 `rounded-path` 输出 `A` 命令是对的, 因为本仓没有投影要穿。

## 对账二: 边界负空间 —— 该焊进 ROADMAP「不做」

这是本次对账唯一的**增量**。

avatar-lab 是一次实证: **纯解析投影 + 凸包剪影, 足以撑起一个真正好看的 2D 头像产品**。而它绕过的
每一样东西(深度缓冲、光照、材质、遮挡排序)在 SVG 语境里都是**不需要**的 —— 立体感可以完全由轮廓
形状本身承担。

这暴露了本仓「不做」段的一个缺口: 红线写了不做 data visualization、不做自动排布、不引前端框架,
**但没写"不做投影 / 3D 几何"**。而这条恰恰是平时最不容易想到、因为"给节点加个投影显得立体"
听起来像纯装饰性需求。

建议焊进 `ROADMAP.md`「不做」段(已同步): 投影 / 3D 管线一律不做 —— 视觉立体感走 `theme`
的 7 tone × `solid`/`variant`, 深度、透视、遮挡不进内核。证据: 解析投影在 SVG 里能做到的上限,
就是本仓这类场景**不需要它**。

## 对账三: 一条待证据缺口(**不立项**)

guard 守的是**传入**的坏值(shape 入参的 rect / points / 旋钮 / 词表),守不到**推导出来的**坏值:
`orthogonalDeviation` 的偏差、`measureText` 的估宽、`convexHull` 遇退化点列。avatar-lab 恰好栽在
这一层(`|| 1` 兜底的是 `config.width/2 || 1` 这类**中间量**)。

按本仓既有纪律(启发式一律 warning、攒够 ≥3 张真实样本才谈升级为判据), 这条**只记不立项**:
先等"agent 手写 scene 推出一个坏中间量、且没有一道门喊"的真实例。已同步进 `ROADMAP.md` 后续方向。

## 不采纳(明确记下, 免得下次再想一遍)

- **椭球走 conic 矩阵解析投影、球体特判正圆** —— 数学很漂亮, 但本仓没有投影场景。`blocks/` 将来做
  donut / 仪表盘 / 金字塔时, 圆与弧是**平面曲线**, 极坐标直接画就够, 不需要 conic 解。采纳即引入
  无消费者的通用件, 撞「`geometry/` ≥2 消费者才上提」那条门槛。
- **姿态与几何分离的缓存粒度**(`surfaceCacheKey` 刻意不含姿态) —— 本仓是**构建期算一次**, 根本没有
  逐帧路径, 这条不适用。
- **姿态四元数 / slerp / arcball** —— 纯交互态, 与本仓定位无关。

## 相关

- 纪律全表 → `refs/layering.md`(本文不改纪律, 只对账) · 原则出处 → `refs/principles.md`
- 同族对账 → `docs/mermaid-geometry.md`(外部项目几何对账的先例)
- 数字只在一处 → `../QUICKREF.md` · 未做项 → `../ROADMAP.md`
