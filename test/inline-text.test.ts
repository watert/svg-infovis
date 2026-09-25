// =====================================================================
// inline-text · 行内标记(`**粗**` / `*斜*` / `~~删~~` / `[字]{accent}`)的唯一一份解析
//
// 病灶(260920 卡片图): `Object Type: **Airport**` 里的标记有两个消费者 —— 渲染面要把它拆成
// `<tspan>`、度量面(`label_fit` / `nodeFit` / `labelBoxSize`)要按 run 加宽。两家各写一份解析,
// 结果就是"门禁量的宽度"与"画出来的宽度"是两串不同的字 —— 本仓最贵的那类事故。
//
// 本文件钉七件事(每条都是"把 bug 放回去会红"):
//   ① 拆 run 的**不变式**: 拼回恒等于去掉转义后的原文
//   ② 落单的标记退回**字面量** —— 不许吞字符, 更不许把后半行悄悄变样
//      (260920 初版真的会吞: `parseTextRuns('a ** b')` 得到 `[{text:'a '},{text:' b',bold:true}]`,
//       星号不见了、后半句变粗, 而文件头的注释与不变式都写着"落单的按字面量原样输出")
//   ③ **原串下标**(`start` / `end`): run 的内容落在源串哪一格 —— 门禁报位靠它
//   ④ 标记**紧贴内容**的判据: 通配符 `agent/* 与 tools/* 瀑布` 是两个星号, 不是一段斜体
//      (260925 实测: 少了这条, harness-arch / layered 两张既有图的星号被吃掉、盒宽跟着变小)
//   ⑤ 度量按 run 加宽, 且与"逐 run 手算"**同值**(不是"大约宽一点"); 斜体 / 删除 / 着色不加宽
//   ⑥ 渲染面读同一份 run 表: 产物里那截走 `<tspan>`, 原串里没有星号; 无标记的老路径不挂 tspan
//   ⑦ **三个渲染面同一份发射器**(节点标签 / 边标签遮罩片 / 旁注) —— 谁再各画各的就是双源复发
// =====================================================================

import { describe, expect, it } from 'bun:test';
import {
  INLINE_KINDS, INLINE_STYLE, type InlineStyleBag, type InlineStyleSpec, type TextRun,
  needsTextParse, parseTextRuns, plainText,
} from '../src/geometry/inline-text';
import { ADVANCE_PER_UNIT_EM, ESTIMATE_SAFETY_FACTOR, measureText } from '../src/knives/measure';
import { svg } from '../src/descriptor';
import { toSVG } from '../src/serialize';
import { nodeShape } from '../src/shapes/node';
import { labelBoxShape } from '../src/shapes/text';
import { createScene } from '../src/scene';
import { exportScene } from '../src/export';
import { THEMES } from '../src/theme';
import { round1 } from '../src/geometry/vec';

const FS = 12;
/** 加宽判据与增益都从表里读 —— 表是唯一的声明处, 测试里再抄一份就白测了 */
const BOLD_WEIGHT = INLINE_STYLE.bold.weight;
const BOLD_GAIN = INLINE_STYLE.bold.advanceGain;
const BOLD: InlineStyleBag = { bold: true };
const ITALIC: InlineStyleBag = { italic: true };
const STRIKE: InlineStyleBag = { strike: true };
const paint = (v: string): InlineStyleBag => ({ paint: v });

/** 期望 run 表的紧凑写法: 按出现顺序给 `[样式袋, 文字]`, **原串下标由 `indexOf` 推出** */
const runsOf = (src: string, spec: Array<[InlineStyleBag | undefined, string]>): TextRun[] => {
  let cursor = 0;
  return spec.map(([style, text]) => {
    const start = src.indexOf(text, cursor);
    if (start < 0) throw new Error(`测试期望写错了: ${JSON.stringify(text)} 不在 ${JSON.stringify(src)} 的 ${cursor} 之后`);
    cursor = start + text.length;
    return { text, start, end: cursor, ...(style ? { style } : {}) };
  });
};

