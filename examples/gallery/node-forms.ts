// =====================================================================
// node-forms · 形状三态出图(菱形 = 判定 / 圆柱 = 数据存储)
//   bun run examples/gallery/node-forms.ts > /tmp/node-forms.svg
//
// 这张图是**能力举证**: 三种形状同框、都带 label + sub, 且 `exportScene` 按 showcase 档
// **全部门禁零诊断**才出得来(fail-closed —— 出图成功本身就是凭证)。
//
// 形状怎么进图: 形状是 scene 上的**语义槽** `SceneNode.shape`(与 `tone` / `variant` 同族) ——
// 出口的 `renderNode` 从 scene 读, 覆盖表只在该显式写了值时才顶掉它(`export.ts` 的语义槽三件)。
//
// 盒宽盒高一律由 `nodeFit({ shape })` 反算 —— 形状收窄的是**文字可用区**: 菱形两轴各收一半
// (可用区只剩盒面积的 1/4), 圆柱只收高度(宽度不动, 盖子从上下各吃掉一截)。手定盒宽会装不下字,
// 而门禁 `label_fit` 只量 rect、看不见形状。
// =====================================================================

import { type Scene } from '../../src/knives/audit';
import { nodeFit } from '../../src/knives/fit';
import { routeOrthogonal } from '../../src/knives/route';
import { packCol } from '../../src/geometry/pack';
import { runScene } from '../../scripts/runner';

const LEVEL = 'showcase';

// 三格内容: 一行主标签 + 一行次标签, 盒按形状反算(fit.shape 一给, 外壳就跟着放大)
const sceneFit = nodeFit({ label: 'scene', sub: '几何缓存', level: LEVEL });
const diaFit = nodeFit({ label: '装得下?', sub: 'label_fit', level: LEVEL, shape: 'diamond' });
const dbFit = nodeFit({ label: 'Postgres', sub: 'primary', level: LEVEL, shape: 'cylinder' });

// 一列三格, **中心线对齐** —— `(w1-w2)/2` 与 `y+h+40` 这类算术全归 `packCol`(`x` 是中心线,
// 由首格左缘 240 推出来); 三格同心 ⇒ 菱形 / 圆柱与矩形同轴 ⇒ 直连边端口对称、不折弯
const col = packCol({ items: [sceneFit, diaFit, dbFit], gap: 40, x: 240 + sceneFit.w / 2, y0: 30, align: 'center' });
const [box, dia, db] = col.rects;

const e1 = routeOrthogonal({ from: box, fromPort: { side: 'bottom' }, to: dia, toPort: { side: 'top' } });
const e2 = routeOrthogonal({ from: dia, fromPort: { side: 'bottom' }, to: db, toPort: { side: 'top' } });

export const scene: Scene = {
  width: 640,
  height: 420,
  nodes: [
    { id: 'scene', rect: box, label: 'scene', sub: '几何缓存' },
    { id: 'dia', rect: dia, label: '装得下?', sub: 'label_fit', shape: 'diamond' },
    { id: 'db', rect: db, label: 'Postgres', sub: 'primary', tone: 'emerald', shape: 'cylinder' },
  ],
  edges: [
    { id: 'e1', from: 'scene', to: 'dia', points: e1.points },
    { id: 'e2', from: 'dia', to: 'db', points: e2.points },
  ],
};

// 出口走 `scripts/runner.ts`(260920): 摘要 / 诊断 / 草稿 / exit code 都在那一处(见该文件头注)
if (import.meta.main) {
  runScene(scene, {
    level: LEVEL,
    fit: true,
    title: 'svg-infovis 形状三态',
    extra: [`盒(${LEVEL} 档, nodeFit 反算): scene ${box.w}x${box.h} · diamond ${dia.w}x${dia.h} · cylinder ${db.w}x${db.h}`],
  });
}
