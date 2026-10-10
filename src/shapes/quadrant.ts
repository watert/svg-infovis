// =====================================================================
// shapes/quadrant · 象限分区框架(n×n 分区 + 分区线 ± 轴端箭头 + 极标签)
//
// 由来(261010): 四象限类的图在 diagram 领域反复出现 —— SWOT / 阵营九宫格 / "空档定位"那种
// 二维格局图 —— 而内核里一直没有这一族的**名字**。每张图都在手搓同一套东西: 轴线用细长节点
// 或 `SceneEdge` + `noCheck` 画、轴端标签手算 anchor 与偏移、四个格位逐个心算。手搓三遍就有
// 三种歪法(轴线画成了分隔线、标签浮在半空、格位不等距), 而它们全都**门禁全绿** —— 轴线与
// 维度名是版式墨迹, 没有任何判据看得见它们。
//
// 与「轴一」的边界(别越, 见 docs/internals/layering.md): "kernel 不画刻度与轴"管的是
// **数据坐标系** —— 数值 → 几何的映射、刻度、比例尺, 那是 chart 的事(走 `embed` 链)。
// 这里是**版式分区**: 没有数据、没有刻度、没有比例尺, 只有"把一个矩形切成 n×n、线画在缝上、
// 维度名贴在外缘"。与 `dividerShape` 的分隔线同族 —— 版式墨迹, 不是关系边, 所以不进 scene、
// 不进净空门禁(要它别压着谁, 靠作者留位)。
//
// 两个出口(与 `stat` / `heading` 同构):
//   · `quadrantGeometry` —— **读数**: 格位 / 格心 / 分区线段 / 极标签锚点(作者摆内容用)
//   · `quadrantShape`    —— **墨迹**: 分区线(± 轴端箭头)+ 极标签(与几何共用同一份解算)
//
// 词表: `cols × rows` 个分区。**2×2 = 四象限**(SWOT / 空档定位), **3×3 = 九宫格**
// (阵营图 / 矩阵)。两个方向都是 ≥1 的整数, 且至少一个方向 > 1(1×1 没有分区可言, 当场抛)。
//
// 极标签("极" = 一条轴的两端, 如 Helpful ↔ Harmful): 贴分区区域**外侧**的四条边。
// 一条边给**字符串数组** = 每个格位一个(九宫格的列头 / 行头), 给**单个字符串** = 整边居中
// (四象限那种"一个维度名管一整边")。数组长度必须与格位数一致 —— 少一个就是"写了却不上屏"。
//
// 明确不做(别在这里加):
//   · **不是数据坐标轴** —— 不接受数据、不建比例尺、不画刻度(见上「轴一」)
//   · **不管格子里的内容** —— 每格摆什么(卡片 / 文字 / 色块)是作者的事, 本件只给格位
//   · **不顺手动排** —— 格位由"区域 + 分区数 + 缝"唯一推出, 内容在格内怎么排归作者
//   · 多行极标签不做(轴端的维度名是一个词或短句; 含 `\n` 当场抛)
// =====================================================================

import { type DGroup, type Descriptor, type TextAnchor, anchorAttrs, baselineY, group, path, rect } from '../descriptor.js';
import { DEFAULT_THEME, type Theme, type Tone, TONES } from '../theme.js';
import { ShapeInputError, assertFiniteNumber, assertFiniteRect, assertOneOf } from '../guard.js';
import { type Pt, type Rect, fmt, rectBottom, rectRight, round1 } from '../geometry/vec.js';
import { type Side, sideDir } from '../geometry/port.js';
import { inlineTextRow } from './inline.js';

