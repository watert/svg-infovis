// =====================================================================
// sequence-archify-style · 用「paper 主题 + buildSequence 后处理」复刻 archify 序列图观感
//
// 与 templates/sequence.ts 内置 demo 同一条消息流, 换 archify 的视觉语言(260920 对账):
//   · THEMES.paper —— 全局 mono + 暖白画布(archify 观感的一半在字体)
//   · actor 全 tint —— pastel 底 + 同系深边, 与 archify 的参与者盒一一对应
//   · 消息按语义分色: request 实线蓝 / return 虚线灰细箭头 / 内部自检 虚线紫 / 写回 实线青
//   · lifeline 压成浅灰(模板缺省用 theme 边色, paper 下是墨黑, 太重)
//   · phase 分隔带 —— `SceneGroup.noCheck` 纯视觉分区豁免(260920 当日补的旋钮, 命名随 tsconfig
//     noCheck / eslint disable): band 被泳道线横穿是常态, 组语义判读对它不成立, 整体跳出组审计。
//   · activation bars —— 260920 进模板(消息下标区间 → 圆头竖条), 本示例直接吃 `activations`;
//     骑在泳道线上的那截线走 `SceneEdge.noCheck`(同族旋钮, 见 README 坑 ③)。
//   · 画布底纹 —— 260920 落进 core 的 `opts.grid`: 细线格 step 10。它不进 scene, 所以对上面
//     那几条判据零影响(激活条 / band / 泳道线全照旧), 只是给暖白底补一层纸感。
// 不含 legend(已立项: 模板层记账里挂着这一条, 等它进模板时再补)。
// =====================================================================

import { THEMES, bounds, type Scene } from '../src/index';
import { isMainModule } from '../src/runtime';
import { buildSequence, lifelineStyle, type SequenceSpec } from './sequence';
import { runScene } from '../scripts/runner';

const spec: SequenceSpec = {
  title: '一次带缓存的读请求(archify 风格)',
  theme: THEMES.paper,
  actors: [
    { id: 'web', label: 'Browser', sub: 'tab context', tone: 'slate', variant: 'tint' },
    { id: 'gw', label: 'API', sub: 'request handler', tone: 'emerald', variant: 'tint' },
    { id: 'cache', label: 'Redis', sub: 'cache', tone: 'violet', variant: 'tint' },
    { id: 'db', label: 'Postgres', sub: 'source of truth', tone: 'blue', variant: 'tint' },
  ],
  messages: [
    { from: 'web', to: 'gw', label: 'GET /v1/user/42' },
    { from: 'gw', to: 'cache', label: 'GET user:42' },
    { from: 'cache', to: 'cache', label: 'check local LRU' },
    { from: 'cache', to: 'gw', label: 'miss' },
    { from: 'gw', to: 'db', label: 'SELECT … WHERE id=42' },
    { from: 'db', to: 'gw', label: 'row' },
    { from: 'gw', to: 'cache', label: 'SET user:42 EX 300' },
    { from: 'gw', to: 'web', label: '200 OK' },
  ],
  // 激活条(archify 同款元素): 区间用消息下标给, 色缺省跟着泳道走 —— 这里点明 Redis / Postgres
  // 的条色与 archify 参照图对齐(Auth 那类"跨列命中"没有对应泳道, 不硬凑)
  activations: [
    { actor: 'gw', from: 0, to: 7 },
    { actor: 'cache', from: 1, to: 3, tone: 'violet' },
    { actor: 'db', from: 4, to: 5, tone: 'blue' },
  ],
};

// 顶层导出 `scene`: 读数板(`scripts/inspect.ts`)认 `export default` / `export const scene` ——
// 不出到顶层, `bun run scripts/inspect.ts templates/sequence-archify-style.ts` 只能退 2(用法错)
export const { scene, opts, plan } = buildSequence(spec);

// --- 后处理 1: 消息语义分色(id = m<行序>, 模板契约; lifeline 压浅灰) ---
const INK_RETURN = '#6b7280';
const msgStyle = (color: string, o: { dash?: string; width?: number; end?: 'arrow-triangle' | 'arrow-line' } = {}) =>
  ({ color, width: o.width ?? 1.8, dash: o.dash, end: o.end ?? 'arrow-triangle' });
opts.edgeStyles = {
  ...opts.edgeStyles,
  // 只覆写色, 保留模板缺省的 start/end: none(整对象替换会把「无端点」顶掉 —— 实测长出箭头)
  ...Object.fromEntries(spec.actors.map((a) => [`life:${a.id}`, { ...lifelineStyle(THEMES.paper), color: '#a1a1aa' }])),
  m0: msgStyle(THEMES.paper.tones.blue.border!),
  m1: msgStyle(THEMES.paper.tones.blue.border!),
  m2: msgStyle(THEMES.paper.tones.violet.border!, { dash: '5 4' }),
  m3: msgStyle(INK_RETURN, { dash: '5 4', width: 1.4, end: 'arrow-line' }),
  m4: msgStyle(THEMES.paper.tones.blue.border!),
  m5: msgStyle(INK_RETURN, { dash: '5 4', width: 1.4, end: 'arrow-line' }),
  m6: msgStyle(THEMES.paper.tones.teal.border!),
  m7: msgStyle(INK_RETURN, { dash: '5 4', width: 1.4, end: 'arrow-line' }),
};

