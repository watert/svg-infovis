// =====================================================================
// skill-docs · skill 正文与源码的**对账守卫**(260927)
//
// 由来: skill 正文里的码表与数字是**手写**的(它们的"含义"是人的经验, 不像值那样能从源码生成),
//   而手写清单必然与真值漂开。260927 实测: 24 个门禁码里有 6 个(`finite_svg` / `node_overlap` /
//   `edge_degenerate` / `cluster_member_outside` / `cluster_frame_cross` /
//   `cluster_nesting_contradiction`)**从未在 skill 正文出现过** —— 只装了 skill 的 agent 报出
//   这几个码时, 手上既没有 `src/` 也没有全表, 只能猜。
//
// 判据: `refs/diagnostics.md` 的三张门禁码表与 `src/knives/codes.ts` 的注册表**一一对应**
//   (不多不少不重)。内核加码而表没补 / 表里留着已删的码, `bun run verify` 当场红。
//
// 为什么这里不做"生成器 + `--check` 孪生"(archify 那种做法): 那一套的前提是产物**纯派生**
//   —— 本仓那份的范例是 `scripts/build-skill-shots.ts`(副本 + PNG + 清单全从源码算出来)。
//   码表的"含义 / 往哪修"两列要人写, 整份生成不了; 能派生的那半(码集合)用对账守卫钉住, 就是本文件。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AUDIT_CODES, CLUSTER_CODES, DENSITY_CODES, DIAGNOSTIC_CODES } from '../src/knives/codes';
import { SCENE_OWNER_KINDS, SCENE_TEXT_DEFAULTS } from '../src/knives/audit';
import { BORDER_CLEARANCE, GROUP_FIT_PAD } from '../src/knives/cluster';
import { LANE_STEP_MIN } from '../src/knives/lanes';
import { PAIR_GAP, PAIR_LABEL_GAP } from '../src/knives/route-pair';
import { PIERCE_MIN, STUB_MIN, THRESHOLDS } from '../src/knives/thresholds';
import { BASELINE_FACTORS } from '../src/descriptor';
import { LABEL_BOX_DEFAULTS, MASK_ROW_INK_EM } from '../src/shapes/edge';
import { GRID_ID } from '../src/shapes/grid-pattern';
import { ICON_DEFAULTS } from '../src/shapes/icon';
import { CYLINDER_CAP_RATIO, NODE_TEXT_LAYOUT } from '../src/shapes/node';
import { SEQ_DEFAULTS } from '../templates/sequence';
import { LAYERED_DEFAULTS } from '../templates/layered';
import { LIFECYCLE_DEFAULTS } from '../templates/lifecycle';

const ROOT = join(import.meta.dir, '..');
const DOC = join(ROOT, 'skills/svg-infovis/refs/diagnostics.md');
const QUICKREF = join(ROOT, 'skills/svg-infovis/QUICKREF.md');

/**
 * 表里首列 = 反引号包的码。只认**表格行**(行首是 `| \`code\` |`)—— 正文里顺口提到的码不算"登记",
 * 否则「口径」那节写一句 `node_gap` / `node_overlap` 就会把它算成表里的一行。
 */
const listedCodes = (md: string): string[] => [...md.matchAll(/^\| `([a-z][a-z0-9_]*)` \|/gm)].map((m) => m[1]);

/** 取某一节(`## 一、…` 到下一个 `## ` 之前) */
function section(md: string, title: string): string {
  const i = md.indexOf(title);
  if (i < 0) throw new Error(`diagnostics.md 里找不到小节「${title}」—— 标题改了就把守卫一起改`);
  const j = md.indexOf('\n## ', i + 1);
  return md.slice(i, j < 0 ? undefined : j);
}

