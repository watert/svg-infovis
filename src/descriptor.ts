// =====================================================================
// descriptor · 几何描述子 (纯数据, 零依赖 —— 运行期只借 `guard` 的报错口径)
// shape 函数不吐字符串也不吐 JSX, 只吐这份纯数据 —— 双态序列化的分界点(设计稿 §6.3):
//   serialize.ts  → SVG 字符串(字节确定性)
//   react 薄壳    → JSX 元素
// 双态承诺对动画同样成立(260926): `DAnimate` / `DStyle` 只把**时间与样式表写进数据**
// (何时开始 / 多久 / 几遍 / 缓动), "谁在播、播到哪"是消费态 —— core 不持时钟。
// =====================================================================

// 只作**类型**引用(type-only import): descriptor 仍是零运行期依赖 —— 但"矩形"这个概念
// 全仓只有一份(`geometry/vec`), 在这里再写一个 `{ x, y, w, h }` 就是第二个几何真相
import type { Rect } from './geometry/vec';
import { assertFiniteNumber, assertOneOf, ShapeInputError } from './guard';

/** SVG 属性袋: 值只允许确定性原始类型 */
export type Attrs = Record<string, string | number | undefined>;

export type DPath = { kind: 'path'; d: string; attrs?: Attrs };
export type DCircle = { kind: 'circle'; cx: number; cy: number; r: number; attrs?: Attrs };
export type DRect = { kind: 'rect'; x: number; y: number; w: number; h: number; rx?: number; attrs?: Attrs };
export type DTextSpan = {
  text: string;
  /**
   * 字重(CSS 数值)。**单独一位**而不是并进 `attrs`: 它走 `fmt`(2 位小数)口径,
   * 与 260920 首版 `<tspan font-weight="400.00">` 的字节一致。
   */
  weight?: number;
  /** 其余行内样式属性(斜体 / 删除线 / 行内色 …): 键序由序列化器统一排 */
  attrs?: Attrs;
};
export type DText = { kind: 'text'; x: number; y: number; content: string; attrs?: Attrs; spans?: DTextSpan[] };
export type DGroup = { kind: 'group'; children: Descriptor[]; attrs?: Attrs };
export type DSvg = { kind: 'svg'; w: number; h: number; children: Descriptor[]; attrs?: Attrs };
/** `<pattern>`: 平铺单元 —— 网格底纹的唯一载体(w/h = tile 尺寸, id 供 `fill="url(#id)"` 引用) */
export type DPattern = { kind: 'pattern'; id: string; w: number; h: number; children: Descriptor[]; attrs?: Attrs };
/** `<defs>`: 只声明不上屏的容器 */
export type DDefs = { kind: 'defs'; children: Descriptor[] };
/**
 * **嵌套 `<svg>`**: 外部素材(echarts 这类整幅出图的工具)的挂载点。
 *
 * 它不是"又一个形状", 而是**一整块别人画的画**: `markup` 是素材的内部标记, 序列化时
 * **原样插入** —— 所以那边不做任何重新缩进 / 换行(见 `serialize.ts` 那条 case 的注释)。
 * `viewBox` 是**素材自己的坐标系**, 由宿主的 `x/y/w/h` + `preserveAspectRatio` 把它映射进去。
 */
export type DEmbed = { kind: 'embed'; x: number; y: number; w: number; h: number; viewBox: Rect; markup: string; attrs?: Attrs };

export type Descriptor =
  | DPath | DCircle | DRect | DText | DGroup | DPattern | DDefs | DEmbed | DAnimate | DStyle;

export const path = (d: string, attrs?: Attrs): DPath => ({ kind: 'path', d, attrs });
export const circle = (cx: number, cy: number, r: number, attrs?: Attrs): DCircle => ({ kind: 'circle', cx, cy, r, attrs });
export const rect = (x: number, y: number, w: number, h: number, rx?: number, attrs?: Attrs): DRect => ({ kind: 'rect', x, y, w, h, rx, attrs });
export const text = (x: number, y: number, content: string, attrs?: Attrs): DText => ({ kind: 'text', x, y, content, attrs });

