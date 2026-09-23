// =====================================================================
// scene 回归单测 · 缓存有效期的两类定时炸弹
//
// 这份文件守的是设计稿 §4.1 / §4.2 焊进代码的那几条, 每条都对应一类"改错了会静默通过"的口子:
//   · 版本号时间线: 独立自增的实现会让"连续重测两次再改 HTML"假新鲜(事故 b 漏网)
//   · 源指纹判据: 只比计数的实现会把"改了又改回"(内容没变)也判成陈旧, 逼人白重测一遍
//   · manual 保护: 手改 bounds 被重测静默覆盖(事故 a)
//   · estimate 反向规则: 估算值赖在缓存里不被重测换掉
//   · 出口门禁: 陈旧缓存照样出图
//   · 纯函数性: 写回就地改入参 → 拿两份 scene 做 diff 的调用方全部读到脏数据
//
// 断言里刻意钉住的几条语义(实现里容易"顺手改坏"的地方):
//   · `html_rev` / `scene_rev` 共用一条时间线, 推进量是 `max(两值) + 1`, **不是** 各自 ++
//   · 判决**指纹优先**(`html_hash` vs `scene_hash`), 缺任一侧才降级回计数 + warning
//   · 决策源的排版(CRLF / 行尾空白 / HTML 注释)与键顺序**不进指纹**; 语义字段一改必进
//   · manual 的保护只认"目标节点是 manual", 不看本次写回声明的来源; 覆盖的路只有 `force`
//   · estimate 一条 warning 都不出(它就是要被覆盖的那个, 与 manual 正好相反)
//   · 一条 patch 都没写进去 → 原样返回同一实例且**不推版本号**
//   · 报错 / 警告都必须指路(message 带动作, warning 带 supportedFixes) —— 同 audit 的 token 节流纪律
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { type Scene, audit } from '../src/knives/audit';
import { exportScene } from '../src/export';
import {
  type BoundsSource,
  type SceneDoc,
  SceneStaleError,
  applyBounds,
  assertFreshForExport,
  createScene,
  decisionDigest,
  decisionSourceText,
  markHtmlChanged,
  sceneStatus,
} from '../src/scene';

// --- 测试辅助 ----------------------------------------------------------

/** 干净基线: 两节点(a 左上 / b 右下, 水平方向不重叠) + 一条正交边, showcase 档也全过 */
const geometry: Scene = {
  width: 420,
  height: 260,
  nodes: [
    { id: 'a', rect: { x: 40, y: 30, w: 110, h: 44 } },
    { id: 'b', rect: { x: 250, y: 170, w: 110, h: 44 } },
  ],
  edges: [
    { id: 'e', from: 'a', to: 'b', points: [{ x: 95, y: 74 }, { x: 95, y: 120 }, { x: 305, y: 120 }, { x: 305, y: 170 }] },
  ],
};

/** 取基线里某个节点的 rect 拷贝 —— 用它当 patch, 保证"重测后 scene 仍 audit 干净" */
const rectOf = (id: string) => {
  const n = geometry.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`测试基线里没有节点 ${id}`);
  return { ...n.rect };
};

/** 按 id 取节点(断言里反复要, 抽出来避免下标漂移) */
const nodeOf = (doc: SceneDoc, id: string) => {
  const n = doc.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`scene 里没有节点 ${id}`);
  return n;
};

/** 两级门槛都放行的缓存: 声明 layout → HTML 落盘 → 写回一次 */
const measuredScene = (id = 'a'): SceneDoc =>
  applyBounds(markHtmlChanged(createScene(geometry, { bounds_source: 'layout' })), [
    { id, rect: rectOf(id) },
  ]).scene;

// 决策源样本(HTML 片段): 换行 / 注释 / 一个 id 都能被指纹分辨
const htmlA = '<svg>\n  <rect data-id="a" />\n  <rect data-id="b" />\n</svg>\n';
const htmlB = '<svg>\n  <rect data-id="a" />\n  <rect data-id="b" data-layer="1" />\n</svg>\n';

