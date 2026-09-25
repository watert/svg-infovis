---
name: svg-infovis-recipes
description: "十三类图型与风格配方的起手骨架与常见坑: 三层带 / 时间线 / 依赖图 / fan-out / 访问矩阵 / 判定流 / 边形态 / 二维定位 / 序列图 / 阶段带 / 本体图 / 图表底板 / 学术风 paper。选型表在 QUICKREF, 这里只放能抄的骨架。"
tags: [svg-infovis, recipes, diagram, layout]
date: 2026-09-22T18:00:00+08:00
---

# 图型配方

> 选型表在 [`../QUICKREF.md`](../QUICKREF.md)。本文是骨架与坑的**唯一正文**。
> core 不猜意图。能填参的已有三套 (`templates/{sequence,layered,lifecycle}.ts`), 其余不要顺手模板化。

「何时用哪种图」是**知识**, 不是引擎能力 —— core 不猜意图(不做意图路由 / 自动排布), 但也不是"不做": 换个地方做, 配方活在文档里, 零代码成本。参照实现的 `recipes/scenarios.mjs`(391 行 / 11 条配方)是这条的实物证据: **零行排布代码**, 全是 prompt 措辞 + 关键词权重 + `useWhen` / `avoidWhen`。

> **配方 1 / 9 / 10 已有可跑骨架**(`templates/{layered,sequence,lifecycle}.ts`): 那种"每次都长一个样"的
> 结构, 起手骨架已封装成可填参的函数 —— **能填参就别重写**。其余十条仍是 prose(骨架形状每次由作者定, 模板化只会变成
> `layout.suggest` 后门)。模板层的边界宪章与字段表见 [`templates/README.md`](../templates/README.md)。

下面这些配方共用的起手三步:

1. **决策先写全**(层序 / 层内序 / 成员声明 / 语义槽)—— core 不替你决定任何一条
2. **盒宽走 `nodeFit` 反算**, 版式节奏取 `Math.max(你给的值, fit.w)` —— 别手定盒宽
3. **折点一律 `routeOrthogonal`**; 中间横着盒子时用 `via` 显式给折点(**不是避障**)

### 1. 三层带(分层架构 / 泳道)—— ✅ 有骨架, 别重写: `templates/layered.ts`

**起手骨架**: 层序是作者决策, 写成一个数组; 层内那一排交给 `packRow`(盒宽由 `nodeFit` 反算, 缝是作者给的 46); 组框**只声明 `contains`, `rect` 给个占位** —— `fitGroupFrames` 按成员并集 + `GROUP_FIT_PAD`(28) 重算。

```ts
import { nodeFit } from '.../knives/fit';
import { routeOrthogonal } from '.../knives/route';
import { packRow } from '.../geometry/pack';
import { fitGroupFrames } from '.../scene';

const LAYERS = [
  { id: '装配层', y: 60, labels: ['EMPTY', 'dsh-base patch'] },
  { id: '服务层', y: 300, labels: ['ctx.tools', 'ctx.systemPrompt'] },
  { id: '运行层', y: 540, labels: ['agent inbox', 'event log'] },
];
const nodes = [], boxes = {};
for (const L of LAYERS) {
  // 层内一排: 尺寸列交给 packRow(`盒宽 + 列距` 的累加它替你算); y 与起点 x0 仍是作者决策
  const row = packRow({ items: L.labels.map((label) => nodeFit({ label, level: 'showcase' })), gap: 46, y: L.y, x0: 200, align: 'start' });
  L.labels.forEach((label, i) => {
    boxes[`${L.id}:${i}`] = row.rects[i];
    nodes.push({ id: `${L.id}:${i}`, rect: row.rects[i], label });   // 盒宽 = 内容下限, 不手定
  });
}
const groups = LAYERS.map((L) => ({
  id: L.id, label: L.id, rect: { x: 0, y: 0, w: 1, h: 1 },  // 占位, 下面派生
  contains: L.labels.map((_, i) => `${L.id}:${i}`),
}));
const edges = LAYERS.slice(0, -1).map((L, i) => {
  const to = LAYERS[i + 1].id;
  const r = routeOrthogonal({
    from: boxes[`${L.id}:0`], fromPort: { side: 'bottom' },
    to: boxes[`${to}:0`], toPort: { side: 'top' },
  });
  return { id: `e${i}`, from: `${L.id}:0`, to: `${to}:0`, points: r.points };
});
const { scene } = fitGroupFrames({ width: 900, height: 800, nodes, edges, groups });
// exportScene(scene, { level: 'showcase', fit: true })
```

**常见坑**