/**
 * 富文本: 一行里**分段不同样式**(`**粗**` / `*斜*` / `~~删~~` / `[字]{accent}`)。走 `<tspan>`
 * 而不是"每段一个 `<text>` 元素 + 自己累加 x" —— 后者的段间距由 core 的估算宽决定, 而渲染器
 * 用的是真字体, 两把尺子必然在段的接缝处露出破绽(字挤在一起或裂开一条缝)。`<tspan>` 让
 * **渲染器自己接**, 接缝不存在。
 *
 * 它是 `shapes/inline.ts` 那个发射器的出口 —— 别在别处手拼 spans(解析层在 `geometry/inline-text`)。
 * `content` 仍然写全(纯文本) —— 它是这一行的"内容", 供对账 / 调试 / 未来可能的纯文本渲染器读;
 * 序列化时以 `spans` 为准。
 *
 * ⚠ **`xml:space="preserve"` 钉在这里**(260925, 病: 行内标记接壤的空格被吃掉):
 * 每个 `<tspan>` 是一段**独立的字符数据 chunk**, 而 `xml:space` 缺省档下渲染器**逐 chunk 剥首尾空白** ——
 * `Object Type: **Airport**` 拆出来的第一段正是 `"Object Type: "`, 那个尾空格在字节里还在、画出来却没了
 * (rsvg 实测成 `Object Type:Airport`, 而度量面量的是**含空格**的整串 ⇒ 渲染面少画 ~3.5px)。`&#160;`(NBSP)
 * **不是**解法: 它换个字形, "被剥"这件事本身没解决。钉在**构造器**而不是调用点, 是因为"走 spans ⇒ 多
 * chunk ⇒ 会挨剥"是 `richText` 自己的事 —— 将来再有一处上屏路径手拼 spans 也自动吃到, 忘不掉。
 * 单 run 的 `text()` **不钉**: 那串字的首尾空白是作者亲自写的, 而既有产物(全仓 PNG 快照 + 两条基线)
 * 正盯着"无 span 的老路径逐字节不变"这一条。
 */
export const richText = (x: number, y: number, spans: DTextSpan[], attrs?: Attrs): DText =>
  ({ kind: 'text', x, y, content: spans.map((s) => s.text).join(''), attrs: { ...attrs, 'xml:space': 'preserve' }, spans });
export const group = (children: Descriptor[], attrs?: Attrs): DGroup => ({ kind: 'group', children, attrs });
export const svg = (w: number, h: number, children: Descriptor[], attrs?: Attrs): DSvg => ({ kind: 'svg', w, h, children, attrs });
/** 平铺单元(网格底纹的载体): id 供 `fill="url(#id)"` 引用, w/h 即 tile 尺寸 */
export const pattern = (id: string, w: number, h: number, children: Descriptor[], attrs?: Attrs): DPattern =>
  ({ kind: 'pattern', id, w, h, children, attrs });
export const defs = (children: Descriptor[]): DDefs => ({ kind: 'defs', children });
/**
 * 嵌套 `<svg>`(素材挂载点) —— `markup` **原样透传**: 别在这里缩进、别在这里包 `<![CDATA[`。
 * 素材内部的坐标是它自己那套(`viewBox` 声明), 缩放交给渲染器的 `preserveAspectRatio`。
 */
export const embed = (x: number, y: number, w: number, h: number, viewBox: Rect, markup: string, attrs?: Attrs): DEmbed =>
  ({ kind: 'embed', x, y, w, h, viewBox, markup, attrs });

// --- 动画(SMIL 内建): 目标元素的**子元素** ---------------------------------
//
// 260926 立的地基(ROADMAP 动画条的 ① 档): 动画在**浏览器端**跑, 产物仍是静态字节 ——
// 字节确定 / golden / 禁 `Date.now` 全不受影响, 门禁也不用动(与图标 / 网格底纹 / `embedAsset`
// 同档: 压在版式上的墨迹, 不进净空门禁)。导出的 .svg **自己会动、零 JS**, 静态产物 + 播放能力。
//
// ⚠ 总口径: **SMIL 的值全是字符串, 原样透传**。SMIL 的值自带语法
// (`'0;1;0.5'` / `'click'` / `'other.end'` / `'translate(10)'`), 内核不 parse、不归一、不重排 ——
// 真让 core 去解析再拼回, 就是又造一把与作者手上的尺子不同的尺子(轴一 · 数值归作者)。
// 唯一的数字档是 `repeatCount`(见它自己的注释)。
//
// ⚠ 跨元素与交互时序(`begin="click"` / `begin="other.end"`)要的是**目标元素有 id**: 走
// `ExportOptions.hooks`(260926 已落地, export 渲染映射从语义槽派生 id / data-* 透传, 见
// `src/export.ts` 的 `hookAttrs`), 或作者自己往 `attrs` 里写 `id`。animate 本身是目标元素的
// 子元素, 不需要 href 寻址。

