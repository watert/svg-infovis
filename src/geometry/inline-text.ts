// =====================================================================
// geometry/inline-text · 行内标记的解析(标记 → run 表) —— 唯一一份
//
// 由来(260920 ontology 图): 卡片那类"说明块"里 **值要加粗**(`Object Type: **Airport**`),
// 而 `label` 是一个字符串。于是文字层出现了一个 mini-markup —— 它一旦存在, 就有两个消费者:
//   · 渲染面(`shapes/inline.ts`)要把它拆成 `<tspan>` 并按 run 上屏
//   · 度量面(`knives/measure.ts` ← `label_fit` / `nodeFit` / `labelBoxSize` 都用它)要按 run 算宽
// 两家各写一份解析 = 本仓最贵的那类事故(门禁量的宽度与画出来的宽度是两串不同的字)。
// 所以解析收在这里, 双方**只读它的输出**。
//
// 语法(260925 由"只有一条"扩到四种; 纪律不变 —— **成对才作数, 落单退字面量**):
//   `**粗**`            粗体 —— 唯一**会改宽**的标记(推进宽 +3%, 两处口径见 `INLINE_STYLE`)
//   `*斜*`              斜体 —— 最长匹配: 先认 `**` 再认 `*`
//   `~~删~~`            删除线 —— 走 `text-decoration` **属性**, 不画线、不改宽
//   `[文字]{accent}`    着色 —— `{…}` 里是 tone 名或 CSS 色值; 不认识 theme, 查表在渲染面
//   `\x`                转义(`* ~ [ ] { } \` 七个): 吃掉反斜杠留住字符, 且该字符不再参与配对
//
// 五条硬规矩:
//   ① **样式不得改变文本长度** —— `runs.map(r => r.text).join('')` 恒等于去转义后的原文。
//      于是按字数算的口径(`textUnits` / `describe`)不必理解标记, "量的那串字"与"画的那串字"必然同源。
//   ② **落单的标记退字面量**: 不吞字符、不抛错。抛错是最坏的选择 —— 它会让"度量能不能算"与
//      "图能不能画"分叉, 而那正是要焊死的东西。落单的星号/波浪号**在图上看得见**, 于是它自己暴露。
//   ③ **标记紧贴内容**(开标记右边、闭标记左边不能是空白, 见 `touchesText`): 图里的
//      `agent/* 与 tools/* 瀑布` 是两个通配符而不是一段斜体 —— 没有这条, 两个星号会被吃掉。
//   ④ **嵌套只认不交叉**: `**粗 *斜* 粗**` 两条都算(样式合并); 交叉(`*a **b* c**`)时
//      **内层 opener 退字面量**(外层闭标记先到, 内层那个开标记就作废 —— 见 `pairRanges` 的栈)。
//      每个 run 独立解出**完整**样式袋再一次穿上, 全程没有"样式栈"那种会漂的中间态。
//   ⑤ `start` / `end` 是**原串下标**(转义会让 `text` 与原串对不齐, 所以区间一律以原串为准)。
//      门禁要报"第几列那处标记写歪了"时, 只有原串下标能定位。
//
// 定位: 纯文本处理, **零运行期依赖** —— `descriptor` 只作 type-only 引用(与 descriptor 引 `Rect`
// 同规矩)。它不认识字体、字号、更不认识布局, 只回答"这段文字由哪些 run 组成、各段什么样式、
// 落在原串哪个区间"。
// =====================================================================

import type { Attrs } from '../descriptor';

/** 行内样式词表 —— **运行时值与类型同源**(加一种样式只改这里一处, 表与它由 `satisfies` 对上) */
export const INLINE_KINDS = ['bold', 'italic', 'strike', 'paint'] as const;
export type InlineKind = (typeof INLINE_KINDS)[number];

/**
 * run 的样式袋 —— **可空 = 这一段没有任何行内样式**(继承行基准)。
 * 字段写成可选而不是 `false`: "未设"与"显式关掉"是两回事, 而语法里表达不了后者。
 */
export type InlineStyleBag = {
  bold?: true;
  italic?: true;
  strike?: true;
  /** 着色值: **tone 名或 CSS 色值**, 原样带出来 —— 解析层不认识 theme */
  paint?: string;
};

