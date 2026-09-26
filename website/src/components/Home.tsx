// 首页: hero(内核实时渲染的活证据) + 是什么/不是什么 + 30 秒起手 + API 分层地图
// 文案提炼自仓根 README(不整段抄): 说法只留一份, 详细口径回链文档。
import { renderHero } from '../lib/liveDemo';

/** hero 上那段"活证据"的 import 原文 —— 就是本模块旁边那个 lib 里跑的东西(逐字同名) */
const HERO_IMPORT =
  "import { THEMES, edgeLabel, grid, labelBoxSize, nodeFit, round1, routeOrthogonal, tryExport } from '../../../src/index'";

const START = `git clone https://github.com/watert/svg-infovis.git && cd svg-infovis
bun install                                            # 只有图标素材是依赖; 库本体零运行时依赖
bun run examples/start/basic.ts > /tmp/basic.svg        # descriptor 层最小路径
bun run examples/start/full-chain.ts > /tmp/chain.svg   # scene → route → audit → export 全链
./scripts/svg2png.sh /tmp/chain.svg                     # 可选: 本地栅格化(毫秒级, 零浏览器)`;

/** 常用入口(键名与命令取自 README 的同一张表) */
const ENTRIES = [
  { cmd: 'bun run examples/manifest.ts', desc: '全部示例清单: 键名 / 桶 / 这张图证明什么' },
  { cmd: 'bun run scripts/inspect.ts <scene.ts>', desc: '布局读数板, 不出图 —— 退出码 0 通过 / 1 门禁不过 / 2 用法错' },
  { cmd: 'svginfo run <scene.ts> -o out.svg', desc: 'CLI(bun link 后全局可用): run / inspect / render / new / icons' },
  { cmd: 'bun run verify', desc: 'bun test + tsc --noEmit, 改内核后的唯一验收动作' },
];

const CARDS = [
  { head: '是', title: '把几何从渲染里拆出来的那一层', body: '盒宽反算、正交折点、几何谓词、门禁审计, 以及 descriptor → 字节确定的 SVG 字符串。' },
  { head: '不是', title: 'data-vis 库', body: '不绑比例尺、不绑数据。要画数据图, 那是 echarts 那一档的活 —— 它只把你给的几何画准。' },
  { head: '不是', title: 'layout 引擎', body: '排布是作者的决策: 端口、折点、分组都写在 scene 里。core 不猜意图, via 是声明不是避障。' },
  { head: '不是', title: '渲染器', body: '产物是自包含 SVG, 没有运行时。坐标在构建期算完, 一个数一个来源。' },
];

const LAYERS = [
  { tone: 'slate', name: 'geometry', body: '纯函数几何: 向量 · 圆角路径逐角解算 · 几何谓词 · 端口与盒查询 · 均匀格子 · 摆放' },
  { tone: 'blue', name: 'shapes', body: 'props → descriptor: 节点三形态(矩形 / 菱形 / 圆柱) · 边与标签 · 组框 · 行内标记上屏 · 图标槽' },
  { tone: 'violet', name: 'descriptor · serialize', body: '纯数据描述符 → SVG 字符串: 唯一的字符串出口, 属性键按 codepoint 序 —— 字节确定的地基' },
  { tone: 'emerald', name: 'knives', body: '构建期推导与判决: 正交路由 · 门禁审计(十九项 / 两档阈值) · 盒宽反算 · 约束账本 · 成对连线' },
  { tone: 'amber', name: 'scene · export', body: '场景与出口: tryExport(迭代回路, 永不抛) · exportScene(fail-closed 交付, 不过就抛)' },
  { tone: 'teal', name: 'blocks', body: '带数值语义的组合块(单值进度条 / 图标阵列) —— 独立子路径, 刻意不进 barrel' },
];