/** `<animateTransform>` 的 `type` 词表 —— **运行时值与类型同源**(与 `NODE_ALIGN_KINDS` 同规矩) */
export const ANIMATE_TRANSFORM_TYPES = ['translate', 'scale', 'rotate'] as const;
export type AnimateTransformType = (typeof ANIMATE_TRANSFORM_TYPES)[number];

/**
 * 命名缓动 → SMIL `keySplines` 的值: 单位区间三次贝塞尔的四个控制数 `x1 y1 x2 y2`。
 *
 * **全仓只此一份**(260926) —— 模板 / 示例 / 消费侧一律**不许自带贝塞尔数字**。理由不是洁癖:
 * 五份模板各写一份缓动 = 同一个"手感"有五份真值, 改一次得改五处(ROADMAP 动画条点名的 P4)。
 * 名字取 CSS 的五个关键字 + 五档常用曲线(值同 easings.net 那份规范表, 两位小数); 要加新名字先问一句:
 * 这是不是又一个"五处各写一份"?
 *
 * 词表**运行时值与类型同源**: `Easing` 就是本表的键, 写错名字由 `easingSpline` 当场抛 ——
 * 不做"不认识的缓动就静默匀速"(静默回落是本仓反复咬过的坑)。
 */
export const EASING_SPLINES = {
  linear: '0 0 1 1',
  ease: '0.25 0.1 0.25 1',
  'ease-in': '0.42 0 1 1',
  'ease-out': '0 0 0.58 1',
  'ease-in-out': '0.42 0 0.58 1',
  'ease-in-cubic': '0.32 0 0.67 0',
  'ease-out-quad': '0.5 1 0.89 1',
  'ease-out-cubic': '0.33 1 0.68 1',
  'ease-out-expo': '0.16 1 0.3 1',
  'ease-in-out-cubic': '0.65 0 0.35 1',
} as const;
export type Easing = keyof typeof EASING_SPLINES;
/** 词表(报错文案列它) —— 从 `EASING_SPLINES` **派生**, 键序 = 书写序; 别手抄第二份 */
export const EASING_NAMES = Object.keys(EASING_SPLINES) as Easing[];

/**
 * 查一条命名缓动的 `keySplines` 值; 名字不在词表里**当场抛**。
 *
 * ⚠ 本槽**没有缺省值**: 不写 `easing` 的语义是"不吐 calcMode / keySplines"(即 SMIL 缺省的匀速),
 * 不是"随便挑一条" —— 所以 `undefined` 也是错(否则会顺着 `Record` 查出一个 undefined,
 * 再被 `attrsToStr` 静默丢掉, 留下一个 calcMode="spline" 却没有曲线的残废动画)。
 */
export const easingSpline = (name: Easing | undefined): string => {
  if (name === undefined) {
    throw new ShapeInputError('animate', 'easing', '没写', '要缓动就点名; 不写 = 匀速(SMIL 缺省 calcMode=linear)', '词表参数');
  }
  assertOneOf('animate', 'easing', name, EASING_NAMES, `缓动曲线全仓只此一份(见 EASING_SPLINES), 别自带贝塞尔`);
  return EASING_SPLINES[name];
};