- **派生框必然贴着成员** —— 成员并集 + pad 出来的框, 成员自然落在框线附近(复刻实测: 12 个节点距框线**恰好 18px**)。泳道横铺全宽 / region 到 x=N 为止这类**作者定的版式**必须声明 `frame: 'declared'`, 否则派生会把作者唯一的表达方式删掉(声明框要改尺寸走修法 `resize-frame`, 不是覆盖作者的值)。
- **层间距要给够**: 走廊里要放"主杆 + 边标签 + 两侧净空"。实测层间距 34px 时 `cluster_border_clearance` 抓 E5 贴着层框线跑(垂距 1px、368px 长); 加到 56px 才干净。
- **跨层入口别都吃面中点**: 管线末端本来就靠右时给 `t: 0.9`(**比例**) —— `PortRef` 还有 `at`(**绝对坐标**), 两者混用是踩过的坑: 写 `at: 0.9` 会让端口落到 x=0.9, 边横穿整张图(实测)。同一条边能从 700px 缩到 400px —— 端口位置是参数, 不是布局算法的运气。
- **层内摊太开也会喊**: `cluster_corridor` 说的是"框被拉得比内容长"(门限: 走廊 ≥48px 且 占比 >25% 或 ≥节点尺度)。收缩列距比扩大框诚实。

**门禁档**: 起手 `standard`; 交付前跑 `showcase`(净空 4px / 间距 12px / 呼吸位 10px)。盒宽若按 `nodeFit({ level: 'standard' })` 算, 到 showcase 会差 4px —— 档位口径要一路对齐。

### 2. 时间线(版本演进 / 事件序列)

**起手骨架**: 单列同轴 —— 每个节点按**自己的盒宽**回到同一个 `CX`, 两端端口对称 ⇒ 边是直线(`bends = 0`), 不折。

```ts
import { placeRect } from '.../geometry/box';

const CX = 300, STEP = 120;
const boxes = [], nodes = [], labels = [];
['v0.1 立项', 'v0.2 lane 路由', 'v0.3 语义档', 'v0.4 发布'].forEach((label, i) => {
  const f = nodeFit({ label, level: 'showcase' });
  // 顶边贴 y、水平居中在 CX —— `Math.round(CX - f.w / 2)` 这一步归 placeRect(锚 'n' = 上中)
  const rect = placeRect(f, { x: CX, y: 60 + i * STEP }, { anchor: 'n' });
  boxes.push(rect); nodes.push({ id: `t${i}`, rect, label });
});
const edges = boxes.slice(1).map((_, i) => {
  const id = `te${i}`;
  const r = routeOrthogonal({ from: boxes[i], fromPort: { side: 'bottom' }, to: boxes[i + 1], toPort: { side: 'top' } });
  labels.push(edgeLabel({ id, points: r.points }, `+${i + 1}`));   // 时间刻度 = 边标签
  return { id, from: `t${i}`, to: `t${i + 1}`, points: r.points };
});
```

**常见坑**

- **不等宽的盒子必须居中**: 左对齐会让每一步都错位, 边也跟着折。写法就是 `placeRect(f, { x: CX, y }, { anchor: 'n' })`(顶边贴 y、水平居中)。
- **节距固定 ≠ 缝固定**: 上面按 `60 + i × STEP` 给**固定节距**(盒高不等时, 那就是作者的意思); 若你要的是**固定缝**, 整列交给 `packCol({ items, gap, x: CX, y0, align: 'center' })` —— 它的 `gap` 是缝, 会随盒高给出不同的节距, 两者别混。
- **刻度文字要有位置才上屏**: 走 `edgeLabel()`, 或给 `Scene.texts` 一个带 `rect` + `text` 的块。**只给位置不给文字 = 占位**(不上屏却仍在参与净空审计, 计数落在 `metrics.phantom_texts`)。
- **长链会被"长边"盯上**: `long_edge` 的基线是 `max(0.4, 3 × 本图边长中位数)` —— 节点一多, 首尾那条边必然超; 惯用修法是按阶段分段(拆成几个组), 不是硬拉一条。
- **分叉的那一步用形状**: `nodeShape({ ..., shape: 'diamond' })`, 盒宽由 `nodeFit({ shape: 'diamond' })` 反算(**两轴 ×2**)。

**门禁档**: `standard` 够用(单列图几乎没有共线 / 拥挤问题); 一旦有分叉 / 旁支再升 `showcase`。

### 3. 依赖图(模块依赖 / 调用关系)

**起手骨架**: hub 居中、叶在外圈; 端口按"这个面几根线"显式分散(`at` 绝对值); 中间横着盒子时用 `via` 给折点。
⚠ **hub 与各叶的坐标仍是作者决策** —— 这里没有"自动布局": 谁在外圈、叶怎么排是你要想的(`placeRect(fit, { x: cx, y: cy })` 只把"心落在 (cx, cy)"这一步算掉), helper 不会替你换序或挪位。

