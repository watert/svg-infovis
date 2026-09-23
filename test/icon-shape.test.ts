// =====================================================================
// shapes/icon · 图标怎么进图(矩形归约 + 坐标全烘进产物)
//
// 三条设计决定, 每条都在这里钉住:
//   ① **坐标全部烘进产物, 不用 `<transform>`** —— 与"不写 dominant-baseline、自己算基线"同一条
//      纪律: 产物里每个坐标都该是真坐标, 于是 audit / describe / 人读 diff 看到的是同一份几何。
//      `<g transform="scale(3)">` 一挂, 门禁量的是外层矩形、眼睛看的是缩放后的墨迹 —— 经典的漂。
//   ② **图标占的正是一个矩形**(`iconRect`), 且画在盒**正上方** —— 于是 `contentBounds`(auto-fit
//      不裁图标)与 `describeScene`(读数板看得到它)直接吃得下, 且 `cardFit` 能把
//      "图标 + 间隙 + 卡片"一次性反算成一个块高。
//   ③ **描边宽度用素材自己的单位**(lucide = 2), 渲染值 = 素材值 × 缩放比。做成像素口径的话,
//      换个尺寸就得重算描边, 而"这套图标多粗"是**整套素材**的属性。
//
// 门禁边界(明确说清): 图标**不进任何净空门禁** —— 与 `struck` 叉线 / 网格底纹同一档。
// 想让图标与别的格子保持距离, 用 `cardFit` 的 `block` 留位(那是作者决策)。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { ICON_DEFAULTS, iconInkRect, iconRect, iconShape } from '../src/shapes/icon';
import { type IconAsset, iconAsset, iconFromFile, iconFromSvg } from '../src/icons/lucide';
import { type Attrs, type Descriptor, type DGroup } from '../src/descriptor';
import { parsePathData } from '../src/icons/path-data';
import { ShapeInputError } from '../src/guard';
import { createRequire } from 'node:module';

/** lucide-static 深路径裸解析(该包 package.json 无 exports, 故可用 —— 见 assets/icons/ICON_SOURCE.md) */
const require = createRequire(import.meta.url);

/** 非正方形素材(6×8) —— contain 缩放不许把它拉变形 */
const TALL = iconFromSvg('<svg viewBox="0 0 6 8"><circle cx="3" cy="4" r="1"/></svg>', 'tall');

/** 与 parse 侧同一份七元素素材(这里验的是"画得出来") */
const wrap7 = (): string => `<svg viewBox="0 0 24 24">
  <path d="M1 2 L3 4"/><circle cx="5" cy="6" r="1"/>
  <rect x="7" y="8" width="2" height="3" rx="0.5"/>
  <ellipse cx="10" cy="11" rx="2" ry="1"/>
  <line x1="12" y1="13" x2="14" y2="15"/>
  <polyline points="16 17 18 19"/><polygon points="20 21 22 21 22 23"/>
</svg>`;

/** 把一个图标画进 100×100 的方框; 返回描述符与它唯一的子元素 */
const drawTall = (color?: string, strokeWidth?: number): { g: DGroup; c: { cx: number; cy: number; r: number } } => {
  const g = iconShape({ x: 100, y: 200, w: 100, h: 100, asset: TALL, color, strokeWidth });
  const c = g.children[0];
  if (c.kind !== 'circle') throw new Error('素材的圆形应该原样吐成 circle');
  return { g, c };
};

/** 断言并窄化: 测试里到处要读 `.attrs`, 手写 `if (d.kind !== '...') throw` 太吵 */
const desc = (d: Descriptor): { attrs?: Attrs } => {
  if (!('attrs' in d)) throw new Error(`期望带 attrs 的 descriptor, 拿到 ${d.kind}`);
  return d as { attrs?: Attrs };
};

const throws = (fn: () => unknown): ShapeInputError => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ShapeInputError);
    return e as ShapeInputError;
  }
  throw new Error('本该抛 ShapeInputError, 却没有');
};

