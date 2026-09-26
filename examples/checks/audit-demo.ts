// =====================================================================
// audit-demo · 门禁脏样本: 故意埋四类违例, 把诊断逐条打出来给人看(含 evidence 与 supportedFixes)
//   bun run examples/checks/audit-demo.ts > /tmp/dirty.svg     (违例元素逐条标出, 方便肉眼对账)
//
// 它**不自带判据** —— "违例真的被抓住 / 修法真的给得出来 / 两档判分真的分得开"由
// `test/audit-demo.test.ts` 守着(judgment 归 test, 示例只管展示; 详见 SKILL「出口纪律」)。
// 两个场景**具名导出**, 就是为了让那份测试与这份展示读同一份数据。
// ⚠ 它是**非出口示例**: 出图走裸 `toSVG`, 不过门禁 —— 故意画的违例本来就过不了门禁。
//
// 这张图自己病过一场(260925 重做)。五条教训留在这儿, 因为它们是**门禁口径**不是这张图的私事:
//   · **描红要认准真凶**: 门禁判的是一对盒子, `subject` 只是配对里靠前那一个 —— 旧版直接拿
//     `subject.id` 描红, 于是受害者 B 被框红, 压它的 D 与贴它的 C 反倒清白。真凶在
//     `evidence.other` 里(与修法里 `nudge` 要挪的是同一个 id), 见 `culprits`。
//   · **标签没有覆盖通道**: `ExportOptions` 只有 node / group / edge 三张表, 没有 labelStyles ——
//     跨界标签的红只能写在它自己的 scene 字段上(`color` / `bg`), 见 `L-cross`。别假装它能描红。
//   · **端点必须落在盒面上**: 悬空 140px 的箭头在门禁眼里完全合法(它查穿盒, 不查悬空),
//     却是教学图上最坏的示范 —— 所有面上的点一律 `rectFace` 派生。
//   · **违例得看得见**: 门禁抓得住、图上看不出的违例, 在教学图里等于没有 —— 6px 斜量落在长跑上
//     只有 10.6°, 再被圆角一糊就没了; 让它跑短一点(23°)才立得住(见 `SKEW`)。
//   · **遮罩尺寸只有一处来源**: `labelBoxSize`(上屏那张与 audit 的 `labelRect` 同吃它)。
//     手写一个 `h: 19` 是 260925 之前的旧口径(现行单行 11 号 = 14.8) —— 手抄尺寸就是第二个真相。
// =====================================================================

import { type Diagnostic, type Scene, audit } from '../../src/knives/audit';
import type { Rect } from '../../src/geometry/vec';
import { rectFace } from '../../src/geometry/box';
import { edgeLabel } from '../../src/shapes/edge';
import { THEMES } from '../../src/theme';
import { sceneChildren } from '../../src/export';
import { svg } from '../../src/descriptor';
import { toSVG } from '../../src/serialize';
import { isMainModule } from '../../src/runtime';

// 描红的色: **单点例外**才用(角色该写 scene 的 tone 里, 见 nodeStyles 那条口径) —— 三处共用一份
const RED = '#dc2626';

// --- 版式: 盒位是作者的决策, 一切"面上的点"必须从盒派生 -------------------
//
// 手抄一个 `{ x: 320, y: 170 }` 当端点, 就是"箭头指空气、门禁一声不吭"那张最坏示范:
// 门禁只查穿盒, 不查悬空 —— 悬空的端点要等读者用眼睛发现, 而教学图上不该出这种题。
const A: Rect = { x: 60, y: 30, w: 120, h: 46 };
const B: Rect = { x: 60, y: 170, w: 120, h: 46 };
const CROWD: Rect = { x: 62, y: 220, w: 120, h: 46 };   // 违例①: 与 B 垂直净空只有 4px(standard 要 8 / showcase 要 12)
const OVERLAP: Rect = { x: 158, y: 160, w: 96, h: 34 }; // 违例②: 真压在 B 的右上角, 但让开 B 的标签行(旧版整块盖死了 B 的字)

const LANE_R = 320; // ok 的右侧走廊 x
const LANE_L = 30;  // skew 的左侧走廊 x

