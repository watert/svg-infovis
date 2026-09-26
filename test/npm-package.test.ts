// =====================================================================
// npm 包形态守卫(260926) —— 本仓从"纯 TS 直出"转为可发布 npm 包后, 五条承诺最容易悄悄坏掉:
//   ① 公共面(`exports`)指到的产物必须存在, 且**不许通配**(白名单是纪律, 见 refs/public-api.md)
//   ② `files` 白名单必须覆盖 exports 的每个产物, 否则"装上了却 import 不到"
//   ③ 相对 import 必须带显式扩展名 —— 少一个就是 node 侧的 ERR_MODULE_NOT_FOUND(旧形态的原始病灶)
//   ④ barrel 零第三方: lucide-static 只许待在 optional
//   ⑤ CLI 的 shebang 必须是 node(纯 node 机器上 `svginfo` 要起得来)
// ⚠ `dist/` 是构建产物、可能还没编: 依赖它的判据一律 `skipIf`, 不许把"没 build"伪装成通过。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = join(import.meta.dir, '..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  exports: Record<string, string | Record<string, string>>;
  files: string[];
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  bin: Record<string, string>;
};
/** exports 的全部目标(剥掉 types / import / default 那层条件壳) */
const targets = Object.entries(pkg.exports).flatMap(([, v]) => (typeof v === 'string' ? [v] : Object.values(v)));
const built = existsSync(join(ROOT, 'dist/src/index.js'));

/** 有没有能给用户 `.ts` 当宿主的运行时(bun, 或 node ≥22.6 的类型剥离档)—— 没有就 skip 掉那条判据 */
const tsRunner = (): boolean => {
  const noBun = (spawnSync('bun', ['--version'], { stdio: 'ignore' }).error as { code?: string } | undefined)?.code === 'ENOENT';
  if (!noBun) return true;
  const [maj, min] = process.versions.node.split('.').map(Number);
  return maj > 22 || (maj === 22 && min >= 6);
};

const walk = (dir: string, ext: string, out: string[] = []): string[] => {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, ext, out);
    else if (e.name.endsWith(ext)) out.push(p);
  }
  return out;
};

/** 只认 import / export 语句里的相对 specifier(注释里同形的字面量不算) */
const relSpecs = (file: string): string[] =>
  [...readFileSync(file, 'utf8').matchAll(/^\s*(?:import|export)[^;]*?from\s+'(\.[^']*)'/gm)].map((m) => m[1]);

const rel = (p: string) => p.slice(ROOT.length + 1);

