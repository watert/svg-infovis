// =====================================================================
// manifest · examples/ 的**单一清单**(260920)
//
// 为什么要它: 合并前"有哪些示例"这件事散在三处 —— `scripts/build-example-pngs.sh` 里一份
// ITEMS 表、`SKILL.md` 文件地图里一串逗号、人脑子里一份。三份必然漂(新增示例忘了登记就跑不到图,
// 而脚本**刻意**不扫目录猜 —— 见它文件头)。这里收成一份, 别处只许引用它。
//
// 人读:  `bun run examples/manifest.ts`
// 机读:  `bun run examples/manifest.ts --tsv`   → key<TAB>file<TAB>arg(给 build-example-pngs.sh)
//
// 三条纪律:
//   · **`key` 就是 PNG 名**(`examples/images/<key>.png`), 改名 = 改产物名 —— 不许同义两名
//   · `group` 是**桶**: start(起手) / checks(机制对照) / gallery(能力举证) / labs(样式矩阵)
//     / templates(模板示范)
//   · `what` 一句话说清"这张图证明什么" —— 没有这句话的示例不该存在
//
// ⚠ 清单**覆盖全部出图入口**, 不只有 `examples/` 下的: `templates/sequence-archify-style.ts`
// 的源跟着模板层搬了家(260920), 但它的 PNG 快照仍集中在 `examples/images/` —— 快照只留**一个**
// 目录(两个抽屉就会漂), 于是清单的范围是"出图入口"而不是"examples 目录"。`file` 因此是路径。
//
// ⚠ 模板**自带的冒烟示例**同样是出图入口(260925 补登 `sequence-demo` = `templates/sequence.ts` 的
// `DEMO_SEQUENCE`): 它当时是唯一没登记的入口, 于是登记面全绿、而快照重出链整整看不见它 ——
// "出图入口"判据是"这条命令会往 stdout 吐一张图", 不是"文件躺在哪个目录"。
//
// 不进清单的: `scripts/inspect.ts`(它是读数 CLI, 不出图)、`scripts/runner.ts`(出口工具 ——
// 它给所有示例提供出口, 自己不出图)。
// 也不进: 非出口示例(`audit-demo` / `style-lab`)仍然在清单里 —— 它们出图, 只是不过门禁。
// =====================================================================

export type ExampleGroup = 'start' | 'checks' | 'gallery' | 'labs' | 'templates';

export type ExampleEntry = {
  /** PNG 名 = `examples/images/<key>.png`; 也是 `build-example-pngs.sh` 的选择器 */
  key: string;
  group: ExampleGroup;
  /** 相对 skill 根; 必须能 `bun run` */
  file: string;
  /** 额外 argv(缺省无) */
  arg?: string;
  /** 这张图证明什么 —— 一句话 */
  what: string;
};

export const GROUP_LABEL: Record<ExampleGroup, string> = {
  start: '起手教学 —— 抄这个开新图',
  checks: '机制对照 —— 一个旋钮/门禁的两种画法',
  gallery: '能力举证 —— 这类图 core 画得出来',
  labs: '样式矩阵 —— 缺省值就是这样定档的',
  templates: '模板示范 —— 模板 + 后处理能到什么程度',
};

