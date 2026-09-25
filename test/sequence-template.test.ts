// =====================================================================
// templates/sequence · 序列图起手骨架的回归
//
// 模板层的测试与 core 的不同: 这里守的**不是几何谓词**, 而是"骨架替你算掉的那几件容易翻车的事"
// —— 每一条都对应一次真实的翻车可能, 注释里写清为什么:
//   · 消息边的 `from`/`to` 必须留空(写上会被 `port_crowding` 误判成"同源端口")
//   · 消息标签必须横向只落在一个列距内(跨列消息居中放必被中间泳道线穿过)
//   · 列距 / 画布右缘必须由内容反算(手定的那组数正是 QUICKREF 说的"门禁照绿但图是空"的病)
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { DEMO_SEQUENCE, SEQ_DEFAULTS, buildSequence } from '../templates/sequence';
import { type Scene, audit, labelRect } from '../src/knives/audit';
import { labelBoxSize } from '../src/shapes/edge';
import { ShapeInputError } from '../src/guard';
import { createHash } from 'node:crypto';
import { tryExport } from '../src/export';

const A = (id: string, label = id) => ({ id, label });
const build = (spec: Parameters<typeof buildSequence>[0]) => buildSequence(spec);

/** 泳道线的 x 集合(序列图里"文本不许压"的那几条线) */
const lifelineX = (scene: Scene): number[] =>
  scene.edges.filter((e) => e.id.startsWith('life:')).map((e) => e.points[0].x);

