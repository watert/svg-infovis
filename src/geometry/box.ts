// =====================================================================
// box · 盒查询(构建期把"这个东西在哪"算成数字)
//
// 由来(260920 评估): "折点走 route、盒尺寸走 nodeFit"之后, examples 里剩下的税几乎全是**位置**——
// `box.y + box.h + 18`、`(w1-w2)/2`、`ROW_Y[row] - RAISE_RULE` 这类小学算术散在图脚本里。
// 本文件把它收成一套对 `Rect` 的**查询语言**: 面 / 锚 / 内缩 / 并集 / 摆放。
// scene 照旧全绝对坐标 —— helper 只在构建期算一次, 结果由作者写死进 scene, 零运行时。
//
// 落在 `src/geometry/` 而不进 `knives/`: 这里没有诊断、不 fail-closed、不推进出口 ——
// 纯函数 + `round1` + 不 mutate(与 `vec.ts` / `text-rows.ts` 同层)。
//
// ── 三套"边距"的符号方向**各不相同**, 拿错方向就是图上一丝不差的错位 ──────────
//   · `offset`(`rectFace`): 沿该面的**朝外法线**(`sideDir`) —— 正 = 朝外, 负 = 朝内
//   · `pad`(`insetRect` / `bounds`): **边界给内容让出的空档** —— `insetRect` 收边界(内缩),
//     `bounds` 放边界(输出盒包住输入盒, 外扩); 可给 `[x, y]`
//   · `expandRect(r, by)`(`vec`): 只缩放盒本身, 正 = 向外
//   对照表在 QUICKREF「三套符号对照」—— 三者别互相代用。
//
// ── 两条红线(评估文档 §六) ────────────────────────────────────────────
//   ① **不做嵌套坐标系**: 只吃 / 只出绝对坐标的 `Rect`(没有局部坐标、没有 transform)。
//      "把一组盒收成一个盒"就是 `bounds(children)`, 拿去接着查 —— 不新造类型。
//   ② **不跟 `portPoint` 分叉**: `rectFace` 是它的 offset 糖(`portPoint` + `offset × sideDir`),
//      不是第二份端口协议 —— 面上的点全仓只许一份。锚点查询叫 `rectAnchor` 而**不叫 `rectAt`**:
//      `PortRef.at` 是**绝对坐标**, 同名会让同一套词汇里 `at` 一词两义。
//
// 明确不做(别在这里加): flex / grid 规范式 API(justify / minmax / auto-flow)。规则格子归
// `grid.ts`、摆放列归 `pack.ts`(两件都在后续批次); 本文件的边界只到"一个盒"。
// 也不设门禁: 入参坏值不在这里拦 —— 算出来就是坏数字, 由 `audit` / `finite_svg` 那层现形。
// =====================================================================

import { type Pt, type Rect, rectBottom, rectRight, round1 } from './vec';
import { type Side, portPoint, sideDir } from './port';

/** 边界与内容之间的空档: 单值 = 四边同值, `[x, y]` = 左右 / 上下(与 `nodeFit` 的 `padding` 同序) */
export type Pad = number | [x: number, y: number];

/** 九点锚名: nw 左上 / n 上中 / ne 右上 / w 左中 / center 心 / e 右中 / sw 左下 / s 下中 / se 右下 */
export type AnchorName = 'nw' | 'n' | 'ne' | 'w' | 'center' | 'e' | 'sw' | 's' | 'se';

/** 锚点: 九点锚名, 或 `{ h, v }` 比例(越界即落在盒外 —— 是查询不是门禁, 不拦) */
export type Anchor = AnchorName | { h: number; v: number };

/** 锚名 → 比例: `center` = (0.5, 0.5) = `vec` 的 `rectCenter` */
const ANCHOR_RATIO: Record<AnchorName, { h: number; v: number }> = {
  nw: { h: 0, v: 0 }, n: { h: 0.5, v: 0 }, ne: { h: 1, v: 0 },
  w: { h: 0, v: 0.5 }, center: { h: 0.5, v: 0.5 }, e: { h: 1, v: 0.5 },
  sw: { h: 0, v: 1 }, s: { h: 0.5, v: 1 }, se: { h: 1, v: 1 },
};

const ratioOf = (a: Anchor): { h: number; v: number } => (typeof a === 'string' ? ANCHOR_RATIO[a] : a);

/** 空档归一成 `[x, y]`(缺省 0 = 不偏移) */
const padPair = (pad: Pad = 0): [number, number] => (typeof pad === 'number' ? [pad, pad] : pad);