// --- 后处理 2: phase 分隔带(noCheck 纯视觉分区; 相邻带间留出一个行距给 outer 标签) ---
const bandPadX = 24, bandPadY = 16; // 带间 gap = rowGap(56) − 2·padY = 24px: outer 标签(高 15)不再骑上一带底边
const buildBands = (rows: number[], colLeft: number, colRight: number): Scene['groups'] => [
  { id: 'band-request', label: 'Request', noCheck: true, frame: 'declared' as const, tone: 'slate' as const, labelPlacement: 'outer' as const,
    rect: { x: Math.round(colLeft), y: Math.round(rows[0] - bandPadY), w: Math.round(colRight - colLeft), h: Math.round(rows[1] - rows[0] + 2 * bandPadY) } },
  { id: 'band-fallback', label: 'Fallback', noCheck: true, frame: 'declared' as const, tone: 'slate' as const, labelPlacement: 'outer' as const,
    rect: { x: Math.round(colLeft), y: Math.round(rows[2] - bandPadY), w: Math.round(colRight - colLeft), h: Math.round(rows[5] - rows[2] + 2 * bandPadY) } },
  { id: 'band-respond', label: 'Respond', noCheck: true, frame: 'declared' as const, tone: 'slate' as const, labelPlacement: 'outer' as const,
    rect: { x: Math.round(colLeft), y: Math.round(rows[6] - bandPadY), w: Math.round(colRight - colLeft), h: Math.round(rows[7] - rows[6] + 2 * bandPadY) } },
];

// 带的左右边界 = **actor 盒的并集 ± `bandPadX`**, 走 `bounds` 现算 —— 原写法是手定的魔数 90
// ("半个 actor 盒宽"的替身), 而四个盒半宽是 47 / 60.5 / 30.5 / 60.5, 没有一个等于它: 带离盒
// 于是忽远忽近(本图实测 **左 67 / 右 53.5px**), 而 `noCheck` 让门禁对这一档**一言不发**
// (组语义豁免整条跳过, 没有任何判据盯着"相带离相框内的盒有多远")。
// 并集 + pad 是一条与盒数 / 谁更宽都无关的判据 ⇒ 左右两侧离盒恒为 `bandPadX`(本图 24px)。
const actorIds = new Set(spec.actors.map((a) => a.id));
const bandBox = bounds(scene.nodes.filter((n) => actorIds.has(n.id)).map((n) => n.rect), { pad: bandPadX })!;
scene.groups = buildBands(plan.rows, bandBox.x, bandBox.x + bandBox.w);

// band 压浅灰细线(archify 观感; 缺省走 theme.groupStroke 是墨色, 太重)
opts.groupStyles = Object.fromEntries(['band-request', 'band-fallback', 'band-respond'].map((id) => [id, { stroke: '#9ca3af', strokeWidth: 1, dash: '6 5' }]));

// --- 画布底纹: 这里**不用写** —— paper 主题自带(260920 起 `Theme.grid` 就是这一层) ---
// 这张图正是网格底纹的头号用例(paper + 全局 mono + 暖白底, 缺的就是那层纸感), 所以它进了主题
// 缺省, 本示例零配置就有。要换 / 要关只动一位(下面两行是示范, 留着不生效):
//   opts.grid = { style: 'dot', step: 14 };  // 换点阵: 只写要改的, 墨色与深浅继承主题
//   opts.grid = false;                       // 要干净底: 连主题那层也关掉
// 三条边界: ① 不进 scene ⇒ 门禁(激活条 / band / 泳道线)一条都不受影响; ② 层序在画布底色之上、
// 内容之下 ⇒ 不遮字也不被节点盖住; ③ 一图只能一种网格(缺省 pattern id 是 `md-grid`, 再铺第二种
// 就得自己给 `id`, 否则后者引用串台)。

// 出口走 `scripts/runner`(260920)。两处顺手收口:
//   ① 出口**统一到 stdout**(过去本文件自己 `writeFileSync('/tmp/sequence-archify.svg')`) ——
//      "少数示例的图不吐 stdout" 曾是出图清单里的一处特例, 特例少一个是一个;
//   ② 出口收进 `isMainModule(import.meta.url)` —— 此前本文件顶层**无条件**跑 export + 写盘, 于是它被 import
//      (读数板 / 将来的 web 展示)时会当场落一个 /tmp 文件。出图示例的顶层必须是纯几何。
if (isMainModule(import.meta.url)) {
  runScene(scene, { ...opts, extra: ['archify-sequence: paper 主题(mono + 暖白 + 底纹缺省)'] });
}