describe('sequence 模板 · 内置示例', () => {
  it('内置示例产物是逐字节锁定的(sha256 闸门)', () => {
    // 这条守的不是"图好不好看", 是**一条保命政策**: ⑤ 段算列心时**故意**自家累加、不走账本的
    // `positions` —— 账本那条路要先给一个带小数的 origin(`margin + 半盒宽`)再逐位取和, 浮点结合律
    // 会带进 ulp 级差异, 而本模板的产物要求逐字节不变。260922 把"逐格取 max"换成账本求解时, 就是
    // 靠这条对账证明改造无损(那时的证据只有手工 shasum, 没有任何测试看着 —— 一次"顺手统一用
    // positions"就能悄悄改掉每个坐标还不报警)。
    // 产物**有意**变了再换数: `bun run templates/sequence.ts --out=/tmp/seq.svg && shasum -a 256 /tmp/seq.svg`
    // (260923 换过一次: 边标签遮罩片的高从 `fontSize + 2×padY` 的近似改成真行块并集 —— 单行标签
    //  的检测盒因此变高, 全图字节随之变化。这是**口径换代**, 不是渲染漂移: 文字位置一字未动。
    //  260925 再换两次(同一轮的两步, 各自核对过):
    //  ① 遮罩底色改画布色(隐形)+ 内边距收紧 5/4 → 4/2 —— 逐行 diff 只见到 `label-box` 的 rect
    //     从 #f8fafc 变 #ffffff、宽 −2、高 −4; 列距按更瘦的标签反算 ⇒ 每格 −2px、画布宽 586 → 580;
    //     标签盒底边离线距离不变(抬高量跟着半高走, 字因此各下沉 2px)。
    //  ② 标签接上 `tone`(`edgeLabel({ …, tone: s.tone })`)—— 8 条消息标签的字色各随自己那条线:
    //     #475569 → blue #1e3a8a(×3)/ violet #4c1d95 / slate #0f172a(×3)/ emerald #064e3b,
    //     **只有 8 个 `<text>` 的 fill 变了, 元素数与全部坐标一字未动**。
    //  ③ 遮罩行高改**墨迹口径**(1.15em, 见 `MASK_ROW_INK_EM`)+ 内边距 4/2 → 3/1 —— `label-box` 的
    //     rect 宽 −2 / 高 −4.8; 列距按更瘦的标签反算 ⇒ [133,166,156] → [132,164,154](第一格被
    //     版式下限 132 兜住, 故只 −1), 画布宽 580 → 575; 标签盒底边离线距离不变, 字因此各下沉 2.4px。
    //     元素数 125 → 125 零增删。
    //  ④ 移除 `central` 的光学补偿 `OPTICAL_CENTRAL_FIX`(对齐调研: 单行字被它统一多推 1.2px)——
    //     16 条 `<text>` 的 y 各**上移 1.2**(原始值精确 1.2; 序列化后那条边标签显示 −1.1,
    //     是 `round1` 落在 .x5 半格边界上的取整抖动, 复算见 `test/text-center.test.ts` 的回归);
    //     画布 575×588 与元素数(rect 9 / g 27 / path 27 / text 16)**一字未动**, 去掉全部
    //     `<text>` 之后其余字节逐字节相同。
    // 各轮的判据与 diff 都在本文件 + `label-box-size` / `label-rotate` / `semantic-slots` / `text-center` 里钉着。)
    const { scene, opts } = build(DEMO_SEQUENCE);
    expect(createHash('sha256').update(tryExport(scene, opts).svg).digest('hex'))
      .toBe('1d2c1a5455d2b4ced678db8a29b75173eedff6709db284e7f9ccad41d0e264e4');
  });

  it('全绿出图: 0 error / 0 warning, 产物无 NaN', () => {
    const { scene, opts } = build(DEMO_SEQUENCE);
    const report = audit(scene, { level: 'showcase' });
    expect(report.diagnostics.map((d) => `${d.severity} ${d.code}`)).toEqual([]);
    const out = tryExport(scene, opts);
    expect(out.report.pass).toBe(true);
    expect(out.draft).toBe(false);
    expect(out.svg).not.toContain('NaN');
    expect(out.svg).toStartWith('<?xml');
  });

  it('消息边一律不写 from/to —— 写了会被 port_crowding 的"投影回盒"档误判成同源端口', () => {
    // 实测(260919): 把这 8 条消息的 from/to 补上, audit 立刻从 0 诊断变成
    // **9 条 `port_crowding` / `shared_projected_port`** —— 端点明明相距 392px,
    // 只因"序列图的端点天然在盒外(在泳道线上)"被 clamp 回盒后重合。
    // 本用例是那个坑的回归守卫: 谁哪天"顺手补上 from/to", 这里立刻红。
    const { scene } = build(DEMO_SEQUENCE);
    const msgs = scene.edges.filter((e) => e.id.startsWith('m'));
    expect(msgs.length).toBe(DEMO_SEQUENCE.messages.length);
    expect(msgs.every((e) => e.from === undefined && e.to === undefined)).toBe(true);
    // 泳道线相反: 端点在盒底边上, 是唯一一端 —— 写 from/to 有语义且不会配成端口对
    const lines = scene.edges.filter((e) => e.id.startsWith('life:'));
    expect(lines.every((e) => e.from === e.to)).toBe(true);
  });

  it('消息标签的字色跟着**自己那条边**的 tone 走(标签这侧不许另给一个色)', () => {
    // 260925 接线: `edgeLabel({ …, tone: s.tone })` —— 边有肤色就该让标签的字一起读出来。
    // 判据钉在"同源"上: 每条标签的 `tone` 必须与它 `ownerEdge` 那条边的 `tone` **同一个值**,
    // 而不是"标签这边自己挑一个好看的色"(那样两处可以各改各的, 漂开时没有任何东西会响)。
    const { scene } = build(DEMO_SEQUENCE);
    const toneOf = new Map(scene.edges.map((e) => [e.id, e.tone]));
    const pairs = (scene.labels ?? []).map((l) => ({ id: l.id, owner: l.ownerEdge, label: l.tone, edge: toneOf.get(l.ownerEdge!) }));
    expect(pairs.length).toBeGreaterThan(0);
    expect(pairs.filter((p) => p.label !== p.edge)).toEqual([]);
    // 反面: 内置示例确实有**带 tone** 的消息(否则上面那条断言在"全 undefined"下白过)
    expect(pairs.filter((p) => p.edge !== undefined).length).toBeGreaterThan(0);
  });

  it('标签的 x 区间里不许出现任何泳道线 —— "标签只落在一个列距内"这条纪律的机器化', () => {
    const { scene } = build(DEMO_SEQUENCE);
    const xs = lifelineX(scene);
    const checked = (scene.labels ?? []).map((l) => {
      const r = labelRect(l);
      return { id: l.id, hit: xs.filter((x) => x >= r.x && x <= r.x + r.w) };
    });
    expect(checked.length).toBeGreaterThan(0);
    expect(checked.filter((c) => c.hit.length).map((c) => c.id)).toEqual([]);
  });

  it('每条消息线在自己的 y 上, 且是正交折线(直连 = 2 点, 自调用 = 4 点)', () => {
    const { scene, plan } = build(DEMO_SEQUENCE);
    const msgs = scene.edges.filter((e) => e.id.startsWith('m'));
    msgs.forEach((e, i) => {
      const self = DEMO_SEQUENCE.messages[i].from === DEMO_SEQUENCE.messages[i].to;
      expect(e.points.length).toBe(self ? 4 : 2);
      expect(e.points[0].y).toBe(plan.rows[i]);
      for (let k = 1; k < e.points.length; k++) {
        const a = e.points[k - 1], b = e.points[k];
        expect(a.x === b.x || a.y === b.y).toBe(true); // 正交: 每段只在一个轴上动
      }
    });
    // 行距是等差的, 顺序 = 作者的 messages 序
    expect(plan.rows[1] - plan.rows[0]).toBe(SEQ_DEFAULTS.rowGap);
  });
});

