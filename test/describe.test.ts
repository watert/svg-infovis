// =====================================================================
// describe · 场景读数板的判据
//
// 这套测试的自检问题不是"字符串里有那几个词", 而是**换掉实现后会不会红**。三条最容易做成
// "看起来测了其实没测"的地方, 各自的反例都写进了用例:
//   ① 对齐用 `.length` 而不是终端格数 → CJK id 那两条会红(`textUnits` 真值 = 6 格 vs `.length` = 3)
//   ② 传了 `report` 却还跑一遍 audit → 合成报告那两条会红(真问题会冒出来 / 表头档位会变)
//   ③ 截断静默 → "还有 N 条" 那几条会红(差集不可见正是本仓咬过三次的病)
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { textUnits } from '../src/knives/measure';
import { type AuditReport, type Scene, THRESHOLDS, audit } from '../src/knives/audit';
import { describeScene } from '../src/knives/describe';

const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

/** agent-14 的翻车形态: `curY += 180` 而节点盒实际高 229 → 相邻框互叠 49px */
function replica(): Scene {
  return {
    width: 1180, height: 740,
    nodes: [0, 1, 2, 3].map((i) => ({
      id: `n-src-${i}`, rect: rect(60, 40 + i * 180, 260, 229), label: `来源 ${i}`,
    })),
    edges: [{
      id: 'e-0', from: 'n-src-0', to: 'n-src-3',
      points: [{ x: 320, y: 150 }, { x: 500, y: 150 }, { x: 500, y: 690 }, { x: 320, y: 690 }],
    }],
  };
}

/** 干净场景: 节点分两列, 间距足够, 无诊断 */
function cleanScene(): Scene {
  return {
    width: 600, height: 400,
    nodes: [
      { id: 'a', rect: rect(40, 40, 160, 60), label: 'A' },
      { id: 'b', rect: rect(360, 40, 160, 60), label: 'B' },
    ],
    edges: [{ id: 'e', from: 'a', to: 'b', points: [{ x: 200, y: 70 }, { x: 360, y: 70 }] }],
  };
}

/** 行号(0-based); 找不到返回 -1 —— 断言"挂在哪儿"时靠它比位置 */
const lineOf = (text: string, needle: string): number => text.split('\n').findIndex((l) => l.includes(needle));

/** 该行 `y` 之前的**终端格数**(不是 UTF-16 下标): 对齐判据必须按格数, 否则 CJK id 会假绿 */
const cellsBeforeY = (line: string): number => textUnits(line.slice(0, line.indexOf('y')));

describe('describeScene · 头部与判决来源', () => {
  it('头部报出实际计数, 判决行与 audit 一致', () => {
    const scene = replica();
    const report = audit(scene);
    const text = describeScene(scene, { report });
    expect(text).toContain('# svg-infovis 场景读数 · 1180×740 · nodes 4 · edges 1 · groups 0 · labels 0 · texts 0');
    expect(report.pass).toBe(false);
    expect(text).toContain(`# audit(standard) FAIL · ${report.metrics.errors} error / ${report.metrics.warnings} warning`);
  });

  it('传了 report 就不再跑 audit: 真问题不冒出来, 表头档位随 report(而不是 opts.level)', () => {
    const scene = replica();                       // 真有 node_overlap, 真 audit 会 FAIL
    const fake: AuditReport = { pass: true, level: 'showcase', metrics: { errors: 0, warnings: 0 }, diagnostics: [] };
    const text = describeScene(scene, { report: fake, level: 'standard' });
    expect(text).toContain('# audit(showcase) pass · 0 error / 0 warning');
    expect(text).not.toContain('node_overlap');    // 若偷偷重跑 audit, 这条必然出现
    expect(lineOf(text, '## 场景级 / 未归属诊断 (0)')).toBeGreaterThan(0);
  });

  it('没传 report 时按 opts.level 跑一次 audit(两档的判决可以不同)', () => {
    const scene = cleanScene();
    expect(describeScene(scene, { level: 'showcase' })).toContain('# audit(showcase)');
    expect(describeScene(scene, { level: 'standard' })).toContain('# audit(standard)');
  });
});

