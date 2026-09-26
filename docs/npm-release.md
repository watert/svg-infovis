---
name: npm-release
description: "把本仓发到 npm 的实况与流程: 首发已执行(260926) 但读路径当时还没放行(疑似新包审计) · 写操作的 2FA 默认走浏览器 URL 授权 · CI/OIDC 发布是可选档(附唯一判据)"
tags: [svg-infovis, npm, release, oidc, auth, todo]
date: 2026-09-26T22:30:00+08:00
---

# 发布到 npm · 实况与流程

> 这是**操作清单**, 不是设计文档。发布形态的取舍在 `refs/public-api.md`; 立项依据与已知未覆盖在 `ROADMAP.md`。本页只回答"现在什么状态、下次怎么发、怎么验"。

## 实况(260926-22:20 实测)

- 包名 **`@watert/svg-infovis`** —— 260926 从无 scope 的 `svg-infovis` 改成 scoped(理由: 无 scope 名先到先得、不可回收, 第三方注册走它会让用户误以为那是本包); 版本 **`0.2.0`**
- **首发已执行** —— 260926 22:17 CST `npm publish --access public`, 环境是 **node v22.23.2 / npm 10.9.8**(⚠ 不是仓内 shell 那份 node 20.17 / npm 10.8.2)。日志四行把成功证死:

  ```text
  http fetch PUT 401 https://registry.npmjs.org/@watert%2fsvg-infovis   ← 401 = 要二次验证
  verbose web auth opening url pair                                      ← 浏览器 URL 授权(见下节)
  http fetch GET 202 .../-/v1/done?authId=***                            ← 轮询等批准, 实测 8 次约 4s
  http fetch PUT 200 https://registry.npmjs.org/@watert%2fsvg-infovis    ← 批准后自动重发; exit 0 / info ok
  ```

- ⚠ **但读路径当时还没放行**(260926 22:20 实测), 同一个时刻四处在自相矛盾 —— "它在" 与 "查无此包" 并存:
  - **说它在**: tarball `.../@watert/svg-infovis/-/svg-infovis-0.2.0.tgz` → **200**(反证: 拿假版本 `9.9.9` 打同一路径 → 404, 所以这个 200 不是 CDN 乱答) · `/-/v1/search?text=maintainer:watert` 索引到 `@watert/svg-infovis 0.2.0 @ 2026-09-26T14:17:23.060Z` · `npm access list packages` 列出 `@watert/svg-infovis: read-write`
  - **说没有**: packument `GET /@watert%2Fsvg-infovis` → **404**(加随机 query 破缓存无效, 且落在不同 Cloudflare 边缘 LAX / SJC 与 SJC 各一次 —— 不是边缘缓存的问题) · npmmirror 镜像也还没同步到 · `npm install @watert/svg-infovis` 当场 404
  - **推断, 不是结论**: 新包进了审计 / 复制队列, 写路径先落地、读路径后放行(用户判断: "以前投毒的事把大家都搞麻爪了")。**待复查**就是重跑一次 `npm view @watert/svg-infovis version`, 出 `0.2.0` 即放行, 那时再跑「验收」那节
- two-factor auth = **`auth-and-writes`**(260926 起)
- 全局链路已通: `~/.bun/install/global/node_modules/@watert/svg-infovis → 本仓`, `svginfo --version` = 0.2.0
- 消费侧(`~/www/github/my-codes` + 其下两处 htmls 项目)已改吃新包名, 两个 vite 项目 build 绿、出图实测通
- 本仓与 my-codes 都已 push; 展示站已 live(站址与 Pages 那两条坑见 `AGENTS.md` 的 website 段)

## 写操作的授权: 默认走浏览器 URL(260926 起)

**规矩**: 要 2FA 的 npm 写操作(`publish` / `deprecate` / 改设置 / owner 类), **默认不索要 OTP** —— 起命令, 把 npm 打印的授权 URL 转给用户, 用户去浏览器点掉, 命令自己接着跑。

- **前提是 TTY**: 没有 TTY 时 npm 不会给 URL, 直接抛 `EOTP` 并只认 `--otp=<6位码>`(260926 实测: `npm deprecate react-native-icloud` 在 `< /dev/null` 下就这么被拦下的)。索要 OTP 的坏处是把一次性凭据落进会话记录 —— 让用户自己在浏览器点更干净
- **agent 侧配方**, 两半实测过一半:
  - ✅ 造 TTY: `script -q /dev/null` 在 macOS 上起不来(`tcgetattr/ioctl: Operation not supported on socket`); 用 python 的 `pty.fork()`, 实测子进程 `process.stdout.isTTY === true`
  - ✅ 读 URL: 把命令放**后台任务**跑(它会一直等到用户批准), 从日志里抓 URL 转给用户, 再回头读最终结果
  - ❓ **未实测**: 用上面这套 pty 起 `npm publish` 时, npm 是否真吐 `web auth opening url pair` —— 用户交互发布那次确实吐了(见上节日志), 但"用户终端"与"agent 的 pty"不是同一个环境。下次真发版时顺手确认, 别把这条当已验证

