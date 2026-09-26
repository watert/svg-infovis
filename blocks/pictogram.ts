// =====================================================================
// blocks/pictogram · ISOTYPE 图标阵列(作者声明 N 与 k)
//
// 由来(docs/infograph-roadmap.md 的 v0.2「排版层」第 4 项): "这里有多少个" 是 infographic 最古老
// 的一种画法 —— ISOTYPE 把数量画成**可数的图标**, 读者拿眼睛数, 用不着刻度尺。core 此前零件全有
// (lucide 图标槽 `shapes/icon` + 版式格子 `geometry/grid`), 可每张图都得自己拼一遍: 格距一处、
// "第几个算染色"一处、末行不满的并集又一处 —— 而"图上的数"与"嘴里的数"对不上, 正是从这些散处漏出来的。
//
// 定位: **组合 block**(`blocks/` 层 —— roadmap 的三层划分里, 数值语义关在这一层)。几何一样都不自己
// 发明, 全是 core 现成的刀:
//   · 格位 = `geometry/grid` 的 `cell`(规则格子的唯一一份公式; 缝的正中归 `vGutter` / `hGutter`, 本块不用)
//   · 图标 = `shapes/icon` 的 `iconShape`(contain 缩放 / 描边折算 / 原语上屏的唯一一份)
//   · 墨迹盒 = `geometry/box` 的 `bounds`(并集只此一处) · 取色 = `theme` 的 `toneStyle`(tone × variant 唯一入口)
//   · 旋钮守卫 = `guard` 的 `resolveKnobs`(缺省回落 + 越界当场抛全在那一处, 本文件不重写那份样板)
// 本文件只加两样东西: ① 把"第几个格是哪一档"收成一处(阅读序**前 k 个**吃 tone) ② 交出**块契约**
// `{ shape, bounds }` —— `bounds` 是**墨迹盒**(逐格 = 图标槽, 不加内边距), 能被 `pack` / `place` 直接摆。
//
// **反比例尺口子**(路线图那条红线在这里的落地): N 与 k 是作者**声明**的, kernel 绝不从数据推几何 ——
// 这里没有比例尺、没有数据绑定、没有坐标轴。给 k = 7 就是染 7 个; 那 7 个代表 7 个人还是 70 万次调用,
// 是作者写在那行说明字里的事(真要从数据推几何, 那是 chart: 走 `assets/embeds/` 的 echarts 底板)。
// 一条推论直接落在签名上: **k 不改几何** —— 染色只换颜色, 所以 `pictogramFit` 压根不收 `filled`
// (想从数据反算尺寸? 这个签名先告诉你没门)。
//
// 图标素材走**同一条素材链**(与 `NodeIcon.asset` / `iconShape` 一字不差): 块吃的是**纯数据**
// (`iconAsset('user')` 的产物 `ParsedIcon`), 渲染路径上**一个字节都不读盘**。所以本文件不引
// `icons/lucide`(它有 `import 'node:fs'`)—— "素材名 → 素材"是**构建期**的事, 由调用方在脚本顶上做
// 一次(活体见 `examples/infograph/pictogram.ts`)。这与 barrel 不收 `lucide.ts` 是同一条纪律的两面:
// 把 `node:fs` 挂上任何被浏览器消费的模块, 等于给那条路径判死刑。
//
// 边界(明确不做):
//   · **不做自动排布** —— 阵列摆在哪(`x` / `y`)是作者给的; 与邻块的关系交给 `pack` / `place`
//   · **不给 `rows`** —— 只声明每行几个, 行数 = `ceil(N / cols)`(排布算术, 不是数据推导);
//     末行不满就空着右侧, **不居中**(阅读序是从左到右逐行填, 那是 ISOTYPE 的读法)
//   · **不画底 / 不画框 / 不写图例字** —— 与 `shapes/stat.ts` 同一立场: 那些是作者拿 `bounds` 自己垫
// =====================================================================

import { type DGroup, type Descriptor, group } from '../src/descriptor.js';
import { DEFAULT_THEME, type Theme, type Tone, TONES, toneStyle } from '../src/theme.js';
import { ShapeInputError, assertFiniteNumber, assertOneOf, resolveKnobs } from '../src/guard.js';
import type { Rect } from '../src/geometry/vec.js';
import { bounds } from '../src/geometry/box.js';
import { grid } from '../src/geometry/grid.js';
import type { ParsedIcon } from '../src/icons/svg-parse.js';
import { iconShape } from '../src/shapes/icon.js';

