// =====================================================================
// templates/layered · 分层带起手骨架的回归
//
// 模板层测试守的**不是几何谓词**, 而是"骨架替你算掉的那几件容易翻车的事", 每条对应一次真实的翻车:
//   · 层距必须由**内容高 + 走廊腰线需求**翻出来 —— 常量表会在这类图上悄然挤成 `edge_overlap`
//   · 盒宽盒高必须走 `nodeFit` —— 手填盒宽的那天, 就是图与门禁开始互相矛盾的那天
//   · 端口面: 只有**相邻层的竖直通道**能自动选, 其余情形当场抛 —— 引擎悄悄对齐是门禁看不出来的事故
//   · 同 spec 两遍必须逐字节相同, 但**不做 sha256 闸门**: 本模板的版式还在收敛, 逐字节锁会把
//     "调一次 layerGap"变成"改一次测试"; 这里守的是**确定性**与**决策敏感**, 不是某一份字节
// (对照 `test/sequence-template.test.ts`: 那边有 sha256 闸门, 因为它的列心累加政策要求产物锁死)
// =====================================================================

import { describe, expect, it } from 'bun:test';
import {
  DEMO_LAYERED, LAYERED_DEFAULTS, buildLayered, emitLayered, type LayeredNode, type LayeredSpec,
} from '../templates/layered';
import { audit } from '../src/knives/audit';
import { nodeFit } from '../src/knives/fit';
import { ShapeInputError } from '../src/guard';
import { tryExport } from '../src/export';

const D = LAYERED_DEFAULTS;
const N = (id: string, label?: string): LayeredNode => ({ id, label: label ?? id });
const build = (spec: LayeredSpec) => buildLayered(spec);
const svgOf = (spec: LayeredSpec): string => {
  const { scene, opts } = build(spec);
  return tryExport(scene, opts).svg;
};
/** 一个节点的盒宽盒高在**这份 spec** 下的内容下限 —— 断言"盒宽是从标签反算的"时用它当基准 */
const fitOf = (n: LayeredNode) => nodeFit({ label: n.label, sub: n.sub, level: 'showcase', shape: n.shape });
const allNodes = (spec: LayeredSpec): LayeredNode[] => spec.layers.flatMap((l) => l.rows.flatMap((r) => [...r]));

/** 两层的极简 spec: 单独测一颗护栏时用, 别把内置示例的复杂度带进来 */
const two = (extra: Partial<LayeredSpec> = {}): LayeredSpec => ({
  nodeH: 0,
  layers: [
    { id: 'up', label: '上层', rows: [[N('u1'), N('u2')]] },
    { id: 'down', label: '下层', rows: [[N('d1')]] },
  ],
  edges: [{ from: 'u1', to: 'd1' }],
  ...extra,
});
/** 只把 `two()` 的 `u1` 标签换掉, 其余一模一样 —— "只改一个决策"的最小样本 */
const twoWithLabel = (label: string): LayeredSpec => ({
  ...two(),
  layers: [
    { id: 'up', label: '上层', rows: [[{ id: 'u1', label }, N('u2')]] },
    { id: 'down', label: '下层', rows: [[N('d1')]] },
  ],
});
/** 抛出来的那个错(没抛本身就是用例失败) */
const thrown = (spec: LayeredSpec): ShapeInputError => {
  try {
    build(spec);
  } catch (e) {
    return e as ShapeInputError;
  }
  throw new Error('本该当场抛, 却给出了半成品 scene');
};