```ts
const hub = { x: 300, y: 200, w: 140, h: 54 };
const mid = { x: 310, y: 380, w: 140, h: 54 };   // 挡在正中间的盒子
const leaf = { x: 300, y: 600, w: 140, h: 54 };

// ✗ 直连: 门禁会喊 —— edge_node_clearance: 边 e 从节点 mid 身上穿过(穿透 54px)
routeOrthogonal({ from: hub, fromPort: { side: 'bottom' }, to: leaf, toPort: { side: 'top' } });

// ✓ via: 作者给中间折点绕左侧走廊 —— 零诊断
const r = routeOrthogonal({
  from: hub, fromPort: { side: 'bottom' }, to: leaf, toPort: { side: 'top' },
  via: [{ x: 200, y: 340 }, { x: 200, y: 520 }, { x: 370, y: 520 }],
});
// r.points = [(370,254) (370,272) (200,272) (200,520) (370,520) (370,600)]
```

**常见坑**

- **`via` 不是避障**: 引擎不生成、不猜测、不替换折点。不可行时**原样返回作者的折点列**并置 `viaInfeasible` —— 调用方拿这个标志去改折点 / 改端口 / 改布局, 别指望 core 替你找一条路。
- **端口拥挤**: 同一节点两条边的起点离太近会被 `port_crowding` 抓(≤2px 且同向 / ≤3px 不问方向 / clamp 回盒后重合)。修法是把端口用 `at` 摊开, 别都吃面中点。
- **竖向背对背仍会折回**: 源朝下出、目标朝上入且目标在上方时, route 会吐 `…→284,272→284,62→…` 这种折回, 由 `no_backtrack` 喊疼 —— 这种拓扑要自己用 `via` 给绕行折点(绕行归 v0.2 的 lane 分配)。
- **长边**: 跨多层的边先看 `long_edge`; 根因九成是"两端被排到画布两侧", **换序优先于调坐标**。

**门禁档**: `showcase`(hub 图边多, "端带蹭边 / 近平行"这类 warning 正是要看的)。

### 4. fan-out(一源多目标 / 扇出)

**第一件事是选画法**(260920; 选错了要么丑要么出不来 —— 同一份数据的并排对照见 `examples/checks/lanes-fanout.ts`):

| | **共享端点模式**(默认) | **端口摊开模式** |
|---|---|---|
| 端口 | 所有边吃**同一个**端口点(不写 `t`) | 每条边有自己的端口(`t` 按目标位置比例给) |
| 画出来 | **主干 + 水平总线**(树形) —— 沿主干走到分叉点, 拐出去就是那条边 | N 条平行线各自错开 |
| 要写什么 | **什么都不用写**(自动中线对所有边都相同 ⇒ 自然共线, 而那正是拓扑) | 必须 `assignLanes(reqs)` |
| 什么时候用 | 端口没有语义, 只想表达"一个源分发到 N 个" | **端口本身是语义**(同层进出分口 / 上下行分口), 或目标是 `right` / `left` 侧向面 |

两条路都在 `showcase` 全绿。判据只有一条: **读者能不能沿线追出"哪条进哪条出"** —— 共享端点模式下沿主干走、到分叉点拐弯, 追得出(所以门禁的「分叉 / 汇合」豁免放行); 端口摊开却不给 lane, 就是 N 条平行线糊成一条, 追不出(所以照旧报)。

**共享端点模式(默认)**: 一个不带 `t` 的 `fromPort` 就完了

```ts
const reqs = targets.map((t) => ({
  from: src, fromPort: { side: 'bottom' },   // ← 不写 t: 都吃面中点 ⇒ 主干
  to: t, toPort: { side: 'top' },
}));
const pts = reqs.map((r) => routeOrthogonal(r).points);
// 主干(端口 → 分叉点)与水平总线(分叉后落在同一条 y 上)的共线由「分叉 / 汇合」豁免保护
```

**端口摊开模式**: 端口有语义时用它 —— 此时中段并轨是**真丢信息**, 必须错开

```ts
const reqs = targets.map((t, i) => ({
  from: src, fromPort: { side: 'bottom', t: i / (targets.length - 1) },
  to: t, toPort: { side: 'top' },
}));
// ✗ 一条都不写 / 写死同一个 lane: 一束边的**自动中线本来就全相同** ⇒ 中段并轨
//   → edge_overlap: 5 条边实测报 10 条(每两条一对)
const { reqs: laned, plan } = assignLanes(reqs);   // ✓ 各自可行域内错开, 按理想位中枢对称摊开
// 再把 laned 逐条交给 routeOrthogonal 拿折点列 —— 完整可跑版见 examples/checks/lanes-fanout.ts
```

**三条要点**

