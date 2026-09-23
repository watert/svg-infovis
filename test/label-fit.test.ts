// =====================================================================
// label_fit · 节点内文字装不装得下 (门禁⑦)
//
// 过去的盲区: audit 管"文字与**边**抢道"(label_clearance / text_clearance), 但"文字与**框**不合身"
// 无人管 —— 窄盒长文溢出能带着全绿的章出厂。本文件既验"会喊疼", 也验**喊疼后照修法真能修好**
// (supportedFixes 是这路线的 token 节流阀, 修法是假的等于没给)。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { type Diagnostic, THRESHOLDS, audit } from '../src/knives/audit';
import { measureText } from '../src/knives/measure';
import { ExportBlockedError, exportScene } from '../src/export';

const LONG = '一段很长很长的中文标签文字';
const FS = 13;
/** 主标签的估算宽度(与 nodeShape 同源: 600 字重) */
const wOf = (t: string, size = FS, weight = 600) => measureText(t, { fontSize: size, weight }).width;
const INSET = (level: 'standard' | 'showcase') => THRESHOLDS[level].labelInset;

/** 单节点 scene。盒宽按需给, 便于构造"刚好溢出/刚好够"的边界 */
const sc = (w: number, node: Partial<{ label: string; sub: string; fontSize: number }> = {}) => ({
  width: 600,
  height: 200,
  nodes: [{ id: 'n', rect: { x: 40, y: 40, w, h: 60 }, label: LONG, ...node }],
  edges: [],
});

const fits = (r: { diagnostics: Diagnostic[] }): Diagnostic[] => r.diagnostics.filter((d) => d.code === 'label_fit');

describe('label_fit · 节点内文字与框的合身度', () => {
  it('窄盒长文喊疼: 出 error + 可复算的 evidence(宽 / 可用宽 / 溢出 / 呼吸位)', () => {
    const textW = wOf(LONG);
    const w = Math.floor(textW - 10); // 明显装不下
    const r = audit(sc(LONG ? w : w));
    const d = fits(r)[0];
    expect(d).toBeDefined();
    expect(d.severity).toBe('error');
    expect(r.pass).toBe(false);
    expect(d.subject).toEqual({ kind: 'node', id: 'n' });
    expect(d.evidence.textWidth).toBe(textW);
    expect(d.evidence.available).toBe(Math.round((w - 2 * INSET('standard')) * 10) / 10);
    expect(d.evidence.overflow as number).toBeGreaterThan(0);
    expect(d.evidence.content).toBe(LONG);
  });

  it('喊疼自带可用修法: 照 `widen-node` 给的盒宽改一次, 门禁立刻过(修法不是摆设)', () => {
    const r = audit(sc(wOf(LONG) - 10));
    const widen = fits(r)[0].supportedFixes.find((f) => f.kind === 'widen-node');
    const target = (widen?.patch as { w: number }).w;
    const fixed = audit(sc(target));
    expect(fits(fixed)).toEqual([]);
    expect(fixed.pass).toBe(true);
    // 四个修法方向都在(改盒 / 换行 / 改文案 / 降字号), 不缺臂
    expect(fits(r)[0].supportedFixes.map((f) => f.kind)).toEqual(['widen-node', 'reflow-label', 'shorten-label', 'lower-font']);
  });

  it('两档呼吸位不同: 同一个盒宽在 standard 过、在 showcase 拦(阈值必须真起作用)', () => {
    // 取两档呼吸位之间的宽度: 文本 + 2×6 够, 文本 + 2×10 不够
    const w = wOf(LONG) + 14;
    expect(audit(sc(w), { level: 'standard' }).pass).toBe(true);
    const show = audit(sc(w), { level: 'showcase' });
    expect(fits(show).length).toBe(1);
    expect(show.diagnostics.find((d) => d.code === 'label_fit')?.evidence.inset).toBe(10);
  });

  it('边界与容差: 溢出 0.3px 放行(measure 自带 1.5% 余量, 不制造假警报), 溢出 2px 拦', () => {
    const base = wOf(LONG) + 2 * INSET('standard');
    expect(fits(audit(sc(base - 0.3)))).toEqual([]);
    expect(fits(audit(sc(base - 2))).length).toBe(1);
    expect(audit(sc(base - 2)).metrics.label_overflow_max).toBe(2);
  });

  it('多行标签取最宽的一行(作者用换行修版式时不该被整串长度误判)', () => {
    const longest = '最宽的那一行文字';
    const multi = `${longest}\n短`;
    const single = longest;
    // 整串字符数远多于单行, 但门禁必须按最宽行算 —— 两者结论一致
    expect(fits(audit(sc(wOf(longest) + 12, { label: multi })))).toEqual([]);
    expect(audit(sc(wOf(single) + 12, { label: multi })).pass).toBe(true);
  });

  it('副标签按 size-2 与 400 字重量(与 nodeShape 的两行排布同源), 主标签在时也单独算', () => {
    const sub = '一段非常长的副标签说明文字要撑开宽度'; // 比主标签宽, 才能验"单独算"
    const widest = Math.max(wOf(LONG), wOf(sub, FS - 2, 400));
    expect(widest).toBeGreaterThan(wOf(LONG));
    // 主标签刚好装下(+1px 余量), 副标签装不下 → 只针对副标签报一条
    const w = wOf(LONG) + 2 * INSET('standard') + 1;
    const r = audit(sc(w, { sub }));
    expect(fits(r).length).toBe(1);
    expect(fits(r)[0].evidence.field).toBe('sub');
    expect(fits(r)[0].evidence.textWidth).toBe(wOf(sub, FS - 2, 400));
  });

  it('字号是每节点可覆盖的(SceneNode.fontSize), 门禁跟着字号走 —— 同一盒宽大字号拦、小字号过', () => {
    const w = wOf(LONG) + 2 * INSET('standard');
    expect(fits(audit(sc(w, { fontSize: FS })))).toEqual([]);
    expect(fits(audit(sc(w, { fontSize: 20 }))).length).toBe(1);
  });

  it('指标不产生歧义: 无标签 → -1; 有标签 → overflow 0 / slack 给出真实余量', () => {
    const noLabel = audit({ width: 200, height: 100, nodes: [{ id: 'x', rect: { x: 10, y: 10, w: 80, h: 40 } }], edges: [] });
    expect(noLabel.metrics.label_overflow_max).toBe(-1);
    expect(noLabel.metrics.label_slack_min).toBe(-1);
    const tight = audit(sc(wOf(LONG) + 2 * INSET('standard') + 7));
    expect(tight.metrics.label_overflow_max).toBe(0);
    expect(tight.metrics.label_slack_min).toBe(7);
  });

  it('焊在唯一出口上: 溢出时 exportScene 硬拒(不是警告后照吐文件)', () => {
    try {
      exportScene(sc(wOf(LONG) - 10));
      throw new Error('本该被门禁拦下, 却出了图');
    } catch (e) {
      expect(e).toBeInstanceOf(ExportBlockedError);
      expect((e as ExportBlockedError).report.diagnostics.some((d) => d.code === 'label_fit')).toBe(true);
      // 260918: 被拦下的那次也**照样给图** —— 只有诊断没有图, agent 只能盲改
      expect((e as ExportBlockedError).draft.svg.length).toBeGreaterThan(0);
      expect((e as ExportBlockedError).draft.draft).toBe(true);
    }
    // force 放行 + 打草稿标, 是唯一通道
    const forced = exportScene(sc(wOf(LONG) - 10), { force: true });
    expect(forced.draft).toBe(true);
    expect(forced.svg).toContain('data-draft="1"');
  });
});
