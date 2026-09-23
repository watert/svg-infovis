---
name: svg-infovis-mermaid-geometry
description: "mermaid v12.0.0 几何内核借鉴清单: 正交路由器真实算法与可搬的 300-400 行, validateLayout 二十类门禁与我们缺的三项, 打分曲线与 Purchase/Ware 的反例, DDLT 尺寸采集契约, intersect 四件套与 0.5px 教训 —— 含明确的不抄清单"
tags: [svg-infovis, mermaid, geometry, research, audit, router, ddlt, reference]
date: 2026-09-17T23:50:00+08:00
---

# Mermaid 几何内核借鉴清单 (v12.0.0)

> **档案, 不是操作手册**。下面「建议动作」里该搬的门禁、源哈希、谓词 spec 都已落地。还开着的只有目标函数选边, 记入 `ROADMAP.md` 修订候选。画图不要读这篇。

> 调研: 为回答「Mermaid 那边有没有值得搬的计算几何逻辑」, shallow clone mermaid 到本地(`--depth 1`, develop @ `cf83441`, 2026-09-15, 32MB, `packages/mermaid` v12.0.0), 三路只读审计(正交路由器 / 门禁评分 / 渲染度量)。
>
> **指针纪律**: 本文件所有 `文件:行号` 相对本地 clone 的 `packages/mermaid/src/`(第四节除外, 相对 `packages/mermaid/`)。行号按该 commit 固定, mermaid 若前进需重核 —— 关键常量与实现均已抽查复现。
>
> **一句话结论**: 值得搬的是**谓词层与校验常量表**(≈300-400 行), 不值得搬的是**它那 2283+2795 行的路由器与物化层**; 更要紧的是它给我们的三处**反向警告**(§三.3 有限性门 / §三.4 打分曲线 / §七.2 libavoid)。

## 零、结论速览

**最值得搬的五件**

1. `direction/geometry.ts` 的**三档严格度谓词组**(端点接触 / 严格穿越 / 穿越∪同轴重叠) —— 我们大概率只有一档, 这是最便宜的补强
2. **端口三连门禁**(`edge-shared-projected-port` 最值钱) + `EPS_FINAL_APPROACH=10` + `EPS_ENDPOINT_BAND=18`
3. **共享子路径 ≥8px / 近平行 0<gap<7px 双查**
4. `intersect/` 四件套 + `intersect-line.js` 那半像素事故的**写法级教训**与它的 spec 形态
5. **DDLT 尺寸采集契约**(captureVersion + 源 sha256 + 缺项即 throw) —— 「文本估还是量」的 fail-closed 中间路线

**明确不抄的四件**

1. `layout-utils/scoreLayout.ts` —— 无消费方 + 裸 `Math.random()` + `symmetryScore` 恒 NaN
2. `orthogonalRouter/router.ts` 的 A* + pipes/tracks 主体(除非要做全局路由)
3. `edges.js` 的 `fixCorners`(浮点严格相等判直角的历史 hack)
4. `utils.ts` 的 `isLabelCoordinateInPath`(把小数圆整后做字符串 `includes`)

**三处反向警告(比上面所有"可搬"更重要)**

1. **它的校验器没有 `Number.isFinite` 门** —— 我们的 `finite_svg` 是它没有的能力, 别反过来向它看齐(§三.3)
2. **它的打分曲线折弯 > 交叉**(`CROSSING_PENALTY=3` < `BEND_PENALTY_4=5`), 与我们引的 Purchase/Ware 实证排序**相反** —— 得自觉选边, 不能引它背书(§三.4)
3. **它自己的新布局(domus 分支)直接上 libavoid.wasm**, 手写那条(swimlanes)留了一堆补丁补补丁 —— 如果哪天要做真避障, "不上 libavoid"这个前提要用数据重判(§七.2)

## 一、它现在是两条路线并存

- `layout-algorithms/dagre/` —— 老默认, 包 `dagre-d3-es`(v7.0.14, dagre 的 fork), 只管喂图与读回坐标
- `layout-algorithms/swimlanes/` —— **mermaid 自研的 Sugiyama + 正交路由全套, 共约 11.6k 行**(CHANGELOG 措辞: "a dedicated layered orthogonal layout algorithm"); 另有 `elk/`(包 `elkjs ^0.9.3`)、`cose-bilkent/`、`tidy-tree`(`packages/mermaid-layout-tidy-tree/`)、`ddlt/`
- 作者旋钮盘点(反驳/确认我们的"意图带宽"论断): swimlane 图的旋钮 = 图类型关键字 + 可选 `direction`(`docs/syntax/swimlanes.md:106-126`, TB/BT/LR/RL) + `subgraph` 即泳道。**仍无层内顺序、无位置、无分组内摆位** —— 而且 `automaticLaneOrdering` 默认关(`swimlanes/layoutCore.ts:32-33`), 说明连"自动排序"它都还在试用期
- `docs/community/layout-makers-guide.md`(601 行)是**值得整篇读一遍的架构文档**: 五阶段钩子、`runLayoutCore` 必须 DOM-free、"浏览器量与测试回放必须是同一个函数"、fixture 契约、性能语料、以及收尾的 checklist

