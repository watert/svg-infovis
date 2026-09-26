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

/**
 * 实例级 id 命名空间: 同一张 SVG 内联两次(卡片 + 详情)时, href="#id" / begin="id.end" /
 * url(#id) 一律命中文档里**第一个** id —— 详情那份的动画会落到卡片那张上(详情看着不动)。
 * 详情实例把全部 id 与引用加上前缀, 两份各动各的。
 * 覆盖四类引用: `id="X"` 定义、`#X`(href/锚)、`url(#X)`(fill/clip)、`X.end|X.begin`(SMIL 同步基)。
 * 只服务自家管线产物(id 是 \w+ 加连字符), 不做通用 XML 改写。
 */
export function prefixSvgIds(svg: string, prefix: string): string {
  const ids = [...new Set([...svg.matchAll(/ id="([\w-]+)"/g)].map((m) => m[1]))];
  let out = svg;
  for (const id of ids) {
    const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out
      .replace(new RegExp(` id="${esc}"`, 'g'), ` id="${prefix}${id}"`)
      .replace(new RegExp(`#${esc}(?=[)"'.\\s])`, 'g'), `#${prefix}${id}`)
      .replace(new RegExp(`(["\\s])${esc}(\\.(?:end|begin))`, 'g'), `$1${prefix}${id}$2`);
  }
  return out;
}

/** 内联渲染一份产物 SVG; text === undefined 为加载中, null 为缺产物; idPrefix 见 prefixSvgIds */
export function InlineSvg({ url, className, idPrefix }: { url: string; className?: string; idPrefix?: string }) {
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
  return <div className={className} dangerouslySetInnerHTML={{ __html: idPrefix ? prefixSvgIds(text, idPrefix) : text }} />;
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