/**
 * 一种样式的**规格** —— parse / measure / render 三方只读这张表。
 *
 * 三个字段各有一个读者, 缺席 = 那条口径对该样式**不适用**(不是"值等于 0"):
 *   · `advanceGain` 度量读(bold 独占) —— 其余样式不改宽, 也就没有这一位
 *   · `weight`      渲染读(bold 独占) —— 粗体 run 的字重取 `max(行字重, 本值)`
 *   · `svgAttrs` / `valueAttr` 渲染读 —— 斜体、删除线是**静态属性**照搬; 着色是**值属性**:
 *     run 里解出来的色值填进 `valueAttr` 那个属性名
 */
export type InlineStyleSpec = {
  /** 开标记字面量 */
  mark: string;
  /** 闭标记; 缺省与开标记同形。`]{` 这种自带值位的闭标记单列 */
  close?: string;
  /** 推进宽度增益(倍): 该样式那段文字乘 `1 + 本值` */
  advanceGain?: number;
  /** 粗体档位(CSS 数值) */
  weight?: number;
  /** 静态 SVG 属性(整段照搬) */
  svgAttrs?: Attrs;
  /** 值属性名: run 值(色)填进这个属性 */
  valueAttr?: string;
};

/**
 * 标记 → 规格。**加样式只改这里一处** —— 解析的识别顺序、度量的加宽、渲染的属性全从它读,
 * 于是"量的是这串、画的是另一串"没有第二次发生的机会。
 *
 * `bold` 那两个数值的来路(从 `knives/measure.ts` 搬来, 免得两边各写一份):
 *   · `advanceGain: 0.03` 是**推断值**, 无 Archify 对位 —— 它的渲染侧确实有 `font-weight="600/700"`
 *     的 label(`render-dataflow.mjs:394` / `render-lifecycle.mjs:460`), 但量宽一律用同一个 0.6,
 *     不区分字重。core 不持有字体, 只能在推进宽度上给粗体一个经验加宽; 方向"宁宽不窄"。
 *   · `weight: 600` 是粗体**档位**(与 CSS font-weight 同档: 600 = semibold 起算): 行字重已到
 *     600 时行内标记不再二次加宽(加宽是档位差, 不是叠加), 渲染也据此取 `max`。
 */
export const INLINE_STYLE = {
  bold: { mark: '**', advanceGain: 0.03, weight: 600 },
  italic: { mark: '*', svgAttrs: { 'font-style': 'italic' } },
  strike: { mark: '~~', svgAttrs: { 'text-decoration': 'line-through' } },
  paint: { mark: '[', close: ']{', valueAttr: 'fill' },
} satisfies Record<InlineKind, InlineStyleSpec>;

/** 一段同款式的连续文字 */
export type TextRun = {
  text: string;
  /** 未设 = 这一段没有行内样式(继承行基准); 全空袋不写 —— 渲染面据此走"不挂 tspan"的老路 */
  style?: InlineStyleBag;
  /** 本段内容在**原串**里的起点(含): 开标记之后 */
  start: number;
  /** 本段内容在原串里的终点(不含): 闭标记之前 */
  end: number;
};

/** 可转义字符表: 七个标记字母 + 反斜杠自己 */
const ESCAPABLE = '*~[]{}\\';

/** 转义起点判据(渲染面也要用它认 `\*` 这种"图上是一个星号"的写法) */
export const isEscapeStart = (ch: string): boolean => ESCAPABLE.includes(ch);

/**
 * 去转义: 吃起来是"吃反斜杠、留字符"。
 * 反斜杠后面不是可转义字符时(`C:\path` 那种)它就是个普通反斜杠 —— 不吃下一个字符。
 */
const decode = (src: string, from: number, to: number): string => {
  let out = '';
  for (let i = from; i < to; i += 1) {
    if (src[i] === '\\' && i + 1 < to && isEscapeStart(src[i + 1])) { out += src[i + 1]; i += 1; continue; }
    out += src[i];
  }
  return out;
};

/** 标记 token: 词法层只认"这里有一个标记", 怎么配对由 `pairRanges` 的栈定 */
type Token = {
  kind: InlineKind;
  at: number;
  len: number;
  /**
   * `both` = 开闭同形(`**` `*` `~~`, 谁开谁闭看栈); `open` / `close` 只有一边(`[` / `]{…}`)
   */
  role: 'both' | 'open' | 'close';
  /** 闭标记自带的值(只有 paint 有) */
  value?: string;
  /** 当开标记的资格: 右边紧贴文字 */
  canOpen: boolean;
  /** 当闭标记的资格: 左边紧贴文字 */
  canClose: boolean;
};