## 二、正交路由器: 头注释是论文装饰, 实现是管道网格 A*

入口 `routeEdgesOrthogonal(data, direction)`(`rendering-util/layout-algorithms/swimlanes/orthogonalRouter/router.ts:122`)。

**真实算法(与它自己的头注释不符)**

- 头注释 (`router.ts:5-12`) 自认走 Wybrow / Marriott / Stuckey "Orthogonal Connector Routing"(libavoid 家族), 但实现里**没有可见性图、没有障碍角点候选、没有全局最短路** —— 按论文找函数会白读
- 候选点只有三类来源: 端点 anchor 的 x(`:1006-1010`)、每个障碍四边 ±15px 生成的无限长正交 pipe(`:1050-1064`, 常量 `HORIZONTAL/VERTICAL_PIPE_MARGIN=15` `:22-23`)、anchor 的 y; 顶点 = hPipes × vPipes 笛卡尔积(`:1122-1127`), 邻居 = 同 pipe 上相邻坐标(`:1206-1221`)
- 搜索三段式: 两条 L 形直连(`:1161-1189`) → 网格 A*(`:1192-1320`, 曼哈顿启发) → **失败 fallback 到无检查的 L 形, fail-open**(`:1322-1324`) —— 与全篇 fail-closed 取向相悖, 是明确的敞口
- 代价全线性: 交叉 1000/次(**只对已路由段**, backward-looking, `:276-326`)、逆流 100/50(`:1282-1287`)、折弯 50(`:1292-1297`)
- **真硬约束只有两条**: 段不穿障碍(`:1153-1156` / `:1240-1267`, 但有 `:1322` 例外) + 同 pipe 同 track 区间不重叠(`:1618-1623` / `:1728`); 交叉 / 回折 / 折弯全是软权重 + `MAX_ITER=10` 的有界修补(`:1990-2003`), **不保证归零**
- 端口分配(`:397-676`): 侧拆分(δ_s 负荷平衡 `:464-565`) → diamond bimodal(`:566-610`) → portGroups 按 `${nodeId}:${side}:${role}` 建组(`:611-628`) → 组内按"对面坐标"升序等距, `spacing = clamp(有效边长/(n+1), MIN_PORT_SPACING=8, MAX_PORT_SPACING=20)`(`:635-676`); anchor 外推 `ANCHOR_OFFSET=20`
- nudging(`:2006-2119`): 同 pipe 重叠段聚成 interval cluster, 按目的地方向分左/中/右, 左右各推 `k*TRACK_SPACING`(`TRACK_SPACING=10`), 中位首个居中其余对半
- lane 信息**只**参与 routingOrder 的 crossLane 比较(`:156-178`), 既不构成障碍也不构成通道边界; 障碍构造显式排除 group 与 edge label(`:195`) —— **连它自家的泳道路由器也没把"作者声明的分组"当几何约束**, 分组只影响排序软偏置

**可搬的 ≈300-400 行**

- 谓词与化简层(`direction/geometry.ts`, 约 180 行): `samePoint/sameX/sameY`(带 epsilon 参数, `:115/:119/:123`)、`isHorizontal/VerticalSegment`(要求非零长, 与共线零长区分, `:127/:131`)、`overlapLength` / `sameAxisSegmentOverlapLength`(同轴重叠长度 = 贴轨/合并判定的唯一正确度量, `:135/:142`)、`countOrthogonalBends`(`:170`)、bbox 四件套(`:214-274`)、`simplifyPolyline` / `orthogonalizePolyline`(只删严格位于前驱后继之间的共线中点 → 折返点不删, `:607/:675/:652`)
- **三档严格度**(值得整组搬, 我们大概率只有一档): `orthogonalSegmentsCross`(端点接触返 false, `:483-522`) / `orthogonalSegmentsStrictlyCross`(交点须严格在两段内部, `:579-605`) / `segmentConflictsWithAnyEdge`(穿越 ∪ 同轴重叠, `:544-577`)
- 端口分布思路(`:611-676`)
- L 快路径与"直连居中"不变式(`:937-1000` / `:1161-1189`)
- 单项代价函数(`:276-326` / `:1282-1297`, 但 1000/100/50 这三个 magic 应改成显式分级或排序键)
- **单 pass 骨架模式**(候选枚举 + candidateIsSafe + 字典序接受), 模板取 `direction/portSwap.ts:107` `portSwapToLShape`(`MIN_PORT_SPACING=8`, `TRY_DELTAS=[0,±8,±16]` `:23-25`; 四条硬 guard: 折弯严格减少 / 新段不撞节点矩形 / 无穿越且无同轴重叠 / 候选 δ 须严格落在面内 `:118-200`)

**pass 清单按对 route v0.2 的有用度排序**

