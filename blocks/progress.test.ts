// =====================================================================
// blocks/progress · 进度条 / 比例条的判据
//
// 钉六件事:
//   ① **块契约** —— 主出口吐 `{ shape, bounds }`, 且 `bounds` 是**墨迹盒**: 拿它喂 `packCol` 摆完
//      再回填一次, 画出来的盒与摆的盒逐位相同(幂等 = "能被当一个盒直接摆"的落地判据)
//   ② **比例的几何** —— 填充段恒在轨道**内**(四边各缩一个线宽), 长度 = 条内区宽 × ratio;
//      ratio 0 是合法状态(只画轨道), ratio 1 恰好顶到条内区右缘。期望值一律现算, 不抄字面量
//   ③ **两条圆角画法同几何** —— 四角同值走 `rect` 的 rx, 单侧帽走 `radiusPolygonPath`; 帽的
//      "哪两角圆"映射拿共享解算器现算对账(改了映射, 这里当场红)
//   ④ **色调是一条阶梯 + 轨道不随档位变** —— `tint` / `outline` / `solid` 取三个不同的槽;
//      轨道的取色只吃 outline 档, 三档下逐字节相同
//   ⑤ **不做数值推断** —— ratio 越界 / 堆叠合计 > 1 当场抛, 不 clamp 不归一化; 浮点尾数不误伤
//   ⑥ **字节确定** —— 同输入逐字节同输出, 换 ratio / 换主题真改字节, 且产物里没有 NaN
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { PROGRESS_LABEL_PLACES, PROGRESS_LAYOUT, type ProgressProps, progressBlock, stackedBarBlock } from './progress';
import { type DGroup, type DPath, type DRect, type DText, baselineY, svg } from '../src/descriptor';
import { toSVG } from '../src/serialize';
import { type Rect, fmt, round1 } from '../src/geometry/vec';
import { bounds } from '../src/geometry/box';
import { packCol } from '../src/geometry/pack';
import { radiusPolygonPath } from '../src/geometry/rounded-path';
import { measureText } from '../src/knives/measure';
import { DEFAULT_THEME, THEMES, type TonePalette, type Variant } from '../src/theme';
import { ShapeInputError } from '../src/guard';

const W = 240;
const RATIO = 0.68;
const LABEL = '读盘 68%';
const AT = { x: 40, y: 100 };
const SW = PROGRESS_LAYOUT.trackWidth;
/** 一条条的声明: 位置 + 满额宽 + 比例, 逐条用例再盖自己的那几位(文案 / 档位 / 条高) */
const P = (o: Partial<ProgressProps> = {}): ProgressProps => ({ ...AT, w: W, ratio: RATIO, ...o });

const labelBox = (text: string) => measureText(text, { fontSize: PROGRESS_LAYOUT.labelFontSize, weight: PROGRESS_LAYOUT.labelWeight });
const innerOf = (bar: Rect): Rect => ({ x: round1(bar.x + SW), y: round1(bar.y + SW), w: round1(bar.w - 2 * SW), h: round1(bar.h - 2 * SW) });
const rectsOf = (g: DGroup): DRect[] => g.children.filter((c): c is DRect => c.kind === 'rect');
const pathsOf = (g: DGroup): DPath[] => g.children.filter((c): c is DPath => c.kind === 'path');
const textsOf = (g: DGroup): DText[] => g.children.filter((c): c is DText => c.kind === 'text');
const rectPoints = (r: Rect) => [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }];
/** 段的两条画法: 四角同值走 rect 的 rx, 单侧帽走共享解算器 —— 期望值现算 */
const capPath = (r: Rect, c: readonly [number, number, number, number]) => radiusPolygonPath(rectPoints(r), (i) => c[i]).d;
/** 从 d 里取 M / L 的**端点**(弧的半径与 flag 不是坐标, 不参与对账) */
const ptsOf = (d: string): { x: number; y: number }[] =>
  [...d.matchAll(/([ML])\s+(-?[\d.]+)\s+(-?[\d.]+)/g)].map((m) => ({ x: Number(m[2]), y: Number(m[3]) }));

const throws = (fn: () => unknown): ShapeInputError => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ShapeInputError);
    return e as ShapeInputError;
  }
  throw new Error('本该抛 ShapeInputError, 却没有');
};