/**
 * SMIL `<animate>` / `<animateTransform>` 的纯数据形态 —— 挂在**被动画的那个元素**里(它的子元素)。
 *
 * ⚠ **目标 = 本元素所在的父元素**(260926 在 Chrome 实测钉下的一条 SMIL 规则, 不给 href 时目标就是父元素)。
 * 所以在 descriptor 这套平面结构里: `group([rect(...), animate({ attributeName: 'opacity', … })])`
 * 动的是**那个 `<g>` 自己的** opacity, 不是旁边那个 rect —— 想单独动一个东西, 就把它单独装进一个
 * `group([...])` 再动那个组。今天真正动得起来的属性因此只有**容器/分组有语义的那些**:
 * `opacity` / `transform`(走 `animateTransform`)/ `fill` · `stroke`(可继承, 组上写了子元素没覆盖就吃得到) /
 * `visibility` —— 要动某个形状自己的 `r` · `cx`, 眼下没有通道(形状 descriptor 不带子槽;
 * 让形状内嵌 animate 是另一件立项的事), 只有 `attrs: { href: '#id' }` 这条逃生舱 + 作者自己给 id。
 *
 * 三件必答: 动**哪个属性**(`attributeName`)、从哪儿到哪儿(`from` · `to` 或 `values`)、**动多久**(`dur`)。
 * 时序与交互串在 `begin`('0s' / 'click' / 'other.end'), 目标 id 走 `ExportOptions.hooks` 或手写 attrs。
 *
 * 逃生舱: 没进字段的 SMIL 属性(`fill="freeze"` 停在末态 / `additive` / `accumulate` / 手写
 * `keySplines` / `href`)走 `attrs` —— 与 easing 派生的那三位合并后**覆盖**(见 `serialize.ts` 那条 case)。
 */
export type DAnimate = {
  kind: 'animate';
  /** 目标属性名; ⚠ 只有**父元素真有的属性**才动得起来(见上面那条"目标 = 父元素"); transform 型缺省补成 `'transform'` */
  attributeName: string;
  /** 起点值; 不给 = 从**当前值**动起 */
  from?: string;
  /** 终点值 */
  to?: string;
  /** 多段值(`'0;1;0.5'`): 与 from · to **二选一**, 两套表达同时写等于两条时间轴打架 */
  values?: string;
  /** 时长, 带单位的 SMIL 时钟值(`'600ms'` / `'1s'`); **必填** —— 不写等于永不停 */
  dur: string;
  /** 起始时刻(`'0s'` / `'click'` / `'other.end'`); 原样透传, 内核不解析时钟 */
  begin?: string;
  /** 播几遍: 数字(遍数)或 `'indefinite'`; 原样透传 */
  repeatCount?: number | 'indefinite';
  /** 命名缓动(词表在 `EASING_SPLINES`); 只配 from · to 那**一个区间**, 多段 values 请自己写 attrs */
  easing?: Easing;
  /** 有它 = 走 `<animateTransform>`(值即 SMIL 的 `type`); 没有 = 走 `<animate>` */
  type?: AnimateTransformType;
  /** 没进字段的 SMIL 属性(fill / additive / accumulate / calcMode …) —— 逃生舱, 合并后覆盖 */
  attrs?: Attrs;
};

/** `animate()` 的入参: `kind` 由构造器补; transform 型可以省 `attributeName`(缺省 `'transform'`) */
export type AnimateProps = Omit<DAnimate, 'kind' | 'attributeName'> & { attributeName?: string };

/**
 * animate 入参守卫 —— 与形状层同一口径(坏输入当场抛, 报错带修法), 只管那些
 * **写错了不报错、只在图上静默不动**的坑:
 *   ⓪ 三件必答缺件(目标属性 / 时长 / 位移表达)
 *   ① `values` 与 `from` · `to` 同时给(规范里互斥)
 *   ② `<animate attributeName="transform">` —— 规范里 transform 只能由 `<animateTransform>` 动,
 *      写成 animate 就是"没有动画也不报错"的经典死路
 *   ③ 缓动: 词表外当场抛; `easing` 配多段 `values` 也抛(一份曲线管一个区间, 逐段缓动内核不猜)
 *   ④ `repeatCount` 非数字非 indefinite / 为负
 *
 * 守卫只落在**构造器**这一侧(与形状层一致) —— 手拼 descriptor 绕过它是调用方的选择,
 * `serialize` 不做二次判决(它是字符串出口, 不当地主)。
 */