- **`lane` 别写死**(端口摊开那一支) —— 一束边的自动中线全相同 ⇒ 不给 lane 必然共线。要么整束交给 `assignLanes`, 要么每条手给不同的值。`plan.lanes[i] === null` 的边原样带过(它吃不了 lane, 或没有同带邻居要和它错开)。
- **端口怎么给取决于模式** —— 端口摊开时**必须**按目标比例分散(不分散的话 5 条线在起点就叠一起, 虽然 `port_crowding` 因豁免不再报, 视觉上照样糊); 共享端点模式下端口**本来就该重合**, 摊开反而把主干毁掉。
- **分成两个带也是对的** —— 端口按目标比例给时各条水平段连续重叠 ⇒ 一个带一次摊开; 目标比源摊得开(扇形)时中间必有一处水平段断开 ⇒ 自动分成两个带各自错开。那是**几何必然, 不是 bug** —— 想要一个带就收紧目标跨度, 或把源端口也摊开。

**门禁档**: `showcase`(看 `edge_overlap` 从几条降到 0)。活体示例 `examples/checks/lanes-fanout.ts`(三态并排: ① 共享端点 pass / ② 端口摊开不给 lane 10 条 fail / ③ 端口摊开 + `assignLanes` pass)。

### 5. 访问矩阵(多对多的二元关系)

**什么时候用它**: 关系是"谁 × 谁"的多对多映射, 而且**没有方向可讲**(有方向的用依赖图)。典型: 消费方 × 端点 / 进程 × 资源 / 谁能碰到什么。

**图型要点**: **关系用点, 实体用框** —— 这是它跟"三层带"最大的分野。点走 `Scene.texts`, 一个字一个块:

```ts
const texts: Scene['texts'] = [];
rows.forEach((r, ri) => cols.forEach((c, ci) => {
  const ch = cell[`${r.id}${c.id}`];
  if (!ch) return;                                   // 空着也是信息: "不经过"
  texts.push({
    id: `dot-${r.id}${c.id}`,
    rect: { x: cellX(ci) - 15, y: cellY(ri) - 15, w: 30, h: 30 },   // 中心 = 格心
    text: ch, fontSize: 22,
  });
}));
```

三档标记要**语义可辨**且**不靠颜色**(`SceneText` 没有色槽): 实心 `●` 直连 / 空圈 `○` 间接 / `?` 推断可达 / 留白 不经过。图例必须自己写出来 —— 矩阵的空白格最容易被读成"漏了"。**有推断成分的格子要跟实证的格子区分开机**, 并在图例里写清"这一档是推断"。

**常见坑**

- **格心是算出来的, 别手排** —— 行头 / 列头 / 格心三个坐标要同源(`cellX(i)` / `cellY(r)`), 分头算必然错位
- **行头列头宽要取 max 而不是定值**: `Math.max(下限, ...items.map(i => fit(i).w))`, 否则长 label 撞 `label_fit`
- **点位要够密才像矩阵** —— 6 个点的矩阵撑不住版面(实测)。行列数不够就把粒度降一层: 命名空间 → 具体端点, 3×4 变 6×3

**门禁档**: `showcase` —— 点与点 / 点与节点之间全是 `text_overlap` 的判定对象。

### 6. 判定流(路由 / 决策树)

**起手骨架**: 菱形只放**极短**的问句(`别名?` / `本地?`), 长解释挪到**边标签**或下一跳的 `sub`。竖向漏斗(入口在上、出口散在底部)比横向主干省宽度, 也天然读成"分流"。

```ts
const d1 = nodeFit({ label: '别名?', shape: 'diamond', level: 'showcase' });   // 菱形尺寸已含 ×2
// 菱形用四个面的面中点各挂一条边; 三路以上的出口交给矩形节点, 用 bottom 面的 t 摊开
```

**常见坑**

- **菱形最多四条边, 且只吃面中点** —— 菱形 bbox 的四个面上只有边中点落在轮廓上; 给 `t: 0.3` 端点会跑到菱形**外面的空气里**, 边看起来悬空长出。三路分叉必须交给**矩形**节点(`t: 0.2 / 0.5 / 0.8` 在矩形上合法)
- **菱形别塞长 label** —— `nodeFit` 对 diamond 两轴都 ×2, `本地还是远程?` 这种会撑出 200px+ 的巨菱形
- **多条边进同一个面要摊 `t`** —— 否则 `port_crowding`

**门禁档**: `showcase`(判定流边多, 共线 / 拥挤都容易冒出来)。

### 7. 边形态编码边界类型(调用链对照)

**什么时候用它**: 要讲的不是"谁连谁"(那谁都画得出), 而是**每一次连接的代价不同** —— 跨进程 / 跨网络 / 进程内用三种画法, 一眼看出哪一段才是贵的。

**图型要点**: `SceneEdge` 只有 `{ id, points, from?, to?, label?, tone? }` —— **端点形态 / 虚线 / 粗细不在 scene 里**, 走出口的覆盖表:

