// =====================================================================
// 文本垂直居中: `baselineY` 折算 + CJK 光学补偿
// 起因(260917 实拍): 节点框里主/次两行"看着偏下, 上面空一截"。
// 两个独立缺陷叠在一起:
//   ① 两行行中心 -5 / +11 → 均值 cy+3(不对称);
//   ② `central = 0.35em` 是西文经验值, 中文 ink 重心比它高 → 纯对称后仍偏 1.5px。
// 像素量测见 scripts 里的临时校验(11/13/16 三档), 这里钉住可复算的数学部分。
// =====================================================================

import { describe, expect, test } from 'bun:test';
import {
  OPTICAL_CENTRAL_FIX,
  THEMES,
  baselineY,
  nodeShape,
  svg,
  toSVG,
} from '../src/index';

/** 从渲染产物里按出现顺序取所有 text 的 y(黑盒, 不依赖 descriptor 内部结构) */
const textYs = (out: string): number[] => [...out.matchAll(/<text x="[-\.\d]+" y="([-\.\d]+)"/g)].map((m) => Number(m[1]));

/** 基线 → **行中心**(把折算反着走一遍, 含光学补偿) —— 居中的语义在行中心上 */
const lineCenter = (baseline: number, fs: number): number => baseline - fs * 0.35 - OPTICAL_CENTRAL_FIX;

const renderNode = (p: Parameters<typeof nodeShape>[0]): string => toSVG(svg(400, 200, [nodeShape(p)], { 'font-family': 'inherit' }));

const BOX = { x: 100, y: 50, w: 200, h: 100 }; // cy = 100

describe('文本居中 · baselineY 折算与 CJK 光学补偿', () => {
  test('central = 0.35em + 光学补偿(常数 px)', () => {
    for (const fs of [11, 13, 16, 20]) {
      expect(baselineY(100, fs, 'central')).toBeCloseTo(100 + fs * 0.35 + OPTICAL_CENTRAL_FIX, 6);
    }
  });

  test('baseline 与 hanging 不被光学补偿污染(字面语义)', () => {
    expect(baselineY(100, 13, 'baseline')).toBe(100);
    expect(baselineY(100, 13, 'hanging')).toBeCloseTo(100 + 13 * 0.8, 6);
    expect(baselineY(100, 13)).toBe(100); // 缺省就是 baseline
  });

  test('主/次两行的**行中心**对称于框中心(曾不对称: -5/+11 → 均值 +3)', () => {
    const fs = 13;
    const ys = textYs(renderNode({ ...BOX, label: 'ROUTE', sub: 'SUB', fontSize: fs }));
    expect(ys.length).toBe(2);
    // 两行字号不同(size / size-2), 所以比较的是**行中心**而不是基线
    const mid = (lineCenter(ys[0], fs) + lineCenter(ys[1], fs - 2)) / 2;
    expect(mid).toBeCloseTo(100, 1);
  });

  test('单标签: 基线正落在框中心折算处', () => {
    const ys = textYs(renderNode({ ...BOX, label: 'ROUTE', fontSize: 13 }));
    expect(ys.length).toBe(1);
    expect(ys[0]).toBeCloseTo(baselineY(100, 13, 'central'), 1);
  });

  test('两行间距随字号走(1.25em), 字号大时不挤在一起', () => {
    const gap = (fs: number) => {
      const ys = textYs(renderNode({ ...BOX, label: 'A', sub: 'B', fontSize: fs }));
      return ys[1] - ys[0];
    };
    expect(gap(20)).toBeGreaterThan(gap(11));
    // 行中心间隔 = 1.25em; 副标签字号小 2 → 换算成**基线差**要再减 2*0.35
    // 精度用 0: 两个 y 各自 round1 过, 差的误差可达 0.1
    expect(gap(13)).toBeCloseTo(13 * 1.25 - 2 * 0.35, 0);
  });

  test('光学补偿落进了序列化结果(golden 可复算, 带 round1 + 两位小数)', () => {
    const out = renderNode({ ...BOX, label: 'X', fontSize: 13 });
    // 100 + 13*0.35 + 1.2 = 105.75 → round1 → 105.8 → 写进 SVG 为两位小数
    expect(out).toContain('y="105.80"');
  });

  test('主题不影响文字坐标(只换色)', () => {
    const light = textYs(renderNode({ ...BOX, label: 'X', sub: 'Y', theme: THEMES.light }));
    const dark = textYs(renderNode({ ...BOX, label: 'X', sub: 'Y', theme: THEMES.dark }));
    expect(dark).toEqual(light);
  });
});
