// =====================================================================
// knives/describe · 场景读数板: 把「几何」与「判决」拼成一张可读的表
//
// 由来: 手写坐标时**布局完全不可观测** —— 按 `curY += 180` 累加 item 位置, 而节点盒实际高 229,
// 于是框层层互叠; 手里没有别的手段, 只能**自己写 debug 脚本 dump rect**, 来回答"我到底画在哪"。
// 门禁能喊疼(`node_overlap` 一直在报), 但**看清现场**没有对应工具 —— 这就是本刀。
//
// 定位:**几何 × 判决的 join**, 不是第四个判据源。两条来源都是既有的、单一来源的那份:
//   · 几何 = `scene` 本身(节点 / 组 / 边 / 标签 / 文本的坐标, 原样搬, 只做 x+w 这种算术)
//   · 判决 = `audit(scene)` 的报告(码 / 级 / 消息 / evidence / 修法, 原样搬)
// 本刀的**全部工作**是把判决**挂回它审判的那个对象旁边**(按 `Diagnostic.subject`) —— 因为 audit 的
// 诊断是一张按 (code, kind, id) 排序的**平表**, 作者要自己拿 id 去 scene 里对账, 而 agent 恰恰是
// 在这一步开始写临时脚本的。
//
// 明确不做(**每一条都是"别长出第三份口径"**):
//   · **不判**: 不新增任何码 / 阈值 / 级。图上没有门禁的事(颜色 / 语义 / 好不好看)—— 本刀无话可说
//   · **不反算合身度**: "这行字该给多宽的盒"归 `nodeFit`(fit.ts, 与 `label_fit` 同源)。这里不算 ——
//     两份口径的差可以小到 1px(`nodeFit` 的 `Math.ceil` vs 门禁的浮点比较), 而"相差 1px 的两个
//     结论"正是本仓最贵的那类事故。要合身度看挂在节点行下面的 `label_fit` 诊断, 它带原始数字
//   · **不做布局**: 不挪不改不 nudge —— 那是 `nudge` / `assignLanes` / `fit` 的活
//
// 输出纪律(与仓内其余出口一致):
//   · 纯函数 / 字节确定: 同 scene + 同 opts ⇒ 逐字节同输出(排序一律显式, 不靠 Map 迭代序)
//   · **不 mutate 输入**(测试守着)
//   · **差集可见**: ① 每条诊断要么挂在对象下、要么落进「未归属诊断」, 不许静默丢; ② 超过 `maxRows`
//     的行数**显式报数**, 不静默截断 —— 本仓"差集静默存在"已经咬了三次
//
// 为什么对齐用 `textUnits` 而不是 `s.length`: 图的 id 与标签是中文, 终端里全角占 2 格。measure.ts
// 那张 East Asian Width 表是全仓唯一的"字符有多宽"的源, 这里复用它 —— 再写一份"看着像"的宽度
// 判断, 就是又一份会漂的口径。
// =====================================================================

import { round1 } from '../geometry/vec';
import { deriveGroupRect } from '../scene';
import { type AuditLevel, type AuditReport, type Diagnostic, type Scene, audit, labelRect } from './audit';
// `GROUP_FIT_PAD` = 派生框的缺省内边距(与 `cluster_border_clearance` 的门槛同源): 读板上报出这个数,
// 是为了让"派生框凭什么这么大"在读数里可见 —— 不复制这个数字, 直接用那份常量
import { GROUP_FIT_PAD } from './cluster';
import { textUnits } from './measure';

/** 段落开关。缺省除了 `metrics` 全开(metrics 有 47 项, 默认只报条数, 要看再开) */
export type DescribeSections = {
  nodes: boolean;
  groups: boolean;
  edges: boolean;
  labels: boolean;
  texts: boolean;
  embeds: boolean;
  diagnostics: boolean;
  fixes: boolean;
  metrics: boolean;
};

export type DescribeOptions = {
  /** 审计档位(缺省 `standard`, 与 `audit` 同缺省)。传了 `report` 时以那份报告为准, 本项只标表头 */
  level?: AuditLevel;
  /**
   * 预跑好的报告。给了就用它, **不再跑一遍 audit** —— CLI 侧本来就要拿报告定退出码,
   * 跑两遍既费时间, 又给了"退出码与读板依据不同"的机会(两份报告可以因档位不同而不一致)。
   */
  report?: AuditReport;
  /** 段落开关(浅合并; 只写要改的那几项) */
  include?: Partial<DescribeSections>;
  /** 每段最多几行, 超出显式报数(缺省 40) */
  maxRows?: number;
  /** 每个对象下最多挂几条诊断, 超出显式报数(缺省 3) */
  maxNotes?: number;
  /** 折点最多列几个, 超出显式报数(缺省 12) */
  maxPoints?: number;
};