```ts
emit(scene, outPath, {
  edgeStyles: {
    'e-http': { width: 3.2, end: 'arrow-triangle' },            // 跨进程: 粗实线
    'e-cli':  { width: 1.6, dash: '1 5', end: 'arrow-line' },   // 进程内: 细点线
  },
});
```

`MarkerStyle` 五档: `none / dot-hollow / dot-solid / arrow-triangle / arrow-line`。点(`dot-*`)表达"关联 / 落点", 线箭头(`arrow-line`)比三角轻一档, 适合回流 / 弱路径。

**常见坑**

- **两条链要比出来, 就必须共享下游** —— 把汇合点之后的部分画成同一份, 差别全压在那一段边上; 各画各的会把"同一次调用"拆成两个不相干的东西
- **粗线要有对比对象** —— 全图都 2.6px 就等于没有粗细

**门禁档**: `showcase`。

### 8. 二维定位(散点 / 格局图)

**什么时候用它**: 要说的其实是"**哪个格子是空的**"。典型: 形态 × 开放性、成本 × 收益。

**起手骨架**: 一条细节点当横轴(`h: 2`), 两排"产品块"按坐标摆 —— 块用**小节点**(高度交给 `nodeFit`), 不用文本, 因为 `tone` 还要表达第三维(是不是同一类东西)。

```ts
// 上排从 LEFT 起按 nodeFit 宽度累加, 记下最右缘 rightEdge
// 下排右对齐到 rightEdge —— 让"右下密、右上空"这个对比自己长出来
nodes.push({ id: 'axis', rect: { x: left, y: axisY - 1, w: rightEdge - left, h: 2 }, tone: 'slate' });
```

**常见坑**

- **右对齐比左对齐有信息量** —— 两排都左对齐, "谁挤在哪一侧"就看不出来
- **轴只是排版元素, 不是节点** —— 给它 `id` 但别连线; 它与上下两排要有 > 12px 净空, 否则 `node_gap`
- **两端的轴标签走 `anchor: 'end'`** —— `SceneText` 的 `anchor` 只管水平对齐(`start` = 包围盒左端就是文字左端)
- **两排之间不要空太多** —— 上下留白超过一屏的 1/4 就会读成"两个不相干的图"(实测: `Y_UP 122 / AXIS 252 / Y_DOWN 382` 是舒服的节奏)

**门禁档**: `showcase`。

### 9. 序列 / 泳道(带 lifeline 的有序消息)—— ✅ 有骨架, 别重写

**什么时候用它**: 要讲的是**一次调用的先后**(谁在什么时刻调谁), 而不是"谁连谁"(那是依赖图)。
四列以上 + 有请求/应答往返时, 序列图比依赖图清楚一个量级。

**用现成的**: `templates/sequence.ts` —— 输入泳道表 + 消息表(都只是数组, 顺序即决策), 输出 SVG + 门禁判决:

```ts
import { emitSequence } from './templates/sequence.ts';   // 模板不在 package.json 的 exports 里, 仓内按路径引

const r = emitSequence({
  actors: [{ id: 'web', label: '浏览器' }, { id: 'gw', label: 'API 网关', tone: 'blue', variant: 'solid' }],
  messages: [
    { from: 'web', to: 'gw', label: 'GET /v1/user/42' },
    { from: 'gw', to: 'gw', label: '本地校验' },        // from === to = 自调用环
  ],
  out: '/tmp/seq.svg',
});
if (!r.report.pass) process.exitCode = 1;
```

**它替你算的**(都是手写容易翻车的): 列距(盒净空 / 边标签宽 / 版式下限三者取 max, 逐格算) ·
行距与首行留白 · 消息端点离泳道线的 7px 间隙 · 标签抬到线上方且**只落在源侧那一个列距内** ·
自调用环的四点几何 · **激活条的 y 区间(消息下标 → 圆头竖条)** · 画布右缘(末列有自调用环时不被 fit 裁掉)。

**激活条**(`activations`, 260920 进模板): 泳道线上的纵向圆头竖条 —— "从第几条消息到第几条消息,
这一列在忙"。区间用**消息下标**给(`from`/`to` 含两端), 不是像素; 参照实现里这一项是作者手写 y 坐标,
改一行消息就得重排。缺省色沿泳道走, `from === to` 时高度落到 `barMinH`。

**三条硬规则**(改任何序列图都要守, 模板已内置):

- **消息边不写 `from`/`to`** —— 写了会被 `port_crowding` 判成"同一端口出发"(实测 8 条消息 → 9 条 error)。
  序列图的消息端点天然在盒外, 那一档把它读成了手写错误。泳道线可以写(端点在盒底边上)。
- **跨列消息的标签不能居中放** —— 中间隔着别的泳道, 居中必被那条泳道线穿过(`label_clearance` error)。
  贴源侧放, 列距按标签宽反算。
