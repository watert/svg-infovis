// =====================================================================
// group-nocheck · SceneGroup.noCheck 纯视觉分区豁免(260920, 命名随 tsconfig noCheck / eslint disable)
//
// 起因: archify 的 phase 分隔带 —— 泳道线横穿 band 框是它的常态, 而「框 = 这些属于一伙」
// 的判读对纯版式框不成立, `cluster_border_clearance` 12 条 error 把它拦死。
// 本文件钉: ① 同一场景, 不置位照报 / 置位放行 ② density 与 undeclared_groups 同步排除
// ③ text_overlap 框线障碍豁免, 但节点盒/文本互压**不豁免** ④ 标签的 text_clearance 不豁免。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { audit, type Scene } from '../src/knives/audit';
import { density } from '../src/knives/density';

/** band 场景: 三条泳道线纵贯, 一个 band 框横在中间(泳道线必然横穿它) */
const bandScene = (noCheck: boolean): Scene => ({
  width: 400, height: 300,
  nodes: [
    { id: 'a', rect: { x: 20, y: 10, w: 80, h: 36 }, label: 'A' },
    { id: 'b', rect: { x: 160, y: 10, w: 80, h: 36 }, label: 'B' },
    { id: 'c', rect: { x: 300, y: 10, w: 80, h: 36 }, label: 'C' },
  ],
  edges: [
    { id: 'life:a', points: [{ x: 60, y: 46 }, { x: 60, y: 280 }] },
    { id: 'life:b', points: [{ x: 200, y: 46 }, { x: 200, y: 280 }] },
    { id: 'life:c', points: [{ x: 340, y: 46 }, { x: 340, y: 280 }] },
    { id: 'm0', points: [{ x: 67, y: 120 }, { x: 193, y: 120 }] },
  ],
  groups: [{
    id: 'band', label: 'Request', noCheck,
    rect: { x: 10, y: 90, w: 380, h: 100 }, frame: 'declared', labelPlacement: 'outer',
  }],
});

describe('SceneGroup.noCheck (visual-only band exemption)', () => {
  it('不置位: 泳道线横穿 band → cluster_border_clearance 拦死(原判决保持)', () => {
    const r = audit(bandScene(false), { level: 'standard' });
    const hit = r.diagnostics.filter((d) => d.code === 'cluster_border_clearance');
    expect(hit.length).toBeGreaterThan(0);
    expect(hit.every((d) => d.evidence && (d.evidence as Record<string, unknown>).kind === 'edge_crosses_frame')).toBe(true);
    expect(r.pass).toBe(false);
  });

  it('置位: 同一场景全绿, undeclared_groups 不再计它, density 不再喊空框', () => {
    const r = audit(bandScene(true), { level: 'standard' });
    expect(r.diagnostics.filter((d) => d.code.startsWith('cluster_'))).toHaveLength(0);
    expect(r.metrics.undeclared_groups).toBe(0);
    expect(r.pass).toBe(true);
    const d = density(bandScene(true));
    expect(d.diagnostics.filter((x) => x.subject.kind === 'group' && x.subject.id === 'band')).toHaveLength(0);
  });

  it('text_overlap: 文本压 noCheck 框线放行, 压节点盒照报', () => {
    const s = bandScene(true);
    // band 外标签恰好骑在 band 顶边上(outer 落位常见的邻带相邻情形)
    s.texts = [{ id: 'note', rect: { x: 30, y: 83, w: 60, h: 14 }, text: 'Request' }];
    const r1 = audit(s, { level: 'standard' });
    expect(r1.diagnostics.filter((d) => d.code === 'text_overlap' && JSON.stringify(d.evidence).includes('band'))).toHaveLength(0);
    // 压节点盒是另一回事 —— noCheck 不豁免实体
    s.texts = [{ id: 'note', rect: { x: 30, y: 20, w: 60, h: 14 }, text: 'Request' }];
    const r2 = audit(s, { level: 'standard' });
    expect(r2.diagnostics.some((d) => d.code === 'text_overlap' && JSON.stringify(d.evidence).includes('"nodeId":"a"'))).toBe(true);
  });

  it('豁免面不含可读性: band 标签被泳道线穿过照样 text_clearance 报警', () => {
    const s = bandScene(true);
    s.texts = [{ id: 'note', rect: { x: 30, y: 100, w: 60, h: 14 }, text: 'Request' }]; // 100~114 与 life:a 纵贯段相交
    const r = audit(s, { level: 'standard' });
    expect(r.diagnostics.some((d) => d.code === 'text_clearance' && JSON.stringify(d.evidence).includes('life'))).toBe(true);
  });
});
