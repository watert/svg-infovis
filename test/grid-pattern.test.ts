// =====================================================================
// grid-pattern · 网格底纹(260920): 两种风格 · 层序 · 不进审计
//
// (文件名 260920 从 `grid` 改成 `grid-pattern` —— 原名与 `geometry/grid` 的版式格子撞车)
// 每条钉两件事(与 style-slots 同规矩):
//   · 能力: 该上屏的真上屏 —— 序列化出来的字节里读得到 pattern 与引用矩形
//   · 边界: 写错的旋钮当场抛, 不静默回落成"看着没事的另一种图"
// 写法的依据不在测试里, 在立项期那组十变体探针(rsvg / PDF / WebKit 三处同形)
// —— 改写法前把那组对照重跑一遍。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { exportScene, sceneChildren } from '../src/export';
import { createScene } from '../src/scene';
import { ShapeInputError } from '../src/guard';
import { serialize } from '../src/serialize';
import { THEMES } from '../src/theme';
import { GRID_ID, GRID_INK, gridLayer, gridPattern } from '../src/shapes/grid-pattern';

const geometry = {
  width: 420,
  height: 220,
  nodes: [{ id: 'a', rect: { x: 40, y: 40, w: 100, h: 60 }, label: 'A' }],
  edges: [],
};
const fresh = () => createScene(geometry, { bounds_source: 'layout' });
/** 把网格层单独序列化出来看字节(不经 audit, 免得门禁噪音遮住结构本身) */
const gridSVG = (props = {}) => gridLayer(420, 220, props).map((d) => serialize(d)).join('\n');

