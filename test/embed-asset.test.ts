// =====================================================================
// embed/svg-asset · 整幅外部 SVG → 素材(解析 / 消毒 / 命名空间化)
//
// 这一层是**渲染面的入口**, 所以判据都是"要么完整地对, 要么当场抛" ——
// 静默丢一块等于画出一张**缺了几块**的图, 而图上没人看得出(与"NaN 静默丢元素"同族)。
// 三条钉在这里: ① fail-closed 名单逐条 ② `<style>` 全 `:hover` 才准丢、丢了要记进 `dropped`
// ③ 前缀不同则两份素材的 id 不撞(真样本跑, 因为"串台"只在两份同时上屏时才现形)。
//
// 真样本 = `assets/embeds/echarts-*.svg`(立项期用 echarts 的 SSR 出图脚本生成, 已一并冻进仓),
// 用它们而不是自造片段: 素材的真实形态(`<g clip-path>` / `matrix(…)` / `<style><![CDATA[`)才有覆盖。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { embedAsset } from '../src/embed/svg-asset';
import { ShapeInputError } from '../src/guard';

const EMBEDS = fileURLToPath(new URL('../assets/embeds/', import.meta.url));
const sample = (name: string): string => readFileSync(join(EMBEDS, `${name}.svg`), 'utf8');

