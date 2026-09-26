// =====================================================================
// runner · 出图示例的**薄 runner**(260920) —— 把 9 处逐字重复的出口尾巴收成一处
// (合并时 9 个出图入口, 现有 **10 个**消费方: `examples/` 九份 + `templates/sequence-archify-style.ts`)
//
// 合并前每个示例自己写一段(8 份几乎逐字相同, 还有 3 种变体: 直调 `exportScene` / `tryExport` /
// `try-catch ExportBlockedError`)。重复的不只是行数, 是**纪律** —— 「门禁判决必须落到 exit code」
// 这条已经两次漂掉过(`harness-arch` / `node-forms` 曾 exit 0, 那次的图揣着 24 条 error 一路过)。
// 同一件事写 9 遍, 就有 9 个地方会漂; 写 1 遍, 就只有 1 个地方要守。
//
// **为什么住在 `scripts/` 而不是 `examples/`**: 消费它的不只有 examples ——
// `examples/gallery/harness-arch.ts` 与 `templates/sequence-archify-style.ts` 也要。放进 examples/
// 就变成"模板层反向依赖示例层"(README 的分层是 geometry → shapes → serialize → examples,
// 模板是 examples 的上游; 出图入口散在 `examples/` 五桶与 `templates/` 两处, 所以 runner 只能住在
// 它俩**共同的上游工具层**)。`scripts/` 是本仓的工具层(已有 `inspect.ts` 这个吃 src 的 TS 工具),
// 谁都能引它, 不制造层级倒挂。
//
// 它**只管出口**, 不管几何 / 不管版式 / 不给缺省决策(与 templates 层的宪章同一条: 封装的是
// "每次都一样的骨架", 不是"这次该怎么画")。调用方给全 scene 与 ExportOptions, runner 负责:
//
//   ① 出图 + 审计(fail-closed: `exportScene`, 不过即抛)
//   ② 诊断走 **stderr**、图走 **out**(缺省 stdout) —— 通道分离, 永不合并
//   ③ 诊断一条不落: `message` + `evidence` + `supportedFixes`(照它改, 不要手算)
//   ④ **判决落到 exit code**: 门禁没过 → `process.exitCode = 1`(绝不吞)
//   ⑤ 门禁没过时**草稿照给**(落 `draftOut`, 缺省 = out): 诊断与图是互补的两半,
//      少一半只能盲改(见 `export.ts` 的 `ExportBlockedError.draft` 头注释)
//
// 为什么草稿也走 `out`(而不是另开一条路): 这就是出口契约 —— "**图仍照出(草稿), 但判决落到 exit code**":
// 出口只有一条通道, 调用方在 shell 里靠退出码分辨。网站管线(`website/scripts/prerender.ts`)正是这么收的 ——
// exitCode 非 0 但 stdout 有字节 ⇒ 照样收下, 并在汇总里标 `draft`。
//
// ⚠ 它不出图、也不进 `examples/manifest.ts` —— 清单只管"有哪些示例", 工具不在其中。
// =====================================================================

import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { type Diagnostic, type Scene } from '../src/knives/audit';
import { type ExportOptions, ExportBlockedError, exportScene } from '../src/export';

export type RunOptions = ExportOptions & {
  /** 图去哪: `'stdout'`(缺省)或文件路径 */
  out?: 'stdout' | string;
  /** 门禁没过时草稿图去哪: 缺省与 `out` 同一条通道 */
  draftOut?: 'stdout' | string;
  /** 示例自己的读数行(体积 / 折法 / 投影条数…) —— 打在标准摘要**之前**, 与诊断同走 stderr */
  extra?: string[];
  /** 字节对账档: 只打摘要 + 内容 sha256, **不吐图**(`full-chain --golden` 用) */
  golden?: boolean;
};

const emit = (svg: string, to: 'stdout' | string): void => {
  if (to === 'stdout') process.stdout.write(svg);
  else writeFileSync(to, svg);
};

/** 诊断的规范三行 —— `evidence` 与 `supportedFixes` 不许省(SKILL「诊断怎么读」) */
function dump(d: Diagnostic, indent: string): void {
  console.error(`${indent}[${d.severity}] ${d.code} @ ${d.subject.kind}:${d.subject.id} — ${d.message}`);
  console.error(`${indent}    evidence: ${JSON.stringify(d.evidence)}`);
  for (const f of d.supportedFixes) console.error(`${indent}    fix: ${f.kind} — ${f.hint}`);
}

/**
 * 出图一次。**必须在 `import.meta.main` 里调用** —— 出图示例的顶层要是纯几何,
 * 否则 `scripts/inspect.ts` / web 一 import 它就往 stdout 吐图。
 */
export function runScene(scene: Scene, o: RunOptions = {}): void {
  const { out = 'stdout', draftOut, extra = [], golden = false, ...exportOpts } = o;

  let result;
  try {
    result = exportScene(scene, exportOpts);
  } catch (e) {
    if (!(e instanceof ExportBlockedError)) throw e;   // SceneStaleError 之类照旧上抛(没有草稿可给)
    for (const d of e.report.diagnostics) dump(d, '  ');
    const to = draftOut ?? out;
    emit(e.draft.svg, to);
    console.error(`⚠ 门禁没过(${e.report.level} 档, ${e.report.metrics.errors} error / ${e.report.metrics.warnings} warning)`
      + ` —— 上面那份是**草稿图**(带 data-draft="1"), 交付路径不许用; 草稿落点: ${to}`);
    process.exitCode = 1;   // ← 判决落到 exit code: 少这一行, 门禁在 shell 层就完全失效
    return;
  }

  for (const line of extra) console.error(line);
  console.error(`level=${result.report.level} pass=${result.report.pass} draft=${result.draft}`);
  console.error(`metrics: ${Object.entries(result.report.metrics).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  for (const d of result.report.diagnostics) dump(d, '  ');

  if (golden) {
    // 字节对账档: 只吐摘要 + 内容 sha256 前 12 位(不吐图 —— golden 的用途是"对账", 不是"看")
    const hex = createHash('sha256').update(result.svg).digest('hex');
    console.error(`diagnostics=${result.report.diagnostics.length} bytes=${new TextEncoder().encode(result.svg).length}`);
    console.error(`sha256=${hex.slice(0, 12)}`);
    return;
  }

  emit(result.svg, out);

  // 兜底(到不了这里): `pass === false` 时上面已经抛了 —— 这一行防的是"将来给 runner 开 force 通道"
  // 把保险丝短路。出口纪律的判据是"shell 里能看见判决", 不留"我认为它到不了"的空当。
  if (!result.report.pass) process.exitCode = 1;
}