const assertAnimate = (p: AnimateProps): void => {
  const name = p.attributeName ?? (p.type === undefined ? undefined : 'transform');
  if (name === undefined || name === '') {
    throw new ShapeInputError('animate', 'attributeName', '没写', '要动哪个属性就得点名(如 opacity / fill); transform 型可省 —— 补了 type 后属性名缺省就是 transform');
  }
  if (p.type !== undefined) {
    assertOneOf('animate', 'type', p.type, ANIMATE_TRANSFORM_TYPES, '括号里的参数写在 from/to 里, type 只认这三个词');
  }
  if (name === 'transform' && p.type === undefined) {
    throw new ShapeInputError('animate', 'attributeName', '是 "transform" 却没给 type', 'transform 只能由 <animateTransform> 动: 补 type: "translate" | "scale" | "rotate" —— 写成 <animate attributeName="transform"> 图上静默不动');
  }
  if (typeof p.dur !== 'string' || p.dur === '') {
    throw new ShapeInputError('animate', 'dur', `没写(拿到 ${String(p.dur)})`, '时长必填, 且要带单位: dur: "600ms"(SMIL 缺省是不定 —— 不写等于永不停)');
  }
  const ends = p.from !== undefined || p.to !== undefined;
  if (p.values !== undefined && ends) throw new ShapeInputError('animate', 'values', '与 from / to 同时给了', '二选一: 两端用 from/to, 多段用 values');
  if (p.values === undefined && !ends) throw new ShapeInputError('animate', 'values', '与 from / to 都没给', '至少要一个终点: 写 to(从当前值动到它) 或 values');
  if (p.easing !== undefined) {
    easingSpline(p.easing);
    if (p.values !== undefined) {
      throw new ShapeInputError('animate', 'easing', `配的是多段 values("${p.values}")`, '一份缓动曲线管一个区间; 多段要逐段缓动就自己写 attrs 的 calcMode / keyTimes / keySplines');
    }
  }
  const rc = p.repeatCount;
  if (rc !== undefined && rc !== 'indefinite') {
    assertFiniteNumber('animate', 'repeatCount', rc, '遍数: 一个数字, 无限循环写 "indefinite"');
    if (rc < 0) throw new ShapeInputError('animate', 'repeatCount', `为负(${rc})`, '遍数是次数不是增量; 无限循环写 "indefinite"');
  }
};

/**
 * SMIL 动画 —— 挂在**被动画的那个元素**里(父元素的子元素)。⚠ 目标是**父元素**, 所以
 * `group([rect(...), animate({ attributeName: 'opacity', from: '0.2', to: '1', dur: '1.2s' })])`
 * 动的是那个 `<g>` 的透明度(单独动一个东西就先给它套一层 `group([...])`)。
 * 缓动照词表点名: `easing: 'ease-out-expo'` ⇒ `calcMode="spline" keyTimes="0;1" keySplines="0.16 1 0.3 1"`。
 */
export const animate = (p: AnimateProps): DAnimate => {
  assertAnimate(p);
  return { ...p, kind: 'animate', attributeName: p.attributeName ?? 'transform' };
};

/**
 * 内嵌 `<style>` 的纯数据形态 —— 一份 CSS 文本, **随产物走**。
 *
 * 为什么必须内嵌(260926): 靠宿主页面 CSS 的产物**离开宿主就死**, 与"自包含 SVG"撞车;
 * 而 CSS `@keyframes` 那条路要的语义 hook(`data-kind` / `data-tone`, 与 `data-draft` 同族)
 * 也得写在**产物自己的**样式表里。
 *
 * 内容**原样插入**(与 `embed` 的 markup 同一条原则: 不重排 / 不缩进 / 不插换行), 只在序列化时
 * 转 XML 文本里必须转的两个字符 —— 取舍写在 `serialize.ts` 的 `escapeStyleText` 那条注释上。
 */
export type DStyle = { kind: 'style'; css: string; attrs?: Attrs };

/**
 * `css` 是**整份样式表文本**(含 `@keyframes` 与选择器); `type="text/css"` 由序列化器钉上
 * (SVG 1.1 里那一位是必填, 且只此一个合法值)。`media` 之类没进字段的走 `attrs`。
 */