describe('shapes/icon · 矩形归约', () => {
  it('iconRect = 盒的**正上方**(水平居中, 底边离盒顶 gap)', () => {
    expect(iconRect({ x: 100, y: 100, w: 200, h: 50 })).toEqual({
      x: 100 + (200 - ICON_DEFAULTS.size) / 2,
      y: 100 - ICON_DEFAULTS.gap - ICON_DEFAULTS.size,
      w: ICON_DEFAULTS.size,
      h: ICON_DEFAULTS.size,
    });
    expect(iconRect({ x: 100, y: 200, w: 255, h: 102 }, { size: 110, gap: 14 }))
      .toEqual({ x: 172.5, y: 76, w: 110, h: 110 });
  });

  it('gap = 0 时图标正好贴住盒顶(间隙是尺寸不是增量)', () => {
    expect(iconRect({ x: 0, y: 100, w: 100, h: 20 }, { size: 64, gap: 0 }).y).toBe(36);
  });

  it('守卫: size ≤ 0 / gap < 0 当场抛(负值是尺寸写反, 不是"小一点")', () => {
    expect(throws(() => iconRect({ x: 0, y: 0, w: 10, h: 10 }, { size: 0 })).field).toBe('size');
    expect(throws(() => iconRect({ x: 0, y: 0, w: 10, h: 10 }, { size: -8 })).field).toBe('size');
    expect(throws(() => iconRect({ x: 0, y: 0, w: 10, h: 10 }, { gap: -1 })).field).toBe('gap');
  });

  it('iconInkRect = 图标 ∪ 盒(图标比盒宽时取图标宽, 反之取盒宽)', () => {
    // 图标 110 窄于盒宽 255: 并集 = 盒宽 × (图标高 + 间隙 + 盒高)
    expect(iconInkRect({ x: 100, y: 200, w: 255, h: 102 }, { size: 110, gap: 14 }))
      .toEqual({ x: 100, y: 76, w: 255, h: 226 });
    // 图标 200 宽于盒宽 40: 并集吃图标宽(图标水平居中 ⇒ 比盒左右各探出 80)
    expect(iconInkRect({ x: 100, y: 200, w: 40, h: 20 }, { size: 200, gap: 10 }))
      .toEqual({ x: 20, y: -10, w: 200, h: 230 });
  });
});

describe('shapes/icon · 缩放与坐标', () => {
  it('contain 缩放: 非正方形素材不被拉变形, 且在目标框里居中', () => {
    // 6×8 进 100×100: s = min(100/6, 100/8) = 12.5 → 落成 75×100, 水平居中(左移 12.5)
    const { c } = drawTall();
    expect(c.cx).toBe(150); // 100 + 12.5 + 3×12.5
    expect(c.cy).toBe(250); // 200 + 0 + 4×12.5
    expect(c.r).toBe(12.5); // 1 × 12.5
  });

  it('坐标全烘进产物: 没有 transform, 每一笔都是真坐标', () => {
    const { g } = drawTall();
    expect(JSON.stringify(g)).not.toContain('transform');
    // 组的缺省画法挂在**外层**(逐笔再写一遍就是七份重复事实)
    expect(g.attrs?.['data-shape']).toBe('icon');
    expect(g.attrs?.fill).toBe('none');
    expect(g.attrs?.['stroke-linecap']).toBe('round');
    expect(g.attrs?.['stroke-linejoin']).toBe('round');
  });

  it('描边宽度 = 素材单位 × 缩放比(素材 2 → 100×100 下 25)', () => {
    // 6×8 进 100×100 ⇒ s = 12.5; 素材没声明 stroke-width ⇒ 缺省 2
    expect(drawTall().g.attrs?.['stroke-width']).toBe(25);
    // 作者给的素材单位值同样乘缩放(1 → 12.5)
    expect(drawTall(undefined, 1).g.attrs?.['stroke-width']).toBe(12.5);
  });

  it('描边色缺省走 theme.edge; 给了就用给的', () => {
    expect(drawTall().g.attrs?.stroke).toBe('#64748b');
    expect(drawTall('#334155').g.attrs?.stroke).toBe('#334155');
  });

  it('素材里的 `currentColor` 跟随作者给的颜色, 显式颜色原样写进产物', () => {
    const mat = iconFromSvg('<svg viewBox="0 0 24 24"><path d="M1 1 L2 2" fill="currentColor"/><path d="M3 3 L4 4" stroke="#f00"/></svg>');
    const g = iconShape({ x: 0, y: 0, w: 24, h: 24, asset: mat, color: '#123456' });
    expect(desc(g.children[0]).attrs?.fill).toBe('#123456');
    expect(desc(g.children[1]).attrs?.stroke).toBe('#f00');
  });

  it('七种原语各有去路: 椭圆与折线串都归成 path(descriptor 不为它们加 kind)', () => {
    const mat = iconFromSvg(wrap7());
    const g = iconShape({ x: 0, y: 0, w: 24, h: 24, asset: mat });
    expect(g.children.map((c) => c.kind)).toEqual(['path', 'circle', 'rect', 'path', 'path', 'path', 'path']);
  });
});

describe('shapes/icon · 入口守卫', () => {
  it('asset 不是一份素材(空值 / 少 prims / 少 viewBox) → 抛, 不是画空气', () => {
    expect(throws(() => iconShape({ x: 0, y: 0, w: 10, h: 10, asset: undefined as unknown as IconAsset })).field).toBe('asset');
    expect(throws(() => iconShape({ x: 0, y: 0, w: 10, h: 10, asset: {} as unknown as IconAsset })).field).toBe('asset');
  });

  it('box 不是有限矩形 → 抛(与其余 shapes 同一道守卫)', () => {
    expect(() => iconShape({ x: NaN, y: 0, w: 10, h: 10, asset: TALL })).toThrow(ShapeInputError);
  });
});

