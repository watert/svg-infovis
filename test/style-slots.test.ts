// =====================================================================
// style-slots · 260919 学术风四件套: tint variant / THEMES.paper / 节点 opacity+struck / SceneText weight+color
//
// 评估文(260919 学术风出图评估)定的 API 面, 每条钉两件事:
//   · 能力: 新槽真的上屏(渲染面读得到)
//   · 稳定: 缺省产物逐字节不变(老图不许漂)
// struck 走 SceneNode 语义槽是评估文的核心判断: 裸装饰函数在 sceneChildren 唯一映射下没有合法注入点。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { THEMES, toneStyle } from '../src/theme';
import { nodeShape } from '../src/shapes/node';
import { exportScene, sceneChildren } from '../src/export';
import { createScene } from '../src/scene';
import type { Scene } from '../src/knives/audit';
import type { Descriptor } from '../src/descriptor';

const T = THEMES.light.tones;

/** 找 data-shape=node 的组 descriptor */
const nodeGroups = (children: Descriptor[]) =>
  children.filter((d): d is Extract<Descriptor, { kind: 'group' }> => d.kind === 'group' && d.attrs?.['data-shape'] === 'node');

describe('style slots (tint / paper / opacity / struck / text weight+color)', () => {
  it('tint variant: 浅色底 + 深一档描边(solidBorder), outline/solid 取值不变', () => {
    expect(toneStyle(THEMES.light, 'rose', 'tint')).toEqual({ fill: T.rose.tint, stroke: T.rose.solidBorder, text: T.rose.text, strokeWidth: 1.5 });
    expect(toneStyle(THEMES.light, 'blue', 'tint')!.fill).toBe('#dbeafe');
    // 老两档逐字段钉死 —— 加 tint 不许漂移它们
    expect(toneStyle(THEMES.light, 'slate', 'outline')).toEqual({ fill: '#ffffff', stroke: '#cbd5e1', text: '#0f172a', strokeWidth: 1.5 });
    expect(toneStyle(THEMES.light, 'slate', 'solid')).toEqual({ fill: '#475569', stroke: '#334155', text: '#f8fafc', strokeWidth: 1.5 });
  });

  it('nodeShape 认 tint: fill/stroke 上屏', () => {
    const g = nodeShape({ x: 0, y: 0, w: 120, h: 40, label: 'x', tone: 'blue', variant: 'tint' });
    const p = g.children.find((c): c is Extract<Descriptor, { kind: 'path' }> => c.kind === 'path');
    expect(p!.attrs!.fill).toBe(T.blue.tint);
    expect(p!.attrs!.stroke).toBe(T.blue.solidBorder);
  });

  it('THEMES.paper: 墨水线档(edge/边框深于 light), 画布仍白', () => {
    expect(THEMES.paper.mode).toBe('paper');
    expect(THEMES.paper.canvas).toBe('#fffdf8'); // 260920 暖白: 白盒 surface 在暖底上微微浮起
    expect(BigInt(parseInt(THEMES.paper.edge.slice(1), 16))).toBeLessThan(BigInt(parseInt(THEMES.light.edge.slice(1), 16)));
    expect(THEMES.paper.tones.slate.border).toBe('#111827');
    // tint 在 paper 下就是学术角色框: 浅蓝底 + 深蓝边
    expect(toneStyle(THEMES.paper, 'blue', 'tint')).toEqual({ fill: '#dbeafe', stroke: '#1e40af', text: '#1e3a8a', strokeWidth: 1.5 });
  });

  it('opacity: 语义槽上屏为组属性, 缺省不输出属性(老产物字节不变)', () => {
    const faded = nodeShape({ x: 0, y: 0, w: 120, h: 40, label: 'x', opacity: 0.45 });
    const plain = nodeShape({ x: 0, y: 0, w: 120, h: 40, label: 'x' });
    expect(faded.attrs!.opacity).toBe(0.45);
    expect('opacity' in (plain.attrs ?? {})).toBe(false);
  });

  it('struck: 红 X 两条对角线压在文字之后, 色取 rose.solidBorder; 不给则无叉', () => {
    const struck = nodeShape({ x: 10, y: 20, w: 120, h: 40, label: 'x', struck: true });
    const paths = struck.children.filter((c): c is Extract<Descriptor, { kind: 'path' }> => c.kind === 'path');
    expect(paths).toHaveLength(2); // 盒体 + X
    const x = paths[1]!;
    // fmt 是两位小数(serialize 的字节确定性口径)
    expect(x.d).toBe('M 10.00 20.00 L 130.00 60.00 M 130.00 20.00 L 10.00 60.00');
    expect(x.attrs!.stroke).toBe(T.rose.solidBorder);
    // X 是最后一个 child —— 压在文字上面
    expect(struck.children[struck.children.length - 1]).toBe(x);
    expect(nodeShape({ x: 10, y: 20, w: 120, h: 40, label: 'x' }).children).toHaveLength(2);
  });

  it('scene 语义槽直通出口: struck/opacity 从 SceneNode 读, 覆盖表能顶掉', () => {
    const scene: Scene = {
      width: 400, height: 120,
      nodes: [
        { id: 'ghost', rect: { x: 20, y: 40, w: 140, h: 40 }, label: 'ghost', struck: true, opacity: 0.45 },
        { id: 'plain', rect: { x: 220, y: 40, w: 140, h: 40 }, label: 'plain' },
      ],
      edges: [],
    };
    const ghost = nodeGroups(sceneChildren(scene))[0]!;
    expect(ghost.attrs!.opacity).toBe(0.45);
    expect(ghost.children.some((c) => c.kind === 'path' && c.d!.includes('M 20.00 40.00 L 160.00 80.00'))).toBe(true);
    const plain = nodeGroups(sceneChildren(scene))[1]!;
    expect('opacity' in (plain.attrs ?? {})).toBe(false);
    // 覆盖表永远赢: 显式 opacity:1 上屏为属性值 1(顶掉 scene 的 0.45); struck:false 不出叉
    const overridden = nodeGroups(sceneChildren(scene, { nodeStyles: { ghost: { opacity: 1, struck: false } } }))[0]!;
    expect(overridden.attrs!.opacity).toBe(1);
    expect(overridden.children.some((c) => c.kind === 'path' && c.d!.includes('M 20 40'))).toBe(false);
  });

  it('SceneText weight/color: 从 scene 读, 缺省回落 theme.label 且无 font-weight 属性', () => {
    const scene: Scene = {
      width: 300, height: 100,
      nodes: [], edges: [],
      texts: [
        { id: 'title', rect: { x: 20, y: 10, w: 200, h: 24 }, text: 'Title', fontSize: 18, weight: 700, color: '#be123c' },
        { id: 'note', rect: { x: 20, y: 60, w: 200, h: 20 }, text: 'note' },
      ],
    };
    const children = sceneChildren(scene);
    const texts = children.filter((d): d is Extract<Descriptor, { kind: 'text' }> => d.kind === 'text');
    expect(texts).toHaveLength(2);
    const [title, note] = texts as [NonNullable<typeof texts[number]>, NonNullable<typeof texts[number]>];
    expect(title.attrs!['font-weight']).toBe(700);
    expect(title.attrs!.fill).toBe('#be123c');
    // descriptor attrs 里 undefined 键仍在(serialize 时才丢弃) —— 断言值, 不是键的存在性
    expect(note.attrs!['font-weight']).toBeUndefined();
    expect(note.attrs!.fill).toBe(THEMES.light.label);
  });

  it('exportScene 走 paper 主题出图: 产物含墨水边色值且门禁可过', () => {
    const scene = createScene({
      width: 300, height: 120,
      nodes: [
        { id: 'a', rect: { x: 20, y: 40, w: 120, h: 40 }, label: 'A', tone: 'rose', variant: 'tint' },
        { id: 'b', rect: { x: 180, y: 40, w: 100, h: 40 }, label: 'B' },
      ],
      edges: [{ id: 'e', from: 'a', to: 'b', points: [{ x: 140, y: 60 }, { x: 180, y: 60 }] }],
    });
    const { svg, report } = exportScene(scene, { level: 'standard', theme: THEMES.paper });
    expect(report.pass).toBe(true);
    expect(svg).toContain('#111827');
    expect(svg).toContain(THEMES.paper.tones.rose.tint);
  });
});