/**
 * 与 `measureText` **同式的独立复算**: 逐 run 累加推进, 粗体那几截乘 `(1 + 增益)`。
 * 单位数借 `measureText(...).units` 取(它是内容量、与字号无关), 但乘式与加宽判据在这里重写一遍 ——
 * 直接调 `measureText` 比宽度等于拿被测函数验证被测函数。
 */
const recompute = (runs: ReadonlyArray<readonly [string, number]>): number => {
  const em = runs.reduce(
    (acc, [text, weight]) =>
      acc + textUnits(text) * ADVANCE_PER_UNIT_EM * (weight >= BOLD_WEIGHT ? 1 + BOLD_GAIN : 1),
    0,
  );
  return round1(em * FS * ESTIMATE_SAFETY_FACTOR);
};

/** 字符单位数(半角 1 / 全角 2): 只由去标记后的文字决定 */
const textUnits = (t: string): number => measureText(t, { fontSize: FS }).units;

/** 一张卡片的节点(用来验渲染面) */
const cardSvg = (label: string, weight = 400): string =>
  toSVG(svg(400, 100, [
    nodeShape({ x: 10, y: 10, w: 300, h: 60, label, fontSize: FS, weight, align: 'start', padX: 10 }),
  ]));

/** 一块边标签遮罩片(渲染面之二) */
const labelSvg = (content: string, theme?: (typeof THEMES)['light']): string =>
  toSVG(svg(200, 60, [labelBoxShape({ x: 100, y: 30, w: 120, h: 22, content, theme })]));

/** 一条旁注(渲染面之三): 走完整出口(exportScene), 不是只调形状函数 */
const textSvg = (content: string): string =>
  exportScene(createScene({
    width: 300, height: 80, nodes: [], edges: [],
    texts: [{ id: 't', rect: { x: 10, y: 10, w: 280, h: 60 }, text: content }],
  }), { skipAudit: true }).svg;

