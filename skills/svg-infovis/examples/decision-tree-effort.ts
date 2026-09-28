// =====================================================================
// decision-tree-effort · 判定流: "Claude Code effort 档位决策树"(浅色, 紧凑单主干树)
//
// 这张图证明什么: 带旁支与回边的判定流, 能收成**单主干中轴 + 分支短探快收**的紧凑树
// (625×667, showcase 0 诊断) —— 主干 8 节点直下; 三条支路(medium 探出后汇回下游菱形 /
// Federico 旁支探出即终结 / max 作底部一侧的终点小注)与一条回边全部贴中轴走,
// 不左右各拉一列 —— 分列会把树读成网。
//
// 内容来源: vault `posts/260928-Claude-Code头脑风暴用low-effort.md` 的配图(真实内容)。
// 图里**刻意不含**任何指向正文数据的引用(通过数 / 失败分类计数), 让树自成通用决策逻辑。
//
// ── 版式(为什么长这样) ────────────────────────────────────────────────
// - 主干 y 用 `nextY` 游标逐节点累加; 行距按「这一行有没有边标签」分档(13 / 24)
// - 主干直连边的 stub 随行距收缩: 行距 < 2×默认 stub 时, 默认 stub 会把折线折回自己
// - title/desc 走 `SceneText` 进 scene(`opts.title` 只写 aria-label、不渲染) ——
//   只有这样标题块才进 contentBounds 与门禁
// - 紧凑化旋钮: 节点 padding [10,5]; 注意**画布宽度地板由必须保留的旁注决定**
//   (两条两行旁注在 11px 下就把宽度顶到 600+), 压宽度先砍旁注文案, 不是砍节点间距
//
// ── 实测坑(260928, 详表见 `refs/recipes.md` 配方 6) ────────────────────
// ① 同轴对齐只认一把尺子: `box(cx - w/2)` **别取整** —— 奇数宽取整让同轴两盒中心差 0.5px,
//    router 给本该直连的竖边插 0.25 圆角小折, 触发 `endpoint_approach`。
//    (与 `templates/lifecycle.ts` 坑①「列心从盒反推」看似相反实则同一条: 那边盒是整像素、
//    列心带账本小数尾; 这边中轴是作者定值。判据: 基准坐标在哪个坐标系, 别混用两套)
// ② 回边的 `via` 要避开对端面的试算 stub 区(实测 via 落进菱形左面 stub 内 → 自重叠折线,
//    `no_backtrack` 报错); 外推到 stub 之外, 并显式给小 `stub: 12`
// ③ 边标签贴在自己那条边的水平段正上方, 放远了读不出归属
// ④ `audit(scene)` 在 0×0 原始画布上是噪音(`single_svg` 把每个元素报越界、`long_edge`
//    按 0 对角线全失真); 真实判决只看 `tryExport` / `exportScene` 的 report
// =====================================================================
import {
  THEMES, nodeFit, textFit, routeOrthogonal, edgeLabel, textNote,
  type Scene, type SceneNode, type SceneEdge, type SceneLabel, type SceneText,
} from '../../src/index.js';
import { runScene } from '../../scripts/runner';
import { isMainModule } from '../../src/runtime';

const LEVEL = 'showcase' as const;
const FS = 14;      // 主干节点主字号(>=13px 等效)
const AFS = 11;     // 旁注字号
const LFS = 11;     // 边标签字号
const PAD: [number, number] = [10, 5];   // 水平 10 与门禁同源; 垂直收到 5 压高度
const TFS = 20;     // 主标题字号(明显大于节点文字)
const DFS = 12;     // 副标题字号
const TOP = 66;     // 顶部标题块占位: 主轴从这里起算
const NOTE = '#475569';
const CANVAS = THEMES.light.canvas;

const XC = 400;             // 主干中轴
const XL = XC - 205;        // 左支列(旁支 / 直接收工 / max)
const XR = XC + 225;        // 右支列(medium) —— 旁注去掉数据后右侧变空, 拉到 225 把画布撑回 640 量级

// ⚠ 见文件头坑①: 这里**不取整**
const box = (w: number, h: number, cx: number, cy: number) =>
  ({ x: cx - w / 2, y: cy - h / 2, w, h });