const n1 = (v: number): string => (Number.isFinite(v) ? String(round1(v)) : String(v));

/**
 * `bounds_source` 是 `SceneDoc` 的字段(scene.ts 的节点比 audit 的多这一位, 因为它记的是"这个盒
 * 从哪来")。读数**不为此收窄入参类型** —— 它接受最宽的 `Scene`, 要读这一位就地取。
 */
const boundsSource = (node: object): string | undefined => (node as { bounds_source?: string }).bounds_source;

/** 终端格数: 半角 1 / 全角 2(`measure.ts` 的 `textUnits`) */
const cells = (s: string): number => textUnits(s);

const padEndCells = (s: string, w: number): string => s + ' '.repeat(Math.max(0, w - cells(s)));

/** 右对齐的数字列(定宽; 数字是半角, 定宽即对齐) */
const num = (v: number, w = 7): string => n1(v).padStart(w);

/**
 * 上屏**一行**用的文本(260920): 本读数是"一行一个对象"的表, 而 `label` / `sub` / `text`
 * 都支持作者写的 `\n`(多行) —— 原样打进一行会把表撑断, 且断在哪完全取决于文案。
 * 折成 `⏎` 并报出**行数**, 差集可见(静默截断/换行正是本仓咬过三次的病)。
 */
const oneLine = (s: string): string => s.replace(/\n/g, '⏎');

/** UTF-8 字节数 —— markup 里可能有中文标签, 而 `.length` 数的是 UTF-16 码元(CJK 会数成 1 而不是 3) */
const utf8Bytes = (s: string): number => {
  let n = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0) as number;
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
};

const rect4 = (r: { x: number; y: number; w: number; h: number }): string =>
  `x${num(r.x)} y${num(r.y)} w${num(r.w)} h${num(r.h)}`;

const notesPrefix = '      ';

/** 诊断一行: 码 + 级 + 消息 + evidence(原样 JSON, 便于逐字节 diff) */
const noteLine = (d: Diagnostic): string => `${notesPrefix}! ${d.code}[${d.severity}] ${d.message}  evidence=${JSON.stringify(d.evidence)}`;

function pushNotes(out: string[], diags: Diagnostic[], maxNotes: number): void {
  for (const d of diags.slice(0, maxNotes)) out.push(noteLine(d));
  if (diags.length > maxNotes) out.push(`${notesPrefix}… 还有 ${diags.length - maxNotes} 条(调 maxNotes 展开)`);
}

function truncationNote(shown: number, total: number, what: string): string {
  return `  … 还有 ${total - shown} 条${what}(调 maxRows 展开)`;
}

/**
 * 场景读数: 一张纯文本的表, 逐对象列出顶层坐标, 并把 `audit` 的判决挂到对应对象下面。
 *
 * 用途是**迭代时的眼睛**(agent / 人都是): "我到底摆在哪了 / 门禁在说哪一条"。它不替代产物 ——
 * 视觉判断仍要出 SVG 看(或 `scripts/svg2png.sh` 栅格化)。
 */
