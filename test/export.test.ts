// =====================================================================
// export · 出口的两道缓存门禁(硬拦陈旧 / 降档 estimate)
//
// 设计稿 §4.2 要求"export 前检查 html_rev > scene_rev", §4.3 要求这类纪律焊进代码。
// **出口只有一个**, 所以门禁必须装在 exportScene 里 —— 焊在别处等于没焊:
// 调用方绕得过任何一个函数, 但绕不过唯一出口。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { exportScene } from '../src/export';
import { SceneStaleError, createScene, markHtmlChanged, sceneStatus } from '../src/scene';

const rectA = { x: 40, y: 40, w: 100, h: 60 };
const rectB = { x: 260, y: 40, w: 100, h: 60 };

/** 两节点 + 一条正交边; 间距充裕, audit 在 standard 档过得去 */
const geometry = {
  width: 420,
  height: 220,
  nodes: [
    { id: 'a', rect: { ...rectA }, label: 'A' },
    { id: 'b', rect: { ...rectB }, label: 'B' },
  ],
  edges: [{ id: 'e', points: [{ x: 140, y: 70 }, { x: 260, y: 70 }] }],
};

/** 全实测 + 新鲜(0/0 不是陈旧) */
const measured = () => createScene(geometry, { bounds_source: 'layout' });

describe('export · 出口门禁(缓存有效期 + estimate 降档)', () => {
  it('全实测 + 新鲜: 正常出图, 不带草稿标, estimated_nodes 为空', () => {
    const out = exportScene(measured());
    expect(out.report.pass).toBe(true);
    expect(out.draft).toBe(false);
    expect(out.estimated_nodes).toEqual([]);
    expect(out.svg).not.toContain('data-draft');
  });

  it('陈旧缓存: 不许静默出厂 —— exportScene 直接抛 SceneStaleError 并带上双版本号', () => {
    const stale = markHtmlChanged(measured());
    expect(sceneStatus(stale).stale).toBe(true);

    let caught: unknown;
    try {
      exportScene(stale, { skipAudit: true }); // 连 skipAudit 也绕不开: 缓存有效期不是 audit 的一部分
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(SceneStaleError);
    const err = caught as SceneStaleError;
    expect([err.html_rev, err.scene_rev]).toEqual([stale.html_rev, stale.scene_rev]);
  });

  it('陈旧 + force: 放行但一律打草稿标(force 的语义是"先给我看一眼")', () => {
    const stale = markHtmlChanged(measured());
    const out = exportScene(stale, { force: true });
    expect(out.draft).toBe(true);
    expect(out.svg).toContain('data-draft="1"');
  });

  it('estimate 节点: audit 全过也照样降档为草稿(第二档门槛不拦死, 但交付图不许含估算值)', () => {
    const est = createScene(geometry); // 缺省来源 = estimate
    const out = exportScene(est);
    expect(out.report.pass).toBe(true); // 几何本身没问题
    expect(out.draft).toBe(true); // 但坐标是估的
    expect(out.estimated_nodes).toEqual(['a', 'b']);
    expect(out.svg).toContain('data-draft="1"');
  });

  it('纯几何 Scene(无版本号): 照旧出图 —— 没有版本号就没有"陈旧"可言, 门禁只认 SceneDoc', () => {
    const out = exportScene(geometry);
    expect(out.draft).toBe(false);
    expect(out.estimated_nodes).toEqual([]);
    expect(out.svg).not.toContain('data-draft');
  });
});
