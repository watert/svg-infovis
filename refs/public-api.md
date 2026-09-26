---
name: svg-infovis-public-api
description: "svg-infovis 的公共承诺面: exports 子路径即 API · symlink 直连下游与 npm 发布两条链下的变更分级与破坏性变更 SOP · 诊断码的兼容面"
tags: [svg-infovis, public-api, semver, migration, contract]
date: 2026-09-26T01:20:00+08:00
---

# 公共承诺面与破坏性变更 SOP

> 这篇只服务一件事: **改坏了会炸谁, 以及怎么改才炸不到人**。
> 分层与准入 → `refs/layering.md` · 为什么这么切 → `refs/principles.md` · 验证纪律 → `../AGENTS.md`。

## 公共面就是 `package.json` 的 `exports` 子路径

**清单不在文档里抄一份 —— 以 `package.json` 为唯一权威, 数它别数人脑。**

- `exports` 指向 **`dist/`**(编译产物): 每条子路径是 `types` / `import` / `default` 三条件映射,
  **逐条列举、不用通配**(通配会让内部文件自动变成公共面 —— 白名单纪律); **ESM-only**, 不给 CJS。
  裸 import(`from '@watert/svg-infovis/knives/fit'`)在仓内走 `bun link` 的 symlink, 对外走 npm 装的包 ——
  两条链解析到的都是**构建产物**, 所以改完源码不构建 = 下游跑的仍是上一版(`../AGENTS.md`「铁律」)。
  全局 CLI `svginfo` 走 `bin` → `dist/scripts/cli.js`(shebang 是 `node`), 只要 PATH 命中就能用。
- **不在公共面里**: `templates/*`(仓内按路径引)、`examples/*`、`scripts/*`、`refs/*`、`test/*`。
  这几个目录**改起来不用守兼容**, 该改就改。
- 改一个子路径名 = 搬家 = 破坏(见分级 L3)。

## 本地这条链没有版本号兜底(对外那条有)

工作区里下游吃的是全链 symlink: `~/.bun/bin/svginfo → dist/scripts/cli.js`, 全局包目录 → 本仓。
构建产物一落盘就**立刻**对所有 link 过来的消费者生效 —— 没有"上个版本还能跑", 也没有回滚窗口。
(npm 装的用户那边有 semver, 升不升由他决定; 工作区这些消费者不吃版本号。)

所以本仓的"兼容性"不是靠版本号, 是靠**改的姿势**:

- 破坏性改动**当场炸到下游**, 不存在"回滚窗口"。因此没有"先合并再说"的余地。
- 反过来, 半成品没有版本号兜底, 会把所有下游一起炸到 —— 所以纪律是**一次性做完**,
  不留半兼容的过渡层(过渡层本身就是第二权威, 见 P4)。
- 唯一要重新 `bun link` 的场景: 本仓路径变更 / 重命名, 或 `~/.bun/install/global` 被清。

## 下游是谁(改之前先知道炸谁)

| 消费侧(在 `~/docs` vault 侧) | 形态 | 敏感度 |
|---|---|---|
| 画图 skill(`~/docs/rules/user-skills/mini-diagram/scripts/*.ts`) | `bun link` 裸 import + `ssr-charts.ts` | **高**: 改内核当天就跑到别人画图的主路径上 |
| vite 看板 / deck(`~/docs/htmls/2609-*-*/`) | `bun link` import | 中 |
| `~/docs/refs/archify-explore/mini-diagram-repro/*` | 复现快照 | 低(存档, 坏了不改) |
| 全局 CLI `svginfo` | PATH | 中(agent 主力入口) |

`exportScene` / `audit` 的**门禁码**是跨仓契约: 报告高亮、agent 的按码分流都认它。

## 变更分级

| 级 | 是什么 | 判定 | 要求 |
|---|---|---|---|
| **L0 纯增量** | 新增导出 / 新增可选旋钮(带缺省) / 新增诊断码 | 旧代码不改一行仍编译仍过 | `bun run verify` 绿; 新码在注册表登记 |
| **L1 口径修正** | 同一旋钮的口径收窄, 但作者用法不变(例: 墨心补偿删掉改纯公式) | 调用点不用改, **产物字节会变** | 绿 + **重出产物**并在 commit 里点名哪些 SVG 变了; 顺手扫下游有没有依赖旧产物的断言 |
| **L2 签名破坏** | 改参数 / 改返回结构 / 删导出 | 调用点必须改 | 见下面"破坏性改动四步" |
| **L3 搬家 / 改名** | 子路径改名、层间搬家(如 `shapes/x` → `blocks/x`) | import 路径 + 归属层都变 | 同 L2, 外加**改 `package.json` 的 `exports`** 与 barrel 注释里的排序说明 |

⚠ **边界情况**: 往"轴一"靠(见 `refs/layering.md`)的改动 —— 从 shapes 搬到 blocks、从"kernel 推"
改成"作者声明" —— **算 L2, 不算 L1**。哪怕签名一个字没变, 语义已经变了: `ratio` 从自动归一化变成
作者声明的已算好的数, 下游算错会静默出错图。这类改动的汇报里必须显式喊出来。