describe('blocks/progress · 进度条 / 堆叠比例条', () => {
  it('块契约: bounds 是墨迹盒(标签在上方时包住标签), 且拿它重放一次幂等', () => {
    const lb = labelBox(LABEL);
    const b = progressBlock(P({ label: LABEL }));
    const wantBar = { x: AT.x, y: round1(AT.y + lb.height + PROGRESS_LAYOUT.labelGap), w: W, h: PROGRESS_LAYOUT.barH };
    const wantLabel = { x: AT.x, y: AT.y, w: lb.width, h: lb.height };
    expect(b.bar).toEqual(wantBar);
    expect(b.label).toEqual(wantLabel);
    // 并集 = 标签行盒 ∪ 条盒(公式只此一份: `geometry/box` 的 `bounds`)
    expect(b.bounds).toEqual(bounds([wantBar, wantLabel])!);
    expect(b.bounds.x).toBe(AT.x); // 左端恒是条左缘 ⇒ 幂等的前提
    // 幂等: 拿 bounds 原样重放(声明与摆放同一口径)
    const replay = progressBlock(P({ label: LABEL, y: b.bounds.y }));
    expect(replay.bounds).toEqual(b.bounds);
    expect(replay.shape).toEqual(b.shape);
    // 标签比条还宽: 盒向右长(左端仍是条左缘), 再重放一次还是同一个盒
    const wide = progressBlock(P({ w: 40, ratio: 0.5, label: LABEL }));
    const wlb = labelBox(LABEL);
    expect(wide.bounds.w).toBe(Math.max(40, wlb.width));
    expect(wide.bounds.w).toBeGreaterThan(40);
    expect(wide.bounds.x).toBe(AT.x);
    expect(progressBlock({ ...AT, w: 40, ratio: 0.5, label: LABEL, y: wide.bounds.y }).bounds).toEqual(wide.bounds);
    // 无标签: 盒就是条本身(高度回到条高)
    const bare = progressBlock(P());
    expect(bare.bounds).toEqual(bounds([bare.bar])!);
    expect(bare.bounds.h).toBe(PROGRESS_LAYOUT.barH);
    expect(textsOf(bare.shape).length).toBe(0);
  });

  it('块契约: bounds 能直接喂 packCol —— 摆完回填, 画出来的盒与摆的盒逐位相同', () => {
    // 三种块: 有 / 无标签, 缺省条高 / 加粗的条(盒高是**推导结果**, 两种都验)
    const props: ProgressProps[] = [P({ ratio: 0.3, label: 'A' }), P({ ratio: 0.6, barH: 24 }), P({ ratio: 1, label: 'C 条' })];
    const probes = props.map((p) => progressBlock({ ...p, x: 0, y: 0 }));
    const col = packCol({ items: probes.map((b) => b.bounds), gap: 24, x: AT.x, y0: AT.y, align: 'start' });
    // 把摆好的盒摊回 props(这是 `statShape` / `listRowShape` 共用的那种写法): 盒高不在 props 里,
    // 全靠 barH 推导 —— 所以摊回来之后逐位相同才是真闭环
    const placed = props.map((p, i) => progressBlock({ ...p, ...col.rects[i] }));
    placed.forEach((b, i) => expect(b.bounds).toEqual(col.rects[i]));
    // 一列的高度 = 各块墨迹高之和 + 两条缝(块与块之间一个都不叠)
    expect(col.bounds!.h).toBe(round1(probes.reduce((a, b) => a + b.bounds.h, 0) + 2 * 24));
  });

  it('填充段: 恒在轨道内(四边各缩一个线宽), 长度 = 条内区宽 × ratio; ratio 0 只画轨道', () => {
    const b = progressBlock(P());
    const inner = innerOf(b.bar);
    expect(b.fill).toEqual({ x: inner.x, y: inner.y, w: round1(inner.w * RATIO), h: inner.h });
    // 内缩的证据: 四边各一个线宽(轨道描边骑在边上, 不缩就会被填充吃掉里面那一半)
    expect(b.fill!.x - b.bar.x).toBe(SW);
    expect(b.fill!.y - b.bar.y).toBe(SW);
    expect(round1(b.bar.w - (b.fill!.w + 2 * SW))).toBe(round1(inner.w * (1 - RATIO)));
    // ratio 1: 恰好顶到条内区右缘(填充的分母是"能填的那段", 与肉眼读到的满额一致)
    const full = progressBlock(P({ ratio: 1 }));
    expect(round1(full.fill!.x + full.fill!.w)).toBe(round1(full.bar.x + full.bar.w - SW));
    // ratio 0 是**合法状态**(0% 完成), 只是没有墨迹: 只有一个轨道元素
    const zero = progressBlock(P({ ratio: 0 }));
    expect(zero.fill).toBeUndefined();
    expect(zero.shape.children.length).toBe(1);
    expect(rectsOf(zero.shape)[0]).toEqual(expect.objectContaining({ w: W }));
    // 收边: 画出来的那个 rect 与交出去的 `fill` 是同一份数(量的一个盒、画的另一个盒 = 老病)
    const drawn = rectsOf(b.shape)[1];
    expect({ x: drawn.x, y: drawn.y, w: drawn.w, h: drawn.h }).toEqual(b.fill!);
    expect(rectsOf(b.shape)[0]).toEqual(expect.objectContaining({ ...b.bar, rx: PROGRESS_LAYOUT.radius }));
  });

  it('圆角: 四角同值走 rect 的 rx(轨道 / 填充内缩一个线宽同心); 作者给 0 = 直角', () => {
    const b = progressBlock(P());
    const [track, fill] = rectsOf(b.shape);
    expect(track.rx).toBe(PROGRESS_LAYOUT.radius);
    expect(fill.rx).toBe(PROGRESS_LAYOUT.radius - SW);
    const square = progressBlock(P({ radius: 0 }));
    expect(rectsOf(square.shape).every((r) => r.rx === undefined)).toBe(true);
    // 半径超过半高 / 半宽: 不在这里另立一份 clamp —— rx 原样写出, 由渲染器按 SVG 规范夹
    // (`rect` 的 rx 与 `cornerAt` 的 tDist 夹的是同一对边, 见 `segmentOf` 的注释)
    const fat = progressBlock(P({ radius: 99 }));
    expect(rectsOf(fat.shape)[0].rx).toBe(99);
    expect(rectsOf(fat.shape)[1].rx).toBe(99 - SW);
  });

  it('两条圆角画法同几何: 单侧帽走 radiusPolygonPath, "哪两角圆"的映射拿共享解算器对账', () => {
    const ratios = [0.6, 0.4];
    const tones = ['blue', 'emerald'] as const;
    const s = stackedBarBlock({ ...AT, w: 300, barH: 12, ratios: [...ratios], tones: [...tones] });
    // 轨道仍是 rect(四角同值), 两段各是一条路径(单侧帽 / 右帽)
    expect(rectsOf(s.shape).length).toBe(1);
    expect(pathsOf(s.shape).length).toBe(2);
    const capR = round1(PROGRESS_LAYOUT.radius - SW);
    const [first, last] = [s.segments[0], s.segments[1]];
    expect(pathsOf(s.shape)[0].d).toBe(capPath(first, [capR, 0, 0, capR]));
    expect(pathsOf(s.shape)[1].d).toBe(capPath(last, [0, capR, capR, 0]));
    // 帽贴在段的外侧边缘: 首段的最左点就是段左缘(圆角把角磨掉, 但不会把墨迹挪出段外)
    expect(Math.min(...ptsOf(pathsOf(s.shape)[0].d).map((p) => p.x))).toBe(first.x);
    // 直角那两侧落在段的右缘上(半径 0 的凸角 = 共享解算器的一条零长弧, 渲染等价于直线)
    expect(pathsOf(s.shape)[0].d).toContain(`A ${fmt(0)} ${fmt(0)}`);
    expect(Math.max(...ptsOf(pathsOf(s.shape)[1].d).map((p) => p.x))).toBe(round1(last.x + last.w));
    // 单段堆叠(首末同一段)四角同值 ⇒ 退回 rect, 不出路径
    const one = stackedBarBlock({ ...AT, w: 300, barH: 12, ratios: [1], tones: ['blue'] });
    expect(pathsOf(one.shape).length).toBe(0);
    expect(rectsOf(one.shape).length).toBe(2);
  });

  it('tone × variant 是一条深浅阶梯, 而**轨道不随档位变**(轨道是容器, 三档下逐字节相同)', () => {
    const VARIANTS: Variant[] = ['tint', 'outline', 'solid'];
    /** 填充段的取色档(与 `FILL_SLOT` 同一张表): 期望值从**主题槽**现算, 不抄色值 */
    const slot: Record<Variant, (p: TonePalette) => string> = { tint: (p) => p.tint, outline: (p) => p.border, solid: (p) => p.solidBg };
    const fills = VARIANTS.map((variant) => {
      const b = progressBlock(P({ variant, tone: 'blue' }));
      const [track, fill] = rectsOf(b.shape);
      // 三档取三个**不同**的槽(阶梯真的在)
      expect(fill.attrs?.fill).toBe(slot[variant](DEFAULT_THEME.tones.blue));
      // 轨道: 恒是 outline 档的 surface / border, 与档位无关
      expect(track.attrs?.fill).toBe(DEFAULT_THEME.tones.blue.surface);
      expect(track.attrs?.stroke).toBe(DEFAULT_THEME.tones.blue.border);
      expect(track.attrs?.['stroke-width']).toBe(SW);
      expect(fill.attrs?.stroke).toBe('none');
      return fill.attrs?.fill as string;
    });
    expect(new Set(fills).size).toBe(VARIANTS.length);
    // 主题换档跟着走(不是写死的色值); 单点覆盖优先
    const dark = rectsOf(progressBlock(P({ variant: 'solid', tone: 'blue', theme: THEMES.dark })).shape)[1];
    expect(dark.attrs?.fill).toBe(THEMES.dark.tones.blue.solidBg);
    expect(rectsOf(progressBlock(P({ fill: '#b91c1c' })).shape)[1].attrs?.fill).toBe('#b91c1c');
    // 堆叠条: 每段吃自己的 tone(同一档位), 轨道取**中性** slate(不让第一段当主角)
    const s = stackedBarBlock({ ...AT, w: 300, ratios: [0.5, 0.5], tones: ['blue', 'rose'], variant: 'solid' });
    expect(pathsOf(s.shape).map((p) => p.attrs?.fill)).toEqual([DEFAULT_THEME.tones.blue.solidBg, DEFAULT_THEME.tones.rose.solidBg]);
    expect(rectsOf(s.shape)[0].attrs?.stroke).toBe(DEFAULT_THEME.tones.slate.border);
  });

  it('堆叠条: 段宽 = 条内区宽 × 比例, 段与段紧贴; 合计 1 顶满, 合计 < 1 留余量', () => {
    const ratios = [0.55, 0.28, 0.17];
    const tones = ['blue', 'emerald', 'slate'] as const;
    const s = stackedBarBlock({ ...AT, w: W, barH: 16, ratios: [...ratios], tones: [...tones], variant: 'solid' });
    const inner = innerOf(s.bar);
    expect(s.bounds).toEqual(bounds([s.bar])!);
    expect(s.segments.length).toBe(ratios.length); // 与 ratios 同序同长(第几段在哪一一对应)
    s.segments.forEach((sg, i) => {
      expect(sg.w).toBe(round1(inner.w * ratios[i]));
      expect(sg.h).toBe(inner.h);
      if (i) expect(sg.x).toBe(round1(s.segments[i - 1].x + s.segments[i - 1].w)); // 紧贴: 不给缝
    });
    // 合计 = 1 ⇒ 末段右缘恰好落在条内区右缘(各段自己取整不会裂缝 / 叠上)
    expect(round1(s.segments[2].x + s.segments[2].w)).toBe(round1(inner.x + inner.w));
    // 余量: 合计 < 1 时末段右缘在条内区右缘**之内** —— kernel 不补尾差(归一化是作者的事)
    const partial = stackedBarBlock({ ...AT, w: W, ratios: [0.5, 0.25], tones: ['blue', 'slate'] });
    const pInner = innerOf(partial.bar);
    expect(round1(partial.segments[1].x + partial.segments[1].w)).toBeLessThan(round1(pInner.x + pInner.w));
    // 浮点尾数不误伤(0.55 + 0.3 + 0.15 在双精度下 > 1)
    expect(() => stackedBarBlock({ ...AT, w: W, ratios: [0.55, 0.3, 0.15], tones: ['blue', 'emerald', 'slate'] })).not.toThrow();
  });

  it('零比例的段不上屏但占位, 圆角帽落到**真画出来的**首末段上', () => {
    const s = stackedBarBlock({ ...AT, w: 300, ratios: [0, 0.6, 0.4], tones: ['blue', 'emerald', 'slate'] });
    expect(s.segments.length).toBe(3);
    expect(s.segments[0].w).toBe(0);
    // 上屏元素 = 轨道 + 两个有墨迹的段(零段没有元素)
    expect(s.shape.children.length).toBe(3);
    const inner = innerOf(s.bar);
    expect(s.segments[1].x).toBe(inner.x); // 零段没吃掉位置(它宽 0)
    const capR = round1(PROGRESS_LAYOUT.radius - SW);
    expect(pathsOf(s.shape)[0].d).toBe(capPath(s.segments[1], [capR, 0, 0, capR]));
    // 全零 = 只有轨道(合法的"什么都还没开始")
    const none = stackedBarBlock({ ...AT, w: 300, ratios: [0, 0], tones: ['blue', 'slate'] });
    expect(none.shape.children.length).toBe(1);
    expect(none.segments.every((sg) => sg.w === 0)).toBe(true);
  });

  it('标签: 两档位置(above 左对齐条左缘 / inside 骑条心), 行内标记走 `shapes/inline`', () => {
    const lb = labelBox(LABEL);
    const above = textsOf(progressBlock(P({ label: LABEL })).shape)[0];
    expect(above.x).toBe(AT.x);
    expect(above.attrs?.['text-anchor']).toBeUndefined(); // start 是 SVG 缺省, 不写这一位
    expect(above.y).toBe(baselineY(round1(AT.y + lb.height / 2), PROGRESS_LAYOUT.labelFontSize, 'central'));
    expect(above.attrs?.fill).toBe(DEFAULT_THEME.label);
    expect(above.attrs?.['font-size']).toBe(PROGRESS_LAYOUT.labelFontSize);
    // inside: 骑条心; 条要高到装得下行盒(`barH` 缺省 12 装不下, 那是当场抛, 见下一条)
    const H = Math.ceil(lb.height + 2 * PROGRESS_LAYOUT.labelPadY);
    const inside = progressBlock(P({ barH: H, label: LABEL, labelAt: 'inside' }));
    const t = textsOf(inside.shape)[0];
    expect(t.x).toBe(round1(inside.bar.x + inside.bar.w / 2));
    expect(t.attrs?.['text-anchor']).toBe('middle');
    expect(inside.bounds.h).toBe(H); // 标签在条内 ⇒ 盒不被它撑高
    expect(labelBox(LABEL).width + 2 * PROGRESS_LAYOUT.labelPadX).toBeLessThanOrEqual(W);
    // 行内标记: 度量面认它, 上屏也认它(`<tspan>` 两段, 纯文本内容守恒)。
    // ⚠ 本块标签的**基准字重是 600**(`NODE_TEXT_LAYOUT.weight`), 而加宽判据是"≥600 档" ⇒ 在 600
    // 底上再写 `**` **宽度不变** —— 不是标记没生效(下面 `<tspan>` 那两条钉着它生效了), 是那一档
    // 已经吃满了 3% 的推进宽; 400 底上就看得出差
    const marked = '**读盘** 68%';
    expect(measureText(marked, { fontSize: PROGRESS_LAYOUT.labelFontSize }).width)
      .toBeGreaterThan(measureText('读盘 68%', { fontSize: PROGRESS_LAYOUT.labelFontSize }).width);
    expect(labelBox(marked).width).toBe(labelBox('读盘 68%').width);
    const mt = textsOf(progressBlock(P({ label: marked })).shape)[0];
    expect(mt.spans?.length).toBe(2);
    expect(mt.content).toBe('读盘 68%');
    // 词表两档都是合法输入(`PROGRESS_LABEL_PLACES` 是运行时值与类型同源的那一份)
    for (const at of PROGRESS_LABEL_PLACES) {
      expect(() => progressBlock(P({ barH: 24, label: '68%', labelAt: at }))).not.toThrow();
    }
  });

  it('坏输入当场抛: 比例越界 / 坏盒 / 词表外的档与位 / 装不下的标签与条身 —— 一条都不静默通过', () => {
    // 比例: 越界**不 clamp**(clamp 会把"55 写成 55%"静默画成满条)
    for (const ratio of [1.2, -0.1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(throws(() => progressBlock(P({ ratio }))).field).toBe('ratio');
    }
    expect(throws(() => progressBlock(P({ ratio: undefined as unknown as number }))).field).toBe('ratio');
    // 盒: 0 宽 / 负宽 / NaN(与 `assertFiniteRect` 同一口径)
    expect(throws(() => progressBlock(P({ w: 0 }))).field).toBe('w');
    expect(throws(() => progressBlock(P({ w: -(W) }))).field).toBe('w');
    expect(throws(() => progressBlock(P({ x: Number.NaN }))).field).toBe('x');
    expect(throws(() => progressBlock(P({ y: Number.NaN }))).field).toBe('y');
    expect(throws(() => progressBlock(P({ w: undefined as unknown as number }))).field).toBe('w');
    expect(throws(() => progressBlock(P({ barH: 0 }))).field).toBe('barH');
    expect(throws(() => progressBlock(P({ radius: -2 }))).field).toBe('radius');
    // 词表: 写错的档位 / 位置会静默回落成缺省观感
    expect(throws(() => progressBlock(P({ tone: 'purple' as never }))).field).toBe('tone');
    expect(throws(() => progressBlock(P({ variant: 'shadow' as never }))).field).toBe('variant');
    expect(throws(() => progressBlock(P({ label: LABEL, labelAt: 'sideways' as never }))).field).toBe('labelAt');
    // 写了却不上屏: 给了 labelAt 却没有字
    expect(throws(() => progressBlock(P({ labelAt: 'inside' }))).field).toBe('labelAt');
    // 条内标签装不下: 条不够宽 / 不够高 —— 图上是"字压在轨道边上 / 探出条外", 不是观感问题
    expect(throws(() => progressBlock(P({ label: LABEL, labelAt: 'inside' }))).field).toBe('label');
    expect(throws(() => progressBlock(P({ w: 60, barH: 24, label: LABEL, labelAt: 'inside' }))).field).toBe('label');
    // 条身装不下轨道(线宽两侧各吃一个) ⇒ 给"关掉轨道"这条真修法
    expect(throws(() => progressBlock(P({ barH: 2 * SW }))).field).toBe('barH');
    expect(throws(() => progressBlock(P({ w: 2 * SW }))).field).toBe('w');
    expect(() => progressBlock(P({ barH: 2 * SW, track: false }))).not.toThrow();
    // 堆叠条: 空数组 / 两列长度不符 / 元素越界 / 合计 > 1(不归一化, 也不替作者缩)
    expect(throws(() => stackedBarBlock({ ...AT, w: W, ratios: [], tones: [] })).field).toBe('ratios');
    expect(throws(() => stackedBarBlock({ ...AT, w: W, ratios: [0.5], tones: ['blue', 'rose'] })).field).toBe('tones');
    expect(throws(() => stackedBarBlock({ ...AT, w: W, ratios: [1.4], tones: ['blue'] })).field).toBe('ratios[0]');
    expect(throws(() => stackedBarBlock({ ...AT, w: W, ratios: [0.5], tones: ['purple' as never] })).field).toBe('tones[0]');
    expect(throws(() => stackedBarBlock({ ...AT, w: W, ratios: [0.5, 0.6], tones: ['blue', 'rose'] })).field).toBe('ratios');
    expect(() => stackedBarBlock({ ...AT, w: W, ratios: [0.5, 0.5], tones: ['blue', 'rose'] })).not.toThrow();
  });

  it('字节确定: 同输入逐字节同输出, 换比例 / 换主题真改字节, 产物里没有 NaN', () => {
    const one = () => toSVG(svg(400, 200, [
      progressBlock(P({ w: 300, ratio: 0.68, label: LABEL, tone: 'blue', variant: 'solid' })).shape,
      stackedBarBlock({ ...AT, w: 300, ratios: [0.4, 0.35, 0.25], tones: ['blue', 'emerald', 'slate'] }).shape,
    ]));
    expect(one()).toBe(one());
    expect(one()).toContain('data-shape="progress"');
    expect(one()).toContain('data-shape="stacked-bar"');
    expect(one()).not.toContain('NaN');
    // 换个比例 / 换个主题必须真改字节(否则上面那条"相等"可能是"什么都没画"的假绿)
    expect(one()).not.toBe(toSVG(svg(400, 200, [progressBlock(P({ w: 300, ratio: 0.5, label: LABEL })).shape])));
    const dark = toSVG(svg(400, 200, [progressBlock(P({ w: 300, theme: THEMES.dark })).shape]));
    expect(dark).not.toContain('NaN');
    expect(dark).not.toContain(DEFAULT_THEME.tones.slate.surface);
  });
});
