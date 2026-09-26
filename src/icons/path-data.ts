// =====================================================================
// icons/path-data · `path` 的 `d` 字符串的**坐标改写**
//
// 为什么必须有这一层(260920, 被 ontology-e2e 的闭环用例咬出来的真事故):
// `iconShape` 对 circle / rect / ellipse / line / polyline / polygon 逐一算过缩放后的坐标, 唯独
// `path` 是 `path(prim.d, attrs)` —— **原文照搬**。后果: lucide 里 6470 处是 `<path>`(占绝对多数,
// 飞机/飞机起降/对勾都是), 它们被画在**素材自己的 24×24 原点**上、缩放到目标框里的只有那几个圆和方。
// 而 `audit` 完全不会响 —— 图标不进任何净空门禁(见 `shapes/icon.ts` 文件头的"门禁边界")。
// 于是"图上的图标小得看不见、挤在节点左上角"这件事**出得来、却查不出**。
//
// 与 `svg-parse` 拒绝 `transform` 是同一条纪律的两半:
//   · 素材侧: 见到 `<g transform>` 就抛 —— 因为那要求解析器做**任意**仿射变换
//   · 渲染侧: 我们只做**一种**变换(等比缩放 + 平移), 于是"改写 d"是能写清的
// 两半合起来才成立: 拒掉任意变换, 是"改写 d"这件事能写对的**前提**。
//
// 支持完整的 SVG path 命令集(`M m L l H h V v C c S s Q q T t A a Z z`)——
// 因为 lucide 里真用到这些(相对命令与紧凑写法都有: `m8 22 4-11 4 11` / `1.1-.55` / `-2-4`)。
// 弧(`A`)在**等比**缩放下仍是圆/椭圆弧, 所以 rx/ry 乘比例、旋转角与两个标志位原样、端点走映射。
//
// 定位: 纯字符串处理, **零依赖**(只 import `vec` 的格式化)。
// =====================================================================

import { fmt } from '../geometry/vec.js';
import { ShapeInputError } from '../guard.js';

/** 每个命令要吃的参数个数(0 个的是 `Z z`) */
const ARITY: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };

