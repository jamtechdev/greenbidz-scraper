import { type RefObject } from 'react';
import { Loader2, RefreshCw, MousePointer2, Globe } from 'lucide-react';
import { cn } from '@/lib/cn';

export function PagePreview({
  iframeRef,
  src,
  loading,
  armedLabel,
  hoverText,
  onReload,
}: {
  iframeRef: RefObject<HTMLIFrameElement>;
  src: string | null;
  loading: boolean;
  armedLabel?: string | null;
  hoverText?: string | null;
  onReload: () => void;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-line bg-panel">
      {/* Browser-chrome toolbar */}
      <div className="flex items-center gap-2 border-b border-line bg-panel2 px-3 py-2">
        <div className="flex gap-1.5">
          <span className="h-3 w-3 rounded-full bg-danger/70" />
          <span className="h-3 w-3 rounded-full bg-warn/70" />
          <span className="h-3 w-3 rounded-full bg-accent/70" />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-line bg-bg px-2.5 py-1 text-xs text-muted">
          <Globe className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{src ? decodeURIComponent(src.replace('/api/proxy-page?url=', '')) : 'No page loaded'}</span>
        </div>
        <button
          onClick={onReload}
          disabled={!src}
          className="rounded-md p-1.5 text-muted transition-colors hover:bg-line/60 hover:text-ink disabled:opacity-40"
          title="Reload snapshot"
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
        </button>
      </div>

      {/* Armed banner */}
      {armedLabel && (
        <div className="flex items-center gap-2 border-b border-sky2/30 bg-sky-900/30 px-3 py-1.5 text-xs text-sky-200">
          <MousePointer2 className="h-3.5 w-3.5" />
          Click an element on the page to map it to <b className="font-semibold">{armedLabel}</b>
          {hoverText ? <span className="ml-auto truncate text-sky-300/80">› {hoverText}</span> : null}
        </div>
      )}

      {/* The proxied page */}
      <div className="relative flex-1 bg-white">
        {!src && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">
            Load a page to begin mapping.
          </div>
        )}
        {src && loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-bg/80 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Rendering page (Puppeteer)…
          </div>
        )}
        {src && (
          <iframe
            ref={iframeRef}
            src={src}
            title="Page preview"
            className="h-full w-full border-0"
            sandbox="allow-same-origin allow-scripts"
          />
        )}
      </div>
    </div>
  );
}
