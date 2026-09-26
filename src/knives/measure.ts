// =====================================================================
// knives/measure · 文本宽度估算(字符宽度表, 无浏览器)
//
// 定位: oracle 优先级是 blink(真字体真渲染) > 宽度表(设计稿 §5.2)。这张表服务三种
// "浏览器不在场"的场景: 无浏览器快速预估 / 烘焙 SVG 给系统字体观看者的余量 / blink 缺席时的兜底。
// 所以**输出永远是估算值** —— 调用方把它写回 scene 时必须打 `bounds_source: "estimate"`
// (设计稿 §4.2): estimate 出草稿图, 不许出交付图(交付图要 blink 实测的 layout)。
//
// 度量两层, 都可复算:
//   1. `textUnits` 文本 → 字符单位数(半角 1 / 全角 2, 含 variation selector 处理)
//   2. `measureText` 单位数 × 每单位每字号推进宽度 → 像素宽 + 行盒高
//
// 区间表整体移植自 Archify `renderers/shared/utils.mjs:220` 的 `textUnits`(East Asian Width
// 精确区间 + VS16 算 2 / VS15 算 1 / 裸 selector 跳过)。**不用简化的 "ASCII 1 / CJK 2"**:
// 简化版遇 emoji 直接量错 —— ✈️(U+2708 U+FE0F)与"中文"同宽, 而 ⭐(U+2B50) 这类带 emoji
// presentation 的 BMP 符号也是方形推进, 只有区间表能一次覆盖。
//
// 边界(明确不做):
//   · 零运行时依赖 —— 不引字体 / 不嵌 woff2 / 不碰 canvas; 真字体度量是 measury / blink 的活
//   · 单行度量 —— 多行是调用方 split 后逐行量的活, 这里不猜行盒排布
//   · 不做换行 / 截断 / 缩字 —— 布局决策不归 core
// =====================================================================

import { round1 } from '../geometry/vec.js';
import { INLINE_STYLE, needsTextParse, parseTextRuns } from '../geometry/inline-text.js';

// --- 度量参数(宽度表的全部可调旋钮) ----------------------------------

/**
 * 每个字符单位的推进宽度(em): 0.6。
 * 取 Archify `renderers/shared/text-fit.mjs` 的 `nodeTextFit.widthFactor`(那 0.6 是共享常量,
 * 数据流 / 生命周期 / 架构三个渲染器都按它算)。半角 0.6em、全角 1.2em, 恰好 2 倍。
 */
export const ADVANCE_PER_UNIT_EM = 0.6;

/** 行盒高度(em): 1.4 —— Infographic 的 `lineHeight` 缺省规则 `fontSize × 1.4`(设计稿 §6.5)。 */
export const LINE_HEIGHT_EM = 1.4;

/**
 * 估算余量: 1.5%。移植 Infographic 的 `FONT_EXTEND_FACTOR = 1.015`(设计稿 §6.5 点名的两个数值细节之一),
 * 在宽度与高度上各留一点"宁宽不窄"的余量, 防估窄了文字溢出错位的盒子。
 * blink / measury 那两条 oracle 路**不带**这个余量 —— 它是估算专属。
 */
export const ESTIMATE_SAFETY_FACTOR = 1.015;

/**
 * 粗体加宽与粗体阈值**不在这里** —— 它们是行内标记的一种, 住在 `geometry/inline-text` 的
 * `INLINE_STYLE.bold`(`advanceGain` / `weight`): 度量与渲染必须读同一份, 各写一个 0.03 或 600
 * 就是把"量的是这串、画的是另一串"请回来(260925 隐患①)。本次调用点见 `measureText`。
 */

// --- East Asian Width (W/F) 区间表 ------------------------------------

// 两列推进宽的码点: 汉字 / 假名 / Hangul / 全角标点, 以及带 emoji presentation 的 BMP 符号
// (U+2705 / U+2B50 / U+26A1 / U+231B ...)与增补平面 emoji。写成区间而不用
// `\p{East_Asian_Width=W}`: V8 没有这个 property escape。
// 两处边界判断值得点名:
//   · 半角片假名与半角标点(U+FF61-U+FF9F)**不在**表内 —— 它们是 H, 落进"整个 FF 块"就量宽一倍
//   · U+A97C 是 Hangul Jamo Extended-A 最后一个已分配码点(U+A97D-U+A97F 未分配 → Neutral)
// 合并粒度比逐条 UAX #11 粗(相邻段被并成 2E80-A4CF 这类大区间), 方向偏宽 —— 与 variation
// selector 的处理同向: 估宽只撑盒子, 估窄才把文字溢出盒子。
const FULLWIDTH_RE = /[\u1100-\u115F\u231A-\u231B\u2329-\u232A\u23E9-\u23EC\u23F0\u23F3\u25FD-\u25FE\u2614-\u2615\u2630-\u2637\u2648-\u2653\u267F\u268A-\u268F\u2693\u26A1\u26AA-\u26AB\u26BD-\u26BE\u26C4-\u26C5\u26CE\u26D4\u26EA\u26F2-\u26F3\u26F5\u26FA\u26FD\u2705\u270A-\u270B\u2728\u274C\u274E\u2753-\u2755\u2757\u2795-\u2797\u27B0\u27BF\u2B1B-\u2B1C\u2B50\u2B55\u2E80-\uA4CF\uA960-\uA97C\uAC00-\uD7A3\uF900-\uFAFF\uFE10-\uFE19\uFE30-\uFE6F\uFF01-\uFF60\uFFE0-\uFFE6\u{16FE0}-\u{18DFF}\u{1AFF0}-\u{1AFFF}\u{1B000}-\u{1B2FF}\u{1F000}-\u{1FAFF}\u{20000}-\u{3FFFD}]/u;

