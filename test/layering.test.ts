// =====================================================================
// `refs/layering.md` 的准入门槛 —— 从散文变成判决
//
// 为什么值得进 test: 那篇分层文档若只给人读, 它就是**装饰**。260926 拿它回头审全仓依赖图
// 时就撞上了: "读 barrel 的顺序即依赖顺序, 被依赖的先出"这条被写进 index.ts 头注释的纪律,
// 一次探测就抓出 **11 处违反**(node→icon / edge→measure / fit→box / fit→audit / route→route-cost
// / route→audit / lanes→codes / audit→density / audit→cluster / density→cluster …)。
// 结论不是"排错了要改", 而是**这条纪律本身是错的**: barrel 的 re-export 顺序对运行时零影响
// (ESM 按模块图拓扑求值), 它是可读性偏好被写成了纪律 —— 于是谁也不守, 破了也没人喊。
// 真有后果的是另外两条: **依赖图无环** 与 **分层不越界**。它们各有运行时解释(前者防 TDZ 与
// 半个模块图, 后者防"底座反过来依赖外壳"的层裂), 故本文件守这两条, 并顺手守
// `package.json#exports` 的目标都落盘(子路径写了不存在的文件, 消费方 import 才炸)。
//
// 四条判据, 每条都配**方向相反的反例**(纪律 7: 新判据自己举证): 判据写成纯函数, 反例在
// `test/` 里现造, 不去改真文件 —— 反例与正例共用同一段代码, 免得"测试只会绿"。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { PIERCE_MIN as barrelPierce, STUB_MIN as barrelStub, THRESHOLDS as barrelThresholds, portPoint as barrelPortPoint, sideDir as barrelSideDir } from '../src/index';
import { portPoint, sideDir } from '../src/geometry/port';
import { PIERCE_MIN as auditPierce, STUB_MIN as auditStub, THRESHOLDS as auditThresholds } from '../src/knives/audit';
import { portPoint as routePortPoint, sideDir as routeSideDir } from '../src/knives/route';
import { PIERCE_MIN, STUB_MIN, THRESHOLDS } from '../src/knives/thresholds';

const ROOT = join(import.meta.dir, '..');

/** 仓内模块的相对路径(相对仓库根), 如 `src/geometry/box.ts` */
type Mod = string;
/** 一条 import 语句的解析结果: 模块路径 + 是否纯类型(类型不参与求值, 也不算越层) */
type Imp = { spec: string; typeOnly: boolean };

const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')) out.push(normalize(p));
  }
  return out;
};

/**
 * 抽一个文件里的 import: 整条 `import type` 与**纯 type specifier** 都不算运行时依赖。
 * 这个区分是判据①站得住的关键 —— 纯类型导入不参与求值顺序, 不该被当成求值层的倒置
 * (`geometry/inline-text → descriptor`、`shapes/edge → knives/audit` 都是这类)。
 * ⚠ 但判据②(分层)对 `geometry → shapes/` 连类型依赖也判红: 底座知道外壳的形状就是层裂,
 * 与求值无关。当前仓内这种依赖为零, 所以这条不咬人; 咬了就是真层裂。
 */
const importsOf = (file: string): Imp[] => {
  const src = readFileSync(file, 'utf8');
  const out: Imp[] = [];
  // 副作用导入 `import 'x';` 没有 from 子句 —— 它照样参与求值(会执行), 也照样是越层/外部依赖。
  // 少了这一条, `import 'node:fs'` 就能从判据③的缝里溜过去(260926 反例当场抓到过这个漏法)。
  for (const m of src.matchAll(/^import\s+'([^']+)'/gm)) out.push({ spec: m[1], typeOnly: false });
  for (const m of src.matchAll(/^import\s+([^;]+?)\s+from\s+'([^']+)'/gm)) {
    const clause = m[1];
    if (/^type\s/.test(clause)) { out.push({ spec: m[2], typeOnly: true }); continue; }
    const braces = /\{([^}]*)\}/.exec(clause);
    const named = braces?.[1].trim();
    const typeOnly = named !== undefined && named !== '' && named.split(',').every((s) => /^type\s/.test(s.trim()));
    out.push({ spec: m[2], typeOnly });
  }
  return out;
};

/** 把 `../geometry/vec` 这种相对 specifier 归一成仓内模块路径; 外部依赖给 null */
const resolve = (from: Mod, spec: string): Mod | null => {
  if (!spec.startsWith('.')) return null;
  return normalize(join(dirname(from), spec)).endsWith('.ts')
    ? normalize(join(dirname(from), spec))
    : normalize(join(dirname(from), `${spec}.ts`));
};

// ── 判据的纯函数实现(反例与正例共用) ──────────────────────────────────

/** ① 依赖图必须是 DAG。返回造成环的模块链(空 = 无环) */
const findCycle = (mods: Mod[], deps: (m: Mod) => Mod[]): Mod[] => {
  const state = new Map<Mod, 0 | 1 | 2>();
  const stack: Mod[] = [];
  const dfs = (m: Mod): Mod[] => {
    if (state.get(m) === 1) return [...stack.slice(stack.indexOf(m)), m];   // 回到自己 = 环
    if (state.get(m) === 2) return [];
    state.set(m, 1);
    stack.push(m);
    for (const d of deps(m)) {
      const c = dfs(d);
      if (c.length) return c;
    }
    stack.pop();
    state.set(m, 2);
    return [];
  };
  for (const m of mods) { const c = dfs(m); if (c.length) return c; }
  return [];
};

