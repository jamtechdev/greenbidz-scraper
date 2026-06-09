import { useMemo } from 'react';
import type { CrawlRun } from '@/types/api';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';

/**
 * Lightweight dependency-free chart of recent crawl runs.
 * Each bar = products found (already-seen base + new on top); a slim inner bar
 * shows how many were scraped that run; a red foot marks runs with failures.
 */
export function CrawlVolumeChart({ runs }: { runs: CrawlRun[] }) {
  const data = useMemo(() => {
    // Oldest → newest, last 20 runs.
    const recent = [...runs].slice(0, 20).reverse();
    const max = Math.max(1, ...recent.map((r) => r.products_found ?? 0));
    // "Nice" rounded ceiling for the axis so gridlines read cleanly.
    const niceMax = niceCeil(max);
    return { recent, max: niceMax };
  }, [runs]);

  if (!data.recent.length) {
    return (
      <div className="flex h-44 items-center justify-center text-sm text-muted">
        No crawl runs recorded yet.
      </div>
    );
  }

  const gridLines = [1, 0.75, 0.5, 0.25, 0]; // top → bottom

  return (
    <div>
      <div className="flex gap-2">
        {/* Y axis labels */}
        <div className="flex h-44 w-9 flex-col justify-between py-0.5 text-right text-[9px] tabular-nums text-muted/60">
          {gridLines.map((g) => (
            <span key={g}>{formatNumber(Math.round(data.max * g))}</span>
          ))}
        </div>

        {/* Plot area */}
        <div className="relative h-44 flex-1">
          {/* Gridlines */}
          <div className="absolute inset-0 flex flex-col justify-between">
            {gridLines.map((g) => (
              <div key={g} className="border-t border-line/40" />
            ))}
          </div>

          {/* Bars */}
          <div className="absolute inset-0 flex items-end justify-between gap-1.5">
            {data.recent.map((r) => {
              const found = r.products_found ?? 0;
              const fresh = r.new_products ?? 0;
              const scraped = r.scraped_products ?? 0;
              const failed = (r.failed_products ?? 0) > 0;
              const foundPct = (found / data.max) * 100;
              const seenPct = found ? ((found - fresh) / found) * 100 : 0; // already-seen share of the bar
              const scrapedPct = Math.min(100, (scraped / data.max) * 100);
              return (
                <div key={r.id} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end">
                  {/* Hover value label */}
                  <div className="pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-line bg-bg px-2 py-1 text-[10px] leading-tight text-ink opacity-0 shadow-card transition-opacity group-hover:opacity-100">
                    <div><span className="text-muted">found</span> {formatNumber(found)}</div>
                    <div><span className="text-accent">new</span> {formatNumber(fresh)} · <span className="text-sky2">scraped</span> {formatNumber(scraped)}</div>
                    {failed && <div className="text-danger">{r.failed_products} failed</div>}
                  </div>

                  {/* Found bar: already-seen base + new (green) on top */}
                  <div
                    className="flex w-full max-w-[54px] flex-col justify-end self-center overflow-hidden rounded-t bg-panel2/80 transition-colors group-hover:bg-panel2"
                    style={{ height: `${Math.max(foundPct, 2)}%` }}
                  >
                    {/* already-seen spacer */}
                    <div style={{ height: `${seenPct}%` }} />
                    {/* new products */}
                    <div
                      className="w-full shrink-0 bg-accent/85"
                      style={{ height: `${found > 0 && fresh > 0 ? Math.max(100 - seenPct, 5) : 0}%` }}
                    />
                  </div>

                  {/* Scraped this run — slim inner bar, distinct color */}
                  {scraped > 0 && (
                    <span
                      className="pointer-events-none absolute bottom-0 left-1/2 z-[1] w-10 -translate-x-1/2 rounded-t bg-sky-400 group-hover:bg-sky-300"
                      style={{ height: `${Math.max(scrapedPct, 2)}%` }}
                    />
                  )}

                  {/* Failure foot */}
                  {failed && <span className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-[3px] rounded bg-danger" />}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 pl-11 text-[11px] text-muted">
        <Legend className="bg-accent/85" label="New products" />
        <Legend className="bg-panel2" label="Already seen" />
        <Legend className="bg-sky-400" label="Scraped" />
        <Legend className="bg-danger" label="Had failures" />
      </div>
    </div>
  );
}

/** Round a max up to a clean axis ceiling (e.g. 828 → 1000, 42 → 50). */
function niceCeil(n: number): number {
  if (n <= 5) return 5;
  const pow = 10 ** Math.floor(Math.log10(n));
  const steps = [1, 2, 2.5, 5, 10];
  for (const s of steps) {
    const candidate = s * pow;
    if (candidate >= n) return candidate;
  }
  return 10 * pow;
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('inline-block h-2.5 w-2.5 rounded-sm', className)} />
      {label}
    </span>
  );
}