export function describeScene(scene: Scene, opts: DescribeOptions = {}): string {
  const level: AuditLevel = opts.report ? opts.report.level : (opts.level ?? 'standard');
  const report = opts.report ?? audit(scene, { level });
  const include: DescribeSections = {
    nodes: true, groups: true, edges: true, labels: true, texts: true, embeds: true,
    diagnostics: true, fixes: true, metrics: false,
    ...opts.include,
  };
  const maxRows = opts.maxRows ?? 40;
  const maxNotes = opts.maxNotes ?? 3;
  const maxPoints = opts.maxPoints ?? 12;

  // --- 判决按 subject 归堆: 本刀的全部机制就是这一次 join -------------------
  const bySubject = new Map<string, Diagnostic[]>();
  for (const d of report.diagnostics) {
    const key = `${d.subject.kind}:${d.subject.id}`;
    const bucket = bySubject.get(key);
    if (bucket) bucket.push(d);
    else bySubject.set(key, [d]);
  }
  /** 已被某个对象认领的诊断 —— 没被认领的必须显式出现(差集可见), 不许静默丢 */
  const claimed = new Set<Diagnostic>();
  const take = (kind: string, id: string): Diagnostic[] => {
    const list = bySubject.get(`${kind}:${id}`) ?? [];
    for (const d of list) claimed.add(d);
    return list;
  };

  const out: string[] = [];
  const metrics = report.metrics;
  out.push(
    `# svg-infovis 场景读数 · ${n1(scene.width)}×${n1(scene.height)} · ` +
    `nodes ${scene.nodes.length} · edges ${scene.edges.length} · groups ${(scene.groups ?? []).length} · ` +
    `labels ${(scene.labels ?? []).length} · texts ${(scene.texts ?? []).length}`,
  );
  out.push(
    `# audit(${level}) ${report.pass ? 'pass' : 'FAIL'} · ` +
    `${metrics.errors ?? 0} error / ${metrics.warnings ?? 0} warning · ` +
    `metrics ${Object.keys(metrics).length} 项(${include.metrics ? '见下' : 'include.metrics 展开'})`,
  );
  out.push('# 坐标 = 顶层左上角原点; R = x+w / B = y+h。判决一律来自 audit —— 本读数自己不判(免生第三份口径)');

  // --- nodes ---------------------------------------------------------
  if (include.nodes) {
    out.push('');
    out.push(`## nodes (${scene.nodes.length})`);
    if (!scene.nodes.length) out.push('  (无)');
    // 按 y 再 x 排: 层带 / 节奏是作者第一眼要看的东西(纯排序, 不是判决)
    const rows = [...scene.nodes].sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
    const idW = Math.max(0, ...rows.map((n) => cells(n.id)));
    for (const n of rows.slice(0, maxRows)) {
      const bits = [`  ${padEndCells(n.id, idW)}  ${rect4(n.rect)}  R${num(n.rect.x + n.rect.w)} B${num(n.rect.y + n.rect.h)}`];
      if (n.label !== undefined) bits.push(`"${oneLine(n.label)}"`);
      if (n.sub !== undefined) bits.push(`sub="${oneLine(n.sub)}"`);
      if (n.fontSize !== undefined) bits.push(`fs${n1(n.fontSize)}`);
      if (n.shape !== undefined) bits.push(`shape=${n.shape}`);
      if (n.tone !== undefined) bits.push(`tone=${n.tone}`);
      if (n.variant !== undefined) bits.push(`variant=${n.variant}`);
      const bs = boundsSource(n);
      if (bs !== undefined) bits.push(`bounds=${bs}`);
      out.push(bits.join('  '));
      pushNotes(out, take('node', n.id), maxNotes);
    }
    if (rows.length > maxRows) out.push(truncationNote(maxRows, rows.length, '节点'));
  }

  // --- groups --------------------------------------------------------
  if (include.groups) {
    const groups = scene.groups ?? [];
    out.push('');
    out.push(`## groups (${groups.length})`);
    out.push('  [frame 未声明 / members ⇒ 框是派生量(成员并集 + pad); declared ⇒ 作者声明, 派生跳过]');
    out.push('  [「实际内边距」= 框减成员并集, 正数=框比成员大; 它量的是作者给的留白, 不是判决]');
    if (!groups.length) out.push('  (无)');
    const idW = Math.max(0, ...groups.map((g) => cells(g.id)));
    for (const g of groups.slice(0, maxRows)) {
      const frame = g.frame ?? 'members';
      out.push(`  ${padEndCells(g.id, idW)}  frame=${g.frame ?? '未声明'}  rect ${rect4(g.rect)}${g.label !== undefined ? `  "${oneLine(g.label)}"` : ''}`);
      // 成员并集 = `deriveGroupRect` 取 `pad: 0`(同一个派生函数, 不另写一份并集算法)
      const union = deriveGroupRect(scene, g.id, { pad: 0 });
      if (union) {
        const padL = round1(union.x - g.rect.x);
        const padT = round1(union.y - g.rect.y);
        const padR = round1(g.rect.x + g.rect.w - union.x - union.w);
        const padB = round1(g.rect.y + g.rect.h - union.y - union.h);
        out.push(`          成员并集(pad 0) ${rect4(union)}  → 实际内边距 左 ${n1(padL)} 上 ${n1(padT)} 右 ${n1(padR)} 下 ${n1(padB)}`);
      } else {
        out.push('          成员并集(pad 0) 无成员可算(未声明 contains 且几何上没装住任何节点)');
      }
      // 派生框: 与门禁同源(`deriveGroupRect`, 缺省 pad = `GROUP_FIT_PAD`)
      const derived = deriveGroupRect(scene, g.id);
      if (frame === 'declared') {
        out.push(`          frame=declared: 派生跳过(作者声明的框不许被成员并集覆盖)${derived ? `; 若强行派生会算成 ${rect4(derived)}` : ''}`);
      } else if (derived) {
        // `frame` 是派生口径而 rect 不等于派生值 ⇒ 这个框是手写的(实测里绝大多数场景如此)。
        // 只标事实 "(≠ 上一行)", 不说它错 —— 框该不该等于派生值是可讨论的, 归 `frameBudget` 那一项
        const handWritten = rect4(derived) !== rect4(g.rect);
        out.push(`          derived(pad ${n1(GROUP_FIT_PAD)}) ${rect4(derived)}${handWritten ? '   (≠ 上一行: 手写的 rect 未走派生)' : ''}`);
      } else {
        out.push(`          derived(pad ${n1(GROUP_FIT_PAD)}) 无成员可派生`);
      }
      if (g.labelRect) out.push(`          labelRect ${rect4(g.labelRect)}`);
      if (g.contains) out.push(`          成员声明 ${g.contains.length}: ${g.contains.join(' ')}`);
      else out.push('          成员未声明(四条组自洽门禁一概不管; density 走几何启发式回落)');
      pushNotes(out, take('group', g.id), maxNotes);
    }
    if (groups.length > maxRows) out.push(truncationNote(maxRows, groups.length, '组'));
  }

  // --- edges ---------------------------------------------------------
  if (include.edges) {
    out.push('');
    out.push(`## edges (${scene.edges.length})`);
    if (!scene.edges.length) out.push('  (无)');
    const idW = Math.max(0, ...scene.edges.map((e) => cells(e.id)));
    for (const e of scene.edges.slice(0, maxRows)) {
      const ends = `${e.from ?? '?'} → ${e.to ?? '?'}`;
      let len = 0;
      for (let i = 1; i < e.points.length; i++) {
        len += Math.abs(e.points[i].x - e.points[i - 1].x) + Math.abs(e.points[i].y - e.points[i - 1].y);
      }
      const pts = e.points.slice(0, maxPoints).map((p) => `(${n1(p.x)},${n1(p.y)})`).join(' ');
      out.push(
        `  ${padEndCells(e.id, idW)}  ${ends}  ${e.points.length} 点 / ${Math.max(0, e.points.length - 2)} 折  长 ${n1(len)}` +
        `${e.tone !== undefined ? `  tone=${e.tone}` : ''}${e.label !== undefined ? `  "${oneLine(e.label)}"` : ''}`,
      );
      out.push(`          ${pts}${e.points.length > maxPoints ? ` … 还有 ${e.points.length - maxPoints} 个折点(调 maxPoints 展开)` : ''}`);
      pushNotes(out, take('edge', e.id), maxNotes);
    }
    if (scene.edges.length > maxRows) out.push(truncationNote(maxRows, scene.edges.length, '边'));
  }

  // --- labels --------------------------------------------------------
  if (include.labels) {
    const labels = scene.labels ?? [];
    out.push('');
    out.push(`## labels (${labels.length})`);
    if (!labels.length) out.push('  (无)');
    const idW = Math.max(0, ...labels.map((l) => cells(l.id)));
    for (const l of labels.slice(0, maxRows)) {
      const r = labelRect(l);
      out.push(
        `  ${padEndCells(l.id, idW)}  rect ${rect4(r)}  at ${n1(l.at.x)},${n1(l.at.y)}` +
        `${l.ownerEdge !== undefined ? `  owner=${l.ownerEdge}` : ''}` +
        `${l.fontSize !== undefined ? `  fs${n1(l.fontSize)}` : ''}` +
        `${l.text === undefined ? '  (无 text: 占位, 不上屏)' : `  "${oneLine(l.text)}"`}`,
      );
      pushNotes(out, take('label', l.id), maxNotes);
    }
    if (labels.length > maxRows) out.push(truncationNote(maxRows, labels.length, '标签'));
  }

  // --- texts ---------------------------------------------------------
  if (include.texts) {
    const texts = scene.texts ?? [];
    out.push('');
    out.push(`## texts (${texts.length})`);
    if (!texts.length) out.push('  (无)');
    const idW = Math.max(0, ...texts.map((t) => cells(t.id)));
    for (const t of texts.slice(0, maxRows)) {
      out.push(
        `  ${padEndCells(t.id, idW)}  rect ${rect4(t.rect)}${t.anchor !== undefined ? `  anchor=${t.anchor}` : ''}` +
        // 归属位(260923): 有它才有那条"自家边不判净空"的豁免 —— 读数板得看得见它, 不然作者
        // 只能靠"门禁怎么没报"去反推自己配没配上(同 scene 自解释那条口径)
        `${t.owner ? `  owner=${t.owner.kind}:${t.owner.id}` : ''}` +
        `${t.fontSize !== undefined ? `  fs${n1(t.fontSize)}` : ''}` +
        `${t.text === undefined ? '  (无 text: 幽灵文本, 不上屏却参与审计)' : `  "${oneLine(t.text)}"`}`,
      );
      pushNotes(out, take('text', t.id), maxNotes);
    }
    if (texts.length > maxRows) out.push(truncationNote(maxRows, texts.length, '文本块'));
  }

  // --- embeds(外部素材) ------------------------------------------------
  // 零新判决: rect / R·B 原样搬 scene, `asset` 的元信息原样搬素材 —— 不算合身度(素材"像不像图表"
  // 不归这里管), 不判净空(素材不进任何门禁, 见 SKILL「API 速查」的 embed 条)
  if (include.embeds) {
    const embeds = scene.embeds ?? [];
    out.push('');
    out.push(`## embeds (${embeds.length})`);
    if (!embeds.length) out.push('  (无)');
    const idW = Math.max(0, ...embeds.map((e) => cells(e.id)));
    for (const e of embeds.slice(0, maxRows)) {
      const r = e.rect;
      const vb = e.asset.viewBox;
      out.push(
        `  ${padEndCells(e.id, idW)}  rect ${rect4(r)}  R${num(r.x + r.w)} B${num(r.y + r.h)}` +
        `  asset=${e.asset.name ?? '(未命名)'}  viewBox ${n1(vb.x)} ${n1(vb.y)} ${n1(vb.w)} ${n1(vb.h)}` +
        `  markup ${utf8Bytes(e.asset.markup)}B${e.opacity !== undefined ? `  opacity=${n1(e.opacity)}` : ''}`,
      );
      // 构建期丢掉的东西**非空才提示** —— 素材面与渲染面的差集必须看得见(差集为空时不必填一行"没有")
      if (e.asset.dropped.length) {
        out.push(`          构建期有意丢掉 ${e.asset.dropped.length} 项: ${e.asset.dropped.join('; ')}`);
      }
      pushNotes(out, take('embed', e.id), maxNotes);
    }
    if (embeds.length > maxRows) out.push(truncationNote(maxRows, embeds.length, '素材'));
  }

  // --- 未归属诊断(差集可见) --------------------------------------------
  const orphans = report.diagnostics.filter((d) => !claimed.has(d));
  if (include.diagnostics) {
    out.push('');
    out.push(`## 场景级 / 未归属诊断 (${orphans.length})   [subject 不指向本表任何对象: 审计面在 scene 上 / id 打错 / 它的对象被 maxRows 截掉了]`);
    if (!orphans.length) out.push('  (无)');
    else for (const d of orphans) out.push(`  ! ${d.code}[${d.severity}] ${d.subject.kind}:${d.subject.id} ${d.message}  evidence=${JSON.stringify(d.evidence)}`);
  }

  // --- 修法(按码汇一次: 同一句 hint 挂在 20 个对象下是纯噪声) ----------
  if (include.fixes && report.diagnostics.length) {
    const byCode = new Map<string, Diagnostic[]>();
    for (const d of report.diagnostics) {
      const bucket = byCode.get(d.code);
      if (bucket) bucket.push(d);
      else byCode.set(d.code, [d]);
    }
    out.push('');
    out.push(`## 修法 (${byCode.size} 个码)`);
    for (const code of [...byCode.keys()].sort()) {
      const list = byCode.get(code)!;
      out.push(`  ${code} ×${list.length}  [${list[0].severity}]`);
      const seen = new Set<string>();
      for (const d of list) {
        for (const f of d.supportedFixes) {
          const line = `    · ${f.kind} — ${f.hint}`;
          if (seen.has(line)) continue;
          seen.add(line);
          out.push(line);
        }
      }
    }
  }

  // --- metrics -------------------------------------------------------
  if (include.metrics) {
    const keys = Object.keys(metrics).sort();
    out.push('');
    out.push(`## metrics (${keys.length})   [-1 = 无此项可测, 不是 0; 见 SKILL「诊断读法」]`);
    for (const k of keys) out.push(`  ${k} = ${n1(metrics[k])}`);
  }

  return out.join('\n') + '\n';
}