/**
 * 阵列的排布参数 —— `pictogramFit`(反算)与 `pictogramShape`(上屏)共用的唯一一份数字,
 * **同时就是旋钮的声明**(键集 = 可覆盖的旋钮名, 由 `resolveKnobs` 读取)。
 * 与 `STAT_TEXT_LAYOUT` / `BADGE_LAYOUT` 同一条纪律: 两处各写一份 = 盒按一个格距算、图按另一个画。
 */
export const PICTOGRAM_LAYOUT = {
  /**
   * 单图标边长(px, 正方形): 24 —— 与 lucide 素材自己的 viewBox(24×24) 同量级, 于是缩放比 = 1、
   * `strokeWidth` 的"素材单位"与像素**恰好同值**(24 号图标那一档不必心算折算)。
   */
  size: 24,
  /** 同一排相邻图标的缝(px): 8。图标自成一个小方块, 缝只负责让读者数得清 */
  gapX: 8,
  /** 相邻两排的缝(px): 8 —— 与列缝同值, 阵列的节奏在两个轴上是同一个 */
  gapY: 8,
} as const;

/** 旋钮越界的提示(与 `resolveKnobs` 的默认嗓门分工: 这一族是"边长 + 缝", 措辞得对得上) */
const HINT_KNOB = '边长 / 格距都是尺寸不是增量; 缝可以贴紧给 0, 但边长必须为正';

export type PictogramFitOptions = {
  /** 图标总数 N(**正整数**: 一个都不画就别调本块 —— 空阵列不是"没内容", 是漏写) */
  total: number;
  /**
   * 每行几个(`cols`)。**不给 = 单行**(N 个横排一行); 给了就是多行网格, 行数 = `ceil(N / cols)`。
   * 它不能比 `total` 还大 —— 那等于声明一个装不满的行, 单行才是那件事的名字。
   */
  cols?: number;
  /** 单图标边长(px; 缺省 `PICTOGRAM_LAYOUT.size`) */
  size?: number;
  /** 同排相邻图标的缝(px; 缺省 `PICTOGRAM_LAYOUT.gapX`) */
  gapX?: number;
  /** 相邻两排的缝(px; 缺省 `PICTOGRAM_LAYOUT.gapY`) */
  gapY?: number;
};

export type PictogramFitResult = {
  /** 墨迹盒宽(px) = `cols × size + (cols − 1) × gapX`(首排必然满, 所以末行不满也不改宽) */
  w: number;
  /** 墨迹盒高(px) = `rows × size + (rows − 1) × gapY` */
  h: number;
  /** 本次采用的列数(不给 `cols` 时 = `total`) */
  cols: number;
  /** 本次采用的行数 = `ceil(total / cols)` */
  rows: number;
  /** 本次采用的单图标边长 */
  size: number;
  /** 本次采用的列缝 / 行缝 */
  gapX: number;
  gapY: number;
};

/** 一次排布的全部产物: 逐格矩形(已按 `x` / `y` 落位)+ 墨迹盒 + 本次采用的旋钮值 */
type Plan = {
  cols: number;
  rows: number;
  size: number;
  gapX: number;
  gapY: number;
  /** 逐格的**图标槽**(长度 = `total`), 下标即阅读序 —— "第几个是哪一档"就是在这个序上判的 */
  cells: Rect[];
  /** 墨迹盒 = 实际用到的格子并集 */
  box: Rect;
};

/**
 * 格子数守卫: **数出来的个数**(总数 / 列数 / 染色数)必须是整数。
 * 半个图标画不出来, 而 `2.5` / `NaN` 会静默落进格距里, 变成谁都看不出的一处错位 ——
 * 与 `assertFiniteRect` 对负宽高同一立场(畸形入参是编程错误, 不是数据错误)。
 * 正数那一档不在这里(各字段的合法下界不同: N / cols 要 ≥ 1, k 可以是 0), 由各自的调用点补。
 */
