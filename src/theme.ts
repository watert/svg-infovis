// =====================================================================
// theme · 主题系统 (7 色 tone × light/dark × outline/solid 两态)
//
// 设计意图(见 docs/theme.md): 主题的价值不在"颜色多", 而在**同一套语义槽**
// 能同时撑住 outline(克制的连线图)与 solid(演示稿级主视觉)。
//
// 纪律:
//   · 色值直接 hardcode(抄 tailwind 色阶), 不做 OKLCH 推导 —— 设计稿 §三 的老规矩
//   · shape 只读语义槽(border/surface/text/solidBg/solidText/tint), 不认具体色值
//   · 深浅两档各写各的, 不做运行时颜色数学 —— 免得"A 模式下好看、B 模式下字看不见"
// =====================================================================

import { type Descriptor, rect } from './descriptor.js';
// 主题层网格缺省的**形状**来自 grid-pattern 的零件(纯类型导入: 它不认识主题, 运行时无环)
import type { GridDefaults } from './shapes/grid-pattern.js';

export type Tone = 'slate' | 'blue' | 'emerald' | 'amber' | 'rose' | 'violet' | 'teal';
export type Mode = 'light' | 'dark' | 'paper';
/** outline = 描边(默认, 克制); tint = 浅色强调底(学术图的角色框); solid = 实色底(强调, 演示稿感) */
export type Variant = 'outline' | 'tint' | 'solid';

export const TONES: Tone[] = ['slate', 'blue', 'emerald', 'amber', 'rose', 'violet', 'teal'];

/** 一套 tone 在某个 mode 下的语义槽 */
export type TonePalette = {
  /** outline: 描边色 */
  border: string;
  /** outline: 填充 */
  surface: string;
  /** outline: 文字色(与 surface 对比达标) */
  text: string;
  /** solid: 实底色 */
  solidBg: string;
  /** solid: 实底上的文字色(浅色底配深字, 不无脑白字) */
  solidText: string;
  /** solid: 描边(通常同色系深一档) */
  solidBorder: string;
  /** 浅色强调底(分组标题条 / 徽标 / 选中态) */
  tint: string;
};

export type Theme = {
  mode: Mode;
  /** 画布底色 */
  canvas: string;
  /**
   * 主题字体栈(缺省 undefined = 出口用 sans 栈)。**字体是主题级决策**(260920 archify 对账:
   * mono 观感是 archify 主题的一半): 出口根 attrs 按 `opts.fontFamily ?? theme.fontFamily ?? sans栈`
   * 取值, 节点/文本的 `font-family: inherit` 全线继承它。不设就不输出 —— 老产物字节不变。
   */
  fontFamily?: string;
  /**
   * **主题级网格底纹缺省**(260920): 设了它, 这档主题的产物**默认就带一层底纹** ——
   * paper 给的是细线格(纸感的一半), light/dark 刻意不设槽(所以那两档的老产物字节不变)。
   *
   * 出口口径三层: `opts.grid === false` 显式关 · 给对象则**逐字段**盖在这上面 · 都不给就用它。
   * 可写哪些位见 `GridDefaults`(`id` 不在其中 —— 一图铺多种网格才需要那个区分)。
   */
  grid?: GridDefaults;
  /** 线 / 箭头 */
  edge: string;
  /** 标签文字与遮罩底 */
  label: string;
  labelBg: string;
  /** 分组框 */
  groupStroke: string;
  groupText: string;
  tones: Record<Tone, TonePalette>;
};

const t = (border: string, surface: string, text: string, solidBg: string, solidText: string, solidBorder: string, tint: string): TonePalette =>
  ({ border, surface, text, solidBg, solidText, solidBorder, tint });

// --- light -------------------------------------------------------------

const LIGHT: Theme = {
  mode: 'light',
  canvas: '#ffffff',
  edge: '#64748b',
  label: '#475569',
  labelBg: '#f8fafc',
  groupStroke: '#cbd5e1',
  groupText: '#475569',
  tones: {
    slate: t('#cbd5e1', '#ffffff', '#0f172a', '#475569', '#f8fafc', '#334155', '#f1f5f9'),
    blue: t('#93c5fd', '#ffffff', '#1e3a8a', '#2563eb', '#ffffff', '#1d4ed8', '#dbeafe'),
    emerald: t('#6ee7b7', '#ffffff', '#064e3b', '#059669', '#ffffff', '#047857', '#d1fae5'),
    // amber 是浅色系: 实底配深字, 否则白字在橙底上看不清
    amber: t('#fcd34d', '#ffffff', '#78350f', '#f59e0b', '#451a03', '#d97706', '#fef3c7'),
    rose: t('#fda4af', '#ffffff', '#881337', '#e11d48', '#ffffff', '#be123c', '#ffe4e6'),
    violet: t('#c4b5fd', '#ffffff', '#4c1d95', '#7c3aed', '#ffffff', '#6d28d9', '#ede9fe'),
    teal: t('#5eead4', '#ffffff', '#134e4a', '#0d9488', '#ffffff', '#0f766e', '#ccfbf1'),
  },
};

// --- dark --------------------------------------------------------------

