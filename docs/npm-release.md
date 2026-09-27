---
name: npm-release
description: "把本仓发到 npm 的实况与流程: 0.2.0(260926) 与 0.2.1(260927) 都已发且逐条验收过 · 读路径滞后只属于新包(0.2.0 约一小时 / 0.2.1 七分钟), PUT 202 也算成功 · 写操作的 2FA 走浏览器 URL 授权(pty 下已实测) · 凭据失效时 PUT 给的是 404 不是 401, 那会绕开授权流程, 先 npm login · CI/OIDC 发布是可选档(附唯一判据)"
tags: [svg-infovis, npm, release, oidc, auth]
date: 2026-09-27T10:20:00+08:00
---

# 发布到 npm · 实况与流程

> 这是**操作清单**, 不是设计文档。发布形态的取舍在 `docs/internals/public-api.md`; 立项依据与已知未覆盖在 `ROADMAP.md`。本页只回答"现在什么状态、下次怎么发、怎么验"。

## 实况(260927-10:11 实测)

- 包名 **`@watert/svg-infovis`** —— 260926 从无 scope 的 `svg-infovis` 改成 scoped(理由: 无 scope 名先到先得、不可回收, 第三方注册走它会让用户误以为那是本包); 线上现为 **`0.2.1`**(两条验收都过了, 见「验收」)
- **两个版本都已发, 且都走上同一条流程** —— 环境 **node v22.23.2 / npm 10.9.8**(⚠ 不是仓内 shell 那份 node 20.17 / npm 10.8.2):

  ```text
  0.2.0  260926 22:17 CST   首发占名         PUT 401 → 浏览器授权 → PUT 200   读路径滞后 ~1 小时
  0.2.1  260927 10:10 CST   文档 / skill 面   PUT 401 → 浏览器授权 → PUT 202   读路径滞后 < 7 分钟
  ```

  0.2.0 那次的四行日志(把成功证死):

  ```text
  http fetch PUT 401 https://registry.npmjs.org/@watert%2fsvg-infovis   ← 401 = 要二次验证
  verbose web auth opening url pair                                      ← 浏览器 URL 授权(见下节)
  http fetch GET 202 .../-/v1/done?authId=***                            ← 轮询等批准, 实测 8 次约 4s
  http fetch PUT 200 https://registry.npmjs.org/@watert%2fsvg-infovis    ← 批准后自动重发; exit 0 / info ok
  ```

- ⚠ **0.2.1 那次的 PUT 回的是 202 而不是 200**(260927 实测): `202 Accepted` = 收下了、还在复制队列里 —— npm 照样打 `+ @watert/svg-infovis@0.2.1` / `npm info ok` / exit 0。所以「命令成功」只证明**写路径**收下了, **不证明装得上**
- ⚠ **读路径滞后是「新包」的特性, 不是每个版本的常态**(260927 修正口径): 0.2.0 一次性滞后约一小时(发布当场查不到 → 260926 23:20 放行), 而 **0.2.1 不到 7 分钟就放行**(10:11 查仍是 `0.2.0` → 10:17 出 `0.2.1`)。首发那次最坑的是同一时刻四处自相矛盾 —— tarball 路径 **200**(拿假版本 `9.9.9` 打同一路径 → 404, 排除 CDN 乱答) · `/-/v1/search?text=maintainer:watert` 索引到 `0.2.0` · `npm access list packages` 里有 `read-write`, 而 packument GET 与 `npm install` 都是 **404**(加随机 query 破缓存无效, 落在不同 Cloudflare 边缘 LAX / SJC 也一样)。**推断, 不是结论**: 新包要过一道审计 / 复制队列(用户判断: "以前投毒的事把大家都搞麻爪了"), 之后的版本只是等复制 —— 别把"发完查不到"当成常态去等一小时
- two-factor auth = **`auth-and-writes`**(260926 起)
- 全局链路已通: `~/.bun/install/global/node_modules/@watert/svg-infovis → 本仓`, 而 `svginfo --version` 跟的是**仓内 `dist/`**, 与线上版本无关
- 消费侧(`~/www/github/my-codes` + 其下两处 htmls 项目)已改吃新包名, 两个 vite 项目 build 绿、出图实测通
- 本仓与 my-codes 都已 push; 展示站已 live(站址与 Pages 那两条坑见 `AGENTS.md` 的 website 段)

## 写操作的授权: 默认走浏览器 URL(260926 起, 260927 补完配方)

**规矩**: 要 2FA 的 npm 写操作(`publish` / `deprecate` / 改设置 / owner 类), **默认不索要 OTP** —— 起命令, 把 npm 打印的授权 URL 转给用户, 用户去浏览器点掉, 命令自己接着跑。

