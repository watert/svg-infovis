// =====================================================================
// scene-tone · 肤色从 scene 读(260918 "作者写了却不上屏" 同族第四次)
//
// archify 复刻实测: 作者在数据表里写了 tone, 产物里**一个色值都没上屏**(两张 SVG 只有 7 个色值、
// 全是 slate 灰阶) —— 因为 `tone` / `variant` 过去只能靠 `nodeStyles` 逐 id 注入。
// 口径变更: `tone` 是**语义**(类型 → 肤色)不是样式参数, 该跟几何一起进 scene。
//
// 本文件钉四件事(每条都是"把病放回去会红"):
//   ① 能力: 带 tone 的 scene 出图能数到 ≥5 个**非 slate** 色值(节点 + 组框都算)
//   ② 反面: 不给 tone → 产物里只有 slate 灰阶, 且与"逐 id 覆盖表显式给 slate"逐字节相同
//   ③ 覆盖优先级: `nodeStyles` / `groupStyles` 的逐 id 精调**永远赢**; 表里没表态(undefined)不算覆盖
//   ④ `variant` 同属这个语义位(实色底上屏 / 覆盖表能顶掉)
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { type Scene } from '../src/knives/audit';
import { createScene } from '../src/scene';
import { exportScene, sceneChildren } from '../src/export';
import { THEMES } from '../src/theme';
import type { Descriptor } from '../src/descriptor';

const HEX = /#[0-9a-f]{6}/g;

/** 产物里出现过的色值(去重 + 排序, 便于逐字节对账) */
const colorsOf = (svg: string): string[] => [...new Set(svg.match(HEX) ?? [])].sort();

/** light 主题里属于 slate 那一族的色值: canvas / 线 / 文字 / 组框 + slate 槽全套 */
const SLATEISH = new Set<string>([
  THEMES.light.canvas, THEMES.light.edge, THEMES.light.label, THEMES.light.labelBg,
  THEMES.light.groupStroke, THEMES.light.groupText,
  ...Object.values(THEMES.light.tones.slate),
]);

const nonSlate = (svg: string): string[] => colorsOf(svg).filter((c) => !SLATEISH.has(c));

/** 某一类元素(data-shape)的 path 属性 —— 断言直接读描述符, 不去整串 SVG 里猜 */
const shapePaths = (children: Descriptor[], shape: string): Array<Record<string, unknown>> =>
  children
    .filter((d): d is Extract<Descriptor, { kind: 'group' }> => d.kind === 'group' && d.attrs?.['data-shape'] === shape)
    .map((el) => {
      const p = el.children.find((c) => c.kind === 'path');
      if (!p || p.kind !== 'path') throw new Error(`${shape} 的第一个 child 应当是 path`);
      return p.attrs ?? {};
    });

const T = THEMES.light.tones;

/**
 * 五个槽各占一格(横向排开, 间距充裕, standard 档门禁过得去) + 右侧一个**组框**占第六个槽(teal)。
 * 节点与组框的 tone 刻意不重叠: 某一侧没上屏时, 断言能指名道姓说清是哪个面漏了。
 */
const TONED = ['emerald', 'amber', 'rose', 'violet', 'blue'] as const;

const scene = (opts: { tones?: boolean } = {}): Scene => ({
  width: 900,
  height: 240,
  nodes: TONED.map((tone, i) => ({
    id: `n${i}`,
    rect: { x: 40 + i * 130, y: 60, w: 110, h: 50 },
    label: tone,
    ...(opts.tones ? { tone } : {}),
  })),
  edges: [],
  groups: [{ id: 'g', rect: { x: 830, y: 40, w: 50, h: 160 }, ...(opts.tones ? { tone: 'teal' as const } : {}) }],
});