// variation selector(U+FE00-U+FE0F)自身没有推进宽度: 它改的是**前一个**基字的呈现。
// VS15(U+FE0E) 要文本呈现(窄), VS16(U+FE0F) 要 emoji 呈现(方形)。所以"基字 + selector"
// 一律按 **selector** 量, 不按基字 —— 否则把带 emoji presentation 的基字写进上表之后,
// U+2B50 U+FE0F 会从 2 单位变成 3, 而屏幕上仍是同一个方块。
// 基字 + 不能接受 emoji presentation 的 selector 属畸形输入, 量宽是安全方向(理由同表尾注释)。
const VARIATION_SELECTOR_FIRST = 0xfe00;
const VARIATION_SELECTOR_LAST = 0xfe0f;
const VARIATION_SELECTOR_TEXT = 0xfe0e;
const VARIATION_SELECTOR_EMOJI = 0xfe0f;

// --- 字符单位 ----------------------------------------------------------

/** 一次扫描出两个数: units(字符单位数)与 chars(有推进的码点数, 供 letterSpacing 累加) */
function scanUnits(text: string): { units: number; chars: number } {
  const chars = Array.from(String(text ?? ''));
  let units = 0;
  let advances = 0;
  for (let i = 0; i < chars.length; i += 1) {
    const codePoint = chars[i].codePointAt(0) ?? -1;
    // 裸 selector 直接跳过: 它自己不占宽, 只改前一个基字的呈现
    if (codePoint >= VARIATION_SELECTOR_FIRST && codePoint <= VARIATION_SELECTOR_LAST) continue;
    const next = chars[i + 1]?.codePointAt(0) ?? -1;
    if (next === VARIATION_SELECTOR_EMOJI) units += 2;
    else if (next === VARIATION_SELECTOR_TEXT) units += 1;
    else units += FULLWIDTH_RE.test(chars[i]) ? 2 : 1;
    advances += 1;
  }
  return { units, chars: advances };
}

/**
 * 文本的字符单位数: 半角 1 / 全角 2(详见上面的区间表)。
 * 这是宽度估算的唯一几何量, 单位到像素的折算在 `measureText` 里。
 */
export function textUnits(text: string): number {
  return scanUnits(text).units;
}

// --- 文本估算 ----------------------------------------------------------

export type MeasureOptions = {
  /** 字号(px) */
  fontSize: number;
  /** 字重(CSS 数值): 行内粗体取 `max(本值, INLINE_STYLE.bold.weight)` 后按粗体加宽 */
  weight?: number;
  /** 字距(px): 逐渲染字符累加(与 CSS/SVG letter-spacing 的"每字符后加一次"同口径) */
  letterSpacing?: number;
};

export type MeasureResult = {
  width: number;
  /** 单行行盒高: 只由字号决定, 与文本内容无关 */
  height: number;
  /** 字符单位数(`textUnits` 的结果, 一并回传供调用方对账) */
  units: number;
};

/**
 * 单行文本的估算尺寸(px)。纯函数: 同输入必同输出(不受字体 / 环境 / 时间影响)。
 * 数值走 `round1` 收口, 与 core 其余出口一致(README 契约 3: 字节确定)。
 *
 * **行内样式(260920 加粗, 260925 加斜体 / 删除线 / 着色)**: 文本里的标记会先经
 * `parseTextRuns` 拆成 run, 再逐 run 累加宽度 —— 这件事必须在**度量**这一层做, 而不是各自在
 * 渲染 / 门禁里做: 否则 `label_fit` 量的是"带星号的那串字"、画出来的是"粗体那截字"。
 * 目前只有**粗体**改宽(`INLINE_STYLE.bold.advanceGain`): 斜体在正体字宽上摆动方向不定、
 * 删除线是 `text-decoration` 属性、着色只换色 —— 三者都不进推进宽度(它们也都不进行高)。
 * 无标记的文本走单 run 快路径, 结果与加 run 支持之前**逐字节相同**(既有 golden 不动)。
 */
export function measureText(text: string, opts: MeasureOptions): MeasureResult {
  const base = opts.weight ?? 400;
  const runs = needsTextParse(text) ? parseTextRuns(text) : [{ text, start: 0, end: text.length }];
  let units = 0;
  let chars = 0;
  let advanceEm = 0;
  for (const run of runs) {
    const scan = scanUnits(run.text);
    // 加宽判据用的字重与渲染面**同一条式子**(`max(行字重, 粗体档位)`), 表也只读同一份
    const w = run.style?.bold ? Math.max(base, INLINE_STYLE.bold.weight) : base;
    const gain = w >= INLINE_STYLE.bold.weight ? 1 + INLINE_STYLE.bold.advanceGain : 1;
    units += scan.units;
    chars += scan.chars;
    advanceEm += scan.units * ADVANCE_PER_UNIT_EM * gain;
  }
  const width = advanceEm * opts.fontSize + (opts.letterSpacing ?? 0) * chars;
  const height = opts.fontSize * LINE_HEIGHT_EM;
  return {
    width: round1(width * ESTIMATE_SAFETY_FACTOR),
    height: round1(height * ESTIMATE_SAFETY_FACTOR),
    units,
  };
}