/** 本件的版式缺省 —— **一处事实**(geometry 与 shape 共读, 见文件头)。 */
export const QUADRANT_LAYOUT = {
  /** 分区线线宽(px) —— 与分组框同档(1.5), 比分隔线的细线(1)重一点: 它是框架不是注脚 */
  ruleWidth: 1.5,
  /** 轴端箭头的长 / 半宽(px) —— 箭头由本件自画 path(不用 SVG `marker`, 纪律 5) */
  arrowLen: 9,
  arrowHalf: 4.5,
  /** 极标签中心线离区域边缘的距离(px, 沿朝外法线) */
  poleOffset: 14,
  /** 极标签字号(px) —— 与旁注 / 边标签同一个"小字"档 */
  poleFontSize: 11,
} as const;

export type QuadrantOptions = {
  /** 分区区域(含格与分区带) —— 格位由它等分推出, 不是"格尺寸 × 个数" */
  rect: Rect;
  /** 列数(≥1 的整数; 2 = 四象限的左/右, 3 = 九宫格的 Lawful/Neutral/Chaotic) */
  cols: number;
  /** 行数(≥1 的整数) */
  rows: number;
  /** 分区带的缝宽(px, 缺省 0 = 密铺)。分区线画在缝的**中线上**(与 `grid` 的缝中线同公式) */
  gap?: { x?: number; y?: number };
};

/** 极标签的锚点: 要落的位置 + 文字对齐(贴边外侧的惯例对齐: 上下边居中 / 左边右对齐 / 右边左对齐) */
export type QuadrantPole = {
  at: Pt;
  anchor: TextAnchor;
};

export type QuadrantGeometry = {
  cols: number;
  rows: number;
  /** 分区区域(= 输入的 rect, 原样带出) */
  bounds: Rect;
  /** 每格的尺寸(由区域等分推出; 全格同一份 —— 参差格子不是本件的语义) */
  cellSize: { w: number; h: number };
  /** 格位(`c` 从左数, `r` 从上数, 均从 0 起) */
  cell(c: number, r: number): Rect;
  /** 格心 */
  center(c: number, r: number): Pt;
  /** 第 `i` 条竖分区线的 x(`i` = 0..cols-2; 分区线画在缝的中线上) */
  vLine(i: number): number;
  /** 第 `i` 条横分区线的 y */
  hLine(i: number): number;
  /** 竖分区线 `i` 的**整段**(贯穿着区域; `overshoot` = 两端各伸出区域多少) */
  vRule(i: number, opts?: { overshoot?: number }): { from: Pt; to: Pt };
  /** 横分区线 `i` 的整段 */
  hRule(i: number, opts?: { overshoot?: number }): { from: Pt; to: Pt };
  /**
   * 极标签锚点。`side` 是标签贴的那条边; `i` 是**格位号**(上下边按列 0..cols-1, 左右边按行
   * 0..rows-1), **不给 = 整边居中**(四象限那种一个维度名管一整边)。
   * `offset` = 离边缘的距离(沿朝外法线, 缺省 `QUADRANT_LAYOUT.poleOffset`)。
   */
  pole(side: Side, i?: number, opts?: { offset?: number }): QuadrantPole;
};

/** 分区数的守卫: 正整数, 且至少一个方向 > 1(1×1 没有分区可言) */
function assertPartition(owner: string, cols: unknown, rows: unknown): void {
  for (const [field, v] of [['cols', cols], ['rows', rows]] as const) {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
      throw new ShapeInputError(owner, field, `不是 ≥1 的整数(拿到 ${String(v)})`, '分区数是格数, 不是尺寸: 写 2 / 3, 别写 0.5');
    }
  }
  if (cols === 1 && rows === 1) {
    throw new ShapeInputError(owner, 'cols', '与 rows 同时为 1(拿到 1×1)', '一个格子没有分区可言; 只想要一条分隔线用 `dividerShape`');
  }
}