1. `direction/endpointClip.ts` —— 端点沿轴裁回边界(`segmentEnterPoint:45` / `clipEndpoint:60`; `INSIDE_EPS=0.5`, `CORNER_CLEARANCE=4`), 对"坐标进 git diff"直接有用
2. `direction/portSwap.ts:107` —— 4 点 H-V-H 换面成 3 点
3. `direction/detourSimplification.ts:20` —— 只处理 `bends ≥ 4` 的边; 两个高价值点: **顶点级 faceClaims 登记**(`:147-224`, 防两条边同占一面)、**同轴重叠 ≥8 也算冲突**(`:100-108`)
4. `direction/sharedTrackNudging.ts:13` —— 中间段同轨时只挪中段、钉住端点 stub(`MIN_SHARED=8`, `MIN_TRACK_GAP=7`, 候选 ±7/±14/±21)
5. `direction/terminalStub.ts:44` —— 末段 < `MIN_STUB=10` 且前段垂直时重定向到对面面中心, 删一拐点并重锚标签
6. `direction/siblingSharedFaceRouting.ts:47` —— 仅共线兄弟对, 4 点 → 2 点直线(`PORT_SHIFT=4`)
7. `direction/labelAnchoring.ts:83` —— 标签贴中段中点, 撞外来边时沿段扫候选 `t`
8. `materializedGeometry.ts` 里可借四函数: `collapseRedundantRectangularDoglegs:354` / `separateSharedRenderedTerminalLanes:42`(`MIN_FACE_CLEARANCE=16`) / `shortcutRedundantOrthogonalJogs:1568` / `resolveRenderedOrthogonalCrossings:1816`(有界枚举)

**复杂度病理(四条, 都是"别学"清单)**

1. 贪心顺序 + 事后修补: A* 只看已路由段, 靠 `MAX_ITER=10` 三轮重排兜, **不保证收敛**
2. 补丁补补丁: `finalizeRenderedEdges` 被调 3 次、nudging 2 次、标题带 4 次(`swimlanes/postProcessing.ts:98-125`); portGroups 按 role 分组导致同面 in/out 可重合, 于是需要 `separateSharedRenderedTerminalLanes` 再补 —— 2795 行里**检查代码多于算法代码**
3. **同一概念 6 档 epsilon**: router `1e-6`(`swimlanes/config.ts` PRECISION) / `direction/geometry.ts:1` `1e-3` / endpointClip `1e-3`+`0.5`+`4` / validation `1`+`0.01` / 外加 `<1` 合并 pipe 与 `getKey` 用 `toFixed(1)` —— "字节确定"的幻觉死在这里
4. 性能: pipe 线性查找 + 每次 pop 排序 + 邻居循环内重排 pipe 数组

**判决: 偷原语 + 偷少量骨架, 整块不可迁移。** 它无 rip-up-reroute、无全局最优保证, 且前提是"所有边一次性路由进全局 pipes"—— 局部两盒刀用不上 track clustering 的大头。

## 三、门禁与度量: 它比我们多一层, 但强项不在我们想的那个地方

`rendering-util/layout-algorithms/layout-utils/validateLayout.ts`(1506 行) —— 20 类 / 26 个 emit 点。

**三条定性**

- **全硬门禁**: `ok = issues.length === 0`(`:1481`), `!ok → score = 0`(`:1482-1483`); **没有 warn 级、没有可配阈值、没有豁免参数**。诊断形态 `Issue{type, message, nodeIds?, edgeId?, details?}`(`:120-126`), `details` 带原始几何便于回读
- **生产路径零调用**: `grep "from '.*validateLayout.js'"` 只命中 `*.spec.ts` 与文档; 失败不 throw, 抛断的是 spec。真正的生产自检是 swimlanes 自己的 `direction/validation.ts`, 只查两项, 而且 `layout-core` 调完**丢弃返回值**、内部只 `log.warn`(`direction/validation.ts:135-141`)
- 聚合闸门是**分数棘轮**而非字节快照: `SWIMLANE_TOTAL_SCORE_WITH_10_NODE_PLACEMENT_BASELINE = 11754` + `expect(report.totalScore).toBeGreaterThanOrEqual(...)`(`ddlt/layout-fixtures.ddlt.spec.ts:5,35`), 配 `allowLevel1Failure` 已知失败豁免名单; 质量阈值另走 `expect.soft`

**check 清单(判据 + 阈值 + emit 行)**