// 四条边的端点一律 rectFace 派生(面 / t 位上, 不是"差不多在附近")
const A_R = rectFace(A, 'right');               // (180, 53)   A 的右面中点
const B_R = rectFace(B, 'right', { t: 0.75 });  // (180, 204.5) B 的右面 3/4 高处 —— 避开压在右上角的 OVERLAP
const B_L = rectFace(B, 'left');                // (60, 193)   B 的左面中点
const C_L = rectFace(CROWD, 'left');            // (62, 243)   CROWD 的左面中点

/** ok: A → B, 走右侧走廊绕进来再折回 B 的右面(旧版这条的终点悬在半空) */
const OK = {
  id: 'ok', from: 'a', to: 'b',
  points: [A_R, { x: LANE_R, y: A_R.y }, { x: LANE_R, y: B_R.y }, B_R],
};
/**
 * skew: B → CROWD, 走左侧走廊。
 *
 * 违例③ = 末段那 6px 斜量(手排最常见的"看着像正交")。两条讲究都在这一条边里:
 *   · 斜段放**末段**: 末段没有后继段, 于是只犯 `orthogonal_edges` 一条。斜段若夹在中间, 相邻
 *     两段点积为负 ⇒ 顺带触发 `no_backtrack` 那个"沉默的第五类"(旧版正是如此, 诊断清单里多一条
 *     读者就得去问"第五类是哪一类")。
 *   · 斜段要**短**(14px 跑 6px 落差 = 23°): 6px 落在 32px 的长跑上只有 10.6°, 再被 10px 的圆角
 *     一糊就看不见了 —— 门禁抓得住、图上却看不出的违例, 在门禁教学图里等于没有。
 */
const SKEW_PX = 6;   // 斜量(px): 腰线的 y 与它要进的端口差这么多
const SKEW_RUN = 14; // 斜段的水平跑长(px): 短才显斜
const SKEW = {
  id: 'skew', from: 'b', to: 'crowd',
  points: [
    B_L,
    { x: LANE_L, y: B_L.y },
    { x: LANE_L, y: C_L.y - SKEW_PX },
    { x: C_L.x - SKEW_RUN, y: C_L.y - SKEW_PX },
    C_L,
  ],
};

// 标签一律走 edgeLabel(位置尺寸全同源: 外框 = labelBoxSize) —— 不再手写 width / height
const L_OWN = edgeLabel(OK, '自家标签', { id: 'L-own', at: { x: 250, y: A_R.y } });
// 违例④: 压在 ok 的竖段上(净空 0), 而它属于 skew → 不豁免。落位取那条竖段的**中点**(派生, 不手抄 y)
const CROSS_AT = { x: LANE_R, y: (A_R.y + B_R.y) / 2 };
// 标签的红写在自己的 scene 字段上: `bg` 取主题 rose 的 tint(与渲染同一个主题, 不是手抄色值),
// 字色走 `color` —— 这就是"标签无覆盖通道"的诚实解法: 徽章看得见, 但它**不是**被覆盖表描红的
const L_CROSS = edgeLabel(SKEW, '跨界标签', {
  id: 'L-cross', at: CROSS_AT, color: RED, bg: THEMES.light.tones.rose.tint,
});

/** 一份"看起来没问题、其实埋了四类违例"的 scene —— 诊断 code 集就该是那四类(判据在 test/) */
export const dirty: Scene = {
  width: 560,
  height: 340,
  nodes: [
    { id: 'a', rect: A, label: 'A · 正常' },
    { id: 'b', rect: B, label: 'B · 正常' },
    { id: 'crowd', rect: CROWD, label: 'C · 贴太近' },    // 违例①: 贴太近的那个是它(旧版被描红的是受害者 B)
    { id: 'overlap', rect: OVERLAP, label: 'D · 重叠' },  // 违例②: 压过去的那个是它
  ],
  edges: [OK, SKEW],
  labels: [L_OWN, L_CROSS],
};

// --- 干净对照: 同一套门禁, 该放的全放 --------------------------------
const X: Rect = { x: 40, y: 30, w: 110, h: 44 };
const Y: Rect = { x: 250, y: 170, w: 110, h: 44 };
const CLEAN_LANE_Y = 120;
const CLEAN_HEAD = rectFace(X, 'bottom');
const CLEAN_TAIL = rectFace(Y, 'top');
const CLEAN_E = {
  id: 'e', from: 'x', to: 'y',
  points: [CLEAN_HEAD, { x: CLEAN_HEAD.x, y: CLEAN_LANE_Y }, { x: CLEAN_TAIL.x, y: CLEAN_LANE_Y }, CLEAN_TAIL],
};

