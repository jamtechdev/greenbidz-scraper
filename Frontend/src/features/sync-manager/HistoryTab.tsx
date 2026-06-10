import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { History, Loader2, X, RefreshCw, UploadCloud, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { ErrorState, TableSkeleton, EmptyState } from '@/components/ui/states';
import {
  useSyncRuns,
  useActiveSyncRuns,
  useSyncRun,
  useResyncFailed,
  useCancelSyncRun,
  useProfiles,
} from '@/hooks/useApi';
import { formatNumber, formatDate, formatDuration } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { SyncRunStatus } from '@/types/api';

function statusTone(s: SyncRunStatus): 'yes' | 'no' | 'warn' | 'info' | 'neutral' {
  if (s === 'completed') return 'yes';
  if (s === 'failed') return 'no';
  if (s === 'partial') return 'warn';
  if (s === 'processing') return 'info';
  return 'neutral';
}

const VALID_STATUSES = ['processing', 'completed', 'partial', 'failed', 'cancelled'];

export function HistoryTab() {
  const qc = useQueryClient();
  const profilesQ = useProfiles();
  const [params] = useSearchParams();
  // Honor ?status= from a deep link (e.g. after starting a background sync).
  const initialStatus = VALID_STATUSES.includes(params.get('status') || '') ? (params.get('status') as string) : 'all';
  const [filters, setFilters] = useState({ profile: '', status: initialStatus, order: 'desc', limit: 50 });
  const setF = (k: string, v: string | number) => setFilters((p) => ({ ...p, [k]: v }));

  const runsQ = useSyncRuns(filters);
  const activeQ = useActiveSyncRuns();
  const active = activeQ.data?.active ?? [];

  const [openRun, setOpenRun] = useState<number | null>(null);
  const runDetail = useSyncRun(openRun);
  const resync = useResyncFailed();
  const cancel = useCancelSyncRun();

  // When a running run finishes, refresh the history table.
  const prevActive = useRef(0);
  useEffect(() => {
    if (active.length < prevActive.current) qc.invalidateQueries({ queryKey: ['sync-runs'] });
    prevActive.current = active.length;
  }, [active.length, qc]);

  const runs = runsQ.data?.runs ?? [];
  const profiles = profilesQ.data?.profiles ?? [];

  return (
    <div className="space-y-5">
      {/* Live: runs in progress */}
      {active.length > 0 && (
        <Card className="border-accent/40">
          <div className="flex items-center gap-2 border-b border-line p-4">
            <UploadCloud className="h-4 w-4 animate-pulse text-accent" />
            <span className="text-sm font-semibold text-ink">Running now</span>
            <Badge tone="info">{active.length}</Badge>
          </div>
          <CardBody className="p-0">
            <ul className="divide-y divide-line">
              {active.map((a) => {
                const done = a.success + a.failed;
                const pct = a.total > 0 ? Math.min(100, Math.round((done / a.total) * 100)) : null;
                return (
                  <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium text-ink">Run #{a.runId}</span>
                        <span className="text-muted">{a.siteType}</span>
                        {a.profile && <span className="truncate text-xs text-muted">· {a.profile}</span>}
                      </div>
                      <div className="mt-0.5 text-xs text-muted">
                        {a.success} ok · {a.failed} failed · {done}/{a.total}
                      </div>
                      <div className="mt-2 h-1 w-full overflow-hidden rounded bg-panel2">
                        <div
                          className={cn('h-full rounded bg-accent transition-all', pct == null && 'w-1/3 animate-pulse')}
                          style={pct == null ? undefined : { width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<X className="h-3.5 w-3.5" />}
                      loading={cancel.isPending}
                      onClick={() => cancel.mutate(a.runId)}
                      title="Cancel this run"
                    >
                      Cancel
                    </Button>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      )}

      {/* History */}
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <select className="input h-9 max-w-[200px] text-xs" value={filters.profile} onChange={(e) => setF('profile', e.target.value)}>
            <option value="">All profiles</option>
            {profiles.map((p) => (
              <option key={p.fileName} value={p.fileName}>
                {p.profileName || p.fileName}
              </option>
            ))}
          </select>
          <select className="input h-9 max-w-[160px] text-xs" value={filters.status} onChange={(e) => setF('status', e.target.value)}>
            {['all', 'processing', 'completed', 'partial', 'failed', 'cancelled'].map((s) => (
              <option key={s} value={s}>
                {s === 'all' ? 'All statuses' : s}
              </option>
            ))}
          </select>
          <select className="input h-9 max-w-[140px] text-xs" value={filters.order} onChange={(e) => setF('order', e.target.value)}>
            <option value="desc">Newest first</option>
            <option value="asc">Oldest first</option>
          </select>
          <select className="input h-9 max-w-[120px] text-xs" value={filters.limit} onChange={(e) => setF('limit', Number(e.target.value))}>
            {[25, 50, 100, 200].map((n) => (
              <option key={n} value={n}>
                {n}/page
              </option>
            ))}
          </select>
          <span className="ml-auto text-xs text-muted">{runsQ.data?.total ?? 0} runs</span>
        </div>

        <CardBody className="p-0">
          {runsQ.isLoading ? (
            <TableSkeleton rows={6} cols={8} />
          ) : runsQ.isError ? (
            <ErrorState message={(runsQ.error as Error).message} onRetry={() => runsQ.refetch()} />
          ) : !runs.length ? (
            <EmptyState title="No sync runs yet" hint="Start one from the New Sync tab." icon={<History className="h-5 w-5" />} />
          ) : (
            <Table>
              <THead>
                <TH>When</TH>
                <TH>Profile</TH>
                <TH>Site</TH>
                <TH>Trigger</TH>
                <TH>Total</TH>
                <TH>Success</TH>
                <TH>Failed</TH>
                <TH>Duration</TH>
                <TH>Status</TH>
              </THead>
              <TBody>
                {runs.map((r) => (
                  <TR key={r.id} className="cursor-pointer" onClick={() => setOpenRun(r.id)}>
                    <TD className="whitespace-nowrap text-muted">{formatDate(r.created_at)}</TD>
                    <TD className="max-w-[160px] truncate text-xs text-muted">{r.profile || '—'}</TD>
                    <TD className="text-xs text-muted">{r.site_type}</TD>
                    <TD>
                      <Badge tone="neutral">{r.trigger}</Badge>
                    </TD>
                    <TD>{formatNumber(r.total)}</TD>
                    <TD className="text-emerald-300">{formatNumber(r.success_count)}</TD>
                    <TD className={cn((r.failed_count ?? 0) > 0 && 'text-danger')}>{formatNumber(r.failed_count)}</TD>
                    <TD className="whitespace-nowrap text-muted">{formatDuration(r.duration_seconds)}</TD>
                    <TD>
                      <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      {/* Run detail */}
      <Modal
        open={openRun != null}
        onClose={() => setOpenRun(null)}
        width="max-w-3xl"
        title={openRun != null ? `Sync run #${openRun}` : 'Sync run'}
        footer={
          <>
            {runDetail.data && (runDetail.data.run.failed_count ?? 0) > 0 && (
              <Button
                variant="secondary"
                size="sm"
                icon={<RefreshCw className="h-4 w-4" />}
                loading={resync.isPending}
                onClick={() =>
                  resync.mutate(openRun as number, {
                    onSuccess: (res) => {
                      toast.success(`Resync run #${res.runId} started — ${res.total} product(s).`);
                      setOpenRun(null);
                    },
                    onError: (e) => toast.error((e as Error).message),
                  })
                }
              >
                Resync {runDetail.data.run.failed_count} failed
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setOpenRun(null)}>
              Close
            </Button>
          </>
        }
      >
        {runDetail.isLoading ? (
          <TableSkeleton rows={5} cols={3} />
        ) : runDetail.data ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-4 text-sm">
              <span><b className="text-ink">{runDetail.data.run.total}</b> <span className="text-muted">total</span></span>
              <span className="text-emerald-300">{runDetail.data.run.success_count} success</span>
              <span className={(runDetail.data.run.failed_count ?? 0) > 0 ? 'text-danger' : 'text-muted'}>
                {runDetail.data.run.failed_count} failed
              </span>
              <Badge tone={statusTone(runDetail.data.run.status)}>{runDetail.data.run.status}</Badge>
            </div>
            {runDetail.data.run.error_message && (
              <div className="rounded-lg border border-danger/30 bg-red-900/20 p-2.5 text-xs text-red-300">
                {runDetail.data.run.error_message}
              </div>
            )}
            <div className="max-h-[55vh] overflow-y-auto rounded-lg border border-line">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-panel">
                  <tr className="border-b border-line text-left text-muted">
                    <th className="px-3 py-2 font-semibold">Product</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 font-semibold">Main id / error</th>
                  </tr>
                </thead>
                <tbody>
                  {runDetail.data.items.map((it) => (
                    <tr key={it.id} className="border-b border-line/60 last:border-0">
                      <td className="px-3 py-2">
                        <div className="max-w-[280px] truncate text-ink" title={it.product_title || ''}>
                          {it.product_title || `#${it.product_id}`}
                        </div>
                        {it.product_url && (
                          <a href={it.product_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-sky2 hover:underline">
                            source <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={it.status === 'success' ? 'yes' : it.status === 'failed' ? 'no' : 'neutral'}>
                          {it.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-muted">
                        {it.main_product_id != null ? `#${it.main_product_id}` : it.error || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