- `node-overlap` = 两 rect 双向重叠(跳过祖先包含), >0 即报 · `:686`
- `node-border-hugging` = 叶节点边沿与 group 边框并行贴合 · 长 ≥12, 邻近 2(`EPS_BORDER`) · `:751`
- `edge-missing-points` = `points` 非数组或 <2 · `:798`
- `edge-bend-near-endpoint` = 归一化后首/末段长度 < `EPS_FINAL_APPROACH=10` · `:824/:832`
- `edge-bend-near-endpoint(end-band)` = 倒数第二段平行贴终点侧面 ≤ `EPS_ENDPOINT_BAND=18` · `:850`
- `edge-non-orthogonal` = 存在 dx、dy 都非 0 的段 · tol 1e-6 · `:864`
- `edge-intersects-obstacle` = 段穿叶节点/标签 dummy 内部(**不豁免自身 src/dst**) · 端点走廊 `L_ATTACH=8` 豁免 · `:898`
- `edge-intersects-group-title` = 段穿 `groupTitleRect` 内部 · `:920` ← 正是我们 lane 撞组标题那道伤
- `edge-corner-connection` = 端点距节点四角 ≤ `EPS_CORNER=3` · `:938/:950`
- `edge-port-direction-mismatch` = 出/入方向 ≠ 边界所在面 · `:969/:981`
- `edge-label-off-edge` = 有 `labelNodeId` 但折线不穿标签矩形 · `:1000`(标签与边的绑定检查)
- `edge-endpoint-inside-node` = 端点严格落在非 group 节点内(内缩 0.5) · `:1040`
- `edge-border-hugging` = 段沿节点/组边框贴行 · 长 ≥12, 邻近 2 · `:1072`
- `edge-label-overlaps-own-arrowhead` = 标签 rect ∩ 自身箭头走廊 · 走廊长 10 / 半宽 7 · `:1156`
- `edge-label-overlaps-foreign-edge` = 他边段穿标签 rect 内部 · `:1183`
- `edge-label-overlaps-group-border` = 组框四边与标签 rect 相交 · `:1217`
- `edge-same-port-departure` = 同节点两边附着点距 ≤ `EPS_PORT=2` 且同向 · `:1272`
- `edge-shared-attachment-point` = 同节点两边附着点距 ≤ `EPS_SHARED_ATTACH=3`(不问方向) · `:1291`
- `edge-shared-projected-port` = **两端点 clamp 回节点盒后重合、但原始距离更远** · 投影 ≤3 且原始 >3 · `:1327`
- `edge-shared-subpath` = 同向共线段重叠长度 ≥ `L_MIN_SHARED=8` · `:1394`
- `edge-parallel-segment-too-close` = 同向近平行段重叠 ≥8 且 0 < 垂距 < `EPS_PARALLEL_EDGE_GAP=7` · `:1415`

**该补的三项(它有你没有)**

1. **端口三连**(`:1272/:1291/:1327`) —— 第三条是关键: 端点被 nudge 挪离节点后 raw 距离变大, **只比 raw 点会漏; 把两端点 clamp 回节点盒再比重合才抓得住"看起来同源"**。我们刚落地 `nudge`, 这条正对症, 常量 2/3 可原样搬
2. **折点贴端点**(`:824/:832` + `:850`) —— 把 `stub` 从造型约束升级成门禁, 10px 给箭头留位 / 18px 终点平行带
3. **共享子路径 + 近平行双查**(`:1394/:1415`) —— 正交线网最刺眼的重叠缺陷, 两者互补: 前者抓完全共线, 后者抓"没贴上但看不清"

次要可补: 贴边跑(12/2)、标签三查 + 绑定关系、组标题带(`:920`)、角点连接(3)。

**它也没有的(别在这找依据)**

- 端口**顺序**单调性(只有"同点", 无"次序")
- 轨道/track 占用与容量(只有成对近距检查)
- 层内顺序一致性(validateLayout 无层概念)
- `no_backtrack` 的显式判据 —— 最接近的替代是"刻意不豁免自身 src/dst"的 `edge-intersects-obstacle`(`:876-890`), 即抓"先出去再绕回自己盒内"

**它比我们弱的地方(反向警告 1)**

`validateLayout` **全文无 `Number.isFinite` 门**。后果可复现: NaN 坐标不报"坐标非法", 反而因 `rectsOverlap`(`:383-388`)里 `Math.max(0,NaN)=NaN`、`NaN<=0` 为 false 而**假报 `node-overlap`**; 单节点/单边图连这个都不触发(`:654` 起只遍历 i<j 节点对) → **`ok=true, score=1000` 却带着 NaN 几何**。`ddlt/baselineDdltSpec.ts:76-86` 写了 finite 断言但**无调用方**。→ 我们那条 `finite_svg` 短路契约(不过则其余门禁全跳过)不是基本功, 是它有洞的地方; **别在这条上向它看齐**。

**打分曲线: 与 Purchase/Ware 相反(反向警告 2)**

- `MAX_SCORE=1000` 起扣; 折弯按**点数**分档: 2-3 点 0 · 4 点 5 · 5 点 12 · 6 点 30 · ≥7 点 `30×2^(n−6)`(`:54-64`)
- `CROSSING_PENALTY=3`(`:62`) —— 7 点边(60 分) **> 20 次交叉**(60 分)
- 理由写在 `layout-makers-guide.md:245`: "one seven-bend edge costs more than twenty crossings, because a path nobody can follow is worse than a tidy diagram with intersections"
- 即: 它优化的是**可追踪性**, Purchase/Ware 那套实证优化的是**可读性**。这不是对错, 是两个目标函数 —— `refs/aesthetics.md` 必须自觉选边并写依据, **不能引它当背书**

**`scoreLayout.ts`: 标准反面教材**

