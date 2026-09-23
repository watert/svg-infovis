// =====================================================================
// auto-fit · 按内容重定画布 + 居中描边的出血补偿
//
// 由两次实拍触发: ① `svg(w, h)` 的宽高由调用方给, core 不校验内容是否出界;
// ② rect / group 是**居中描边**(1.5 → 外扩 0.75), viewBox 算到 x+w 正好裁掉外侧那半条。
//
// 本条最重要的验收不是"算得对", 而是**审计吃的是 fit 之后的 scene** —— 否则
// audit 会先以"内容越界"把出口拦死, auto-fit 沦为马后炮(永远轮不到它救场)。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { contentBounds, exportScene, fitScene, translateScene } from '../src/export';

/** 内容故意越出画布(节点右边缘 660 > width 300), 旧行为必然被 single_svg 拦死 */
const overflowingScene = {
  width: 300,
  height: 120,
  nodes: [
    { id: 'a', rect: { x: -40, y: -30, w: 120, h: 60 }, label: 'A' },
    { id: 'b', rect: { x: 540, y: 80, w: 120, h: 60 }, label: 'B' },
  ],
  edges: [{ id: 'e', points: [{ x: 80, y: 0 }, { x: 540, y: 0 }, { x: 540, y: 80 }] }],
};

const sizeOf = (svg: string) => {
  const w = Number(svg.match(/\swidth="([\d.]+)"/)?.[1]);
  const h = Number(svg.match(/\sheight="([\d.]+)"/)?.[1]);
  return { w, h };
};

describe('auto-fit · 按内容重定画布与出血补偿', () => {
  it('contentBounds 覆盖全部带位置的东西(节点 / 组框 / 组标题 / 标签遮罩 / 旁注 / 折点)并按 bleed 外扩', () => {
    const scene = {
      width: 800,
      height: 400,
      nodes: [{ id: 'a', rect: { x: 100, y: 100, w: 100, h: 50 } }],
      edges: [{ id: 'e', points: [{ x: 200, y: 125 }, { x: 400, y: 125 }] }],
      groups: [{ id: 'g', rect: { x: 60, y: 60, w: 200, h: 200 }, label: 'G', labelRect: { x: 70, y: 30, w: 80, h: 18 } }],
      labels: [{ id: 'l', at: { x: 300, y: 125 }, width: 40, height: 16 }],
      texts: [{ id: 't', rect: { x: 500, y: 200, w: 90, h: 20 }, text: '旁注' }],
    };
    const b = contentBounds(scene, { bleed: 1 });
    // 上界由组标题(labelRect.y=30)决定, 下界由组框(60+200=260)决定
    expect(b).toEqual({ x: 59, y: 29, w: 532, h: 232 });
    // bleed 可调: 0 时正好贴内容
    expect(contentBounds(scene, { bleed: 0 })).toEqual({ x: 60, y: 30, w: 530, h: 230 });
    // 空 scene 不编一个 0×0 出来
    expect(contentBounds({ width: 10, height: 10, nodes: [], edges: [] })).toBeNull();
  });

  it('fitScene: 负坐标内容被平移回 padding 处, 画布按内容算, 入参不被改(纯函数)', () => {
    const before = JSON.stringify(overflowingScene);
    const f = fitScene(overflowingScene, { padding: 10, bleed: 1 });
    // 内容 bbox: x[-40,660] y[-30,140] → 加大 1px 出血 = [-41,661] / [-31,141]
    expect(f.width).toBe(661 - -41 + 20);
    expect(f.height).toBe(141 - -31 + 20);
    // 最外元素落在 padding + bleed 处(出血那 1px 是给描边的, 不该被吃掉)
    expect(Math.min(...f.nodes.map((n) => n.rect.x))).toBe(-40 + (10 - -41));
    expect(JSON.stringify(overflowingScene)).toBe(before);
    // 拓扑不变, 折点列长度不动
    expect(f.edges[0].points.length).toBe(overflowingScene.edges[0].points.length);
  });

  it('出血补偿: 贴边内容不再被裁掉外侧半条描边(元素位置永远 >= padding)', () => {
    // 内容恰好从 0 开始(最容易踩"画到 x+w 正好裁一半"的场景)
    const sc = { width: 100, height: 60, nodes: [{ id: 'a', rect: { x: 0, y: 0, w: 100, h: 60 } }], edges: [] };
    const f = fitScene(sc, { padding: 8, bleed: 1 });
    expect(f.nodes[0].rect).toEqual({ x: 9, y: 9, w: 100, h: 60 }); // 8 + 1 出血
    expect({ w: f.width, h: f.height }).toEqual({ w: 100 + 2 * 8 + 2, h: 60 + 2 * 8 + 2 });
  });

  it('关键验收: 内容越界时旧路径被拦死, 开 fit 后能出图(审计吃的是 fit 后的 scene)', () => {
    // 旧行为: 内容越出 width/height → single_svg 是 error → 出口硬拒
    let blocked = false;
    try {
      exportScene(overflowingScene);
    } catch (e) {
      blocked = (e as { report?: { diagnostics: { code: string }[] } }).report?.diagnostics.some((d) => d.code === 'single_svg') ?? false;
    }
    expect(blocked).toBe(true);

    // 新行为: fit 先重定画布, 再审 —— 同一份 scene 直接出图, 且不带草稿标
    const r = exportScene(overflowingScene, { fit: true });
    expect(r.report.pass).toBe(true);
    expect(r.draft).toBe(false);
    const want = contentBounds(overflowingScene, { bleed: 1 });
    expect(sizeOf(r.svg)).toEqual({ w: Math.round((want!.w + 32) * 10) / 10, h: Math.round((want!.h + 32) * 10) / 10 });
    expect(r.svg).toContain('viewBox="0 0 ');
  });

  it('fit 与旧 padding 不打架: 单给 padding 时行为逐字节不变(回归), 同时给时 fit 胜', () => {
    const plain = { width: 200, height: 100, nodes: [{ id: 'a', rect: { x: 20, y: 20, w: 100, h: 40 }, label: 'A' }], edges: [] };
    const padded = exportScene(plain, { padding: 12 });
    expect(sizeOf(padded.svg)).toEqual({ w: 224, h: 124 });
    expect(padded.svg).toContain('d="M 32.00 42.00'); // 只平移不重算(20+12 / 20+12); 圆角矩形的起点即左上角
    // 两者都给 → fit 胜(它的 padding 自己带), 不叠加成双份留白
    const fitted = exportScene(plain, { padding: 12, fit: { padding: 4 } });
    expect(sizeOf(fitted.svg)).toEqual({ w: 100 + 2 * 4 + 2, h: 40 + 2 * 4 + 2 });
  });

  it('translateScene 只搬家不动尺寸: 尺寸给就给, 不给沿用原值; 坐标走 round1(字节确定)', () => {
    const sc = { width: 100, height: 50, nodes: [{ id: 'a', rect: { x: 1.04, y: 2.06, w: 10, h: 10 } }], edges: [{ id: 'e', points: [{ x: 1.04, y: 2.06 }, { x: 20, y: 2.06 }] }] };
    const t = translateScene(sc, 0.5, -1, { width: 200, height: 80 });
    expect(t.nodes[0].rect).toEqual({ x: 1.5, y: 1.1, w: 10, h: 10 });
    expect(t.edges[0].points[0]).toEqual({ x: 1.5, y: 1.1 });
    expect({ w: t.width, h: t.height }).toEqual({ w: 200, h: 80 });
    // 0 位移 + 不改尺寸 = 原样返回(不制造无意义的新对象)
    expect(translateScene(sc, 0, 0)).toBe(sc);
  });
});
