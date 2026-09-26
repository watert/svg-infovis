// =====================================================================
// pack · 摆放列 / 摆放行(构建期把一串盒摞起来或铺开)
//
// 由来(260920 评估 §2.3): "把 N 个盒依次摞 / 排"这件事此前散成手写算术 —— `y + h + 40`、
// `(w1 - w2) / 2`、`156 + i * STEP`。它们全是**纯加法与取中**, 却每个客户各写一遍。本文件收成
// 两个入口: `packCol`(竖排)与 `packRow`(横排), 输入是尺寸列(`nodeFit` / `cardFit` 的返回),
// 输出是摆好的绝对坐标 `rects` + 并集 `bounds`(直接喂 `bounds()` 加 pad 就是组框)。
//
// ── 分工(三条边界, 别越) ──────────────────────────────────────────────
//   · **与 `grid` 分工**: 两轴都等距的规则格子 → `grid`; 只在**一个轴**上等距(尺寸参差也行)
//     → `pack`。有机图(层内视觉重量不等距)不许硬套 grid, 但一个轴上 pack 是安全的
//   · **与 `nudge` 分工**: pack 是**构建期造 rect**(造出来就是最终坐标); nudge 是**已有 rect
//     事后微移**(align / distribute / snap 一条边)。两件事, 不合并 —— 合并会让"这个坐标是哪来的"
//     失去单一答案
//   · **与旧 TODO 的 `pack_row` 无关**: 那个名字是 blink 时代的"冻结图进 CI 的 HTML 行打包",
//     撞名而已(评估文 §五 明写: 另开, 不复活)
//
// 明确不做: flex / grid 规范式 API(justify / minmax / auto-flow / wrap) —— `align` 只有三档,
// 主轴间距只有两个说法(缝 / 节距)。嵌套坐标系同样不做(输出全是绝对坐标, 与 `box` / `grid`
// 同一立场)。
//
// ── 主轴间距: `gap` 与 `pitch`(260925 加) ─────────────────────────────
//   手写里同一个意思有两种心智, 而此前只有 `gap` 一档:
//     · `gap: 40` —— **缝**: 前一项的尾到后一项的头(full-chain 的两条 stub 之间那段)
//     · 手写 `gap: 100 - BOX.h` —— 心里想的是**节距**(`pitch`): 前缘到前缘(`156 + i * STEP`
//       那一族)。现在直接写 `pitch: 100`, 换算 `gap_i = pitch − extent_i`
//   `gap` 另允许**逐项给**(数组, 长度 = `items.length − 1`): 三段 y 链缝 38 / 58 参差时,
//   单值表达不了(basic.ts 实测)。
//   **四项结构性错误当场抛**(节距与缝同给 / 一项不给 / 某项尺寸超节距 / 缝数组长度不符或为负):
//   它们算不出"看着还行"的结果, 只会在图上留个重叠或错位的坑。而 items 的尺寸值本身照旧
//   **不拦**(与 `box` / `grid` 同纪律: 算出来是多少就是多少, 由 `audit` / `finite_svg` 现形)。
//
// 依赖: `vec`(Rect / round1)、`box` 的 `bounds`(并集只许一份公式)与 `guard` 的守卫原语
// (结构性错误的报错口径与 `resolveKnobs` / `assertFiniteRect` 同源)。pack 自己不算面上的点。
// =====================================================================

import { type Rect, round1 } from './vec';
import { type Size, bounds } from './box';
import { HINT_KNOB_SIZE, ShapeInputError, assertFiniteNumber } from '../guard';

/** 交叉轴对齐三档: `start` 贴对齐线的起点侧 · `center` 骑在对齐线上 · `end` 贴终点侧 */
export type PackAlign = 'start' | 'center' | 'end';

/** 缝: 单值 = 处处同缝; 数组 = **逐项缝**, 长度必须 = `items.length − 1`(N 个盒只有 N−1 条缝) */
export type PackGap = number | readonly number[];