/**
 * 标记必须**紧贴内容**: 开标记的右边、闭标记的左边那一格不能是空白。
 *
 * 这一条是花小钱买"认得出作者本意": 图里的 `agent/* 与 tools/* 瀑布` 是两个通配符, 不是一段
 * 斜体 —— 少了这条判据, 那两个星号会被当标记吃掉(260925 实测: harness-arch / layered 两张
 * 既有图的星号消失、**盒宽跟着变小**, 而这种静默改写正是本文件存在的理由)。
 *
 * 刻意只取这一条, **不抄 CommonMark 的左右 flanking / 标点分类 / rule of 3**: 一条能背下来的
 * 规矩胜过一套要查文档的规矩。要写紧贴空白的字面星号, 用 `\*`。
 */
const touchesText = (ch: string | undefined): boolean => ch !== undefined && !/\s/.test(ch);

/** paint 闭标记的值区间: 第一个**未被转义**的 `}`; 没有则整条不算标记 */
function findCloseBrace(src: string, from: number): number {
  for (let i = from; i < src.length; i += 1) {
    if (src[i] === '\\' && i + 1 < src.length && isEscapeStart(src[i + 1])) { i += 1; continue; }
    if (src[i] === '}') return i;
  }
  return -1;
}

/** 标记的**形状**(不看资格): 该位置不是标记则返回 `undefined`, 照样当字面量一个个字符往前推 */
function tokenShape(src: string, i: number): Omit<Token, 'canOpen' | 'canClose'> | undefined {
  const ch = src[i];
  // 最长匹配: 两个星号先认 `**`, 落单的星号才是斜体
  if (ch === '*') return src[i + 1] === '*' ? { kind: 'bold', at: i, len: 2, role: 'both' } : { kind: 'italic', at: i, len: 1, role: 'both' };
  if (ch === '~' && src[i + 1] === '~') return { kind: 'strike', at: i, len: 2, role: 'both' };
  if (ch === '[') return { kind: 'paint', at: i, len: 1, role: 'open' };
  if (ch === ']' && src[i + 1] === '{') {
    const close = findCloseBrace(src, i + 2);
    if (close < 0) return undefined;
    const value = decode(src, i + 2, close).trim();
    // 空值不是标记(`[]{}` 整条退字面量): 没有色可着, 认了它只会白吃四个字符
    if (!value) return undefined;
    return { kind: 'paint', at: i, len: close + 1 - i, role: 'close', value };
  }
  return undefined;
}

function tokenAt(src: string, i: number): Token | undefined {
  const t = tokenShape(src, i);
  if (!t) return undefined;
  return { ...t, canOpen: touchesText(src[i + t.len]), canClose: touchesText(src[i - 1]) };
}

/** 扫出全部标记(跳过转义 —— 被转义的字符**不参与配对**) */
function scanTokens(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    if (src[i] === '\\' && i + 1 < src.length && isEscapeStart(src[i + 1])) { i += 2; continue; }
    const t = tokenAt(src, i);
    if (t) { tokens.push(t); i += t.len; continue; }
    i += 1;
  }
  return tokens;
}

/** 一对**成立于**的标记: 内容是 `src.slice(contentStart, closeAt)` */
type Range = {
  kind: InlineKind;
  openAt: number;
  contentStart: number;
  closeAt: number;
  closeLen: number;
  value?: string;
};

/**
 * 把 token 配成区间(一个显式的开标记栈)。
 *
 * 三条规则合起来就是本文件对"配对"的全部主张:
 *   · 闭标记从**栈顶往下**找同类开标记; 找不到 = 落单 ⇒ 该 token 退字面量, 不影响别人
 *   · 两用标记栈上没同类 ⇒ 它当开标记(严格的"先出现即开", 于是 `**a**` 的两颗星必是一开一闭)
 *   · 找到的开标记其上方那些(比它更内层)**一律作废退字面量** ⇒ 交叉 nesting 就此消解;
 *     这一刀也顺手保证了结果**必定不交叉**(穿越区间的两条永远配不成一对)
 */
