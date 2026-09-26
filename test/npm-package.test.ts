// =====================================================================
// npm 包形态守卫(260926) —— 本仓从"纯 TS 直出"转为可发布 npm 包后, 五条承诺最容易悄悄坏掉:
//   ① 公共面(`exports`)指到的产物必须存在, 且**不许通配**(白名单是纪律, 见 docs/internals/public-api.md)
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
    // ⚠ 这里只列"画图现场用得上"的几项。改内核 / 发布才用的 layering / principles / public-api(今在
    //    docs/internals/) 刻意**不在** skill 里(它们的受众是 clone 过的内核开发者) —— 别顺手搬进来
    const real = [
      'SKILL.md', 'QUICKREF.md', 'refs/recipes.md', 'refs/aesthetics.md',
      // 260926 补的两项: 作者契约(三层入口 / Scene 契约 / 作者视角的 why)与参考图目录的 README ——
      // 受众同样是"画图现场"。而那三份改内核 / 发布才用的 (layering / principles / public-api) 仍**不在**这里。
      'refs/contract.md', 'examples/README.md',
    ];
    for (const f of real) {
      const p = join(ROOT, 'skills/svg-infovis', f);
      expect(existsSync(p), `skill 真身缺了: skills/svg-infovis/${f}`).toBe(true);
      expect(lstatSync(p).isSymbolicLink(), `skills/svg-infovis/${f} 是软链 —— 真身该放这里`).toBe(false);
    }
    // 仓根留旧路径: 这几份**必须**是软链(不是 = 抄了第二份内容, 两处必然漂)
    // ⚠ 这份名单是**显式**的, 不许写成 `...real.slice(2)`: 新增的 skill 真身(如 contract.md /
    //    examples/)在仓根**没有**旧路径, 顺手 slice 会要求它们也变成仓根软链(diff 看不见的一行)。
    for (const f of ['QUICKREF.md', 'refs/recipes.md', 'refs/aesthetics.md']) {
      const p = join(ROOT, f);
      expect(lstatSync(p).isSymbolicLink(), `仓根 ${f} 应是软链(真身在 skills/svg-infovis/ 下)`).toBe(true);
      expect(readFileSync(p, 'utf8').length, `仓根 ${f} 的软链读不到内容`).toBeGreaterThan(0);
    }
    // 反向: 受众不在 skill 的那三份, 真身留在仓根(软链 = 又把它们塞回 skill 了, 分治白做)
    for (const f of ['docs/internals/layering.md', 'docs/internals/principles.md', 'docs/internals/public-api.md']) {
      const p = join(ROOT, f);
      expect(existsSync(p), `仓根缺了 ${f}`).toBe(true);
      expect(lstatSync(p).isSymbolicLink(), `仓根 ${f} 成了软链 —— 它的真身该留在仓根, 不随 skill 走`).toBe(false);
    }
  });

  it('skill 文档的相对链接必须落在 skill 内且存在(死链 = 只装 skill 的 agent 拿一个空指针)', () => {
    // 260926 走查实测的病灶: 文档搬进 `skills/` 之后, 那几条"按旧位置写的"相对链接成了死链 ——
    //   `SKILL.md` 的 `./refs/principles.md`(真身当时在仓根 `refs/`)与 `recipes.md` 的
    //   `../templates/README.md`(解析到 `skills/svg-infovis/templates/`, 那里没有 templates/)。
    //   措辞上像"内部链接", 实际指向外面 —— 而 skill 装到别人机器上时, 外面什么都没有。
    // 规矩: **跨出 skill 的引用一律写成代码串**(仓内 `docs/internals/principles.md`), 不写成链接;
    //   链接只用来指"装了就能拿到"的东西。
    const SKILL_DIR = join(ROOT, 'skills/svg-infovis');
    const dead: string[] = [];
    for (const f of walk(join(ROOT, 'skills'), '.md')) {
      for (const m of readFileSync(f, 'utf8').matchAll(/\[[^\]]*\]\(([^)#]+)\)/g)) {
        const href = m[1];
        if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#')) continue; // 外链 / 纯锚点
        const p = join(f, '..', href); // join 会规整 `..`, 不必另引 dirname
        if (!p.startsWith(SKILL_DIR + '/') || !existsSync(p)) dead.push(`${rel(f)} → ${href}`);
      }
    }
    expect(dead, 'skill 里的相对链接指到了 skill 外 / 不存在的地方 —— 改成代码串或修路径').toEqual([]);
  });

  it('仓根 refs/ 只剩两条兼容软链 —— 文档的归宿只有一个 docs/(260927)', () => {
    // 260927 把改内核 / 发布才用的那几份从仓根 `refs/` 迁进 `docs/internals/`(连分层图与它的出图脚本),
    // 参照实现的对账样本进 `docs/archify-explore/`。留在 `refs/` 的是**兼容层** —— vault 里的
    // mini-diagram skill 文档按旧路径读这两条。
    // 这条守卫防的是"顺手再往 refs/ 放第三样东西": 一旦开了口, 仓根就又长出一个半吊子文档目录。
    const refsDir = join(ROOT, 'refs');
    const names = readdirSync(refsDir).sort();
    expect(names, '仓根 refs/ 里出现了第三条东西 —— 真身请进 docs/(仓库结构见 AGENTS.md)').toEqual(['aesthetics.md', 'recipes.md']);
    for (const f of names) {
      expect(lstatSync(join(refsDir, f)).isSymbolicLink(), `refs/${f} 不是软链 —— 兼容层只放链, 真身别放这里`).toBe(true);
    }
  });

  it('docs/internals/ 的相对链接不许死 —— 搬家最容易留下的就是这类指针', () => {
    // 260927 一次搬了 4 份文档 + 3 张图 + 3 个出图脚本进 `docs/internals/`, 文件名没变、位置全变:
    // 这正是 260926 搬 skill 时踩过的坑(那时死的是 `SKILL.md` 与 `recipes.md` 的几条链接)。
    const dir = join(ROOT, 'docs/internals');
    const dead: string[] = [];
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.md')).map((n) => join(dir, n))) {
      for (const m of readFileSync(f, 'utf8').matchAll(/\[[^\]]*\]\(([^)#]+)\)/g)) {
        const href = m[1];
        if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#')) continue;
        if (!existsSync(join(f, '..', href))) dead.push(`${rel(f)} → ${href}`);
      }
    }
    expect(dead, 'docs/internals 里的相对链接指到了不存在的地方').toEqual([]);
  });
});