- **前提是 TTY**: 没有 TTY 时 npm 不会给 URL, 直接抛 `EOTP` 并只认 `--otp=<6位码>`(260926 实测: `npm deprecate react-native-icloud` 在 `< /dev/null` 下就这么被拦下的)。索要 OTP 的坏处是把一次性凭据落进会话记录 —— 让用户自己在浏览器点更干净
- **agent 侧配方(260927 起整条实测过)**:
  - ✅ 造 TTY: `script -q /dev/null` 在 macOS 上起不来(`tcgetattr/ioctl: Operation not supported on socket`); 用 python 的 `pty.fork()`, 实测子进程 `process.stdout.isTTY === true`
  - ✅ 读 URL: 把命令放**后台任务**跑(它会一直等到用户批准), 从日志里抓 URL 转给用户, 再回头读最终结果
  - ✅ **pty 下 npm 真会走浏览器授权**(260927 发 0.2.1 实测, 这条此前标着"未实测"): pty 里跑 `npm publish --access public --loglevel=verbose`, 照样吐 `web auth opening url pair` + `Authenticate your account at: https://www.npmjs.com/auth/cli/<id>`, 用户点掉后自动重发 PUT。⚠ 带上 `--loglevel=verbose` 才看得见那行 URL
- ⚠ **凭据失效时 PUT 回的是 404 而不是 401** —— 一个会把人引到错方向的坑(260927 实测): `~/.npmrc` 里的 `_authToken` 一旦不被认(2026 那轮 token 收紧), registry 对未认证的写就是 `404 {"error":"Not found"}`。后果有两层: ① 报错文案是「`@watert/svg-infovis@0.2.1` is not in this registry」—— 看着像包名写错 / 版本冲突, 一个字都不提认证; ② npm 只在 **401** 上才拉浏览器授权(`otplease`), 404 直接判死 —— 于是"把 URL 转给用户"那套**根本不会启动**。判据一条就够: **`npm whoami` 回 401 就是凭据死了**, 先 `npm login --auth-type=web`(同一套 pty + URL, 实测能吐 URL 并写回 `~/.npmrc`), 再发

## 待办

- [x] push 本仓 + push my-codes(消费侧那一刀 `2fb01f5`)—— 260926 完成
- [x] **开 2FA** —— `auth-and-writes`
- [x] **首次手动发布占名** —— 260926 22:17; ⚠ scoped 包默认 private, 漏掉 `--access public` 直接失败; ⚠ 发布不可逆, 只能 `npm deprecate`, 不能删名删版本
- [x] **复查读路径放行(0.2.0)** —— 260926 23:20 已放行: `npm view @watert/svg-infovis version` = `0.2.0`, `dist-tags.latest` 指它
- [x] **发布后收尾** —— `v0.2.0`(260926, 指向 `66db13c`)与 `v0.2.1`(260927, 指向 `627a0fd`)两个 tag 都已在 origin, 给以后可能上的 CI 发布留锚点
- [x] **换掉失效凭据** —— 260927: `~/.npmrc` 里那条 token 已不被认(`npm whoami` → 401), 走 `npm login --auth-type=web` 重新登录后才发得出去; 坑的机理见「授权」那节
- [x] **复查读路径放行(0.2.1)** —— 260927 10:17 放行: `npm view @watert/svg-infovis version` = `0.2.1`, `dist-tags.latest` 指它(滞后不到 7 分钟, 口径修正在「实况」那条)
- [x] **README 重写后, npm 页面还是旧版** —— 260927 发 0.2.1 正是为刷这一页(页面上的 README 取自**已发布的 tarball**, 不取自仓库当前状态); 已核: 页面上是新版(92 行、无 frontmatter), `homepage` 同车换成演示站 `https://watert.github.io/svg-infovis/`
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
cd ~/www/github/svg-infovis && bun run verify   # exit 0 / 959 pass / 0 fail
npm publish --dry-run                           # 300 文件 / ~949 kB / 零 warn(260927: skill 参考图过 pngquant, tarball 由 1.2 MB 降到 949 kB)
```

## 验收(260927 10:17 逐条跑过)

- [x] `npm view @watert/svg-infovis version dist-tags homepage` → `version = '0.2.1'` · `dist-tags = { latest: '0.2.1' }` · `homepage = 'https://watert.github.io/svg-infovis/'`
- [x] 干净目录(`/tmp/svgi-021`)里 `npm i @watert/svg-infovis` 后, `node -e "import('@watert/svg-infovis')"` → **269 个导出**(与仓内口径一致)
- [x] `npx svginfo --version` → `0.2.1`; `npx svginfo --help` 出用法表
- [x] 文档侧: 页面上的 README 已是**新版**(92 行、无 frontmatter; 数的命令 `npm view @watert/svg-infovis readme | wc -l`), homepage 指演示站。⚠ 页面里那些指向 `docs/` 的相对链接在页面上仍是死链(包内没有 `docs/`)—— 这正是 `README.md` 末尾那条警示存在的理由, 见 `docs/consuming.md` 的「npm 页面 vs 仓库里」
- [ ] (只有上了 CI 才验) tag 触发的 workflow 绿, 包页面上带 provenance 标记
