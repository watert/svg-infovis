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
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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
});