export const style = (css: string, attrs?: Attrs): DStyle => {
  if (typeof css !== 'string') throw new ShapeInputError('style', 'css', `不是字符串(拿到 ${typeof css})`, '整份样式表就是这一件的内容', '文本参数');
  if (css === '') throw new ShapeInputError('style', 'css', '是空串', '空的 <style> 什么也不声明; 不需要就别放这一件');
  return { kind: 'style', css, attrs };
};

// --- 主题: 已迁到 ./theme.ts (7 色 tone × light/dark × outline/solid) ------
// 这里不再持有配色 —— shape 只读语义槽, 不认具体色值。

// --- 文本定位: 自己算, 不依赖渲染器的 dominant-baseline ------------------

// (偷自 Infographic 的对齐矩阵只剩水平一半 —— 垂直那半改成算出来的坐标)

/**
 * 水平对齐词表 —— **运行时值与类型同源**(与 `NODE_ALIGN_KINDS` 同规矩): 写错当场抛, 不静默回落。
 * 消费者: `anchorAttrs`(渲染) 与 `textFit` / `placeText`(构建期反算锚点边) —— 同一个词表,
 * 所以"字按 start 对齐"与"盒的左端落在锚点上"必然是同一件事。
 */
export const TEXT_ANCHORS = ['start', 'middle', 'end'] as const;
export type TextAnchor = (typeof TEXT_ANCHORS)[number];
export type Baseline = 'hanging' | 'central' | 'baseline';

/**
 * 基线折算系数(相对 font-size)。
 *
 * 为何不用 `dominant-baseline` 属性: 各渲染器支持不一 —— ImageMagick 内置 MSVG 直接不支持,
 * librsvg / resvg / PDF 管线各有偏差, 换渲染器整张图的文字就漂, 而且漂多少不可对账。
 * 自己算 = 坐标进得了 golden, 跨渲染器只差一个固定系数。
 *
 * `central = 0.35` 是**量出来的**(260925 复核): 按它摆好单行字后逐像素量墨迹, 墨心落在基线上方
 * **CJK 0.3555–0.3594em**(11/13/16/20 四档字号一致)、大写英文 0.3636em、小写 0.3413em ——
 * 残差 ≤0.1px。所以这一格**不该再叠任何 px 补偿**; CJK / 等宽字族真要有偏差, 也是改这个系数。
 *
 * ⚠ **别在这里加"光学补偿"**: 260917 曾加过一个 `OPTICAL_CENTRAL_FIX = 1.2`(`central` 恒
 * +1.2px), 260925 已移除。它当时是拿"主标签 CJK + 次标签大写英文"那个**两行块**校准出来的
 * (那份内容上 +1.2 确实更准), 可两行块的视觉中心还牵扯行距与两行字族的墨心差 —— 那是
 * **内容依赖**的修正, 而 `baselineY` 是所有 central 站点共享的**折算层**(节点单标签 / 边标签
 * 遮罩片 / 旁注 / 组标题都吃它)。放进共享层 = 每个单行场景统一多下沉 1.2px, 而它们本来是对的。
 * 教训: **内容依赖的偏差修在摆那块内容的地方, 折算层只放与内容无关的几何系数** —— 想再往这里
 * 加全局常量, 先证明它对"单行 CJK / 单行英文 / 多行 / 各字号"同时成立。
 */
export const BASELINE_FACTORS: Record<Baseline, number> = {
  baseline: 0,
  central: 0.35,
  hanging: 0.8,
};

/**
 * 把"锚点 y"折算成 SVG 里真正要写的基线 y。**纯公式**(只吃 `BASELINE_FACTORS`)——
 * 这里多一个 px 修正, 全图的字就一起跟着沉, 别再塞东西进来(原委见上一条)。
 */
export const baselineY = (y: number, fontSize: number, baseline: Baseline = 'baseline'): number =>
  y + fontSize * BASELINE_FACTORS[baseline];

/** 水平对齐: 这条各渲染器一致, 保留属性 */
export const anchorAttrs = (anchor: TextAnchor = 'start'): Attrs =>
  ({ 'text-anchor': anchor === 'start' ? undefined : anchor });