const wrap = (body: string, root = 'viewBox="0 0 100 50"'): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${root}>${body}</svg>`;

/** 素材里定义的 id / 被引用的 id(两份素材撞不撞看这两组) */
const idsOf = (markup: string): string[] => [...markup.matchAll(/(?<![\w-])id="([^"]*)"/g)].map((m) => m[1]);
const refsOf = (markup: string): string[] => [...markup.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]);

const throws = (fn: () => unknown): ShapeInputError => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ShapeInputError);
    return e as ShapeInputError;
  }
  throw new Error('本该抛 ShapeInputError, 却没有');
};

describe('embed/svg-asset · 素材解析 / 消毒 / 命名空间化', () => {
  // --- 解析与坐标系 ---------------------------------------------------
  it('根 viewBox 就是素材自己的坐标系', () => {
    expect(embedAsset(wrap('<circle cx="1" cy="1" r="1"/>')).viewBox).toEqual({ x: 0, y: 0, w: 100, h: 50 });
    expect(embedAsset(wrap('<circle r="1"/>', 'viewBox="0 0 100.06 50.04"')).viewBox).toEqual({ x: 0, y: 0, w: 100.1, h: 50 });
  });

  it('viewBox 缺省时退回 width/height(带单位也认), 两者都拿不到 → 抛', () => {
    expect(embedAsset(wrap('<circle cx="1" cy="1" r="1"/>', 'width="12" height="16px"')).viewBox)
      .toEqual({ x: 0, y: 0, w: 12, h: 16 });
    const e = throws(() => embedAsset(wrap('<circle cx="1" cy="1" r="1"/>', '')));
    expect(e.field).toBe('svg.viewBox');
    expect(e.message).toContain('width/height');
  });

  it('viewBox 不是四个数 / 宽高非正 → 抛(坐标系没有面积就没法映射进宿主矩形)', () => {
    expect(throws(() => embedAsset(wrap('<circle r="1"/>', 'viewBox="0 0 100"'))).field).toBe('svg.viewBox');
    expect(throws(() => embedAsset(wrap('<circle r="1"/>', 'viewBox="0 0 0 50"'))).field).toBe('svg.viewBox');
  });

  it('没有 <svg> 根 / 没有闭合 </svg> → 抛(别把截断的输出当成素材)', () => {
    expect(throws(() => embedAsset('<rect width="1" height="1"/>')).field).toBe('svg');
    expect(throws(() => embedAsset('<svg viewBox="0 0 10 10"><rect width="1" height="1"/>')).field).toBe('svg');
  });

  it('markup 是根之内的内部标记(不含外层 <svg>), 只裁掉整段首尾空白', () => {
    const a = embedAsset('<?xml version="1.0"?>\n<svg\n  viewBox="0 0 100 50"\n>\n  <rect x="1" y="2" width="3" height="4"/>\n</svg>\n');
    expect(a.markup.startsWith('<rect')).toBe(true);
    expect(a.markup.endsWith('/>')).toBe(true);
    expect(a.markup).not.toContain('<svg');
  });

  it('产出是纯数据: JSON 往返; 没给名字就不写这一位', () => {
    const a = embedAsset(wrap('<rect width="1" height="1"/>'), { name: 'panel' });
    expect(a.name).toBe('panel');
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
    expect('name' in embedAsset(wrap('<rect width="1" height="1"/>'))).toBe(false);
  });

  it('根上没搬走的属性记进 dropped(声明噪声不算: 它说的是"这是 SVG 文档", 不是画什么)', () => {
    const a = embedAsset(wrap('<rect width="1" height="1"/>', 'viewBox="0 0 100 50" transform="scale(2)" style="x:y"'));
    expect(a.dropped.some((d) => d.includes('style, transform'))).toBe(true);
    // 真样本的根上只有 xmlns / xmlns:xlink / version / baseProfile ⇒ 全噪声, 不记
    expect(embedAsset(sample('echarts-bar'), { name: 'bar' }).dropped.some((d) => d.includes('根 <svg>'))).toBe(false);
  });

  // --- 命名空间化(防串台) --------------------------------------------
  it('id / url(#…) / class 逐名 / 内部 href 都加前缀', () => {
    const a = embedAsset(wrap(`
      <defs><clipPath id="c0"><rect width="4" height="4"/></clipPath></defs>
      <g clip-path="url(#c0)" class="zr a"><rect width="2" height="2" class="only"/></g>
      <a href="#c0">t</a>
    `), { name: 'p' });
    expect(a.markup).toContain('id="p-c0"');
    expect(a.markup).toContain('clip-path="url(#p-c0)"');
    expect(a.markup).toContain('class="p-zr p-a"');
    expect(a.markup).toContain('class="p-only"');
    expect(a.markup).toContain('href="#p-c0"');
    // 没加前缀的 id 一个都不许剩(否则就是串台的入口)
    expect(a.markup).not.toMatch(/["#]c0"/);
  });

  it('`url( #x )` 带空白也认; `data-id` 这类复合名不动', () => {
    expect(embedAsset(wrap('<rect width="1" height="1" fill="url( #x )"/>'), { name: 'p' }).markup).toContain('url(#p-x)');
    expect(embedAsset(wrap('<rect width="1" height="1" data-id="keep"/>'), { name: 'p' }).markup).toContain('data-id="keep"');
  });

  it('前缀: 缺省 = `name-`, 名字都不给 = `emb-`; `idPrefix` 覆盖名字', () => {
    expect(embedAsset(wrap('<rect width="1" height="1" class="c"/>'), { name: 'chart' }).markup).toContain('class="chart-c"');
    expect(embedAsset(wrap('<rect width="1" height="1" class="c"/>')).markup).toContain('class="emb-c"');
    expect(embedAsset(wrap('<rect width="1" height="1" class="c"/>'), { name: 'chart', idPrefix: 'left.' }).markup)
      .toContain('class="left.c"');
  });

  it('同一样本两份素材: 前缀不同 ⇒ id 不撞, 每份的引用都落在自己那份定义上(真样本)', () => {
    const a = embedAsset(sample('echarts-line'), { name: 'left' });
    const b = embedAsset(sample('echarts-line'), { name: 'right' });
    expect(idsOf(a.markup)).toEqual(['left-zr1-c0']);
    expect(idsOf(b.markup)).toEqual(['right-zr1-c0']);
    expect(idsOf(a.markup).filter((id) => idsOf(b.markup).includes(id))).toEqual([]);
    expect(refsOf(a.markup)).toEqual(['left-zr1-c0']);
    expect(refsOf(b.markup)).toEqual(['right-zr1-c0']);
    // 前缀相同 = 串台的入口 —— 这条不判"对错", 只钉住"为什么两份必须给不同前缀"
    expect(refsOf(embedAsset(sample('echarts-line'), { name: 'left' }).markup)).toEqual(refsOf(a.markup));
  });

  // --- `<style>`: 全 hover 才准丢 -------------------------------------
  it('全 hover ⇒ 整块丢掉, 并记进 dropped(带块数), 产物里再没有 <style>', () => {
    const a = embedAsset(wrap('<style ><![CDATA[\n.a:hover {\ncursor:pointer;\n}\n.b:hover {\nfill:red;\n}\n]]></style><rect width="1" height="1" class="a"/>'));
    expect(a.markup).not.toContain('<style');
    expect(a.dropped).toHaveLength(1);
    expect(a.dropped[0]).toContain('1 个');
    expect(a.dropped[0]).toContain('2 条规则');
    expect(a.dropped[0]).toContain(':hover');
  });

  it('非 hover 规则 → 抛(静默丢样式等于悄悄改观感), 报错里带那条规则与怎么改', () => {
    const e = throws(() => embedAsset(wrap('<style>.a { fill: red; }</style><rect width="1" height="1"/>')));
    expect(e.field).toBe('style');
    expect(e.message).toContain('.a');
    expect(e.message).toContain(':hover');
    // 块里有几条规则都过关才丢整块 —— 一条坏就整份不落地
    expect(throws(() => embedAsset(wrap('<style>.a:hover{fill:red}\n.b{fill:blue}</style><rect width="1" height="1"/>'))).field)
      .toBe('style');
  });

  it('真样本的 style 全是 hover ⇒ 丢掉且观感不变(4 种图型逐一核)', () => {
    for (const n of ['echarts-bar', 'echarts-line', 'echarts-pie', 'echarts-scatter']) {
      const a = embedAsset(sample(n), { name: n });
      expect(a.markup).not.toContain('<style');
      expect(a.dropped.some((d) => d.includes('全是 :hover'))).toBe(true);
    }
  });

  // --- fail-closed 名单 ------------------------------------------------
  it('脚本 / 内嵌 HTML / 位图 / 引用别处定义 / 事件属性: 一个都不许静默放过', () => {
    const cases: Array<[string, string]> = [
      ['<script>alert(1)</script>', 'script'],
      ['<foreignObject width="1" height="1"><div/></foreignObject>', 'foreignObject'],
      ['<iframe src="a.html"/>', 'iframe'],
      ['<image href="./a.png" width="1" height="1"/>', 'image'],
      ['<use href="#x"/>', 'use'],
      ['<rect width="1" height="1" onclick="go()"/>', 'on*'],
    ];
    for (const [body, field] of cases) {
      const e = throws(() => embedAsset(wrap(body, 'viewBox="0 0 10 10"')));
      expect(e.field).toBe(field);
      expect(e.message.length).toBeGreaterThan(20);
    }
  });

  it('指向文档外的 href(含 data: / 协议相对) → 抛: 产物换台机器就画不出来', () => {
    for (const v of ['http://a/b.svg#x', 'https://a/b', '//cdn/b.svg', 'data:image/png;base64,AAA']) {
      const e = throws(() => embedAsset(wrap(`<a href="${v}">t</a>`, 'viewBox="0 0 10 10"')));
      expect(e.field).toBe('href');
      expect(e.message).toContain('内联');
    }
    // 内部引用是合法的(它会被加前缀)
    expect(embedAsset(wrap('<a href="#tgt">t</a><rect id="tgt" width="1" height="1"/>')).markup).toContain('href="#emb-tgt"');
  });

  // --- 出口纪律: 字节确定 + 真样本整份可过 -------------------------------
  it('字节确定: 同一份输入两次逐字节相同(真样本)', () => {
    const once = embedAsset(sample('echarts-scatter'), { name: 'scatter' });
    const twice = embedAsset(sample('echarts-scatter'), { name: 'scatter' });
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });

  it('真样本(echarts-line)整份可过: clipPath / <g clip-path> / matrix / text 全在且都加了前缀', () => {
    const a = embedAsset(sample('echarts-line'), { name: 'chart' });
    expect(a.viewBox).toEqual({ x: 0, y: 0, w: 420, h: 260 });
    expect(a.markup).toContain('<clipPath id="chart-zr1-c0">');
    expect(a.markup).toContain('<g clip-path="url(#chart-zr1-c0)">');
    expect(a.markup).toContain('transform="matrix(3,0,0,3,44,146.4)"');
    expect(a.markup).toContain('class="chart-zr1-cls-5"');
    // `<text>` 的内部一个字都没动(它的首尾空白会影响渲染, 见 serialize 那条注释)
    expect(a.markup).toContain('transform="translate(44 236)" fill="#6E7079">Q1</text>');
    expect(a.markup).not.toMatch(/<text[^>]*>[^<]*\n[^<]*<\/text>/);
  });
});
