// =====================================================================
// guard · shape 入参守卫 (治"NaN 静默丢元素, 而 audit 全绿")
//
// 验收思路沿用「把 bug 放回去看它喊不喊痛」: 先证明**失效模式真实存在**
// (NaN 真的会一路流到产物里), 再证明守卫在入口就拦住它 —— 否则测试只能证明
// "守卫不抛", 证不了"守卫有用"。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { HINT_KNOB_SIZE, HINT_SPREAD_RECT, ShapeInputError, assertFinitePoints, assertFiniteRect, resolveKnobs } from '../src/guard';
import { edgeShape } from '../src/shapes/edge';
import { groupLabelRect, groupShape } from '../src/shapes/group';
import { nodeGeometry, nodeShape } from '../src/shapes/node';
import { labelChip, textShape } from '../src/shapes/text';
import { type Descriptor, path, svg as svgRoot } from '../src/descriptor';
import { toSVG } from '../src/serialize';

/** 取出守卫抛的那个错(比 toThrow 更能断言"抛的是哪一种 + 说清了哪个字段") */
const guardErr = (fn: () => unknown): ShapeInputError => {
  try {
    fn();
  } catch (e) {
    if (e instanceof ShapeInputError) return e;
    throw e;
  }
  throw new Error('本该抛 ShapeInputError, 却没抛 —— 守卫漏了');
};

const node = { id: 'a', rect: { x: 40, y: 40, w: 120, h: 60 }, label: 'A' };
const ok = { x: 40, y: 40, w: 120, h: 60, label: 'A' };
const edge = { points: [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 60 }] };

