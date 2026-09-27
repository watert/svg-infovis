---
name: svg-infovis-diagnostics
description: "svg-infovis 的门禁码全表: 24 个码(audit 16 / cluster 4 / density 4)逐条给出档位、什么时候喊、往哪个方向修, 另附不进门禁的 nudge / scene / lane 三族。手上那条诊断是什么意思、要不要紧时翻这一份"
tags: [svg-infovis, diagnostics, audit, gates, codes, reference]
date: 2026-09-27T10:40:00+08:00
---

# 门禁码全表

手上有一条诊断, 只想知道"这个码是什么 / 要不要紧 / 往哪修" —— 就查这里。

码的**单一来源是 `src/knives/codes.ts`**(仓内源码), 本表是它在出图现场的那一面。诊断的四段结构(`code / severity / message / subject`)与 `evidence` 里的数怎么读在 `QUICKREF.md` 的「诊断怎么读」; 这里只答码的语义。

## 口径: 24 个码 ≠ 十九项门禁

- `DIAGNOSTIC_CODES` 全长 **24** = audit **16** + cluster **4** + density **4**
- 而门禁清单说"**十九项**": `node_gap` / `node_overlap` 是**同一判据的两个出口**(贴太近 / 重叠), 门禁清单里算一项 ⇒ 几何十四项 + 组语义四条 + 结构校验 `owner_ref` 一项 = 19。audit 的 16 个 **code 键**就是这么来的 —— 门禁清单的一项可以发多于一个码
- **拦不拦出口看档位**: `error` 进 fail-closed(`report.pass === false`, 交付档直接抛); `warning` 只报不拦。有几个码**按档位升降**, 逐行看「档」列
- **「往哪修」只给方向**, 可执行修法在诊断自带的 `supportedFixes` 里(带 `kind` 与可选 `patch`)—— 照它改, 别猜

## 一、audit —— 几何与结构(16)

| 码 | 档 | 什么时候喊 | 往哪修 |
|---|---|---|---|
| `finite_svg` | error | 场景里有数值不是有限数(NaN / Infinity)—— 序列化会写出 `NaN`, 产物当场报废 | 顺 `evidence.offenders` 找那个对象的坐标 / 尺寸字段 |
| `single_svg` | error | 有元素越出画布(viewBox 装不下)—— 产物会被裁切或隐式缩放 | 挪回来; 或出口给 `fit: true` 让画布按内容重算(看 `evidence.canvas` 与 `offenders`) |
| `orthogonal_edges` | error | 某条边有一段不正交 | 折点列交给 `routeOrthogonal` 解算, 别手填坐标 |
| `node_gap` | warning(standard) → **error**(showcase) | 两个节点挨得太近(净空 < 档位阈值) | 挪开; `supportedFixes` 直接给候选位移 |
| `node_overlap` | error | 两个节点的盒重叠 | 同 `node_gap` —— 重叠是它更硬的出口 |
| `label_clearance` | warning(standard) → **error**(showcase); 净空无法判定时恒 error | 边标签的遮罩压到了**别的**边(净空不足) | 先挪标签, 再调折线。**不许靠删标签了事** —— 语义不是几何 |
| `text_clearance` | warning(standard) → **error**(showcase) | 旁注 / 自由文本距边太近, 或被边穿过 | 挪文本或改折线; 声明了 `owner` 的那条边豁免, 此时 `metrics` 记 `-1`(「没有测量对象」不是"合格") |
| `text_overlap` | error | 文本压在节点上 / 与另一段文本重叠 / 骑在组框边线上 | 挪开; 骑框线时"一半在内一半在外", 归属当场读不出来 |
| `label_fit` | error | 节点主标签 / 次标签的文字宽超过盒内可用宽 | 用 `nodeFit` 反算盒宽(别手定盒), 或缩短文案 |
| `edge_node_clearance` | error | 边从节点身上穿过 | 用 `via` 声明绕行折点, 或改端口 —— `routeOrthogonal` **不会**自动避障 |
| `no_backtrack` | error | 折线在某个折点原地折回, 或某段叠在自己另一段上 | 折点列写法错了, 回 `routeOrthogonal` 重新解 |
| `edge_degenerate` | error | 折点少于 2 个, 或折线塌缩(长度为零)—— **其余门禁全都跳过它** | 补折点; 退化边画不出长度与箭头, 静默通过最危险 |
| `port_crowding` | error | 两条边在同一节点上的附着点太近, 或看着分开了但投影回盒后重合 | 分叉 / 汇合拓扑让两条边吃**同一个端口点**(共享端点); 端口有语义才摊开 |
| `endpoint_approach` | error(短直段) / warning(进盒前蹭盒边) | ① 端点前直段不足 `STUB_MIN`(10px), 折弯会顶在箭头下面 ② 进本端盒前那一段贴着盒边蹭过来(< `END_BAND` 18px), 看不清是"进"还是"路过" | ① 首末段加长到 10px 以上(或换端口 / 拉开两盒 —— 别靠缩 stub 硬塞) ② 换入口面, 或把这段腰线推离一些 |
| `edge_overlap` | error(共线) / warning(近平行) | 两条边有一段画在同一条线上(看着是一条), 或平行段贴得太近 | 分叉 / 汇合拓扑走共享端口(共干段豁免生效); 否则错开腰线至少 `LANE_STEP_MIN`(15px), 或 `assignLanes` |
| `owner_ref` | error | 文本的 `owner` 不是 `{ kind, id }` 形态, 或引用的 id 不存在 | 写对引用。幽灵归属会让归属豁免**静静失效** —— 那种"看起来配了豁免"比漏报更贵 |

