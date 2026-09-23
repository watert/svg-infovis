// =====================================================================
// node_fit · 按内容反算节点盒 (构建期 helper)
//
// 这个文件的重点是**闭环**: helper 算出来的盒宽必须刚好过 `label_fit` 门禁(同源), 少 1px 就得报;
// 高度必须按 `nodeShape` 的真排布算(行距 / 次标签缩量 / 字重三处都对得上渲染)。
// 另附 archify 复刻图的真数据(`Auth Provider` 106px / `Browser / Mobile` 107.2px)当回归锚点。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { type Diagnostic, THRESHOLDS, audit } from '../src/knives/audit';
import { nodeFit } from '../src/knives/fit';
import { measureText } from '../src/knives/measure';
import { ExportBlockedError, exportScene } from '../src/export';
import { ShapeInputError } from '../src/guard';
import { NODE_TEXT_LAYOUT, nodeShape } from '../src/shapes/node';
import { type DText, baselineY } from '../src/descriptor';

const LONG = '一段很长很长的中文标签文字';
const FS = NODE_TEXT_LAYOUT.fontSize; // 13
/** 门禁的尺子(主标签 600 字重) —— 断言里一律现算, 不抄字面量 */
const wOf = (t: string, size: number = FS, weight = 600) => measureText(t, { fontSize: size, weight }).width;
const INSET = (level: 'standard' | 'showcase') => THRESHOLDS[level].labelInset;
/** 单行行盒高只由字号决定 —— 现算, 好让"行盒高变了"也在这条链上被发现 */
const lineH = (size: number) => measureText('x', { fontSize: size }).height;

/** 单节点 scene: 盒宽盒高按需给, 便于构造"刚好够 / 刚好不够" */
const sc = (w: number, h: number, node: { label?: string; sub?: string; fontSize?: number } = {}) => ({
  width: 600,
  height: 200,
  nodes: [{ id: 'n', rect: { x: 40, y: 40, w, h }, ...node }],
  edges: [],
});

const fits = (r: { diagnostics: Diagnostic[] }): Diagnostic[] => r.diagnostics.filter((d) => d.code === 'label_fit');