/**
 * 主轴间距**二选一**(互斥; 同时给当场抛, 一个不给也抛)。两样是同一件事的两种说法:
 *   · `gap` —— 后一项的**头**到前一项的**尾**(col 是"底到下", row 是"右到左")
 *   · `pitch` —— 前一项的**头**到后一项的**头**(col 是"顶到顶", row 是"左到左"), 即节距
 *
 * 换算 `gap_i = pitch − extent_i`: 尺寸参差时**每一项的缝各不相同**, 这正是"节距"的心智
 * (链上每一环的中心距 / 表格每一行的行距)。某项 extent 超过 `pitch` 就是重叠, 当场抛。
 * 尺寸参差但**缝**要固定(视觉留白一致)时, 反过来用 `gap`。
 *
 * ⚠ 两样都写成普通可选字段, **有意不用联合类型排除**: 排他联合会让 `{ ...opts, pitch: 100 }`
 * (存量写法改一个字段)在 tsc 报一句"`pitch` 不能赋给 `undefined`"的怪错, 而互斥本身就是本
 * 函数的运行期守卫(见 `resolveGaps`), 类型层不必再焊一遍。
 */
export type PackSpacing = {
  /** 相邻两项的缝(px): 单值, 或**逐项**数组(长度必须 = `items.length − 1`) */
  gap?: PackGap;
  /** 前缘到前缘的节距(col = 顶到顶, row = 左到左); 与 `gap` 二选一 */
  pitch?: number;
};

export type PackColOptions = {
  /** 尺寸列(顺序即次序); 只读 `w/h` —— `nodeFit` / `cardFit` 的返回直接丢进来 */
  items: readonly Size[];
  /** 交叉轴的**对齐线**: `align` 决定它是每项的左边 / 中心线 / 右边 */
  x: number;
  /** 主轴起点 = 第一项的**顶边** */
  y0: number;
  /** 交叉轴对齐(缺省 `start` = 左对齐) */
  align?: PackAlign;
} & PackSpacing;

export type PackRowOptions = {
  /** 尺寸列(顺序即次序); 只读 `w/h` */
  items: readonly Size[];
  /** 交叉轴的**对齐线**: `align` 决定它是每项的顶边 / 中心线 / 底边 */
  y: number;
  /** 主轴起点 = 第一项的**左边** */
  x0: number;
  /** 交叉轴对齐(缺省 `start` = 顶对齐) */
  align?: PackAlign;
} & PackSpacing;

export type PackResult = {
  /** 摆好的绝对坐标(与 `items` 同序、同长) */
  rects: Rect[];
  /** 这些 rect 的并集(**不 pad**) —— 组框走 `bounds(rects, { pad })`; 空 `items` → `null` */
  bounds: Rect | null;
};

/** 对齐三档 → 比例: 落点 = 对齐线 − 尺寸 × k */
const ALIGN_K: Record<PackAlign, number> = { start: 0, center: 0.5, end: 1 };

/** 节距与缝同给 —— 提示写清"这是同一件事的两种说法" */
const HINT_PITCH_GAP = '节距与缝是同一件事的两种说法(节距含整个盒, 缝只算盒之间那段); 给一个就行';
/** 尺寸超过节距 = 重叠 —— 提示指向"改用 gap" */
const HINT_PITCH_OVERLAP = '某项尺寸超过节距就是重叠; 尺寸参差就改用 gap(固定缝或逐项缝)';

/**
 * 主轴间距 → **逐项缝**(`items.length − 1` 条)。单值路径与逐项路径在这里合流, 两条 packer
 * 因此只有一份间距算法。
 *
 * 抛的是**结构性错误**(节距与缝同给 / 尺寸超节距 / 缝数组长度不符 / 缝为负或非有限) ——
 * 它们算不出"看着还行"的结果。items 的尺寸值本身照旧不拦(与 `box` / `grid` 同纪律)。
 *
 * ⚠ 单值 `gap` 路径**一字未改**(含坏值照旧流出, 由 audit 现形) —— 那是既有 API 的字节承诺
 * (288 组逐字节基线 + PNG 快照); 逐项数组是新面, 错法(长度 / 负值)在下游**无从现形**, 所以
 * 在这里拦。
 */