- **有激活条的泳道线要标 `noCheck`** —— 条骑在线上, 不标就是 3 条 `edge_node_clearance`(实测穿透
  392 / 112 / 56px)。它豁免的是"视觉基准线被自己的装饰骑住"这一类, 与 `SceneGroup.noCheck` 同族;
  **加在边上而不是条上**(给条开豁免会放过"跨列消息横穿中间泳道的条"那类真事故)。
  `barW/2` 必须小于 `msgInset`, 否则端点落进条里 —— 这条联立守卫模板已内置。

**门禁档**: `showcase`。

> **序列封装完了; 其余十条别顺手也封装** —— 只有"结构每次都长一个样"的图型才配得上模板(时间线 /
> 三层带 / fan-out 候选), 拓扑形状每次由作者临场定的(依赖图 / 判定流 / 访问矩阵 / 本体图)**不该模板化**
> (那是 `layout.suggest` 后门)。判据与反例见 [`templates/README.md`](../templates/README.md)。

### 10. 阶段带 / 状态机流水线(lifecycle)—— ✅ 有骨架, 别重写: `templates/lifecycle.ts`

**什么时候用它**: 要讲的是"一个对象会在哪几段之间流转、哪些岔路能暂停它、哪些出口没有回头路"。典型:
run 生命周期 / 订单状态机 / 交付流程。**骨架 = 横向主链 + 分段段落 + 向下的岔路 + 一条回流**。

**现成骨架**: `templates/lifecycle.ts`(规格与边界见 `templates/README.md`); 手工参照
`examples/gallery/lifecycle-agent-run.ts`(深色, 三段阶段带 + 10 状态 + 分叉/合流/回流)。三条决策值得抄:

- **阶段带 = "标签 + 虚线基准线", 不是组框** —— 分段是读图的**段落感**, 不是 ownership。走
  `SceneEdge` + `noCheck`(与泳道线同族), 组框留给"这些属于一伙"。⚠ 基准线**别忘 `end: 'none'`**:
  `edgeShape` 的缺省端点是 `arrow-triangle`, 不写就在每条分隔线右端长一个三角(实测)。
- **同列的上下两状态之间要留竖向走廊** —— 否则中间那条边只能**绕行**。参照实现正是坏在这: 三个状态
  摞在同一列, 取消线被迫从盒子 2/3 高度出、绕右侧、最后 13px 顶到箭头。**修法是挪盒子, 不是加 `via`**
  (加 `via` 绕过去门禁**全绿**, 于是这个坑能一直活着) —— 判据在 `test/lifecycle-agent-run.test.ts`。
- **能进回流的那一面被挡住时, 绕顶部** —— 走 `via` 手给折点(3 个), 并让脊柱落在**所有段落标签的
  左边槽之外**: 脊柱一旦落进标签的 x 区间就会穿标签盒, `text_clearance` 当场报错。
- **版式本体就是一张等距格子** —— 列 = 阶段位置、行 = 段落, 走 `grid({ origin, cols, rows, cell, gap })`;
  分隔线 / 段落标签 / 图例标题都挂在 `g.bounds` 的面上(`rectFace(band, 'top', { offset: RAISE_RULE })`),
  回流脊柱从格区左面外推(`rectFace(g.bounds, 'left', { offset })`)。⚠ 前提是**格子真等距** —— 照抄参照图的
  坐标前先量一遍心距, 不要假设它是格。

**门禁档**: `showcase`。

### 11. 本体图(领域的实体 × 属性 × 关系)—— 有活体参照, 无模板

**什么时候用它**: 要讲的是"这个领域里有哪些**东西**、每个东西有哪些属性、谁能碰到谁"。典型: 本体 / 领域模型 /
数据字典关系图 / 概念图。**骨架 = 图标(上) + 多行说明卡片(下) 的实体块, 块与块之间拉关系边**。

判据: 若"这一格是什么东西"一句话说不清(得读完两行小字才知道), 就该上图标 —— 图标是**内容的一半**, 不是装饰。
反过来, 每格只有三五个字的图别上图标(那是依赖图 / 矩阵的活, 见配方 3 / 5)。

⚠ 下面那 5 个块心(470/160 之类)是**作者决策, 不是等距格** —— 实测列心距 350 / 360、行心距 460 / 370,
横向缝 120.5 / 123.5, 两组都不等 ⇒ `grid` / `pack` 都还原不了它的原样(要抄得一样只能照抄坐标)。

现成参照: `examples/gallery/ontology-icons.ts`(复刻航空业本体那张参照图: 5 个实体 + 一对成对双线 + 4 条单线), showcase 档
**0 诊断**出厂。五条值得抄的决策:

1. **每个实体 = 一个块, 尺寸与位置全反算** —— `cardFit({ lines, fontSize, level, padding, iconSize, iconGap })`
   → `placeCard(fit, { x, y })`(传**整块的中心**)→ 节点写
   `{ rect: card, label: lines.join('\n'), align: 'start', weight: fit.weight, icon: { asset: iconAsset(name), size, gap } }`。
   盒宽来自最宽那行、盒高来自行数、图标矩形来自 `iconSize + iconGap` —— **一处也不用猜**。
2. **边路由对着 `iconInkRect`(块的外廓)而不是卡片盒** —— 卡片**上方**那一截图标也在块的范围内, 拿卡片盒当端口
   会让线从图标身上穿过去; 而**图标不进净空门禁**, `edge_node_clearance` 一声不响(这是本图型最容易踩空的一处)。
3. **同一对实体上的两条关系走 `routePair` + `pairLabels`** —— `Flight —Departed From→ Airport` 与
   `—Arrived To→` 是版式上的两条**平行线**, 各带自己的箭头与沿线标签; 手写两个 `at` 偏移必然不平行、间距必然不等。
4. **每条关系边的标签沿线旋转**(`rotate: labelAngle(r.points)`)—— 竖线旁的 "Flown By" 竖着读, 横 / 斜线自动归到
   `[-90, 90)`; 成对标签由 `pairLabels` 内置这件事(并各朝外)。
5. **图注别估画布中心** —— 位置由 `contentBounds(scene)` 推: 先算一次**不含图注**的包围盒, 再把图注落在它下方
   (参照实现用 `before.h + 52`)。

```ts
import { cardFit, placeCard } from '.../knives/fit';
import { iconAsset } from '.../icons/lucide';            // ⚠ 不在 barrel, 走子路径(它 import 'node:fs')
import { iconInkRect } from '.../shapes/icon';
import { pairLabels, routePair } from '.../knives/route-pair';

const LINES = ['Object Type: **Flight**', 'Object: JFK -> SFO', 'Properties: Departure, Arrival'];
const fit = cardFit({ lines: LINES, fontSize: 12, level: 'showcase', padding: [14, 12], iconSize: 110, iconGap: 14 });
const { card } = placeCard(fit, { x: 470, y: 620 });      // 传的是**整块的中心**
const node = {
  id: 'flight', rect: card, label: LINES.join('\n'), fontSize: 12,
  align: 'start' as const, weight: fit.weight,             // 400 —— 必须与 cardFit 同源
  icon: { asset: iconAsset('plane-takeoff'), size: 110, gap: 14 },
};
const ink = iconInkRect(card, { size: 110, gap: 14 });     // 边对着它路由, 不拿 card →

const pair = routePair({ from: ink, fromPort: { side: 'top' }, to: at('airport'), toPort: { side: 'bottom' }, gap: 26 });
const edges = pair.points.map((points, i) => ({ id: `e.dep.${i}`, from: 'flight', to: 'airport', points }));
const labels = pairLabels(pair, ['Departed From', 'Arrived To'], { offset: 16 });
```

**常见坑**

- **卡片不写 `weight` 就是标题档** —— 节点缺省 600, 卡片正文要显式 `weight: fit.weight`(400); 不同源就是"盒按一个字重量算、字按另一个画", 估宽差 **3%**, 长行照样 `label_fit` 溢出
- **图标尺寸是"块"的量, 不是盒的量** —— `cardFit` 的 `iconSize` / `iconGap` 必须与 `SceneNode.icon.size` / `.gap` 是**同一对值**, 否则块高与实际墨迹不符(边就会贴着图标画)
- **换行归作者** —— `lines` 数组的元素就是一行, core **不替你折行**(文案是人的决定)。一行写多长是排版决策, 写长了盒就宽
- **成对双线的 `gap` 要放得下标签** —— 两条线中间得塞进一个 11px 的标签 + 两侧呼吸位(`PAIR_GAP` 22 就是这个意思), 标签本身还要再往外挪(`PAIR_LABEL_GAP` 14); 端口贴着盒角 + gap 一大, `pair.onFace` 会报"端点滑出面", 那时要么收 gap 要么把端口往里挪
- **斜线做不了** —— `orthogonal_edges` 要求折线全程正交, 参照图里 45° 的 "Hub For" 这类边这里走 **L 形**。放开斜线是**独立决定** —— 而 `ROADMAP.md` 现在**没有**这一项, 真要开得先按纪律 9 / 11 立项(两个方向的反例 + 作者拿哪个旋钮改)

**门禁档**: `showcase`(实体多、边多, "端带蹭边 / 近平行"这类 warning 正是要看的)。

### 12. 图表底板(整幅外来 SVG 当面板底板)

**什么时候用它**: 要讲的是**现成图表与结构的关系** —— 指标面板 / 监控看板, 把 echarts 出的整幅图当底板,
再在它身上标状态与箭头。(**不是**"把图表塞进文档"的通道 —— 那件事直接贴附件就行。)
骨架 = 声明面板框 + 图表进 `scene.embeds` + 芯片节点走 `nodeFit` 反算:

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { embedAsset } from '.../embed/svg-asset';