function assertCount(owner: string, field: string, v: unknown, what: string): void {
  assertFiniteNumber(owner, field, v, `${what}是数出来的个数; 非有限值 / 半个都不行`);
  if (!Number.isInteger(v)) {
    throw new ShapeInputError(owner, field, `不是整数(拿到 ${v})`, `${what}是数出来的个数(半个图标画不出来)`);
  }
}

/**
 * 排布(守卫 → 旋钮取值 → 逐格落位 → 墨迹盒) —— `pictogramFit` 与 `pictogramShape` 共读这一份。
 * 拆两处就是给自己埋一个会漂的第二权威(尺寸一处、格表一处, 迟早对不上)。
 * `x` / `y` 只影响逐格的绝对坐标与墨迹盒位置, 口径本身与它无关(`fit` 传 `(0, 0)`)。
 */
function pictogramPlan(owner: string, o: PictogramFitOptions, x: number, y: number): Plan {
  assertFiniteNumber(owner, 'x', x);
  assertFiniteNumber(owner, 'y', y);
  assertCount(owner, 'total', o.total, '图标总数 N');
  if (!(o.total > 0)) {
    throw new ShapeInputError(owner, 'total', `不是正数(拿到 ${o.total})`, '阵列至少得有一个图标; 空阵列是漏写不是"没内容"');
  }
  // 边长 / 两条缝一次收齐(缺省回落 + 非有限 / 负值当场抛全在 `resolveKnobs` 里), 键集 = PICTOGRAM_LAYOUT 的键
  const { size, gapX, gapY } = resolveKnobs(owner, PICTOGRAM_LAYOUT, o, HINT_KNOB);
  // 0 边长是"把图标画成一点"—— `resolveKnobs` 只守非负(缝可以贴紧), 所以正数这一档在这里补
  if (!(size > 0)) {
    throw new ShapeInputError(owner, 'size', `不是正数(拿到 ${size})`, '边长是尺寸不是增量; 0 边长的图标画不出来');
  }
  const cols = o.cols ?? o.total; // 不给 = 单行(N 个一行), 那是阵列最常用的那一版式
  assertCount(owner, 'cols', cols, '每行的图标数 cols');
  if (!(cols > 0)) {
    throw new ShapeInputError(owner, 'cols', `不是正数(拿到 ${cols})`, '每行至少一个图标; 想单行就别给 cols');
  }
  if (cols > o.total) {
    throw new ShapeInputError(owner, 'cols', `比图标总数还多(${cols} > ${o.total})`,
      '列数超过总数 = 一行永远装不满, 而"装不满的一行"是单行; 要单行就别给 cols');
  }
  const rows = Math.ceil(o.total / cols);
  // 格子一次声明, 逐格查 —— 格距公式(含 `round1` 的口径)只有 `geometry/grid` 那一份
  const g = grid({ origin: { x, y }, cols, rows, cell: { w: size, h: size }, gap: { x: gapX, y: gapY } });
  // 阅读序 = 从左到右、逐行往下(`i % cols` / `⌊i / cols⌋`): 前 k 个染色判的就是这个序
  const cells = Array.from({ length: o.total }, (_, i) => g.cell(i % cols, Math.floor(i / cols)));
  // 墨迹盒 = **实际用到**的格子并集(末行不满那一截右侧没有墨) —— 并集公式只有 `box.bounds` 一处。
  // 它恒等于 `g.bounds`(首排必然满 ⇒ 右缘仍由首排顶到最右), 但仍从真格子聚合: 那是"画了什么"
  // 与"算多大"之间唯一一条不靠推理的联系。
  const box = bounds(cells)!;
  return { cols, rows, size, gapX, gapY, cells, box };
}

/**
 * 按声明的 N / 列数反算阵列的**墨迹盒**(构建期算一次, 结果写死进图 —— 与 `nodeFit` / `listRowFit` 同一姿势)。
 *
 * 盒 = 逐格并集, **不加内边距** —— 阵列不画壳, 留白是作者的事(`pack` 的 `gap` 说了算)。
 * 返回的 `{ w, h }` 就是 `Size`, 直接喂 `packCol` / `packRow` / `rightOf` / `below`。
 *
 * ```ts
 * const f = pictogramFit({ total: 20, cols: 4 });      // 4×5 网格的墨迹盒
 * const col = packCol({ items: [f, f], gap: 40, x: 40, y0: 40 });
 * ```
 *
 * ⚠ **它不收 `filled`** —— 染色数只换颜色, 不改一行几何(见文件头那条推论)。所以别把 k 顺手传进来
 * 指望它"算得准一点": 它跟尺寸一个关系都没有。
 */