/** 命令字母 */
const CMD_RE = /[MmLlHhVvCcSsQqTtAaZz]/;
/** 一个数字 —— `y` 是 sticky 标志: 从指定下标**锚定**匹配, 于是"读到哪"是可数的 */
const NUM_RE = /[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/y;

export type PathCommand = {
  /** 原样保留大小写 —— 相对/绝对是语义, 不许归一化(归一化会把相对命令的数改成需要上下文的绝对值) */
  cmd: string;
  /** 与 `cmd` 同长的参数表; 个数恒是 `ARITY` 的正整数倍 */
  args: number[];
};

const fail = (field: string, reason: string, hint: string): never => {
  throw new ShapeInputError('mapPathData', field, reason, hint, '素材字段');
};

const isSep = (ch: string): boolean => ch === ' ' || ch === ',' || ch === '\t' || ch === '\n' || ch === '\r';

/**
 * `d` 字符串 → 命令表。**遇到看不懂的东西当场抛**: 一个解析不出来的 `d` 会让整条路径消失,
 * 而图上没人看得出少了一根线(与 `svg-parse` 拒绝 `<g>` 同一条理由)。
 *
 * 为什么不是"拿正则扫出所有数字再按 arity 切": **弧的两个 flag 是单字符**, 而紧凑写法会把它们
 * 和后面的数字糊在一起 —— 语料里真实存在 `a41 41 0 000 18`(= 0/0 两个 flag + 0/18 两个坐标)与
 * `A2 2 0 0022 17`(= 0/0 + 22/17)。按"数字 token"切会把 `000` 读成一个 0, 于是参数个数变成 5 而报错。
 * 所以这里**按命令逐位读**: 读到一个命令就按它的 arity 读若干组参数, flag 位只吃一个字符。
 * (1853 个图标里 126 个踩这个坑, 全是 `A/a` —— 这条不是边角, 是语料的常态写法。)
 *
 * 不变式(下游 `mapPathData` 依赖它): 每条命令的 `args.length` 恒是 `ARITY` 的正整数倍, `z` 恒为空。
 * 参数个数不对的路径会画成**另一条线**, 所以它在这里就被挡住, 不留"尽力而为"的余地。
 */
export function parsePathData(d: string): PathCommand[] {
  const src = String(d ?? '');
  const out: PathCommand[] = [];
  let i = 0;
  let cur: PathCommand | null = null;
  const skipSep = (): void => { while (i < src.length && isSep(src[i])) i += 1; };
  const readNum = (): number => {
    NUM_RE.lastIndex = i;
    const m = NUM_RE.exec(src);
    if (!m || m.index !== i) {
      fail('d', `这里要一个数字, 读到 "${src.slice(i, i + 12)}"`,
        '只认 SVG path 的命令字母与数字; 字符装饰之类的东西请在素材侧先去掉');
    }
    i = NUM_RE.lastIndex;
    return Number(m![0]);
  };

  for (;;) {
    skipSep();
    if (i >= src.length) break;
    const ch = src[i];
    if (CMD_RE.test(ch)) {
      i += 1;
      if (ch === 'Z' || ch === 'z') {
        out.push({ cmd: ch, args: [] });
        cur = null;
        continue;
      }
      cur = { cmd: ch, args: [] };
      out.push(cur);
      continue;
    }
    if (!cur) {
      fail('d', `"${src.slice(i, i + 12)}" 前面没有命令字母`,
        out.length
          ? '`z` 不吃参数 —— 闭合之后要继续画, 就写全下一个命令字母'
          : '路径必须以命令字母开头(通常是 M)');
    }
    // 按当前命令的 arity **读一组**参数; 后面还有数字就是隐式重复(同一条命令再来一组)
    const up = cur!.cmd.toUpperCase();
    const arity = ARITY[cur!.cmd.toLowerCase()];
    for (let k = 0; k < arity; k += 1) {
      skipSep();
      if (up === 'A' && (k === 3 || k === 4)) {
        const f = src[i];
        if (f !== '0' && f !== '1') {
          fail('d', `弧的第 ${k + 1} 个参数是标志位, 只能是 0 / 1(读到 "${f ?? '文件结尾'}")`,
            'SVG 语法里 flag 恰好一个字符 —— 少了它, 后面所有坐标都会串位');
        }
        cur!.args.push(Number(f));
        i += 1;
        continue;
      }
      cur!.args.push(readNum());
    }
  }
  // 收尾复核: **光秃秃的命令字母**(如末尾的 `d="M1 2 L"`)在读参数之前就撞到串尾, 上面那圈
  // 结构上抓不到它 —— 而"写了 L 却没有坐标"该被当成素材的问题, 不是"比 lineto 少一笔"。
  // (`z` 本来就不吃参数, 跳过。)
  for (const c of out) {
    if (c.cmd.toLowerCase() !== 'z' && c.args.length === 0) {
      fail('d', `命令 "${c.cmd}" 一个参数都没有`, '写了命令字母就要给坐标; 多出来的空命令多半是素材拼装时留下的');
    }
  }
  return out;
}

/** 坐标映射: 等比缩放 + 平移。**只此一种** —— 任意仿射不在这里(那是 `svg-parse` 拒掉 `transform` 的地方) */
export type PathMapper = {
  /** 绝对 x 的映射(含平移) */
  x: (v: number) => number;
  /** 绝对 y 的映射(含平移) */
  y: (v: number) => number;
  /** 比例(相对命令的增量、以及弧半径只吃这一个) */
  scale: number;
};

/** 一对绝对坐标/增量坐标的输出 */
/**
 * 把 `d` 的所有坐标按 `map` 改写。两条容易写错的规矩, 各自都有"看着很像对的"的失败样子:
 *   · 相对命令的增量**只乘 `scale`**(不吃平移) —— 吃了平移, 图标会随翻译量整体飘走
 *   · **开头的 `m` 的第一对坐标是绝对的** —— SVG 规定路径起点的当前点是 (0,0), 所以 `m 8 22`
 *     与 `M 8 22` 等价。按相对处理会丢掉平移, 图标缩在原点附近(这条 260920 真栽过: 放射塔
 *     底下那个小三角被丢在 (36.67, 100.83)。`d` 的第一条命令才吃这条, 后面的是真增量)
 *   · `A` 的两个**标志位按整数输出** —— 语法里 flag 恰好是 `0`/`1` 一个字符, 写成 `0.00`
 *     会被解析成"标志 0 + 新数字 .00", 弧当场画歪
 */
export function mapPathData(d: string, map: PathMapper): string {
  const cmds = parsePathData(d);
  const { x: X, y: Y, scale: s } = map;
  const rel = (v: number): number => v * s;
  const parts: string[] = [];
  cmds.forEach(({ cmd, args }, index) => {
    const up = cmd.toUpperCase();
    const isRel = cmd !== up;
    const px = isRel ? rel : X;
    const py = isRel ? rel : Y;
    const nums: string[] = [];
    switch (up) {
      // 这六个命令的参数都是**若干对坐标**(C 是三对: 两个控制点 + 端点; S/Q 是两对)
      case 'M': case 'L': case 'T': case 'C': case 'S': case 'Q':
        for (let i = 0; i < args.length; i += 2) {
          const lead = up === 'M' && isRel && index === 0 && i === 0;
          const fx = lead ? X : px;
          const fy = lead ? Y : py;
          nums.push(fmt(fx(args[i])), fmt(fy(args[i + 1])));
        }
        break;
      case 'H':
        for (const v of args) nums.push(fmt(isRel ? rel(v) : X(v)));
        break;
      case 'V':
        for (const v of args) nums.push(fmt(isRel ? rel(v) : Y(v)));
        break;
      case 'A':
        for (let i = 0; i + 6 < args.length; i += 7) {
          // rx ry x-axis-rotation large-arc-flag sweep-flag x y
          // 等比缩放下弧仍是同类弧 ⇒ 半径乘比例, 标志位与旋转角原样
          nums.push(fmt(rel(args[i])), fmt(rel(args[i + 1])), fmt(args[i + 2]),
            String(Math.round(args[i + 3])), String(Math.round(args[i + 4])),
            fmt(isRel ? rel(args[i + 5]) : X(args[i + 5])), fmt(isRel ? rel(args[i + 6]) : Y(args[i + 6])));
        }
        break;
      case 'Z':
        break;
      default:
        fail('d', `不认识的命令 "${cmd}"`, '支持的命令见本文件头');
    }
    // 每个数字都已各自格式过(标志位不能走 `fmt`), 这里只负责拼 —— 命令字母保持原大小写
    parts.push(up === 'Z' ? cmd : `${cmd}${nums.length ? ` ${nums.join(' ')}` : ''}`);
  });
  return parts.join(' ');
}