describe('describeScene · 几何可见(本刀存在的理由)', () => {
  it('节点行带真实 x/y/w/h 与 R/B —— 180 vs 229 这类错在读数里一眼可见', () => {
    const text = describeScene(replica());
    // 注意: 不能用 `includes('n-src-1')` 找行 —— n-src-0 的诊断消息里也提到它(那正是"平表"的病),
    // 所以按行首形态取
    const row = text.split('\n').find((l) => /^ {2}n-src-1 {2}x/.test(l))!;
    expect(row).toContain('y    220');
    expect(row).toContain('h    229');
    expect(row).toContain('R    320');
    expect(row).toContain('B    449');             // 220 + 229
    expect(row).toContain('"来源 1"');
  });

  it('节点按 y 再 x 排(层带 / 节奏是第一眼要看的东西)', () => {
    const text = describeScene(replica());
    const ids = text.split('\n').filter((l) => /^ {2}n-src-\d/.test(l)).map((l) => l.trim().split(/\s+/)[0]);
    expect(ids).toEqual(['n-src-0', 'n-src-1', 'n-src-2', 'n-src-3']);
  });

  it('折点列直接列出(不必再写 debug 脚本 dump)', () => {
    const text = describeScene(replica());
    expect(text).toContain('4 点 / 2 折');
    expect(text).toContain('(320,150) (500,150) (500,690) (320,690)');
  });

  it('组段并列三份几何: 手写 rect / 成员并集(pad 0) / derived(缺省 pad)', () => {
    const scene: Scene = {
      width: 600, height: 400,
      nodes: [{ id: 'a', rect: rect(60, 60, 100, 40), label: 'A' }],
      edges: [],
      groups: [{ id: 'g', rect: rect(40, 40, 140, 400), label: '组', contains: ['a'] }],
    };
    const text = describeScene(scene);
    expect(text).toContain('g  frame=未声明  rect x     40 y     40 w    140 h    400  "组"');
    expect(text).toContain('成员并集(pad 0) x     60 y     60 w    100 h     40');
    // 实际内边距 = 框减成员并集: 左 20 / 上 20 / 右 20 / 下 340(全是作者给的留白)
    expect(text).toContain('实际内边距 左 20 上 20 右 20 下 340');
    // derived 走 `GROUP_FIT_PAD`(24 + 4), 与门禁同源; 手写 rect 与它不等 → 标事实
    expect(text).toContain('(≠ 上一行: 手写的 rect 未走派生)');
  });

  it('frame=declared 的组: 派生跳过, 且报出"若强行派生会算成"多少', () => {
    const scene: Scene = {
      width: 600, height: 400,
      nodes: [{ id: 'a', rect: rect(60, 60, 100, 40), label: 'A' }],
      edges: [],
      groups: [{ id: 'g', rect: rect(0, 0, 600, 400), frame: 'declared', contains: ['a'] }],
    };
    const text = describeScene(scene);
    expect(text).toContain('frame=declared');
    expect(text).toContain('派生跳过(作者声明的框不许被成员并集覆盖)');
    expect(text).toContain('若强行派生会算成');
  });

  it('labels / texts: 没 text 的占位必须自己说出来(不上屏的事不许静默)', () => {
    const scene: Scene = {
      width: 600, height: 400,
      nodes: [{ id: 'a', rect: rect(40, 40, 160, 60), label: 'A' }],
      edges: [],
      labels: [{ id: 'l1', at: { x: 300, y: 200 }, width: 60, height: 18 }],
      texts: [{ id: 't1', rect: rect(40, 320, 120, 18) }],
    };
    const text = describeScene(scene);
    expect(text).toContain('l1  rect x');
    expect(text).toContain('(无 text: 占位, 不上屏)');
    expect(text).toContain('(无 text: 幽灵文本, 不上屏却参与审计)');
  });
  it('多行 label / sub / text 折成 ⏎ 上屏 —— 一行一个对象的表不许被作者写的 `\\n` 撑断', () => {
    const scene: Scene = {
      width: 600, height: 400,
      nodes: [{ id: 'a', rect: rect(40, 40, 200, 70), label: 'Ephemeral\nReasoning', sub: '第\n二行' }],
      edges: [],
      texts: [{ id: 't1', rect: rect(40, 320, 200, 18), text: 'Discarded after\nstate projection' }],
    };
    const text = describeScene(scene);
    // 每块文本都只占一行(折成 ⏎), 且原文两行都还在字符串里 —— 不静默截断
    const row = text.split('\n').find((l) => l.includes('"Ephemeral'))!;
    expect(row).toContain('Ephemeral⏎Reasoning');
    expect(row).toContain('sub="第⏎二行"');
    expect(text).toContain('Discarded after⏎state projection');
    // 反面锚点: 表里不该再有裸换行留下的碎行
    expect(text.split('\n').some((l) => l.trim() === 'Reasoning')).toBe(false);
  });
});