## 二、cluster —— 组语义自洽(4, 全是 error)

这四条判的是"框的**声明**与**几何**有没有矛盾", 全部进 fail-closed。

| 码 | 档 | 什么时候喊 | 往哪修 |
|---|---|---|---|
| `cluster_member_outside` | error | 组框声明的成员不在 scene 里, 或不在框内(越出若干 px)—— 声明与几何漂开了 | 挪进框, 或 `fitGroupFrames` 让框跟随内容 |
| `cluster_frame_cross` | error | 两个组框部分重叠, 且成员也有重合 —— 谁装谁说不清 | 两框分开, 或改成明确的包含关系(嵌套) |
| `cluster_nesting_contradiction` | error | 一个框在几何上包含另一个框, 但被包含者声明的身份不在外层声明里 | 让声明与包含关系一致 |
| `cluster_border_clearance` | error | 成员距框线太近(< `BORDER_CLEARANCE` 24px) / 框线切过节点 / 框整个嵌在节点盒里 / 边横穿组框 / 边沿框线跑 | 重排留出内距; 派生框走 `fitGroupFrames`(缺省 pad 已含余量, 不必再调) |

## 三、density —— 密度与长边(4, 全是 warning)

`density()` 这四条**永不进 fail-closed**。它们的用途是提示"这张图想说的东西可能被版式压掉了" —— **设计期声明过的可以跳过; 没声明的问一句是漏写还是没想到**(QUICKREF「动手前」那条)。

| 码 | 档 | 什么时候喊 | 往哪修 |
|---|---|---|---|
| `cluster_corridor` | warning | 组框内有一道长空白走廊(框被拉得比内容长, 或有节点被排到了对面); **空框**也报这条 | 收紧框, 或把对面那批节点挪回来 |
| `mixed_cluster_row` | warning | 同一层里混了多个分组(常伴随横扫的长边) | 让分层与分组一致, 别把一伙人拆到同一层 |
| `long_edge` | warning | 某条边的长度是画布对角的很大比例(相对本图中位数), 横扫全图 | 换版式缩短跨度, 或用 `assignLanes` / 分组把路径收束 |
| `cluster_overlap` | warning | 两个组框交叠, 而两边成员互不相干 | 框要么分开, 要么用包含关系说清谁装谁 |

## 四、另外三族码(不进 `DIAGNOSTIC_CODES`)

这三族**也发诊断**, 但口径与 fail-closed 无关 —— 看到它们不代表图要重画:

- **`nudge` 刀**(吸附 / 对齐的参数错): `nudge_invalid_rect` · `nudge_invalid_param` · `snap_no_targets` · `distribute_overflow`
- **`assignLanes`**: `lane_band_overflow` —— 带内 N 条边按最小间距铺开需要的跨度 > 公共可行域, 铺不开, 必有边被压在同一条腰线上。分配器是**旋钮不是门禁**, 判不判 fail-closed 由 `audit()` 说了算
- **`scene` 层**(归属与缓存): `manual_bounds_protected` · `node_not_found` · `scene_hash_missing`

## 这张表怎么保真

它是**手写**的 —— 码的"含义"是人的经验, 不像数值那样能从源码生成(那种能生成的产物在 `scripts/build-skill-shots.ts`)。所以靠守卫盯着: `test/skill-docs.test.ts` 断言上面**三张表里的码与 `src/knives/codes.ts` 的 `DIAGNOSTIC_CODES` 一一对应** —— 内核加码而这里没补、或这里留着已删的码, `bun run verify` 当场红。