/**
 * 象限分区几何: 区域 → 格位 / 分区线 / 极标签锚点。
 *
 * **格位由区域等分推出**(不是"格尺寸 × 个数"): `cell.w = (rect.w − (cols−1)·gap.x) / cols` ——
 * 于是"这一族图占多大"先定, 格子自然分。⚠ 等分除不尽时按 1 位小数(序列化精度)落位, 逐格
 * 公差 ≤0.1px、肉眼不可见; 要格子逐位相等的硬账就自己给一个能被整除的区域宽
 * (够不够整除是作者决策, 这里不静默吸附最后一格 —— 吸附会让格子不等宽)。
 *
 * ```ts
 * const q = quadrantGeometry({ rect: plot, cols: 2, rows: 2, gap: { x: 36, y: 36 } });
 * q.cell(1, 0)                    // 右上那一格(哪个象限给什么内容是作者的事)
 * cardFit 出一个卡片盒后 placeRect 进 q.cell(...) —— 内容照样走反算, 不手填
 * ```
 */
export function quadrantGeometry(o: QuadrantOptions): QuadrantGeometry {
  return planQuadrant('quadrantGeometry', o);
}

/** 几何主体(两个公开出口共读一份; `owner` 只进报错文案 —— 与 `statMeasure` / `planHeading` 同规矩) */
function planQuadrant(owner: string, o: QuadrantOptions): QuadrantGeometry {
  const r = o.rect;
  assertFiniteRect(owner, r);
  assertPartition(owner, o.cols, o.rows);
  const cols = o.cols;
  const rows = o.rows;
  for (const [field, v] of [['gap.x', o.gap?.x], ['gap.y', o.gap?.y]] as const) {
    if (v === undefined) continue;
    assertFiniteNumber(owner, field, v, '缝是尺寸不是增量; 不要缝就不写这一位');
    if (v < 0) throw new ShapeInputError(owner, field, `为负(${v})`, '缝是尺寸不是增量');
  }
  const gapX = o.gap?.x ?? 0;
  const gapY = o.gap?.y ?? 0;
  const cellW = (r.w - (cols - 1) * gapX) / cols;
  const cellH = (r.h - (rows - 1) * gapY) / rows;
  // 缝总宽 ≥ 区域宽 ⇒ 格宽 ≤ 0: 坏几何, 当场抛(与 dividerShape 对 w≤0 的立场同: 不静默产出反向的格)
  if (cellW <= 0 || cellH <= 0) {
    const bad = cellW <= 0
      ? { field: 'gap.x', label: '格宽', got: cellW, span: round1((cols - 1) * gapX), whole: r.w }
      : { field: 'gap.y', label: '格高', got: cellH, span: round1((rows - 1) * gapY), whole: r.h };
    throw new ShapeInputError(
      owner, bad.field,
      `过大(${bad.label}算出来是 ${round1(bad.got)})`,
      `缝的总占位 ${bad.span} 吃掉了整个区域(${cols}×${rows} 分区, 区域这一轴是 ${bad.whole}) —— 收缝, 或把区域拉大`,
    );
  }
  const cellAt = (c: number, rr: number): Rect => ({
    x: round1(r.x + c * (cellW + gapX)),
    y: round1(r.y + rr * (cellH + gapY)),
    w: round1(cellW),
    h: round1(cellH),
  });
  /** 第 i 条缝的中线: 前一格右缘 + 半条缝(与 `grid.vGutter` 同一个公式) */
  const vLine = (i: number): number => round1(r.x + (i + 1) * cellW + (i + 0.5) * gapX);
  const hLine = (i: number): number => round1(r.y + (i + 1) * cellH + (i + 0.5) * gapY);
  const bottom = rectBottom(r);
  const right = rectRight(r);

  const ruleOvershoot = (ov: number | undefined): number => {
    if (ov === undefined) return 0;
    assertFiniteNumber(owner, 'overshoot', ov);
    if (ov < 0) throw new ShapeInputError(owner, 'overshoot', `为负(${ov})`, '伸出量是尺寸不是增量');
    return ov;
  };

  return {
    cols, rows,
    bounds: r,
    cellSize: { w: round1(cellW), h: round1(cellH) },
    cell: cellAt,
    center: (c, rr) => ({ x: round1(cellAt(c, rr).x + cellW / 2), y: round1(cellAt(c, rr).y + cellH / 2) }),
    vLine,
    hLine,
    vRule: (i, opts) => {
      const ov = ruleOvershoot(opts?.overshoot);
      const x = vLine(i);
      return { from: { x, y: round1(r.y - ov) }, to: { x, y: round1(bottom + ov) } };
    },
    hRule: (i, opts) => {
      const ov = ruleOvershoot(opts?.overshoot);
      const y = hLine(i);
      return { from: { x: round1(r.x - ov), y }, to: { x: round1(right + ov), y } };
    },
    pole: (side, i, opts) => {
      const off = opts?.offset ?? QUADRANT_LAYOUT.poleOffset;
      assertFiniteNumber(owner, 'pole.offset', off);
      const horiz = side === 'top' || side === 'bottom';
      const n = horiz ? cols : rows;
      if (i !== undefined && (!Number.isInteger(i) || i < 0 || i >= n)) {
        throw new ShapeInputError(
          owner, 'pole.i', `越界(拿到 ${String(i)})`,
          `${side} 边有 ${n} 个格位(0..${n - 1}); 整边居中就不给 i`,
        );
      }
      // 基准点落在区域边缘上: 逐格 = 该格边的中点, 整边 = 该边中点; 再沿朝外法线推 offset
      const bx = horiz
        ? (i === undefined ? r.x + r.w / 2 : r.x + i * (cellW + gapX) + cellW / 2)
        : (side === 'left' ? r.x : right);
      const by = horiz
        ? (side === 'top' ? r.y : bottom)
        : (i === undefined ? r.y + r.h / 2 : r.y + i * (cellH + gapY) + cellH / 2);
      const d = sideDir(side);
      return {
        at: { x: round1(bx + d.x * off), y: round1(by + d.y * off) },
        anchor: horiz ? 'middle' : side === 'left' ? 'end' : 'start',
      };
    },
  };
}

