// =====================================================================
// 自由文本门禁与覆盖面回归
//
// 背景(260917 实测): 架构图的折线从组框标题身上穿过去, 全部门禁照样 pass ——
// 因为旁注是直出的 text 元素, **根本不在 scene 里**, audit 物理上看不见它。
// 看不到的东西没法审, 所以这组用例钉三件事:
//   ① texts 进了 scene 之后, 净空与越界都查得到(新门禁 text_clearance);
//   ② 覆盖面的两个旧漏洞: labels 未查越界 / 画布容差 0.5 盖不住描边外扩 0.75;
//   ③ 未测项的 metrics 一律 -1 —— 不许用 0 冒充"测过了, 结果是零"。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { type Scene, audit } from '../src/knives/audit';

/** 一条 L 形边 + 一块文本; 文本默认压在边的水平段(y=40)上 */
const scene = (textRect = { x: 150, y: 30, w: 120, h: 20 }, canvas = { width: 400, height: 200 }): Scene => ({
  ...canvas,
  nodes: [
    { id: 'a', rect: { x: 20, y: 20, w: 80, h: 40 } },
    { id: 'b', rect: { x: 300, y: 120, w: 80, h: 40 } },
  ],
  edges: [
    {
      id: 'e',
      points: [
        { x: 100, y: 40 },
        { x: 200, y: 40 },
        { x: 200, y: 140 },
        { x: 300, y: 140 },
      ],
    },
  ],
  texts: [{ id: 'note', rect: textRect, text: 'core · 零运行时依赖' }],
});

describe('audit · 自由文本门禁与覆盖面', () => {
  it('文本被边穿过: 报 text_clearance, 且指名是哪条边、内容是什么(agent 要能直接照着改)', () => {
    const r = audit(scene(), { level: 'showcase' });
    const d = r.diagnostics.find((x) => x.code === 'text_clearance');
    expect(d).toBeDefined();
    expect(d?.severity).toBe('error');
    expect(d?.subject).toEqual({ kind: 'text', id: 'note' });
    expect(d?.evidence.edgeId).toBe('e');
    expect(d?.evidence.clearance).toBe(0); // 穿过 = 净空 0(不是负数)
    expect(d?.evidence.content).toBe('core · 零运行时依赖');
    // 修法首选是改折线腰线, 不是挪字 —— 顺序错了 agent 会把版式当一次性消耗品
    expect(d?.supportedFixes[0].kind).toBe('lane-shift');
    expect(r.pass).toBe(false);
    expect(r.metrics.min_text_clearance).toBe(0);
  });

  it('同一份 scene 在 standard 档降为 warning: 两档用同一把尺子, 但判分松紧不同', () => {
    const r = audit(scene(), { level: 'standard' });
    const d = r.diagnostics.find((x) => x.code === 'text_clearance');
    expect(d?.severity).toBe('warning');
    expect(r.pass).toBe(true); // warning 不拦出口
  });

  it('文本与边留足净空: 不报, 且 metrics 给出实数(测过了, 不是 -1)', () => {
    // 留白区: 那条边占了三段 —— y=40(水平) / x=200(垂直) / y=140(水平);
    // 右下角 x 220..290 / y 80..100 距最近的垂直段 20px。
    // (第一版用例把文本挪到 y=90 就算"干净", 却忘了垂直段正好从中间穿过 —— 看净空要看整条折线)
    const clean = audit(scene({ x: 220, y: 80, w: 70, h: 20 }), { level: 'showcase' });
    expect(clean.diagnostics.filter((d) => d.code === 'text_clearance')).toEqual([]);
    expect(clean.metrics.min_text_clearance).toBeGreaterThan(4);
    expect(clean.pass).toBe(true);
  });

  it('没有 texts: min_text_clearance = -1 —— 一项都没测过, 不许用 0 冒充', () => {
    const s = scene();
    delete s.texts;
    const r = audit(s, { level: 'showcase' });
    expect(r.metrics.min_text_clearance).toBe(-1);
    expect(r.metrics.texts).toBe(0);
  });

  it('文本越出画布: single_svg 抓到(过去它只认 nodes / groups)', () => {
    const r = audit(scene({ x: 360, y: 30, w: 120, h: 20 }, { width: 400, height: 200 }));
    const d = r.diagnostics.find((x) => x.code === 'single_svg');
    expect(d?.severity).toBe('error');
    expect((d?.evidence.offenders as string[]).some((o) => o.startsWith('text:'))).toBe(true);
  });

  it('label 越出画布: single_svg 也抓(旧实现漏查 labels 的包围盒)', () => {
    const s = scene({ x: 150, y: 90, w: 120, h: 20 });
    s.labels = [{ id: 'lb', at: { x: 395, y: 100 }, width: 40, height: 16 }]; // 右缘 415 > 400
    const d = audit(s).diagnostics.find((x) => x.code === 'single_svg');
    expect((d?.evidence.offenders as string[]).some((o) => o.startsWith('label:'))).toBe(true);
  });

  it('画布容差覆盖描边外扩: 贴边 0.75px 放行(描边只有半条在外), 超出 1px 才算越界', () => {
    // 0.75 = strokeWidth(1.5) / 2 —— 旧容差 0.5 会把它误判成越界, 于是"贴边的图"永远出不来
    const touching = scene({ x: 150, y: 90, w: 120, h: 20 }, { width: 400, height: 200 });
    touching.nodes[1] = { id: 'b', rect: { x: 319.25, y: 120, w: 80, h: 40 } }; // 右缘 399.25 → 在容差内
    expect(audit(touching).diagnostics.some((d) => d.code === 'single_svg')).toBe(false);

    const outside = scene({ x: 150, y: 90, w: 120, h: 20 }, { width: 400, height: 200 });
    outside.nodes[1] = { id: 'b', rect: { x: 322, y: 120, w: 80, h: 40 } }; // 右缘 402 → 真的出去了
    const d = audit(outside).diagnostics.find((x) => x.code === 'single_svg');
    expect((d?.evidence.offenders as string[]).some((o) => o === 'node:b')).toBe(true);
  });
});