- 它列了 11 个指标(edgeLengthRatio / aspectRatio / avgBendsPerEdge / straightEdgeRatio / crossings / renderedDiagonalEndpoints / rankFaithfulness / neighborhoodPreservation / symmetryScore / boundingBoxArea, 另有 `evaluateThresholds` 但唯一调用方不传 → `thresholdResults` 恒 null)
- **零权重、零消费方**: 全仓只有它自己的 spec 引用; guide `:252-254` 明写 "It is not wired into anything… leave scoreLayout alone"
- `:425` 用**裸 `Math.random()`** 采样邻域保持度(>500 叶触发) → 不可复算 —— 整套"字节确定"纪律唯一的破口, 靠"这模块没人用"活着
- `symmetryScore` 恒 `NaN` 占位; `edgeLengthRatio` 理论值 0 时 NaN; `rankFaithfulness` 环图 NaN
- **可偷两件**: ① `rankFaithfulness` 用**秩相关**(而不是逐边符号一致)测流向; ② `evaluateThresholds` 里 **NaN 一律判 fail** 的口径

**交叉计数的分工(直接决定 `layout.reduce_crossings` 的写法)**

- **精确(度量用)**: 对每对边、每对段跑 `segmentsCross`(`layout-utils/geometry.ts:118-165`) —— 只算 H/V 正交对, **非严格不等式把 T 型接触也算交叉**, 唯一排除"交点同时是两段端点"; 计**事件数**而非边对数; 朴素 O(E²·S²), 前置 `normalizePolyline` 合并共线
- **近似(排序用)**: 排序阶段只有 rank + 树、没有几何, 而两层交叉最小化 NP-hard → 用"子树承载的跨层边数"当代理(`swimlanes/phase2.crossCounts.ts:80-210`, 二分跳表 LCA + 逐层 bucket 累加)
- **另一件更便宜的排序目标**: 相邻层 **inversion 计数**(归并 O(n log n), `swimlanes/phase0.helpers.ts:188`)供 `transposeImprove` 做局部交换(`phase3.ordering.ts:120-137`)
- **两者不可互换**: 几何门禁必须段对精确算, 排序目标函数可以用 inversion / 子树代理

**字节确定的八条纪律 + 两条工程手艺**

1. 层内序初值 = 输入序, 不 shuffle(`phase3.ordering.ts:256-257`)
2. median heuristic + **显式平局**: 当前位置差 → `localeCompare`; 非有限值排后(`:56-64/:98-105`)
3. `transposeImprove` 只收**严格下降**的相邻交换(`:222-231`)→ 等值不接受, 杜绝平局漂移; 且禁止跨泳道交换
4. 固定 3 轮 down/up 扫描(`:262-276`), 目标函数可独立复算
5. 唯一随机化点是**带种子的**: FNV-1a `hashString`(`swimlanes/laneOrdering.ts:16-23`)+ `mulberry32`(`:25-35`)+ Fisher-Yates `deterministicShuffle`(`:38-47`); 种子 = 源序|权重签名|restartIndex, 故同图恒定 8 次 restart; 候选比较用双键 `(cost, sourceDistance)`
6. 但这条路径**默认关闭**(`layoutCore.ts:32-33`)
7. 其它钉子: 驱动树 preds localeCompare 排序 / roots 按 topoIndex→id / `chooseParent` 四级 tiebreak / dummy 按 edge id 排序创建 / 拓扑队列保序
8. **两条可借的手艺**: ① 遍历门禁前**先按 id 排序**(节点 `validateLayout.ts:654` / 边 `:1348`)→ issue 列表顺序与输入序无关, **报告 diff 稳定**; ② 已知失败走**显式豁免名单**(`allowLevel1Failure`)而非放宽容差

## 四、DDLT: 尺寸采集契约 —— 补「文本估还是量」的中间路线

`rendering-util/layout-algorithms/ddlt/`(1420 行)+ `e2e/platform/dev-diagrams/layout-tests/`(64 项, ~45 张 `.mmd`, 其中约 15 张有 `.sizes.json`)。**注意: 没有 sizes 的图 = 没被任何测试覆盖**(guide `:412-424`)。

- 契约形态: `SizesFixture{metadata{captureVersion, sourceSha256, capturedAt, capturedFrom}, nodes[{id,width,height}]}`(`ddlt/types.ts:4-26`); `assertSizesFixtureFresh` 比对 `captureVersion` 与 `sha256(规范化 .mmd)`, **缺失或不匹配直接 throw**(`ddlt/fixtureFreshness.ts:14-48`)
- 回放端 fail-loud: `applyFixtureContentSizesStrict` 对每个非组节点找不到尺寸即报错并列出已知 id(`ddlt/fixtureSizes.ts:108-124`)
- 采集端**只在 `window.mermaidCaptureSizes` 置位时动态 import**, 永不进生产 bundle(`ddlt/sizeCapture.ts:1-27`); dev-explorer 有 "Save sizes" 按钮, 自动写 hash 与版本(`layout-makers-guide.md:303-330`)
- 纪律金句: "Recapture when the diagram source changes or when a shape's real dimensions change. **Do not recapture to make a failing test pass.**"(guide `:330`)
- 唯一 DOM-free 的兜底是 `ddlt/fixtureSizes.ts:34-53` 的 SyntheticSizes(`minWidth 120/40, height 60/20, charWidth 8/7, padding 16/8`)—— 比我们的宽度表更粗, **数值别抄, 契约值得抄**
- → 对我们的意义: 我们的 `bounds_source: "estimate" | "layout" | "manual"` 已经是同一思路, **缺的是"源变更即失效"的哈希与时序绑定**。`html_rev/scene_rev` 目前是单调计数, 而 mermaid 是 `sha256(源)` —— 计数在同一次编辑循环里会假新鲜, 哈希不会。另外它把"陈旧"焊成了**测试失败**, 我们只在 export 报 warning