## 破坏性改动四步(L2 / L3)

1. **一次性做完, 不留半兼容**。过渡函数/旧名 re-export 一律不留(违反 P4: 第二权威)。
2. **同仓迁移**:`examples/`(全量, 包括示例里的期望坐标)、`templates/`、`scripts/`、`refs/build-arch*.ts`
   全改; `bun run verify` 绿。示例字节若变了, 按 L1 的要求在 commit 里交代。
3. **点名下游**: 汇报里写清"改了什么签名 / 谁在用 / 需不需要动"。vault 的画图 skill 与 htmls 看板
   不会被自动验证 —— **你要么自己跑一遍它的主路径, 要么明确说"下游未验证"**。
   拿"verify 绿了"当"下游没事"是本仓最容易犯的自欺。
4. **拆 commit**: 行为改动与文档/产物重出分开, 便于回滚与 diff 审阅(同文件内可合)。

## 加诊断码的特殊注意

- 码注册表 `src/knives/codes.ts` 是**单一来源**, 发射点一律从表里取, 不许再写字面量。
- 判据在 `test/codes-registry.test.ts`: 三把刀在样本 scene 上**实际产出的码集合 ⊆ 注册表**
  (差集必须可见 —— 码会不会喊疼由真实样本证明, 别手抄期望值)。
- **加码是 L0, 但对下游是破坏**: 下游的覆盖表可能按已知码分流, 遇到新码要么高亮要么吞掉。
  所以加码的汇报里要带上新码名, 别只说"加了个门禁"。
- **删码 / 改码 = L2**: 码是对外契约, 改名要同时改下游分流。

## 给 `Descriptor` 联合加一个新 kind

与加诊断码同族, 但**后果更阴**, 单独立一节。`./descriptor` 是公共面的一条子路径, `exports` 里 `types` 与
`import` 并列 —— **类型本身也是承诺面**; 而 `Descriptor` 是判别联合(`kind` 字段), 消费方几乎必然写 `switch (d.kind)`。

- **分级: 名义 L0(纯增量), 对下游是破坏** —— 旧代码若带 exhaustiveness 检查会**编译失败**(那反而是好事,
  炸得响); 若没带(常见的 `default` 兜底), 新 kind 会**静默漏渲染** —— 图上少一块东西、退出码 0、
  `audit` 全绿(它审的是 scene, 不是 descriptor)。这比加诊断码危险: 加码最多是下游分流认不出,
  加 kind 是**渲染面不是 descriptor 的满射**, 与「渲染面 = 审计面」同族的老病。
- **所以新 kind 的汇报口径**: 不许只说"加了种新形状", 要点名 ① 新 kind 名 ② `serialize` 的 case
  已同步 ③ **上屏路径认它**(`sceneChildren` / `tryExport` / React 薄壳三处都要过一遍)④ 存量消费方里
  哪些 `switch` 缺 `default` 分支。
- **判据**: 一个 kind 只有**全部上屏路径都认它**才算真的存在。所以加 kind 与加码一样, 归 L0 但要在
  commit 里显式喊; 若为它改动已有 `Descriptor` 消费方的控制流, 那就是 L2。

## 已上 `dist/`(260926): 代价记账

判据本来是"开始有人不能承受『源码一存盘就生效』" —— 260926 因为**要发布为通用 npm 包**付了这一笔。
本节记的是**代价**, 不是"未来选项":

- **多了一步构建**: 消费者(link 过来的下游 / npm 装的用户)看到的永远是产物, 所以"改完即生效"这条最大的
  开发体验优势消失 —— 改源码不构建, 他们跑的还是上一版。故 `bun run verify` 必须含 `bun run build`
  (**只跑 `bun test` 不算绿**); `prepare` 只保证 `bun link` / git URL 安装时构建一次, 仓内改完仍要自己跑。
- **产物与源码必须同源**: `dist/` 是派生产物、gitignored、**不许手改**; 它进 `files` 白名单(要发出去),
  但版本库里没有它 —— 出现的任何一份都只许由 `tsc -p tsconfig.build.json` 生成。
- **源码的相对 import 一律带 `.js` 扩展名**(磁盘上仍是 `.ts`): 消费侧 `moduleResolution: nodenext`
  认的就是这个; 新文件漏了, 构建产物在 node 侧解析不到。
- **已知未覆盖**(别当支持): `moduleResolution: node`(node10 老档)不认; CJS `require` 不支持(ESM-only);
  纯 node 用户要 `engines >= 20.16`(源指纹那档走 node 内置 `node:crypto`, 经 `getBuiltinModule` 取, 20.16 起回移可用);
  **浏览器侧算 `decisionDigest` 仍不支持**。

## 相关

- 分层与准入 → `refs/layering.md` · 原则 → `refs/principles.md` · API 索引(什么在哪个子路径)→ `../README.md`
- 纪律与验证 → `SKILL.md` / `AGENTS.md`(仓内) · 未做项 → `ROADMAP.md`(仓内)
