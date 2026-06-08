import { useEffect, useState, type RefObject } from 'react';
import { RefreshCw, MousePointer2, Globe, AlertTriangle, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/cn';

const ZOOM_OPTIONS = [1, 0.9, 0.8, 0.67, 0.5];

function isHttpUrl(u: string): boolean {
  try {
    const p = new URL(u);
    return p.protocol === 'http:' || p.protocol === 'https:';
  } catch {
    return false;
  }
}

export function PagePreview({
  iframeRef,
  src,
  loading,
  error,
  armedLabel,
  hoverText,
  url,
  onReload,
  onNavigate,
  onRenderError,
}: {
  iframeRef: RefObject<HTMLIFrameElement>;
  src: string | null;
  loading: boolean;
  error?: string | null;
  armedLabel?: string | null;
  hoverText?: string | null;
  url: string;
  onReload: () => void;
  onNavigate: (url: string) => void;
  onRenderError?: (message: string) => void;
}) {
  // Render the (1920-wide) proxied page scaled down so more of the desktop
  // layout is visible at once. Default 80%.
  const [zoom, setZoom] = useState(0.8);
  // Editable address bar (browser-like). Stays in sync with the loaded URL.
  const [addr, setAddr] = useState(url);
  useEffect(() => setAddr(url), [url]);

  const go = () => {
    const u = addr.trim();
    if (isHttpUrl(u) && u !== url) onNavigate(u);
    else if (u === url) onReload();
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-line bg-panel">
      {/* Browser-chrome toolbar with an editable address bar */}
      <div className="flex items-center gap-2 border-b border-line bg-panel2 px-3 py-2">
        <div className="flex gap-1.5">
          <span className="h-3 w-3 rounded-full bg-danger/70" />
          <span className="h-3 w-3 rounded-full bg-warn/70" />
          <span className="h-3 w-3 rounded-full bg-accent/70" />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-line bg-bg px-2.5 py-1 focus-within:border-sky2">
          <Globe className="h-3.5 w-3.5 shrink-0 text-muted" />
          <input
            className="min-w-0 flex-1 bg-transparent text-xs text-ink outline-none placeholder:text-muted/60"
            value={addr}
            placeholder="https://example.com/listings"
            spellCheck={false}
            onChange={(e) => setAddr(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && go()}
          />
          {addr.trim() && addr.trim() !== url && isHttpUrl(addr.trim()) && (
            <button
              onClick={go}
              title="Load this URL"
              className="rounded p-0.5 text-sky2 hover:bg-line/60"
            >
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <select
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          title="Zoom the rendered page"
          className="rounded-md border border-line bg-bg px-1.5 py-1 text-xs text-muted hover:text-ink"
        >
          {ZOOM_OPTIONS.map((z) => (
            <option key={z} value={z}>
              {Math.round(z * 100)}%
            </option>
          ))}
        </select>
        <button
          onClick={onReload}
          disabled={!src}
          className="rounded-md p-1.5 text-muted transition-colors hover:bg-line/60 hover:text-ink disabled:opacity-40"
          title="Reload"
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
        </button>
      </div>

      {/* Armed banner */}
      {armedLabel && !error && (
        <div className="flex items-center gap-2 border-b border-sky2/30 bg-sky-900/30 px-3 py-1.5 text-xs text-sky-200">
          <MousePointer2 className="h-3.5 w-3.5" />
          Click an element on the page to map it to <b className="font-semibold">{armedLabel}</b>
          {hoverText ? <span className="ml-auto truncate text-sky-300/80">› {hoverText}</span> : null}
        </div>
      )}

      {/* The proxied page (scaled), with skeleton + error overlays */}
      <div className="relative flex-1 overflow-hidden bg-white">
        {!src && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">
            Enter a URL above to begin mapping.
          </div>
        )}

        {src && error && <ErrorOverlay message={error} onRetry={onReload} />}

        {src && !error && loading && <PageSkeleton />}

        {src && (
          <iframe
            ref={iframeRef}
            src={src}
            title="Page preview"
            className={cn('border-0', error && 'invisible')}
            style={{
              width: `${100 / zoom}%`,
              height: `${100 / zoom}%`,
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
            }}
            sandbox="allow-same-origin allow-scripts"
            onLoad={() => {
              // The backend returns an HTML error page (502) when a site can't be
              // rendered — detect it (same-origin) and surface a clean error fast.
              try {
                const doc = iframeRef.current?.contentDocument;
                const txt = doc?.body?.innerText || '';
                if (/Could not render this page|Invalid or missing/i.test(txt)) {
                  onRenderError?.(
                    'This page couldn’t be rendered — the site may be blocking automated access or is too slow.',
                  );
                }
              } catch {
                /* cross-origin / not ready — ignore */
              }
            }}
          />
        )}
      </div>
    </div>
  );
}

/** Animated skeleton mimicking a product/listing page while Puppeteer renders. */
function PageSkeleton() {
  return (
    <div className="absolute inset-0 z-10 overflow-hidden bg-bg p-5">
      <div className="mb-3 flex items-center gap-3">
        <div className="skeleton h-8 w-32" />
        <div className="skeleton h-8 flex-1" />
        <div className="skeleton h-8 w-20" />
      </div>
      <div className="skeleton mb-4 h-40 w-full" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="skeleton aspect-square w-full" />
            <div className="skeleton h-3 w-3/4" />
            <div className="skeleton h-3 w-1/2" />
          </div>
        ))}
      </div>
      <div className="absolute inset-x-0 bottom-4 flex items-center justify-center gap-2 text-xs text-muted">
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        Rendering page preview...
      </div>
    </div>
  );
}

function ErrorOverlay({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-bg px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-900/30 text-danger">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <div className="text-sm font-semibold text-ink">Couldn’t render this page</div>
      <p className="max-w-md text-xs text-muted">{message}</p>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel2 px-3 py-1.5 text-xs font-semibold text-ink hover:bg-line/60"
      >
        <RefreshCw className="h-3.5 w-3.5" /> Retry
      </button>
    </div>
  );
}