// --- 墨迹出口 ---------------------------------------------------------

/** `poles` 的四条边 —— 固定顺序(产物字节稳定), 与 `Side` 同词表 */
const POLE_SIDES: readonly Side[] = ['top', 'bottom', 'left', 'right'];

/** 分区线的样式旋钮(`rules: true` = 全缺省) */
export type QuadrantRules = {
  /** 线宽(px, 缺省 `QUADRANT_LAYOUT.ruleWidth`) */
  width?: number;
  /** 虚线(如 `'6 5'`); 不给 = 实线 */
  dash?: string;
  /** 线色(语义槽): 线走 `tones[tone].border` —— 与 `dividerShape` 的 tone 分工同源 */
  tone?: Tone;
  /** 线色单点例外(覆盖 `tone`) */
  color?: string;
  /** 区域外框(四条边, 同线色同线宽)。缺省 false —— 四象限只有轴, 九宫格常要外框 */
  frame?: boolean;
  /** 分区线两端伸出区域多少(px; 缺省 = `arrows` 时 `arrowLen`, 否则 0) */
  overshoot?: number;
  /**
   * **轴端箭头** —— 只画在"轴"上: 该方向恰有 2 个分区时(唯一那条分区线落在区域中线上),
   * 竖线 / 横线各判各的。两个方向都不是 2 个分区(如 3×3)时打开它**当场抛** ——
   * 没有中轴线就没有可指的轴, 这正是"写了却不上屏"的一档(要方向感请用 `poles` 文案)。
   */
  arrows?: boolean;
};

