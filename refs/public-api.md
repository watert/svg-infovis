---
name: svg-infovis-public-api
description: "svg-infovis 的公共承诺面: exports 子路径即 API · 无版本号 symlink 直出下的变更分级与破坏性变更 SOP · 诊断码的兼容面"
tags: [svg-infovis, public-api, semver, migration, contract]
date: 2026-09-26T01:20:00+08:00
---

# 公共承诺面与破坏性变更 SOP

> 这篇只服务一件事: **改坏了会炸谁, 以及怎么改才炸不到人**。
> 分层与准入 → `refs/layering.md` · 为什么这么切 → `refs/principles.md` · 验证纪律 → `../AGENTS.md`。

## 公共面就是 `package.json` 的 `exports` 子路径

现状 **46 条**(按目录: `geometry` 9 / `shapes` 11 / `knives` 13 / `icons` 3 / `blocks` 2 /
descriptor · serialize · embed · scene · export · theme · guard · barrel 各 1)。数它别数人脑。

- `exports` 直指 `./src/*.ts` —— **纯 TS, 无 `dist/`, 不发 npm**。裸 import
  (`from 'svg-infovis/knives/fit'`)只在已 `bun link svg-infovis` 的项目里可解析;
  全局 CLI `svginfo` 只要 PATH 命中就能用。
- **不在公共面里**: `templates/*`(仓内按路径引)、`examples/*`、`scripts/*`、`refs/*`、`test/*`。
  这几个目录**改起来不用守兼容**, 该改就改。
- 改一个子路径名 = 搬家 = 破坏(见分级 L3)。子路径清单**不在文档里抄一份**, 以 `package.json` 为唯一权威。

## 为什么没有版本号兜底

链路是全链 symlink: `~/.bun/bin/svginfo → scripts/cli.ts`, 全局包目录 → 本仓。源码一存盘就
**立刻**对所有消费者生效 —— 没有构建窗口、没有"上个版本还能跑"。

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

## 什么时候该停止裸 TS 直出

判据只有一条: **开始有人不能承受"源码一存盘就生效"**。目前不该动, 因为:

- 依赖方向是 `core ← 薄壳 ← 上层`, core 侧零依赖零构建, 引入 `dist/` 会让"改完即生效"这条
  最大的开发体验优势消失;
- 本仓没有第三方 npm 消费者, 发包是"以后再说"(见 `../ROADMAP.md`)。

若将来真发 npm 或上构建, `../AGENTS.md` 的「铁律: 没有『同步全局包』这个动作」整段作废 ——
流程换成"commit 后重新构建 + 同步全局", 并**同步改那一份**, 别留两套流程并存。

## 相关

- 分层与准入 → `refs/layering.md` · 原则 → `refs/principles.md` · API 索引(什么在哪个子路径)→ `../README.md`
- 纪律与验证 → `../SKILL.md` / `../AGENTS.md` · 未做项 → `../ROADMAP.md`