/** 同 `measuredScene`, 但**带源指纹**: 判决走指纹判据那一档 */
const measuredWithSource = (source = htmlA): SceneDoc =>
  applyBounds(markHtmlChanged(createScene(geometry, { bounds_source: 'layout' }), source), [
    { id: 'a', rect: rectOf('a') },
  ]).scene;

/** 抓 assertFreshForExport 的报错(断言 reason / 两侧指纹用); 没报错就当场失败 */
const staleError = (doc: SceneDoc): SceneStaleError => {
  try {
    assertFreshForExport(doc);
  } catch (e) {
    if (e instanceof SceneStaleError) return e;
    throw e;
  }
  throw new Error('预期陈旧的缓存, 但门禁放行了');
};

// --- 测试正文 ----------------------------------------------------------

describe('scene · 缓存有效期(版本号 / 来源标记 / 出口门禁)', () => {
  // 版本号时间线 -------------------------------------------------------

  it('递增语义: HTML 落盘推 html_rev, 几何写回推 scene_rev, 陈旧判据是"最近一次修订是 HTML 落盘"', () => {
    const fresh = createScene(geometry);
    expect([fresh.html_rev, fresh.scene_rev]).toEqual([0, 0]);
    // 还没落过盘、也还没量过 → 没有"比缓存更新"的修订, 不算陈旧
    expect(sceneStatus(fresh).stale).toBe(false);

    // ① HTML 落盘: 决策变了, 缓存当场陈旧
    const saved = markHtmlChanged(fresh);
    expect([saved.html_rev, saved.scene_rev]).toEqual([1, 0]);
    expect(saved.html_rev).toBe(1);
    expect(fresh.html_rev).toBe(0); // 原对象没被动过
    expect(sceneStatus(saved).stale).toBe(true);

    // ② 几何写回: 时间线推进到 2, 缓存重新新鲜
    const measured = applyBounds(saved, [{ id: 'a', rect: rectOf('a') }]);
    expect(measured.applied).toEqual(['a']);
    expect([measured.scene.html_rev, measured.scene.scene_rev]).toEqual([1, 2]);
    expect(sceneStatus(measured.scene).stale).toBe(false);

    // ③ 再改 HTML → 又陈旧
    const edited = markHtmlChanged(measured.scene);
    expect([edited.html_rev, edited.scene_rev]).toEqual([3, 2]);
    expect(sceneStatus(edited).stale).toBe(true);
  });

  it('时间线语义: 连续重测两次后再改 HTML 仍然陈旧(各自独立自增的实现会在这里假新鲜)', () => {
    // 起点 (html 1, scene 2); 独立自增时 scene 会走到 4, 随后改 HTML 只到 2 → 2 > 4 为假 → 放行陈旧缓存
    const s3 = applyBounds(measuredScene(), [{ id: 'a', rect: rectOf('a') }]).scene;
    const s4 = applyBounds(s3, [{ id: 'a', rect: rectOf('a') }]).scene;
    expect([s4.html_rev, s4.scene_rev]).toEqual([1, 4]);

    const edited = markHtmlChanged(s4);
    expect(edited.html_rev).toBeGreaterThan(edited.scene_rev);
    expect(sceneStatus(edited).stale).toBe(true);

    // 重复采纳一份已有缓存不许把版本号清零(否则"恢复缓存"会把陈旧伪装成新鲜)
    const readopted = createScene(edited);
    expect([readopted.html_rev, readopted.scene_rev]).toEqual([edited.html_rev, edited.scene_rev]);
    expect(sceneStatus(readopted).stale).toBe(true);
  });

  // manual 保护 -------------------------------------------------------

  it('manual 保护: 写回遇手改节点跳过并出 warning, force: true 才覆盖', () => {
    const base = createScene(geometry, { bounds_source: 'layout' });
    // 作者手改 a 的 bounds —— 走同一条写回通道, 声明 source: manual
    const handmade = applyBounds(base, [{ id: 'a', rect: { x: 1, y: 2, w: 3, h: 4 }, source: 'manual' }]);
    expect(handmade.applied).toEqual(['a']);
    expect(nodeOf(handmade.scene, 'a').bounds_source).toBe('manual');
    expect(nodeOf(handmade.scene, 'a').rect).toEqual({ x: 1, y: 2, w: 3, h: 4 });

    // blink 重测: a 跳过(手改值保住), b 照常覆盖
    const remeasured = applyBounds(handmade.scene, [
      { id: 'a', rect: { x: 99, y: 99, w: 99, h: 99 } },
      { id: 'b', rect: rectOf('b') },
    ]);
    expect(remeasured.applied).toEqual(['b']);
    expect(remeasured.warnings.map((w) => w.code)).toEqual(['manual_bounds_protected']);

    const w = remeasured.warnings[0];
    expect(w.severity).toBe('warning');
    expect(w.subject).toEqual({ kind: 'node', id: 'a' });
    expect(w.evidence.bounds_source).toBe('manual');
    expect(w.evidence.rect).toEqual([1, 2, 3, 4]);
    expect(w.supportedFixes.length).toBeGreaterThan(0); // 连 warning 都要带修法(同 audit 纪律)
    expect(nodeOf(remeasured.scene, 'a').rect).toEqual({ x: 1, y: 2, w: 3, h: 4 }); // 手改值原样

    // 保护只看"目标节点是 manual", 不看本次写回声明的来源: 手改值再手改同样要 force
    const again = applyBounds(handmade.scene, [{ id: 'a', rect: { x: 5, y: 5, w: 5, h: 5 }, source: 'manual' }]);
    expect(again.applied).toEqual([]);
    expect(again.warnings.map((x) => x.code)).toEqual(['manual_bounds_protected']);

    // force 才覆盖; 覆盖后来源跟着写回走(manual 标记消失 —— 手改值已被实测值取代)
    const forced = applyBounds(handmade.scene, [{ id: 'a', rect: { x: 99, y: 99, w: 99, h: 99 } }], { force: true });
    expect(forced.applied).toEqual(['a']);
    expect(forced.warnings).toEqual([]);
    expect(nodeOf(forced.scene, 'a').rect).toEqual({ x: 99, y: 99, w: 99, h: 99 });
    expect(nodeOf(forced.scene, 'a').bounds_source).toBe('layout');
  });

  // estimate 反向规则 -------------------------------------------------

  it('estimate 反着来: 全量重测时不被跳过(一条 warning 都不出), 半量重测把漏测节点暴露在 status 里', () => {
    const estimated = createScene(geometry); // 缺省来源 = estimate
    expect(sceneStatus(estimated).bounds_sources).toEqual({ layout: 0, manual: 0, estimate: 2 });
    expect(sceneStatus(estimated).estimated_nodes).toEqual(['a', 'b']);

    // blink 回归: 两条 patch 全写进去, 没有任何"跳过"的保护
    const full = applyBounds(estimated, [
      { id: 'a', rect: rectOf('a'), source: 'layout' },
      { id: 'b', rect: rectOf('b'), source: 'layout' },
    ]);
    expect(full.applied).toEqual(['a', 'b']);
    expect(full.warnings).toEqual([]);
    expect(full.scene.nodes.map((n) => n.bounds_source)).toEqual(['layout', 'layout']);
    expect(sceneStatus(full.scene).estimated_nodes).toEqual([]);

    // 缺口回归(260917 评审抳到): 忘传 source 时沿用节点原来源, **不许**把估算值升格成实测值
    const forgot = applyBounds(estimated, [{ id: 'a', rect: rectOf('a') }]);
    expect(forgot.scene.nodes.map((n) => n.bounds_source)).toEqual(['estimate', 'estimate']);
    expect(sceneStatus(forgot.scene).estimated_nodes).toEqual(['a', 'b']);

    // 半量重测: 没被测到的 estimate 节点留在原地 —— 这就是"还没测完"的信号,
    // 由 sceneStatus.estimated_nodes 暴露(不静默, 也不用 warning 刷屏)
    const partial = applyBounds(estimated, [{ id: 'a', rect: rectOf('a'), source: 'layout' }]);
    expect(partial.scene.nodes.map((n) => n.bounds_source)).toEqual(['layout', 'estimate']);
    expect(sceneStatus(partial.scene).estimated_nodes).toEqual(['b']);
    expect(sceneStatus(partial.scene).bounds_sources.estimate).toBe(1);
  });

  // 出口门禁 -----------------------------------------------------------

  it('陈旧缓存: html_rev > scene_rev 时 assertFreshForExport 拦下(带双版本号与指路), 重测后放行', () => {
    const measured = measuredScene();
    expect(() => assertFreshForExport(measured)).not.toThrow();

    // 改了 HTML 忘了重测 —— 正是事故 (b)
    const edited = markHtmlChanged(measured);
    let caught: unknown;
    try {
      assertFreshForExport(edited);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(SceneStaleError);
    const stale = caught as SceneStaleError;
    expect([stale.html_rev, stale.scene_rev]).toEqual([edited.html_rev, edited.scene_rev]);
    expect(stale.message).toContain('陈旧');
    expect(stale.message).toContain('重测'); // 报错要指路: 说清"下一步做什么", 不是只喊停

    // 门禁是可修的, 不是死局: 重测一次就放行
    const remeasured = applyBounds(edited, [{ id: 'a', rect: rectOf('a') }]).scene;
    expect(sceneStatus(remeasured).stale).toBe(false);
    expect(() => assertFreshForExport(remeasured)).not.toThrow();
  });

  // 源指纹(判决口径升级) ----------------------------------------------

  it('源指纹 · 假新鲜反例: 改了又改回 → 指纹相同 → 不报警(计数判据在这里只会误报)', () => {
    const measured = measuredWithSource();
    expect(sceneStatus(measured).freshness_basis).toBe('source-hash');
    expect(sceneStatus(measured).stale).toBe(false);
    expect(measured.html_hash).toBe(decisionDigest(htmlA));
    expect(measured.scene_hash).toBe(decisionDigest(htmlA));

    // 改了一版真的决策 → 指纹变 → 陈旧
    const edited = markHtmlChanged(measured, htmlB);
    expect(sceneStatus(edited).stale).toBe(true);

    // 又改回原样(中间没重测): 指纹回到写回时那一版 —— **缓存量的就是这一版源**, 不陈旧
    const reverted = markHtmlChanged(edited, htmlA);
    expect(reverted.html_hash).toBe(measured.scene_hash);
    expect(sceneStatus(reverted).freshness_basis).toBe('source-hash');
    expect(sceneStatus(reverted).stale).toBe(false);
    expect(() => assertFreshForExport(reverted)).not.toThrow();
    expect(() => exportScene(reverted)).not.toThrow(); // 真出口也放行(门禁焊在 export 上)

    // 对照组: 计数确实说"HTML 在写回之后落过盘" —— 老判据在这里会白拦一次
    expect(reverted.html_rev).toBeGreaterThan(reverted.scene_rev);
  });

  it('源指纹 · 真变 → 报警: 报错区分"源变了"与降级兜底, 并带两侧指纹; 重测后指纹对齐', () => {
    const measured = measuredWithSource();
    const edited = markHtmlChanged(measured, htmlB);

    const err = staleError(edited);
    expect(err.reason).toBe('source-changed'); // 第一副面孔: 指纹对不上 = 源确实变了(结论确定)
    expect(err.html_hash).toBe(decisionDigest(htmlB));
    expect(err.scene_hash).toBe(decisionDigest(htmlA));
    expect(err.message).toContain('源指纹');
    expect(err.message).toContain('重测'); // 报错要指路, 不是只喊停
    expect(err.message).toContain(decisionDigest(htmlB).slice(0, 12)); // 指纹只报前 12 位(够对账, 不刷屏)

    // 出口真被拦下(门禁在 export 里, 不是摆设), 而且拒的是"出厂"不是"看不见错在哪"
    expect(() => exportScene(edited)).toThrow(SceneStaleError);

    // 重测写回: `scene_hash` 对齐当前源 → 判据翻回新鲜
    const remeasured = applyBounds(edited, [{ id: 'a', rect: rectOf('a') }]).scene;
    expect(remeasured.scene_hash).toBe(decisionDigest(htmlB));
    expect(remeasured.html_hash).toBe(decisionDigest(htmlB));
    expect(sceneStatus(remeasured).stale).toBe(false);
    expect(() => exportScene(remeasured)).not.toThrow();
  });

  it('源指纹 · 缺 hash 兼容: 旧文档降级为计数比较 + warning, 且降级绝不伪装成"源没变"', () => {
    // 旧式调用: markHtmlChanged 不带源 —— 指纹缺席, 判决退回计数(既有数据照常可用)
    const legacy = applyBounds(markHtmlChanged(createScene(geometry, { bounds_source: 'layout' })), [
      { id: 'a', rect: rectOf('a') },
    ]).scene;
    expect(legacy.html_hash).toBeUndefined();
    expect(legacy.scene_hash).toBeUndefined();

    const st = sceneStatus(legacy);
    expect(st.freshness_basis).toBe('counter');
    expect(st.stale).toBe(false);
    expect(st.warnings.map((w) => w.code)).toEqual(['scene_hash_missing']); // 降级要出声
    expect(st.warnings[0].severity).toBe('warning');
    expect(st.warnings[0].supportedFixes.length).toBeGreaterThan(0);

    // 0/0 一刀未动: 没什么可判的 → 不刷屏
    expect(sceneStatus(createScene(geometry)).warnings).toEqual([]);

    // 降级档的报错是**第二副面孔**: 计数只说得出"落过盘", 说不出源有没有真变
    const staleLegacy = markHtmlChanged(legacy);
    expect(sceneStatus(staleLegacy).stale).toBe(true);
    const err = staleError(staleLegacy);
    expect(err.reason).toBe('counter-degraded');
    expect(err.message).toContain('旧格式');
    expect(err.message).toContain('重测');

    // 升级路径: 带上源 + 重测一次 → 判据自动变指纹, warning 消失
    const upgraded = applyBounds(markHtmlChanged(staleLegacy, htmlA), [{ id: 'a', rect: rectOf('a') }]).scene;
    expect(sceneStatus(upgraded).freshness_basis).toBe('source-hash');
    expect(sceneStatus(upgraded).warnings).toEqual([]);
    expect(() => assertFreshForExport(upgraded)).not.toThrow();

    // 兼容的另一半: 缺指纹时**不许**拿旧指纹冒充"源没变" —— 不带源就得降级
    const dropped = markHtmlChanged(measuredWithSource());
    expect(dropped.html_hash).toBeUndefined();
    expect(sceneStatus(dropped).freshness_basis).toBe('counter');
    expect(sceneStatus(dropped).stale).toBe(true); // 保守: 宁可拦一次, 不放过真改动
  });

  it('源指纹 · 排版无关: CRLF / 行尾空白 / HTML 注释 / 首尾空行都不改指纹(字节确定)', () => {
    const messy = '<!-- 生成时间 260918 -->\r\n\r\n<svg>\r\n  <rect data-id="a" />   \r\n  <rect data-id="b" />\r\n</svg>\r\n\r\n';
    expect(decisionSourceText(messy)).toBe(decisionSourceText(htmlA));
    expect(decisionDigest(messy)).toBe(decisionDigest(htmlA));

    // 字节确定性: 规范化文本的 sha256 与 shasum 对过账 —— 换机器 / 换运行时都不许漂
    expect(decisionDigest('abc')).toBe('edeaaff3f1774ad2888673770c6d64097e391bc362d7d6fb34982ddf0efd18cb'); // = sha256("abc\n")
    expect(decisionDigest('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'); // 空源 = 空串
    expect(decisionDigest(htmlA)).toHaveLength(64);
    expect(decisionDigest(htmlA)).toMatch(/^[0-9a-f]{64}$/);

    // 但决策改了必须变 —— 一个属性都藏不住
    expect(decisionDigest(htmlB)).not.toBe(decisionDigest(htmlA));
    expect(decisionDigest(htmlA.replace('</svg>', '  <rect data-id="c" />\n</svg>'))).not.toBe(decisionDigest(htmlA));
  });

  it('源指纹 · 语义无关字段不碰哈希: 键顺序 / 注释字段无关, 语义字段与数组序一改就变', () => {
    const spec = { nodes: [{ id: 'a', layer: 0 }, { id: 'b', layer: 1 }], edges: [{ from: 'a', to: 'b' }] };
    // 键顺序(含嵌套)与注释类字段(_ 前缀 / comment / note)不参与
    const shuffled = { edges: [{ to: 'b', from: 'a' }], nodes: [{ layer: 0, id: 'a' }, { layer: 1, id: 'b' }] };
    expect(decisionDigest(shuffled)).toBe(decisionDigest(spec));
    expect(decisionDigest({ ...spec, _note: '改了一句注释', comment: 'x' })).toBe(decisionDigest(spec));
    expect(decisionDigest({ ...spec, nodes: [{ id: 'a', layer: 0, comment: 'y' }, { id: 'b', layer: 1 }] })).toBe(
      decisionDigest(spec),
    );

    // 语义字段: 层级 / 成员 / id 一改必须进哈希
    expect(decisionDigest({ ...spec, nodes: [{ id: 'a', layer: 1 }, { id: 'b', layer: 1 }] })).not.toBe(decisionDigest(spec));
    expect(decisionDigest({ ...spec, edges: [{ from: 'a', to: 'c' }] })).not.toBe(decisionDigest(spec));
    // 数组序是决策(柱子的先后), 不许被"集合化"抹平
    expect(decisionDigest({ nodes: [{ id: 'b' }, { id: 'a' }] })).not.toBe(decisionDigest({ nodes: [{ id: 'a' }, { id: 'b' }] }));
    // 数值按 round1 归一(与全库坐标精度同规矩): 亚精度抖动不算改, 精度内一改就算改
    expect(decisionDigest({ x: 1.04 })).toBe(decisionDigest({ x: 1 }));
    expect(decisionDigest({ x: 1.06 })).not.toBe(decisionDigest({ x: 1 }));
  });

  it('源指纹 · 过盘往返不丢: JSON 恢复的缓存仍然守着指纹(磁盘恢复是常态)', () => {
    const measured = measuredWithSource();
    const restored = createScene(JSON.parse(JSON.stringify(measured)) as SceneDoc);
    expect([restored.html_hash, restored.scene_hash]).toEqual([measured.html_hash, measured.scene_hash]);
    expect(sceneStatus(restored).freshness_basis).toBe('source-hash');
    expect(sceneStatus(restored).stale).toBe(false);

    // 恢复后照样抓得住改动, 也照样认得出"改回原样"
    expect(staleError(markHtmlChanged(restored, htmlB)).reason).toBe('source-changed');
    expect(sceneStatus(markHtmlChanged(markHtmlChanged(restored, htmlB), htmlA)).stale).toBe(false);
  });

  // 未知 id -----------------------------------------------------------

  it('未知节点 id: 写回被丢弃并出 node_not_found warning(分叉不许静默)', () => {
    const out = applyBounds(createScene(geometry), [{ id: 'ghost', rect: { x: 1, y: 1, w: 1, h: 1 } }]);
    expect(out.applied).toEqual([]);
    expect(out.warnings.map((w) => w.code)).toEqual(['node_not_found']);
    expect(out.warnings[0].severity).toBe('warning');
    expect(out.warnings[0].evidence.nodeId).toBe('ghost');
    expect(out.warnings[0].supportedFixes.length).toBeGreaterThan(0);
    expect(out.scene.nodes.map((n) => n.id)).toEqual(['a', 'b']); // scene 结构没被撑变形
  });

  // 纯函数性 -----------------------------------------------------------

  it('纯函数: 入参 scene 与其节点对象一律不被 mutate, 改动都落在新对象上', () => {
    const before = JSON.stringify(geometry);
    const doc = createScene(geometry);

    // createScene 不给入参节点塞新字段(原对象是调用方的)
    expect(JSON.stringify(geometry)).toBe(before);
    expect((geometry.nodes[0] as { bounds_source?: BoundsSource }).bounds_source).toBeUndefined();
    expect(doc.nodes[0]).not.toBe(geometry.nodes[0]);

    // 四个入口全跑一遍, 入参 doc 的 JSON 与节点数组引用都不许变
    const snapshot = JSON.stringify(doc);
    const nodesRef = doc.nodes;
    markHtmlChanged(doc);
    applyBounds(doc, [{ id: 'a', rect: rectOf('a') }]);
    applyBounds(doc, [{ id: 'a', rect: rectOf('a'), source: 'manual' }]);
    applyBounds(doc, [{ id: 'ghost', rect: { x: 0, y: 0, w: 1, h: 1 } }]);
    sceneStatus(doc);
    assertFreshForExport(doc);
    expect(JSON.stringify(doc)).toBe(snapshot);
    expect(doc.nodes).toBe(nodesRef);
    expect([doc.html_rev, doc.scene_rev]).toEqual([0, 0]);

    // 写回后的文档是新实例(节点数组也是新的), 与入参不共享可变状态
    const out = applyBounds(doc, [{ id: 'a', rect: rectOf('a') }]);
    expect(out.scene).not.toBe(doc);
    expect(out.scene.nodes).not.toBe(doc.nodes);
    expect(JSON.stringify(out.scene)).not.toBe(snapshot);

    // 一条都没写进去(只有被跳过的 manual patch) → 原样返回同一实例, 且不推版本号
    const handmade = applyBounds(doc, [{ id: 'a', rect: { x: 7, y: 7, w: 7, h: 7 }, source: 'manual' }]).scene;
    const revBefore = sceneStatus(handmade).scene_rev;
    const nothing = applyBounds(handmade, [{ id: 'a', rect: rectOf('a') }]);
    expect(nothing.applied).toEqual([]);
    expect(nothing.scene).toBe(handmade);
    expect(sceneStatus(nothing.scene).scene_rev).toBe(revBefore);
  });

  // 与 audit / export 的结构兼容 ---------------------------------------

  it('结构兼容: SceneDoc 可直接当 Scene 用 —— audit 全过, exportScene 出图', () => {
    const doc = measuredScene();
    const report = audit(doc, { level: 'showcase' });
    expect(report.diagnostics).toEqual([]);
    expect(report.pass).toBe(true);

    const out = exportScene(doc);
    expect(out.report.pass).toBe(true);
    expect(out.draft).toBe(false);
    expect(out.svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(out.svg.match(/data-shape="node"/g)).toHaveLength(2); // 两个节点的 bounds 都进了产物
    expect(out.svg).toContain('M 40.00 40.00'); // a 的左上圆角起点 x, y+radius —— bounds 确实是量出来的那些
    expect(out.svg).toContain('M 95.00 74.00'); // 边也照常(SceneDoc 没把边表写坏)
  });
});