const fit = (label: string, sub?: string, shape?: 'diamond') =>
  nodeFit({ label, sub, fontSize: FS, level: LEVEL, padding: PAD, ...(shape ? { shape } : {}) });

// ---- 主干: 单根纵贯中轴, 逐节点累加(gapAfter = 与下一行的间距) ----
const fStart = fit('任务来了');
const fD1 = fit('规格空缺\n还多吗?', undefined, 'diamond');
const fInterview = fit('采访', '模型问洞, 人答');
const fDraft = fit('low 出毛坯');
const fReview = fit('人审方向', undefined, 'diamond');
const fD2 = fit('错了的代价高\n边界密?', undefined, 'diamond');
const fHigh = fit('high: 验证与测试');
const fDone = fit('收工');

let cursor = TOP;
const nextY = (h: number, gapAfter: number) => { const cy = cursor + h / 2; cursor += h + gapAfter; return cy; };
const yStart = nextY(fStart.h, 13);
const yD1 = nextY(fD1.h, 24);          // 24: 给主干标签「多」留位
const yInterview = nextY(fInterview.h, 13);
const yDraft = nextY(fDraft.h, 13);
const yReview = nextY(fReview.h, 24);  // 24: 「稳」
const yD2 = nextY(fD2.h, 24);          // 24: 「是」
const yHigh = nextY(fHigh.h, 13);
const yDone = nextY(fDone.h, 0);
const SPINE_BOTTOM = cursor;

const rStart = box(fStart.w, fStart.h, XC, yStart);
const rD1 = box(fD1.w, fD1.h, XC, yD1);
const rInterview = box(fInterview.w, fInterview.h, XC, yInterview);
const rDraft = box(fDraft.w, fDraft.h, XC, yDraft);
const rReview = box(fReview.w, fReview.h, XC, yReview);
const rD2 = box(fD2.w, fD2.h, XC, yD2);
const rHigh = box(fHigh.w, fHigh.h, XC, yHigh);
const rDone = box(fDone.w, fDone.h, XC, yDone);

// ---- 支路节点 ----
const fSide = fit('方向想让 AI 出', '(Federico 习惯)');
const fPlanMax = fit('计划阶段 max');
const fMedium = fit('medium 实现', '路径影响小');
const fDirect = fit('low / medium\n直接收工');
const fMax = fit('max', '不看中间状态, 挖漏洞');

const ySide = yStart;                                              // 与根同高, 左侧短探即终结
const yPlanMax = Math.round(ySide + fSide.h / 2 + 40 + fPlanMax.h / 2);
const rSide = box(fSide.w, fSide.h, XL, ySide);
const rPlanMax = box(fPlanMax.w, fPlanMax.h, XL, yPlanMax);
const yMedium = Math.round((yD1 + yD2) / 2);                       // 夹在两个菱形之间, 向下汇回 d2
const rMedium = box(fMedium.w, fMedium.h, XR, yMedium);
const rDirect = box(fDirect.w, fDirect.h, XL - 30, yD2);           // 菱形二「否」→ 短探即终结
const rMax = box(fMax.w, fMax.h, XL - 10, yHigh);                  // 正位: 底部一侧的终点小注

const nodes: SceneNode[] = [
  { id: 'start', rect: rStart, label: '任务来了', fontSize: FS, tone: 'slate' },
  { id: 'd1', rect: rD1, label: '规格空缺\n还多吗?', fontSize: FS, shape: 'diamond' },
  { id: 'interview', rect: rInterview, label: '采访', sub: '模型问洞, 人答', fontSize: FS, tone: 'slate' },
  { id: 'draft', rect: rDraft, label: 'low 出毛坯', fontSize: FS, tone: 'emerald', variant: 'tint' },
  { id: 'review', rect: rReview, label: '人审方向', fontSize: FS, shape: 'diamond' },
  { id: 'd2', rect: rD2, label: '错了的代价高\n边界密?', fontSize: FS, shape: 'diamond' },
  { id: 'high', rect: rHigh, label: 'high: 验证与测试', fontSize: FS, tone: 'amber', variant: 'tint' },
  { id: 'done', rect: rDone, label: '收工', fontSize: FS, tone: 'slate' },
  { id: 'medium', rect: rMedium, label: 'medium 实现', sub: '路径影响小', fontSize: FS, tone: 'blue', variant: 'tint' },
  { id: 'direct', rect: rDirect, label: 'low / medium\n直接收工', fontSize: FS, tone: 'slate', variant: 'tint' },
  { id: 'side', rect: rSide, label: '方向想让 AI 出', sub: '(Federico 习惯)', fontSize: FS, tone: 'slate' },
  { id: 'planmax', rect: rPlanMax, label: '计划阶段 max', fontSize: FS, tone: 'violet', variant: 'tint' },
  { id: 'max', rect: rMax, label: 'max', sub: '不看中间状态, 挖漏洞', fontSize: FS, tone: 'violet', variant: 'tint' },
];