function pairRanges(src: string): Range[] {
  const stack: Token[] = [];
  const ranges: Range[] = [];
  for (const t of scanTokens(src)) {
    // `[` 只有开这一边: 没资格当开标记就退字面量
    if (t.role === 'open') { if (t.canOpen) stack.push(t); continue; }
    // 闭标记(以及两用标记当闭标记用): 从栈顶往下找同类开标记
    let idx = -1;
    if (t.canClose) for (let k = stack.length - 1; k >= 0; k -= 1) if (stack[k].kind === t.kind) { idx = k; break; }
    if (idx < 0) {
      // 落单: 两用标记还有"当开标记"这条退路(见 `touchesText`), 只闭的 paint 闭标记则退字面量
      if (t.role === 'both' && t.canOpen) stack.push(t);
      continue;
    }
    const open = stack[idx];
    // 丢弃被配上的开标记**与它上方那些**: 上方的比它更内层, 交叉时作废
    stack.length = idx;
    ranges.push({
      kind: t.kind, openAt: open.at, contentStart: open.at + open.len,
      closeAt: t.at, closeLen: t.len, value: t.value,
    });
  }
  // 栈里剩下的全是落单开标记 ⇒ 退字面量(不 push 任何区间)
  return ranges.sort((a, b) => a.openAt - b.openAt);
}

/** 把一条区间叠到外层样式袋上 —— paint 的值覆盖前者(内层赢) */
function applyStyle(base: InlineStyleBag, r: Range): InlineStyleBag {
  switch (r.kind) {
    case 'bold': return { ...base, bold: true };
    case 'italic': return { ...base, italic: true };
    case 'strike': return { ...base, strike: true };
    default: return { ...base, paint: r.value };
  }
}

/**
 * 拆 run。不变式: 拼回 `runs.map(r => r.text).join('')` **恒等于**去掉转义后的原文
 * (`textUnits` 这类按字数算的口径因此不必理解标记语法)。
 *
 * 这条不变式是**落单标记必须退回字面量**的理由: 中间态的对子若被当作标记吃掉, 拼接就少字符,
 * 而"量宽的那串字"与"画出来的那串字"于是再次分叉 —— 本文件存在的全部意义就是不让它分叉。
 */
export function parseTextRuns(text: string): TextRun[] {
  const src = String(text ?? '');
  if (!src) return [{ text: '', start: 0, end: 0 }];
  const runs: TextRun[] = [];
  // 区间非交叉且不可重叠 ⇒ 按 openAt 序递归即可: 游标走过的区间绝不会再被外层看见
  const ranges = pairRanges(src);
  let cursor = 0;
  const push = (from: number, to: number, style: InlineStyleBag): void => {
    if (to <= from) return;
    runs.push({
      text: decode(src, from, to),
      // 每个 run **各穿一份自己的样式袋**: 同层的兄弟 run 共享同一个外层袋对象, 交出去的就是
      // "改一个 run 悄悄改了另一个"的别名洞(消费者眼下只读, 但那不是可以依赖的事实)
      style: Object.keys(style).length ? { ...style } : undefined,
      start: from,
      end: to,
    });
  };
  const sequence = (from: number, to: number, style: InlineStyleBag): void => {
    let pos = from;
    while (cursor < ranges.length && ranges[cursor].openAt < to) {
      const r = ranges[cursor];
      cursor += 1;
      push(pos, r.openAt, style);                  // 标记之前那段字面量(可能含落单标记原文)
      sequence(r.contentStart, r.closeAt, applyStyle(style, r));
      pos = r.closeAt + r.closeLen;                // 跳过闭标记(`]{…}` 这种带值的也一起跳掉)
    }
    push(pos, to, style);
  };
  sequence(0, src.length, {});
  return runs.length ? runs : [{ text: '', start: 0, end: 0 }];
}

/** 去掉标记后的纯文本(给"这行有多少字 / 该给多宽"的对账用; 与 run 划分无关) */
export const plainText = (text: string): string => parseTextRuns(text).map((r) => r.text).join('');

/** 标记字 / 反斜杠 —— 只有它们在场才可能改变字节 */
const MARK_RE = /[*~[\]\\]/;

/**
 * 含标记语法(标记**或**转义)才需要走 `parseTextRuns` —— 纯文本这条快路径据此少一次数组分配。
 * 判据必须把转义算进来(`\*` 在图上是一个星号); 落单括号(`a]b`)也会走 parse, 但输出逐字节不变
 * (拿一次扫描换判据的简单, 而不是反过来)。
 */
export const needsTextParse = (text: string): boolean => MARK_RE.test(text);