describe('grid-pattern · 网格底纹(两种风格 · 层序 · 不进审计)', () => {
  it('line 缺省: userSpaceOnUse 的 10px tile, 线走 tile 边界, stroke-width 是视觉线宽的 2 倍', () => {
    const svg = gridSVG();
    expect(svg).toContain(`<pattern id="${GRID_ID}" width="10.00" height="10.00" patternUnits="userSpaceOnUse">`);
    expect(svg).toContain('d="M0 0H10M0 0V10"');
    // 视觉线宽 1 ⇒ 声明 2(平铺裁掉 tile 外那半, 探针实测)
    expect(svg).toContain('stroke-width="2"');
    expect(svg).toContain('fill="url(#md-grid)"');
  });

  it('dot: 点落在 tile 中心(放角落会被裁掉四分之三), width 是直径', () => {
    const svg = gridSVG({ style: 'dot' });
    expect(svg).toContain('<circle cx="5.00" cy="5.00" r="1.00"');
    expect(svg).toContain('fill-opacity="0.2"');
    expect(svg).not.toContain('<path');
    // 直径 6 / 格距 14 ⇒ 半径 3
    expect(gridSVG({ style: 'dot', step: 14, width: 6 })).toContain('<circle cx="7.00" cy="7.00" r="3.00"');
  });

  it('格距与深浅: step 进 tile 与 d; 属性精度是 serialize 的 1 位小数口径(0.06 → 0.1)', () => {
    const svg = gridSVG({ step: 8, width: 0.5, opacity: 0.06 });
    expect(svg).toContain('width="8.00" height="8.00"');
    expect(svg).toContain('d="M0 0H8M0 0V8"');
    expect(svg).toContain('stroke-width="1"'); // 0.5 的 2 倍
    // 这条钉的不是能力而是**边界**: 深浅的可调档位只有 0.1 级 ——
    // 写 0.06 会被 round1 成 0.1(作者会以为没生效); 想更淡只能改 color, 字符串不过 round1
    expect(svg).toContain('stroke-opacity="0.1"');
  });

  it('配色: 缺省是中性灰 GRID_INK(不是主题组框色 —— 那个铺满底纹会压住整张图), color 顶掉它', () => {
    expect(GRID_INK).toBe('#999999');
    expect(serialize(gridPattern())).toContain(`stroke="${GRID_INK}"`);
    expect(serialize(gridPattern({ color: '#ff0000' }))).toContain('stroke="#ff0000"');
  });

  it('主题缺省: paper 自带细线格, light/dark 不设槽(那两档老产物字节不变)', () => {
    const s = fresh();
    const paper = exportScene(s, { theme: THEMES.paper }).svg;
    expect(paper).toContain(`<pattern id="${GRID_ID}"`);
    expect(paper).toContain(`stroke="${GRID_INK}"`);
    expect(exportScene(s, { theme: THEMES.light }).svg).not.toContain('<pattern');
    expect(THEMES.light.grid).toBeUndefined();
    expect(THEMES.dark.grid).toBeUndefined();
  });

  it('opts.grid 逐字段盖在主题上(只写要改的那位), `false` 显式关掉主题那层', () => {
    const s = fresh();
    const dot = exportScene(s, { theme: THEMES.paper, grid: { style: 'dot' } }).svg;
    expect(dot).toContain('<circle');              // 风格换了
    expect(dot).toContain('cx="5.00"');            // step 10 仍继承主题(点落在 tile 中心)
    expect(dot).toContain(`fill="${GRID_INK}"`);   // 墨色仍走缺省
    const off = exportScene(s, { theme: THEMES.paper, grid: false }).svg;
    expect(off).not.toContain('<pattern');
    expect(sceneChildren(s, { theme: THEMES.paper, grid: false })[1].kind).not.toBe('defs');
  });

  it('层序: 紧贴画布底色之上, 且在所有节点之前(底纹是地基不是图层)', () => {
    const children = sceneChildren(fresh(), { grid: {} });
    expect(children[0].kind).toBe('rect'); // 画布底色
    expect(children[1].kind).toBe('defs'); // 网格声明
    expect(children[2].kind).toBe('rect'); // 铺满画布的引用矩形
    const nodeAt = children.findIndex((c) => c.kind === 'group' && c.attrs?.['data-shape'] === 'node');
    expect(nodeAt).toBeGreaterThan(2);
    // 不给 grid 时层序回到老样子(defs 消失)
    expect(sceneChildren(fresh(), {})[1].kind).not.toBe('defs');
  });

  it('不参与审计: 加网格前后 report 逐字段相同(门禁只管信息, 不管地纹)', () => {
    const s = fresh();
    const plain = exportScene(s);
    const gridded = exportScene(s, { grid: { style: 'dot', step: 12 } });
    expect(gridded.report).toEqual(plain.report);
    expect(gridded.draft).toBe(plain.draft);
  });

  it('不开启时产物逐字节不变: 老图不认识这个功能', () => {
    const s = fresh();
    const plain = exportScene(s).svg;
    expect(plain).not.toContain('<pattern');
    expect(plain).not.toContain('url(#');
    // 同一份输入两次导出必须同字节(golden 的前提), 开网格也一样
    expect(exportScene(fresh()).svg).toBe(plain);
    expect(exportScene(fresh(), { grid: {} }).svg).toBe(exportScene(fresh(), { grid: {} }).svg);
  });

  it('守卫: 写错的风格 / 非正的尺寸 / 越界的线宽一律当场抛', () => {
    expect(() => gridPattern({ style: 'dots' as never })).toThrow(ShapeInputError);
    expect(() => gridPattern({ step: 0 })).toThrow(ShapeInputError);
    expect(() => gridPattern({ step: Number.NaN })).toThrow(ShapeInputError);
    expect(() => gridPattern({ width: 6, step: 10 })).toThrow(/超过半个格距|半格距/);
    expect(() => gridPattern({ style: 'dot', width: 12, step: 10 })).toThrow(/超过格距/);
    expect(() => gridLayer(Number.NaN, 100)).toThrow(ShapeInputError);
  });

  it('pattern id 可换: 同页多图各自给 id, 引用跟着走', () => {
    const svg = gridSVG({ id: 'grid-b' });
    expect(svg).toContain('<pattern id="grid-b"');
    expect(svg).toContain('fill="url(#grid-b)"');
  });

  it('origin: **显式给了才发射** `x`/`y`(不给则产物逐字节不变), 铺满那块矩形跟着它走', () => {
    // 缺省档: 那两个属性根本不出现 —— 老图与老快照的字节全靠这一条(实际用法见 style-lab 四格展平)
    expect(gridSVG()).toContain('patternUnits="userSpaceOnUse">');
    expect(gridSVG()).not.toContain('patternUnits="userSpaceOnUse" x=');
    // 给了: 相位原点与铺满矩形同时落在 (16, 46) —— 并排多块网格各钉回自己格角的前提
    const at = gridSVG({ origin: { x: 16, y: 46 } });
    expect(at).toContain('patternUnits="userSpaceOnUse" x="16" y="46"');
    expect(at).toContain('<rect x="16.00" y="46.00" width="420.00" height="220.00" rx="0.00" fill="url(#md-grid)"');
    // 尺寸类旋钮坏值不静默(与 step / width 同档)
    expect(() => gridPattern({ origin: { x: Number.NaN, y: 0 } })).toThrow(ShapeInputError);
    expect(() => gridPattern({ origin: { x: 0, y: Number.POSITIVE_INFINITY } })).toThrow(ShapeInputError);
  });
});