describe('skill 正文 · 与源码对账', () => {
  it('门禁码全表与注册表一一对应(不多不少不重)', () => {
    const codes = listedCodes(readFileSync(DOC, 'utf8'));
    expect(codes.length, 'diagnostics.md 的码表里有重复行').toBe(new Set(codes).size);
    // 差集两边都要可见: 少一个 / 多一个都点名 —— 只钉一向会留下"永远绿"的缺口
    expect([...new Set(codes)].sort(), '门禁码表与 DIAGNOSTIC_CODES 对不上(缺的 / 多的都在这份差集里)')
      .toEqual([...DIAGNOSTIC_CODES].sort());
  });

  it('三张表各自只装自己那一组(码不串门)', () => {
    const md = readFileSync(DOC, 'utf8');
    for (const [title, table] of [
      ['## 一、audit', AUDIT_CODES],
      ['## 二、cluster', CLUSTER_CODES],
      ['## 三、density', DENSITY_CODES],
    ] as const) {
      expect(listedCodes(section(md, title)).sort(), `「${title}」这一段与它对应的注册表对不上`)
        .toEqual([...Object.values(table)].sort());
    }
  });

  it('判据自检: 表里塞一个未注册的码, 差集当场现形(否则这条守卫只是绿的摆设)', () => {
    const real = listedCodes(readFileSync(DOC, 'utf8'));
    expect([...real].sort()).toEqual([...DIAGNOSTIC_CODES].sort()); // 真表干净
    // 合成一份"内核加了码、表忘了补"的输入 —— 这正是缺口发生的那个瞬间
    const stale = [...real, 'brand_new_gate'].sort();
    expect(stale).not.toEqual([...DIAGNOSTIC_CODES].sort());
    // 反向: 表里留着一个已删的码
    const leftover = real.filter((c) => c !== 'finite_svg');
    expect(leftover).not.toEqual([...DIAGNOSTIC_CODES].sort());
  });

  // ── 第二组: QUICKREF「缺省值表」33 行逐值对账(260927) ──────────────────────
  // 那张表的表头自称"全部核自源码; 文档没写时不必去翻", 但在此之前**没有任何守卫**对着源码
  // 核过它 —— 内核改了常量而文档没跟上, 只有靠人恰好翻到才会发现。规矩是:
  // **能 import 到的常量逐值对账; import 不到的必须显式登记进 SKIPPED 并写明原因**,
  // 于是"表里新加了一行而守卫不知道"也会当场红 —— 缺口不会悄悄长出来。

  /** 表里一行 → 它期望的值(**从源码读**, 不在这里重抄一份数字) */
  const ROWS: Array<{ label: string; read: () => unknown }> = [
    { label: '`LANE_STEP_MIN`', read: () => LANE_STEP_MIN },
    { label: '`BORDER_CLEARANCE`', read: () => BORDER_CLEARANCE },
    { label: '`GROUP_FIT_PAD`', read: () => GROUP_FIT_PAD },
    { label: '`STUB_MIN`', read: () => STUB_MIN },
    { label: '`PIERCE_MIN`', read: () => PIERCE_MIN },
    { label: '`NODE_TEXT_LAYOUT.fontSize`', read: () => NODE_TEXT_LAYOUT.fontSize },
    { label: '`.subSizeDelta`', read: () => NODE_TEXT_LAYOUT.subSizeDelta },
    { label: '`.lineGapEm`', read: () => NODE_TEXT_LAYOUT.lineGapEm },
    { label: '`THRESHOLDS.standard`', read: () => Object.values(THRESHOLDS.standard) },
    { label: '`THRESHOLDS.showcase`', read: () => Object.values(THRESHOLDS.showcase) },
    { label: '`CYLINDER_CAP_RATIO`', read: () => CYLINDER_CAP_RATIO },
    { label: '`BASELINE_FACTORS.central`', read: () => BASELINE_FACTORS.central },
    { label: '`GRID_ID`', read: () => GRID_ID },
    { label: '`SCENE_TEXT_DEFAULTS.fontSize`', read: () => SCENE_TEXT_DEFAULTS.fontSize },
    { label: '`SCENE_OWNER_KINDS`', read: () => [...SCENE_OWNER_KINDS] },
    { label: '`ICON_DEFAULTS`', read: () => Object.values(ICON_DEFAULTS) },
    // 这一行的值列有四个数, 第 4 个(1.15)不在 LABEL_BOX_DEFAULTS 里 —— 是同文件的兄弟常量
    { label: '`LABEL_BOX_DEFAULTS`', read: () => [...Object.values(LABEL_BOX_DEFAULTS), MASK_ROW_INK_EM] },
    { label: '`PAIR_GAP`', read: () => PAIR_GAP },
    { label: '`PAIR_LABEL_GAP`', read: () => PAIR_LABEL_GAP },
    { label: '`SEQ_DEFAULTS`', read: () => Object.values(SEQ_DEFAULTS) },
    { label: '`LAYERED_DEFAULTS`', read: () => Object.values(LAYERED_DEFAULTS) },
    { label: '`LIFECYCLE_DEFAULTS`', read: () => Object.values(LIFECYCLE_DEFAULTS) },
  ];

  /**
   * 剩下的 11 行**核不到源码常量**, 逐条写明是哪一种 —— 免得"登记一下绕过去"变成新习惯。
   * 它们要真守只能靠**行为探测**(跑一次函数量结果), 那是另一条腿, 本轮不做。
   */
  const SKIPPED: Array<{ label: string; why: string }> = [
    { label: '`stub`', why: 'route.ts 里是两处 `req.stub ?? 18` 字面量, 没有可 import 的常量' },
    { label: '`BORDER_RUN_GAP`', why: 'cluster.ts 的模块内部 `const`(未导出)' },
    { label: '`END_BAND`', why: 'audit.ts 的模块内部 `const`(未导出)' },
    { label: '`PORT_SHARED_ATTACH`', why: 'audit.ts 的模块内部 `const`(未导出)' },
    { label: '`fit` 缺省', why: 'export.ts 里是 `opts.bleed ?? 1` / `opts.padding ?? 16` 字面量' },
    { label: '端口缺省', why: '散在 port.ts 的行内字面量, 只能行为探测(取面中点)' },
    { label: '自重叠 `eps`', why: 'predicates.ts 里是函数默认参数 `eps = 0.5`, 没有绑定' },
    { label: '`measureText` 常量', why: '四个数跨两个文件(measure.ts 三个 + inline-text.ts 的 advanceGain), 值列也不带粗体' },
    { label: '`CARD_WEIGHT`', why: 'fit.ts 的模块内部 `const`(未导出)' },
    { label: '网格底纹 `opts.grid`', why: '六个数散在 grid-pattern.ts 的函数内字面量(只有墨色 `GRID_INK` 是命名导出)' },
    { label: '外部素材 `embedAsset`', why: '值列是语义描述(id 前缀规则 + 硬编码的 preserveAspectRatio)' },
  ];

  /** 「缺省值表」这一节(标题到下一个 `## ` 之前) */
  const quickrefTable = (): string => {
    const md = readFileSync(QUICKREF, 'utf8');
    const i = md.indexOf('## 缺省值表');
    if (i < 0) throw new Error('QUICKREF.md 里找不到「缺省值表」小节 —— 标题改了就把守卫一起改');
    const j = md.indexOf('\n## ', i + 1);
    return md.slice(i, j < 0 ? undefined : j);
  };

  /** 表体行的第一列(原样) —— 表头与 `|---|` 分隔行不算 */
  const rowLabels = (): string[] => quickrefTable().split('\n')
    .filter((l) => l.startsWith('| ') && !l.startsWith('| 常量') && !l.startsWith('|---'))
    .map((l) => l.split('|')[1].trim());

  /** 某一行的第二列(值列) */
  function valueCell(label: string): string {
    const line = quickrefTable().split('\n').find((l) => l.startsWith(`| ${label} |`));
    if (!line) throw new Error(`缺省值表里找不到第一列是「${label}」的行 —— 改行名就把守卫一起改`);
    return line.split('|')[2];
  }

  /**
   * 值列 → 值序列。只认 `**粗体**` 段(那是作者标出来的"这就是那个数"), 段内去反引号;
   * `1/8` 当分数(不是一个数除以另一个)、`36×30` 拆成两个数、其余抽开头那个数字(剥掉 em/px);
   * 抽不出数字的(`` `md-grid` `` / 词表)去反引号后按 ` / ` 拆词。
   */
  const parseValueCell = (cell: string): (number | string)[] =>
    [...cell.matchAll(/\*\*([^*]+)\*\*/g)].flatMap((m) =>
      m[1].replace(/`/g, '').trim().split('×').flatMap((part): (number | string)[] => {
        const p = part.trim();
        const frac = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(p);
        if (frac) return [Number(frac[1]) / Number(frac[2])];
        const num = /^-?\d+(?:\.\d+)?/.exec(p);
        if (num) return [Number(num[0])];
        return p.split(' / ').map((s) => s.trim()).filter(Boolean);
      }),
    );

  // 断言的两边都是"数值 / 字符串"这一档(分数已折成数、词表是字符串), 单值包成一元数组
  const asArray = (v: unknown): (string | number)[] =>
    (Array.isArray(v) ? v : [v]) as (string | number)[];

  it('缺省值表每一行的值都从源码核过(对不上 = 内核改了而表没跟上)', () => {
    for (const { label, read } of ROWS) {
      expect(parseValueCell(valueCell(label)), `缺省值表「${label}」那一行的值与源码对不上`).toEqual(asArray(read()));
    }
  });

  it('核不到的 11 行都有归宿: 表里少一行 / 多一行都要点名', () => {
    const labels = rowLabels();
    const known = new Set([...ROWS.map((r) => r.label), ...SKIPPED.map((s) => s.label)]);
    // 表里出现了守卫不认识的行 —— 要么加进 ROWS(能 import), 要么加进 SKIPPED 并写明为什么核不到
    expect(labels.filter((l) => !known.has(l)), '缺省值表里这几行守卫不认识(新加的?请归到 ROWS 或 SKIPPED)').toEqual([]);
    // 反向: 守卫登记的行在表里已不存在(行被删或改名, 登记还留着)
    expect([...known].filter((l) => !labels.includes(l)), '守卫登记的行在缺省值表里已不存在').toEqual([]);
  });

  it('判据自检: 值列里改一个数, 差集当场现形', () => {
    const cell = valueCell('`STUB_MIN`');
    expect(parseValueCell(cell), '真表那一格没抽出 STUB_MIN').toEqual([STUB_MIN]);
    // 模拟作者手滑改错表里的数 —— 这条判据必须能抓住它, 否则它只是绿的摆设
    expect(parseValueCell(cell.replace('10', '12'))).not.toEqual([STUB_MIN]);
  });
});