describe('sequence 模板 · 骨架算的是"内容下限", 不是拍出来的数', () => {
  it('列距逐格取 max(版式下限, 盒净空, 装标签), 且 needs 把账目说出来', () => {
    const { plan } = build(DEMO_SEQUENCE);
    expect(plan.gaps.length).toBe(DEMO_SEQUENCE.actors.length - 1);
    plan.needs.forEach((n) => {
      expect(n.used).toBe(Math.max(SEQ_DEFAULTS.colGapMin, n.box, n.label));
      expect(n.used).toBe(plan.gaps[n.index]);
    });
    // 至少有一格是被标签顶开的(否则这个账目没被真的走通)
    expect(plan.needs.some((n) => n.label > SEQ_DEFAULTS.colGapMin)).toBe(true);
  });

  it('长标签把列距顶开; 短标签时回落到版式下限', () => {
    const short = build({ actors: [A('a'), A('b')], messages: [{ from: 'a', to: 'b', label: 'ok' }] });
    expect(short.plan.gaps[0]).toBe(SEQ_DEFAULTS.colGapMin);
    const long = build({ actors: [A('a'), A('b')], messages: [{ from: 'a', to: 'b', label: '这是一条很长的消息标签需要把列距顶开不少' }] });
    expect(long.plan.gaps[0]).toBeGreaterThan(SEQ_DEFAULTS.colGapMin);
    // 顶开之后仍然全绿: 门禁 `label_clearance` 是这条推导的验收者
    expect(audit(long.scene, { level: 'showcase' }).pass).toBe(true);
  });

  it('列距反算用的那份尺寸 = 上屏那块遮罩片的尺寸(单一来源, 假边探测的回归守卫)', () => {
    const text = '这是一条很长的消息标签需要把列距顶开不少';
    const { scene, plan } = build({ actors: [A('a'), A('b')], messages: [{ from: 'a', to: 'b', label: text }] });
    const size = labelBoxSize(text);
    // ④ 的公式: 跨列标签需 = 标签宽 + 两侧 labelGap; 那一格列距 = max(下限, 盒需, 标签需)
    expect(plan.needs[0].label).toBe(Math.ceil(size.width + 2 * SEQ_DEFAULTS.labelGap));
    expect(plan.gaps[0]).toBe(plan.needs[0].used);
    // 上屏那块的字号 / 宽 / 高与反算用的**完全相等** —— 两条路径不许各有各的估算
    // (260920 之前这里靠"造一条 1px 假边喂 edgeLabel 再抠 .width", 本用例就是它的替代守卫)
    const lab = (scene.labels ?? []).find((l) => l.ownerEdge === 'm0');
    expect([lab?.width, lab?.height, lab?.fontSize]).toEqual([size.width, size.height, size.fontSize]);
  });

  it('`labelLift` 是可传的旋钮(260920 补登): 抬得越高标签 y 越小, 且照旧全绿', () => {
    const spec = { actors: [A('a'), A('b')], messages: [{ from: 'a', to: 'b', label: 'ok' }] };
    const yOf = (labelLift?: number) => (build({ ...spec, labelLift }).scene.labels ?? [])[0].at.y;
    expect(yOf() - yOf(24)).toBe(20); // 抬升量就是两个 labelLift 之差(自身半高那项抵消)
    expect(audit(build({ ...spec, labelLift: 24 }).scene, { level: 'showcase' }).pass).toBe(true);
  });

  it('末列的自调用: 画布右缘要容下"环 + 标签"(否则 fit 把它裁掉而门禁不知道)', () => {
    const spec = {
      actors: [A('a'), A('b', 'B 列名很长很长')],
      messages: [{ from: 'b', to: 'b', label: '末列自调用的说明文字' }],
    };
    const { scene, plan } = build(spec);
    const loop = scene.edges.find((e) => e.id === 'm0');
    const label = (scene.labels ?? [])[0];
    expect(loop).toBeDefined();
    expect(label).toBeDefined();
    const loopRight = Math.max(...(loop?.points ?? []).map((p) => p.x));
    const labelRight = labelRect(label).x + labelRect(label).w;
    expect(plan.width).toBeGreaterThan(labelRight);
    expect(plan.width).toBeGreaterThan(loopRight);
    expect(audit(scene, { level: 'showcase' }).pass).toBe(true);
  });

  it('泳道线的样式走覆盖表: 调用方给的 edgeStyles 赢过模板缺省', () => {
    const { opts } = build({
      actors: [A('a'), A('b')],
      messages: [],
      edgeStyles: { 'life:a': { dash: undefined, width: 2.5 } },
    });
    expect(opts.edgeStyles?.['life:a']?.width).toBe(2.5);
    expect(opts.edgeStyles?.['life:a']?.dash).toBeUndefined();
    // 没被覆盖的那条仍是模板缺省(细虚线 / 无端点)
    expect(opts.edgeStyles?.['life:b']?.dash).toBe('2 7');
    expect(opts.edgeStyles?.['life:b']?.end).toBe('none');
  });
});

