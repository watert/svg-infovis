---
name: npm-release
description: "把本仓发到 npm 的现状与待办: 包名 @watert/svg-infovis · 2026 发布规则(token 路线已废, 走 OIDC trusted publishing) · 首次手动占名 → 配 trusted publisher → publish.yml 的步骤与验收"
tags: [svg-infovis, npm, release, oidc, ci, todo]
date: 2026-09-26T21:30:00+08:00
---

# 发布到 npm · 现状与待办

> 这是**操作清单**, 不是设计文档。发布形态的取舍在 `refs/public-api.md`; 立项依据与已知未覆盖在 `ROADMAP.md`。本页只回答"现在差哪几步、每步怎么验"。

## 现状(260926-21:30 实测)

- 包名 **`@watert/svg-infovis`** —— 260926 从无 scope 的 `svg-infovis` 改成 scoped(理由: 无 scope 名先到先得、不可回收, 第三方注册走它会让用户误以为那是本包)
- 版本 `0.2.0`(260926 从 `0.1.0` bump —— v0.x 号归 infograph 排期, 0.2 即排版层), **尚未发布** —— `npm view @watert/svg-infovis` 实测 E404
- npm 账号 `watert` 已在本机登录(`npm whoami` 通过, 邮箱 boatwind@gmail.com 已验证); **two-factor auth = `auth-and-writes`**(260926 21:25 CST 那个时间点起)
  - ⚠ 后果: 所有写操作(`publish` / `deprecate` / 改设置)都要过一次 OTP —— CLI 在真终端里会**交互式**问, 非交互(脚本 / agent)必须 `--otp=<code>` 否则当场 `EOTP`(实测: `npm deprecate react-native-icloud` 就是这么被拦下的)
  - 未验证: 这档用的是 passkey/WebAuthn 还是 TOTP(app 里给的就是 6 位码, 两种都能过 `--otp`)
- 全局链路已通: `~/.bun/install/global/node_modules/@watert/svg-infovis → 本仓`, `svginfo --version` = 0.2.0(260926 实测)
- 消费侧(`~/www/github/my-codes` + 其下两处 htmls 项目)已改吃新包名, 两个 vite 项目 build 绿、出图实测通

## 待办

- [ ] **push 本仓** —— 本地 `main` ahead。`git push origin main` 的副作用: 触发 `.github/workflows/pages.yml` 建站并部署 Pages
- [ ] push my-codes(消费侧那一刀, commit `2fb01f5`)
- [x] **开 2FA** —— 260926 已开 `auth-and-writes`; 发布时留意上一条的 OTP 麻烦
- [ ] **首次手动发布占名**: `npm publish --access public`(真终端里会问一次 OTP)
  - ⚠ scoped 包默认 private, 漏掉 `--access public` 直接失败
  - ⚠ 发布不可逆 —— 只能 `npm deprecate`, 不能删名删版本
- [ ] **配 trusted publisher**(在 npmjs.com 的包设置页, 不是 CLI): repository = `watert/svg-infovis`、workflow 文件名 = `publish.yml`、environment 建议留一个
- [ ] **写 `.github/workflows/publish.yml`**(尚未写):
  - `on: push: tags: ['v*']` → `permissions: id-token: write` → 构建 + 测试 → `npm publish --provenance`
  - ⚠ **一个 token 都不要存**: 2026-08 起 2FA-bypass 的 granular token 已不能做账号/包管理动作, 约 2027-01 起连直接发布也要被砍 —— 唯一活路是 OIDC
  - ⚠ 首次发布**必须**手动, 因为 trusted publisher 要绑一个已存在的包
- [ ] 打 tag `v0.2.0` 走一遍 CI 发布, 验证 OIDC 链路 —— 这是"以后能不能自动发版"的分水岭

## 2026 的发布规则(背景, 别按老套路写 workflow)

- 经典 npm token 已被撤销(2025-12 起撤, 2026-02 截止)
- 2FA-bypass 的 granular access token: 2026-08 起不能做账号/包管理动作; 约 2027-01 起不能直接发布
- 官方替代是 **OIDC trusted publishing** —— GitHub Actions 声明 `id-token: write`, npm 验证"这次 workflow 运行"的身份: 没有可偷的长期凭据, 也不需要人工 OTP
- 本地 `npm publish` 对开了 2FA 的账号会要一次 WebAuth / passkey 确认
- 出处: [npm Docs · Requiring 2FA for package publishing](https://docs.npmjs.com/requiring-2fa-for-package-publishing-and-settings-modification/) · [GitHub Changelog · Restricting npm bypass-2FA GATs](https://github.blog/changelog/2026-07-31-restricting-npm-bypass-2fa-granular-access-tokens/) · [npm community discussion #161015 (OIDC)](https://github.com/orgs/community/discussions/161015)

## 首发前的复核命令

```bash
npm view @watert/svg-infovis version            # 最后一刻再看一眼: 应为 E404
cd ~/www/github/svg-infovis && bun run verify   # exit 0 / 947 pass / 0 fail
npm publish --dry-run                           # 289 文件 / ~847 kB / 零 warn
```

## 验收(发出去之后)

- `npm view @watert/svg-infovis` 有 `0.2.0`, 且 `dist-tags.latest` 指它
- 干净目录里 `npm i @watert/svg-infovis` 后, `node -e "import('@watert/svg-infovis')"` 拿到 269 个导出
- `npx svginfo --help` 能出用法表
- 仓库侧: tag 触发的 workflow 绿, 包页面上带 provenance 标记
- 文档侧: README 的安装段与 `npx skills add` 段在 npm 页面上都读得通(包内没有 `refs/` 与 `docs/`, 相对链接只对仓库有效 —— 见 README 的「npm 页面 vs 仓库里」提示)
