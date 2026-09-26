// =====================================================================
// ExampleCard · 单张产物卡: 内联 SVG 缩略(定高浅色衬底) + key / what + 徽标行
//
// SVG 文本按 URL 缓存一次(详情大图复用同一份), 缺产物时给占位 —— dev server 对未知
// 路径会回落 index.html, 所以只认载荷里真含 `<svg>` 的响应。
// =====================================================================
import { useEffect, useState } from 'react';
import type { ExampleEntry } from './Gallery';

/** 产物 URL: 站点 base + examples.json 的 svg 字段 */
export const svgUrl = (ex: ExampleEntry): string => import.meta.env.BASE_URL + ex.svg;

const svgTexts = new Map<string, Promise<string | null>>();

function loadSvgText(url: string): Promise<string | null> {
  let p = svgTexts.get(url);
  if (!p) {
    p = fetch(url)
      .then(async (r) => {
        const t = r.ok ? await r.text() : '';
        return t.includes('<svg') ? t : null;
      })
      .catch(() => null);
    svgTexts.set(url, p);
  }
  return p;
}

/** 内联渲染一份产物 SVG; text === undefined 为加载中, null 为缺产物 */
export function InlineSvg({ url, className }: { url: string; className?: string }) {
  const [text, setText] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    void loadSvgText(url).then((t) => {
      if (live) setText(t);
    });
    return () => {
      live = false;
    };
  }, [url]);

  if (text === undefined) return <div className={`${className ?? ''} gal-svg-load`} />;
  if (text === null) return <div className={`${className ?? ''} gal-svg-miss`}>产物未就绪</div>;
  // 产物是自家管线构建的, 不经 sanitizer
  return <div className={className} dangerouslySetInnerHTML={{ __html: text }} />;
}

export function ExampleCard({ ex, onOpen }: { ex: ExampleEntry; onOpen: (key: string) => void }) {
  return (
    <button type="button" className="gal-card" onClick={() => onOpen(ex.key)} title={ex.what}>
      <span className="gal-card-fig">
        <InlineSvg url={svgUrl(ex)} className="gal-svg" />
      </span>
      <span className="gal-card-meta">
        <span className="gal-card-row">
          <code className="gal-key">{ex.key}</code>
          {ex.draft && <span className="gal-badge gal-badge-draft">草稿</span>}
          {ex.exitCode !== 0 && <span className="gal-badge gal-badge-fail">门禁未过</span>}
        </span>
        <span className="gal-what">{ex.what}</span>
      </span>
    </button>
  );
}