describe('sequence 模板 · 激活条(消息下标 → 圆头竖条)', () => {
  const acts = DEMO_SEQUENCE.activations ?? [];

  it('骑在列心上, 顶边落在起始消息线、底边落在结束消息线上(不是"大约")', () => {
    const { scene, plan } = build(DEMO_SEQUENCE);
    expect(plan.bars.length).toBe(acts.length);
    plan.bars.forEach((b) => {
      const node = scene.nodes.find((n) => n.id === b.id);
      expect(node?.rect).toEqual(b.rect);
      expect(b.rect.w).toBe(SEQ_DEFAULTS.barW);
      expect(node?.radius).toBe(SEQ_DEFAULTS.barW / 2); // 圆头 —— 半径就是半宽
      expect(b.rect.y).toBe(plan.rows[b.from]);
      expect(b.rect.y + b.rect.h).toBe(Math.max(plan.rows[b.to], plan.rows[b.from] + SEQ_DEFAULTS.barMinH));
      const col = DEMO_SEQUENCE.actors.findIndex((a) => a.id === b.actor);
      expect(b.rect.x + b.rect.w / 2).toBe(plan.columns[col]); // 骑在泳道线中心(不偏不倚)
    });
  });

  it('条色沿泳道走, 但调用方点的那一格赢', () => {
    const { scene } = build({
      actors: [A('a', '甲'), { id: 'b', label: '乙', tone: 'rose' }],
      messages: [{ from: 'a', to: 'b', label: 'm' }],
      activations: [{ actor: 'b', from: 0, to: 0 }, { actor: 'a', from: 0, to: 0, tone: 'teal' }],
    });
    const toneOf = (id: string) => scene.nodes.find((n) => n.id === id)?.tone;
    expect(toneOf('bar:b#0')).toBe('rose');  // 缺省继承泳道语义槽
    expect(toneOf('bar:a#1')).toBe('teal');  // 显式点的那一个不被继承覆盖(id 后缀 = activations 数组序)
  });

  it('只有带条的泳道线才标 noCheck —— 没有 activation 的图一个字节都不该变', () => {
    const withBar = build(DEMO_SEQUENCE);
    const barActors = new Set(acts.map((a) => a.actor));
    for (const e of withBar.scene.edges.filter((x) => x.id.startsWith('life:'))) {
      const actor = e.id.slice('life:'.length);
      expect(e.noCheck).toBe(barActors.has(actor) ? true : undefined);
    }
    // 无 activation 的图: lifeline 不带豁免(老产物形态原样保留)
    const plain = build({ actors: [A('a'), A('b')], messages: [{ from: 'a', to: 'b', label: 'x' }] });
    expect(plain.scene.edges.filter((e) => e.id.startsWith('life:')).every((e) => e.noCheck === undefined)).toBe(true);
    expect(withBar.scene.nodes.some((n) => n.id.startsWith('bar:'))).toBe(true);
  });

  it('跨列消息横穿中间泳道的条照报 —— 豁免加在"边"上, 不在条上(变体 E 的机器化)', () => {
    // 意图: 证明 noCheck 没有把真事故一起放过。把末尾泳道的条拉长到"网关 → 数据库"那条
    // 跨列消息必经之处, `edge_node_clearance` 必须指着消息边开火。
    const { scene, plan } = build({
      actors: [A('a'), A('b'), A('c')],
      messages: [
        { from: 'a', to: 'c', label: '跨列' },   // 从第 0 列横穿第 1 列, 到第 2 列
        { from: 'c', to: 'a', label: '回来' },
      ],
      activations: [{ actor: 'b', from: 0, to: 1 }], // 第 1 列的条盖住这两条消息之间
    });
    expect(plan.bars.length).toBe(1);
    const rep = audit(scene, { level: 'showcase' });
    const hit = rep.diagnostics.filter((d) => d.code === 'edge_node_clearance' && d.subject.id === 'm0');
    expect(hit.length).toBe(1);
    expect(hit[0]?.evidence.node).toBe('bar:b#0');
  });

  it('区间越界 / 倒序 / 未知泳道 / barW 够到消息端点 —— 全部当场抛', () => {
    const msg = [{ from: 'a', to: 'b', label: 'x' }];
    const base = { actors: [A('a'), A('b')], messages: msg };
    expect(() => build({ ...base, activations: [{ actor: 'ghost', from: 0, to: 0 }] })).toThrow(/不是任何泳道/);
    expect(() => build({ ...base, activations: [{ actor: 'a', from: 0, to: 5 }] })).toThrow(/不是合法的消息下标/);
    // 倒序要拿**两条**消息测: 一条消息时 from=1 会先被下标守卫拦下(那是另一条判决)
    const two = [...msg, { from: 'b', to: 'a', label: 'y' }];
    expect(() => build({ ...base, messages: two, activations: [{ actor: 'a', from: 1, to: 0 }] })).toThrow(/模板不替你交换/);
    // 两个旋钮的相互制约: 单看任一个都合法, 联立才炸 —— 条会盖住消息端点
    expect(() => build({ ...base, activations: [{ actor: 'a', from: 0, to: 0 }], barW: 16 })).toThrow(/会盖住消息端点/);
    expect(build({ ...base, activations: [{ actor: 'a', from: 0, to: 0 }], barW: 13 }).plan.bars.length).toBe(1);
  });
});