describe('layered 模板 · 起手骨架', () => {
  it('内置示例全绿出图: 0 error / 0 warning, 产物无 NaN', () => {
    const { scene, opts, plan } = build(DEMO_LAYERED);
    const report = audit(scene, { level: 'showcase' });
    expect(report.diagnostics.map((d) => `${d.severity} ${d.code}`)).toEqual([]);
    const out = tryExport(scene, opts);
    expect(out.report.pass).toBe(true);
    expect(out.draft).toBe(false);
    expect(out.svg).not.toContain('NaN');
    expect(out.svg).toStartWith('<?xml');
    // 三层十五节点十条边全上屏(内置示例是**真规模**的手排对照组, 不是玩具)
    expect([plan.layers.length, scene.nodes.length, scene.edges.length]).toEqual([3, 15, 10]);
    // 出口也顺带冒烟一遍(它会往 stderr 打摘要与诊断 —— 那就是出口该有的样子)
    expect(emitLayered(DEMO_LAYERED).report.pass).toBe(true);
  });

  it('边标签的字色跟着**自己那条边**的 tone 走(与 sequence 同一条纪律, 260925 接线)', () => {
    // `edgeLabel({ …, tone: c.edge.tone })`: 边有肤色, 标签的字就该一起读出来 —— 判据是同源,
    // 不是"标签这边挑个好看的颜色"(两处可以各改各的, 漂开时没有任何东西会响)。
    const { scene } = build(DEMO_LAYERED);
    const toneOf = new Map(scene.edges.map((e) => [e.id, e.tone]));
    const pairs = (scene.labels ?? []).map((l) => ({ owner: l.ownerEdge, label: l.tone, edge: toneOf.get(l.ownerEdge!) }));
    expect(pairs.length).toBeGreaterThan(0);
    expect(pairs.filter((p) => p.label !== p.edge)).toEqual([]);
    // 反面: 内置示例确实有带 tone 的带标签边(否则上面那条在"全 undefined"下白过)
    expect(pairs.filter((p) => p.edge !== undefined).length).toBeGreaterThan(0);
  });

  it('层距是账本的解: content / lanes 两条需求竞争, `by` 指名谁顶住的', () => {
    const { plan } = build(DEMO_LAYERED);
    // 逐段都对账: content = 该层内容高 + 双侧 pad + layerGap(逐字重算一遍, 不是"大约")
    plan.gaps.forEach((g, i) => {
      const layer = DEMO_LAYERED.layers[i];
      const boxH = plan.boxes[layer.rows[0][0].id].h;
      const contentH = layer.rows.length * boxH + (layer.rows.length - 1) * D.rowGap;
      expect(g.content).toBe(Math.ceil(contentH + 2 * D.layerPad + D.layerGap));
      expect(g.used).toBeGreaterThanOrEqual(Math.max(g.content, g.lanes));
    });
    // 内置示例两条走廊各只有 1 条边要穿过 ⇒ 腰线需求让位, 顶住解的是内容那条
    expect(plan.gaps.map((g) => g.by)).toEqual([['content:boot'], ['content:ctx']]);
    expect(plan.corridors.every((c) => c === D.layerGap)).toBe(true); // 层框线之间真的留出了 layerGap
  });

  it('账本是多源的: 同一段走廊塞 6 条边时, 顶住解的是**腰线需求**而不是内容', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    const spec = two({
      layers: [
        { id: 'up', label: '上层', rows: [ids.map((id) => N(id))] },
        { id: 'down', label: '下层', rows: [ids.map((_, i) => N(`p${i}`))] },
      ],
      edges: ids.map((id, i) => ({ from: id, to: `p${i}` })),
    });
    const g = build(spec).plan.gaps[0];
    expect(g.lanes).toBeGreaterThan(g.content); // 6 条边 = 5 个 15px 步距 + 两侧 gutter, 比 layerGap 还大
    expect(g.used).toBe(g.lanes);
    expect(g.by).toEqual(['lanes:up→down']);
  });

  it('层距由**内容高**驱动: 把一个 label 换成多行 ⇒ 该段层距变大(不是常量表)', () => {
    const short = build(twoWithLabel('a')).plan;
    const tall = build(twoWithLabel('a\nb\nc')).plan;
    expect(tall.boxes.u1.h).toBeGreaterThan(short.boxes.u1.h);          // 盒高长出来了
    expect(tall.gaps[0].used).toBeGreaterThan(short.gaps[0].used);      // 层距跟着长
    expect(short.gaps[0].used).toBe(short.boxes.u1.h + 2 * D.layerPad + D.layerGap);
    expect(audit(build(twoWithLabel('a\nb\nc')).scene, { level: 'showcase' }).pass).toBe(true);
  });

  it('单行更长的 label 只推宽盒与层框, 不推层距 —— core 没有换行, 这是明写的口径', () => {
    // 判据原话是"label 换更长 ⇒ 层距变大"。**单行**更长在 core 下只推**横向**: 层距的公式里
    // 只有内容高(行数与盒高), 而盒高由 `nodeFit` 按**行数**给(单行 39 / 两行 55 / 三行 71)。
    // 所以要证明"层距内容驱动", 单行这条走的是"上一行的多行标签"; 这里把单行的真实去向钉住,
    // 免得哪天有人为了让判据字面成立, 在模板里塞一条没来由的层距增量。
    const short = build(twoWithLabel('a')).plan;
    const wide = build(twoWithLabel('这是一条相当长的单行标签文字内容')).plan;
    expect(wide.boxes.u1.w).toBeGreaterThan(short.boxes.u1.w);
    expect(wide.layers[0].frame.w).toBeGreaterThan(short.layers[0].frame.w);
    expect(wide.gaps[0].used).toBe(short.gaps[0].used);
  });

  it('盒宽一律由 nodeFit 反算(label 更长 ⇒ 盒更宽), 没有第二张手填的盒宽盒高表', () => {
    const { plan } = build(DEMO_LAYERED);
    for (const n of allNodes(DEMO_LAYERED)) {
      expect(plan.boxes[n.id].w).toBe(fitOf(n).w); // 逐节点相等, 不是"不小于"
      expect(plan.boxes[n.id].h).toBe(Math.max(54, ...allNodes(DEMO_LAYERED).map((m) => fitOf(m).h)));
    }
    // 同一份 spec 只改一个 label 的宽度 ⇒ 盒宽跟着变, 且这一个变宽把该行的宽也带起来
    const base = build(twoWithLabel('a')).plan;
    const wider = build(twoWithLabel('一条明显更长的节点标签')).plan;
    expect(wider.boxes.u1.w).toBeGreaterThan(base.boxes.u1.w);
    expect(wider.layers[0].frame.w - base.layers[0].frame.w).toBe(wider.boxes.u1.w - base.boxes.u1.w);
  });

  it('层框宽 = 该层成员的盒并集 + 2·layerPad(横向也是内容反算, 不是全图画布宽)', () => {
    const { plan } = build(DEMO_LAYERED);
    plan.layers.forEach((l) => {
      const rs = l.members.map((id) => plan.boxes[id]);
      const span = Math.max(...rs.map((r) => r.x + r.w)) - Math.min(...rs.map((r) => r.x));
      expect(Math.abs(l.frame.w - (span + 2 * D.layerPad))).toBeLessThan(0.2);
    });
    // 而 `frame: 'band'` 是作者显式铺满全宽 —— 派生跳过, 框与内容的关系故意不再是这一条
    const band = build({ ...DEMO_LAYERED, frame: 'band' }).plan;
    expect(band.layers[1].frame.w).toBeGreaterThan(plan.layers[1].frame.w);
    expect(band.layers[2].frame.w).toBeGreaterThan(plan.layers[2].frame.w);
  });

  it('护栏①: 相邻层的竖直边自动选面(底出顶进), 依据写进 plan 可对账', () => {
    const { plan } = build(DEMO_LAYERED);
    // 两条跨层边都指向**整层**(端点落在层框上), 上端在末行 ⇒ 自动
    for (const id of ['inject', 'assemble']) {
      const e = plan.edges.find((x) => x.id === id);
      expect([e?.fromSide, e?.toSide]).toEqual(['bottom', 'top']);
      expect([e?.fromBasis, e?.toBasis]).toEqual(['auto:adjacent-layer', 'auto:adjacent-layer']);
    }
    // 判据按**上/下**而不是 from/to: 反向(下层 → 上层)的竖边照样自动, 只是换成顶出底进
    const up = build(two({ edges: [{ from: 'd1', to: 'u1' }] })).plan.edges[0];
    expect([up.fromSide, up.toSide]).toEqual(['top', 'bottom']);
    expect([up.fromBasis, up.toBasis]).toEqual(['auto:adjacent-layer', 'auto:adjacent-layer']);
  });

  it('护栏②: 同层边 / 自环 / 跳层边 / 不在末行首行 —— 不给 side 当场抛, 点名端点与可选面', () => {
    const three: LayeredSpec = {
      nodeH: 0,
      layers: [
        { id: 'a', label: '甲', rows: [[N('a1')]] },
        { id: 'b', label: '乙', rows: [[N('b1')]] },
        { id: 'c', label: '丙', rows: [[N('c1')]] },
      ],
    };
    const same = thrown(two({ edges: [{ from: 'u1', to: 'u2' }] }));
    expect(same.message).toMatch(/edges\[0\]\.fromSide/); // 点名字段
    expect(same.message).toMatch(/u1/);                   // 点名端点
    expect(same.message).toMatch(/同层/);                 // 说清为什么不能猜
    expect(same.message).toMatch(/top \/ right \/ bottom \/ left/); // 把可选面列出来
    expect(thrown(two({ edges: [{ from: 'u1', to: 'u1' }] })).message).toMatch(/自环/);
    expect(thrown({ ...three, edges: [{ from: 'a1', to: 'c1' }] }).message).toMatch(/隔着 1 层/);
    // 两端虽然在相邻层, 但源不在本层末行(它下面还有行) ⇒ 竖直下去必穿盒, 那不是"通道"
    expect(thrown({
      nodeH: 0,
      layers: [
        { id: 'up', label: '上层', rows: [[N('u1')], [N('u2')]] },
        { id: 'down', label: '下层', rows: [[N('d1')]] },
      ],
      edges: [{ from: 'u1', to: 'd1' }],
    }).message).toMatch(/不在上层末行/);
    expect(thrown({
      nodeH: 0,
      layers: [
        { id: 'up', label: '上层', rows: [[N('u1')]] },
        { id: 'down', label: '下层', rows: [[N('d1')], [N('d2')]] },
      ],
      edges: [{ from: 'u1', to: 'd2' }],
    }).message).toMatch(/不在下层首行/);
    // 目标是层框时没有"首行"这回事 —— 那一端照样可以自动(另一端仍需合规)
    expect(build(two({ edges: [{ from: 'u1', to: 'down' }] })).plan.edges[0].toBasis).toBe('auto:adjacent-layer');
  });

  it('护栏③: 调用方给的 side 永远赢(逐端独立), 依据是 explicit', () => {
    const both = build(two({ edges: [{ from: 'u1', to: 'u2', fromSide: 'right', toSide: 'left' }] })).plan.edges[0];
    expect([both.fromSide, both.toSide]).toEqual(['right', 'left']);
    expect([both.fromBasis, both.toBasis]).toEqual(['explicit', 'explicit']);
    // 只给一端: 那一端赢, 另一端仍走自动 —— 两端各判各的
    const half = build(two({ edges: [{ from: 'u1', to: 'd1', fromSide: 'right' }] })).plan.edges[0];
    expect([half.fromSide, half.fromBasis]).toEqual(['right', 'explicit']);
    expect([half.toSide, half.toBasis]).toEqual(['top', 'auto:adjacent-layer']);
    // 显式赢了之后, 门禁不看"你是不是本该自动" —— 它只看几何
    expect(audit(build(two({ edges: [{ from: 'u1', to: 'u2', fromSide: 'bottom', toSide: 'bottom' }] })).scene, { level: 'showcase' }).pass).toBe(true);
  });

  it('同 spec 跑两遍产物逐字节相同; 改一个决策(挪节点到另一层)产物必须变', () => {
    expect(svgOf(DEMO_LAYERED)).toBe(svgOf(DEMO_LAYERED));
    // 决策: 把 `SEAM` 从服务层挪到装配层(谁在哪层变了) ⇒ 层框 / 行位 / 画布全跟着走
    const [boot, ctx, run] = DEMO_LAYERED.layers;
    const seam = ctx.rows[0].find((n) => n.id === 'SEAM');
    if (!seam) throw new Error('内置示例里 SEAM 不在服务层首行 —— 本用例的前提变了');
    const moved: LayeredSpec = {
      ...DEMO_LAYERED,
      layers: [
        { ...boot, rows: [[...boot.rows[0], seam]] },
        { ...ctx, rows: [ctx.rows[0].filter((n) => n.id !== 'SEAM'), ...ctx.rows.slice(1)] },
        run,
      ],
    };
    expect(svgOf(moved)).not.toBe(svgOf(DEMO_LAYERED));
    // 换层序也是决策: 服务层与运行层对调 ⇒ 那条跨层边变成"隔着一层", 当场抛(护栏② 顺带守住了它)
    expect(() => build({ ...DEMO_LAYERED, layers: [boot, run, ctx] })).toThrow(/隔着 1 层/);
  });

  it('畸形入参当场抛(不给半成品 scene): 点名字段 + 已知 id', () => {
    expect(() => build({ layers: [] })).toThrow(/至少一层/);
    expect(() => build({ layers: [{ id: 'l', label: 'L', rows: [[N('a'), N('a')]] }] })).toThrow(/重名/);
    // 层 id 与节点 id 共用一套命名空间(边两端都可能指它们) —— 撞名也要拦
    expect(() => build({ layers: [{ id: 'a', label: 'L', rows: [[N('a')]] }] })).toThrow(/重名/);
    expect(() => build({ layers: [{ id: 'l', label: '', rows: [[N('a')]] }] })).toThrow(/label/);
    expect(() => build({ layers: [{ id: 'l', label: 'L', rows: [] }] })).toThrow(/一行都没有/);
    expect(() => build({ layers: [{ id: 'l', label: 'L', rows: [[]] }] })).toThrow(/这一行没有节点/);
    expect(() => build({ layers: [{ id: 'l', label: 'L', rows: [[{ id: '', label: 'x' }]] }] })).toThrow(/id/);
    expect(() => build({ layers: [{ id: 'l', label: 'L', rows: [[{ id: 'a' } as unknown as LayeredNode]] }] })).toThrow(/label/);
    const ghost = thrown({ ...two(), edges: [{ from: 'ghost', to: 'u1' }] });
    expect(ghost.message).toMatch(/不是任何节点 \/ 层的 id/);
    expect(ghost.message).toMatch(/已知层: up \/ down/);
    expect(ghost.message).toMatch(/已知节点: u1 \/ u2 \/ d1/);
    expect(() => build(two({ edges: [{ from: 'u1', to: 'd1', fromT: 1.5 }] }))).toThrow(/不在 \[0, 1\] 里/);
    expect(() => build(two({ edges: [{ from: 'u1', to: 'd1', toSide: 'up' as never }] }))).toThrow(/不在词表里/);
    expect(() => build(two({ frame: 'float' as never }))).toThrow(/只认 derived/);
    expect(() => build(two({ rowGap: -1 }))).toThrow(/为负/);
    // 两颗版式守卫: 层框内边距装不下框内标题 / 层标题比这一层的框还宽
    expect(() => build(two({ layerPad: 10 }))).toThrow(/装不下框内标题/);
    expect(() => build({
      nodeH: 0,
      layers: [
        { id: 'up', label: '这是一条长得离谱的层框标题会把框戳穿', rows: [[N('u1')]] },
        { id: 'down', label: '下层', rows: [[N('d1')]] },
      ],
      edges: [{ from: 'u1', to: 'd1' }],
    })).toThrow(/比这一层的框还宽/);
  });

  it("frame: 'band' 走作者显式框(派生跳过), 全绿但把 `cluster_corridor` 的代价如实留下", () => {
    const band = build({ ...DEMO_LAYERED, frame: 'band' });
    const report = audit(band.scene, { level: 'showcase' });
    expect(report.metrics.errors).toBe(0);
    // band = 每条带都是同宽的全宽横带(泳道感), 而 it 的成员仍骑中轴 ⇒ 框内两侧留白
    const widths = new Set(band.plan.layers.map((l) => l.frame.w));
    expect(widths.size).toBe(1);
    // 代价: core 的 `cluster_corridor` 读"框被拉得比内容长" —— band 形态的固有成本, 不是 bug。
    // 所以内置示例走 derived; 想用 band 就得接受这两条 warning(或把成员铺满)。
    expect(report.diagnostics.map((d) => d.code)).toContain('cluster_corridor');
    expect(build(DEMO_LAYERED).plan.layers.map((l) => l.frame.w).length).toBe(3);
  });
});