export function pictogramFit(o: PictogramFitOptions): PictogramFitResult {
  const p = pictogramPlan('pictogramFit', o, 0, 0);
  return { w: p.box.w, h: p.box.h, cols: p.cols, rows: p.rows, size: p.size, gapX: p.gapX, gapY: p.gapY };
}

export type PictogramProps = PictogramFitOptions & {
  /** 阵列**左上角** = 首个图标的格位左上角(阵列自己不画壳, 落位是作者的) */
  x: number;
  y: number;
  /** 图标素材(**纯数据**: `iconAsset('user')` 的产物, 不是名字字符串 —— 本块不读盘, 见文件头) */
  asset: ParsedIcon;
  /** 染色数 k(`0 ≤ k ≤ N` 的整数): 阅读序**前 k 个**吃 `tone`, 其余走 slate outline 淡态 */
  filled: number;
  /** 染色那一档的肤色(语义槽, 缺省 `slate`)。墨色取该 tone 的**实底槽**(solid 墨 = 一整块颜色) */
  tone?: Tone;
  /** 描边宽度(**素材坐标系单位**, 与 `iconShape` 同口径)。缺省用素材自己声明的那个 */
  strokeWidth?: number;
  theme?: Theme;
  /** 染色墨的单点覆盖(逃生口; 常规走 `tone` —— 角色该写在 `tone` 里, 别只活在覆盖表里) */
  inkColor?: string;
  /** 淡态墨的单点覆盖(逃生口; 常规走 slate 的描边槽) */
  restColor?: string;
};

/** 块契约: descriptor + **墨迹盒**(不加内边距) —— `bounds` 能被 `pack` / `place` 当一个盒直接摆 */
export type Pictogram = { shape: DGroup; bounds: Rect };

/**
 * 阵列 descriptor: [前 k 个染色][其余淡态], 逐格骑在自己的格位上。
 *
 * 两档墨都取**语义槽**, 一个色值都不硬编码: 染色走该 `tone` 的**实底色**(`toneStyle` 的 solid 档
 * `fill` —— 实心图标里最重的那一档墨), 淡态走 **slate 的描边色**(`outline` 档 `stroke`, 浅色系里
 * 最淡的那一档)。于是 light / dark / paper 三档主题下"染了的 / 没染的"对比自动成立。
 *
 * 返回 `{ shape, bounds }`: `bounds` 是这一块**占的墨迹盒**(逐格并集), 拿去 `bounds()` 收组框 /
 * 喂 `contentBounds` / 交给 `place` 找邻块位置都行。它没并进 `shape` 的 attrs(描述符是纯数据,
 * 多出来的字段类型也读不出来 —— 与 `listRowShape` 同一条)。
 */
export function pictogramShape(p: PictogramProps): Pictogram {
  assertOneOf('pictogramShape', 'tone', p.tone, TONES);
  const theme = p.theme ?? DEFAULT_THEME;
  const plan = pictogramPlan('pictogramShape', p, p.x, p.y);
  assertCount('pictogramShape', 'filled', p.filled, '染色数 k');
  // 越界当场抛(它同时是"图上几个染色"这件事唯一的守卫): 静默 clamp 会让图上的数**看着对**
  // 而实际是被改过的 —— 那正是 ISOTYPE 最不能出的错
  if (p.filled < 0 || p.filled > p.total) {
    throw new ShapeInputError('pictogramShape', 'filled', `越界(${p.filled}, 总数 ${p.total})`,
      '染色数只能落在 0..N: 前 k 个吃 tone, 其余是淡态; 想全染就给 N, 一个不染就给 0');
  }
  const ink = p.inkColor ?? toneStyle(theme, p.tone, 'solid').fill;
  const rest = p.restColor ?? toneStyle(theme, 'slate', 'outline').stroke;
  const children: Descriptor[] = plan.cells.map((c, i) => iconShape({
    ...c,
    asset: p.asset,
    color: i < p.filled ? ink : rest,
    strokeWidth: p.strokeWidth,
    theme,
  }));
  return { shape: group(children, { 'data-shape': 'pictogram' }), bounds: plan.box };
}