describe('sequence 模板 · 边界与畸形入参', () => {
  it('单泳道 / 无消息 / 只有自调用都不炸, 且全绿', () => {
    const cases = [
      { actors: [A('one')], messages: [{ from: 'one', to: 'one', label: '自省' }] },
      { actors: [A('a'), A('b')], messages: [] },
      { actors: [A('a'), A('b')], messages: [{ from: 'a', to: 'a', label: 'x' }, { from: 'a', to: 'a', label: 'y' }] },
    ];
    for (const spec of cases) {
      const { scene } = build(spec);
      expect(audit(scene, { level: 'showcase' }).pass).toBe(true);
    }
  });

  it('畸形入参当场抛(不给半成品 scene), 报错点名字段并给出已知泳道', () => {
    expect(() => build({ actors: [], messages: [] })).toThrow(ShapeInputError);
    expect(() => build({ actors: [A('a'), A('a')], messages: [] })).toThrow(/重名/);
    expect(() => build({ actors: [A('a')], messages: [{ from: 'a', to: 'ghost' }] })).toThrow(/已知泳道: a/);
    expect(() => build({ actors: [{ id: 'a', label: '' }], messages: [] })).toThrow(/label/);
    expect(() => build({ actors: [A('a'), A('b')], messages: [], rowGap: -1 })).toThrow(/为负/);
  });
});