// ---- 边 ----
// 主干直连: 端点前直段按行距收缩(行距 < 2×18 时默认 stub 会把折线折回自己)
const trunk = (from: typeof rStart, to: typeof rStart, gap: number) =>
  routeOrthogonal({
    from, fromPort: { side: 'bottom' }, to, toPort: { side: 'top' },
    stub: Math.max(4, Math.min(10, Math.floor(gap / 2) - 2)),
  });
const eStartD1 = trunk(rStart, rD1, 14);
const eD1Interview = trunk(rD1, rInterview, 28);
const eInterviewDraft = trunk(rInterview, rDraft, 14);
const eDraftReview = trunk(rDraft, rReview, 14);
const eReviewD2 = trunk(rReview, rD2, 28);
const eD2High = trunk(rD2, rHigh, 28);
const eHighDone = trunk(rHigh, rDone, 14);

// 支路
const eD1Medium = routeOrthogonal({ from: rD1, fromPort: { side: 'right' }, to: rMedium, toPort: { side: 'top' } });
const eMediumD2 = routeOrthogonal({ from: rMedium, fromPort: { side: 'bottom' }, to: rD2, toPort: { side: 'right' } });
const eD2Direct = routeOrthogonal({ from: rD2, fromPort: { side: 'left' }, to: rDirect, toPort: { side: 'right' }, stub: 12 });
const eStartSide = routeOrthogonal({ from: rStart, fromPort: { side: 'left' }, to: rSide, toPort: { side: 'right' }, stub: 10 });
const eSidePlanMax = routeOrthogonal({ from: rSide, fromPort: { side: 'bottom' }, to: rPlanMax, toPort: { side: 'top' }, stub: 12 });
// 人审回边: 贴中轴左侧的小回环(菱形左顶点外 XC-106, 比节点半宽 90.5 再让 15.5; 见文件头坑②)
const BACK_X = XC - 106;
const eBack = routeOrthogonal({
  from: rReview, fromPort: { side: 'left' }, to: rDraft, toPort: { side: 'left' },
  via: [{ x: BACK_X, y: yReview }, { x: BACK_X, y: yDraft }], stub: 12,
});

const edges: SceneEdge[] = [
  { id: 'e-start-d1', from: 'start', to: 'd1', points: eStartD1.points },
  { id: 'e-d1-interview', from: 'd1', to: 'interview', points: eD1Interview.points, label: '多' },
  { id: 'e-interview-draft', from: 'interview', to: 'draft', points: eInterviewDraft.points, tone: 'emerald' },
  { id: 'e-draft-review', from: 'draft', to: 'review', points: eDraftReview.points },
  { id: 'e-review-d2', from: 'review', to: 'd2', points: eReviewD2.points, label: '稳' },
  { id: 'e-d2-high', from: 'd2', to: 'high', points: eD2High.points, label: '是', tone: 'amber' },
  { id: 'e-high-done', from: 'high', to: 'done', points: eHighDone.points, tone: 'amber' },
  { id: 'e-d1-medium', from: 'd1', to: 'medium', points: eD1Medium.points, label: '少(规格已写死)', tone: 'blue' },
  { id: 'e-medium-d2', from: 'medium', to: 'd2', points: eMediumD2.points, tone: 'blue' },
  { id: 'e-d2-direct', from: 'd2', to: 'direct', points: eD2Direct.points, label: '否' },
  { id: 'e-start-side', from: 'start', to: 'side', points: eStartSide.points },
  { id: 'e-side-planmax', from: 'side', to: 'planmax', points: eSidePlanMax.points, tone: 'violet' },
  { id: 'e-back', from: 'review', to: 'draft', points: eBack.points, label: '歪', tone: 'emerald' },
];

