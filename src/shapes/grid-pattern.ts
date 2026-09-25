// =====================================================================
// shapes/grid-pattern · 画布网格底纹 (两种风格: line 细线格 / dot 点阵)
//
// 文件名带 `-pattern` 是为了与 `geometry/grid.ts`(版式**格子**查询)分开 —— 两件事同名不同物:
// 这里是**画布装饰**(SVG `<pattern>`, 不进 scene), 那边是**版式格子**(纯几何)。(260920 改名)
//
// 为什么这件事敢做(260920 网格底纹十变体探针实测): SVG pattern 在
// rsvg(`scripts/svg2png.sh` 的优先渲染器) / PDF / WebKit 三处**同形** —— 与 filter / glow 的
// "支持参差"处境正相反, 所以它能进交付产物, 而 glow 被立场性拒了。
//
// 三条钉死的写法(动之前先把那组十变体探针重跑一遍):
//   ① `patternUnits` 必须 userSpaceOnUse —— objectBoundingBox 会让 tile 随对象尺寸走, 而
//      pattern 内容仍按用户单位画 ⇒ 网格与 tile 错位(实测 160px 面板被渲染成 16px 格)
//   ② 线画在 tile **边界**(`M0 0H{step}M0 0V{step}`): 出界那半被平铺裁掉, 所以内部写的
//      stroke-width 是**视觉线宽的 2 倍** —— 换来线落在整数坐标上, 像素对齐最锐利。
//      (对照: 线画在 tile 中心得到的是 2px 软线, 峰值暗度相同, 差的只是线宽)
//   ③ 点画在 tile **中心**(放角落会被裁掉四分之三); step 取偶数, 点才落在整数坐标上
//
// 缺省墨色 = **中性灰 + 0.1**(260920 实测定档): 暖白底上留约 10 灰阶, 看得见但不抢节点
// 边框的戏。**不拿 `theme.groupStroke` 当缺省** —— 那是组框色(paper 下是墨黑 #374151), 铺成
// 底纹实测 18.3 灰阶, 整片图被格子压住(这就是第一版被退回的原因)。主题要改色/深浅走
// `Theme.grid`; 作者要更细的深浅档位只能把 alpha 编进 `color`, 见 `GridProps.opacity`。
//
// 层序: 画布底色**之上**、任何内容**之下**(`sceneChildren` 里紧跟 canvasLayer)。
// 它**不进 scene** ⇒ 天然不参与 audit —— 这是刻意的: 网格是版式装饰不是信息, 不该被门禁
// 当元素审(与 `SceneGroup.noCheck` / lifeline 同族, 它更进一步: 干脆没有对象可审)。
// =====================================================================

import { type Attrs, type DDefs, type Descriptor, circle, defs, path, pattern, rect } from '../descriptor';
import { ShapeInputError, assertFiniteNumber, assertOneOf } from '../guard';
import { type Pt, round1 } from '../geometry/vec';

/** 网格风格词表 —— 与 `assertOneOf` 同源, 写错的风格词会静默回落成缺省形态, 必须拦 */
export type GridStyle = 'line' | 'dot';
export const GRID_STYLES: GridStyle[] = ['line', 'dot'];

/** 缺省墨色: 中性灰(实测定档, 缘由见文件头) —— 主题要改走 `Theme.grid.color` */
export const GRID_INK = '#999999';

export type GridProps = {
  /** 风格: line = 细线格(缺省), dot = 点阵 */
  style?: GridStyle;
  /** 格距(px), 两种风格共用, 缺省 10。线格取 8~12、点阵取 12~20 是实测顺眼的档 */
  step?: number;
  /** 线 / 点的颜色, 缺省 `GRID_INK`(中性灰); 主题层可经 `Theme.grid.color` 覆盖 */
  color?: string;
  /**
   * 不透明度, 缺省 line 0.1 / dot 0.2(点面积小, 要浓一档才看得见)。
   *
   * ⚠ 精度受 serialize 的 **1 位小数**铁律约束: 写 `0.06` 会被写成 `0.1`。**要更细的档位只有
   * 一条路** —— 把 alpha 编进 `color`(`#9999991a` 或 `rgba(153,153,153,0.06)`, 实测 rsvg 两种
   * 语法都认), 颜色的 alpha 字符串不过 `round1`。
   */
  opacity?: number;
  /** line = **视觉线宽**(px, 缺省 1); dot = 点直径(px, 缺省 2) */
  width?: number;
  /** pattern id, 缺省 `md-grid`。同页嵌多张带网格的 SVG 时各自给一个, 免得 `url(#…)` 串台 */
  id?: string;
  /**
   * 网格块的**左上角**(画布绝对坐标, 缺省 `(0, 0)`): 它同时是 tile 的**相位原点** —— 网格线 /
   * 点阵从这个角起算, 而**不是**从画布原点起算。
   *
   * 为什么有这一位(260925, 活体 = `examples/labs/style-lab.ts` 的四格底纹对照): 并排几块网格
   * 此前靠 `<g transform="translate(…)">` 把内容整体挪过去, 而平移一旦编进坐标, 图案相位就改从
   * **画布原点**起算 —— 实测(rsvg 1000 / 1400 / 2800px 三档, 与"格角起算"逐像素对账)差
   * **16~22%** 像素, 所以"直接展平"不是无损的。有了这一位, 块既落在绝对坐标上、又保住自己
   * 那一份相位, `<g transform>` 才拆得掉。
   */
  origin?: Pt;
};