/** 极标签: 四条边各给文案(± 样式旋钮) */
export type QuadrantPoles = {
  /** 上边的标签: **数组 = 每列一个**(九宫格的列头), **字符串 = 整边居中**(四象限的维度名) */
  top?: string | readonly string[];
  /** 下边(数组时按列, 长度 = cols) */
  bottom?: string | readonly string[];
  /** 左边(数组时按行, 长度 = rows) */
  left?: string | readonly string[];
  /** 右边(数组时按行, 长度 = rows) */
  right?: string | readonly string[];
  /** 标签中心线离区域边缘的距离(px, 沿朝外法线; 缺省 `QUADRANT_LAYOUT.poleOffset`) */
  offset?: number;
  /** 字号(px, 缺省 `QUADRANT_LAYOUT.poleFontSize`) */
  fontSize?: number;
  /** 标签色(语义槽): 走 `tones[tone].text` */
  tone?: Tone;
  /** 标签色单点例外 */
  color?: string;
};

export type QuadrantProps = QuadrantOptions & {
  /** 分区线(缺省画; `false` = 只要格位不要线) */
  rules?: boolean | QuadrantRules;
  /** 极标签(缺省不画) */
  poles?: QuadrantPoles;
  theme?: Theme;
};

/** 一个轴端箭头(自画 path, 纪律 5: 不用 SVG `marker`): `apex` 是尖端, 三角朝 `dir` 的反方向张开 */
function arrowPath(apex: Pt, dir: 'left' | 'right' | 'up' | 'down', fill: string): Descriptor {
  const len = QUADRANT_LAYOUT.arrowLen;
  const half = QUADRANT_LAYOUT.arrowHalf;
  const horizontal = dir === 'left' || dir === 'right';
  const d = horizontal
    ? `M ${fmt(apex.x)} ${fmt(apex.y)} L ${fmt(apex.x + (dir === 'left' ? len : -len))} ${fmt(apex.y - half)} L ${fmt(apex.x + (dir === 'left' ? len : -len))} ${fmt(apex.y + half)} Z`
    : `M ${fmt(apex.x)} ${fmt(apex.y)} L ${fmt(apex.x - half)} ${fmt(apex.y + (dir === 'up' ? len : -len))} L ${fmt(apex.x + half)} ${fmt(apex.y + (dir === 'up' ? len : -len))} Z`;
  return path(d, { fill, stroke: 'none' });
}

/**
 * 象限框架 descriptor: 分区线(± 外框 ± 轴端箭头) + 极标签。
 *
 * 与 `quadrantGeometry` **共用同一份几何**(`planQuadrant`) —— 画出来的格位与读数里的格位数
 * 逐位相同, 不存在"量的一个盒、画另一个盒"。返回类型是 `DGroup`(与 `statShape` / `headingShape`
 * 同规矩): 本函数恒返回一个 group。
 *
 * 它**不是边**(与 `dividerShape` 的分隔线同族): 不长关系箭头(轴端箭头是维度记号, 不是关系)、
 * 不进 scene、不进净空门禁 —— 压在版式上的框架墨迹。要它别压着谁, 靠作者留位。
 */
