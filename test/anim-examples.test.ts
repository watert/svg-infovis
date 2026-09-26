// =====================================================================
// anim-examples · 三张动画示例的**产物判据**
//
// 为什么值得设门禁: 动画那三种机制的失败方式全是**静默**的 —— 图上不动, 而产物合法、exit 0、门禁全绿:
//   · `href` 写歪 / 指错元素 → 动画落在别人身上(或谁也不落)
//   · **同步基 id 带连字符**(`begin="lit-1.end"`)→ 整条时序链一动不动(260926 在 Chrome 实测)
//   · 错峰挂在 `begin` 上而不是 `keyTimes` 上 → 那格先按静态值闪一下再灭
// 所以判据读的是**产物字节**(不是构建期的中间量): SMIL 关键词在场 / href 的指向 / 逐格 keyTimes 是
// 一条等差数列 / 静态末态与动画终点逐位同值。另外两条是全局纪律: 两次导出逐字节全等 · 画幅落在画廊带。
//
// ⚠ 不验"动起来什么样"(PNG 快照只有第一帧, 那是另一回事): 三张的动效读数见 `examples/gallery/anim-*.ts`
// 的文件头 —— 观感还没有断言看着它, 这一档只管**机制在场且指对了地方**。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { toSVG } from '../src/serialize';
import { doc as flow } from '../examples/gallery/anim-flow';
import { doc as interactive } from '../examples/gallery/anim-interactive';
import { doc as progress } from '../examples/gallery/anim-progress';

const ROOT = join(import.meta.dir, '..');
const CASES = [
  { name: 'anim-flow', file: 'examples/gallery/anim-flow.ts', doc: flow },
  { name: 'anim-progress', file: 'examples/gallery/anim-progress.ts', doc: progress },
  { name: 'anim-interactive', file: 'examples/gallery/anim-interactive.ts', doc: interactive },
].map((c) => ({ ...c, svg: toSVG(c.doc) }));

const count = (hay: string, needle: string) => hay.split(needle).length - 1;
/** 抓第 1 个捕获组 —— 调用点只关心"抓到什么", 正则的 `g` 旗标在这里补上(全局扫描是本函数的事) */
const grab = (hay: string, re: RegExp): string[] =>
  [...hay.matchAll(re.flags.includes('g') ? re : new RegExp(re.source, `${re.flags}g`))].map((m) => m[1]);

/**
 * 标签配对扫描 —— 不引 XML 解析库(本仓零运行时依赖, 测试也不破例)。
 * 只做一件够用的事: 每个 `<tag>` 与 `</tag>` 按**栈**配对, 自闭合(`/>`)不入栈。
 * 可行性前提: 本仓产物里没有裸 `>` 落在属性值 / 文本里(转义器只放行 `>` 当普通字符,
 * 而 `d` / CSS / 文案都不带它); `<?xml …?>` 因标签名必须以字母开头而被跳过。
 */
const unbalanced = (xml: string): string[] => {
  const bad: string[] = [];
  const stack: string[] = [];
  for (const raw of xml.match(/<[^>]+>/g) ?? []) {
    const m = /^<(\/)?([A-Za-z][\w:-]*)/.exec(raw);
    if (!m) continue;                                       // `<?xml …?>` 之类
    const [, closing, name] = m;
    if (closing) {
      if (stack.pop() !== name) bad.push(`${raw} 与栈顶不配对`);
    } else if (!/\/>$/.test(raw)) stack.push(name);
  }
  return bad.concat(stack.length ? [`没闭合: ${stack.join(' ')}`] : []);
};