function resolveGaps(shape: string, items: readonly Size[], axis: 'w' | 'h', o: PackSpacing): number[] {
  const count = Math.max(0, items.length - 1);
  const gap: PackGap | undefined = o.gap;
  const pitch: number | undefined = o.pitch;
  if (gap !== undefined && pitch !== undefined) {
    throw new ShapeInputError(shape, 'pitch', '与 gap 同时给了(二选一)', HINT_PITCH_GAP);
  }
  if (pitch !== undefined) {
    assertFiniteNumber(shape, 'pitch', pitch);
    return items.slice(0, count).map((it, i) => {
      const extent = it[axis];
      if (extent > pitch) {
        throw new ShapeInputError(
          shape, `items[${i}]`, `的${axis === 'h' ? '高' : '宽'}(${extent})超过 pitch(${pitch}) —— 会与后一项重叠`,
          HINT_PITCH_OVERLAP,
        );
      }
      return pitch - extent;
    });
  }
  if (gap === undefined) {
    throw new ShapeInputError(shape, 'gap', '没给', 'gap 与 pitch 必须给一个(同给也会抛)');
  }
  // 单值路径: 一字未改(见上面那条 ⚠ —— 含坏值照旧流到 audit, 那是既有 API 的字节承诺)
  if (typeof gap === 'number') return new Array<number>(count).fill(gap);
  // 逐项缝: 新面, 长度与每一项的值都在这里守(长度错下游**无从现形**, 负值则是明错)
  if (gap.length !== count) {
    throw new ShapeInputError(
      shape, 'gap', `长度 ${gap.length} ≠ items.length − 1 (${count})`,
      '逐项缝: N 个盒只有 N−1 条缝; 处处同缝就给单值',
    );
  }
  return gap.map((g, i) => {
    assertFiniteNumber(shape, `gap[${i}]`, g, HINT_KNOB_SIZE);
    if (g < 0) throw new ShapeInputError(shape, `gap[${i}]`, `为负(${g})`, HINT_KNOB_SIZE);
    return g;
  });
}

/**
 * 竖排: 各项按**次序**自上而下摞, 间距由 `gap`(缝)或 `pitch`(节距)**二选一**给定;
 * 交叉轴按 `align` 对齐到 `x`。
 *
 * ```ts
 * const col = packCol({ items: [sceneFit, diaFit, dbFit], gap: 40, x: 277, y0: 30, align: 'center' });
 * packCol({ items: [BOX, BOX, BOX], pitch: 100, x: 250, y0: 40 })    // 每格顶到顶 100(= 旧 gap: 100 - BOX.h)
 * packCol({ items: [stageFit, backFit, doneFit], gap: [38, 58], x: 60, y0: 0 })   // 逐项缝: 三块缝各不同
 * col.rects[1]                                  // 第二项的绝对坐标
 * bounds(col.rects, { pad: [30, 26] })          // 整列的组框(框在列外 30 / 26)
 * ```
 * ⚠ `x` 是**对齐线**不是左缘: `align: 'center'` 时它是每项中心线, `'end'` 时是右边。
 * 尺寸参差时只有 `center` 能保证"同轴"(菱形 / 圆柱与矩形同心 —— 直连边的端口才对称)。
 */
export function packCol(o: PackColOptions): PackResult {
  const k = ALIGN_K[o.align ?? 'start'];
  const gaps = resolveGaps('packCol', o.items, 'h', o);
  const rects: Rect[] = [];
  let y = o.y0;
  for (const [i, it] of o.items.entries()) {
    rects.push({ x: round1(o.x - it.w * k), y: round1(y), w: it.w, h: it.h });
    y += it.h + (gaps[i] ?? 0);
  }
  return { rects, bounds: bounds(rects) };
}

/**
 * 横排: 各项按**次序**自左而右铺开, 间距同 `packCol`(缝或节距); 交叉轴按 `align` 对齐到 `y`。
 *
 * ⚠ `y` 是**对齐线**不是顶边(同 `packCol` 的 `x`)。列宽 / 行高由 items 自己说了算 ——
 * 这里不提供"等宽列"(要等宽就先把尺寸列统一, 那是作者决策)。
 */
export function packRow(o: PackRowOptions): PackResult {
  const k = ALIGN_K[o.align ?? 'start'];
  const gaps = resolveGaps('packRow', o.items, 'w', o);
  const rects: Rect[] = [];
  let x = o.x0;
  for (const [i, it] of o.items.entries()) {
    rects.push({ x: round1(x), y: round1(o.y - it.h * k), w: it.w, h: it.h });
    x += it.w + (gaps[i] ?? 0);
  }
  return { rects, bounds: bounds(rects) };
}
