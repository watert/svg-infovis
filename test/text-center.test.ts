// =====================================================================
// 文本垂直居中: `baselineY` 的折算(**纯公式**)
//
// 这件事被咬过两次, 两次都记在这里:
//   ① 260917 实拍: 节点框里主/次两行"看着偏下, 上面空一截"。真因是**两行行中心不对称**
//      (-5 / +11 → 均值 cy+3) —— 那是"摆两行"那一处的账, 不是折算层的账。
//   ② 同一轮还顺手在折算层加了个 `OPTICAL_CENTRAL_FIX = 1.2`(`central` 恒 +1.2px), 拿
//      "主标签 CJK + 次标签大写英文"那个**两行块**校准的。那份内容上它确实更准, 但它是
//      **内容依赖**的修正, 落进所有 central 站点共享的折算层之后, 单行场景(节点单标签 /
//      边标签遮罩片 / 旁注 / 组标题)统一被多推 1.2px。260925 移除, 折算层回到纯公式。
//
// 移除的判据是**量出来的墨心**(见下面那条回归用例): CJK 0.3555–0.3594em, 四档字号一致,
// 本来就落在 0.35em 的残差里 —— 加常数只会把每个单行场景一起推下去。
// =====================================================================

import { describe, expect, test } from 'bun:test';
import { THEMES, baselineY, nodeShape, svg, toSVG } from '../src/index';

/** 从渲染产物里按出现顺序取所有 text 的 y(黑盒, 不依赖 descriptor 内部结构) */
const textYs = (out: string): number[] => [...out.matchAll(/<text x="[-\.\d]+" y="([-\.\d]+)"/g)].map((m) => Number(m[1]));

/** 基线 → **行中心**(把折算反着走一遍) —— 居中的语义在行中心上 */
const lineCenter = (baseline: number, fs: number): number => baseline - fs * 0.35;

const renderNode = (p: Parameters<typeof nodeShape>[0]): string => toSVG(svg(400, 200, [nodeShape(p)], { 'font-family': 'inherit' }));

const BOX = { x: 100, y: 50, w: 200, h: 100 }; // cy = 100

describe('文本居中 · baselineY 折算(纯公式)', () => {
  test('central = y + 0.35em', () => {
    for (const fs of [11, 13, 16, 20]) {
      expect(baselineY(100, fs, 'central')).toBeCloseTo(100 + fs * 0.35, 6);
    }
  });

  test('回归: 折算层里不许出现全局 px 常量 —— 260917 那个 +1.2 加回去这里就红', () => {
    // 260925 调研(本机 rsvg 渲染后逐像素量墨迹, 不是估算值):
    //   CJK      11px **0.3580em** · 13px **0.3558em** · 16px **0.3555em** · 20px **0.3594em**
    //   大写英文  **0.3636em**
    //   小写英文  **0.3413em**
    // 三个结论: ① 墨心与 0.35em 的残差 ≤0.1px(亚像素, 看不出来);
    //          ② **四档字号一致** ⇒ 任何"与字号无关的 px 补偿"这种形态本身就不该存在;
    //          ③ 真有族差(小写 0.3413 偏低)也是改系数, 不是加常数 —— 而且那是**字族**的账,
    //             不该由共享折算层替某一份内容认领。
    for (const fs of [11, 13, 16, 20]) {
      // 精确相等(不是 closeTo): 公式里多一个常数项, 下面两条立刻现形 ——
      // 一条钉"与 y 平移同量", 一条钉"纯线性于 em、没有截距"
      expect(baselineY(100, fs, 'central')).toBe(100 + fs * 0.35);
      expect(baselineY(0, fs, 'central')).toBe(fs * 0.35);
    }
    // 截距检查: 把 200em 的跨度拉大, 任何 px 常量都会让这条差出 350 之外
    expect(baselineY(0, 1000, 'central') - baselineY(0, 0, 'central')).toBe(350);
  });

  test('baseline 与 hanging 是字面语义, 不受 central 口径影响', () => {
    expect(baselineY(100, 13, 'baseline')).toBe(100);
    expect(baselineY(100, 13, 'hanging')).toBeCloseTo(100 + 13 * 0.8, 6);
    expect(baselineY(100, 13)).toBe(100); // 缺省就是 baseline
    // 三档互不回填: hanging 不吃 central 的 0.35, central 也不吃 hanging 的 0.8
    expect(baselineY(100, 13, 'hanging')).toBe(100 + 13 * 0.8);
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

  test('折算值落进序列化结果(golden 可复算, 带 round1 + 两位小数)', () => {
    const out = renderNode({ ...BOX, label: 'X', fontSize: 13 });
    // 100 + 13*0.35 = 104.55 → round1 → 104.6 → 写进 SVG 为两位小数
    expect(out).toContain('y="104.60"');
  });

  test('主题不影响文字坐标(只换色)', () => {
    const light = textYs(renderNode({ ...BOX, label: 'X', sub: 'Y', theme: THEMES.light }));
    const dark = textYs(renderNode({ ...BOX, label: 'X', sub: 'Y', theme: THEMES.dark }));
    expect(dark).toEqual(light);
  });
});