/**
 * 面上的点 + 沿**朝外法线**的 offset: 正 = 朝外, 负 = 朝内(y-down, 与 `sideDir` 同向)。
 *
 * `t` / `at` 与 `portPoint` **完全同源**(at 绝对坐标优先于 t 比例, 缺省面中点) —— 本函数就是
 * `portPoint(r, { side, t, at })` 加一个 `offset × sideDir(side)`, 不复制取值顺序。
 *
 * ```ts
 * rectFace(box, 'bottom', { offset: 18 })   // 盒底往下 18(出盒 stub 起点)
 * rectFace(box, 'left', { offset: -12 })    // 左缘往里 12
 * rectFace(box, 'top', { t: 0.75 })         // 顶面 3/4 处, 不偏移
 * ```
 */
export function rectFace(r: Rect, side: Side, opts: { t?: number; at?: number; offset?: number } = {}): Pt {
  const p = portPoint(r, { side, t: opts.t, at: opts.at });
  const off = opts.offset ?? 0;
  const d = sideDir(side);
  return { x: round1(p.x + d.x * off), y: round1(p.y + d.y * off) };
}

/** 锚点坐标: 九点锚名或 `{ h, v }` 比例(`{ h: 0.5, v: 1 }` 等价 `'s'`, 即底边中点) */
export function rectAnchor(r: Rect, anchor: Anchor): Pt {
  const { h, v } = ratioOf(anchor);
  return { x: round1(r.x + r.w * h), y: round1(r.y + r.h * v) };
}

/**
 * 内缩: `pad` 正数把边界往里收(可 `[x, y]`)。
 * ⚠ pad 超过半宽/半高会得到**负宽高的退化盒** —— 不 clamp: 静默夹成 0 会把"pad 明显过大"这个
 * 作者错误藏起来(与 `vec` 的 `expandRect` 同口径: 尺寸算出来是多少就是多少)。
 */
export function insetRect(r: Rect, pad: Pad): Rect {
  const [px, py] = padPair(pad);
  return { x: round1(r.x + px), y: round1(r.y + py), w: round1(r.w - 2 * px), h: round1(r.h - 2 * py) };
}

/**
 * 一组盒的并集 + pad = **virtual group 的盒**(把 children 收成一个盒, 接着走 face / 锚 查询)。
 *
 * `pad` 正数是**边界给内容让出的空档** —— 这里"边界"是**输出盒**、"内容"是输入的 children,
 * 所以框比并集**大**。与 `insetRect` 看着方向相反、其实是同一套语义: 那边输入的 `r` 才是边界。
 * 负 pad = 反向(把并集收进去)。
 *
 * 空数组 → `null`(**不是** 0×0 的盒: "原点有个空盒"会静默混进 scene 与门禁)。
 * 它只管 wrap(已摆好的盒 → 并集); fill(一个盒 + 尺寸列 → 摆进去)归 `pack.ts`。
 */
export function bounds(rects: readonly Rect[], opts: { pad?: Pad } = {}): Rect | null {
  if (!rects.length) return null;
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const [px, py] = padPair(opts.pad);
  return {
    x: round1(x - px),
    y: round1(y - py),
    w: round1(Math.max(...rects.map((r) => rectRight(r))) - x + 2 * px),
    h: round1(Math.max(...rects.map((r) => rectBottom(r))) - y + 2 * py),
  };
}

/** 尺寸 —— 只吃 `w/h`: 想把某个盒搬到别处, 直接把它当 size 传进来, 它的 x/y 不参与 */
export type Size = { w: number; h: number };

/**
 * 按锚点摆放: `at` 是**这个锚点要落的位置** —— 缺省锚 `center`, 即 at 是盒心(与 `placeCard` 同口径)。
 *
 * ```ts
 * placeRect(fit, { x: cx, y: cy })                        // 盒心落在 (cx, cy)
 * placeRect(fit, { x: 0, y: labelY }, { anchor: 'w' })     // 左边槽: 左中贴 x = 0
 * ```
 * 只算落点, `w/h` 原样带出(改尺寸是 `cardFit` / `nodeFit` 的活)。
 */
export function placeRect(size: Size, at: Pt, opts: { anchor?: Anchor } = {}): Rect {
  const { h, v } = ratioOf(opts.anchor ?? 'center');
  return { x: round1(at.x - size.w * h), y: round1(at.y - size.h * v), w: size.w, h: size.h };
}
