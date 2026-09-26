// 站点顶栏: 项目名 + 三处导航(首页 / 画廊 / GitHub 仓)
// 导航一律走 `#/…` hash 路由 —— GitHub Pages 项目页没有服务端改写, 深链只能是 hash。
const REPO = 'https://github.com/watert/svg-infovis';

const LINKS = [
  { hash: '#/', label: '首页', match: (r: string) => !r.startsWith('#/gallery') },
  { hash: '#/gallery', label: '画廊', match: (r: string) => r.startsWith('#/gallery') },
] as const;

export function SiteHeader({ route, onNavigate }: { route: string; onNavigate: (hash: string) => void }) {
  return (
    <header className="site-header">
      <a
        className="site-brand"
        href="#/"
        onClick={(e) => { e.preventDefault(); onNavigate('#/'); }}
      >
        <span className="site-brand-mark">◲</span>
        <span className="site-brand-name">svg-infovis</span>
        <span className="site-brand-tag">几何内核</span>
      </a>
      <nav className="site-nav" aria-label="主导航">
        {LINKS.map((l) => (
          <a
            key={l.hash}
            href={l.hash}
            className="site-nav-link"
            aria-current={l.match(route) ? 'page' : undefined}
            onClick={(e) => { e.preventDefault(); onNavigate(l.hash); }}
          >
            {l.label}
          </a>
        ))}
        <a className="site-nav-link site-nav-ext" href={REPO} target="_blank" rel="noreferrer">
          GitHub ↗
        </a>
      </nav>
    </header>
  );
}
