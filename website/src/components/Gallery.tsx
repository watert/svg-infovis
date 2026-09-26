// =====================================================================
// Gallery · examples 画廊(五桶分区 + 卡片网格 + 详情深链 #/gallery/<key>)
//
// 数据: 构建期管线产出的 src/generated/examples.json(prerender 后才有, 开发期有手写假数据)。
// 产物: public/svg/<key>.svg **内联**渲染 —— 不走 <img>, 自家构建的 SVG 直出。
// 源码: import.meta.glob 打包仓根的 examples/ 与 templates/(vite.config 已 fs.allow ['..']),
//       **懒加载**(非 eager —— 23 份源码占首屏 chunk 的大头, 打开详情时才动态 import, 拆成小 chunk),
//       按元数据 file 字段查表, 不做语法高亮(零依赖)。
// =====================================================================
import { useCallback, useEffect, useState } from 'react';
// 构建期产物(prerender 前由开发用假数据占位), 形状自己声明 —— 不加 @ts-expect-error:
// 实测本仓 tsconfig(moduleResolution: bundler)能解析 .json, 加了反而报 TS2578「未使用」
import raw from '../generated/examples.json';
import { ExampleCard } from './ExampleCard';
import { ExampleDetail } from './ExampleDetail';
import '../gallery.css';

/** 一条示例的元数据(形状同 examples/manifest.ts 的 ExampleEntry + 产物指纹) */
export type ExampleEntry = {
  key: string;
  group: string;
  /** 仓根相对路径, 必须能 `bun run` */
  file: string;
  arg?: string;
  /** 这张图证明什么 */
  what: string;
  /** public 下的产物路径, 如 `svg/basic.svg` */
  svg: string;
  /** 草稿: 还没定档的示例 */
  draft?: boolean;
  /** 出图命令的退出码, 非 0 = 门禁没过 */
  exitCode: number;
  bytes: number;
  sha256: string;
};

export type GalleryData = { groups: Record<string, string>; examples: ExampleEntry[] };

const DATA = raw as GalleryData;
const BY_KEY = new Map(DATA.examples.map((e) => [e.key, e]));

// 源码: 懒加载 glob —— 值是 `() => Promise<string>`, 打开详情时才真去取(缓存进 state, 不重复拉);
// 两个 glob 的 key 带 `../../../` 前缀, 归一化成仓根相对路径后查表
const GLOBBED = {
  ...import.meta.glob('../../../examples/**/*.ts', { query: '?raw', import: 'default' }),
  ...import.meta.glob('../../../templates/**/*.ts', { query: '?raw', import: 'default' }),
} as Record<string, () => Promise<string>>;
const SOURCES = new Map(Object.entries(GLOBBED).map(([k, v]) => [k.replace(/^(?:\.\.\/)+/, ''), v]));

const HASH_RE = /^#\/gallery\/(.+)$/;
/** 关详情落回的锚点: App 壳按它切回首页视图并滚到画廊区 */
const ANCHOR = '/gallery';
const keyFromHash = (hash: string): string | null => {
  const m = HASH_RE.exec(hash);
  return m ? decodeURIComponent(m[1]) : null;
};

export function Gallery() {
  const [openKey, setOpenKey] = useState<string | null>(() => {
    const k = keyFromHash(location.hash);
    return k && BY_KEY.has(k) ? k : null;
  });

  // 深链还原 + 跟随浏览器前进/后退
  useEffect(() => {
    const onHash = () => {
      const k = keyFromHash(location.hash);
      setOpenKey(k && BY_KEY.has(k) ? k : null);
    };
    window.addEventListener('hashchange', onHash);
    onHash();
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const open = useCallback((key: string) => {
    if (keyFromHash(location.hash) !== key) location.hash = `/gallery/${key}`;
    setOpenKey(key);
  }, []);

  const close = useCallback(() => {
    // 落回锚点而非抹掉 hash: 走 hashchange 让 App 壳同步切回首页视图(抹 hash 它收不到通知)
    if (keyFromHash(location.hash)) location.hash = ANCHOR;
    setOpenKey(null);
  }, []);

  // 详情打开时才拉源码(懒加载 glob), 拉过的进缓存
  const [srcCache, setSrcCache] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!openKey) return;
    const ex = BY_KEY.get(openKey);
    if (!ex || srcCache[ex.file] !== undefined) return;
    const load = SOURCES.get(ex.file);
    if (!load) return;
    let dead = false;
    void load().then((s) => {
      if (!dead) setSrcCache((prev) => (prev[ex.file] === undefined ? { ...prev, [ex.file]: s } : prev));
    });
    return () => {
      dead = true;
    };
    // srcCache 不放进依赖: 缓存命中时上面已早退, 放进来只会多跑一次空 effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKey]);

  const openEx = openKey ? BY_KEY.get(openKey) : undefined;

  return (
    <div className="gal-root">
      <header className="gal-head">
        <h2>图库 · examples</h2>
        <p className="gal-sub">
          {DATA.examples.length} 张产物 · 点卡片看大图与源码 · 直链 <code>#/gallery/&lt;key&gt;</code>
        </p>
      </header>

      {Object.entries(DATA.groups).map(([g, label]) => {
        const items = DATA.examples.filter((e) => e.group === g);
        if (!items.length) return null;
        const [name, ...rest] = label.split('——');
        const tail = rest.join('——').trim();
        return (
          <section key={g} className="gal-sec">
            <h3 className="gal-sec-title">
              <span className="gal-sec-name">{name.trim()}</span>
              <span className="gal-sec-tag">{g}</span>
              <span className="gal-sec-sub">{tail}</span>
              <span className="gal-count">{items.length}</span>
            </h3>
            <div className="gal-grid">
              {items.map((e) => (
                <ExampleCard key={e.key} ex={e} onOpen={open} />
              ))}
            </div>
          </section>
        );
      })}

      {openEx && <ExampleDetail ex={openEx} source={srcCache[openEx.file]} onClose={close} />}
    </div>
  );
}

export default Gallery;
