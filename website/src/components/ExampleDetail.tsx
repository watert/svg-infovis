// =====================================================================
// ExampleDetail · 详情模态(自实现, 不引组件库)
//
// 大图两档缩放(适应宽度 / 原始尺寸) + 复现命令(点击复制) + 指纹 + 源码面板。
// Esc 与点遮罩关闭; 打开期间锁背景滚动。
// =====================================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExampleEntry } from './Gallery';
import { InlineSvg, svgUrl } from './ExampleCard';

/** 复现命令: 出图入口就是 `bun run <file> [arg]` */
export const reproCmd = (ex: ExampleEntry): string => `bun run ${ex.file}${ex.arg ? ` ${ex.arg}` : ''}`;

export function ExampleDetail({
  ex,
  source,
  onClose,
}: {
  ex: ExampleEntry;
  source?: string;
  onClose: () => void;
}) {
  const [zoom, setZoom] = useState<'fit' | 'full'>('fit');
  const [copied, setCopied] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  // 换示例时回到适应宽度
  useEffect(() => setZoom('fit'), [ex.key]);

  const copy = useCallback(async () => {
    const cmd = reproCmd(ex);
    try {
      await navigator.clipboard.writeText(cmd);
    } catch {
      // 非 https / 无剪贴板权限时退化为选中复制
      const ta = document.createElement('textarea');
      ta.value = cmd;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }, [ex]);

  return (
    <div
      className="gal-modal"
      role="dialog"
      aria-modal="true"
      aria-label={`示例 ${ex.key}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="gal-detail" ref={panelRef} tabIndex={-1}>
        <header className="gal-detail-head">
          <span className="gal-detail-title">
            <code className="gal-key">{ex.key}</code>
            <span className="gal-badge gal-badge-plain">{ex.group}</span>
            {ex.draft && <span className="gal-badge gal-badge-draft">草稿</span>}
            {ex.exitCode !== 0 && <span className="gal-badge gal-badge-fail">门禁未过</span>}
          </span>
          <button type="button" className="gal-x" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </header>

        <p className="gal-what gal-what-full">{ex.what}</p>

        <div className={`gal-fig ${zoom === 'fit' ? 'is-fit' : 'is-full'}`}>
          <InlineSvg url={svgUrl(ex)} className="gal-svg" />
        </div>

        <div className="gal-tools">
          <div className="gal-zoom" role="group" aria-label="缩放">
            <button
              type="button"
              className="gal-btn"
              aria-pressed={zoom === 'fit'}
              onClick={() => setZoom('fit')}
            >
              适应宽度
            </button>
            <button
              type="button"
              className="gal-btn"
              aria-pressed={zoom === 'full'}
              onClick={() => setZoom('full')}
            >
              原始尺寸
            </button>
          </div>
          <div className="gal-cmd">
            <code>{reproCmd(ex)}</code>
            <button type="button" className="gal-btn gal-btn-accent" onClick={copy}>
              {copied ? '已复制' : '复制'}
            </button>
          </div>
        </div>

        <dl className="gal-meta">
          <div>
            <dt>sha256</dt>
            <dd>
              <code>{ex.sha256}</code>
            </dd>
          </div>
          <div>
            <dt>bytes</dt>
            <dd>{(ex.bytes ?? 0).toLocaleString('en-US')}</dd>
          </div>
          <div>
            <dt>出口</dt>
            <dd>{ex.exitCode === 0 ? 'exit 0' : `exit ${ex.exitCode}`}</dd>
          </div>
          <div>
            <dt>源文件</dt>
            <dd>
              <code>{ex.file}</code>
            </dd>
          </div>
        </dl>

        <section className="gal-src">
          <h4>
            源码 <code>{ex.file}</code>
          </h4>
          <pre>
            <code>{source ?? '// 加载中…'}</code>
          </pre>
        </section>
      </div>
    </div>
  );
}