describe('npm 包形态 · 公共面 / 发布白名单 / 相对 import 的守卫', () => {
  it('exports 是白名单: 不许通配(通配会让内部文件自动变成公共面)', () => {
    expect(Object.keys(pkg.exports).filter((k) => k.includes('*'))).toEqual([]);
  });

  it('files 白名单覆盖 exports 的每个产物(否则装上了却 import 不到)', () => {
    // npm 无论如何都会带上根 package.json, 所以 `./package.json` 这一条不参与
    const top = [...new Set(targets.map((t) => t.replace(/^\.\//, '').split('/')[0]))];
    expect(top.filter((d) => d !== 'package.json' && !pkg.files.includes(d))).toEqual([]);
  });

  it('barrel 零第三方: 常规 dependencies 为空, lucide-static 只许留在 optional', () => {
    expect(Object.keys(pkg.dependencies ?? {})).toEqual([]);
    expect(Object.keys(pkg.optionalDependencies ?? {})).toEqual(['lucide-static']);
  });

  it('相对 import 一律带显式扩展名(源码侧, 测试文件不算)', () => {
    const bad = ['src', 'blocks', 'scripts']
      .flatMap((d) => walk(join(ROOT, d), '.ts').filter((p) => !p.includes('.test.')))
      .flatMap((f) => relSpecs(f).filter((s) => !/\.(js|json)$/.test(s)).map((s) => `${rel(f)} → ${s}`));
    expect(bad).toEqual([]);
  });

  it.skipIf(!built)('产物侧同样成立: dist 的相对 import 都带扩展名, 且测试文件一个都没混进来', () => {
    const js = walk(join(ROOT, 'dist'), '.js');
    expect(js.flatMap((f) => relSpecs(f).filter((s) => !/\.(js|json)$/.test(s)).map((s) => `${rel(f)} → ${s}`))).toEqual([]);
    expect(js.filter((p) => p.includes('.test.'))).toEqual([]);
  });

  it.skipIf(!built)('exports 的每个产物与其类型声明都躺在 dist 里', () => {
    expect(targets.filter((t) => t.startsWith('./dist/')).filter((t) => !existsSync(join(ROOT, t)))).toEqual([]);
  });

  it.skipIf(!built)('纯 node 起得来 CLI: bin 产物在, shebang 是 node', () => {
    for (const b of Object.values(pkg.bin)) {
      expect(existsSync(join(ROOT, b))).toBe(true);
      expect(readFileSync(join(ROOT, b), 'utf8').split('\n')[0]).toBe('#!/usr/bin/env node');
    }
  });

  it.skipIf(!built)('纯 node 加载 dist 并读到真数据(node 侧可用的常驻证据)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'svg-infovis-smoke-'));
    const script = join(dir, 'smoke.mjs');
    writeFileSync(script, [
      `const m = await import(${JSON.stringify(join(ROOT, 'dist/src/index.js'))});`,
      `const need = ['createScene', 'exportScene', 'routeOrthogonal', 'nodeFit', 'decisionDigest'];`,
      `const missing = need.filter((k) => typeof m[k] !== 'function');`,
      `if (missing.length) { console.error('缺导出: ' + missing.join(', ')); process.exit(1); }`,
      `if (!Array.isArray(m.DIAGNOSTIC_CODES) || m.DIAGNOSTIC_CODES.length === 0) { console.error('DIAGNOSTIC_CODES 空'); process.exit(1); }`,
      `console.log('ok exports=' + Object.keys(m).length + ' codes=' + m.DIAGNOSTIC_CODES.length);`,
      '',
    ].join('\n'));
    const r = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    rmSync(dir, { recursive: true, force: true });
    expect(r.stdout.trim()).toMatch(/^ok exports=\d+ codes=\d+$/);
    expect(r.status).toBe(0);
  });

  it.skipIf(!built || !tsRunner())('纯场景模块在 node 宿主下也必须真出图(exit 0 却不产图 = 静默假成功)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'svg-infovis-scene-'));
    const mod = join(dir, 'scene-mod.ts');
    const out = join(dir, 'out.svg');
    // 纯场景模块 = 只 `export default`, **没有** isMainModule 出口 —— 回退路专为它准备
    writeFileSync(mod, [
      `import { scene } from ${JSON.stringify(join(ROOT, 'examples/start/full-chain.ts'))};`,
      'export default scene;',
      '',
    ].join('\n'));
    // ⚠ 宿主故意用 node(bin 的 shebang 就是 node)。node <22.6 自己带不动 TS: 回退路若在 CLI
    //    进程内 import 用户的 `.ts`, 异常被吞 ⇒ exit 0 却不产图 —— 260926 验收抓到的阻断级。
    const r = spawnSync(process.execPath, [join(ROOT, 'dist/scripts/cli.js'), 'run', mod, '-o', out], { encoding: 'utf8' });
    const size = existsSync(out) ? statSync(out).size : 0;
    rmSync(dir, { recursive: true, force: true });
    expect(r.status, `CLI 的诊断:\n${r.stderr}`).toBe(0);
    expect(size, '退出 0 却没落图 —— 正是"静默假成功"').toBeGreaterThan(0);
    // ⚠ 光看"文件在不在"抓不住这条: 回退路一旦跑起来会**自己**把图落盘, 于是"忽略了它的结果"
    //    也照样有文件在。真正区分"认出了场景模块"与"当成 golden / 自落盘档混过去"的, 是这句
    //    归因诊断不许出现(260926 反向验证踩到: 只断言文件存在时, 把回退路掐掉这条守卫照样全绿
    //    —— 那就是装饰性守卫)。
    expect(r.stderr, 'CLI 把场景模块误判成 golden / 自落盘档 —— 回退路的判断权又交回宿主手里了')
      .not.toContain('golden / 自落盘那一档');
  });

  it('skill 布局: 真身在 skills/ 下、根目录没有 SKILL.md、仓根那几份是指向真身的软链', () => {
    // ⚠ 根目录一出现 SKILL.md, skills CLI 就把它当成唯一 skill 并把**整仓**拷给消费者(实测 3.3 MB,
    //    连 test/ 与 website/ 一起), 还会盖住 skills/ 下的真身 —— 这条是"别人装得对不对"的前提。
    expect(existsSync(join(ROOT, 'SKILL.md'))).toBe(false);
    // skill 目录里必须全是真身: CLI 会不会物化软链是它**未文档化**的实现细节, 不能当成安装前提
    // ⚠ 这里只列"画图现场用得上"的四份。改内核 / 发布才用的 refs/{layering,principles,public-api}.md
    //    刻意**不在** skill 里(它们的受众是 clone 过的内核开发者), 真身在仓根 refs/ —— 别顺手搬进来
    const real = ['SKILL.md', 'QUICKREF.md', 'refs/recipes.md', 'refs/aesthetics.md'];
    for (const f of real) {
      const p = join(ROOT, 'skills/svg-infovis', f);
      expect(existsSync(p), `skill 真身缺了: skills/svg-infovis/${f}`).toBe(true);
      expect(lstatSync(p).isSymbolicLink(), `skills/svg-infovis/${f} 是软链 —— 真身该放这里`).toBe(false);
    }
    // 仓根留旧路径: 这几份**必须**是软链(不是 = 抄了第二份内容, 两处必然漂)
    for (const f of ['QUICKREF.md', ...real.slice(2)]) {
      const p = join(ROOT, f);
      expect(lstatSync(p).isSymbolicLink(), `仓根 ${f} 应是软链(真身在 skills/svg-infovis/ 下)`).toBe(true);
      expect(readFileSync(p, 'utf8').length, `仓根 ${f} 的软链读不到内容`).toBeGreaterThan(0);
    }
    // 反向: 受众不在 skill 的那三份, 真身留在仓根(软链 = 又把它们塞回 skill 了, 分治白做)
    for (const f of ['refs/layering.md', 'refs/principles.md', 'refs/public-api.md']) {
      const p = join(ROOT, f);
      expect(existsSync(p), `仓根缺了 ${f}`).toBe(true);
      expect(lstatSync(p).isSymbolicLink(), `仓根 ${f} 成了软链 —— 它的真身该留在仓根, 不随 skill 走`).toBe(false);
    }
  });
});