describe('node_fit · 按内容反算节点盒(与 label_fit 门禁同源)', () => {
  it('闭环: 算出来的盒宽刚好过门禁, 少 1px 就报 —— 且与门禁自己的 widen-node 修法同数', () => {
    const fit = nodeFit({ label: LONG });
    // 刚好过: 无诊断 + pass
    const ok = audit(sc(fit.w, fit.h, { label: LONG }));
    expect(fits(ok)).toEqual([]);
    expect(ok.pass).toBe(true);
    expect(ok.metrics.label_slack_min).toBeGreaterThanOrEqual(0);
    // 少 1px 就报: 溢出 1px > 0.5 的估算余量容差
    const bad = audit(sc(fit.w - 1, fit.h, { label: LONG }));
    expect(fits(bad).length).toBe(1);
    expect(fits(bad)[0].evidence.overflow).toBe(1);
    // 同源的硬证据: 门禁给的"把盒宽加到多少"与本刀算出来的完全一致
    const widen = fits(bad)[0].supportedFixes.find((f) => f.kind === 'widen-node');
    expect((widen?.patch as { w: number }).w).toBe(fit.w);
    // 证据字段也能逐字对账(helper 的 labelWidth === 门禁的 textWidth)
    expect(fit.labelWidth).toBe(fits(bad)[0].evidence.textWidth as number);
  });

  it('archify 复刻真数据: `Auth Provider` 106 / `Browser / Mobile` 107.2 —— standard 恰好 120(与手定盒宽同), showcase 要 128', () => {
    // 106 / 107.2 是复刻探针报出来的原始数(宽度表已与 archify 逐码点对账); 这里先钉住尺子
    expect(wOf('Auth Provider')).toBe(106);
    expect(wOf('Browser / Mobile', FS - NODE_TEXT_LAYOUT.subSizeDelta, 400)).toBe(107.2);

    // standard(两侧各 6): 最宽那行 107.2 → ceil(107.2 + 12) = 120 —— 正是复刻图里手定的盒宽
    const std = nodeFit({ label: 'Users', sub: 'Browser / Mobile' });
    expect(std.w).toBe(120);
    expect(std.subWidth).toBe(107.2);
    // showcase(两侧各 10): 同一份内容要 128
    const show = nodeFit({ label: 'Users', sub: 'Browser / Mobile', level: 'showcase' });
    expect(show.w).toBe(128);

    // 手定的 120 盒: standard 过(这正是原图"有 2 条 label_fit"之所以要按档位读), showcase 拦
    expect(audit(sc(120, 60, { label: 'Users', sub: 'Browser / Mobile' }), { level: 'standard' }).pass).toBe(true);
    const show120 = audit(sc(120, 60, { label: 'Users', sub: 'Browser / Mobile' }), { level: 'showcase' });
    expect(fits(show120).length).toBe(1);
    expect(fits(show120)[0].evidence.overflow).toBe(7.2);
    // 换成 helper 算的盒宽, showcase 也过
    expect(audit(sc(show.w, 64, { label: 'Users', sub: 'Browser / Mobile' }), { level: 'showcase' }).pass).toBe(true);
  });

  it('内边距缺省与门禁同一处: 档位传什么就取哪档的呼吸位, 传了 padding 就整体覆盖(单值 / 元组)', () => {
    const textW = wOf(LONG);
    expect(nodeFit({ label: LONG }).padding).toEqual([INSET('standard'), INSET('standard')]);
    expect(nodeFit({ label: LONG, level: 'showcase' }).padding).toEqual([INSET('showcase'), INSET('showcase')]);
    expect(nodeFit({ label: LONG }).w).toBe(Math.ceil(textW + 2 * INSET('standard')));
    expect(nodeFit({ label: LONG, level: 'showcase' }).w).toBe(Math.ceil(textW + 2 * INSET('showcase')));
    // 单值 = 四边同值; 元组 = [左右, 上下](与 groupShape 的 labelInset 同序)
    expect(nodeFit({ label: LONG, padding: 0 }).w).toBe(Math.ceil(textW));
    expect(nodeFit({ label: LONG, padding: [20, 4] }).w).toBe(Math.ceil(textW + 40));
    expect(nodeFit({ label: LONG, padding: [20, 4] }).h).toBe(Math.ceil(lineH(FS) + 8));
    // 覆盖成**更大的**值 = 更宽松, 照样过
    const roomy = nodeFit({ label: LONG, padding: 20 });
    expect(fits(audit(sc(roomy.w, roomy.h, { label: LONG })))).toEqual([]);
    // 覆盖成**更小的**值 = 自觉挨门禁的刀: inset 钉死在 THRESHOLDS 里, 不认作者的内边距
    const tight = nodeFit({ label: LONG, padding: 0 });
    expect(fits(audit(sc(tight.w, tight.h, { label: LONG })))[0].evidence.overflow).toBe(2 * INSET('standard'));
  });

  it('竖直方向按 nodeShape 的真排布算: 两行含行距, 且与渲染出来的两行基线/字号/字重对得上', () => {
    const label = 'Auth Provider';
    const sub = 'OAuth 2.0';
    const fit = nodeFit({ label, sub });
    const subSize = FS - NODE_TEXT_LAYOUT.subSizeDelta;
    const gap = FS * NODE_TEXT_LAYOUT.lineGapEm;
    // 内容高 = 行距 + 两行盒高均值(两行中心对称摆在框中心两侧, 与 nodeShape 的排布同源)
    expect(fit.contentH).toBeCloseTo(gap + (lineH(FS) + lineH(subSize)) / 2, 6);
    expect(fit.h).toBe(Math.ceil(fit.contentH + 2 * INSET('standard')));
    // 盒高得真装得下两行: 内容高必然大于行中心间距
    expect(fit.contentH).toBeGreaterThan(gap);

    // 渲染侧对账: 把盒拿去画, 两行的行中心必须正好落在 fit 假设的位置上
    const shape = nodeShape({ x: 0, y: 0, w: fit.w, h: fit.h, label, sub });
    const texts = (shape.kind === 'group' ? shape.children : []).filter((c): c is DText => c.kind === 'text');
    expect(texts.map((t) => t.content)).toEqual([label, sub]);
    const cy = fit.h / 2;
    // baseline 折回"行中心"(抵消同一套 central 偏移), 再比 fit 假设的 cy ∓ gap/2
    const centerOf = (t: DText, size: number) => t.y - baselineY(0, size, 'central');
    expect(centerOf(texts[0], FS) - (cy - gap / 2)).toBeCloseTo(0, 6);
    expect(centerOf(texts[1], subSize) - (cy + gap / 2)).toBeCloseTo(0, 6);
    // 字号 / 字重三处同一份: 主标签 600、次标签小两号且走缺省 400(与门禁量宽用的同值)
    expect(texts[0].attrs?.['font-size']).toBe(fit.fontSize);
    expect(texts[0].attrs?.['font-weight']).toBe(600);
    expect(texts[1].attrs?.['font-size']).toBe(subSize);
    expect(texts[1].attrs?.['font-weight']).toBeUndefined();
    // 两行一起进 scene 也能过门禁(宽取最宽行, 主标签 106 更宽)
    expect(fits(audit(sc(fit.w, fit.h, { label, sub })))).toEqual([]);
  });

  it('退化输入: 空标签 = 最小盒(2×内边距) 不算错; 只有次标签时按它自己的字号给一行', () => {
    expect(nodeFit({})).toMatchObject({ w: 12, h: 12, labelWidth: 0, subWidth: 0, contentH: 0, lines: 0 });
    expect(nodeFit({ label: '', sub: '' })).toMatchObject({ w: 12, h: 12 });
    // 只有次标签: 按 size-2 那一行给高(nodeShape 其实不画它 —— 那是坏 scene, 不在这里猜)
    const subOnly = nodeFit({ sub: 'OAuth 2.0' });
    expect(subOnly.labelWidth).toBe(0);
    expect(subOnly.contentH).toBeCloseTo(lineH(FS - NODE_TEXT_LAYOUT.subSizeDelta), 6);
    // 单行主标签: 内容高就是那一个行盒
    expect(nodeFit({ label: 'Users' }).contentH).toBeCloseTo(lineH(FS), 6);
  });

  // --- 多行口径(260920 修) -------------------------------------------
  //
  // 这条是**回归钉**: 之前本刀把整串 `\n` 当一行给高, 而 `nodeShape` 已经逐行画 ——
  // 盒按 1 行给、字按 N 行画, 而 `label_fit` 只判宽 ⇒ 全绿出厂。
  // 断言刻意写成**闭环**(渲染行心 === 行块偏移)而不是"画了几行"那种单侧断言:
  // 单侧断言在公式漂开时仍然全绿, 只有"两边对不上"才抓得住。

  it('多行: 宽取最宽行(与门禁同口径), **高按行数给** —— 每多一行多一个行距 + 一个行盒, 且单调', () => {
    const gap = FS * NODE_TEXT_LAYOUT.lineGapEm;
    const multi = `短\n${LONG}`;
    const one = nodeFit({ label: LONG });
    const two = nodeFit({ label: multi });
    const three = nodeFit({ label: `甲\n乙\n${LONG}` });

    // 宽: 最宽行都是 LONG 那一行 → 两个盒同宽(门禁口径, 与行数无关)
    expect(two.w).toBe(one.w);
    // 高: 2 行 = 行距 + 两个行盒的并集; 3 行再多一个行距 + 一个行盒
    expect(one.lines).toBe(1);
    expect(two.lines).toBe(2);
    expect(three.lines).toBe(3);
    expect(two.contentH).toBeCloseTo(gap + lineH(FS), 6);
    expect(three.contentH).toBeCloseTo(2 * gap + lineH(FS), 6);
    expect(two.h).toBe(Math.ceil(two.contentH + 2 * INSET('standard')));
    // 单调递增: 行数越多盒越高(修之前这三者是同一个数)
    expect(two.h).toBeGreaterThan(one.h);
    expect(three.h).toBeGreaterThan(two.h);
  });

  it('多行 sub: 宽取最宽行、**高也按行数给** —— 与 label 同一条口径(修之前次标签恒按 1 行算)', () => {
    const gap = FS * NODE_TEXT_LAYOUT.lineGapEm;
    const subMulti = `短\n${LONG}`;
    const one = nodeFit({ label: LONG, sub: '短' });
    const two = nodeFit({ label: LONG, sub: subMulti });

    expect(one.lines).toBe(2); // label 1 行 + sub 1 行
    expect(two.lines).toBe(3); // label 1 行 + sub 2 行
    expect(two.w).toBe(one.w); // 宽取最长行, 与行数无关
    // 高: 多一行 = 多一个行距(两行同字号 ⇒ 行盒高相同, 并集只多一个 gap)
    expect(two.contentH - one.contentH).toBeCloseTo(gap, 6);
    expect(two.h).toBeGreaterThan(one.h);
    // 端到端: 这套尺寸出图不被拦(宽这侧有门禁; 高这侧只有本断言与 nodeShape 的行心闭环守着)
    expect(exportScene(sc(two.w, two.h, { label: LONG, sub: subMulti })).draft).toBe(false);
  });

  it('多行闭环: nodeShape 真画出来的行心正好落在行块偏移上, 且盒高装得下行块实需', () => {
    const gap = FS * NODE_TEXT_LAYOUT.lineGapEm;
    const multi = `短\n${LONG}`;
    const fit = nodeFit({ label: multi });
    expect(fit.lines).toBe(2);

    const shape = nodeShape({ x: 0, y: 0, w: fit.w, h: fit.h, label: multi });
    const texts = (shape.kind === 'group' ? shape.children : []).filter((c): c is DText => c.kind === 'text');
    // 渲染真的拆成了两行, 且顺序与 `\n` 一致
    expect(texts.map((t) => t.content)).toEqual(multi.split('\n'));
    // 行心依次落在 ±gap/2(行块中心对称于**盒中心** —— 与 fit 反解盒高时用的是同一个中心)
    const cy = fit.h / 2;
    texts.forEach((t, i) => {
      const center = t.y - baselineY(0, FS, 'central');
      expect(center - (cy + (i - (texts.length - 1) / 2) * gap)).toBeCloseTo(0, 6);
    });

    // 装得下(本刀的全部承诺): 行块实需 + 上下呼吸位 ≤ 盒高
    expect(fit.contentH + 2 * INSET('standard')).toBeLessThanOrEqual(fit.h);
    // 且是**紧的**: 只富余一个 ceil 的零头, 不是"随手给高"
    expect(fit.h - (fit.contentH + 2 * INSET('standard'))).toBeLessThan(1);

    // 端到端: 拿这套尺寸出图, 门禁不拦
    expect(exportScene(sc(fit.w, fit.h, { label: multi })).draft).toBe(false);
  });

  it('边界钉(已知空白, 不是断言"没问题"): 盒高砍到 1 行时 **label_fit 一声不吭** —— 它只判宽', () => {
    const multi = `短\n${LONG}`;
    const two = nodeFit({ label: multi });
    const one = nodeFit({ label: LONG });
    // 宽度这侧过(与 1 行同宽), 高度这侧 2 行塞进 1 行高的盒 —— 门禁全绿
    expect(two.w).toBe(one.w);
    expect(fits(audit(sc(two.w, one.h, { label: multi })))).toEqual([]);
    // ↑ 这条**不是**"没问题", 是一个已知空白的机器化: 哪天给 `label_fit` 加了高度判决,
    //    这里必须从"无诊断"改成"报一条 error"。在此之前, 高度只由本刀 + 上面的闭环断言守。
    // 反面锚点: 门禁确实看见了宽度问题(换个窄盒就报), 所以上面那条空绿不是"门禁没跑"
    expect(fits(audit(sc(one.w - 1, one.h, { label: multi }))).length).toBe(1);
  });

  it('label_fit 的 reflow-label 修法把换行后的盒高一起算出来(旧文案说"不动版式"是错的)', () => {
    // 窄盒长文: 触发 label_fit
    const fit = nodeFit({ label: LONG });
    const rep = audit(sc(fit.w - 1, 40, { label: LONG }));
    const fix = fits(rep)[0].supportedFixes.find((f) => f.kind === 'reflow-label');
    expect(fix).toBeDefined();
    const patch = fix?.patch as { nodeId: string; lines: number; h: number };
    // 折行下限 ≥ 2(一行装不下才报的这条诊断), 盒高按行块几何给出且真的 ≥ 行块实需
    expect(patch.nodeId).toBe('n');
    expect(patch.lines).toBeGreaterThanOrEqual(2);
    expect(patch.h).toBeGreaterThan(40);
    const gap = FS * NODE_TEXT_LAYOUT.lineGapEm;
    expect(patch.h).toBeGreaterThanOrEqual(
      Math.ceil((patch.lines - 1) * gap + lineH(FS) + 2 * INSET('standard')),
    );
    // 文案里也有那个数(人读的与机器读的是同一份)
    expect(fix?.hint).toContain(`${patch.h}px`);
  });

  it('畸形入参按 guard 口径当场抛(不静默成 0 把 NaN 漏进 scene): 非有限字号 / 非有限或负的内边距', () => {
    expect(() => nodeFit({ label: LONG, fontSize: Number.NaN })).toThrow(ShapeInputError);
    expect(() => nodeFit({ label: LONG, padding: Number.NaN })).toThrow(ShapeInputError);
    expect(() => nodeFit({ label: LONG, padding: [6, Number.POSITIVE_INFINITY] })).toThrow(ShapeInputError);
    expect(() => nodeFit({ label: LONG, padding: -1 })).toThrow(ShapeInputError);
    // 报错要指向字段, 便于机器分流(guard 的 token 节流阀那套)
    try {
      nodeFit({ label: LONG, fontSize: Number.NaN });
    } catch (e) {
      expect((e as ShapeInputError).field).toBe('fontSize');
    }
  });

  it('端到端: 用 helper 的尺寸造 scene → 出图不被拦; 少 1px 就焊死在唯一出口上', () => {
    const fit = nodeFit({ label: 'Auth Provider', sub: 'OAuth 2.0' });
    const good = exportScene(sc(fit.w, fit.h, { label: 'Auth Provider', sub: 'OAuth 2.0' }));
    expect(good.svg).toContain('Auth Provider');
    expect(good.svg).toContain('OAuth 2.0');
    expect(good.draft).toBe(false);
    try {
      exportScene(sc(fit.w - 1, fit.h, { label: 'Auth Provider', sub: 'OAuth 2.0' }));
      throw new Error('本该被门禁拦下, 却出了图');
    } catch (e) {
      expect(e).toBeInstanceOf(ExportBlockedError);
      expect((e as ExportBlockedError).report.diagnostics.some((d) => d.code === 'label_fit')).toBe(true);
    }
  });
});