describe('inline-text · 标记解析', () => {
  type CompactSpec = Array<[InlineStyleBag | undefined, string]>;
  const TABLE: Array<[string, CompactSpec | TextRun[]]> = [
    ['纯文本', [[undefined, '纯文本']]],
    ['Object Type: **Airport**', [[undefined, 'Object Type: '], [BOLD, 'Airport']]],
    ['**A** 与 **B**', [[BOLD, 'A'], [undefined, ' 与 '], [BOLD, 'B']]],
    ['**重点**', [[BOLD, '重点']]],
    // 落单: **原样留在文字里** —— 星号可见, 于是它自己暴露
    ['a ** b', [[undefined, 'a ** b']]],
    ['a**', [[undefined, 'a**']]],
    ['**', [[undefined, '**']]],
    // 三对里的最后一个落单: 前两对作数, 落单那段保持原样
    ['a **b** c **d', [[undefined, 'a '], [BOLD, 'b'], [undefined, ' c **d']]],
    // 转义: 反斜杠被吃掉, 星号留下; 且不参与标记配对
    ['a \\* b', [{ text: 'a * b', start: 0, end: 6 }]],
    ['a\\\\b', [{ text: 'a\\b', start: 0, end: 4 }]],
    ['\\*\\*x', [{ text: '**x', start: 0, end: 5 }]],
    ['', [[undefined, '']]],
    // 斜体(最长匹配: 先认 `**` 再认 `*`)
    ['*斜*', [[ITALIC, '斜']]],
    ['*斜*与*正*', [[ITALIC, '斜'], [undefined, '与'], [ITALIC, '正']]],
    // 嵌套不交叉 ⇒ 样式合并
    ['**粗 *斜* 粗**', [[BOLD, '粗 '], [{ bold: true, italic: true }, '斜'], [BOLD, ' 粗']]],
    // 交叉 ⇒ 内层 opener 退字面量(外层闭标记先到), 于是 `**` 那对整条不成标记
    ['*a **b* c**', [[ITALIC, 'a **b'], [undefined, ' c**']]],
    ['~~删~~', [[STRIKE, '删']]],
    ['a ~~b~~ c', [[undefined, 'a '], [STRIKE, 'b'], [undefined, ' c']]],
    ['~~a', [[undefined, '~~a']]],
    ['a~b', [[undefined, 'a~b']]],
    // 着色: `{…}` 里是 tone 名或色值, 值两端空白 trim 掉
    ['[文字]{accent}', [[paint('accent'), '文字']]],
    ['正 [字]{#b91c1c} 文', [[undefined, '正 '], [paint('#b91c1c'), '字'], [undefined, ' 文']]],
    ['[字]{ accent }', [[paint('accent'), '字']]],
    // 孤立括号 / 空值 / 转义括号: 一律退字面量
    ['[字', [[undefined, '[字']]],
    ['[字]', [[undefined, '[字]']]],
    ['[字]{}', [[undefined, '[字]{}']]],
    ['\\[字\\]{accent}', [{ text: '[字]{accent}', start: 0, end: 13 }]],
    // 紧贴判据: 通配符 / 算式里的星号不是标记(既有图里全是这种)
    ['agent/* 与 tools/* 瀑布', [[undefined, 'agent/* 与 tools/* 瀑布']]],
    ['2 * 3 = 6', [[undefined, '2 * 3 = 6']]],
    ['a *b* c', [[undefined, 'a '], [ITALIC, 'b'], [undefined, ' c']]],
    // 三个星号: 最长匹配先吃掉 `**`, 剩的那个当字面量 —— 结果"看得见的怪", 而不是崩溃
    ['***粗***', [{ text: '*粗', start: 2, end: 4, style: BOLD }, { text: '*', start: 6, end: 7 }]],
    // 两条着色各自成段; 嵌套时内层的值覆盖外层(内层的 `[` 是标记, 被吃掉)
    ['[a]{rose}[b]{blue}', [[paint('rose'), 'a'], [paint('blue'), 'b']]],
    ['[a[b]{blue}]{rose}', [
      { text: 'a', start: 1, end: 2, style: paint('rose') },
      { text: 'b', start: 3, end: 4, style: paint('blue') },
    ]],
  ];

  /** 期望值两种写法: 紧凑写法(下标由 `indexOf` 推)或**完整 run**(转义 / 自相似串里推不出来) */
  const resolve = (src: string, spec: CompactSpec | TextRun[]): TextRun[] =>
    Array.isArray(spec[0]) ? runsOf(src, spec as CompactSpec) : (spec as TextRun[]);

  for (const [src, spec] of TABLE) {
    it(`拆 run: ${JSON.stringify(src)}`, () => {
      expect(parseTextRuns(src)).toEqual(resolve(src, spec));
    });
  }

  it('不变式: 拼回恰等于 `plainText` —— 于是按字数算的口径不必理解标记语法', () => {
    for (const [src] of TABLE) {
      const runs = parseTextRuns(src);
      expect(runs.map((r) => r.text).join('')).toBe(plainText(src));
    }
  });

  it('下标不变式: `start/end` 圈出的原串区间, 去转义后就是这段 run 的文字', () => {
    for (const [src] of TABLE) {
      for (const r of parseTextRuns(src)) {
        expect(unescape(src.slice(r.start, r.end))).toBe(r.text);
      }
    }
  });

  it('区间有序不重叠、落在串内 —— 门禁按 `start` 报位时不许指向区间外', () => {
    for (const [src] of TABLE) {
      const runs = parseTextRuns(src);
      runs.forEach((r, i) => {
        expect(r.start).toBeGreaterThanOrEqual(0);
        expect(r.end).toBeLessThanOrEqual(src.length);
        expect(r.end).toBeGreaterThanOrEqual(r.start + r.text.length);
        if (i) expect(r.start).toBeGreaterThanOrEqual(runs[i - 1].end);
      });
    }
  });

  it('同层的两个 run 各穿**自己那份**样式袋(改一个不许动到另一个)', () => {
    const runs = parseTextRuns('**a *b* c**');
    expect(runs).toHaveLength(3);
    // 引用不同 = 没有别名洞(值相等是应有之义, 这里钉的是"不是同一个对象")
    expect(runs[0].style).not.toBe(runs[2].style);
    expect(runs[0].style).toEqual(runs[2].style);
    expect(runs[1].style).toEqual({ bold: true, italic: true });
  });

  it('缺口只许落在**标记字符**上 —— "样式不改文本长度"的最强形式(吃掉一个正文字符这里立刻响)', () => {
    for (const [src] of TABLE) expect(gapOnlyMarkers(src)).toBe(true);
  });

  it('不变式落空的那一类: 落单标记若被当标记吃掉, 拼接就少两个字符(这是本文件存在的理由)', () => {
    const runs = parseTextRuns('a ** b');
    expect(runs.map((r) => r.text).join('')).toHaveLength('a ** b'.length);
    expect(runs.some((r) => r.style)).toBe(false);
  });

  it('fuzz: 字母表上穷举短串 + 定长伪随机的长串, 四条不变式一条都不许破', () => {
    const ALPHABET = ['a', ' ', '*', '~', '[', ']', '{', '}', '\\', '斜'];
    const sources: string[] = [''];
    for (const a of ALPHABET) {
      sources.push(a);
      for (const b of ALPHABET) {
        sources.push(a + b);
        for (const c of ALPHABET) sources.push(a + b + c);
      }
    }
    // 定长伪随机(不用 Math.random: 失败要能原地复现同一个串)
    let seed = 20260925;
    const next = (): string => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return ALPHABET[seed % ALPHABET.length];
    };
    for (let i = 0; i < 2000; i += 1) {
      let s = '';
      for (let n = 0; n < 12; n += 1) s += next();
      sources.push(s);
    }
    for (const src of sources) {
      const runs = parseTextRuns(src);
      expect(runs.length).toBeGreaterThan(0);
      expect(runs.map((r) => r.text).join('')).toBe(plainText(src));
      let prevEnd = 0;
      for (const r of runs) {
        // 转义只让文字**变短**, 标记只会把区间**推后** —— 两条合起来就是"区间落得下"
        expect(r.start).toBeGreaterThanOrEqual(prevEnd);
        expect(unescape(src.slice(r.start, r.end))).toBe(r.text);
        prevEnd = r.end;
      }
      // 缺口(未被任何 run 覆盖的位置)只能是**被消费掉的标记** —— 静默吃掉一个正文字符在这里响
      expect(gapOnlyMarkers(src, runs)).toBe(true);
    }
  });

  it('`needsTextParse` 把四类标记与**转义**都算进来(只判星号的话 `a\\*b` 会被画成两个字符)', () => {
    expect(needsTextParse('plain')).toBe(false);
    expect(needsTextParse('a*b')).toBe(true);
    expect(needsTextParse('a~b')).toBe(true);
    expect(needsTextParse('a[b')).toBe(true);
    expect(needsTextParse('a\\b')).toBe(true);
    // 孤立右括号也会走 parse —— 判据宁可宽一点(拿一次扫描换判据的简单), 输出不变
    expect(needsTextParse('a]b')).toBe(true);
    expect(plainText('a]b')).toBe('a]b');
  });

  it('表与词表对得上, 且**只有粗体**改宽(其余样式进不了推进宽度)', () => {
    // `satisfies` 保留了每种规格的字面类型, 按统一规格读(表里有几种、词表就得对得上)
    const specOf = (k: (typeof INLINE_KINDS)[number]): InlineStyleSpec => INLINE_STYLE[k];
    for (const kind of INLINE_KINDS) expect(specOf(kind).mark).toBeTruthy();
    const widened = INLINE_KINDS.filter((k) => specOf(k).advanceGain !== undefined);
    expect(widened).toEqual(['bold']);
  });
});