describe('guard · shape 入参守卫与失效模式复现', () => {
  it('失效模式真实存在: 非有限坐标一路流进产物, 序列化**不躲**, 写出字面 NaN', () => {
    // 这是守卫要防的下场: 渲染器看到 d="M NaN NaN" 会静默丢弃整个元素
    const leaked = toSVG(svgRoot(100, 50, [path('M NaN NaN L 10 10', {})]));
    expect(leaked).toContain('NaN');
  });

  it('事故复现: `nodeShape({ ...n })`(本意展开 rect) 被当场拦下, 报错点名 x 且带上正确写法', () => {
    const err = guardErr(() => nodeShape({ ...node } as never));
    expect(err.shape).toBe('nodeShape');
    expect(err.field).toBe('x');
    expect(err.message).toContain('undefined');
    expect(err.message).toContain('...n.rect');
    // 提示常量本身也要经得起复用(使用者抄它就对了)
    expect(HINT_SPREAD_RECT).toContain('{ ...n.rect }');
  });

  it('三个入口(nodeShape / nodeGeometry / groupShape)各自把关, 报错里出现对的名字', () => {
    expect(guardErr(() => nodeShape({ ...node } as never)).shape).toBe('nodeShape');
    expect(guardErr(() => nodeGeometry({ ...node } as never)).shape).toBe('nodeGeometry');
    expect(guardErr(() => groupShape({ ...{ id: 'g', rect: ok } } as never)).shape).toBe('groupShape');
    expect(guardErr(() => groupLabelRect({ ...{ id: 'g', rect: ok }, label: 'G' } as never)).shape).toBe('groupLabelRect');
  });

  it('NaN / Infinity / 负宽高 全拦; 合法的 0 尺寸放行(退化但合法)', () => {
    expect(guardErr(() => nodeShape({ ...ok, y: NaN })).field).toBe('y');
    expect(guardErr(() => nodeShape({ ...ok, w: Infinity })).field).toBe('w');
    const neg = guardErr(() => nodeShape({ ...ok, h: -10 }));
    expect(neg.field).toBe('h');
    expect(neg.message).toContain('为负');
    expect(() => nodeShape({ ...ok, w: 0, h: 0 })).not.toThrow();
  });

  it('可选参数只在给了的时候校验(给了 NaN 也拦, 没给不算错)', () => {
    expect(() => nodeShape(ok)).not.toThrow();
    expect(guardErr(() => nodeShape({ ...ok, radius: NaN })).field).toBe('radius');
    expect(guardErr(() => nodeShape({ ...ok, fontSize: NaN })).field).toBe('fontSize');
    expect(guardErr(() => labelChip({ x: 10, y: 10, content: 'x', width: NaN })).field).toBe('width');
    expect(guardErr(() => labelChip({ x: 10, y: 10, content: 'x' } as never)).field).toBe('width');
    expect(guardErr(() => textShape({ x: NaN, y: 10, content: 'x' })).field).toBe('x');
    expect(guardErr(() => groupShape({ ...ok, labelInset: [NaN, 0] } as never)).field).toBe('labelInset[0]');
  });

  it('边: 折点至少两点, 且逐点校验(报出**是哪一个点**)', () => {
    expect(() => edgeShape(edge)).not.toThrow();
    const one = guardErr(() => edgeShape({ points: [{ x: 0, y: 0 }] }));
    expect(one.field).toBe('points');
    expect(one.message).toContain('不足两点');
    const bad = guardErr(() => edgeShape({ points: [{ x: 0, y: 0 }, { x: 5, y: NaN }] }));
    expect(bad.field).toBe('points[1].y');
    // 空数组 / 非数组同样拦(route 返回空列时最容易漏)
    expect(guardErr(() => edgeShape({ points: [] })).field).toBe('points');
    expect(guardErr(() => edgeShape({ points: null as never })).field).toBe('points');
  });

  it('assertFiniteRect / assertFinitePoints 可被外部直接用(供 demo 与 blink 写回前自检)', () => {
    expect(() => assertFiniteRect('my-call', { x: 0, y: 0, w: 1, h: 1 })).not.toThrow();
    expect(() => assertFinitePoints('my-call', [{ x: 0, y: 0 }, { x: 1, y: 1 }])).not.toThrow();
    expect(() => assertFinitePoints('my-call', [{ x: 0, y: 0 }])).toThrow(ShapeInputError);
  });

  it('守卫不误伤: 合法入参照常出图(descriptor 该有的形状一个不少)', () => {
    const kids = (d: Descriptor) => (d.kind === 'group' ? d.children.length : -1);
    const d = nodeShape({ ...ok, sub: '副标签', radius: 8, tone: 'blue' });
    expect(d.kind).toBe('group');
    expect(kids(d)).toBe(3); // path + 主标签 + 次标签
    // path + 箭头 marker(缺省 end 是 arrow-triangle, 所以 marker 占一个)。
    // 边**不再画标签** —— 文字一律走 edgeLabel() 落进 scene.labels, 由出口统一上屏(③)
    expect(kids(edgeShape({ ...edge }))).toBe(2);
  });

  // --- resolveKnobs(260920 从 templates/sequence.ts 上收) ---
  //
  // 这些用例钉的是"每张模板都会重抄的那段样板"的三条口径: 缺省回落 / 只守调用方给的值 /
  // 键集由缺省表决定。第三条尤其要钉住 —— 它决定了"拼错的旋钮名会被静默无视"这个已知代价。

  const KNOBS = { a: 10, b: 20, c: 0 } as const;

  it('resolveKnobs: 一个不给全回落缺省; 给了的就赢(包括合法的 0) —— 返回袋里键是齐的', () => {
    expect(resolveKnobs('demo', KNOBS, {})).toEqual({ a: 10, b: 20, c: 0 });
    expect(resolveKnobs('demo', KNOBS, { a: 0 })).toEqual({ a: 0, b: 20, c: 0 });
    expect(resolveKnobs('demo', KNOBS, { b: 33.5, c: 7 })).toEqual({ a: 10, b: 33.5, c: 7 });
    // 整数 / 小数 / 0 一律放行(缺省值本身不进守卫 —— 它是常量, 哄它没意义)
    expect(resolveKnobs('demo', KNOBS, { a: 0.5 }).a).toBe(0.5);
  });

  it('resolveKnobs: 越界当场抛, 报错点名 shape + **那一个**旋钮名, 并带"尺寸不是增量"的提示', () => {
    expect(guardErr(() => resolveKnobs('demo', KNOBS, { b: NaN })).field).toBe('b');
    expect(guardErr(() => resolveKnobs('demo', KNOBS, { b: NaN })).shape).toBe('demo');
    expect(guardErr(() => resolveKnobs('demo', KNOBS, { b: Number.POSITIVE_INFINITY })).message).toContain('Infinity');
    const neg = guardErr(() => resolveKnobs('demo', KNOBS, { c: -3 }));
    expect(neg.field).toBe('c');
    expect(neg.message).toContain('为负(-3)');
    expect(neg.message).toContain('尺寸不是增量');
    // 提示常量本身也要经得起复用(使用者抄它就对了 —— 与 HINT_SPREAD_RECT 同一纪律)
    expect(HINT_KNOB_SIZE).toBe('版式旋钮是尺寸不是增量; 想贴紧就给 0');
  });

  it('resolveKnobs: 键集由缺省表决定 —— 缺省表里没有的键**一律无视**(整份 spec 里还有决策表)', () => {
    const spec = { a: 30, actors: [{ id: 'x' }], title: 'T', rowGap: 56 };
    expect(resolveKnobs('demo', KNOBS, spec)).toEqual({ a: 30, b: 20, c: 0 });
    // ⚠ 已知代价: 拼错的旋钮名也在这个"无视"里 —— 类型化字面量由 tsc 拦, JSON 进来的拦不住。
    //    这条用例是**把这个代价写下来**(而不是假装它不存在): 哪天加了 spec schema, 它该改成抛。
    expect(resolveKnobs('demo', KNOBS, { A: 99 })).toEqual({ a: 10, b: 20, c: 0 });
  });
});