// ⚠ 素材路径必须 fileURLToPath(不能用 new URL(...).pathname): 路径含空格或 ~ 时 pathname 会 percent-encode → ENOENT
const asset = embedAsset(readFileSync(fileURLToPath(new URL('.../assets/embeds/echarts-line.svg', import.meta.url)), 'utf8'), { name: 'chart' });
const scene = {
  width: 0, height: 0, nodes, edges, labels,
  groups: [{ id: 'panel', rect: PANEL, label: '指标面板', frame: 'declared', contains: [...芯片 id] }],
  embeds: [{ id: 'chart', rect: CHART, asset }],          // CHART 按素材 viewBox 的宽高比给
};
```

**四条版式决策(全是作者的, core 不猜)**

- **面板框是声明框**(`frame: 'declared'`): 它由"这里放一块指标面板"定, 不是成员并集派生量 —— 派生框会贴住成员, 把作者唯一的表达方式删掉(与配方 1 同款)。
- **素材的 z 序在底是出口定死的**: 紧跟画布 / 网格之后、组框与节点之前 —— 边与标签才压得住它。
- **尺寸按素材 viewBox 的宽高比给**: 差一点会被 `preserveAspectRatio="xMidYMid meet"` 居中留边补掉(contain, 不拉伸); 想不留边就按比值给 `w/h`。
- **素材不进任何净空门禁**(与图标 / 网格底纹同档): 边与标签压在图表上**无人管**, 想让它们保持距离是**作者留位**(面板列距 / 端口位置), 别指望门禁喊。

**常见坑**

- **同一张图放两份素材必须给不同 `name`** —— echarts 的 id 从 `zr0` 起算, 同前缀时第二份的 `url(#…)` 全解析到第一份定义上(与网格 `md-grid` 串台同族)。
- **素材的 markup 一个字都别动** —— serialize 不做任何格式化: `<text>` 内部的首尾空白会真影响渲染, "顺手缩进一下"就把居中标签推偏一格。
- **`<style>` 每条规则必须含 `:hover`** —— 否则当场抛(静默丢掉等于悄悄改观感); 有意丢掉的东西在 `asset.dropped` 里报出来。
- **面板上那条 `cluster_corridor` 是这条缺口的活体证据, 不许顺手修** —— 面板里最大的一块占位是素材, 而素材不进 cluster / density 的视野, 于是"框比成员大"被算成空走廊(论证见 `examples/gallery/embed-panel.ts` 文件头)。

**门禁档**: `showcase`。活体: `examples/gallery/embed-panel.ts`。

### 13. 学术风 paper(风格族, 不是图型)

**这不是一种图型, 是一套风格族** —— 图型仍从上面十一条里选(参照图那张就是"两栏镜像的三层带")。
判据: 要的是**投稿味的克制观感**, 不是"更多颜色"。

**四件槽**(260919 一次落地, 活体 `examples/gallery/academic-figure.ts`):

1. **`THEMES.paper`** —— 近黑墨水线 + 暖白底, **自带一层细线格**(`Theme.grid`, 不用手写 `opts.grid`)。与 `light` 的分工: 边线全调深到墨水档, 组框靠 dashed 维持轻, 强调只靠 tint / solid。
2. **`variant: 'tint'`** —— 角色框(上下文 / 状态): 浅色底 + 深一档描边。三档语义至此齐了: `outline` 默认 / `tint` 角色 / `solid` 唯一强调。
3. **`struck: true` + `opacity`** —— "这格被废除"(红 X 语义槽): 裸装饰函数在 `sceneChildren` 唯一映射下没有合法注入点, 所以它只能进 scene; 叉线不参与净空审计。
4. **`SceneText.weight` / `color`** —— 面板标题 700 / 小标题带色 / 红字注, 缺省仍 `theme.label` / 400。

**常见坑**

- **mono + Unicode 下标没有字形回退** —— 写 LaTeX 记法(`o_t` / `Σ_{t-1}`), 别写 `ₜ` / `₋₁`(rsvg 管线实测 tofu)。
- **两栏镜像的栏框是派生量** —— 每栏 `packCol` 之后 `bounds(rects, { pad })`: 格动框跟着动, 手写那四个数会漂。
- **旁注的 rect 要逐行量** —— `measureText` 不拆 `\n`, 多行必须逐行量 + `rowBlock` 取并集高(QUICKREF 误用表同款坑)。
- **单点例外走覆盖表是正当的** —— 某一格就是那个色(如参照图里 LLM 那格灰底)写 `nodeStyles`; 但 **tone / variant 这类"角色"该写在 scene 里**, 别让"哪一格是什么角色"只活在一张按 id 索引的表里。

**门禁档**: `showcase`。