describe('inline-text · 度量与渲染同源', () => {
  it('度量按 run 加宽, 且与逐 run 手算同值', () => {
    const marked = measureText('Object Type: **Airport**', { fontSize: FS, weight: 400 });
    const bare = measureText('Object Type: Airport', { fontSize: FS, weight: 400 });
    expect(marked.width).toBe(recompute([['Object Type: ', 400], ['Airport', BOLD_WEIGHT]]));
    expect(bare.width).toBe(recompute([['Object Type: Airport', 400]]));
    // 方向: 宁宽不窄 —— 粗体那截确实吃到了增益
    expect(marked.width).toBeGreaterThan(bare.width);
    // 字符数不变(标记不进字形流): 单位数只由去标记后的文字决定
    expect(marked.units).toBe(bare.units);
  });

  it('行字重已到粗体档时, 行内标记不再"二次加宽"(加宽是档位差, 不是叠加)', () => {
    // weight 600 下整行本来就是粗的 ⇒ 带标记与不带标记同宽
    const a = measureText('a **b** c', { fontSize: FS, weight: 600 });
    const b = measureText('a b c', { fontSize: FS, weight: 600 });
    expect(a.width).toBe(b.width);
    // 而 400 下两者必须不同 —— 否则上一条是"碰巧相等"
    expect(measureText('a **b** c', { fontSize: FS, weight: 400 }).width)
      .toBeGreaterThan(measureText('a b c', { fontSize: FS, weight: 400 }).width);
  });

  it('斜体 / 删除 / 着色**不加宽**(它们不改字宽也不改字距: 盒子按内容撑, 不按样式撑)', () => {
    for (const marked of ['a *b* c', 'a ~~b~~ c', 'a [b]{rose} c']) {
      const m = measureText(marked, { fontSize: FS, weight: 400 });
      const bare = measureText('a b c', { fontSize: FS, weight: 400 });
      expect(m.width).toBe(bare.width);
      expect(m.units).toBe(bare.units);
    }
  });

  it('通配符不是标记: 星号照旧上屏**且不改宽**(既有架构图的 `agent/*` 靠这一条)', () => {
    const glob = measureText('agent/*', { fontSize: FS });
    const escaped = measureText('agent/\\*', { fontSize: FS });
    expect(glob.width).toBe(escaped.width);
    const out = cardSvg('agent/* 与 tools/* 瀑布');
    expect(out).not.toContain('tspan');
    expect(out).toContain('>agent/* 与 tools/* 瀑布</text>');
  });

  it('渲染面读同一份 run 表: 产物里走 `<tspan>`, 且不会漏出一个星号', () => {
    const out = cardSvg('Object Type: **Airport**', 400);
    expect(out).toContain('<tspan font-weight="400.00">Object Type: </tspan>');
    expect(out).toContain('<tspan font-weight="600.00">Airport</tspan>');
    expect(out).not.toContain('*');
  });

  it('行内粗体取 `max(行字重, 600)`: 行字重 700 时那截是 700(不降级)', () => {
    const out = cardSvg('**Airport**', 700);
    expect(out).toContain('<tspan font-weight="700.00">Airport</tspan>');
  });

  it('斜体走 `font-style`、删除线走 `text-decoration`(属性, 不画线)', () => {
    expect(cardSvg('*斜*', 400)).toContain('font-style="italic"');
    expect(cardSvg('**粗 *斜* 粗**', 400)).toContain('<tspan font-weight="600.00" font-style="italic">斜</tspan>');
    expect(cardSvg('~~删~~', 400)).toContain('text-decoration="line-through"');
  });

  it('着色: tone 名查主题的**文字槽**, 不是 tone 名就当色值用', () => {
    expect(cardSvg('[警示]{rose}', 400)).toContain(`fill="${THEMES.light.tones.rose.text}"`);
    expect(cardSvg('[警示]{#b91c1c}', 400)).toContain('fill="#b91c1c"');
  });

  it('无标记的老路径**不挂 tspan**(老产物字节不变)', () => {
    const out = cardSvg('Object Type: Airport', 400);
    expect(out).not.toContain('tspan');
    expect(out).toContain('>Object Type: Airport</text>');
  });

  it('落单标记在产物里看得见(星号没被吃掉)', () => {
    const out = cardSvg('a ** b', 400);
    expect(out).toContain('>a ** b</text>');
  });

  it('边标签遮罩片认同一份解析 —— **旧代码这里画的是两个字面星号**(这条在旧代码上会红)', () => {
    const out = labelSvg('**过审**');
    expect(out).toContain('<tspan font-weight="600.00">过审</tspan>');
    expect(out).not.toContain('*');
    // 遮罩底色与文字色不动: 这一版只加"认标记", 不动观感
    expect(out).toContain(`fill="${THEMES.light.canvas}"`);
    // 字重口径也统一了: 缺省档(400)不写属性 —— 与节点标签那条老规矩同一条(SVG 缺省即 400)
    expect(labelSvg('过审', THEMES.light)).not.toContain('font-weight');
    expect(toSVG(svg(200, 60, [labelBoxShape({ x: 100, y: 30, w: 120, h: 22, content: '过审', weight: 400 })])))
      .not.toContain('font-weight');
    expect(toSVG(svg(200, 60, [labelBoxShape({ x: 100, y: 30, w: 120, h: 22, content: '过审', weight: 600 })])))
      .toContain('font-weight="600"');
  });

  it('旁注(`scene.texts`)走完整出口也认标记: 产物含 tspan, 不含星号', () => {
    const out = textSvg('旁注 **重点**');
    expect(out).toContain('<tspan font-weight="600.00">重点</tspan>');
    expect(out).toContain('<tspan font-weight="400.00">旁注 </tspan>');
    expect(out).not.toContain('**');
  });
});

