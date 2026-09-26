// =====================================================================
// src/runtime.ts 的判据 —— `import.meta.main` 的可移植替身, 三态都得对
//
// 为什么值得为一条路径比较起真实进程来测: 它判错的**唯一**后果就是"入口不跑"(退出码 0, 什么都没
// 发生) —— 正是这个模块要消灭的那种 silent failure, 而纯函数测试碰不到进程边界:
//   ① 直接执行   真起一个入口文件, 断言它**真的**跑了主逻辑(不是静默退出), 且它 import 进来的
//                那一份算 false
//   ② 同 URL 换 argv[1]  相对路径 / symlink 启动时 `argv[1]` 与 `import.meta.url` 字面不同
//                (node 实测: URL 那侧是 realpath, argv[1] 那侧是调用者写的写法) —— 不归一到
//                realpath 就漏判, 而漏判的错法是"入口不跑"
//   ③ 判不了时不抛  非 file: URL / 空串 / 拿不到 node 内置(浏览器那一档)一律 false
// ⚠ `bun test` 实测会把 `argv[1]` 设成它正在跑的**测试文件**, 所以下面凡涉及 `argv[1]` 的断言都先
//   把它摆成已知值再断言 —— 否则"跑全量"与"点名跑单个文件"会得到两个不同结果(测试自己开始漂)。
// =====================================================================

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMainModule } from '../src/runtime';

const RUNTIME = join(import.meta.dir, '..', 'src', 'runtime.ts');
let dir = '';

beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'md-runtime-')); });
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

/** 进程内改写 `argv[1]` 再跑断言(见文件头 ⚠), 无论如何都复原 */
function withArgv1<T>(value: string, fn: () => T): T {
  const was = process.argv[1];
  process.argv[1] = value;
  try { return fn(); } finally { process.argv[1] = was; }
}

describe('runtime · isMainModule 的三态', () => {
  it('① 直接执行: 真起一个入口 —— 它跑了主逻辑, 且它 import 的那份算 false', () => {
    writeFileSync(join(dir, 'lib.ts'),
      `import { isMainModule } from '${RUNTIME}';\nexport const fromLib = isMainModule(import.meta.url);\n`);
    const entry = join(dir, 'entry.ts');
    writeFileSync(entry, `import { fromLib } from './lib.ts';\nimport { isMainModule } from '${RUNTIME}';\n`
      + `if (isMainModule(import.meta.url)) console.log('MAIN-RAN');\n`
      + `console.log('entry=' + isMainModule(import.meta.url) + ' lib=' + fromLib);\n`);

    const p = spawnSync(process.execPath, ['run', entry], { encoding: 'utf8' });
    expect(p.status).toBe(0);
    expect(p.stdout).toContain('MAIN-RAN');               // ← 挂了就是"入口静默不跑"(本文件存在的理由)
    expect(p.stdout).toContain('entry=true lib=false');   // ← 被 import 的那一份不许算入口
  });

  it('② argv[1] 与模块 URL 是同一份文件的不同写法: 相对路径 / symlink 都算, 别的文件不算', () => {
    const real = join(dir, 'probe.ts');
    writeFileSync(real, 'export const x = 1;\n');
    const link = join(dir, 'probe-link.ts');
    symlinkSync(real, link);
    const url = pathToFileURL(real).href;

    const cases: [string, string, boolean][] = [
      ['绝对路径', real, true],
      ['相对路径(按 cwd 解)', relative(process.cwd(), real), true],
      ['symlink 名(两侧都得 realpath 才归一)', link, true],
      ['另一份文件', join(dir, 'other.ts'), false],
    ];
    for (const [why, argv1, want] of cases) {
      expect({ why, got: withArgv1(argv1, () => isMainModule(url)) }).toEqual({ why, got: want });
    }
  });

  it('③ `bun test` 进程内: 判定只认 argv[1] —— 它指向本文件才算入口, 否则一律 false', () => {
    expect(withArgv1(join(dir, 'other-entry.ts'), () => isMainModule(import.meta.url))).toBe(false);
    // `bun test` 实测把 argv[1] 摆成正在跑的测试文件 —— 那时 true 才是对的行为(本文件没有出口块, 无害)
    expect(withArgv1(fileURLToPath(import.meta.url), () => isMainModule(import.meta.url))).toBe(true);
  });

  it('④ 判不了时不抛: 非 file: URL / 空串 / 拿不到 node 内置(浏览器那一档)一律 false', () => {
    for (const bad of ['http://x/y.ts', 'data:text/plain,hi', 'not a url', '']) {
      expect({ bad, got: withArgv1(join(dir, 'x.ts'), () => isMainModule(bad)) }).toEqual({ bad, got: false });
    }
    // argv[1] 缺席(`node -e` / REPL / 没有"入口脚本"概念的宿主)
    expect(withArgv1('', () => isMainModule(pathToFileURL(join(dir, 'x.ts')).href))).toBe(false);

    // 浏览器那一档的替身: process 还在, 但取不到 node 内置 ⇒ 判定不出来就沉默(绝不抛)
    const proc = process as unknown as { getBuiltinModule?: unknown };
    const gm = proc.getBuiltinModule;
    proc.getBuiltinModule = undefined;
    try {
      expect(isMainModule(pathToFileURL(join(dir, 'x.ts')).href)).toBe(false);
    } finally {
      proc.getBuiltinModule = gm;
    }
  });
});