## 五、渲染层几何: 四件可搬 + 三处对账

**1) `intersect/` 四件套(零 DOM, bun 可直接搬)**

- `intersect-rect.js` — 象限判别 `|dy|·w > |dx|·h` 决定贴上/下还是左/右边, 再按符号取 ±h/±w 线性插值; `dy===0`/`dx===0` 单独置 0 防 `0*NaN`
- `intersect-ellipse.js` — `det=sqrt(rx²py²+ry²px²)`, `dx=±(rx·ry·px)/det`: **先算绝对值再按象限补符号**, 比 atan2 便宜且退化安全; 但 `det===0`(查询点=圆心)无保护 → NaN
- `intersect-circle.js:3-5` — circle 就是 `ellipse(node, rx, rx)`
- `intersect-polygon.js` — 按点列 **bbox 最小值**把形状局部坐标对齐到 node 盒(`:25-26`), 逐边调 `intersectLine`; 三条约定值得照抄: **无交点退化为盒子**(`:42-44`) / **多解取离射线端点最近者**(`:48-62`) / min 对齐使点列可用"左上原点"或"中心原点"任一约定(代价: 点列 bbox 必须等于 node 盒)
- `intersect-line.js` — Graphics Gems 隐式式判定 + `denom=a1b2−a2b1` 解点; `denom===0` 返 `undefined`(注释写 `COLLINEAR` 但实际对任意平行都吞掉, 且**不返回参数 t、不返回多解**); `:23` 用精确 `!==0` 而 `:39` 用 epsilon —— 同一函数两套零点判据

**`intersect-line.js` 的半像素事故(`:46-76`)是本次调研最值钱的一段注释**, 直接对应我们的谓词纪律:

- Graphics Gems 原文坐标是整数, `offset=|denom/2|` 是给整数除法补的四舍五入; JS 的 `/` 不做截断 → 它变成 `0.5·sign(num)·sign(denom)` 的**常量位移**; 而 `num` 按轴分别算、`denom` 共用, 两轴符号可同向也可反向 → **不是眼睛能发现的常量偏移**(两轴位移 0.5px, 方向随机组合)
- 破坏力: `intersectPolygon` 是所有非矩形形状的贴边入口, 半像素把贴点推离射线轴 → **正交边多出一个小斜的开段 + 贴点掉进盒内**; 当年 `question.ts:73-84` 用固定减 0.5 补偿, 只在两轴同为正号时成立, 反向时误差翻倍到 1px
- 修法: **删补偿**(不叠补丁) + 用 `toBeCloseTo(…, 9)` 钉住(spec 要求四个走向组合落到同一点; 并用非整数中心 `285.01588439941406` 钉"贴点留在垂直射线上")
- → 我们的版本: 谓词非法输入返 `null` 而不是 NaN 已经是同一族纪律; **可再补一条**: 求交/吸附链路上的 spec 必须覆盖四个走向组合 + 一个非整数中心, 且断言到 9 位(而不是"看起来对")

**2) 圆角与折线: 只搬 `generateRoundedPath` 的夹紧**

- `edges.js:984` `cutLen = Math.min(radius / Math.sin(angle/2), len1/2, len2/2)` → `L(start) + Q(curr, end)`; 退化(`len<1e-5` 或 `angle≈0/π`)直接 `L`。**三重夹紧天然防短段过切**, 我们已有 rounded-path, 可对账这条夹紧是否等价(我们那套带"可审计字段: 圆心/切点/实际半径", 更重但更可查)
- **别抄 `fixCorners`**(`:483-568`): 用 `prev.x === curr.x` **浮点严格相等**判直角(`:490-497`), 只处理 >5px, 再插 `√2*2=2.828` 斜切点 —— 历史 hack
- 端点裁切常量表可借(`utils/lineWithOffset.ts:6-25`): `aggregation/extension/composition 17.25` / `dependency 6` / `lollipop 13.5` / `arrow_point 4` / `arrow_barb_neo 5.5`; 另有"短边挤位"(`extraRoom=1`, 端点与邻点距离 < marker 高度时反向补足差值 +1px `:96-120`) —— 我们走 `endpointMarker + trimPolyline`, 这套表能当对账基准
- 两套并行表(`markerOffsets` 给 d3 accessor / `markerOffsets2` 给 neo dasharray)且 `lineJump.ts:279-320` 是 `applyMarkerOffsetsToPoints` 的**复制实现**, 两处必须同步 —— 反面样板, 我们"单源"纪律的反证