## 待办

- [x] push 本仓 + push my-codes(消费侧那一刀 `2fb01f5`)—— 260926 完成
- [x] **开 2FA** —— `auth-and-writes`
- [x] **首次手动发布占名** —— 260926 22:17; ⚠ scoped 包默认 private, 漏掉 `--access public` 直接失败; ⚠ 发布不可逆, 只能 `npm deprecate`, 不能删名删版本
- [x] **复查读路径放行** —— 260926 23:20 已放行: `npm view @watert/svg-infovis version` = `0.2.0`, `dist-tags.latest` 指它(「读路径当时自相矛盾」那段就此结案)
- [ ] **发布后收尾** —— 打 tag `v0.2.0` 推到仓库, 给以后可能上的 CI 发布留锚点
- [ ] **README 重写后, npm 页面还是旧版** —— 页面上的 README 取自**已发布的 tarball**, 不是仓库当前状态; 仓根 README 260926 已重写(去掉 frontmatter、219 行压到 90 行), 要让它上 npm 页面得**发一个 0.2.1**
- [ ] **(可选) CI 发布** —— `publish.yml` + trusted publisher。**默认不做**: 首发无论如何都得手动(trusted publisher 要绑一个已存在的包, 这是个死结), 而本仓一年也没几个版本, 手工发布那点摩擦正好逼你看一眼 verify 与 `git status`
  - 唯一判据: 首次出现「npm 上的版本与某个 commit 对不上」, 或确认这个包要进别人的依赖树、要拿 provenance 当对外承诺。成本没有时效性, 那时补和现在补一样
  - 要补时: trusted publisher 在**包设置页**配(不是 CLI), 绑 repository `watert/svg-infovis` + workflow `publish.yml`; workflow 走 `on: push: tags: ['v*']` → `permissions: id-token: write` → 构建 + 测试 → `npm publish --provenance`

## 2026 的发布规则(背景, 别按老套路写 workflow)

- 经典 npm token 已被撤销(2025-12 起撤, 2026-02 截止)
- 2FA-bypass 的 granular access token: 2026-08 起不能做账号/包管理动作; 约 2027-01 起不能直接发布
  - ⚠ 这条管的是**无人值守的 CI 发布**, 不管**人坐在终端前发布**: 交互式 `npm publish` 照旧可用, 差的只是那一次授权(260926 实测)
- 官方替代是 **OIDC trusted publishing** —— GitHub Actions 声明 `id-token: write`, npm 验证"这次 workflow 运行"的身份: 没有可偷的长期凭据, 也不需要人工授权
- 出处: [npm Docs · Requiring 2FA for package publishing](https://docs.npmjs.com/requiring-2fa-for-package-publishing-and-settings-modification/) · [GitHub Changelog · Restricting npm bypass-2FA GATs](https://github.blog/changelog/2026-07-31-restricting-npm-bypass-2fa-granular-access-tokens/) · [npm community discussion #161015 (OIDC)](https://github.com/orgs/community/discussions/161015)

## 发布前的复核命令

```bash
npm view @watert/svg-infovis version            # 发新版之前先看当前线上是哪个版本
cd ~/www/github/svg-infovis && bun run verify   # exit 0 / 947 pass / 0 fail
npm publish --dry-run                           # 286 文件 / ~833 kB / 零 warn
```

## 验收(读路径放行之后才谈得上)

- [ ] `npm view @watert/svg-infovis` 有 `0.2.0`, 且 `dist-tags.latest` 指它
- [ ] 干净目录里 `npm i @watert/svg-infovis` 后, `node -e "import('@watert/svg-infovis')"` 拿到 269 个导出
- [ ] `npx svginfo --help` 能出用法表
- [ ] 文档侧: README 的安装段与 `npx skills add` 段在 npm 页面上都读得通(包内没有 `refs/` 与 `docs/`, 相对链接只对仓库有效 —— 见 `consuming.md` 的「npm 页面 vs 仓库里」提示)
- [ ] (只有上了 CI 才验) tag 触发的 workflow 绿, 包页面上带 provenance 标记