export function quadrantShape(p: QuadrantProps): DGroup {
  const theme = p.theme ?? DEFAULT_THEME;
  const g = planQuadrant('quadrantShape', p);
  const { cols, rows, bounds } = g;
  // `rules`: 缺省画(true / undefined 同档), `false` 关掉, 对象 = 覆盖样式
  const rules: QuadrantRules | null = p.rules === false ? null : p.rules === true || p.rules === undefined ? {} : p.rules;
  if (rules) {
    assertOneOf('quadrantShape', 'rules.tone', rules.tone, TONES);
    for (const [field, v] of [['rules.width', rules.width], ['rules.overshoot', rules.overshoot]] as const) {
      if (v !== undefined) assertFiniteNumber('quadrantShape', field, v);
    }
    if (rules.arrows && cols !== 2 && rows !== 2) {
      throw new ShapeInputError(
        'quadrantShape', 'rules.arrows', `打开了, 但 ${cols}×${rows} 没有中轴线`,
        '箭头属于四象限的轴(2 分区那一维的唯一分区线); 九宫格这类图的方向感请用 `poles` 文案表达',
      );
    }
  }
  const children: Descriptor[] = [];
  if (rules) {
    const stroke = rules.color ?? (rules.tone ? theme.tones[rules.tone].border : theme.groupStroke);
    const width = rules.width ?? QUADRANT_LAYOUT.ruleWidth;
    // 有箭头时线端要伸出去让箭头有地方站(箭头尖端 = 线端; 作者显式给的 overshoot 优先)
    const overshoot = rules.overshoot ?? (rules.arrows ? QUADRANT_LAYOUT.arrowLen : 0);
    const lineAttrs = {
      fill: 'none', stroke, 'stroke-width': width, 'stroke-dasharray': rules.dash, 'stroke-linecap': 'butt',
    };
    if (rules.frame) children.push(rect(bounds.x, bounds.y, bounds.w, bounds.h, undefined, lineAttrs));
    for (let i = 0; i < cols - 1; i += 1) {
      const seg = g.vRule(i, { overshoot });
      children.push(path(`M ${fmt(seg.from.x)} ${fmt(seg.from.y)} L ${fmt(seg.to.x)} ${fmt(seg.to.y)}`, lineAttrs));
      if (rules.arrows && cols === 2) {
        children.push(arrowPath(seg.from, 'up', stroke), arrowPath(seg.to, 'down', stroke));
      }
    }
    for (let i = 0; i < rows - 1; i += 1) {
      const seg = g.hRule(i, { overshoot });
      children.push(path(`M ${fmt(seg.from.x)} ${fmt(seg.from.y)} L ${fmt(seg.to.x)} ${fmt(seg.to.y)}`, lineAttrs));
      if (rules.arrows && rows === 2) {
        children.push(arrowPath(seg.from, 'left', stroke), arrowPath(seg.to, 'right', stroke));
      }
    }
  }
  if (p.poles) {
    const poles = p.poles;
    assertOneOf('quadrantShape', 'poles.tone', poles.tone, TONES);
    for (const [field, v] of [['poles.offset', poles.offset], ['poles.fontSize', poles.fontSize]] as const) {
      if (v !== undefined) assertFiniteNumber('quadrantShape', field, v);
    }
    const fontSize = poles.fontSize ?? QUADRANT_LAYOUT.poleFontSize;
    const ink = poles.color ?? (poles.tone ? theme.tones[poles.tone].text : theme.label);
    for (const side of POLE_SIDES) {
      const v = poles[side];
      if (v === undefined) continue;
      const single = typeof v === 'string';
      const list = single ? [v] : v;
      const n = side === 'top' || side === 'bottom' ? cols : rows;
      if (!single && list.length !== n) {
        throw new ShapeInputError(
          'quadrantShape', `poles.${side}`, `给了 ${list.length} 个, 而 ${side} 边有 ${n} 个格位`,
          '数组 = 逐格一个(九宫格的列头 / 行头), 长度必须与格位数一致; 整边一个维度名请写字符串',
        );
      }
      list.forEach((content, i) => {
        if (typeof content !== 'string' || !content) {
          throw new ShapeInputError(
            'quadrantShape', `poles.${side}[${i}]`, `不是非空字符串(拿到 ${JSON.stringify(content)})`,
            '空标签写上去没人看得见 —— 不要这一格就别给这一项',
          );
        }
        if (content.includes('\n')) {
          throw new ShapeInputError(
            'quadrantShape', `poles.${side}[${i}]`, '含换行',
            '极标签是轴端的一个维度名(短句); 要两行文案请用 `SceneText` / `textNote` 自己摆块',
          );
        }
        const anchor = g.pole(side, single ? undefined : i, { offset: poles.offset });
        children.push(inlineTextRow({
          x: anchor.at.x,
          y: baselineY(anchor.at.y, fontSize, 'central'),
          content,
          theme,
          attrs: { ...anchorAttrs(anchor.anchor), 'font-size': fontSize, fill: ink, 'font-family': 'inherit' },
        }));
      });
    }
  }
  return group(children, { 'data-shape': 'quadrant' });
}