export const clean: Scene = {
  width: 420,
  height: 260,
  nodes: [{ id: 'x', rect: X, label: 'X' }, { id: 'y', rect: Y, label: 'Y' }],
  edges: [CLEAN_E],
  // 自家标签压在自家边上 —— 豁免面就是这一条(两档都不报)
  labels: [edgeLabel(CLEAN_E, 'route', { id: 'L', at: { x: 200, y: CLEAN_LANE_Y } })],
};

// --- 诊断打印(只给眼睛看; 判据在 test/) ------------------------------

const show = (title: string, scene: Scene, level: 'standard' | 'showcase') => {
  const r = audit(scene, { level });
  console.error(`\n=== ${title} · ${level} → ${r.pass ? 'PASS' : 'FAIL'} ===`);
  console.error('metrics:', Object.entries(r.metrics).map(([k, v]) => `${k}=${v}`).join('  '));
  for (const d of r.diagnostics) {
    console.error(`  [${d.severity.toUpperCase()}] ${d.code} @ ${d.subject.kind}:${d.subject.id} — ${d.message}`);
    console.error(`      evidence: ${JSON.stringify(d.evidence)}`);
    for (const f of d.supportedFixes) console.error(`      fix: ${f.kind} — ${f.hint}`);
  }
  if (!r.diagnostics.length) console.error('  (无诊断)');
  return r;
};

/**
 * 诊断 → **真凶** id(描红用)。
 *
 * `subject` 不总是真凶: `node_gap` / `node_overlap` 判的是一对盒子, 报出来的是配对里**靠前**那个
 * —— 于是"受害者"被点名, 真凶藏在 `evidence.other` 里(它同时是 supportedFixes 里 `nudge` 要挪的
 * 那一个, 两处同源)。只有 `node` / `edge` 两类进这个集合: 那正是这里给了覆盖表的两类 —— 标签
 * **压根没有** labelStyles 这张表(见文件头第二条), 硬塞进来只会得到一个"看着标了、其实没上屏"的假红,
 * 它的可见化在 scene 自己的 `color` / `bg` 上。
 */
const culprits = (diags: Diagnostic[]): string[] => [...new Set(diags.flatMap((d) => {
  if (d.subject.kind !== 'node' && d.subject.kind !== 'edge') return [];
  if (d.code === 'node_gap' || d.code === 'node_overlap') {
    const other = d.evidence.other;
    return typeof other === 'string' ? [other] : [];
  }
  return [d.subject.id];
}))];

// 断言式自检在 `test/audit-demo.test.ts`(同一份 `dirty` / `clean` 数据): 本文件只把诊断打给人看。
// 打印与出图都收在 `isMainModule(import.meta.url)` 里 —— 被 import 时本模块是**纯数据**, 不往 stderr 灌 54 行噪声
// (那份测试 import 它, 过去每次 `bun test` 都要带上这段)。
if (isMainModule(import.meta.url)) {
  const r1 = show('dirty scene', dirty, 'standard');
  show('dirty scene', dirty, 'showcase');
  show('clean scene', clean, 'showcase');

  // 出图: 把 dirty scene 画出来, 违例元素描红(方便肉眼对账)
  // **渲染面直接吃 sceneChildren** —— 不再手拼 children, 否则又是一处"渲染与审计漂开"的入口
  const red = culprits(r1.diagnostics);
  const entries = <T,>(ids: string[], patch: T): Array<[string, T]> => ids.map((id) => [id, patch]);
  const children = sceneChildren(dirty, {
    theme: THEMES.light, // 与上面那份 rose tint 同一个主题(遮罩底色不是手抄的色值)
    nodeStyles: Object.fromEntries(entries(red.filter((id) => dirty.nodes.some((n) => n.id === id)), { stroke: RED, strokeWidth: 2 })),
    edgeStyles: Object.fromEntries(entries(red.filter((id) => dirty.edges.some((e) => e.id === id)), { color: RED, width: 2 })),
  });
  process.stdout.write(toSVG(svg(dirty.width, dirty.height, children, { 'font-family': 'ui-sans-serif, system-ui, sans-serif' }), { declaration: false }));
}