const DARK: Theme = {
  mode: 'dark',
  canvas: '#0b1120',
  edge: '#64748b',
  label: '#94a3b8',
  labelBg: '#0f172a',
  groupStroke: '#334155',
  groupText: '#94a3b8',
  tones: {
    slate: t('#475569', '#111827', '#e2e8f0', '#475569', '#f8fafc', '#64748b', '#1e293b'),
    blue: t('#2563eb', '#111827', '#93c5fd', '#2563eb', '#ffffff', '#1d4ed8', '#1e293b'),
    emerald: t('#059669', '#111827', '#6ee7b7', '#059669', '#ffffff', '#047857', '#132e26'),
    amber: t('#d97706', '#111827', '#fcd34d', '#f59e0b', '#451a03', '#b45309', '#2c2110'),
    rose: t('#e11d48', '#111827', '#fda4af', '#e11d48', '#ffffff', '#be123c', '#331722'),
    violet: t('#7c3aed', '#111827', '#c4b5fd', '#7c3aed', '#ffffff', '#6d28d9', '#211a35'),
    teal: t('#0d9488', '#111827', '#5eead4', '#0d9488', '#ffffff', '#0f766e', '#0d2b2a'),
  },
};

// --- paper -------------------------------------------------------------
// 学术论文风(260919): 近黑墨水线 + 暖白底 + tint 角色框。与 light 的分工:
// light 是 UI 观感(浅灰边、灰线), paper 是"能直接贴进 paper 的图"——
// 边线全部调深到墨水档, 组框靠 dashed(组框缺省)维持轻, 强调只靠 tint/solid。
// 260920 archify 对账补三件质感: 全局 mono 字体栈(archify 观感的一半)、
// 暖白画布(节点 surface 保持纯白 —— 白盒在暖底上微微浮起, 免费的卡片感)、
// 细线网格底纹(纸感的另一半; 墨色走 grid 自己的缺省中性灰, **不用这里的 groupStroke** ——
// 那是组框色, 墨黑铺满底纹会整片压住图, 实测 18.3 灰阶被退回, 详见 shapes/grid-pattern.ts 文件头)。
// 色板其余槽抄 light(浅色系 tint / solid 配比已调好, 不重derive —— 深浅各写各的老规矩)。

const PAPER: Theme = {
  mode: 'paper',
  canvas: '#fffdf8',
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, "Cascadia Mono", monospace',
  grid: { style: 'line', step: 10 },
  edge: '#1f2937',
  label: '#111827',
  labelBg: '#ffffff',
  groupStroke: '#374151',
  groupText: '#111827',
  tones: {
    slate: t('#111827', '#ffffff', '#111827', '#374151', '#f8fafc', '#1f2937', '#f1f5f9'),
    blue: t('#1d4ed8', '#ffffff', '#1e3a8a', '#2563eb', '#ffffff', '#1e40af', '#dbeafe'),
    emerald: t('#047857', '#ffffff', '#064e3b', '#059669', '#ffffff', '#047857', '#d1fae5'),
    amber: t('#b45309', '#ffffff', '#78350f', '#f59e0b', '#451a03', '#92400e', '#fef3c7'),
    rose: t('#be123c', '#ffffff', '#881337', '#e11d48', '#ffffff', '#9f1239', '#ffe4e6'),
    violet: t('#5b21b6', '#ffffff', '#4c1d95', '#7c3aed', '#ffffff', '#6d28d9', '#ede9fe'),
    teal: t('#0f766e', '#ffffff', '#134e4a', '#0d9488', '#ffffff', '#115e59', '#ccfbf1'),
  },
};

export const THEMES: Record<Mode, Theme> = { light: LIGHT, dark: DARK, paper: PAPER };
export const DEFAULT_THEME = LIGHT;

/** node / group 的一体化取色: 一个 tone + 一个 variant 决定 fill / stroke / text */
export type ToneStyle = { fill: string; stroke: string; text: string; strokeWidth: number };

export function toneStyle(theme: Theme, tone: Tone = 'slate', variant: Variant = 'outline'): ToneStyle {
  const p = theme.tones[tone];
  if (variant === 'solid') {
    return { fill: p.solidBg, stroke: p.solidBorder, text: p.solidText, strokeWidth: 1.5 };
  }
  // tint: 浅色强调底 + 深一档描边(solidBorder) —— 学术图的角色框("这格是上下文/是状态")。
  // 描边取 solidBorder 而非 border: border 是给白底 outline 用的浅色, 压不住 tint 底
  if (variant === 'tint') {
    return { fill: p.tint, stroke: p.solidBorder, text: p.text, strokeWidth: 1.5 };
  }
  return { fill: p.surface, stroke: p.border, text: p.text, strokeWidth: 1.5 };
}

/** 分组框 / 容器用: 只有描边与文字色, 不填实底(免得盖住里面的节点) */
export function groupToneStyle(theme: Theme, tone: Tone = 'slate'): { stroke: string; text: string; tint: string } {
  const p = theme.tones[tone];
  return { stroke: p.border, text: p.text, tint: p.tint };
}

/**
 * 画布底色层 —— 深色主题**必须**靠它, 不能只写 CSS `background`:
 * 部分渲染器(rsvg / PDF 管线)不吃 style 属性, 把它嵌进白页就是"亮瞎"。
 * 用真矩形当底层, 任何管线都渲染得出来; 排在 children 第一位。
 */
export const canvasLayer = (theme: Theme, w: number, h: number): Descriptor =>
  rect(0, 0, w, h, 0, { fill: theme.canvas, stroke: 'none' });