describe('describeScene · 判决挂在对象旁边(subject join)', () => {
  it('诊断挂在其 subject 指向的那个对象下面(不是一张平表)', () => {
    const text = describeScene(replica());
    const n0 = lineOf(text, 'n-src-0  x');
    const n1 = lineOf(text, 'n-src-1  x');
    const note = lineOf(text, 'node_overlap[error] 节点 n-src-0 与 n-src-1 重叠');
    expect(note).toBeGreaterThan(n0);
    expect(note).toBeLessThan(n1);
  });

  it('evidence 原样带出(数字在 evidence 里, 别让作者去手算)', () => {
    const text = describeScene(replica());
    expect(text).toContain('evidence={"other":"n-src-1","a":[60,40,260,229],"b":[60,220,260,229],"gap":8}');
  });

  it('subject 不指向任何对象的诊断落进「场景级 / 未归属」段 —— 差集可见', () => {
    const scene: Scene = {
      width: 100, height: 100,
      nodes: [{ id: 'a', rect: rect(90, 90, 40, 40), label: 'A' }],   // 越出画布 → single_svg
      edges: [],
    };
    const text = describeScene(scene);
    expect(text).toContain('## 场景级 / 未归属诊断 (1)');
    expect(text).toContain('! single_svg[error]');
    expect(text).toContain('scene:');             // subject.kind = scene
  });

  it('修法按码汇一次并去重(同一句 hint 不挂在 20 个对象下)', () => {
    const text = describeScene(replica());
    expect(text).toContain('## 修法 (');
    expect(text).toContain('  node_overlap ×3  [error]');
    // 这一对的 nudge 只出现一次。260920 起 hint 里带了**为这一对算出来的坐标** ——
    // 三对节点各有一条自己的(坐标不同 ⇒ 天然不同句), 去重管的是"同一句别重复贴"。
    const hints = text.split('\n').filter((l) => l.includes('· nudge — 把 n-src-1 挪开'));
    expect(hints.length).toBe(1);
    // 而且坐标真的进了读数(修法不再只有一句方向词)
    expect(hints[0]).toContain('right (');
  });
});

describe('describeScene · 截断与开关(差集必须自己说出来)', () => {
  it('maxRows 截断: 显式报还剩几条, 被截对象的诊断改落未归属段(带原因)', () => {
    const text = describeScene(replica(), { maxRows: 1 });   // 只留 y 最小的 n-src-0
    expect(text).toContain('… 还有 3 条节点(调 maxRows 展开)');
    // n-src-1 被截走 → 它的自身诊断改出现在未归属段, 而不是随它一起消失
    expect(lineOf(text, '! node_overlap[error] node:n-src-1')).toBeGreaterThan(0);
    expect(text).toContain('它的对象被 maxRows 截掉了');
  });

  it('maxNotes 截断: 每对象下的条数有上限且报差', () => {
    const scene: Scene = {
      width: 600, height: 400,
      // a 同时压着 b 与 c(a 自身被报两次) —— 三格挨着摆, 不是叠成一摞
      nodes: [{ id: 'a', rect: rect(40, 40, 160, 60), label: 'A' }, { id: 'b', rect: rect(40, 80, 160, 60), label: 'B' }, { id: 'c', rect: rect(40, 100, 160, 60), label: 'C' }],
      edges: [],
    };
    const all = audit(scene).diagnostics.filter((d) => d.subject.id === 'a').length;
    expect(all).toBe(2);
    const text = describeScene(scene, { maxNotes: 1 });
    expect(text).toContain(`… 还有 ${all - 1} 条(调 maxNotes 展开)`);
  });

  it('maxPoints 截断: 折点数有上限且报差', () => {
    const scene: Scene = {
      width: 600, height: 400,
      nodes: [{ id: 'a', rect: rect(40, 40, 160, 60), label: 'A' }],
      edges: [{ id: 'e', from: 'a', to: 'a', points: Array.from({ length: 8 }, (_, i) => ({ x: 100 + i * 10, y: 200 })) }],
    };
    const text = describeScene(scene, { maxPoints: 3 });
    expect(text).toContain('… 还有 5 个折点(调 maxPoints 展开)');
  });

  it('include 是浅合并: 只关掉指定段, 其余照旧', () => {
    const text = describeScene(replica(), { include: { edges: false, metrics: true } });
    expect(text).not.toContain('## edges');
    expect(text).toContain('## nodes');
    expect(text).toContain('## metrics (');
    expect(text).toContain('  nodes = 4');                      // 键排序后的 metrics 原样
    expect(text).toContain('[-1 = 无此项可测, 不是 0');
  });

  it('metrics 缺省关(表头报条数, 要看再开)', () => {
    const text = describeScene(replica());
    expect(text).not.toContain('## metrics (');
    expect(text).toContain(`metrics ${Object.keys(audit(replica()).metrics).length} 项(include.metrics 展开)`);
  });

  it('空场景照样给得出读数(段位在, 内容标"无")', () => {
    const text = describeScene({ width: 100, height: 100, nodes: [], edges: [] });
    expect(text).toContain('## nodes (0)');
    expect(text).toContain('## edges (0)');
    expect(text).toContain('(无)');
  });
});