// ---- 边标签(显式落位; 见文件头坑③) ----
const labels: SceneLabel[] = [
  edgeLabel({ id: 'e-d1-interview', points: eD1Interview.points }, '多', { at: { x: XC + 14, y: (rD1.y + rD1.h + rInterview.y) / 2 }, fontSize: LFS }),
  edgeLabel({ id: 'e-review-d2', points: eReviewD2.points }, '稳', { at: { x: XC + 14, y: (rReview.y + rReview.h + rD2.y) / 2 }, fontSize: LFS }),
  edgeLabel({ id: 'e-d2-high', points: eD2High.points }, '是', { at: { x: XC + 14, y: (rD2.y + rD2.h + rHigh.y) / 2 }, fontSize: LFS }),
  edgeLabel({ id: 'e-d1-medium', points: eD1Medium.points }, '少(规格已写死)', { at: { x: XC + 168, y: yD1 - 13 }, fontSize: LFS }),
  edgeLabel({ id: 'e-d2-direct', points: eD2Direct.points }, '否', { at: { x: XC - 144, y: yD2 - 12 }, fontSize: LFS }),
  edgeLabel({ id: 'e-back', points: eBack.points }, '歪', { at: { x: BACK_X, y: Math.round((yDraft + yReview) / 2) }, fontSize: LFS, bg: CANVAS }),
];

// ---- 旁注(每条最多两行; 刻意不含指向正文数据的引用) ----
const draftTxt = '毛坯把分叉留在桌上; 广度来自\n采访 × 迭代次数, 不是档位';
const highTxt = '高档多烧的 token\n买的是验证与边界覆盖';
const warnTxt = '你审的不再是方向而是成品\n加档不修正第一判断';
const guardTxt = '中途改档不掉缓存: Opus 5.5 / Fable 5.1 起';
const TITLE = 'Claude Code effort 档位决策树';
const DESC = '空缺多先 low 出毛坯, 方向稳了再 high 验证; max 只在不看中间状态时开';
const wf = textFit({ content: warnTxt, fontSize: AFS });
const gf = textFit({ content: guardTxt, fontSize: AFS });

const texts: SceneText[] = [
  textNote({ id: 'scene-title', content: TITLE, fontSize: TFS, weight: 700, anchor: 'middle', at: { x: XC, y: 15 }, color: '#0f172a' }),
  textNote({ id: 'scene-desc', content: DESC, fontSize: DFS, anchor: 'middle', at: { x: XC, y: 40 }, color: '#64748b' }),
  textNote({ id: 'note-draft', content: draftTxt, fontSize: AFS, anchor: 'end', at: { x: XC - 120, y: yDraft }, color: NOTE }),
  textNote({ id: 'note-high', content: highTxt, fontSize: AFS, anchor: 'start', at: { x: rHigh.x + rHigh.w + 16, y: yHigh }, color: NOTE }),
  textNote({ id: 'note-warn', content: warnTxt, fontSize: AFS, anchor: 'middle', at: { x: XL, y: Math.round(rPlanMax.y + rPlanMax.h + 12 + wf.h / 2) }, color: '#b45309' }),
  textNote({ id: 'note-max', content: '另一类任务', fontSize: AFS, anchor: 'middle', at: { x: XC - 205, y: rMax.y - 16 }, color: '#7c3aed' }),
  textNote({ id: 'note-guard', content: guardTxt, fontSize: AFS, anchor: 'middle', at: { x: XC, y: Math.round(SPINE_BOTTOM + 12 + gf.h / 2) }, color: '#334155' }),
];

const scene: Scene = { width: 0, height: 0, nodes, edges, labels, texts };
export default scene;

if (isMainModule(import.meta.url)) {
  // 出口走 `scripts/runner.ts`: 门禁判决落 exit code, 图走 stdout(--out= 由调用方解析惯例见 templates/)
  runScene(scene, {
    level: LEVEL,
    theme: THEMES.light,
    fit: true,
    title: TITLE,
    edgeStyles: {
      'e-back': { dash: '6 5' },
      'e-side-planmax': { dash: '3 4' },
    },
  });
}
