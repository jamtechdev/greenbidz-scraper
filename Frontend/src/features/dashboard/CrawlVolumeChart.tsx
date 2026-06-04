import { useMemo } from 'react';
import type { CrawlRun } from '@/types/api';
import { cn } from '@/lib/cn';

/**
 * Lightweight dependency-free bar chart of recent crawl runs.
 * Shows products found (track) with new products highlighted on top.
 */
export function CrawlVolumeChart({ runs }: { runs: CrawlRun[] }) {
  const data = useMemo(() => {
    // Oldest → newest, last 20 runs.
    const recent = [...runs].slice(0, 20).reverse();
    const max = Math.max(1, ...recent.map((r) => r.products_found ?? 0));
    return { recent, max };
  }, [runs]);

  if (!data.recent.length) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted">
        No crawl runs recorded yet.
      </div>
    );
  }

  return (
    <div>
      <div className="flex h-40 items-end gap-1.5">
        {data.recent.map((r) => {
          const found = r.products_found ?? 0;
          const fresh = r.new_products ?? 0;
          const failed = (r.failed_products ?? 0) > 0;
          const foundPct = (found / data.max) * 100;
          const freshPct = found ? (fresh / found) * 100 : 0;
          return (
            <div
              key={r.id}
              className="group relative flex flex-1 flex-col justify-end"
              title={`${found} found · ${fresh} new${failed ? ` · ${r.failed_products} failed` : ''}`}
            >
              <div
                className="w-full overflow-hidden rounded-t bg-panel2 transition-colors group-hover:bg-line"
                style={{ height: `${Math.max(foundPct, 3)}%` }}
              >
                <div
                  className={cn(
                    'w-full',
                    failed ? 'bg-warn/70' : 'bg-accent/70',
                  )}
                  style={{ height: `${100 - freshPct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-4 text-[11px] text-muted">
        <Legend className="bg-accent/70" label="New products" />
        <Legend className="bg-panel2" label="Already seen" />
        <Legend className="bg-warn/70" label="Had failures" />
      </div>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('inline-block h-2.5 w-2.5 rounded-sm', className)} />
      {label}
    </span>
  );
}