/** ② geometry/ 是纯几何原语: 禁依赖 shapes/、blocks/、knives/(连类型依赖也算) */
const findGeometryViolations = (files: Mod[]): string[] => {
  const bad: string[] = [];
  for (const f of files.filter((p) => p.startsWith('src/geometry/'))) {
    for (const { spec, typeOnly } of importsOf(f)) {
      const to = resolve(f, spec);
      if (!to) continue;
      if (/^(src\/shapes|blocks|src\/blocks)\//.test(to)) {
        bad.push(`${f} → ${to}${typeOnly ? '(type-only, 仍需解禁备案)' : ''}`);
      } else if (to.startsWith('src/knives/')) {
        bad.push(`${f} → ${to}  (geometry 依赖 knives)`);
      }
    }
  }
  return bad;
};

/** ③ blocks/ 只能组合 src/ 的刀: 禁第三方、禁 node:、禁走 barrel */
const findBlocksViolations = (files: Mod[]): string[] => {
  const bad: string[] = [];
  for (const f of files.filter((p) => p.startsWith('blocks/'))) {
    for (const { spec } of importsOf(f)) {
      if (/^\.\.\/src\/index(\.ts)?$/.test(spec)) {
        // 走 barrel 会把 `icons/lucide` 的 `node:fs` 一并拖进来 —— 块层的"零 node:"当场破功,
        // 而它自己看不见(报错发生在 bundler 那头)。所以指名禁掉, 不靠"注意别 import index"。
        bad.push(`${f} → ${spec}  (禁走 barrel: 它带 node:fs)`);
      } else if (!spec.startsWith('../src/')) {
        bad.push(`${f} → ${spec}  (只许 ../src/<刀>, 禁第三方 / node:)`);
      }
    }
  }
  return bad;
};

const srcMods = (): Mod[] => [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'blocks'))]
  .map((p) => normalize(p).replace(`${normalize(ROOT)}/`, ''));

describe('refs/layering.md · 准入门槛的机器判决', () => {
  it('① 运行时依赖图无环(有环 = 半个模块图 + TDZ)', () => {
    const mods = srcMods();
    const runtime = (m: Mod): Mod[] =>
      importsOf(join(ROOT, m)).filter((i) => !i.typeOnly).map((i) => resolve(m, i.spec)).filter((d): d is Mod => d !== null);
    expect(findCycle(mods, runtime), '依赖图成环 —— 找一找谁把谁拉回来了').toEqual([]);
  });

  it('② geometry/ 不依赖 shapes/、blocks/、knives/', () => {
    expect(findGeometryViolations(srcMods())).toEqual([]);
  });

  it('端口公式与门禁尺子各只有一份绑定, 旧路径与 barrel 仍导得出', () => {
    // 再导出必须是同一函数 / 同一对象。另写一份 `export *` 会让 barrel 上的同名消失, 这里会红
    expect(routePortPoint).toBe(portPoint);
    expect(routeSideDir).toBe(sideDir);
    expect(barrelPortPoint).toBe(portPoint);
    expect(barrelSideDir).toBe(sideDir);
    expect(auditPierce).toBe(PIERCE_MIN);
    expect(auditStub).toBe(STUB_MIN);
    expect(auditThresholds).toBe(THRESHOLDS);
    expect(barrelPierce).toBe(PIERCE_MIN);
    expect(barrelStub).toBe(STUB_MIN);
    expect(barrelThresholds).toBe(THRESHOLDS);
  });

  it('③ blocks/ 只组合 src/ 的刀(零第三方、零 node:、不走 barrel)', () => {
    expect(findBlocksViolations(srcMods())).toEqual([]);
  });

  it('④ package.json#exports 的每个子路径都落在真实文件上(消费方 import 才炸的那一类)', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { exports: Record<string, string> };
    const missing = Object.entries(pkg.exports)
      .filter(([, target]) => !existsSync(join(ROOT, target)))
      .map(([sub, target]) => `${sub} → ${target}`);
    expect(missing, 'exports 指向不存在的文件 —— 子路径是公共面, 不存在也得说得清').toEqual([]);
  });

  // ── 举证: 四个判据各自的反例(方向相反的那种) ─────────────────────────
  it('举证 · 判据①会响: 造一个 A → B → A 的环, 环被指出', () => {
    const g: Record<string, string[]> = { a: ['b'], b: ['a'] };
    expect(findCycle(['a', 'b'], (m) => g[m] ?? [])).toEqual(['a', 'b', 'a']);
  });

  it('举证 · 判据①在无环图上不响(正向对照)', () => {
    const g: Record<string, string[]> = { a: ['b'], b: ['c'], c: [] };
    expect(findCycle(['a', 'b', 'c'], (m) => g[m] ?? [])).toEqual([]);
  });

  it('举证 · 判据②会响: geometry 依赖 shapes/ 或备案外的 knives', () => {
    // 造一个临时模块(判据只读它的 import 语句, 写完即删)
    const fake = 'src/geometry/layering-probe.ts';
    writeFileSync(join(ROOT, fake), "import { x } from '../shapes/node';\nimport { P } from '../knives/route';\n");
    try {
      const bad = findGeometryViolations([fake]);
      expect(bad.length, '两条都该被指出(依赖 shapes + 备案外依赖 knives)').toBe(2);
      expect(bad[0]).toContain('shapes/node');
      expect(bad[1]).toContain('geometry 依赖 knives');
    } finally { rmSync(join(ROOT, fake)); }
  });

  it('举证 · 判据③会响: blocks 里的第三方 / node: / barrel 导入', () => {
    const fake = 'blocks/layering-probe.ts';
    writeFileSync(join(ROOT, fake), "import 'node:fs';\nimport { svg } from '../src/index';\nimport { foo } from 'some-pkg';\n");
    try {
      expect(findBlocksViolations([fake]).length).toBe(3);
    } finally { rmSync(join(ROOT, fake)); }
  });
});
