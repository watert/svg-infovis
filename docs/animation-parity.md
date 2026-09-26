---
name: svg-infovis-animation-parity
description: "与 Remotion 生态(remotion monorepo / motion / 官方 skills)的动画栈对账: 一条规范硬约束定案, 七条可搬的纯算术, 一片结构性不可搬, 附对方自己的八处错"
tags: [svg-infovis, animation, parity, remotion, smil, easing, stagger, filter]
date: 2026-09-26T18:38:22+08:00
---

# 外部对账 · Remotion 生态的动画栈

> 🕒 更新 260926-18:38 首版。读三个仓: [remotion](https://github.com/remotion-dev/remotion)
> (MIT, sparse checkout `packages/{core,animation-utils,paths,shapes,transitions,effects,noise,
> layout-utils,captions,media-utils,motion-blur,rough-notation,starburst,light-leaks,svg-3d-engine,
> rounded-text-box,timeline-utils}/` 与 `packages/docs/docs/`)、
> [motion](https://github.com/motiondivision/motion)(原 framer-motion, MIT)、
> [skills](https://github.com/remotion-dev/skills)(官方 skill)。
> 本地副本在 `~/www/github/{remotion,motion,skills}`(sparse,合计约 32M)。

## 为什么读它

它是"程序化视频生成"这条路上最成熟的**声明式动画**体系 —— 但它的声明式与我们**不同源**:
它把时间交给 JS 帧循环(`useCurrentFrame` + `interpolate` 纯函数逐帧求值),我方把时间交给
SVG 自己的时钟(SMIL / CSS)。所以两边的**能力清单**几乎不重叠,能对上的只有三处:

1. **数值与字符串层的纪律**(量化、序列化、报错口径)—— 可比,且本仓多数领先;
2. **曲线与时序的算术**(贝塞尔表、离散档、stagger、相位归整、终点手艺)—— 这批是**纯算术**,
   可搬,而且正是我方缺的那一角;
3. **几何之外的产物形态**(滤镜、噪声、图案、手绘感)—— 结构性不可搬的占绝大多数,
   但**SVG 原生那张 filter 牌它一张都没打**,而它打不了,我方打得动。

本文是**对账**:可搬的记下来、不可搬的当场否掉(免得下次再想一遍)、对方自己错的地方对一眼。

## 一句话结论

**Remotion 的动画栈 95% 活在 JS 运行时里,机制一律不可搬;值钱的是它替我们试出来的规范边界
(压在最前面的那条 `keySplines ∈ [0,1]`)和一串纯算术(spring 归一化的形状、stagger 的压分布、
相位归整、dash 的藏露容错)。反过来,我方在文字度量、版式原语、门禁上领先 —— 对方那三个包
要么整条绑死 DOM,要么根本没有对应物。**

---

## 对账一 · 规范硬约束定案(本次最值钱的一条)

### `keySplines` 四位必须 ∈ [0,1]:过冲类曲线在单段里**根本表达不了**

调研中两路结论直接对立(一路主张补 `ease-out-back`,一路主张过冲曲线在 SMIL 里非法),
查规范定案。[MDN `keySplines`](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/keySplines)
原文: *"The values of x1 y1 x2 y2 must all be in the range 0 to 1."*

- **后果**: `back` / bounce / elastic / 有回弹的 spring 这类"y 会冲出 [0,1]"的曲线,
  在**单段 `keySplines` 里无法表达**。CSS `cubic-bezier()` 允许 y 越界 —— 这正是 SMIL 与 CSS
  的分界点,不是实现差异。
- **判据(建议写进 `EASING_SPLINES` 注释)**: 本词表是**贝塞尔语义**(与 SMIL `keySplines` 原生同源),
  不许掺多项式档(对方 `Easing.out(fn)` 那种 `1-(1-t)³` 与 CSS `ease-out-cubic` 的贝塞尔近似
  **数值不等**,同一个名字会长出两条曲线);过冲只能走**多段 `values`**(见对账二第 2 条)。
- **该补的门禁**: `EASING_SPLINES` 四条数值要机器验 ∈ [0,1](约 8 行)。今天 10 条全合规,
  这条是防"以后加错词"。

顺带一条反例:Remotion 自己的 `Easing.ease = bezier(0.42, 0, 1, 1)`(`packages/core/src/easing.ts:38`),
而 `(0.42,0,1,1)` 正是 CSS 的 **`ease-in`**;它的文档还把这个函数描述成 "basic inertial
interaction"。**名字、描述、曲线三者不对账。** 我方表里 `ease` 是 CSS 正确值 `0.25 0.1 0.25 1` ——
不改,只把这条当反例记进注释。

## 对账二 · 可搬的(按价值排)

### 1. spring:折叠成"形状函数"再离线烘焙(最高价值)

**关键站位**(Remotion 文档原话):spring 的曲线 "is normalized to the interpolation progress,
so it does not take `frame`, `fps` or `durationInFrames` … measured as if it takes 30 frames"。
**形状与时长正交** —— 这一刀把 spring 从"运行时物理引擎"变成"一份常量表 + 一段 `values` 串"。

调研给出的精度实测(未由本仓复核,待烘焙器落地时验):用 `calcMode="linear"` + **非均匀** `keyTimes`,
**采样点压在极值点上**时 N=11 即可 ≤1% 行程误差;照抄 motion 的 10ms 定分辨率(D=600ms → N=60)
可到 0.2%。均匀采样 N=16 时误差 6.6% —— **"压极值点"是精度的一半**。

三个必须一起钉死的坑:

- **末值不是 1**:ζ=0.7 那条在 u=1 处是 `1.0353`(还在回落)。`fill="freeze"` 会冻在 1.035,
  位移偏 3.5%。要么采样窗延到 u≈1.4 再补 `value=1.0000`,要么规定"预设表末值恒为 1"。
- **`values > 1` 只对几何 / transform 有效**:`opacity` 越界会被渲染器截断 ⇒ **过冲预设与淡入预设必须分表**。
- **现有 serialize 分支互斥**:`src/serialize.ts:91` 把 `easing` 与 `values` 写成互斥(`easing` 只配
  `keyTimes="0;1"`)。烘焙后的产物要新开一条「`values` + 非均匀 `keyTimes` + `calcMode="linear"`」的路。

### 2. stagger:cap 索引是错的解法,应换成"时间跨度 + 缓动压分布"

motion 的写法(`motion-dom/src/utils/stagger.ts`):`stagger(duration = 0.1, {startDelay, from})`,
`delay = duration * |fromIndex - i|`,`from ∈ first | last | center`(`center` = `(n-1)/2`)。

对照我方 `ROADMAP.md` 现写的"cap 在上界 12"—— **cap 索引会丢掉第 12 个之后所有元素的顺序信息**
(它们全同时起)。正确形态:

```
delay_i = startDelay + S · e(i / (n-1))      // e 严格递增, e(0)=0, e(1)=1
```

`e` 取恒等 → 退化成 `i·step`;n 超阈值时**不动顺序、只固定 `S`、把 `e` 换成前快后慢**。
cap 从"数量上限"升级为"**时间跨度上限**",正好对上"只压视觉不动语义顺序"。

⚠ 而且现方案的数**自相矛盾**:archify 参考节拍是 stagger 步长 160ms、token 单程 780ms,
则 12 元素 = 11×160 = **1760ms**,是单程的 2.3 倍。要么步长 ≈70ms,要么跨度 cap 到 800ms 一档。
**建议 `TIMING` 里直接写毫秒(`staggerSpan: 800`),不写个数。**

另两条:① 索引只能取**作者数组顺序**(别学它的 DOM 序 `sortNodePosition` —— 我们没有 DOM);
② 它的 `maxDelay = total * duration` **off-by-one**,抄的时候用 `(n-1)*step`。

### 3. 相位归整:第 k 拍由除法反算出来时必须归整

对方同一式子出现在三处(`Sequence.tsx:382` / `loop/index.tsx:88` / `use-media-in-timeline.ts:261`),
注释逐字相同: "Fractional periods and nested playback rates can put an exact loop boundary a few
floating-point units before the next iteration."

```ts
const nearest = Math.round(x);
const isAtBoundary = Math.abs(x - nearest) <= Number.EPSILON * Math.max(1, Math.abs(x)) * 4;
const k = isAtBoundary ? nearest : Math.floor(x);
```

**对我方是必需的,不是可选**:`floor(4.999999999999999) = 4` 而 `floor(5) = 5`,产物里就是
`begin="0.5s"` vs `begin="0.6s"` 的差别,而 golden 会以"上次跑对了"的形式把它固化 ——
那是一个**会随机翻红的 bug**。凡"第 k 个元素 / 第 k 拍"由除法反算,这一步不能省。

### 4. dash 的两端容错:"藏要过头,露要精确"

`packages/paths/src/evolve-path.ts:10-24`(`progress === 0` 时把 dash 周期放大到 `1.5L`、
`dashoffset` **也**设成 `1.5L`,把整条路径塞进空隙;中间态用精确 `L`)。注释里承认自己算的
长度比浏览器实测短,`L` 到 `2L` 之间任何值都不可见,索性取中点。

**洞察比代码值钱**:**藏可以靠过头(反正看不见),露必须精确落位** —— 这是"末帧不能停在 epsilon
之前"那条纪律的正面样本:**不是所有地方都得精确**,要区分"精度影响可见性"与"精度不影响"。

⚠ 常数不能照抄:用 `1.5L`,则 `p=0.5` 时实际画出 75%(映射被余量偏置);而 `p→1` 用精确 `L`
又可能缺尾(浏览器实测长 > L 时尾巴落进空隙)。**两头都要的配方: `E = ceil1(L) + 1`**
(上取整到 1 位小数 + 1px 净空),误差 `1/E`(300px 的边约 0.3%,视觉不可见)。
⚠ **`L` 必须由舍入后的坐标算** —— 渲染器量的是舍入后的路径。

### 5. 蚂蚁线**不需要**算长度(先想清楚再动刀)

对方把一切路径动画建立在"先算总长"上,于是被迫实现 cubic 的 Gauss–Legendre 20 点弧长、
椭圆弧 300 点采样、反求 t 的迭代 —— 450 行**曲线税**。而我方坐标是整数正交折线,**这笔税一分不付**;
更要紧的是:**等距流动按定义不需要总长** —— 固定 `dasharray: "6 5"`,把 `stroke-dashoffset`
从 `0` 动到 `-(6+5)` 就是无缝循环(周期必须恰好等于一个 dash 周期,否则接缝处跳)。

只有「draw-on / 单趟跑满 / 按边打分位」才要长度。**这条要写进 QUICKREF**,免得后来人
以为蚂蚁线得先做长度内核。

### 6. `fill` ↔ `extrapolate` 对照表(可直接抄进 QUICKREF)

| Remotion | SMIL | 现象 |
|---|---|---|
| `clamp` | `fill="freeze"` | 停在末态 |
| `identity` | `fill="remove"`(我方今天的缺省) | 播完**弹回**基值 |
| `wrap` | `repeatCount="indefinite"` | 循环 |
| `extend`(它的缺省) | 规范里没有 | 越跑越远 |

判据一句话: **「动画是装饰 ⇒ `freeze` 收尾;动画是演示过程 ⇒ 才允许 `remove`。」**
两者是**同性质的坑、方向相反**:它缺省"越跑越远",我们缺省"播完弹回"。

### 7. 端点不留缝的手艺(全部同类细节)

- **单侧 epsilon + `progress === 1` 时精确**(`transitions/src/presentations/slide.tsx:20,31-36`):
  `presentationProgress === 1 ? p * 100 : p * 100 - epsilon`(严格 `===`,不是 `>=`)。三条判据一条不少:
  ① 只减"缝会开在行进方向前方"的那几个方向;② 重叠**只加后到者的前缘**(方向成对,
  镜像方向吃同一份);③ **末态用精确值** —— 这就是"末帧必须精确落位"的原始出处。
  ⚠ 它的 `0.01` 单位是**百分数**(操作的是 `translateX(%)`)。我方若用 user unit,得自己定
  "1px 还是 0.01%",且**只能定一处**。
- **精度档位要够**:缝重叠常量的精度必须 **≥ 序列化精度 + 1 档**,否则那个 epsilon 等于没写
  (被 `round1` 抹平后缝重新出现)。
- **`A` 命令单段最多 180°**(`shapes/src/utils/make-pie.ts:89-132`):`actualProgress > 0.5` 时
  必须先 `A` 到 0.5 再 `A` 到终点,`largeArcFlag` 恒 `false`。这是硬约束,环形进度 /
  时钟扫过 / 圆弧箭头必然撞上。
- **退化端点要特判**(`make-pie.ts:133-145`):扇心连线只在 `0 < p < 1` 的**开区间**里画。
  `p=0` 退化 path,`p=1` 整圆。**推广成判据:凡"扫过类"几何,`0` 与 `1` 两档都要单独写分支**,
  不能指望插值自然落到那个形态。
- **正确性常量 vs 风格旋钮要分层**(反证 `slide`):"避免白缝"的手艺**只活在源码注释里**,
  不进 API、不可配置;而 `push-cut` 把 `flashFrames` / `cutProgress` 全暴露成参数。
  前者是**实现的正确性要求**,后者是**作者的风格旋钮**。混在一起的后果是:作者能配出一个
  "无重叠"的错觉参数,缝就回来了。→ `TIMING` 表要把两类分开,正确性常量不暴露。
- **iris 不需要 epsilon**(`iris.tsx:22-39`):圆是连续曲线,没有顶点、没有"两片之间露白"的可能。
  **epsilon 是"多边形 / 位移"特有的病**,别往参数化连续曲线上搬。

### 8. 三档越界口径(可直接变成 `constraints.ts` 的检查)

对方 `TransitionSeries.tsx:687-707` 对"序列短于相邻转场"是**抛错而不是静默裁切**
(判据是严格小于,等长合法),原文:

> The duration of a `<TransitionSeries.Sequence />` must not be shorter than the duration of the
> next `<TransitionSeries.Transition />`. The transition is N frames long, but the sequence is
> only M frames long (index = i, duration = d)

而同仓 `Sequence.tsx:360-369` 对"窗口被外框裁掉"用的是**钳**(`Math.min(videoDuration - from, parent)`)。

→ **三档口径**:

- **作者声明的两个东西互相矛盾** → **抛**(带两边的值 + 修法)。它构建期就能判,不留到运行时。
- **几何本身越界**(裁过头 / 半径为负) → **退化成合法结果**(`sequence-crop.ts:25-37`:
  两端相加 > 1 时两边各让到 `0.5`,"both edges meet in the center")。
- **被外框合法裁掉** → **钳**。

另附同族的五条校验(Rules,`docs/transitions/transitionseries.mdx:296-306`):转场不得长于相邻序列 /
两个转场不得相邻 / 两个 overlay 不得相邻 / 转场与 overlay 不得相邻 / 转场或 overlay 前后至少要有一个序列。
若我方将来有"占两元素之间的槽"的装饰,这几条几乎逐字适用。

### 9. 时间编排的算术(可搬算术,不可搬生命周期)

`<Sequence>` 这个抽象对我方**不成立**(它靠"外部每帧推入的帧号"决定渲染什么,我方产物不参与决策),
但它的**算术**三条可搬,而且符合"一处事实一处":

- **链式累积**(`core/src/Sequence.tsx:189-191,398-402`):每层只存自己的 `relativeFrom`,
  子的绝对位置 = 父的绝对 + 自己的相对。**没有全局时间树、没有事后展开** —— 父算好一个数塞下去,
  子只做一次加 / 乘。我方的对应物是 `descriptor` 树**递归传参**,连抽象都不用改:把 offset 累加成
  绝对 `begin` 后**再**交给 `animate()`,`serialize` 一行不动(还是吐 `begin="0.3s"`)。
- **`<Series>` 的串接 = 一行前缀和**(`series/index.tsx:222-223`):`next = start + duration + offset`,
  总长 = `Σ duration + Σ offset`。**offset 是"游标推进量",会推后它之后的所有项** ——
  这对 stagger 是直接启发:**正向延迟等价于正 offset,所以 stagger 会让总时长变长**。
  若某次 stagger 不该改总长,只能用负 offset 让后项重叠,不能假装不占时间。
  ⚠ 它对 offset 强制**整数**(以帧为单位);我方以 ms 为单位,整数约束要换成"对齐到 `TIMING` 的节拍格"。
- **过渡的"负账"模型**(`transitions/src/TransitionSeries.tsx:615-629`):已消费的过渡时长累加进
  `transitionOffsets` 当**负偏移**,把实际起点整体前移,相邻两段在过渡区间内严格重叠。
  总长 = `Σ dur − Σ transitionDur`。**重叠量不是碰运气对齐的,是账上先扣掉的。**
  开头是过渡时把整条线后推使 `actualStartFrame === 0`,绝不产生负帧。

### 10. 确定性抖动:mulberry32(唯一"照抄即用"的纯函数,但要改三处)

`packages/core/src/random.ts` 全文 45 行:字符串种子过 32 位 `hashCode`,再喂一个单发 mulberry32
(6 行纯 int32 运算,`Math.imul` / xor / 移位)。**跨引擎逐位一致** —— 本仓已实测复现它文档里的
`random(1) = 0.07301638228818774`。

三处必须改:

- ❌ **`seed * 10000000000` 对大种子丢精度** —— 实测 13 位种子相邻 2000 个值里只有 1206 个不同
  (**794 个碰撞**)。只收**字符串种子 + 小整数**,大数当场抛。
- ❌ **`seed === null → Math.random()`**,直撞铁律,删。
- ⚠ 字符串种子走 32 位 hash,输出空间 2^32 —— 够抖动,不够密码学。

定位要说清:它是**哈希不是序列**,天然适合"每个元素按 id 抖固定一点",不适合抛粒子。
落点 `src/knives/jitter.ts`(与 `nudge.ts` 同族),约 15 行 + 测试。

### 11. `feTurbulence`:SVG 原生的声明式噪声(对方那包整个不要)

⚠ **本仓此前从未记载过 SVG filter**(grep 只命中 JS 数组的 `.filter(`)—— 不是"否过",是**没碰过**。
这是新领域,**没有翻案问题**。

- **对方的 `@remotion/noise` 不可搬**,且它自己有问题:依赖 `simplex-noise`,而
  `createNoise2D(() => random(seed))` 传的是一个**常函数**(每次返回同一个数),
  simplex 的 Fisher–Yates 置换表连续调它 256 次拿到全同值 ⇒ **置换表退化**,seed 的影响比预期弱。
  另有 3D/4D 的 seed→缓存键处理与 2D 不一致、缓存 FIFO 等杂质。
- **SVG 侧有更好的**:`feTurbulence` 的算法是**规范给定的**(SVG 1.1 §15.24 原文 "The C code below
  shows the exact algorithm used for this filter effect",PRNG = Park–Miller,`RAND_m = 2147483647` /
  `RAND_a = 16807`,连自检值 `1043618065` 都写了)。`type` / `seed` / `baseFrequency` / `numOctaves` /
  `stitchTiles` 全是普通属性 ⇒ **文本字节 100% 确定**。
- **两者不是一回事**:simplex vs Perlin + fractalSum;视觉上都是"光滑有机的云雾",
  颗粒 / 溶解 / 纸纹这类用途**看不出**,但**不能指望"同一 seed 得到同一张图"**,必须重新调参。
- **像素级跨渲染器同形:理论可期、必须实测**。已知坑按险要排序:① `color-interpolation-filters`
  **默认是 `linearRGB`**(颗粒会比 shader 版亮、平,必须显式写 `sRGB`);② GPU 路径可能用 float
  而非 double ⇒ 高 `baseFrequency` 下有低位抖动;③ `feGaussianBlur` 在大 σ 下**规范允许**用
  3-box 近似("within roughly 3%" —— 这是规范授权的分歧,不是 bug),凡用 blur 的效果都要按这个记风险;
  ④ fractalSum 的 octave 归一化若有 off-by-one,整体亮度差一档。
- **建议的第一件事是一个探针,不是代码**:`{seed 0/1/2} × {type} × {numOctaves 1/3/5} ×
  {linearRGB/sRGB} × {stitchTiles}` 各渲 `rsvg-convert` + `qlmanage`(WebKit,已在 `scripts/svg2png.sh` 链上)
  两路做像素 diff,`diff < 0.1%` 才准进交付产物档。
- 一个已知踩雷: **`feImage href="#本文件内元素"` 在 librsvg 2.63 静默渲空**(无警告、exit 0);
  `data:` URI 内嵌栅格可用 ⇒ 任何"渐变生成的位移图"都得走 data-URI,不能用文档内引用。

### 12. `starburst` 几何化(N 楔 + radialGradient mask,零 filter)

`starburst` 的 shader 逐条可对:`angle = atan(dy,dx) + rotation` → `sector = (angle+π)/(2π) * rays`
→ 取 `palette[floor(sector) mod rays]`;径向用 `smoothstep(radius, radius*0.5, dist)` 衰减,
`radius = vignette * 3.0`。

- N 条楔形 = **N 个 `<path>`**(两条半径 + 一段 arc),颜色按 `colors` 循环取 —— 完全解析;
- 径向 alpha 衰减 = **一个 `radialGradient` 的 mask**;
- **角度向羽化(`smoothness`)是唯一有代价的一步**(SVG 没有 conic gradient)。它的**默认值就是 0**
  ⇒ 覆盖九成用法,建议只做这一档,把 `smoothness` 声明为"仅浏览器档支持"。

约 90-120 行,零新原语、零 filter。

### 13. 手绘抖动:搬 rougjs 的**几何构造与常数**,输入换成我方自己的盒

⚠ **`rough-notation` 必须测量真实 DOM**(`element.offsetLeft/offsetWidth` + `ResizeObserver`)——
入口即红线。但 `renderAnnotation` 之后**全过程是纯函数**:`(rect, config, seed, progress) → path[]`,
只输出 `<path d fill="none" stroke strokeWidth strokeDasharray strokeDashoffset>`。
**所以算法可整段搬,输入换成我方 box,完全不需要 DOM。**

要搬的几何与常数(这就是"手抖感"的全部秘密,不到 40 行):

- **一条线的抖动 = 单条三次贝塞尔**,不是多段折线:两个控制点沿**垂直于线的方向**各偏
  `midDisp = bowing * maxRandomnessOffset * (Δy 或 Δx) / 200`,再各加一次 `±offset` 随机;
  端点各加 `±offset`(overlay 时 `±offset/2`);`divergePoint = 0.2 + random()*0.2`。
- **`roughnessGain` 按长度分档**(关键手感):`len < 200 → 1`;`len > 500 → 0.4`;
  中间 `-0.0016668 * len + 1.233334` —— **长线抖得少**。
- **短线的抖幅被长度钳住**:若 `offset² * 100 > len²`,则 `offset = len / 10`。
- **`highlight` 不是填充,是一根与行等高的粗描边**(`strokeWidth = rect.h + padding`),
  天然获得"马克笔一笔扫过"的质感 + 圆头线帽。**这条最推荐照抄。**
- 多笔重描用 `seed + i` 递增(我方用自己的 `hash(seed, i)`)。

⚠ **不要照搬它的 PRNG**:`Math.imul(48271, seed) & 0x7fffffff`(Lehmer/MINSTD),
而且 **`seed = 0` 时回落 `Math.random()`**(不可复现的暗雷)。用本仓的 mulberry32 即可。

### 14. 运动拖尾:`Trail` 的数学可搬,`Freeze` 不可搬

`Trail`(`motion-blur/src/Trail.tsx`)的公式本身就是"层 opacity 线性的静态副本":
`opacity_i = trailOpacity * i / layers`,`帧偏移_i = -lagInFrames * (layers - i)`。

声明式近似评估:

- **A. 几何副本**(推荐):内容 `<g>` 复制 `layers` 份,每份 `transform="translate(dx,dy)"` +
  `opacity`。语义正确。代价:元素数 × (layers+1),`layers=8` 时 40 元素的图变 360 —— **闸门设在 8**。
- B. 单层 `feGaussianBlur`:元素数 ×1,但**形状不像**(真拖尾是"渐隐的多个实体",高斯是"糊成一团"
  且亮度会掉)。
- C. 3~4 层副本 + 每层小 blur:观感最接近电影拖尾。
- ⚠ **别照搬 `CameraMotionBlur` 的 `mixBlendMode: 'plus-lighter'`** —— SVG `feBlend` 的枚举里**没有它**;
  等权平均必须走 `feComposite arithmetic`。

### 15. `fitText`:对方因只能问 DOM 才线性外推,我方本来就是线性模型

`layout-utils/src/layouts/fit-text.ts` 全文 13 行:在 `fontSize = 100` 量一次,直接
`fontSize = (withinWidth / width) * 100`,**零迭代**。

我方 `measureText` 本来就是解析线性的(`width = advanceEm * fontSize + letterSpacing * chars`),
所以反解是**闭式**的。⚠ 坑在 `letterSpacing` 那项**不含 `fontSize`**(是逐字符常数项),
必须先从目标宽里减掉再除,否则每个字距单位欠一档;再叠 `ESTIMATE_SAFETY_FACTOR = 1.015` 与 `round1` 收口。

**我方仍不走二分**的理由要写进注释:宽度对字号线性(闭式解),字号→行数是单调阶梯
(先枚举行数再闭式解,成本 ≈ `maxLines × O(n)`,比对方"18 次二分 × 每次重折行"便宜一个数量级)。

### 16. 弧 → 三次贝塞尔(**纯几何,零 DOM**)

`packages/paths/src/helpers/remove-a-s-t-curves.ts`:标准三次近似
`alpha = (4/3)·tan(Δθ/4)`、每段 ≤ 90°(单段径向最大误差 ≈ 0.027%·r)、
**超范围半径补偿** `λ = x1p²/rx² + y1p²/ry²`,若 `λ > 1` 则 `rx *= √λ, ry *= √λ`。

我方 `radiusPolygonPath` / `radiusPolylinePath` 输出的是 `A`,而 `predicates.ts` 的谓词吃**点列** ——
一旦需要"弧参与谓词"(弧与线段求交、点在圆角盒内),就得把弧展平,这份实现正好补缺口。
**但要自己加"容差 → 段数"的换算**,别照抄它写死的 `ceil(|Δθ| / (τ/4))`。

---

## 对账三 · 定案(三条改变既有判断的)

### 1. 声明式档在**帧驱动宿主**里不可用 —— 上一轮的结论要加条件

本仓此前的记法是"Remotion 禁 CSS 动效的前提是宿主按帧重排渲染,我方宿主没有帧时钟,
所以这条禁令不适用我方"。**前半句对,结论要加条件**:Remotion **自己就是帧驱动宿主** ——
它逐帧截图,SMIL / CSS 的时钟与帧时钟不同步,会得到随机帧。

→ 判据: **一条禁令适不适用,取决于消费侧是不是帧驱动宿主。** 交付物 = 一个 `.svg` 文件
(浏览器 / 预览器打开)⇒ 声明式档是**最优解**;交付物 = 视频(逐帧渲染)⇒ 声明式档**必须关掉**,
只走采样档(见 `docs/animation-roadmap.md`)。

### 2. 路径 morph:对方的 `interpolatePath` **不是答案**

它抄的是 `d3-interpolate-path`:**剥 Z → 点数补齐 → 指令同型化 → 逐顶点按索引 lerp**,
**不是弧长重采样**;而且它的对齐语义(顶点按索引)对我方恰好是错的 —— 3 折点变 5 折点时,
"第 2 个折点"在两条边上语义完全不同,插出来的中间态**既不是整数坐标也不正交**,
一插值就违反 `no_backtrack` / `orthogonal_deviation`。

→ 这条现在有依据了: **不是"还没实现",而是"它解决的不是我们的问题"**。
真要做得自己写,而它本质是**语义对应**问题(折点怎么配对)不是数值近似问题。
可借的只有两段公式:点数补齐的数量分配(`floor(ratio * i)`)与段内相对 t 的切分公式。

### 3. 转场几何:20 个 presentation 里只有 6 个可搬

| 分档 | 文件 | 技法 |
|---|---|---|
| 可搬 | `fade` / `slide` / `wipe` / `clock-wipe` / `iris` / `push-cut` | opacity / translate / `clip-path: polygon` / `path`(pie)/ `path`(circle)/ 纯阶跃 |
| 部分可搬 | `flip` | CSS 3D 三件套;SVG 缺 `perspective` 与 `backface-visibility`,只能退化成 scaleX 翻转 |
| 不可搬 | 11 个(book-flip / cross-zoom / crosswarp / dissolve / dreamy-zoom / film-burn / linear-blur / ripple / swap / zoom-blur / zoom-in-out) | WebGL2 fragment shader + `OffscreenCanvas` 双纹理 |

- **wipe 的顶点公式**:正交方向 `polygon(0 0, p% 0, p% 100, 0 100)`;**对角方向参数走 `p * 2`**
  —— 45° 扫过整块矩形时横纵各要走满 100%,`p=1` 时故意溢出到 200% 以便完全覆盖。
  ⚠ **Remotion 里没有任意角度的斜切**(对角档固定 45°),要 30° / 60° 得自己算"过定点 P(t) 的斜线
  与矩形四边求交" —— **别指望抄**。
- **clock-wipe 的四条硬约束**:半径取**半对角线** `√(w²+h²)/2`(保证铺满任意画布);
  圆心 `(r, r)`、起点钉在 270°(正上方)、`factor = +1` 顺时针;坐标域方形的偏移用
  `<g transform>` 而不是改 `d`;**退出侧不做 clip**(进入侧已被盖住,再裁一刀是多余且会产生第二次边缘)。
- **`push-cut` 证明硬切在声明式里可行**:`opacity: isEntering && p < cutProgress ? 0 : 1` 是阶跃,
  用 `values="0;0;1;1"` + `keyTimes` 即可,**不需要 clip**。

---

## 对账四 · 本仓领先的(记下来,免得将来以为独创)

- **文字度量**:对方**整条链绑死 DOM**(`document.createElement('span')` + `getBoundingClientRect`
  + `getComputedStyle`,`typeof document === 'undefined'` 直接 throw;文档明写 "Only works in the
  browser"),且**没有任何字符宽度表 / 等宽近似 / 逐字符累加兜底**。我方 `knives/measure.ts`
  就是那套兜底 —— 两侧**互补**,不存在可搬的兜底实现。
- **版式原语**:`pack` / `grid` / `place` / `cluster` 在对方的 `layout-utils` 里**没有对应物**
  (它整包只有文本适配三件 + 一个"行宽差 → 凹弧"的造型启发式)。这块我们领先。
- **数值收口方式**:对方判等必须留 `Number.EPSILON` 级容差(4 ULP × 量级,且同式两处),
  我方走**量化到有限状态**(`round1` / `fmt`)—— 比容差比较更彻底。这是"我们为什么用 round
  而不是 epsilon"的论据。
- **报错口径**:双方齐平(它 `checkNumber(api, param)` 带实际值),**我方更细**
  (`ShapeInputError(kind, slot, 实际, 修法)` 连"为什么这么判"都写进报错)。不改。
- **`@remotion/paths` 整包零 DOM**:所有看着像 DOM 的名字都是它自己的纯实现
  (Gauss–Legendre 求积 / 弧 300 点采样 / 反求 t 迭代)。这是"零依赖的路径包完全可以自算几何"
  的**正面例证**,代价是那 450 行曲线税。
- **`svg-3d-engine` 印证"不做 3D"**:它在 SVG 里做 3D 却**不做遮挡排序**(`fix-z.ts` 只是 2D→3D 升维,
  全包无 `sort` / `zIndex`),3× 细分只是为了给调用方画家算法提供颗粒;且**monorepo 内无消费者**。
  与 `docs/avatar-lab-parity.md` 的结论同族 —— 本仓那条"不做投影 / 3D"的红线得到第二次印证。

## 不采纳(明确记下,免得下次再想一遍)

- **运行时求值模型** —— `useCurrentFrame` / `interpolate()` 的 JS 本体 / `<Sequence>` / `<Loop>` / `Freeze`。
  我方零运行时、无帧时钟、产物是静态文本。**能搬的只有构建期的算术,不是求值器。**
- **spring 物理引擎 + 三级缓存**(`core/src/spring/*`:`advanceCache` / `calculationCache` 是模块级
  可变对象)。与纯函数 / 字节确定直接冲突。只取离线烘焙后的常量形状。
- **一切"知道当前在哪 / 速度多少 / 播到第几遍"的东西** —— `retarget` / `velocity` / `restSpeed` /
  `restDelta` / `elapsed` / `holdTime` / `playbackRate` / `sequence/create.ts` 的时间线 DSL。
  全是播放状态机的孪生兄弟(见 ROADMAP「不做」)。
- **曲线全家** —— `helpers/construct.ts`(450 行)/ `bezier` · `arc` / de Casteljau /
  Gauss–Legendre 节点表 / `remove-a-s-t-curves`(369 行)。整数正交折线不需要这笔税。
- **`makeTransform` 的 22 个函数照抄** —— SVG 的 `translate(10 20)` **没有逗号**、`rotate(a cx cy)`
  是三参,CSS 语法不同,照抄会得到一堆语法错的串。只搬"长式展开 / 出参唯一"这条原则。
- **`warpPath` / `inertia` / `output: 'perceptual-scale'`** —— 后者把缓动与几何语义塞进同一个输出槽,
  与"缓动只管曲线、几何不猜视觉"的切法冲突。
- **`@remotion/noise` 整包** —— 运行时逐点求值 + simplex ≠ `feTurbulence` 的 Perlin +
  置换表退化(见对账二第 11 条)。要噪声走 `feTurbulence`。
- **`light-leaks` / `pixelate` / 通用 `halftone` / `corner-pin` / `color-key` 的 spill 抑制 / `paper` 整体** ——
  前几个要么需要"迭代域扭转"(filter 无法串联自反馈位移),要么需要"按块降采样""逐格中心亮度"
  (SVG filter 无对应原语),要么需要跨通道条件分支。**fake 不出来就别 fake。**
- **"图案族"当效果搬**(flannel / venetian-blinds / tv-signal-off / zigzag / waves / rings / lines /
  dot-grid / checkerboard / pattern / tile)—— 它们**不是效果,是图案生成器**。要搬就搬成我方
  `shapes/` 里与 `grid-pattern.ts` 同族的件,**别为了"补 effects 槽"而收**。
- **`createSmoothSvgPath`** —— 贝塞尔重拟合 + **完全没有过冲抑制**(0.2 硬编码张力,比标准
  Catmull-Rom 长 20%,孤立尖峰会冲出相邻点外侧)。我方"平滑"的正确形态是**折线加密或拐角圆角化**
  (已有 `radiusPolylinePath`),不是贝塞尔重拟合。真要曲线必须补单调约束,否则峰值被画高。
- **`fillTextBox` 的 O(n²) 写法** —— 每加一个词把**整行**重新测量一遍,且缓存键是整行拼接串
  ⇒ 次次 miss ⇒ 每次真实 DOM 测量。10 词 2 行 ≈ 990 次测量。**反面教材:折行判宽必须增量累加。**
- **`ensureMaxCharactersPerLine`** —— 按 `text.length`(UTF-16 code unit,emoji 算 2、CJK 算 1)
  + ASCII 空格切词。对 CJK 方向全错(单字宽是半角两倍、CJK 整句无空格 = 一个不可断 token)。
  我方按字符单位 × 宽度 + East Asian Width 表**严格更好**。
- **`createRoundedTextBox`** —— 多行行带 + `/2` `/4` 造型启发式,`maxCornerRadius` 的钳制基准是
  **行带高的一半**(不是 CSS `min(w,h)/2`)。弱于我方逐角切线解算(`roundedPath` 的
  `tDist = min(r/tan(θ/2), lenPrev/2, lenNext/2)`,还处理凹角)。仅"行宽差 → 凹弧"这个造型思路
  留作将来"多行标签气泡"图型的参照。
- **`svg-3d-engine` 整包** —— 见对账四。
- **`premountFor` / `postmountFor`** —— 解的是浏览器异步加载竞态;我方产物自包含,
  `<style>` / `@font-face` / 内嵌图都在同一份文档里,**没有这个竞态**。
- **`flip` 的真 3D 与 11 个 WebGL presentation** —— SVG 无 `perspective` / `backface-visibility` /
  逐像素混合。**这不是取舍问题,是能力边界。**
- **`timeline-utils` 整包** —— studio 专属(音频波形 worker / mediabunny 解帧 / canvas 缩略图)。
  只有两条纪律可抄:①**"算第 n 段用 `index * period` 直接乘,不要累加"**(它的注释里记着
  累加会在 n 大时因浮点残差小于 ULP 而停滞,对方甚至因此 OOM —— 对更看重字节确定的我们更要紧);
  ②末刻内缩 1µs(我方边界交给 SMIL 渲染器,**暂不需要**)。

## 对方自己的错(抄之前对一眼)

1. **`Easing.ease` 名不符值** —— `bezier(0.42, 0, 1, 1)` 其实是 CSS 的 `ease-in`,文档描述也不对账。
2. **motion 的 WAAPI 贝塞尔近似表 `circIn` / `circOut` 标签互换** —— 标 `circOut` 的
   `(0.55 0 1 0.45)` 在 0.5 处 = 0.135,那是真 `circIn` 的值。
3. **motion `stagger` 的 `maxDelay = total * duration` off-by-one**(应为 `(total-1) * duration`)。
4. **motion `steps(4)(1) = 0.75` 而非 1**(端点被 `Math.min(p, 0.999)` 截断)——
   **SMIL `calcMode="discrete"` 的原生语义反而干净**(端点给 1)。顺带把它提成我方缓动槽的第二个
   合法取值(只吐 `calcMode="discrete"`,不吐 `keyTimes` / `keySplines`)。
5. **`makeTransform` 绕过自家 `normalizeNumber`** —— `makeTransform([scale(0.1+0.2)])` 会吐
   `scale(0.30000000000000004, …)`;同一个仓两套精度纪律。
   ⚠ 顺带照出我方一个口子:`descriptor.ts` 的 `from` / `to` / `values` 原样透传作者字符串,
   将来若加**数值型**入口,必须当场过 `fmt`,不许模板串直拼。
6. **rougjs 的 `seed = 0` 回落 `Math.random()`** —— 不可复现的暗雷。
7. **`@remotion/noise` 用常函数喂 RNG** ⇒ 置换表退化(见对账二第 11 条)。
8. **librsvg 2.63 的 `feImage href="#本文件内元素"` 静默渲空** —— 无警告、exit 0,
   与"空画布"同 hash。任何渐变生成的位移图都得走 `data:` URI。
9. ⚠ **我方的一处臆测(记下来提醒)**:某一轮调研报告把"本仓已立场性否过 filter"当既有事实引用,
   而全仓 grep 下来**从未记载过 filter**。**调研结论里凡提到"你方此前如何"的部分,都要回仓核实**,
   否则会被写进文档当依据。

## 相关

- 动画方向与两档消费面的规划 → `docs/animation-roadmap.md`
- 纪律全表与准入 → `refs/layering.md` · 原则出处 → `refs/principles.md` · 变更分级 → `refs/public-api.md`
- 同族对账 → `docs/avatar-lab-parity.md`(外部几何内核) · `docs/mermaid-geometry.md`
- 数字只在一处 → `../QUICKREF.md` · 未做项 → `../ROADMAP.md` · 信息图划界 → `docs/infograph-roadmap.md`
