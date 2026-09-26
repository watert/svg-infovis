// =====================================================================
// runtime · 「本模块是不是入口」的可移植判定(260926)
//
// 为什么有它: `import.meta.main` 是 **bun 专有** —— node 下它是 `undefined`, 于是 CLI 会静默
// 什么都不做、模板会静默不出图(退出码还是 0, 看着像成功)。silent failure 是坏得最彻底的一种,
// 所以这条判定收在本文件**一处**, 出口尾巴统一写 `if (isMainModule(import.meta.url)) …`。
//
// 判据只有一条: 当前模块的 URL 与 `process.argv[1]` 指向**同一份真实文件**。两侧都过一遍
// `realpathSync` 不是洁癖, 是实测出来的必须 —— 相对路径启动 / symlink 启动(`svginfo` → 仓内脚本)
// / macOS 的 `/tmp` 与 `/private/tmp` 下, `import.meta.url` 那侧是 realpath 而 `argv[1]` 那侧
// 保留调用者写的写法(node 实测), 不归一就漏判。三态判据在 `test/runtime-main.test.ts`。
//
// ⚠ 为什么本文件**一句静态 `node:` import 都没有**: 它经 `src/index.ts` 进 barrel, 而 barrel 是
// 浏览器 demo 也吃的(与 `scene.ts` 的 sha256 同一条纪律)。node 内置一律在**调用期**经
// `process.getBuiltinModule()` 取(bun 与 node ≥20.16 都有, 本机三者实测)。取不到(浏览器 /
// 被阉过的 process)⇒ 返回 false 而**绝不抛**: 判不出"我是入口"时正确的方向是沉默 ——
// 被 import 的那一份本来就不该跑主逻辑, 于是静默只可能错在"入口不跑"这一侧,
// 好过在浏览器里为一条顺手判断当场炸掉。
// =====================================================================

/** node 内置模块的调用期取用口 —— 静态 import 会把本文件毒出浏览器, 见文件头 */
function builtin<T>(specifier: string): T | undefined {
  const proc = (globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }).process;
  try {
    return (proc?.getBuiltinModule?.(specifier) as T | undefined) ?? undefined;
  } catch {
    return undefined;   // 被 polyfill / 打过补丁的 process: 当作拿不到, 不往上冒
  }
}

type PathModule = { resolve(...parts: string[]): string };
type UrlModule = { fileURLToPath(url: string | URL): string };
type FsModule = { realpathSync(path: string): string };

/** 当前模块是否作为入口被直接执行(bun 的 `import.meta.main` 的可移植替身) */
export function isMainModule(importMetaUrl: string): boolean {
  const argv1 = (globalThis as { process?: { argv?: string[] } }).process?.argv?.[1];
  const url = builtin<UrlModule>('node:url');
  const path = builtin<PathModule>('node:path');
  // 浏览器(没有 process) / `node -e` 与 REPL(没有 argv[1]) / 老运行时(内置拿不到):
  // 这三种场合都没有"入口脚本"这回事, 一律 false
  if (!argv1 || !importMetaUrl || !url || !path) return false;

  let self: string;
  try {
    self = url.fileURLToPath(importMetaUrl);
  } catch {
    return false;   // 非 file: URL(浏览器里的 http: / 打包器塞的假 URL)⇒ 没有可比的对象
  }
  const fs = builtin<FsModule>('node:fs');
  const real = (p: string): string => {
    const abs = path.resolve(p);
    // realpath 只为兜 symlink 与等价写法; 路径不存在时它抛, 退回词法绝对路径(判定继续, 不崩)
    try { return fs?.realpathSync(abs) ?? abs; } catch { return abs; }
  };
  return real(self) === real(argv1);
}
