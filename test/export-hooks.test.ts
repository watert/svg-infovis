// =====================================================================
// export-hooks · 语义 hook 通道(opt-in: `ExportOptions.hooks`)
//
// 由来(ROADMAP「动画」条目的隐藏前置): 导出链过去**一个抓手都不吐** —— scene 的 id / tone /
// variant / shape 过完渲染映射全不落盘, 产物里只剩 `:nth-child` 那种玄学。四条判据:
//   ① **缺省关 = 一个字节不变**: 不写 `hooks` 与显式 `false` 逐字节相同, 且一个 `data-kind`
//     都不落盘(产物级对账的判据是 `examples/start/full-chain.ts --golden` 的 sha256)
//   ② **开启后有抓手**: 六种元素(节点 / 边 / 组 / 标签 / 旁注 / 素材)各带自己的 scene id 与
//     `data-kind`, 节点另带 tone / variant / form —— 键序按 codepoint(serialize 的既有纪律)
//   ③ **语义槽有值才吐**: 判据是 `undefined`, **不是**"与缺省值相等" —— 作者显式写的 `slate`
//     照样落盘; 唯一恒吐的是 `data-form`(选择器不该猜形态)
//   ④ **两次导出全等**: 字节确定性对这条通道一样成立
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Attrs, Descriptor } from '../src/descriptor';
import { embedAsset } from '../src/embed/svg-asset';
import { sceneChildren, tryExport } from '../src/export';
import { DEFAULT_NODE_SHAPE } from '../src/shapes/node';
import type { Scene } from '../src/knives/audit';

/** 素材走仓库里那份真样本(与 test/embed-scene.test.ts 同一份: 只借它的 id 前缀, 内部 markup 不参与判据) */
const asset = embedAsset(
  readFileSync(fileURLToPath(new URL('../assets/embeds/echarts-line.svg', import.meta.url)), 'utf8'),
  { name: 'chart' },
);

/** 块摆位手写: 这张场景判的是**属性通道**, 不是版式 —— 几何够干净、门禁能过就行 */
const scene: Scene = {
  width: 560,
  height: 400,
  nodes: [
    { id: 'a', rect: { x: 40, y: 60, w: 120, h: 46 }, label: 'A', tone: 'blue', variant: 'solid' },
    { id: 'b', rect: { x: 40, y: 180, w: 120, h: 46 }, label: 'B', shape: 'diamond' },
    { id: 'plain', rect: { x: 230, y: 60, w: 120, h: 46 }, label: 'P' },
    { id: 'slate1', rect: { x: 230, y: 180, w: 120, h: 46 }, label: 'S', tone: 'slate' },
  ],
  edges: [{ id: 'e1', from: 'a', to: 'b', points: [{ x: 100, y: 106 }, { x: 100, y: 180 }], tone: 'emerald' }],
  groups: [{ id: 'g1', rect: { x: 12, y: 12, w: 176, h: 240 }, label: 'G', tone: 'violet', noCheck: true }],
  labels: [{ id: 'l1', at: { x: 100, y: 143 }, width: 36, height: 14, text: 'go', tone: 'amber', ownerEdge: 'e1' }],
  texts: [
    { id: 't1', rect: { x: 230, y: 125, w: 120, h: 14 }, text: 'note' },
    { id: 't2', rect: { x: 230, y: 250, w: 120, h: 26 }, text: 'l1\nl2' },
  ],
  embeds: [{ id: 'm1', rect: { x: 380, y: 180, w: 150, h: 100 }, asset }],
};

const attr = (d: Descriptor, key: string): unknown => (d.kind === 'defs' ? undefined : d.attrs?.[key]);

/** 展平全部 descriptor 的 attrs(判据按 `data-kind` 认产物, 不按位置猜) */
const attrsList = (ds: Descriptor[]): Attrs[] =>
  ds.flatMap((d): Attrs[] => {
    const own: Attrs[] = d.kind === 'defs' || !d.attrs ? [] : [d.attrs];
    return d.kind === 'group' ? [...own, ...attrsList(d.children)] : own;
  });
const picked = (ds: Descriptor[], kind: string): Attrs[] => attrsList(ds).filter((a) => a['data-kind'] === kind);

