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
import { packRow } from '../../src/geometry/pack';
import { runScene } from '../../scripts/runner';

const LEVEL = 'showcase';

// 三格内容: 一行主标签 + 一行次标签, 盒按形状反算(fit.shape 一给, 外壳就跟着放大)
const sceneFit = nodeFit({ label: 'scene', sub: '几何缓存', level: LEVEL });
const diaFit = nodeFit({ label: '装得下?', sub: 'label_fit', level: LEVEL, shape: 'diamond' });
const dbFit = nodeFit({ label: 'Postgres', sub: 'primary', level: LEVEL, shape: 'cylinder' });

// 一行三格, **中心线对齐** —— `(w1-w2)/2` 与 `x+w+40` 这类算术全归 `packRow`(`y` 是那条中心线);
// 高心重合 ⇒ 菱形 / 圆柱与矩形同轴 ⇒ 左右直连边端口同 y、不折弯
//
// 版式: 三格横排是这个形状族的**物理下限** —— 三盒宽 74 / 161 / 86 与最高盒 107 定死了画幅 ≈ 3.1 : 1,
// `fit` 收紧后 435×141(旧版式竖排 195×382 在 3:2 画框里只剩一撮, 横排把宽度用满)。
// 剩下的 3.1 vs 3:2 那点差是**内容形状**说了算: 往画布垫空白凑比例不会把字放大(contain 缩放本来
// 就按宽对齐), 只会把"这张图是什么形状"说错, 所以不垫。
// **对齐线**抬到最高那格的一半 ⇒ 三格都落在 y ≥ 0: 读数板 `scripts/inspect.ts` 不走 `fit` 而声明画布
// 非零, 负坐标会被它报成 `single_svg` 越界(出口 `fit` 反正按内容并集重定画布, 这里只求归零)
const midY = Math.max(sceneFit.h, diaFit.h, dbFit.h) / 2;
const row = packRow({ items: [sceneFit, diaFit, dbFit], gap: 40, x0: 0, y: midY, align: 'center' });
const [box, dia, db] = row.rects;

const e1 = routeOrthogonal({ from: box, fromPort: { side: 'right' }, to: dia, toPort: { side: 'left' } });
const e2 = routeOrthogonal({ from: dia, fromPort: { side: 'right' }, to: db, toPort: { side: 'left' } });

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