**3) 跳线(line jump): 想做时的完整策略, 不需要曲线化**

- 判交叉用参数化 `t` 求交, 要求 `1e-6 < tA,tB < 1−1e-6`(`lineJump.ts:100-155`)→ **端点 / T 型 / 共起点都不算交叉**; 方向规则: 一横一竖时给横的跳(弧向上), 同向则后者跳
- 半径三重夹紧 + **两次门禁**(`:493-524`): `room=min(已消耗距离, 段末距离)−CORNER_JUMP_CLEARANCE(2)` → 小于 `jumpRadius*MIN_USEFUL_RADIUS_RATIO(0.6)` 就**丢** → 相邻弧半径和超间距各砍半 → **砍完再查一次**
- 两个常量背后的取舍值得整段引用: `2` 防弧从圆角切点起跳成畸形波浪(`:25-32`); `0.6` 因为"半半径的弧不再越过它要跨的线, 看起来像渲染故障; **不画只是普通交叉**"(`:34-49`)
- `crossingSitsInRoundedCorner`(`:172-205`)**明确承认"折线不是 stroke 所在位置"**, rounded 折点 `cutLen` 内的交叉直接放弃 —— **渲染几何 ≠ 折线几何的显式建模**, 我们若加跳线必须抄这一条
- 干净的部分 `findEdgeIntersections` / `processEdgesWithJumps` / `computeRoundedCorner` 是 DOM-free 的(`:7-13`)

**4) 文本度量: 无浏览器不可复现, 别指望抄**

- `utils.ts:685-757` `calculateTextDimensions`: 往 body 插 `<svg>`+`<text>` 读 `getBBox`, 并**对 `['sans-serif', 配置字体]` 各量一遍取更大者**; 量到 0 直接 throw `'svg element not in render tree'` → **jsdom 也不行, mermaid 没有字符宽度表可抄**
- 两遍流程: HTML label 走 foreignObject + `getBoundingClientRect`, 先用临时尺寸, 量后三态改写(`createText.ts:32-81`); 行高 `1.1`、背景 rect `padding=2` 是仅有的两个可原样抄的常量
- **CJK 无任何宽度表或全角特判**: 中文整段在按空格切词的流程里是一个"词", 只能走 `splitText.ts:38-78` 的**字符级回退**(`Intl.Segmenter` grapheme 逐字加、第一个字放不下也强塞), 效果全靠真值度量
- → 结论: 「估 vs 量」这条缺口 mermaid 没帮我们解决, 它选择的是"必须有浏览器"; 我们能抄的只有 §四 的**采集-回放-过期即失败**契约

**5) 标签摆放对账**

- `utils.ts:321-326` `calcLabelPosition` = 折线弧长 1/2 处线性插值, **只做中点、零避让** → 短边/回折边上标签必然骑线; **这正是我们 label_clearance 门禁存在的全部意义**
- `utils.ts:367-396` `calcCardinalityPosition` 的 `distanceToCardinalityPoint=25`(贴端点回缩)与垂直偏移 10/5 可借为端点标签退避距离
- `labelTransform.ts:22-36`: HTML label `translate(−w/2,−h/2)`; SVG label **必须带 bbox 原点** `translate(−(x+w/2),−(y+h/2))` —— 正是 labelChip 的对账点: **遮罩撑大 bbox 后不带原点补偿, 中心就会偏**
- 组框标题: `utils/subGraphTitleMargins.ts:5-18` 只返回 top/bottom/和, 标题放框外上方再叠 `totalMargin/2`(`clusters.js:112`, `edges.js:292`)
- **别参考** `utils.ts:974-986` `isLabelCoordinateInPath`: 把 `d` 里的浮点四舍五入后做**字符串 `includes`** —— x=5 会匹配任何含 "5" 的数字, 基本随机为真

**6) viewBox / auto-fit: 它没有的正是我们要定的**

`setupGraphViewbox.js:52-74`: `getBBox()` → `width = sWidth + 2p`、`viewBox = "${x−p} ${y−p} ${w+2p} ${h+2p}"`; **无取整、无最小尺寸、无 clamp**(所以 mermaid 输出 20 位浮点 viewBox); `useMaxWidth` 时写 `width:100%` + `max-width:Npx`。另 `setupViewPortForSVG.ts:30-47` 是同一件事的第二份实现。→ 可借的只有"**padding 同时进 width/height 和 viewBox 原点**"的一致性(漏一处内容就偏)与双模尺寸属性写法; 取整与最少尺寸我们自己定。

**7) shapes/ 补哪一种最划算**