export function Home() {
  // 内核在浏览器里现场算一次(memo), 之后每次渲染都吃同一份结果
  const hero = renderHero();
  const kb = (hero.bytes / 1024).toFixed(1);

  return (
    <div className="home">
      <section className="home-hero">
        <div className="home-copy">
          <p className="home-kicker">diagramming 几何内核 · 纯 TS, 无构建步骤</p>
          <h1 className="home-title">
            把<em>几何</em>从渲染里拆出来
          </h1>
          <p className="home-lede">
            管的是图的几何: 盒宽反算、正交折点、几何谓词、门禁审计, 以及 descriptor → SVG 字符串的序列化。
            它不碰数据、不管排布意图、不建运行时 —— 一个坐标一个数, 都在构建期算完, 写进一份自包含的 SVG。
          </p>
          <ul className="home-chips">
            <li>0 dependency</li>
            <li>字节确定</li>
            <li>产物 = 自包含 SVG</li>
          </ul>
          <div className="home-cta">
            <a className="home-btn" href="#/gallery">进入画廊</a>
            <a className="home-btn home-btn-ghost" href="https://github.com/watert/svg-infovis" target="_blank" rel="noreferrer">
              GitHub 仓 ↗
            </a>
          </div>
        </div>

        <figure className="home-live">
          <div className="home-live-frame" dangerouslySetInnerHTML={{ __html: hero.svg }} />
          <figcaption className="home-live-cap">
            <p className="home-live-stat">
              <b>现场渲染</b> · {hero.level} 档门禁 {hero.pass ? '全绿' : '没过'} · {hero.errors} error / {hero.warnings} warning ·{' '}
              {hero.nodes} 节点 / {hero.edges} 边 · {kb} KB · 指纹 <code>{hero.fingerprint}</code>
            </p>
            <p className="home-live-note">
              这张图没有构建期产物: 坐标是内核在你的浏览器里现算的(盒宽 <code>nodeFit</code>、格位 <code>grid</code>、
              折点 <code>routeOrthogonal</code>、出口走 <code>tryExport</code> 现跑一遍 showcase 档门禁)。刷新一次,
              指纹不变 —— 这就是字节确定性。
            </p>
            <p className="home-live-read">
              读法: 四站 = <code>scene → route → audit → export</code>; 左边那条回环 = 门禁不过就回改坐标,
              正是出口 <code>tryExport</code> 的迭代回路。
            </p>
            <p className="home-live-src"><code>{HERO_IMPORT}</code></p>
            {hero.problems.length ? (
              <details className="home-live-problems">
                <summary>门禁诊断 {hero.problems.length} 条</summary>
                <ul>{hero.problems.map((p) => <li key={p}><code>{p}</code></li>)}</ul>
              </details>
            ) : null}
          </figcaption>
        </figure>
      </section>

      <section className="home-section">
        <h2 className="home-h2">它是什么 / 不是什么</h2>
        <div className="home-cards">
          {CARDS.map((c) => (
            <article className="home-card" key={c.title}>
              <span className={c.head === '是' ? 'home-card-tag home-card-is' : 'home-card-tag'}>{c.head}</span>
              <h3>{c.title}</h3>
              <p>{c.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="home-section">
        <h2 className="home-h2">30 秒起手</h2>
        <pre className="home-code"><code>{START}</code></pre>
        <p className="home-warn">
          ⚠ 出图命令别加 <code>2&gt;&amp;1</code>: SVG 走 stdout、诊断走 stderr, 合并会把诊断写进文件头 ——
          而文件照样以 <code>&lt;/svg&gt;</code> 收尾、退出码照样 0, 失败长得像成功。
        </p>
        <dl className="home-entries">
          {ENTRIES.map((e) => (
            <div className="home-entry" key={e.cmd}>
              <dt><code>{e.cmd}</code></dt>
              <dd>{e.desc}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="home-section">
        <h2 className="home-h2">API 分层一句话地图</h2>
        <ul className="home-layers">
          {LAYERS.map((l) => (
            <li className="home-layer" data-tone={l.tone} key={l.name}>
              <span className="home-layer-dot" aria-hidden="true" />
              <code className="home-layer-name">{l.name}</code>
              <span className="home-layer-body">{l.body}</span>
            </li>
          ))}
        </ul>
        <p className="home-note">
          子路径即 API: <code>import {'{ nodeFit }'} from '@watert/svg-infovis/knives/fit'</code>; 仓内开发用相对路径引
          <code> ./src/…</code>。函数签名以源码为单一来源, 本页只做"什么在哪一层"的地图。
        </p>
      </section>
    </div>
  );
}
