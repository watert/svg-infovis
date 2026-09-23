// =====================================================================
// text_owner · 自由文本的归属槽(260923)
//
// 两件事各一组判据, 都是**两方向**的:
//   · 引用校验(`owner_ref`) —— 真实存在不报 / 四种坏法各报一条, 且带修法
//   · 豁免面 —— 命中 owner 的那条边**不判净空**, 别的边**照判**(去掉 owner 时两条都回来)
// 另加一条"不越界": `kind: 'node'` 的归属**不给线豁免**(归属不是万能免责)。
//
// ⚠ 变异验证(手工, 不在这个文件里): 把 `checkTextClearance` 的 `mine` 豁免那一行停掉 ——
// 本文件的"自家边不报"当场红, 其余用例无一喊痛; 再把 `owner_ref` 的 `pools[...].includes`
// 短路成恒真 —— "幽灵引用报"红。这就是"新判据自己举证"的两次反向实验。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { type Scene, type SceneOwner, SCENE_OWNER_KINDS, audit } from '../src/knives/audit';

const S = (over: Partial<Scene>): Scene => ({ width: 400, height: 300, nodes: [], edges: [], ...over });

/** 只留下本文件关心的两类码 —— 别的门禁有没有喊疼不是这里的判据 */
const oursOf = (s: Scene, level: 'standard' | 'showcase' = 'showcase'): string[] =>
  audit(s, { level }).diagnostics.filter((d) => d.code === 'owner_ref' || d.code === 'text_clearance').map((d) => d.code);

/** 一条矩形文本(位置由调用方给), 可选带 owner */
const note = (id: string, rect: { x: number; y: number; w: number; h: number }, owner?: SceneOwner) =>
  ({ id, rect, text: '旁注', ...(owner ? { owner } : {}) });

const VERT = { id: 'owner-edge', points: [{ x: 200, y: 20 }, { x: 200, y: 280 }] };   // 竖线穿过那块字
const HORZ = { id: 'other-edge', points: [{ x: 20, y: 150 }, { x: 380, y: 150 }] };   // 横线也穿过同一块字
const BLOCK = { x: 170, y: 140, w: 60, h: 20 };

describe('text_owner · 归属槽(引用校验 + 单一豁免面)', () => {
  it('三种 kind 的引用都真实存在时不报, 且 metrics.owner_ref 为零', () => {
    const s = S({
      nodes: [{ id: 'n', rect: { x: 40, y: 40, w: 80, h: 40 } }],
      edges: [{ id: 'e', points: [{ x: 40, y: 200 }, { x: 340, y: 200 }] }],
      groups: [{ id: 'g', rect: { x: 20, y: 20, w: 220, h: 260 } }],
      texts: [
        note('t-node', { x: 40, y: 100, w: 60, h: 18 }, { kind: 'node', id: 'n' }),
        note('t-edge', { x: 40, y: 140, w: 60, h: 18 }, { kind: 'edge', id: 'e' }),
        note('t-group', { x: 40, y: 180, w: 60, h: 18 }, { kind: 'group', id: 'g' }),
      ],
    });
    const r = audit(s);
    expect(r.diagnostics.filter((d) => d.code === 'owner_ref')).toEqual([]);
    expect(r.metrics.owner_ref).toBe(0);
    // 没有 owner 的文本不计数(0 = 引用都对得上, 不是"没有引用")
    expect(audit(S({ texts: [note('plain', BLOCK)] })).metrics.owner_ref).toBe(0);
  });

  it('四种坏法各报一条 owner_ref(error + 带修法): id 不存在 / kind 非词表 / id 空 / owner 不是对象', () => {
    const bads: Array<[string, unknown]> = [
      ['id 不存在', { kind: 'edge', id: 'nope' }],
      ['kind 非词表', { kind: 'widget', id: 'x' }],
      ['id 空串', { kind: 'edge', id: '' }],
      ['不是对象', 'nonsense'],
    ];
    for (const [why, owner] of bads) {
      const r = audit(S({ texts: [{ ...note('t', BLOCK), owner: owner as SceneOwner }] }));
      const hits = r.diagnostics.filter((d) => d.code === 'owner_ref');
      expect(hits.length, `${why} 应报一条`).toBe(1);
      expect(hits[0].severity).toBe('error');
      expect(hits[0].subject).toEqual({ kind: 'text', id: 't' });
      expect(hits[0].supportedFixes.length).toBeGreaterThan(0); // 没有旋钮的报错不立项
      expect(hits[0].message).toContain('t');
    }
    // 修法给的是"写对引用 / 删掉 owner"两条, 且 id 不存在那条要把候选 id 列出来
    const ghost = audit(S({
      edges: [{ id: 'e', points: [{ x: 40, y: 260 }, { x: 360, y: 260 }] }],
      texts: [{ ...note('t', BLOCK), owner: { kind: 'edge', id: 'gone' } }],
    })).diagnostics.find((d) => d.code === 'owner_ref')!;
    expect(ghost.supportedFixes.map((f) => f.kind)).toEqual(['fix-owner-id', 'drop-owner']);
    expect(ghost.supportedFixes[0].hint).toContain('e');
    // 幽灵归属不影响别的判据: 这里只有 owner_ref, 没有 text_clearance
    expect(oursOf(S({ texts: [{ ...note('t', BLOCK), owner: { kind: 'edge', id: 'nope' } }] }))).toEqual(['owner_ref']);
  });

  it('豁免面只有自家边一条: 命中 owner 的边不判净空, 别的边照判(去掉 owner 两条都回来)', () => {
    const owned = S({ edges: [VERT, HORZ], texts: [note('t', BLOCK, { kind: 'edge', id: 'owner-edge' })] });
    const hit = audit(owned, { level: 'showcase' }).diagnostics.filter((d) => d.code === 'text_clearance');
    expect(hit.map((d) => d.evidence.edgeId)).toEqual(['other-edge']); // 自家边被豁免, 只报另一条
    expect(oursOf(owned)).toEqual(['text_clearance']); // owner 引用本身是好的

    // 对照: 没有 owner 时同一块字被**两条**边判
    const bare = S({ edges: [VERT, HORZ], texts: [note('t', BLOCK)] });
    const both = audit(bare, { level: 'showcase' }).diagnostics.filter((d) => d.code === 'text_clearance');
    expect([...new Set(both.map((d) => d.evidence.edgeId))].sort()).toEqual(['other-edge', 'owner-edge']);
  });

  it('豁免不越界: kind 为 node / group 时不给线豁免, 压在节点盒上也照报 text_overlap', () => {
    const onNode = S({
      nodes: [{ id: 'n', rect: { x: 160, y: 120, w: 120, h: 60 } }],
      edges: [HORZ],
      texts: [note('t', { x: 170, y: 130, w: 80, h: 20 }, { kind: 'node', id: 'n' })],
    });
    const d = audit(onNode, { level: 'showcase' }).diagnostics;
    expect(d.filter((x) => x.code === 'text_overlap').length).toBe(1); // 归属不豁免压盒子
    expect(d.filter((x) => x.code === 'text_clearance').length).toBe(1); // 也不豁免穿过它的那条线
    expect(d.filter((x) => x.code === 'owner_ref')).toEqual([]);
  });

  it('词表与类型同源: 只认 node / edge / group', () => {
    expect([...SCENE_OWNER_KINDS]).toEqual(['node', 'edge', 'group']);
  });
});
