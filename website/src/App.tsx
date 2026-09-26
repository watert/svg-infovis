// 应用壳: 站点骨架 + hash 路由
//
// 分工(App 只管"滚到哪 / 高亮谁", 画廊内部一概不碰):
//   · `#/` / 空 hash    → 首页(hero 现场渲染 + 项目介绍 + 画廊区), 回到页顶
//   · `#/gallery`       → 首页上的画廊**锚点**: 滚到画廊区(纯 `#gallery` 也认)
//   · `#/gallery/<key>` → 详情深链 —— 由 Gallery 自己认(它内部有 hashchange 监听), App 一个字符都不解析
//
// ⚠ Home 常驻、Gallery 常挂, 不按 hash 决定"首页渲不渲染": 详情是固定定位的遮罩, 藏掉首页只会
// 在关闭时凭空多一次重排。组件树不动, 视图切换全发生在 Gallery 里 —— 关详情它把 hash 落回
// `#/gallery`(见其 close()), 这里接住并滚到画廊区。
import { useEffect, useState } from 'react';
import { Gallery } from './components/Gallery';
import { Home } from './components/Home';
import { SiteFooter } from './components/SiteFooter';
import { SiteHeader } from './components/SiteHeader';

/** 画廊锚点的两种写法(`#/gallery` 是路由写法, `#gallery` 是普通锚点写法) */
const GALLERY = '#/gallery';
const GALLERY_ANCHORS = [GALLERY, '#gallery'];

const readHash = (): string => (typeof location === 'undefined' ? '' : location.hash);

export function App() {
  const [route, setRoute] = useState(readHash);

  useEffect(() => {
    const onHash = () => setRoute(readHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  /** 同一 hash 再点一次不触发 hashchange —— 导航回调自己补滚动 */
  const scrollFor = (hash: string) => {
    if (hash.startsWith(`${GALLERY}/`)) return; // 详情由 Gallery 的遮罩负责滚/锁, 这里别插手
    const el = GALLERY_ANCHORS.includes(hash) ? document.getElementById('gallery') : null;
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else window.scrollTo({ top: 0 });
  };

  useEffect(() => {
    scrollFor(route);
  }, [route]);

  const navigate = (hash: string) => {
    if (location.hash === hash) scrollFor(hash);
    else location.hash = hash;
  };

  return (
    <div className="site">
      <SiteHeader route={route} onNavigate={navigate} />
      <main className="site-main">
        <Home />
        <section className="site-gallery" id="gallery">
          <Gallery />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
