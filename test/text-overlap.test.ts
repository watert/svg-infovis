// =====================================================================
// 门禁 ⑭ text_overlap —— 文本与**实体**抢地
//
// 由来(260918)：用户看图一眼捉出"label 跟 rect 有重叠"，而 ④ label_clearance 与
// ⑥ text_clearance **都只拿文本与「边」比** —— 四类最显眼的事故全部带着全绿的章放行：
//   ① 旁注压在节点盒上 ② 边标签遮罩压在节点上 ③ 文本压组框边线 ④ 两块旁注互压。
// 缺口根因不是阈值松，是**文本的对家被写死成「边」**。
//
// 本文件按纪律 9 给两个方向：① 会喊疼 ② 照 supportedFixes 真能修好(闭环)。
// 只证明"不抛"等于没验。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { audit, type Scene } from '../src/knives/audit';

const NODE = { id: 'n1', rect: { x: 60, y: 40, w: 200, h: 60 }, label: 'Node' };
const base = { width: 400, height: 300 };
const codes = (s: Scene) => audit(s, { level: 'showcase' }).diagnostics.map((d) => d.code);

describe('text_overlap · 文本与实体抢地', () => {
  it('会喊疼 ①: 旁注整个压在节点盒上', () => {
    const s: Scene = {
      ...base,
      nodes: [NODE],
      edges: [],
      texts: [{ id: 't', rect: { x: 80, y: 60, w: 120, h: 20 }, text: '压在节点上', fontSize: 11 }],
    };
    const r = audit(s, { level: 'showcase' });
    expect(r.pass).toBe(false);
    expect(codes(s)).toContain('text_overlap');
    const d = r.diagnostics[0];
    expect(d.subject).toEqual({ kind: 'text', id: 't' });
    expect(d.evidence.nodeId).toBe('n1');
    expect(Number(d.evidence.overlap)).toBeGreaterThan(0);
  });

  it('会喊疼 ②: 边标签遮罩压在节点上(chip 不是豁免对象)', () => {
    const s: Scene = {
      ...base,
      nodes: [NODE],
      edges: [],
      labels: [{ id: 'L', at: { x: 160, y: 70 }, width: 90, height: 18, text: 'chip', fontSize: 11 }],
    };
    const r = audit(s, { level: 'showcase' });
    expect(r.pass).toBe(false);
    expect(r.diagnostics[0].subject).toEqual({ kind: 'label', id: 'L' });
    expect(r.metrics.text_overlap).toBe(1);
  });

  it('会喊疼 ③: 文本骑在组框边线上(半进半出)', () => {
    const s: Scene = {
      ...base,
      nodes: [{ id: 'n1', rect: { x: 90, y: 90, w: 120, h: 40 }, label: 'Node' }],
      edges: [],
      groups: [{ id: 'g', rect: { x: 60, y: 60, w: 200, h: 120 } }],
      // 文本顶 55 < 框顶 60, 底 72 > 框顶 → 跨在框的上边线上
      texts: [{ id: 't', rect: { x: 70, y: 54, w: 100, h: 18 }, text: '压框线', fontSize: 11 }],
    };
    const r = audit(s, { level: 'showcase' });
    expect(r.pass).toBe(false);
    expect(r.diagnostics[0].message).toContain('组框');
    expect(r.diagnostics[0].evidence.groupId).toBe('g');
  });

  it('会喊疼 ④: 两块旁注互压 —— 一对只报一次(报两次是噪声不是信息)', () => {
    const s: Scene = {
      ...base,
      nodes: [],
      edges: [],
      texts: [
        { id: 't1', rect: { x: 40, y: 40, w: 120, h: 20 }, text: 'AAAA', fontSize: 11 },
        { id: 't2', rect: { x: 60, y: 50, w: 120, h: 20 }, text: 'BBBB', fontSize: 11 },
      ],
    };
    const r = audit(s, { level: 'showcase' });
    expect(r.diagnostics.filter((d) => d.code === 'text_overlap')).toHaveLength(1);
    expect(r.metrics.text_overlap).toBe(1);
  });

  it('不误伤: 组框**内**的文本 / outer 标题在框外 / 半像素内的相切 —— 都不报', () => {
    // ① 文本整个落在组框内(框就是拿来装东西的, 装在里面天经地义)
    const inside: Scene = {
      ...base,
      nodes: [],
      edges: [],
      groups: [{ id: 'g', rect: { x: 50, y: 50, w: 200, h: 150 } }],
      texts: [{ id: 't', rect: { x: 70, y: 90, w: 120, h: 20 }, text: '框内', fontSize: 11 }],
    };
    expect(codes(inside)).not.toContain('text_overlap');

    // ② outer 组框标题: 摆在框**上方外侧**, 与框矩形不相交 —— 它的 rect 由 groupLabelRect 生成
    const outer: Scene = {
      ...base,
      nodes: [],
      edges: [],
      groups: [{
        id: 'g', rect: { x: 50, y: 80, w: 200, h: 150 }, label: '标题',
        labelRect: { x: 50, y: 48, w: 60, h: 18 },
      }],
    };
    expect(codes(outer)).not.toContain('text_overlap');

    // ③ 相切: 重叠 0.2px < 0.5px 容差 —— 估算余量不该变成假警报
    const tangent: Scene = {
      ...base,
      nodes: [NODE],
      edges: [],
      // 文本底 40.2 压进节点顶(40) 0.2px —— 穿透深度 0.2 < 0.5 容差
      texts: [{ id: 't', rect: { x: 80, y: 20.2, w: 120, h: 20 }, text: '擦边', fontSize: 11 }],
    };
    expect(codes(tangent)).not.toContain('text_overlap');
  });

  it('修法闭环: 照 move-text 把文本挪出节点盒, 重审即 pass', () => {
    const rect = { x: 80, y: 60, w: 120, h: 20 };
    const before: Scene = { ...base, nodes: [NODE], edges: [], texts: [{ id: 't', rect, text: '压在节点上', fontSize: 11 }] };
    expect(audit(before, { level: 'showcase' }).pass).toBe(false);

    const fix = audit(before, { level: 'showcase' }).diagnostics[0].supportedFixes.find((f) => f.kind === 'move-text');
    expect(fix).toBeDefined();

    // 挪到节点盒下方(节点底 100, 这里从 130 起) —— 修的是**几何**, 不是把门禁关掉
    const after: Scene = { ...before, texts: [{ id: 't', rect: { ...rect, y: 130 }, text: '压在节点上', fontSize: 11 }] };
    const r = audit(after, { level: 'showcase' });
    expect(r.pass).toBe(true);
    expect(r.metrics.text_overlap).toBe(0);
  });
});
