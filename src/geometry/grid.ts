// =====================================================================
// grid · 均匀格子(只服务规则格子)
//
// 由来(260920 评估 §2.2): 排状图的位置此前只能一格一格手算 —— `X0 + col * PITCH` / `ROW_Y[row]`
// 反复出现在 lifecycle / port-folds 这类"其实是等距格"的图里。本文件把那份版式收成**一次声明 +
// 六个查询**: 格位 / 格心 / 格面 / 格区并集 / 两条缝的中线。scene 照旧全绝对坐标(查询在构建期
// 算一次, 结果由作者写死进 scene)。
//
// ── 边界(别在这里加) ────────────────────────────────────────────────
//   · **grid 不是默认版式** —— 依赖图 / harness 那种"层内视觉重量不等距"的图, 硬套 grid 会把作者
//     决策抹平。规则格子才用 grid, 有机图只在一个轴上 `pack`(第 3 步的 `pack.ts`)
//   · **不做参差格子** —— `cell` 只吃一个 `{ w, h }`;"每格不同尺寸"(`(c, r) => size`)以后再说
//   · 不设门禁、不校验入参(与 `box.ts` 同纪律: 查询算出坏数字, 由 `audit` / `finite_svg` 那层现形)。
//     `cols` / `rows` 是**正整数**; `gap` 缺省 0 = 密铺(那时"缝中线"就是相邻格共用的那条线)
//   · 不做 flex / grid 规范式 API(justify / minmax / auto-flow) —— 洞见文档 §六 第 2 条
//
// 依赖: `vec`(Rect / Pt / round1)与 `box`(`face` 复用 `rectFace`, 格心复用 `rectAnchor`) ——
// 后者又只读 `knives/route` 的 `portPoint` / `sideDir`, 即 README 分层段记的那条"有意例外"
// (面上的点只许一份; 锚点定义只许一份)。
//
// ⚠ 别与 `shapes/grid-pattern.ts` 混: 那个 `grid` 是**画布底纹**(SVG pattern, 不进 scene),
// 本文件的 `grid` 是**版式格子查询**(纯几何)。260920 底纹那份已改名 `grid-pattern` 让路。
// =====================================================================

import { type Pt, type Rect, round1 } from './vec';
import { type Size, rectAnchor, rectFace } from './box';
import type { Side } from '../knives/route';

export type GridOptions = {
  /** `cell(0, 0)` 的**左上角**(绝对坐标) */
  origin: Pt;
  /** 列数(正整数) */
  cols: number;
  /** 行数(正整数) */
  rows: number;
  /** 每格尺寸 -> 全格同一份(参差格子以后再说) */
  cell: Size;
  /** 格间缝(缺省 0 = 密铺): `x` 是列间距, `y` 是行间距 */
  gap?: { x?: number; y?: number };
};

export type GridQuery = {
  cols: number;
  rows: number;
  /**
   * 所有 cell 的并集 —— **不含外侧 gap**("格区"本身, 不是"格区再外扩一圈缝")。
   * 典型用法: 段盒 / 画布占位 / 接着走 `rectFace(g.bounds, 'top', { offset })` 取走廊。
   */
  bounds: Rect;
  /** 格位(`c` 从左数, `r` 从上数, 均从 0 起) */
  cell(c: number, r: number): Rect;
  /** 格心 */
  center(c: number, r: number): Pt;
  /** 格面上的点 + 沿朝外法线的 offset(`offset` 语义与 `rectFace` 完全一致) */
  face(c: number, r: number, side: Side, opts?: { t?: number; at?: number; offset?: number }): Pt;
  /** col `i` 与 col `i+1` 之间那条缝的**中线 x**(行间同理: `hGutter`) */
  vGutter(i: number): number;
  /** row `i` 与 row `i+1` 之间那条缝的**中线 y** */
  hGutter(i: number): number;
};

/**
 * 均匀格子: 一次声明格距与格尺寸, 之后所有"第几列第几行"的坐标都从它查。
 *
 * ```ts
 * const g = grid({ origin: { x: 64, y: 0 }, cols: 5, rows: 3, cell: { w: 192, h: 56 }, gap: { x: 48, y: 104 } });
 * g.cell(2, 1)                                    // 第 3 列第 2 行的格位
 * g.face(2, 1, 'bottom', { offset: 18 })          // 格底往外 18 = 出盒 stub 起点
 * rectFace(g.bounds, 'left', { offset: 112 }).x   // 格区左侧 112 处的竖向走廊(回流脊柱那种)
 * ```
 *
 * `vGutter` / `hGutter` 是**刻意保留**的两个查询: 缝中线是规则格子里**唯一无法从单个格推出**的
 * 常用量(`cell.y + cell.h + gap/2` 这种算术每来一个客户就手写一遍), 而段间隔线 / 走廊 y 正是它。
 * ⚠ 但 `hGutter` 给的是**缝的正中**, 作者若要在缝里排"线 + 标签 + 折线", 通常得再错开一点 ——
 * 别把它当"这里一定放得下"。
 */
export function grid(opts: GridOptions): GridQuery {
  const { origin, cols, rows, cell } = opts;
  const gapX = opts.gap?.x ?? 0;
  const gapY = opts.gap?.y ?? 0;
  const pitchX = cell.w + gapX;
  const pitchY = cell.h + gapY;

  const cellAt = (c: number, r: number): Rect => ({
    x: round1(origin.x + c * pitchX),
    y: round1(origin.y + r * pitchY),
    w: cell.w,
    h: cell.h,
  });

  return {
    cols,
    rows,
    // 并集直接给公式(首格左上就是 origin, 末格右下 = origin + (n-1) 个节距 + 格尺寸):
    // 走 min/max 逐格聚合只是把同一件事算得更慢, 且 gap 会被重复计入
    bounds: {
      x: origin.x,
      y: origin.y,
      w: round1((cols - 1) * pitchX + cell.w),
      h: round1((rows - 1) * pitchY + cell.h),
    },
    cell: cellAt,
    center: (c, r) => rectAnchor(cellAt(c, r), 'center'),
    face: (c, r, side, o) => rectFace(cellAt(c, r), side, o),
    // 缝中线 = 前一格的右边 + 半条缝(两侧对称, 与"后一格的左边 - 半条缝"同一个数)
    vGutter: (i) => round1(origin.x + i * pitchX + cell.w + gapX / 2),
    hGutter: (i) => round1(origin.y + i * pitchY + cell.h + gapY / 2),
  };
}