describe('export · 语义 hook 通道(opt-in)', () => {
  it('① 缺省关: 产物与显式 hooks: false 逐字节相同, 且一个 data-kind 都不落盘', () => {
    const bare = tryExport(scene).svg;
    expect(bare).toBe(tryExport(scene, { hooks: false }).svg);
    expect(bare).not.toContain('data-kind');
    expect(bare).not.toContain('data-tone');
    expect(bare).not.toContain('data-variant');
    // 描述符级也逐项相同(整串相等可能是"两处都加错"的假绿)
    expect(sceneChildren(scene)).toEqual(sceneChildren(scene, { hooks: false }));
    // ⚠ 缺省关的字节级判据在产物那一侧: `bun run examples/start/full-chain.ts --golden` 的 sha256
  });

  it('② 开启后: 六种元素各带自己的 id 与 data-kind, 键序按 codepoint 排', () => {
    const children = sceneChildren(scene, { hooks: true });
    for (const kind of ['node', 'edge', 'group', 'label', 'text', 'embed']) {
      expect(attrsList(children).filter((a) => a['data-kind'] === kind).length).toBeGreaterThan(0);
    }
    // 每种元素的 id 就是 scene 的 id(边 / 组 / 标签 / 素材同样透传 —— SMIL 的跨元素引用靠它)
    expect(picked(children, 'edge')[0].id).toBe('e1');
    expect(picked(children, 'group')[0].id).toBe('g1');
    expect(picked(children, 'label')[0].id).toBe('l1');
    expect(picked(children, 'embed')[0].id).toBe('m1');

    // 节点 'a': 语义槽三位齐上屏(键序 = attrsToStr 的 codepoint 序, 与形状层自带的 data-shape 同袋)
    expect(picked(children, 'node')[0]).toEqual({
      'data-shape': 'node', 'data-form': 'rect', id: 'a', 'data-kind': 'node', 'data-tone': 'blue', 'data-variant': 'solid',
    });
    const svg = tryExport(scene, { hooks: true }).svg;
    expect(svg).toContain(
      'data-form="rect" data-kind="node" data-shape="node" data-tone="blue" data-variant="solid" id="a"',
    );
    // 菱形: 形状层自己吐的 data-form 与 hook 派生的是**同一个值**, 合并不出重键
    expect(svg).toContain('data-form="diamond" data-kind="node" data-shape="node" id="b"');

    // 旁注: 单行直合; 多行吐 N 个 `<text>` 但只有一个 id ⇒ 套一层 `<g>` 承载(重复 id 是非法文档)
    expect(children.find((d) => attr(d, 'id') === 't1')?.kind).toBe('text');
    const wrap = children.find((d): d is Extract<Descriptor, { kind: 'group' }> =>
      d.kind === 'group' && d.attrs?.id === 't2');
    expect(wrap?.children.length).toBe(2);
    expect(wrap?.attrs?.['data-kind']).toBe('text');
  });

  it('③ 语义槽有值才吐: undefined 不落盘, 显式写缺省值照落盘; data-form 恒吐', () => {
    const children = sceneChildren(scene, { hooks: true });
    const plain = picked(children, 'node').find((a) => a.id === 'plain')!;
    // 没写的 tone / variant 一位都不落; `data-form` 是唯一恒吐的槽 —— **缺省形态也吐**
    // (判据: 选择器不该猜缺省值), 那个词从 `DEFAULT_NODE_SHAPE` 读, 出口不抄字面量
    expect(plain).toEqual({ 'data-shape': 'node', id: 'plain', 'data-kind': 'node', 'data-form': DEFAULT_NODE_SHAPE });
    // 判据是 undefined **不是**值比较: 作者显式写的 slate(与主题缺省同值)照样落盘
    expect(picked(children, 'node').find((a) => a.id === 'slate1')!['data-tone']).toBe('slate');
    // 没有可派语义槽的元素种类: 只吐 id / data-kind(连 data-form 都没有 —— 那不是节点)
    expect(picked(children, 'embed')[0]).toEqual({ 'data-shape': 'embed', id: 'm1', 'data-kind': 'embed' });
    expect(picked(children, 'text')[0]['data-tone']).toBeUndefined();
  });

  it('④ 同一 scene 两次导出全等, 且与缺省关的产物不同', () => {
    expect(tryExport(scene, { hooks: true }).svg).toBe(tryExport(scene, { hooks: true }).svg);
    expect(tryExport(scene, { hooks: true }).svg).not.toBe(tryExport(scene).svg);
  });
});