/** 独立重算的去转义(不调被测函数): 吃反斜杠留字符, 反斜杠后面不是可转义字符时它是它自己 */
const ESCAPABLE = '*~[]{}\\';
function unescape(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i += 1) {
    const next = s[i + 1];
    if (s[i] === '\\' && next !== undefined && ESCAPABLE.includes(next)) { out += next; i += 1; continue; }
    out += s[i];
  }
  return out;
}

/**
 * 缺口判据: 未被任何 run 覆盖的位置**必须**落在被消费的标记上(星号 / 波浪号 / `[` / 整个 `]{…}`)。
 * 不带 runs 参数时自己解析一遍(给表格用例用)。
 */
function gapOnlyMarkers(src: string, runs: TextRun[] = parseTextRuns(src)): boolean {
  const covered = new Array<boolean>(src.length).fill(false);
  for (const r of runs) for (let i = r.start; i < r.end; i += 1) covered[i] = true;
  for (let i = 0; i < src.length; i += 1) {
    if (covered[i]) continue;
    const ch = src[i];
    if (ch === '*' || ch === '~' || ch === '[') continue;
    if (ch !== ']' || src[i + 1] !== '{') return false;
    // `]{…}`: 值也是标记的一部分, 整块(到第一个未被转义的 `}`)必须一起没被覆盖
    let j = i + 2;
    while (j < src.length && src[j] !== '}') j += src[j] === '\\' ? 2 : 1;
    if (j >= src.length) return false;
    for (let k = i; k <= j; k += 1) if (covered[k]) return false;
    i = j;
  }
  return true;
}
