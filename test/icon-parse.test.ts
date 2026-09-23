// =====================================================================
// icons/svg-parse · 素材 → 可渲染原语的**纯解析**
//
// 覆盖面是照实量出来的(260920, 1853 个 lucide 图标): 元素只用到
// path / circle / rect / line / ellipse / polyline / polygon —— 零 `<g>`、零 `transform`,
// 属性只有几何 + 20 处 `fill`。于是解析器**故意写窄**, 而"窄"的代价必须由**吵**来补:
// 见到不认识的元素 / `transform` / 没引号的属性, 当场抛, 并说清怎么改。
//
// 为什么不能静默跳过(这是本文件最要紧的一条): 跳过等于画出一个**少了几笔的图标**,
// 而图上没人看得出一根线丢了 —— 与"NaN 静默丢元素"同族的事故。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { ICON_PRIM_KINDS, type ParsedIcon, parseIconSvg, primsBounds } from '../src/icons/svg-parse';
import { ShapeInputError } from '../src/guard';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const wrap = (body: string, root = 'viewBox="0 0 24 24"') => `<svg xmlns="http://www.w3.org/2000/svg" ${root}>${body}</svg>`;

/** 一份含**全部七种**原语的素材(顺序即产物的 prims 顺序) */
const SEVEN = wrap(`
  <path d="M1 2 L3 4"/>
  <circle cx="5" cy="6" r="1"/>
  <rect x="7" y="8" width="2" height="3" rx="0.5"/>
  <ellipse cx="10" cy="11" rx="2" ry="1"/>
  <line x1="12" y1="13" x2="14" y2="15"/>
  <polyline points="16 17 18 19"/>
  <polygon points="20 21 22 21 22 23"/>
`);

const throws = (fn: () => unknown): ShapeInputError => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ShapeInputError);
    return e as ShapeInputError;
  }
  throw new Error('本该抛 ShapeInputError, 却没有');
};

describe('icons/svg-parse · 覆盖面', () => {
  it('七种几何元素都认, 且顺序即产物顺序', () => {
    const icon = parseIconSvg(SEVEN);
    expect(icon.prims.map((p) => p.kind)).toEqual([...ICON_PRIM_KINDS]);
  });

  it('元素几何进字段(不是塞成 path 字符串)', () => {
    const icon = parseIconSvg(SEVEN);
    const [p, c, r, e, l] = icon.prims;
    expect(p).toEqual({ kind: 'path', d: 'M1 2 L3 4', paint: undefined });
    expect(c).toEqual({ kind: 'circle', cx: 5, cy: 6, r: 1, paint: undefined });
    expect(r).toEqual({ kind: 'rect', x: 7, y: 8, w: 2, h: 3, rx: 0.5, ry: undefined, paint: undefined });
    expect(e).toEqual({ kind: 'ellipse', cx: 10, cy: 11, rx: 2, ry: 1, paint: undefined });
    expect(l).toEqual({ kind: 'line', x1: 12, y1: 13, x2: 14, y2: 15, paint: undefined });
    expect(icon.prims[5]).toEqual({ kind: 'polyline', points: '16 17 18 19', paint: undefined });
    expect(icon.prims[6]).toEqual({ kind: 'polygon', points: '20 21 22 21 22 23', paint: undefined });
  });

  it('rect 没写 x/y 时按 0(素材里很常见), 缺 width/height 才抛', () => {
    expect(parseIconSvg(wrap('<rect width="4" height="4"/>')).prims[0])
      .toEqual({ kind: 'rect', x: 0, y: 0, w: 4, h: 4, rx: undefined, ry: undefined, paint: undefined });
    expect(throws(() => parseIconSvg(wrap('<rect x="1" y="1"/>'))).message).toContain('width');
  });

  it('lucide 那种带换行缩进的完整文档照收(素材原文形态)', () => {
    const icon = parseIconSvg(`<?xml version="1.0"?>
<svg
  xmlns="http://www.w3.org/2000/svg"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
>
  <path d="M21.5 12H16" />
  <circle cx="12" cy="12" r="4" />
</svg>
`);
    expect(icon.prims).toHaveLength(2);
    expect(icon.strokeWidth).toBe(2);
  });

  it('lucide 根 <svg class="lucide lucide-*"> 不破窄解析器(class 禁令只管几何元素, 不管根)', () => {
    // 真实素材钉住: lucide-static 每个 SVG 根上都带 class(上游形态变了这条会先红)
    const req = createRequire(import.meta.url);
    const text = readFileSync(req.resolve('lucide-static/icons/plane.svg'), 'utf8');
    expect(text).toMatch(/<svg[^>]*class="lucide lucide-plane"/);
    const icon = parseIconSvg(text, { name: 'plane' });
    expect(icon.viewBox).toEqual({ x: 0, y: 0, w: 24, h: 24 });
    expect(icon.prims.length).toBeGreaterThan(0);
    // 边界两侧: 根带 class 照样过; 子元素带 class 仍抛(FORBIDDEN_ATTRS 只扫 primOf)
    expect(parseIconSvg('<svg viewBox="0 0 24 24" class="lucide lucide-x"><path d="M1 1"/></svg>').prims).toHaveLength(1);
    expect(() => parseIconSvg('<svg viewBox="0 0 24 24"><path d="M1 1" class="x"/></svg>')).toThrow(ShapeInputError);
  });
});

