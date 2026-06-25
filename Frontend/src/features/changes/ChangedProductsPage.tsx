import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  RefreshCw,
  UploadCloud,
  ExternalLink,
  GitCompareArrows,
  Loader2,
  Power,
  Zap,
  DatabaseZap,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { ErrorState, TableSkeleton, EmptyState } from '@/components/ui/states';
import { RelTime } from '@/components/ui/RelTime';
import { formatPrice } from '@/lib/format';
import { api } from '@/lib/api';

/**
 * Change-detection review screen. Lists already-synced products whose source
 * content (title/price/description) changed since we last synced — derived from
 * content_hash <> synced_hash. Lets the user trigger a refresh pass (re-scrape
 * synced products to detect changes) and re-sync the changed ones to the main
 * site (updates the existing listing via the main-site PATCH path).
 */
export function ChangedProductsPage() {
  const qc = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const changes = useQuery({
    queryKey: ['changes'],
    queryFn: () => api.getChanges(200),
    refetchInterval: 15000, // surface newly-detected changes while a refresh runs
  });

  const rows = changes.data?.products ?? [];
  const count = changes.data?.count ?? 0;

  const refresh = useMutation({
    mutationFn: () => api.refreshChanges(100),
    onSuccess: (r) => {
      toast.success(
        r.count > 0
          ? `Refresh started — re-checking ${r.count} synced product(s). Changes will appear here.`
          : 'No synced products to re-check yet.',
      );
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const resync = useMutation({
    mutationFn: (ids?: number[]) => api.resyncChanges(ids),
    onSuccess: (r) => {
      if (r.started > 0) {
        const n = r.runs.reduce((a, run) => a + run.count, 0);
        toast.success(`Re-sync started for ${n} product(s) across ${r.started} run(s).`);
      } else {
        toast(r.skipped?.length ? 'Nothing re-synced (unknown marketplace/seller).' : 'Nothing to re-sync.');
      }
      setSelectedIds(new Set());
      // Give the background job a moment, then refresh the list.
      setTimeout(() => qc.invalidateQueries({ queryKey: ['changes'] }), 1500);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const toggleId = (id: number) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allSelected = rows.length > 0 && rows.every((p) => selectedIds.has(p.id));

  const resyncSelected = () => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    if (!window.confirm(`Re-sync ${ids.length} product(s) to the main site? This updates the live listings.`)) return;
    resync.mutate(ids);
  };
  const resyncAll = () => {
    if (!rows.length) return;
    if (!window.confirm(`Re-sync ALL ${count} changed product(s) to the main site? This updates the live listings.`)) return;
    resync.mutate(undefined);
  };

  return (
    <>
      <PageHeader
        title="Changed Products"
        description="Synced products whose source changed (price/title/description) since last sync. Re-sync to update the live main-site listing."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              icon={refresh.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              onClick={() => refresh.mutate()}
              disabled={refresh.isPending}
              title="Re-scrape synced products to detect source changes"
            >
              Refresh & detect
            </Button>
            <Button
              icon={<UploadCloud className="h-4 w-4" />}
              onClick={selectedIds.size ? resyncSelected : resyncAll}
              disabled={resync.isPending || rows.length === 0}
              title="Re-sync changed products to the main site"
            >
              {resync.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : selectedIds.size ? (
                `Re-sync selected (${selectedIds.size})`
              ) : (
                'Re-sync all'
              )}
            </Button>
          </div>
        }
      />

      <AutoDetectCard />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4 text-xs text-muted">
          <GitCompareArrows className="h-4 w-4 text-accent" />
          <span>
            <b className="text-ink">{count}</b> product(s) changed at the source since last sync.
          </span>
          {changes.isFetching && <span className="opacity-60">updating…</span>}
        </div>

        <CardBody className="p-0">
          {changes.isLoading ? (
            <TableSkeleton rows={6} cols={6} />
          ) : changes.isError ? (
            <ErrorState message={(changes.error as Error).message} onRetry={() => changes.refetch()} />
          ) : !rows.length ? (
            <EmptyState
              title="No changes detected"
              hint="When a synced product’s source price/title/description changes, it appears here. Run “Refresh & detect” to re-check synced products now."
              icon={<GitCompareArrows className="h-5 w-5" />}
              action={
                <Button
                  variant="secondary"
                  icon={<RefreshCw className="h-4 w-4" />}
                  onClick={() => refresh.mutate()}
                  disabled={refresh.isPending}
                >
                  Refresh & detect
                </Button>
              }
            />
          ) : (
            <Table>
              <THead>
                <TH className="w-10">
                  <input
                    type="checkbox"
                    className="h-4 w-4 cursor-pointer accent-accent"
                    title="Select all"
                    checked={allSelected}
                    onChange={(e) =>
                      setSelectedIds(() => {
                        if (!e.target.checked) return new Set();
                        return new Set(rows.map((p) => p.id));
                      })
                    }
                  />
                </TH>
                <TH>Title</TH>
                <TH>Price</TH>
                <TH>Profile</TH>
                <TH>Main site</TH>
                <TH>Last synced</TH>
              </THead>
              <TBody>
                {rows.map((p) => (
                  <TR key={p.id}>
                    <TD>
                      <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer accent-accent"
                        checked={selectedIds.has(p.id)}
                        onChange={() => toggleId(p.id)}
                      />
                    </TD>
                    <TD className="max-w-[340px]">
                      <div className="truncate font-medium text-ink">
                        {p.title || <span className="text-muted">Untitled</span>}
                      </div>
                      <a
                        href={p.product_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 truncate text-xs text-sky2 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                        title="Open the source product page"
                      >
                        source <ExternalLink className="h-3 w-3" />
                      </a>
                    </TD>
                    <TD className="whitespace-nowrap">{formatPrice(p.price)}</TD>
                    <TD className="max-w-[140px] truncate text-xs text-muted">{p.profile_file_name || '—'}</TD>
                    <TD className="whitespace-nowrap text-xs">
                      <div className="flex items-center gap-2">
                        <Badge tone="warn">#{p.main_product_id ?? '—'}</Badge>
                        {p.main_product_url && (
                          <a
                            href={p.main_product_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-sky2 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                            title="Open the listing on the main site"
                          >
                            open <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </TD>
                    <TD className="whitespace-nowrap text-xs text-muted">
                      <RelTime iso={p.synced_at ?? p.scraped_at} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>
    </>
  );
}

/** Settings for the recurring change-detection (refresh) scheduler + baseline. */
function AutoDetectCard() {
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ['refresh-scheduler'],
    queryFn: () => api.getRefreshScheduler(),
    refetchInterval: 10000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['refresh-scheduler'] });

  const toggle = useMutation({
    mutationFn: (run: boolean) => (run ? api.resumeRefreshScheduler() : api.pauseRefreshScheduler()),
    onSuccess: invalidate,
    onError: (e) => toast.error((e as Error).message),
  });
  const setConfig = useMutation({
    mutationFn: (patch: Partial<{ intervalHours: number; batchSize: number; autoResync: boolean }>) =>
      api.setRefreshScheduler(patch),
    onSuccess: invalidate,
    onError: (e) => toast.error((e as Error).message),
  });
  const runNow = useMutation({
    mutationFn: () => api.runRefreshSchedulerNow(),
    onSuccess: (r) => toast[r.started ? 'success' : 'error'](r.started ? 'Detection pass started.' : r.reason || 'Busy.'),
    onError: (e) => toast.error((e as Error).message),
  });
  const baseline = useMutation({
    mutationFn: () => api.baselineChanges(),
    onSuccess: (r) => toast.success(`Baselined ${r.updated} synced product(s).`),
    onError: (e) => toast.error((e as Error).message),
  });

  const s = status.data;
  const cfg = s?.config;

  return (
    <div className="mb-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-accent" />
            <span className="text-sm font-semibold text-ink">Auto-detect changes</span>
            {s && (
              <Badge tone={s.running ? 'yes' : 'neutral'}>{s.running ? 'On' : 'Paused'}</Badge>
            )}
            {s?.busy && <span className="text-xs text-muted">running…</span>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<Power className="h-3.5 w-3.5" />}
              onClick={() => toggle.mutate(!s?.running)}
              disabled={toggle.isPending || !s}
            >
              {s?.running ? 'Pause' : 'Enable'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={runNow.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              onClick={() => runNow.mutate()}
              disabled={runNow.isPending}
            >
              Run now
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={baseline.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DatabaseZap className="h-3.5 w-3.5" />}
              onClick={() => {
                if (window.confirm('Baseline already-synced products? Sets their current scraped content as the synced reference (only correct if the main site currently matches the source).')) baseline.mutate();
              }}
              disabled={baseline.isPending}
              title="Let pre-existing synced products participate in change detection"
            >
              Baseline existing
            </Button>
          </div>
        </div>

        {cfg && (
          <div className="flex flex-wrap items-center gap-5 border-t border-line p-4 text-xs">
            <label className="flex items-center gap-2">
              <span className="text-muted">Every</span>
              <select
                className="input h-8 w-24"
                value={cfg.intervalHours}
                onChange={(e) => setConfig.mutate({ intervalHours: Number(e.target.value) })}
              >
                {[6, 12, 24, 48, 168].map((h) => (
                  <option key={h} value={h}>
                    {h >= 168 ? '7 days' : `${h}h`}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span className="text-muted">Batch</span>
              <input
                type="number"
                className="input h-8 w-20"
                defaultValue={cfg.batchSize}
                min={1}
                max={1000}
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  if (v && v !== cfg.batchSize) setConfig.mutate({ batchSize: v });
                }}
              />
              <span className="text-muted">products/pass</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 accent-accent"
                checked={cfg.autoResync}
                onChange={(e) => setConfig.mutate({ autoResync: e.target.checked })}
              />
              <span className="text-ink">Auto re-sync detected changes</span>
              <span className="text-muted">(push to main site without review)</span>
            </label>
            {s?.lastSummary && (
              <span className="ml-auto text-muted">
                Last: {s.lastSummary.refreshed} re-scraped, {s.lastSummary.resyncRuns} resync run(s)
              </span>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
