---
name: svg-infovis-policies
description: "svg-infovis 纪律全表 13 条: 硬度三档 + 每条守卫与退出条件。改 core 前必读, 编号是稳定 ID(源码注释与 ROADMAP 里的「纪律 N」按此解读)"
tags: [svg-infovis, policies, discipline, core]
date: 2026-09-27T00:40:00+08:00
---

# 纪律全表(改 core 时也不许破)

> 这份为什么**不随 skill 走**: 它的读者是**改了 core 的人** —— 每条都指 `test/*.test.ts` 守卫或源码落点,
> 而只装 skill 的 agent 手上没有 `src/`。分治口径见 `AGENTS.md` 的「skill 与文档的真身在哪」。
>
> **编号是稳定 ID**: 源码注释 / `ROADMAP.md` / `QUICKREF.md` / `skills/svg-infovis/` 里出现的「纪律 N」
> 都按本表编号解读。加新条只许**追加在末尾**, 不许插入 / 重排 / 合并; 改条文可以, 改编号不行
> (守卫 `test/policies.test.ts` 扫全仓「纪律 N」, 断言 N ≤ 本表条数)。
>
> 出图现场的操作禁令在另一份(读者不同): `skills/svg-infovis/SKILL.md` 的「别做」。

**先看硬度, 再看条文** —— 同一份表里混着三种东西, 语气一样不代表后果一样:

- `[硬]` 违反必红或必出错图(有机器守卫 / 有实跑事故) —— 不许破, 破了就是 bug
- `[换]` 有明确代价的取舍 —— 代价可接受时能换, 换前先看它的退出条件
- `[味]` 偏好, 无守卫也无事故出处 —— 它是 review 话题, 不是判决依据

「为什么」分两处, 本表都不重述: **作者视角的 why**(七条短句, 出图够用)在 `skills/svg-infovis/refs/contract.md` §四;
**内核视角的 why**(每条原则的代价 / 退出条件 / 逼它出来的实跑事故)在 `principles.md`。

1. `[换]` **零运行时依赖**。依赖方向单向 `core ← 薄壳 ← 上层`(薄壳当前由 `website/` 担任, 将来可移到仓外), 反向即破。**唯一例外**: `./icons/lucide` 读 **optional 依赖** `lucide-static`(不装也能用库本体与 barrel), 其余子路径零依赖。对外发布形态(`dist/` · `files` · `engines`)见 `public-api.md`; 代价与退出条件 → `../ROADMAP.md` 立项依据 · `principles.md` 的三条口吻
2. `[硬]` **descriptor 双态**。shape 吐纯数据, 字符串化归 `serialize`(唯一字符串出口)。守卫 `test/serialize.test.ts`
3. `[硬]` **字节确定性**。禁 `Date.now` / `Math.random`; 数值 `round1`; 集合按 codepoint 序。守卫 `test/hero-svg.test.ts`(字节等式) + `test/determinism.test.ts`(源码扫描: `src/` `blocks/` `templates/` 逐文件剥注释后零时间源/随机源) + `test/anim-examples.test.ts`(动画示例的产物字节)。**边界**: 它约束的是 core 产物 —— 出图工具要时间戳 / 随机抖动属另一层
4. `[换]` **不搞第二权威**。决策在作者的数据里, core 只算几何; 文档同样, 一个事实一处。**可判的那半点式同源**有守卫(`box` 与 `rectFace` / `portPoint` 一类, 见 `test/box.test.ts`); **"文档别互相抄"这半无守卫**, 靠 review —— 出口纪律被抄成 8 份, 就是栽在这上面
5. `[换]` **渲染器无关**。core 自产文本走 `baselineY`(不用 `dominant-baseline`)、箭端自算几何(不用 SVG `marker`), 换来产物在任意渲染器里长一样; **外来素材 markup 原样透传, 不受此限**。垂直居中 `central = 行心 + 0.35em` **纯公式**(实测墨心 CJK 0.3555–0.3594em, 残差 ≤0.1px)。教训: **别在渲染层加全局 px 补偿** → P6
6. `[硬]` **画布算出血**。描边居中, 外扩 `strokeWidth/2`; viewBox 别写死。
7. `[硬]` **渲染面必须是 scene 的满射**。出图走 `sceneChildren`; 出图后 `grep NaN` 产物。守卫 `test/scene-render-parity.test.ts` → P5
8. `[硬]` **文本要有位置才审得到, 要有内容才上得了屏**。差集在 `phantom_labels` / `phantom_texts`, 不许静默。守卫同上 → P5
9. `[换]` **新门禁自己举证**。两个方向的反例, 外加把每个豁免条件单独松掉的变异测试; 启发式一律 warning。**退出条件**: 假阳性成本超过漏报 → 删掉它, 不是降档 → P7
10. `[硬]` **语义进 scene, 样式留覆盖表, 覆盖表永远赢**。`tone` / `variant` / `shape` 是语义, 不是样式。
11. `[换]` **新判据必须写明作者用哪个旋钮修**。没有旋钮的报错不立项; 元判据在 `test/layering.test.ts` → P7
12. `[味]` **文档里的数字只核自源码, 只写进 `QUICKREF.md` 缺省值表**。本文件与 `README.md` 不另抄一份。"清单只有一份"那半有守卫(`test/examples-manifest.test.ts`), "缺省值表"这半无守卫。
13. `[换]` **core 不猜意图**。不自动 rank / 避障 / 分组 / 换行 —— 自动层一旦进来, 几何纪律就退化成建议。**退出条件**: 手写拓扑到人脑极限(约 20 节点以上) → 把"声明"降级为"描述意图 + 解算", 但**解算层必须落在 core 之外** → P2

## 相关

- 内核视角的 why(代价 / 退出条件 / 实跑事故) → `principles.md` · 分层与准入 → `layering.md`
- 公共面与破坏性改动四步 → `public-api.md` · 演进史存档 → `architecture.md`
- 出图现场的操作禁令(读者是画图 agent) → `skills/svg-infovis/SKILL.md` 的「别做」
- 未做项与立项依据 → `../ROADMAP.md`
