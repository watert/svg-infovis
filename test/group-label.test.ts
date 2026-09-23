// =====================================================================
// shapes/group 的标签定位: inner / outer + labelInset
// 核心不是"能不能摆", 而是**摆放与审计必须同源** —— 从 toSVG 里读出真实 text 坐标,
// 跟 groupLabelRect 对账。两套坐标一旦漂开, 门禁查的就不是图上的东西了。
// =====================================================================

import { describe, expect, test } from 'bun:test';
import { THEMES, groupLabelRect, groupShape, svg, textBlocks, toSVG, OPTICAL_CENTRAL_FIX } from '../src/index';
import type { Rect } from '../src/geometry/vec.ts';

const BOX: Rect = { x: 100, y: 200, w: 400, h: 120 };
const LABEL = 'core · 零运行时依赖 · bun 直跑';

/** 从渲染产物里抠出真实 text 的 x / y(黑盒对账, 不依赖 descriptor 内部结构) */
const renderedTextXY = (d: ReturnType<typeof groupShape>): { x: number; y: number } | null => {
  const out = toSVG(svg(880, 700, [d]));
  const m = /<text x="([-\d.]+)" y="([-\d.]+)"/.exec(out);
  return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
};

describe('shapes/group · 标签定位', () => {
  test('inner(缺省): 标签落在框内左上', () => {
    const r = groupLabelRect({ ...BOX, label: LABEL })!;
    expect(r).not.toBeNull();
    expect(r.x).toBeGreaterThan(BOX.x); // 有内缩, 不贴左边
    expect(r.y).toBeGreaterThan(BOX.y); // 在框内
    expect(r.y + r.h).toBeLessThan(BOX.y + BOX.h);
  });

  test('outer: 标签整体落在框**上方**(底边不越框顶)', () => {
    const p = { ...BOX, label: LABEL, labelPlacement: 'outer' as const };
    const r = groupLabelRect(p)!;
    expect(r.y + r.h).toBeLessThanOrEqual(BOX.y); // 关键: 不压框线
    expect(r.x).toBeGreaterThanOrEqual(BOX.x - 0.01); // 仍与框左对齐
  });

  test('outer 与 inner 的缺省位移互不干扰(同一份入参换 placement 即换位)', () => {
    const inner = groupLabelRect({ ...BOX, label: LABEL })!;
    const outer = groupLabelRect({ ...BOX, label: LABEL, labelPlacement: 'outer' })!;
    expect(outer.y).toBeLessThan(inner.y);
  });

  test('labelInset 整体覆盖缺省(两种 placement 语义一致)', () => {
    const r = groupLabelRect({ ...BOX, label: LABEL, labelPlacement: 'outer', labelInset: [30, -40] })!;
    const fs = 12;
    expect(r.x).toBe(BOX.x + 30);
    // baseline = y + iy 的行中心; 盒顶 = baseline - 0.8em (central 折算含光学补偿)
    expect(r.y).toBeCloseTo(BOX.y - 40 + fs * 0.35 + OPTICAL_CENTRAL_FIX - fs * 0.8, 5);
    expect(r.h).toBeCloseTo(fs * 1.25, 5);
  });

  test('**摆放与审计同源**: 渲染出的 text 坐标就是 labelRect 推出来的那个', () => {
    for (const place of ['inner', 'outer'] as const) {
      const p = { ...BOX, label: LABEL, labelPlacement: place, theme: THEMES.light };
      const rect = groupLabelRect(p)!;
      const xy = renderedTextXY(groupShape(p))!;
      expect(xy.x).toBeCloseTo(rect.x, 1); // text 的 x 就是盒左缘
      expect(xy.y).toBeCloseTo(rect.y + 0.8 * 12, 1); // text 的 y 是基线 = 盒顶 + 0.8em
    }
  });

  test('labelWeight 影响宽度估算(measure 必须跟渲染用同一个 weight)', () => {
    const light = groupLabelRect({ ...BOX, label: LABEL, labelWeight: 400 })!;
    const bold = groupLabelRect({ ...BOX, label: LABEL, labelWeight: 700 })!;
    expect(bold.w).toBeGreaterThan(light.w);
  });

  test('无 label 时返回 null, 且不渲染 text', () => {
    expect(groupLabelRect(BOX)).toBeNull();
    expect(renderedTextXY(groupShape(BOX))).toBeNull();
  });

  test('组框标题经 textBlocks 进入审计视野(outer 位置也算)', () => {
    const scene = {
      width: 880,
      height: 700,
      nodes: [],
      edges: [],
      groups: [{ id: 'core', rect: BOX, label: LABEL, labelRect: groupLabelRect({ ...BOX, label: LABEL, labelPlacement: 'outer' })! }],
    };
    const blocks = textBlocks(scene);
    expect(blocks.length).toBe(1);
    expect(blocks[0].id).toBe('group-label:core');
    expect(blocks[0].content).toBe(LABEL);
  });

  test('只给 label 不给 labelRect 时, audit 看不见它(声明这个盲区, 而不是假装没问题)', () => {
    const scene = { width: 880, height: 700, nodes: [], edges: [], groups: [{ id: 'core', rect: BOX, label: LABEL }] };
    expect(textBlocks(scene).length).toBe(0);
  });
});