describe('scene-tone · 肤色进 scene(语义位), 覆盖表仍是逃生口', () => {
  it('能力举证: 带 tone 的 scene 出图能数到 ≥5 个非 slate 色值', () => {
    const { svg } = exportScene(scene({ tones: true }));
    const got = nonSlate(svg);
    // 六个槽的描边色各自上屏(每格一个 tone, 没写在覆盖表里)
    expect(got.length).toBeGreaterThanOrEqual(5);
    expect(got).toContain(T.emerald.border);
    expect(got).toContain(T.amber.border);
    expect(got).toContain(T.rose.border);
    expect(got).toContain(T.violet.border);
    expect(got).toContain(T.blue.border);
    // teal 只出现在**组框**上(节点不占这个槽) —— 这一条是组框那半边渲染路径的专属断言
    expect(got).toContain(T.teal.border);
  });

  it('反面: 不给 tone → 产物里一个非 slate 色值都没有(缺省仍是 slate 中性)', () => {
    const { svg } = exportScene(scene());
    expect(nonSlate(svg)).toEqual([]);
  });

  it('缺省落位: scene 不给 tone 与"覆盖表显式给 slate + outline"逐字节相同', () => {
    // 这就是"既有行为零回归"的单元级焊法: 新路径的缺省必须落在旧路径(覆盖表)的同一点上
    const bare = exportScene(scene(), { skipAudit: true }).svg;
    const explicit = exportScene(scene(), {
      skipAudit: true,
      nodeStyles: Object.fromEntries(TONED.map((_, i) => [`n${i}`, { tone: 'slate' as const, variant: 'outline' as const }])),
      groupStyles: { g: { tone: 'slate' as const } },
    }).svg;
    expect(explicit).toBe(bare);
  });

  it('覆盖优先级: 节点同时给 scene.tone 与 nodeStyles[id].tone → 覆盖表赢', () => {
    const opts = { nodeStyles: { n0: { tone: 'rose' as const } } };
    const paths = shapePaths(sceneChildren(scene({ tones: true }), opts), 'node');
    expect(paths[0].stroke).toBe(T.rose.border); // n0 在 scene 里是 emerald, 被覆盖表改成 rose
    // 覆盖只动被点名的那一格: 别的节点照旧读 scene(不是"一开覆盖表整张图都变默认色")
    expect(paths.slice(1).map((p) => p.stroke)).toEqual([T.amber.border, T.rose.border, T.violet.border, T.blue.border]);
    // 反证: emerald 只出现在 n0 上 —— 覆盖生效后它整份产物里都不该再有
    const { svg } = exportScene(scene({ tones: true }), opts);
    expect(nonSlate(svg)).not.toContain(T.emerald.border);
  });

  it('覆盖优先级: 组框同理(scene.tone 是缺省, groupStyles[id].tone 顶掉它)', () => {
    const paths = shapePaths(sceneChildren(scene({ tones: true }), { groupStyles: { g: { tone: 'violet' } } }), 'group');
    expect(paths.map((p) => p.stroke)).toEqual([T.violet.border]);
  });

  it('覆盖表里**没表态**(tone: undefined)不算覆盖 —— 不许把 scene 的肤色抹回 slate', () => {
    // 调用方常按整张表 map 出覆盖项(NODES.map(n => ({ tone: n.tone }))), 未表态的键就是 undefined;
    // 直接把 undefined 铺上去会把 scene 的 tone 顶掉, 等于同一个病换个地方再犯
    const paths = shapePaths(sceneChildren(scene({ tones: true }), { nodeStyles: { n0: { tone: undefined } } }), 'node');
    expect(paths[0].stroke).toBe(T.emerald.border);
  });

  it('variant 同属这个语义位: scene 点 solid → 实色底上屏; 覆盖表显式给 outline 顶掉它', () => {
    const solid: Scene = {
      width: 300,
      height: 160,
      nodes: [{ id: 'a', rect: { x: 40, y: 50, w: 120, h: 50 }, label: 'A', tone: 'blue', variant: 'solid' }],
      edges: [],
    };
    const [s1] = shapePaths(sceneChildren(solid), 'node');
    expect(s1.fill).toBe(T.blue.solidBg);
    // 表里写 outline 才顶掉(scene 说的"强调"被作者的逐 id 精调否决)
    const [s2] = shapePaths(sceneChildren(solid, { nodeStyles: { a: { variant: 'outline' } } }), 'node');
    expect(s2.fill).toBe(T.blue.surface);
    expect(s2.stroke).toBe(T.blue.border);
  });

  it('createScene: 语义位不参与规范化 —— 不落缺省、不校验、原样带过缓存层', () => {
    const doc = createScene(scene({ tones: true }), { bounds_source: 'layout' });
    expect(doc.nodes.map((n) => n.tone)).toEqual([...TONED]);
    // 没写 tone 的节点不许被补一个"缺省色"(那会把"作者有没有表态"这条信息抹掉)
    const bare = createScene(scene(), { bounds_source: 'layout' });
    expect(bare.nodes.map((n) => n.tone)).toEqual(TONED.map(() => undefined));
    expect(bare.groups?.[0].tone).toBeUndefined();
  });
});