/**
 * 主题层能给的网格缺省 —— 去掉两位**作者决策**: `id`(同一张图铺多种网格才需要的区分)与
 * `origin`(一块网格铺在哪儿)。主题铺的是"整张画布那一层", 起点恒为画布原点。
 * 出口口径: `opts.grid` 的字段**逐个**盖在它上面, 所以主题给"底"、作者只写要改的那一两位。
 */
export type GridDefaults = Omit<GridProps, 'id' | 'origin'>;

/** 缺省 pattern id —— 同页多图串台时唯一的抓手, 见 `GridProps.id` */
export const GRID_ID = 'md-grid';

const SHAPE = 'gridPattern';

/** 尺寸类参数: 非有限或非正都当场抛(0 格距会画出空 pattern, 渲染器不会报错) */
const positive = (field: string, v: unknown): number => {
  assertFiniteNumber(SHAPE, field, v);
  if ((v as number) <= 0) throw new ShapeInputError(SHAPE, field, `不是正数(拿到 ${v})`, '网格尺寸为 0 会画出空 pattern, 且渲染器一声不吭');
  return v as number;
};

/**
 * 网格 `<defs>` —— 只声明, 不上屏; 上屏由 `gridLayer` 铺满画布的那块矩形做。
 * 想自己控制铺法(例如只铺一半 / 铺在某个圆里)可以直接用它 + 自备 `fill="url(#id)"`。
 */
export function gridPattern(p: GridProps = {}): DDefs {
  assertOneOf(SHAPE, 'style', p.style, GRID_STYLES);
  const style = p.style ?? 'line';
  const step = positive('step', p.step ?? 10);
  const color = p.color ?? GRID_INK;
  const opacity = p.opacity ?? (style === 'line' ? 0.1 : 0.2);
  assertFiniteNumber(SHAPE, 'opacity', opacity);
  if (opacity <= 0) {
    throw new ShapeInputError(SHAPE, 'opacity', `不是正数(拿到 ${opacity})`, '透明度 0 等于完全不画 —— 要关掉网格请用 `opts.grid: false`');
  }
  // 相位原点(给了才校验): 尺寸类旋钮一律非有限即抛, 与 step / width 同档
  const origin = p.origin;
  if (origin) {
    assertFiniteNumber(SHAPE, 'origin.x', origin.x);
    assertFiniteNumber(SHAPE, 'origin.y', origin.y);
  }
  const tile = String(round1(step));

  const body: Descriptor[] = [];
  if (style === 'line') {
    const w = positive('width', p.width ?? 1);
    // 边界写法: 平铺会裁掉 tile 外那半, 所以写 2w 才能在 tile 内留下 w 的视觉线宽
    const stroke = w * 2;
    if (stroke > step) {
      throw new ShapeInputError(SHAPE, 'width', `线宽 ${w} 超过半格距(${round1(step / 2)})`, '再宽相邻两条线就并成实色了 —— 要么减线宽, 要么加格距');
    }
    body.push(path(`M0 0H${tile}M0 0V${tile}`, {
      fill: 'none', stroke: color, 'stroke-width': stroke, 'stroke-opacity': opacity,
    }));
  } else {
    const d = positive('width', p.width ?? 2);
    if (d > step) {
      throw new ShapeInputError(SHAPE, 'width', `点直径 ${d} 超过格距(${round1(step)})`, '点会互相吃掉 —— 要么减直径, 要么加格距');
    }
    body.push(circle(step / 2, step / 2, d / 2, { fill: color, 'fill-opacity': opacity }));
  }
  // tile 相位原点: 只有**显式给了** `origin` 才发射 `x`/`y` —— 不给时这两个属性根本不出现,
  // 老产物逐字节不变(`x`/`y` 缺省即 0 = 画布原点, 与"没有这一位"的语义正好相同)
  const attrs: Attrs = { patternUnits: 'userSpaceOnUse' };
  if (origin) { attrs.x = origin.x; attrs.y = origin.y; }
  return defs([pattern(p.id ?? GRID_ID, step, step, body, attrs)]);
}

/**
 * 网格层: `<defs>` + 铺满 w×h 的引用矩形, 供 `sceneChildren` 排在 canvasLayer 之后。
 *
 * ⚠ 网格跟着**画布尺寸**走, 不跟内容走 —— w/h 要给 scene(或 `fit` 之后)的尺寸; 给小了
 * 画布上会留一块没有网格的角。
 *
 * 给了 `origin` 就是"这块网格从 `origin` 起铺 w×h"(铺满矩形跟着它走, 相位也由它起算) ——
 * 并排几块网格各铺一格时用得上; 不给 = 老样子, 铺满整张画布。
 */
export function gridLayer(w: number, h: number, p: GridProps = {}): Descriptor[] {
  assertFiniteNumber('gridLayer', 'w', w, '网格铺满的是画布尺寸(scene.width / height), 不是内容包围盒');
  assertFiniteNumber('gridLayer', 'h', h);
  const o = p.origin ?? { x: 0, y: 0 };
  return [
    gridPattern(p),
    rect(o.x, o.y, w, h, 0, { fill: `url(#${p.id ?? GRID_ID})`, stroke: 'none' }),
  ];
}
