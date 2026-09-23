// =====================================================================
// finite-fields · 门禁 ① 的**检查面**回归(260919)
//
// 病根一句话: 门禁只看了一部分数 —— 只查坐标、不查那些决定文字盒的可选字段(`height` /
// `fontSize` / `radius` / `labelInset`)。于是同一个坏数按位置分裂成三种下场, 一种比一种难查:
//   · `SceneLabel.height` 是 NaN → `single_svg` 拿 NaN 比较(恒假)误报"越出画布",
//     `label_clearance` 退化成"净空判不了"的 null 档 —— **病根被两处歪打正着地遮住**;
//   · `SceneGroup.fontSize` 是 NaN → `groupLabelRect` 的 `assertFiniteNumber` 抛 ShapeInputError,
//     `audit()` 从"返回诊断"变成"报错"(门禁变报错 = fail-closed 破产, 文件头列为最致命);
//   · `SceneNode.fontSize` 是 NaN → `label_fit` 拿 NaN 算出"超过可用宽 NaNpx"的垃圾诊断。
// 本文件的用例就是这三副面孔 + 一条"不许误伤"(健康 scene 一个 finite_svg 都不该有)。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { type AuditReport, type Scene, type SceneGroup, audit, groupLabelBox } from '../src/knives/audit';

/** 空画布 + 只放被测元素: 一个样本只埋一类坏数, 其余全合法 */
const sceneWith = (over: Partial<Scene>): Scene => ({ width: 400, height: 300, nodes: [], edges: [], ...over });

const codesOf = (r: AuditReport): string[] => r.diagnostics.map((d) => d.code).sort();
const offendersOf = (r: AuditReport): string[] => r.diagnostics[0].evidence.offenders as unknown as string[];

/** 组框样本: 声明了归属位 + 给一个字号, 于是 `groupLabelBox` 会真去 `groupLabelRect` 走一趟 */
const groupScene = (g: Partial<SceneGroup>): Scene =>
  sceneWith({ groups: [{ id: 'g', rect: { x: 40, y: 40, w: 240, h: 160 }, label: '分组', labelPlacement: 'outer', ...g }] });