1. **菱形**(收益/成本最高): `shapes/question.ts:10-21` 的路径 + `:27-35` 点列(`s=w+h`, 四边中点)+ `intersect.polygon` 一行
2. **圆柱**: `shapes/cylinder.ts:128-152` 的求交是"先 `intersect.rect` 再按椭圆帽修正": `A=ry²(1−x²/rx²)`、`y=ry−sqrt(A)`, **该式对上帽下帽都精确**; 但 `rx=w/2`、`ry=rx/(2.5+w/50)`(`:86-87`)是观感启发式, 别当几何常量。⚠️ 它**在渲染函数里改 `node.width/height`**(`:67/:111-131`)污染 layout 数据, 抄时改纯函数; `linedCylinder.ts:154-179` 是同一算法复制
3. **若把圆/胶囊采成折线, 两个坑必须一起搬**: `stadium.ts` 用 50 点近似弧 → (a) 贴边须对折线而非理想弧; (b) `inscribedDiameter = h·cos(π/(2·(arcPointCount−1)))` 加 `(h−inscribedDiameter)` 补偿"采样点永远不落在 ±w/2"(`:70-75`); `curvedTrapezoid.ts:39-41` 同类修正 `capClearance = r−sqrt(r²−(h/2)²)`
4. 速记: 梯形两侧缩 `h/2`(`trapezoid.ts:19-27`); 六边形斜边 `m=h/f`(f=4, neo 3.5); `createRoundedRectPathD`(`shapes/roundedRectPath.ts:1-45`)**radius 不 clamp**

## 六、不抄清单(及理由)

- `layout-utils/scoreLayout.ts` —— 无消费方 + 裸 `Math.random` + 恒 NaN 占位
- `orthogonalRouter/router.ts` 主体(A* + pipes/tracks + Phase2/Phase3) —— 前提是全局一次性路由, 且无最优保证; 除非我们真要做全局避障
- `materializedGeometry.ts` 十个函数 —— 泳道/渲染物化特化
- `edges.js` `fixCorners` —— 浮点严格相等判直角
- `utils.ts` `isLabelCoordinateInPath` —— 字符串 includes 判几何
- `markers.js` / `edgeMarker.ts` —— 纯 d3 DOM 造 marker, 只有 refX/refY 数值表可抄
- `direction/validation.ts` —— 只报两项 + `log.warn` 不 fail, 与我们 fail-closed 形态不同
- `layout-algorithms/ddlt/*.spec.ts` 的断言 DSL —— 绑 mermaid 的 Sugiyama 前端
- `scoreLayout` 的评分**权重** —— 与我们的美学排序相反(§三.4)

## 七、词表鸿沟、libavoid 证据与建议动作

**1) 词表鸿沟(guide `:446-460` 现成, 直接省我们几轮检索)**

- jog = **bend**; port window = **pin / side constraint**; rail = **track / channel**; group = **compound vertex**
- guide 的 "Before you invent something" 整节: 正交路由 / 压缩 / 端口与侧约束 / 分层流水线 / 交叉最小化**都是几十年的老题**, "读一篇论文通常比自己推启发式再逐个 fixture 撞见失效模式更快"; 并且 "当你明知偏离既有做法时, 在 PR 里写清为什么, 以及你怎么验证这个偏离可行" —— 与本仓"改动必须带论证"的纪律同源

**2) libavoid 证据(影响我们文档里那条"不上 libavoid"的前提)**

- `ddlt/backends.ts:12-44` 明写: domus 子树用自己的分支, 配对函数是 `runDomusBrowserLayout` / **`preloadLibavoidAdapterForLayout`** / `injectDomusEdgeLabelNodes`; 该分支不在 develop 上, 调用即 loud throw
- `.esbuild/server.ts:510-512` 在 dev-explorer 暴露 `libavoid.wasm`
- 即: **mermaid 手写了 2283+2795 行(头注释还挂着 libavoid 家族论文)之后, 新布局直接换 libavoid**。若哪天我们认真要做避障, 这条对照 + 我们的"两盒局部刀"定位一起重判, 而不是继续引旧结论

**3) 建议动作(按性价比)**

1. 补门禁三项(端口三连 / 折点贴端点 10+18 / 共享子路径 8 与近平行 7), 常量直接搬 —— 纯增量、零浏览器
2. `refs/aesthetics.md` 补一节**目标函数选边**: 可读性(Purchase/Ware, 交叉优先) vs 可追踪性(mermaid, 折弯优先), 并写清我们的选择与依据
3. scene 缓存有效期考虑**从单调计数升级为源哈希**(`html_rev` → sha256(HTML/决策源)) —— 计数会在同一轮编辑里假新鲜
4. 谓词/吸附 spec 补"四走向 + 非整数中心 + `toBeCloseTo(…,9)`"形态
5. `route` v0.2 设计只引 `direction/geometry.ts` 的谓词组与单 pass 骨架模式, **不引** A*+pipes 的复杂度
6. 做跳线时抄 `lineJump` 的"半径不足就丢 / 相邻弧互砍 / 砍后复查"与 "折点内交叉放弃"两条策略

**4) 复现入口**

```bash
cd <your-mermaid-clone> && git log -1 --format=%H   # 应为 cf83441...
ls packages/mermaid/src/rendering-util/layout-algorithms/{swimlanes,layout-utils,ddlt}
cat packages/mermaid/src/docs/community/layout-makers-guide.md   # 601 行, 值得整篇读
```