describe('shapes/icon · 墨迹必须落在自己的矩形里(260920 事故的回归钉)', () => {
  /**
   * 走一遍 `d` 还原**端点的绝对坐标**(独立的走法: `mapPathData` 负责改写, 这里负责还原 ——
   * 两边写错法不同才会互相照出来)。只收端点是刻意的: 控制点可以落在曲线外侧, 收进来只会让盒虚胖。
   */
  const absPoints = (d: string): Array<[number, number]> => {
    const pts: Array<[number, number]> = [];
    let cx = 0, cy = 0;
    for (const { cmd, args } of parsePathData(d)) {
      const rel = cmd !== cmd.toUpperCase();
      const up = cmd.toUpperCase();
      const at = (i: number): [number, number] => (rel ? [cx + args[i], cy + args[i + 1]] : [args[i], args[i + 1]]);
      switch (up) {
        case 'M': case 'L': case 'T':
          for (let i = 0; i < args.length; i += 2) { [cx, cy] = at(i); pts.push([cx, cy]); }
          break;
        case 'H': for (const v of args) { cx = rel ? cx + v : v; pts.push([cx, cy]); } break;
        case 'V': for (const v of args) { cy = rel ? cy + v : v; pts.push([cx, cy]); } break;
        case 'C': for (let i = 0; i < args.length; i += 6) { [cx, cy] = at(i + 4); pts.push([cx, cy]); } break;
        case 'S': case 'Q': for (let i = 0; i < args.length; i += 4) { [cx, cy] = at(i + 2); pts.push([cx, cy]); } break;
        case 'A': for (let i = 0; i + 6 < args.length; i += 7) { [cx, cy] = at(i + 5); pts.push([cx, cy]); } break;
        case 'Z': break;
      }
    }
    return pts;
  };

  /** 一个图标全部笔画(含 path / circle / rect…)的墨迹包围盒 */
  const inkBox = (g: DGroup): { x0: number; y0: number; x1: number; y1: number } => {
    const pts: Array<[number, number]> = [];
    for (const c of g.children) {
      if (c.kind === 'path') pts.push(...absPoints(c.d));
      else if (c.kind === 'circle') pts.push([c.cx - c.r, c.cy - c.r], [c.cx + c.r, c.cy + c.r]);
      else if (c.kind === 'rect') pts.push([c.x, c.y], [c.x + c.w, c.y + c.h]);
    }
    return {
      x0: Math.min(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])),
      x1: Math.max(...pts.map((p) => p[0])), y1: Math.max(...pts.map((p) => p[1])),
    };
  };

  // 覆盖三种素材形态: 纯 path / path+circle / path+rect+circle
  for (const name of ['plane', 'radio-tower', 'badge-check', 'timer-reset', 'plane-takeoff']) {
    it(`${name}: 墨迹中心贴着自己那个矩形(而不是素材原点), 且真的撑开`, () => {
      const size = 110;
      const rect = { x: 400, y: 300, w: size, h: size };
      const g = iconShape({ ...rect, asset: iconAsset(name) });
      const box = inkBox(g);
      const center = { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 };
      // 容差 15% —— lucide 的画不是"填满 24×24 的对称形"(timer-reset 偏 13.8, plane-takeoff 偏 8.1),
      // 而"画在素材原点"时中心会偏掉 ~size/2 ≈ 43, 比容差大三倍: 这条断言分得开两种情况
      const tol = size * 0.15;
      expect(Math.abs(center.x - (rect.x + size / 2))).toBeLessThan(tol);
      expect(Math.abs(center.y - (rect.y + size / 2))).toBeLessThan(tol);
      expect(box.x1 - box.x0).toBeGreaterThan(size * 0.4);
      expect(box.y1 - box.y0).toBeGreaterThan(size * 0.4);
    });
  }
});

describe('icons/lucide · 素材库加载器', () => {
  it('iconAsset 读出真素材(lucide-static), viewBox 全是 24×24', () => {
    const plane = iconAsset('plane');
    expect(plane.name).toBe('plane');
    expect(plane.viewBox).toEqual({ x: 0, y: 0, w: 24, h: 24 });
    expect(plane.prims.length).toBeGreaterThan(0);
    // 缓存: 同一个名字两次拿到**同一个对象**
    expect(iconAsset('plane')).toBe(plane);
  });

  it('名字打错 → 抛, 并给候选(别让调用方对着 ~1848 个名字猜)', () => {
    const e = throws(() => iconAsset('aeroplane-xyz'));
    expect(e.field).toBe('name');
    expect(e.message).toContain('可能想找');
  });

  it('iconFromFile: 任意本地 SVG 文件同样能进(相对 / 绝对都收)', () => {
    const icon = iconFromFile(require.resolve('lucide-static/icons/plane-takeoff.svg'));
    expect(icon.name).toBe('plane-takeoff');
    expect(icon.prims.length).toBeGreaterThan(0);
    expect(throws(() => iconFromFile('/tmp/definitely-missing-$$$.svg')).field).toBe('file');
  });

  it('iconFromSvg 与素材库走**同一个**解析器(约束一字不差)', () => {
    expect(() => iconFromSvg('<svg viewBox="0 0 24 24"><g><path d="M1 1"/></g></svg>')).toThrow(ShapeInputError);
  });
});