describe('describeScene · 出口纪律', () => {
  it('逐字节确定: 同输入跑两次完全相同', () => {
    const a = describeScene(replica());
    const b = describeScene(replica());
    expect(a).toBe(b);
  });

  it('不 mutate 输入(深比较)', () => {
    const scene = replica();
    const before = JSON.stringify(scene);
    describeScene(scene, { include: { metrics: true } });
    expect(JSON.stringify(scene)).toBe(before);
  });

  it('节点段的顺序不依赖输入数组顺序(拿 y 排, 不是拿输入序)', () => {
    const forward = replica();
    const backward: Scene = { ...forward, nodes: [...forward.nodes].reverse() };
    // 只比**行本身**: 挂的行下面那几条诊断消息会随输入序对调(a/b 谁先), 那是 audit 的事实, 见下一条
    const nodeRows = (t: string) => t.split('\n').filter((l) => /^ {2}n-src-\d {2}x/.test(l));
    expect(nodeRows(describeScene(backward))).toEqual(nodeRows(describeScene(forward)));
  });

  // ⚠ 顺带逮到一条**不属于本刀**的事实(已记 TODO): audit 的诊断**消息与 evidence** 依赖输入数组顺序 ——
  // `checkNodeGap` 取 i<j, 把 nodes 倒过来 `a`/`b` 就对调, 于是「节点 X 与 Y 重叠」变成「Y 与 X 重叠」。
  // 诊断的**排序**确实与输入序解耦(260918 那次注释说的), 但**内容**没有 —— 所以"报告可逐字节 diff"
  // 只在固定输入序下成立。这里把这个行为**钉住**(而不是当它不存在), 免得日后有人以为读数是随机漂的。
  it('audit 的 node_overlap 消息随输入序对调 —— 读数照实反映, 不替它遮掩', () => {
    const forward = replica();
    const backward: Scene = { ...forward, nodes: [...forward.nodes].reverse() };
    expect(describeScene(forward)).toContain('节点 n-src-0 与 n-src-1 重叠');
    expect(describeScene(backward)).toContain('节点 n-src-1 与 n-src-0 重叠');
  });

  it('对齐按终端格数: CJK id 与 ASCII id 的列必须落在同一格', () => {
    const scene: Scene = {
      width: 600, height: 400,
      nodes: [{ id: 'n1', rect: rect(40, 40, 160, 60), label: 'A' }, { id: '节点一', rect: rect(40, 140, 160, 60), label: 'B' }],
      edges: [],
    };
    const rows = describeScene(scene).split('\n').filter((l) => /^ {2}(n1|节点一)/.test(l));
    expect(rows.length).toBe(2);
    // 反例: 若按 `s.length` 补空格, '节点一'(3 字符 / 6 格) 与 'n1'(2 字符 / 2 格) 会差 3 格
    expect(cellsBeforeY(rows[0])).toBe(cellsBeforeY(rows[1]));
  });

  it('干净场景: 一条 `!` 都没有, 表头 pass', () => {
    const text = describeScene(cleanScene());
    expect(text).toContain('pass · 0 error / 0 warning');
    expect(text.split('\n').some((l) => l.trimStart().startsWith('!'))).toBe(false);
  });

  it('all-段全开时也不 throw(每个 include 组合都跑一遍)', () => {
    const keys = ['nodes', 'groups', 'edges', 'labels', 'texts', 'diagnostics', 'fixes', 'metrics'] as const;
    for (const k of keys) {
      expect(() => describeScene(replica(), { include: { [k]: false } })).not.toThrow();
      expect(() => describeScene(replica(), { include: { [k]: true } })).not.toThrow();
    }
  });

  it('档位阈值只来自 audit: 读数不自己判(把 THRESHOLDS 改了, 读数跟着变, 不另立一份)', () => {
    const scene = cleanScene();
    // 读数的判决行与 audit 严格一致 —— 它是 join, 不是第二个判据源
    for (const level of ['standard', 'showcase'] as const) {
      const report = audit(scene, { level });
      expect(describeScene(scene, { report })).toContain(report.pass ? ' pass ·' : ' FAIL ·');
      expect(THRESHOLDS[level].nodeGap).toBeGreaterThan(0);
    }
  });
});
