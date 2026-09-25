// =====================================================================
// multiline-font · 260920 三件套: 节点/旁注多行渲染 + Theme.fontFamily + paper 暖白画布
//
// 多行是**还账**: label_fit / text_overlap 的审计面早已按 `\n` 逐行量宽(audit.ts checkLabelFit),
// 渲染面却整个 text 不拆 —— 审计认可的行渲染不出来。本文件钉"渲染面与审计面同拍":
//   · nodeShape label `\n` → 逐行 text, 行块对盒中心对称; 单行/label+sub 旧路径逐字节不变
//   · SceneText `\n` → 逐行 text, 行距与节点同口径(NODE_TEXT_LAYOUT.lineGapEm)
// 字体: 出口根 attrs 三级取值 opts.fontFamily → theme.fontFamily → sans 栈;
// 内置 light/dark 不设槽(字节不变), 只有 paper(mono)声明缺省。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { THEMES } from '../src/theme';
import { nodeShape, NODE_TEXT_LAYOUT } from '../src/shapes/node';
import { exportScene, sceneChildren } from '../src/export';
import { nodeFit } from '../src/knives/fit';
import { createScene } from '../src/scene';
import { serialize } from '../src/serialize';
import { baselineY } from '../src/descriptor';
import type { Scene } from '../src/knives/audit';
import type { Descriptor } from '../src/descriptor';

const GAP = 13 * NODE_TEXT_LAYOUT.lineGapEm; // 主字号缺省 13
// descriptor 的 y 是 baselineY 折算后的**基线**(central = 行心 + 0.35em), 断言过同一个折算
const base = (lineCy: number, size = 13): number => baselineY(lineCy, size, 'central');

const textsOf = (d: Descriptor[]): Extract<Descriptor, { kind: 'text' }>[] =>
  d.filter((c): c is Extract<Descriptor, { kind: 'text' }> => c.kind === 'text');