describe('finite_svg · 检查面: 决定文字盒的数值字段一个都不许溜', () => {
  it('② SceneLabel.height 是 NaN → 由源头门禁点名(过去它能溜过坐标门禁)', () => {
    const r = audit(sceneWith({ labels: [{ id: 'L-nan-height', at: { x: 200, y: 150 }, width: 40, height: NaN }] }));
    // 只留源头那一条: 过去这里会同时冒 single_svg("越出画布"的假报警)与 label_clearance("净空判不了")
    expect(codesOf(r)).toEqual(['finite_svg']);
    expect(offendersOf(r)).toEqual(['label:L-nan-height']);
    expect(r.pass).toBe(false);
    // 短路契约照旧: 未测项一律 -1, 不用 0 冒充"测过了, 结果是零"
    expect(r.metrics.min_label_clearance).toBe(-1);
  });

  it('② 反证: 同一个标签把 height 补成有限数 → finite_svg 立刻消失(判据是值, 不是标签存在)', () => {
    const good = audit(sceneWith({ labels: [{ id: 'L', at: { x: 200, y: 150 }, width: 40, height: 18 }] }));
    expect(codesOf(good)).not.toContain('finite_svg');
  });

  it('② 同族字段一次点清: 四类元素的 fontSize / radius / labelInset 全在检查面里', () => {
    const r = audit(sceneWith({
      nodes: [{ id: 'n', rect: { x: 20, y: 20, w: 80, h: 40 }, radius: NaN }],
      groups: [{ id: 'g', rect: { x: 20, y: 80, w: 200, h: 120 }, fontSize: NaN, labelInset: [NaN, 18] }],
      labels: [{ id: 'L', at: { x: 200, y: 260 }, width: 40, height: 18, fontSize: NaN }],
      texts: [{ id: 't', rect: { x: 240, y: 100, w: 120, h: 20 }, fontSize: NaN }],
    }));
    expect(codesOf(r)).toEqual(['finite_svg']);
    // 组框自己一行(rect / fontSize), 它的标签位另起一行(labelInset) —— 两者分开点名, 便于定位
    expect(offendersOf(r)).toEqual(['node:n', 'group:g', 'label:L', 'text:t', 'group-label:g']);
  });

  it('② 可选字段没写不算错: 全裸的元素(无 fontSize / radius / labelInset)一个 finite_svg 都不该有', () => {
    const r = audit(sceneWith({
      nodes: [{ id: 'n', rect: { x: 20, y: 20, w: 80, h: 40 } }],
      groups: [{ id: 'g', rect: { x: 20, y: 80, w: 200, h: 120 }, label: '分组' }],
      labels: [{ id: 'L', at: { x: 200, y: 260 }, width: 40, height: 18 }],
      texts: [{ id: 't', rect: { x: 240, y: 100, w: 120, h: 20 } }],
    }));
    expect(codesOf(r)).not.toContain('finite_svg');
  });

  it('③ 组的 fontSize 是 NaN → audit **返回诊断而不是抛异常**(门禁变报错 = fail-closed 破产)', () => {
    // 探针实测的原始复现: labelPlacement 声明 + fontSize NaN → groupLabelBox 会走 groupLabelRect,
    // 那条路过去直通 assertFiniteNumber, 于是整份审计炸在 ShapeInputError 上
    let report: AuditReport | null = null;
    expect(() => { report = audit(groupScene({ fontSize: NaN })); }).not.toThrow();
    expect(codesOf(report!)).toEqual(['finite_svg']);
    expect(offendersOf(report!)).toEqual(['group:g']);
    expect(report!.pass).toBe(false);
  });

  it('③ 对照组: 同一个组的 fontSize 是 12 → 照常跑完几何门禁(短路只属于坏值)', () => {
    const r = audit(groupScene({ fontSize: 12 }));
    expect(codesOf(r)).not.toContain('finite_svg');
  });

  it('③ 直接调用 groupLabelBox 也不抛: 坏 fontSize / 坏 labelInset 一律回落作者手写的 labelRect', () => {
    const written = { x: 1, y: 2, w: 3, h: 4 };
    const nanFont = groupScene({ fontSize: NaN, labelRect: written }).groups![0];
    expect(() => groupLabelBox(nanFont)).not.toThrow();
    expect(groupLabelBox(nanFont)).toEqual(written);
    const nanInset = groupScene({ fontSize: 12, labelInset: [NaN, 18], labelRect: written }).groups![0];
    expect(() => groupLabelBox(nanInset)).not.toThrow();
    expect(groupLabelBox(nanInset)).toEqual(written);
    // 反证: 参数正常时它照旧**派生**(不是一律回落 —— 否则等于把双源那一刀又拔了)
    const ok = groupScene({ fontSize: 12 }).groups![0];
    expect(groupLabelBox(ok)).not.toEqual(undefined);
    expect(groupLabelBox(ok)!.y).toBeLessThan(ok.rect.y); // outer: 标签在框上方外侧
  });

  it('③ labelInset 非有限 → finite_svg 点名 group-label(过去是静默回落, 差集不可见)', () => {
    const r = audit(groupScene({ fontSize: 12, labelInset: [14, NaN] }));
    expect(codesOf(r)).toEqual(['finite_svg']);
    expect(offendersOf(r)).toEqual(['group-label:g']);
  });

  it('③ labelInset 元数不对(只给一个数)也算坏值: 下游解构出 undefined 会当场抛', () => {
    const r = audit(groupScene({ fontSize: 12, labelInset: [14] as unknown as [number, number] }));
    expect(offendersOf(r)).toEqual(['group-label:g']);
  });
});
