// =====================================================================
// infograph/heading · 标题层级 + 分隔线的页眉组合(bun 直出 SVG)
//   bun run examples/infograph/heading.ts > /tmp/heading.svg
//
// 它证明什么: **infograph 的页眉是一个"能接着排"的块** ——
//   · 三档字号(kicker / 标题 / 副标题)只在 `HEADING_LAYOUT` 里写一次, 量宽与画字读的是同一份
//   · `headingGeometry().block` 交出整块的并集 ⇒ 分隔线与下一个元素的位置全部**从上一块的底边加缝
//     推出来**(`below`), 一个 y 都不手拍 —— 改文案 / 加一行 kicker, 整页跟着走
//   · 分隔线两种形态都在这里: 居中短标签(线在标签两侧断开)与居中加粗短段(给线一个重心)
//
// 这一档是**描述符层**示例(直接拼 `svg()` 出图, 不经 scene、不过门禁): 标题与分隔线是纯排版墨迹,
// 没有可审计的拓扑。要看走门禁的主路径读 `start/full-chain.ts`。
// =====================================================================

import { svg } from '../../src/descriptor';
import { toSVG } from '../../src/serialize';
import { round1 } from '../../src/geometry/vec';
import { below } from '../../src/geometry/place';
import { nodeFit } from '../../src/knives/fit';
import { dividerShape, headingGeometry, headingShape } from '../../src/shapes/heading';
import { nodeShape } from '../../src/shapes/node';
import { isMainModule } from '../../src/runtime';

// --- 作者决策: 只有这一段是手写的数 ------------------------------------------

const PAD = 40;       // 画布四边留白
const RULE_W = 640;   // 版心宽 = 分隔线的长度(它是这一页的**版式基准线**)
const SEAM = 28;      // 块与块之间的缝 —— 同一档: 版式节奏一致比"每处恰好"更耐改
const X = PAD;        // 版心左缘

// --- ① 页眉: kicker + 标题 + 副标题 -----------------------------------------

const HEAD = {
  x: X, y: PAD,
  kicker: 'SECTION 01 · 排版层',
  title: '把一张图读成信息',
  sub: '标题块自己算得出多高 —— 下面的元素不用猜 y',
};
// 量一次(块高 / 底边在哪), 画一次: 同一个输入 ⇒ 同一份几何, 不存在"量的一个盒、画另一个盒"
const headBox = headingGeometry(HEAD).block;
const head = headingShape(HEAD);

// --- ② 分隔线: 居中短标签(线在标签两侧断开) ---------------------------------
// 分隔线是 **0 高的盒** —— 拿一个 `h: 0` 的 rect 求 y, 是"从上一块接着排"的标准写法
const rule1 = { x: X, y: below(headBox, { w: 0, h: 0 }, SEAM).y, w: RULE_W, h: 0 };

// --- ③ 一个普通节点: 位置同样由上一块推出来 ----------------------------------

const NODE = { label: '块高 = 行盒并集', sub: '位置 = 上一块的底边 + 缝' };
const nf = nodeFit(NODE);
const node = below(rule1, nf, SEAM, { align: 'start' });   // 左对齐: 与版心左缘同一条线

// --- ④ 分隔线: 居中加粗短段 --------------------------------------------------

const rule2 = { x: X, y: below(node, { w: 0, h: 0 }, SEAM).y, w: RULE_W, h: 0 };

// --- ⑤ 居中的页脚标题: 同一个块, 换一条对齐线 --------------------------------

const FOOT = {
  x: X + RULE_W / 2, y: below(rule2, { w: 0, h: 0 }, SEAM).y,
  align: 'middle' as const,
  title: '居中对齐 = 同一个块换一条对齐线',
  sub: 'x 给的是中轴, 每一行各自居中',
};
const footBox = headingGeometry(FOOT).block;
const foot = headingShape(FOOT);

// --- 画布: 宽是作者决策(自然宽 ≤900), 高由最后一块的底边 + 留白定 --------------

const W = X + RULE_W + PAD;
const H = round1(footBox.y + footBox.h + PAD);

if (isMainModule(import.meta.url)) {
  // 自检走 stderr(图走 stdout): 行数 / 块高 / 逐条缝 —— 缝应恒为 `HEADING_LAYOUT.rowGap`
  const rows = headingGeometry(HEAD).rows;
  const seams = rows.slice(1).map((r, i) => round1(r.rect.y - (rows[i].rect.y + rows[i].rect.h)));
  console.error(`页眉: ${rows.length} 行, 块高 ${round1(headBox.h)}, 缝 [${seams.join(',')}] → 分隔线从 y=${rule1.y} 起`);
  console.error(`居中的页脚标题: ${footBox.w}×${footBox.h}(轴 x=${FOOT.x}) · 画布 ${W}×${H}`);

  process.stdout.write(toSVG(svg(W, H, [
    head,
    dividerShape({ x: rule1.x, y: rule1.y, w: rule1.w, label: '① 字号阶梯' }),
    nodeShape({ ...node, ...NODE }),
    dividerShape({ x: rule2.x, y: rule2.y, w: rule2.w, thick: 64 }),
    foot,
  ], { 'font-family': 'ui-sans-serif, system-ui, "PingFang SC", sans-serif' })));
}