describe('multiline rendering (label / texts)', () => {
  it('单行 label 与 label+sub 旧路径逐字节不变', () => {
    const single = serialize(nodeShape({ x: 0, y: 0, w: 120, h: 40, label: 'Only' }));
    expect(textsOf(nodeShape({ x: 0, y: 0, w: 120, h: 40, label: 'Only' }).children)).toHaveLength(1);
    // 行中心 = 盒中心 cy=20
    expect(textsOf(nodeShape({ x: 0, y: 0, w: 120, h: 40, label: 'Only' }).children)[0]!.y).toBe(base(20));
    // label+sub: cy∓gap/2(旧公式原样)
    const both = textsOf(nodeShape({ x: 0, y: 0, w: 120, h: 40, label: 'Main', sub: 'Sub' }).children);
    expect(both).toHaveLength(2);
    expect(both[0]!.y).toBe(base(20 - GAP / 2));
    expect(both[1]!.y).toBe(base(20 + GAP / 2, 11)); // sub 行按次字号折算基线
    expect(single).toContain('>Only</text>');
  });

  it('两行 label: 行块对称于盒中心, 全部 600 字重 —— 审计认可的行渲染得出来', () => {
    const lines = textsOf(nodeShape({ x: 0, y: 0, w: 160, h: 60, label: 'Ephemeral\nReasoning', fontSize: 13 }).children);
    expect(lines.map((l) => l.content)).toEqual(['Ephemeral', 'Reasoning']);
    expect(lines[0]!.y).toBe(base(30 - GAP / 2));
    expect(lines[1]!.y).toBe(base(30 + GAP / 2));
    for (const l of lines) expect(l.attrs!['font-weight']).toBe(600);
  });

  it('三行 label + sub: sub 固定排在行块末尾且带 0.72 淡化, 无 label 则什么都不渲染', () => {
    const rows = textsOf(nodeShape({ x: 0, y: 0, w: 200, h: 120, label: 'A\nB\nC', sub: 'd' }).children);
    expect(rows.map((r) => r.content)).toEqual(['A', 'B', 'C', 'd']);
    const centers = rows.map((r) => r.y);
    // 行块中心 = 盒中心 60: (60-1.5g, 60-0.5g, 60+0.5g, 60+1.5g)
    expect(centers[0]).toBe(base(60 - 1.5 * GAP));
    expect(centers[3]).toBe(base(60 + 1.5 * GAP, 11));
    expect(rows[3]!.attrs!.opacity).toBe(0.72);
    expect(rows[0]!.attrs!.opacity).toBeUndefined();
    // 老语义保留: 只有 sub 没 label → 不渲染
    expect(textsOf(nodeShape({ x: 0, y: 0, w: 100, h: 40, sub: 'orphan' }).children)).toHaveLength(0);
  });

  it('多行 sub: 逐行 text(与 label 同口径)—— 别让 `\\n` 漏进 content', () => {
    const label = 'Only';
    const sub = '第一行\n第二行';
    const fit = nodeFit({ label, sub, level: 'showcase' });
    const rows = textsOf(nodeShape({ x: 0, y: 0, w: fit.w, h: fit.h, label, sub }).children);
    // 修复前这里只有 2 条: sub 整串(含 `\n`)塞进一个 <text>, SVG 把裸换行折成空格 ⇒ 画成一行,
    // 而 `nodeFit` / `label_fit` 早按最长行给盒、按行数给高 —— 盒窄字宽, 门禁全绿。
    expect(rows.map((r) => r.content)).toEqual(['Only', '第一行', '第二行']);
    expect(rows).toHaveLength(fit.lines);
    for (const r of rows) expect(r.content).not.toContain('\n');
    // 行块仍对盒中心对称(三行: -gap / 0 / +gap), sub 两行各按**次字号**折算基线 + 0.72 淡化
    const cy = fit.h / 2;
    expect(rows[0]!.y).toBe(base(cy - GAP));
    expect(rows[1]!.y).toBe(base(cy, 11));
    expect(rows[2]!.y).toBe(base(cy + GAP, 11));
    expect(rows[0]!.attrs!.opacity).toBeUndefined();
    expect(rows[1]!.attrs!.opacity).toBe(0.72);
    expect(rows[2]!.attrs!.opacity).toBe(0.72);
  });

  it('SceneText 多行: 行块对检测矩形中心对称, 单行 y 与旧路径相同', () => {
    const scene: Scene = {
      width: 300, height: 120, nodes: [], edges: [],
      texts: [
        { id: 'two', rect: { x: 20, y: 10, w: 200, h: 40 }, text: 'Discarded after\nstate projection', fontSize: 13, color: '#be123c' },
        { id: 'one', rect: { x: 20, y: 80, w: 200, h: 20 }, text: 'single' },
      ],
    };
    const all = sceneChildren(scene).filter((d): d is Extract<Descriptor, { kind: 'text' }> => d.kind === 'text');
    const two = all.filter((t) => t.content.includes('Discarded') || t.content.includes('state'));
    expect(two).toHaveLength(2);
    expect(two[0]!.y).toBe(base(Math.round((30 - GAP / 2) * 10) / 10)); // texts 侧 lineCy 先过 round1
    expect(two[1]!.y).toBe(base(Math.round((30 + GAP / 2) * 10) / 10));
    expect(all.find((t) => t.content === 'single')!.y).toBe(base(90, 11)); // texts 缺省字号 11
  });
});

describe('theme font + warm canvas', () => {
  const scene = () => createScene({
    width: 200, height: 100,
    nodes: [{ id: 'a', rect: { x: 20, y: 30, w: 80, h: 40 }, label: 'A' }],
    edges: [],
  });

  it('paper: mono 字体栈进 svg 根 + 暖白画布上屏', () => {
    const { svg } = exportScene(scene(), { theme: THEMES.paper, skipAudit: true });
    expect(svg).toContain('font-family="ui-monospace');
    expect(svg).toContain('#fffdf8');
  });

  it('light/dark 不设槽 → 缺省 sans 栈, 字节不变; opts.fontFamily 永远赢', () => {
    expect(THEMES.light.fontFamily).toBeUndefined();
    expect(THEMES.dark.fontFamily).toBeUndefined();
    const { svg } = exportScene(scene(), { theme: THEMES.light, skipAudit: true });
    expect(svg).toContain('font-family="ui-sans-serif, system-ui,');
    const overridden = exportScene(scene(), { theme: THEMES.paper, skipAudit: true, fontFamily: 'Comic Sans MS' });
    expect(overridden.svg).toContain('font-family="Comic Sans MS"');
  });
});