describe('icons/svg-parse · 坐标系与描边宽度', () => {
  it('viewBox 优先, 解析成四元数', () => {
    expect(parseIconSvg(wrap('<path d="M1 1"/>', 'viewBox="1 2 30 40"')).viewBox).toEqual({ x: 1, y: 2, w: 30, h: 40 });
  });

  it('没 viewBox 就退回 width/height(仍是"素材自己的坐标系"), 都没写才用 24×24', () => {
    expect(parseIconSvg(wrap('<path d="M1 1"/>', 'width="12" height="16"')).viewBox).toEqual({ x: 0, y: 0, w: 12, h: 16 });
    expect(parseIconSvg(wrap('<path d="M1 1"/>', '')).viewBox).toEqual({ x: 0, y: 0, w: 24, h: 24 });
  });

  it('viewBox 不是四个数 / 宽高非正 → 抛(坐标系没有面积就没法把图标缩进目标矩形)', () => {
    expect(throws(() => parseIconSvg(wrap('', 'viewBox="0 0 24"'))).field).toBe('svg.viewBox');
    expect(throws(() => parseIconSvg(wrap('<path d="M1 1"/>', 'viewBox="0 0 0 24"'))).field).toBe('svg.viewBox');
  });

  it('缺省描边宽度是 2(lucide 的口径), 写了就用它', () => {
    expect(parseIconSvg(wrap('<path d="M1 1"/>')).strokeWidth).toBe(2);
    expect(parseIconSvg(wrap('<path d="M1 1"/>', 'viewBox="0 0 24 24" stroke-width="1.5"')).strokeWidth).toBe(1.5);
  });
});

describe('icons/svg-parse · 逐元素画法覆盖', () => {
  it('只写真写了的字段(写了几个就是几个, 不铺缺省)', () => {
    expect(parseIconSvg(wrap('<path d="M1 1"/>')).prims[0].paint).toBeUndefined();
    expect(parseIconSvg(wrap('<path d="M1 1" fill="currentColor"/>')).prims[0].paint).toEqual({ fill: 'currentColor' });
    expect(parseIconSvg(wrap('<path d="M1 1" stroke-width="3"/>')).prims[0].paint).toEqual({ strokeWidth: 3 });
    expect(parseIconSvg(wrap('<line x1="0" y1="0" x2="1" y2="1" fill="none" stroke="#f00"/>')).prims[0].paint)
      .toEqual({ fill: 'none', stroke: '#f00' });
  });
});

describe('icons/svg-parse · 不认识的输入当场抛(不静默少画几笔)', () => {
  it('`<g>` → 抛, 并指明要先把结构拍平', () => {
    const e = throws(() => parseIconSvg(wrap('<g><path d="M1 1 L2 2"/></g>')));
    expect(e.field).toBe('g[0]');
    expect(e.message).toContain('拍平');
  });

  it('`<text>` / `<use>` 这类非几何元素同样抛', () => {
    expect(throws(() => parseIconSvg(wrap('<text x="1" y="1">a</text>'))).field).toBe('text[0]');
    expect(throws(() => parseIconSvg(wrap('<use href="#x"/>'))).field).toBe('use[0]');
  });

  it('`transform` → 抛(解析器不做坐标变换; 静默忽略会让图标画歪而没人看得出)', () => {
    const e = throws(() => parseIconSvg(wrap('<path d="M1 1" transform="scale(2)"/>')));
    expect(e.field).toBe('path[0].transform');
    expect(e.message).toContain('烘进坐标');
  });

  it('`opacity` / `style` / `class` 这类"画得不对却说不出哪里不对"的属性也抛', () => {
    for (const bad of ['opacity="0.5"', 'style="fill:red"', 'class="x"', 'clip-path="url(#a)"']) {
      expect(() => parseIconSvg(wrap(`<path d="M1 1" ${bad}/>`))).toThrow(ShapeInputError);
    }
  });

  it('属性必须带引号(`width=24` 会让坐标读错值)', () => {
    const e = throws(() => parseIconSvg(wrap('<path d="M1 1"/>', 'viewBox="0 0 24 24" width=24')));
    expect(e.field).toBe('svg');
    expect(e.message).toContain('width=24');
  });

  it('没有 <svg> 根 / 一个几何元素都没有 → 抛(空素材画出来是空气, 而 audit 不会报)', () => {
    expect(throws(() => parseIconSvg('<path d="M1 1"/>')).field).toBe('svg');
    expect(throws(() => parseIconSvg(wrap(''))).message).toContain('一个几何元素都没有');
  });

  it('path 没有 d / points 缺失 → 抛, 不是画一条看不见的线', () => {
    expect(throws(() => parseIconSvg(wrap('<path fill="none"/>'))).field).toBe('path[0].d');
    expect(throws(() => parseIconSvg(wrap('<polyline/>'))).field).toBe('polyline[0].points');
  });
});

describe('icons/svg-parse · primsBounds(对账用)', () => {
  it('可数原语的并集包围盒', () => {
    // circle(4..6, 5..7) / rect(7..9, 8..11) / ellipse(8..12, 10..12) / line(12..14, 13..15)
    // polyline(16..18, 17..19) / polygon(20..22, 21..23) ⇒ x:4..22, y:5..23
    expect(primsBounds(parseIconSvg(SEVEN).prims)).toEqual({ x: 4, y: 5, w: 18, h: 18 });
  });

  it('全是 path 时返回 null(算 path 的边界要真解析 d, 那个活不在这)', () => {
    expect(primsBounds(parseIconSvg(wrap('<path d="M1 1 L9 9"/>')).prims)).toBeNull();
  });
});

describe('icons/svg-parse · 产出是纯数据', () => {
  it('`ParsedIcon` 可 JSON 往返(它要进 scene, scene 必须能逐字节 diff)', () => {
    const icon: ParsedIcon = parseIconSvg(SEVEN, { name: 'seven' });
    expect(JSON.parse(JSON.stringify(icon))).toEqual(icon);
    expect(icon.name).toBe('seven');
    // 没给名字就不写这一位(不铺一个 `name: undefined` 出来)
    expect('name' in parseIconSvg(SEVEN)).toBe(false);
  });
});