export const EXAMPLES: ExampleEntry[] = [
  // ── start ────────────────────────────────────────────────────────────
  { key: 'basic', group: 'start', file: 'examples/start/basic.ts',
    what: '描述符层最小路径: 直出 descriptor(不经 scene、不过门禁), 坐标全走派生(`nodeFit` / `packCol` / `rectFace` / `bounds`)' },
  { key: 'full-chain', group: 'start', file: 'examples/start/full-chain.ts',
    what: '主路径全链 scene → route → audit → export, 且 `--golden` 是字节对账入口' },

  // ── checks ───────────────────────────────────────────────────────────
  { key: 'audit-demo', group: 'checks', file: 'examples/checks/audit-demo.ts',
    what: '门禁诊断长什么样: 四类违例 + 干净对照, 四个违例元素挨个标出(节点/边描红, 标签走自身 bg/color)' },
  { key: 'lanes-fanout', group: 'checks', file: 'examples/checks/lanes-fanout.ts',
    what: 'fan-out 三种画法对照 —— **产物只画 ①** 共享端点(零手工, pass); ② 端口摊开并轨(10 条 edge_overlap)与 ③ assignLanes 错开只在 stderr 报条数, 不出图' },
  { key: 'port-folds', group: 'checks', file: 'examples/checks/port-folds.ts',
    what: '端口朝向 → 折法参考卡: 盒位逐字相同, 只换端口两面' },

  // ── gallery ──────────────────────────────────────────────────────────
  { key: 'node-forms', group: 'gallery', file: 'examples/gallery/node-forms.ts',
    what: '形状三态(矩形/菱形/圆柱)同框, 盒宽一律 `nodeFit({ shape })` 反算' },
  { key: 'ontology-icons', group: 'gallery', file: 'examples/gallery/ontology-icons.ts',
    what: '本体图: 图标当视觉替身 + 逐行说明卡片 + 成对双线 + 沿线旋转标签' },
  { key: 'academic-figure', group: 'gallery', file: 'examples/gallery/academic-figure.ts',
    what: '学术风(paper 主题)复刻: tint 分区 / 废除格(struck+opacity) / 多行文本槽' },
  { key: 'lifecycle-agent-run', group: 'gallery', file: 'examples/gallery/lifecycle-agent-run.ts',
    what: '深色阶段带图: 三段 × 10 状态 + 分岔/合流/回流(版式判据在 test/)' },
  { key: 'harness-arch', group: 'gallery', file: 'examples/gallery/harness-arch.ts',
    what: '真实规模手排样本: 15 节点装配链路(立项实验的对照组 / 手排税测量载体, 依据见 ROADMAP.md「立项依据」)' },
  { key: 'embed-panel', group: 'gallery', file: 'examples/gallery/embed-panel.ts',
    what: '外部素材链: echarts 出的整幅 SVG 当底板嵌进面板(嵌套 <svg>, 素材 z 序在底)' },
  // v0.2 排版层(260925): 三件 shapes 排版件 + 两件 blocks —— 五张都是描述符层直出
  // (拼 `svg()` 出图, 不过门禁: 它们画的是压在版式上的墨迹, 没有可审计的拓扑)
  { key: 'stat', group: 'gallery', file: 'examples/infograph/stat.ts',
    what: '大数字块 4 块排成 2×2: 块宽高走 `statFit` 反算 + 格位走 `grid`(统一格取最大那块), 一个手写坐标都没有; delta 标记是路径小三角(mono 字体栈下 `▲` 实测出 tofu)' },
  { key: 'badge-list', group: 'gallery', file: 'examples/infograph/badge-list.ts',
    what: '编号徽章 + 列表行 5 行: `listRowFit` 的返回面**直接喂** `packCol` 堆成一列, 徽章一图摆出 tone × variant 三档' },
  { key: 'heading', group: 'gallery', file: 'examples/infograph/heading.ts',
    what: '标题梯级(kicker / 标题 / 副标题)+ 两种分隔线 + 居中页脚: 每块位置从上一块底边加缝推(`below`), 一个 y 都不手拍' },
  { key: 'progress', group: 'gallery', file: 'examples/infograph/progress.ts',
    what: 'blocks/ 第一件: 两条单值进度条 + 一条三段堆叠条 —— `ratio` 由作者算好, 盒交给 `packCol` 摆完再摊回声明重画(逐位相同), 两档标签位置都画出来' },
  { key: 'pictogram', group: 'gallery', file: 'examples/infograph/pictogram.ts',
    what: 'blocks/ 第二件: ISOTYPE 图标阵列(单行 10 染 7 / 4×5 格 20 染 13) —— `N` 与 `k` 是作者声明的数, 尺寸走 `pictogramFit` 反算' },
  // 动画 ① 档(260926): 三张同一族 —— 版图与静态图一字不差, 多出来的只是时间轴; 各自钉一个机制
  { key: 'anim-flow', group: 'gallery', file: 'examples/gallery/anim-flow.ts',
    what: '流程图的"在跑"态: 四条蚂蚁线走 `attrs.href` 指 path 自己的 `stroke-dashoffset`(非继承属性挂组上不动), 四环按 `begin="<id>.end"` 时序链点亮(⚠ 同步基 id 不许带连字符, 实测)`' },
  { key: 'anim-progress', group: 'gallery', file: 'examples/gallery/anim-progress.ts',
    what: '数值"长出来": 条宽 0 → 声明比例走 `href` 指 rect 的 width, 图标阵列前 10/15 格按 `keyTimes` 逐格 `visibility` 点亮 —— 静态帧即末态' },
  { key: 'anim-interactive', group: 'gallery', file: 'examples/gallery/anim-interactive.ts',
    what: '交互高亮: `begin="click"` 点节点 → 该节点与相关边 `fill="freeze"` 亮住(只点不灭), 悬停微反馈与呼吸点走内嵌 CSS —— SMIL 轨与 CSS 轨各管一个属性' },

  // ── labs ─────────────────────────────────────────────────────────────
  { key: 'style-lab-light', group: 'labs', file: 'examples/labs/style-lab.ts', arg: 'light',
    what: '主题矩阵 light: 7 tone × outline/solid 的色值与对比度' },
  { key: 'style-lab-dark', group: 'labs', file: 'examples/labs/style-lab.ts', arg: 'dark',
    what: '主题矩阵 dark: 同上, 核 solid 上的字还看不看得见' },
  { key: 'style-lab-grid', group: 'labs', file: 'examples/labs/style-lab.ts', arg: 'grid',
    what: '底纹对照: 线格 / 点阵 × 两档密度(opacity 缺省就是这么量出来的)' },

  // ── templates(源在 templates/, 快照仍集中在 examples/images/) ──────────
  { key: 'sequence-demo', group: 'templates', file: 'templates/sequence.ts',
    what: '模板层示范: 4 泳道 × 8 消息 + 3 条激活条(一次带缓存的读请求) —— 缺省主题下的模板原生观感, 对照 archify-style 那一档' },
  { key: 'sequence-archify-style', group: 'templates', file: 'templates/sequence-archify-style.ts',
    what: '模板层示范: paper + mono + 语义分色 + phase 带 + 激活条 → archify 观感' },
  { key: 'layered-demo', group: 'templates', file: 'templates/layered.ts',
    what: '模板层示范: 层框 + 整层锚点的跨层注入 → 15 节点装配链路排成三段分层图' },
  { key: 'lifecycle-demo', group: 'templates', file: 'templates/lifecycle.ts',
    what: '模板层示范: 三段带 × 10 状态 + 分岔/合流/回流, 图例由调用方经 `decorate` 补' },
];

/** 清单的规范形状: `key<TAB>file<TAB>arg` —— 制表符分隔, 供 shell 直接 `read` */
export function toTSV(entries: readonly ExampleEntry[] = EXAMPLES): string {
  return entries.map((e) => [e.key, e.file, e.arg ?? ''].join('\t')).join('\n') + '\n';
}

if (import.meta.main) {
  if (process.argv.includes('--tsv')) process.stdout.write(toTSV());
  else {
    let group: ExampleGroup | '' = '';
    for (const e of EXAMPLES) {
      if (e.group !== group) {
        group = e.group;
        console.log(`\n## ${group} · ${GROUP_LABEL[group]}`);
      }
      console.log(`  ${e.key.padEnd(20)} ${e.file}${e.arg ? ` ${e.arg}` : ''}`);
      console.log(`  ${' '.repeat(20)} ${e.what}`);
    }
    console.log(`\n共 ${EXAMPLES.length} 项(key 即 examples/images/<key>.png)`);
  }
}