describe('anim-examples · 三张动画示例的产物判据', () => {
  it('三张都是结构合法的 SVG, 且产物里没有 NaN / undefined', () => {
    for (const c of CASES) {
      expect(c.svg.startsWith('<?xml'), c.name).toBe(true);
      expect(c.svg.trimEnd().endsWith('</svg>'), c.name).toBe(true);
      expect(unbalanced(c.svg), c.name).toEqual([]);
      expect(c.svg, c.name).not.toContain('NaN');
      expect(c.svg, c.name).not.toContain('undefined');
    }
  });

  it('anim-flow: 四条蚂蚁线走 href 指 path 自己, 四环走时序链(且同步基 id 不带连字符)', () => {
    const { svg } = CASES[0];
    // 蚂蚁线: 目标**只能是那条 path**(dashoffset 不是可继承属性 —— 挂组上图上不动)
    expect(count(svg, 'attributeName="stroke-dashoffset"')).toBe(4);
    expect(count(svg, 'href="#ant-')).toBe(4);
    for (const id of ['ant-e1', 'ant-e2', 'ant-e3', 'ant-e-loop']) expect(svg).toContain(`id="${id}"`);
    // 位移量 = 一个 dash 周期(12), 方向两档: 正向 −12 / 回滚 +12
    expect(count(svg, 'values="0;-12"')).toBe(3);
    expect(count(svg, 'values="0;12"')).toBe(1);
    expect(count(svg, 'repeatCount="indefinite"')).toBeGreaterThanOrEqual(5);   // 4 条蚂蚁线 + 末环呼吸
    // 时序链: 第 n 环接第 n−1 环的结尾(第一环起于 0.4s)
    expect(svg).toContain('id="lit1"');
    for (const b of ['0.4s', 'lit1.end', 'lit2.end', 'lit3.end', 'lit4.end']) expect(svg).toContain(`begin="${b}"`);
    // ⚠ 回归钉: 带连字符的同步基**静默不触发**(Chrome 实测) —— 这张图一个都不许再有
    expect(svg).not.toMatch(/begin="[a-z]+-[a-z0-9]+\.(begin|end)"/);
  });

  it('anim-progress: 条宽走 href 且动画终点 = 静态末态; 阵列逐格 visibility 的错峰是一条等差数列', () => {
    const { svg } = CASES[1];
    // ① href 逃逸舱: 目标 = 那个 rect(非继承属性 width); 终点必须与静态宽**逐位同值**(静态帧即末态)
    expect(svg).toContain('href="#grow-fill"');
    const staticW = grab(svg, /<rect x="[\d.]+" y="[\d.]+" width="([\d.]+)"[^>]*id="grow-fill"/)[0];
    const animW = grab(svg, /attributeName="width"[^>]*?to="([\d.]+)"/)[0];
    expect(staticW).toBeDefined();
    expect(animW).toBe(Number(staticW).toFixed(1));   // 同一个数: 少一位小数都不算"同值"
    // ② 逐格 visibility: 10 格, 错峰走 keyTimes 而不是 begin(begin 错峰会让那格先闪一下)
    expect(count(svg, 'attributeName="visibility"')).toBe(10);
    expect(count(svg, 'visibility" begin="0s"')).toBe(10);
    expect(count(svg, 'values="hidden;visible"')).toBe(10);
    expect(count(svg, 'calcMode="discrete"')).toBe(10);
    const steps = grab(svg, /attributeName="visibility"[^>]*keyTimes="0;([\d.]+)"/).map(Number);
    expect(steps).toEqual([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]);
  });

  it('anim-interactive: 四条 click 事件轨都冻在末态, 且 CSS 轨不碰 SMIL 占着的属性', () => {
    const { svg } = CASES[2];
    expect(count(svg, 'begin="click"')).toBe(4);
    expect(count(svg, 'begin="click"')).toBe(count(svg, 'fill="freeze"'));
    for (const id of ['hot-client', 'hot-gateway', 'hot-users', 'hot-orders']) expect(svg).toContain(`id="${id}"`);
    expect(count(svg, 'class="svx-tap"')).toBe(4);
    // 内嵌样式表: 悬停微反馈 + 呼吸关键帧(产物自带, 不靠宿主页面)
    const css = grab(svg, /<style type="text\/css">([\s\S]*?)<\/style>/)[0];
    expect(css).toContain('@keyframes');
    expect(css).toContain(':hover');
    expect(css).toContain('cursor: pointer');
    // ⚠ 分工判据: CSS 里不许出现 SMIL 那层的 id —— 两条轨压同一个属性时 CSS 会盖住 SMIL 动画,
    // 表现是"点了没反应"却不报错。动 opacity 的只有那个呼吸点(圆点), 而它身上没有 SMIL
    expect(css).not.toContain('hot-');
    expect(css).not.toContain('.svx-halo { opacity');
    expect(count(svg, 'class="svx-hint"')).toBe(1);
    expect(css).toContain('.svx-hint { animation: svx-breathe');
  });

  it('字节确定: 同一份 descriptor 两次导出逐字节全等(源里也不许有 Date.now / Math.random)', () => {
    for (const c of CASES) {
      // 每次重新序列化一遍: 上面的 `svg` 是一次, 这里再要两次 —— 三次逐字节全等才算"确定"
      expect(toSVG(c.doc)).toBe(c.svg);
      expect(toSVG(c.doc)).toBe(toSVG(c.doc));
      const src = readFileSync(join(ROOT, c.file), 'utf8');
      expect(src, c.file).not.toContain('Date.now');
      expect(src, c.file).not.toContain('Math.random');
    }
  });

  it('画幅: 三张的自然比例都落在画廊 3:2 画框的 1.3~1.7 带内', () => {
    for (const c of CASES) {
      const m = /^<svg [^>]*width="([\d.]+)" height="([\d.]+)"/m.exec(c.svg);
      const [w, h] = m ? [Number(m[1]), Number(m[2])] : [0, 0];
      expect(w > 0 && h > 0, c.name).toBe(true);
      expect(w / h, `${c.name} ${w}×${h}`).toBeGreaterThanOrEqual(1.3);
      expect(w / h, `${c.name} ${w}×${h}`).toBeLessThanOrEqual(1.7);
    }
  });
});
