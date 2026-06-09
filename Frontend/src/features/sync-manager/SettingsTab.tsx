import { useEffect, useState } from 'react';
import { CalendarClock, Play, Pause, Power, Loader2, Plus, Trash2, Clock, CheckCircle2, PauseCircle, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { LoadingState, ErrorState } from '@/components/ui/states';
import { useSyncScheduler, useSyncSchedulerActions, useSyncMeta, useProfiles, useSyncSellers } from '@/hooks/useApi';
import { formatNumber, formatDate, timeAgo, timeUntil } from '@/lib/format';
import type { SyncSchedulerConfig, SyncSchedulerTarget, SyncMarketplace, SyncTargetRun } from '@/types/api';

const INTERVALS = [
  { label: '1 hour', value: 1 },
  { label: '2 hours', value: 2 },
  { label: '5 hours', value: 5 },
  { label: '10 hours', value: 10 },
  { label: '1 day', value: 24 },
  { label: '5 days', value: 120 },
];

const EMPTY_TARGET: SyncSchedulerTarget = {
  marketplace: '',
  sellerId: 0,
  sellerName: '',
  country: 'Taiwan',
  intervalHours: 2,
  filters: { profile: '', onlyUnsynced: true, latestOnly: true, limit: 50 },
};

type ProfileLite = { fileName: string; profileName?: string };

export function SettingsTab() {
  const statusQ = useSyncScheduler();
  const { runNow, pause, resume, saveConfig } = useSyncSchedulerActions();
  const meta = useSyncMeta();
  const profilesQ = useProfiles();

  const [cfg, setCfg] = useState<SyncSchedulerConfig | null>(null);
  useEffect(() => {
    if (statusQ.data && cfg === null) setCfg(statusQ.data.config);
  }, [statusQ.data, cfg]);

  if (statusQ.isLoading) return <LoadingState label="Loading scheduler…" />;
  if (statusQ.isError) return <ErrorState message={(statusQ.error as Error).message} onRetry={() => statusQ.refetch()} />;

  const s = statusQ.data!;
  const marketplaces = meta.data?.marketplaces ?? [];
  const profiles = profilesQ.data?.profiles ?? [];

  const state = s.busy
    ? { label: 'Running now', tone: 'info' as const, icon: <Loader2 className="h-4 w-4 animate-spin" /> }
    : s.paused
      ? { label: 'Paused', tone: 'warn' as const, icon: <PauseCircle className="h-4 w-4" /> }
      : { label: 'Active', tone: 'yes' as const, icon: <CheckCircle2 className="h-4 w-4" /> };

  const targets = cfg?.targets ?? [];
  const setTarget = (i: number, patch: Partial<SyncSchedulerTarget>) =>
    setCfg((c) => (c ? { ...c, targets: c.targets.map((t, idx) => (idx === i ? { ...t, ...patch } : t)) } : c));
  const setTargetFilter = (i: number, patch: Record<string, unknown>) =>
    setTarget(i, { filters: { ...(targets[i].filters || {}), ...patch } });
  const removeTarget = (i: number) =>
    setCfg((c) => (c ? { ...c, targets: c.targets.filter((_, idx) => idx !== i) } : c));

  const onSave = () => {
    if (!cfg) return;
    saveConfig.mutate(cfg, {
      onSuccess: () => toast.success('Scheduler settings saved'),
      onError: (e) => toast.error((e as Error).message),
    });
  };

  return (
    <div className="space-y-5">
      {/* Status */}
      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/15 text-accent">
                <CalendarClock className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-ink">Auto-sync scheduler</span>
                  <Badge tone={state.tone}>
                    <span className="mr-1 inline-flex align-middle">{state.icon}</span>
                    {state.label}
                  </Badge>
                </div>
                <div className="text-xs text-muted">
                  Per-target intervals · checks hourly
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" icon={<Play className="h-3.5 w-3.5" />} loading={runNow.isPending} disabled={s.busy} onClick={() => runNow.mutate()}>
                Run now
              </Button>
              {s.paused ? (
                <Button size="sm" icon={<Power className="h-3.5 w-3.5" />} loading={resume.isPending} onClick={() => resume.mutate()}>
                  Resume
                </Button>
              ) : (
                <Button variant="secondary" size="sm" icon={<Pause className="h-3.5 w-3.5" />} loading={pause.isPending} onClick={() => pause.mutate()}>
                  Pause
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Fact icon={<Clock className="h-4 w-4" />} label="Next run" value={s.paused ? 'Paused' : s.nextRunAt ? timeUntil(s.nextRunAt) : '—'} sub={!s.paused && s.nextRunAt ? formatDate(s.nextRunAt) : undefined} />
            <Fact icon={<Clock className="h-4 w-4" />} label="Last run" value={s.lastRunAt ? timeAgo(s.lastRunAt) : 'never'} sub={s.lastRunAt ? formatDate(s.lastRunAt) : undefined} />
            <Fact icon={<CalendarClock className="h-4 w-4" />} label="Targets" value={`${(cfg?.targets ?? s.config.targets).length}`} sub="per-target intervals" />
            <Fact icon={<CheckCircle2 className="h-4 w-4" />} label="Last cycle" value={s.lastSummary ? `${formatNumber(s.lastSummary.runs)} run(s)` : '—'} sub={s.lastSummary ? `${s.lastSummary.products} product(s)` : undefined} />
          </div>
          {s.lastError && <div className="rounded-lg border border-danger/30 bg-red-900/20 p-3 text-xs text-red-300">Last error: {s.lastError}</div>}
        </CardBody>
      </Card>

      {/* Config */}
      {cfg && (
        <Card>
          <div className="flex items-center justify-between border-b border-line p-4">
            <div>
              <div className="font-semibold text-ink">Schedule configuration</div>
              <div className="text-xs text-muted">Each target auto-syncs its filtered products every cycle.</div>
            </div>
            <Button size="sm" icon={saveConfig.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} loading={saveConfig.isPending} onClick={onSave}>
              Save settings
            </Button>
          </div>
          <CardBody className="space-y-4">
            <div className="flex flex-wrap items-center gap-5">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
                <input type="checkbox" className="h-4 w-4 accent-accent" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} />
                Enable scheduled syncing
              </label>
              <span className="text-[11px] text-muted">
                Each target runs on its own interval. Saving with “enable” off pauses the scheduler.
              </span>
            </div>

            {/* Targets */}
            <div className="space-y-3">
              {targets.length === 0 && <p className="text-xs text-muted">No targets yet — add one below.</p>}
              {targets.map((t, i) => (
                <TargetRow
                  key={i}
                  index={i}
                  target={t}
                  run={s.targetRuns?.[i]}
                  profiles={profiles}
                  marketplaces={marketplaces}
                  onChange={setTarget}
                  onChangeFilter={setTargetFilter}
                  onRemove={removeTarget}
                />
              ))}
              <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setCfg({ ...cfg, targets: [...targets, { ...EMPTY_TARGET, filters: { ...EMPTY_TARGET.filters } }] })}>
                Add target
              </Button>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

/** One scheduler target. Owns its seller search so the search box sits directly
 *  above this target's seller dropdown (matching the other pages). */
function TargetRow({
  index: i,
  target: t,
  run,
  profiles,
  marketplaces,
  onChange,
  onChangeFilter,
  onRemove,
}: {
  index: number;
  target: SyncSchedulerTarget;
  run?: SyncTargetRun;
  profiles: ProfileLite[];
  marketplaces: SyncMarketplace[];
  onChange: (i: number, patch: Partial<SyncSchedulerTarget>) => void;
  onChangeFilter: (i: number, patch: Record<string, unknown>) => void;
  onRemove: (i: number) => void;
}) {
  const hasProfile = !!t.filters?.profile;

  const [sellerSearchInput, setSellerSearchInput] = useState('');
  const [sellerSearch, setSellerSearch] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setSellerSearch(sellerSearchInput.trim()), 300);
    return () => clearTimeout(id);
  }, [sellerSearchInput]);
  const sellersQ = useSyncSellers(sellerSearch);
  const sellers = sellersQ.data?.sellers ?? [];

  return (
    <div className="rounded-lg border border-line bg-panel2/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Target {i + 1}</span>
          {run?.nextRunAt && (
            <span className="text-[11px] text-muted">· next {timeUntil(run.nextRunAt)}</span>
          )}
          {run?.lastRunAt && (
            <span className="text-[11px] text-muted">· last {timeAgo(run.lastRunAt)}</span>
          )}
        </div>
        <Button size="sm" variant="ghost" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => onRemove(i)}>
          Remove
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Labeled label="Profile">
          <select className="input" value={t.filters?.profile || ''} onChange={(e) => onChangeFilter(i, { profile: e.target.value })}>
            <option value="">— select profile —</option>
            {profiles.map((p) => (
              <option key={p.fileName} value={p.fileName}>
                {p.profileName || p.fileName}
              </option>
            ))}
          </select>
        </Labeled>

        {/* Marketplace shows only once a profile is selected */}
        {hasProfile && (
          <Labeled label="Marketplace">
            <select className="input" value={t.marketplace} onChange={(e) => onChange(i, { marketplace: e.target.value })}>
              <option value="">— select —</option>
              {marketplaces.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.displayName} — {m.siteType}
                </option>
              ))}
            </select>
          </Labeled>
        )}

        <Labeled label="Seller">
          <input
            className="input mb-2"
            placeholder="Search sellers by name / email…"
            value={sellerSearchInput}
            onChange={(e) => setSellerSearchInput(e.target.value)}
          />
          <select
            className="input"
            value={t.sellerId || ''}
            onChange={(e) => {
              const id = Number(e.target.value);
              onChange(i, { sellerId: id, sellerName: sellers.find((sl) => sl.id === id)?.displayName ?? t.sellerName });
            }}
          >
            <option value="">— select seller —</option>
            {t.sellerId != null && t.sellerId > 0 && !sellers.some((sl) => sl.id === t.sellerId) && (
              <option value={t.sellerId}>{t.sellerName || `Seller #${t.sellerId}`}</option>
            )}
            {sellers.map((sl) => (
              <option key={sl.id} value={sl.id}>
                {sl.displayName} (#{sl.id})
              </option>
            ))}
          </select>
        </Labeled>

        <Labeled label="Country">
          <input className="input" value={t.country || ''} onChange={(e) => onChange(i, { country: e.target.value })} />
        </Labeled>
        <Labeled label="Interval">
          <select className="input" value={t.intervalHours ?? 2} onChange={(e) => onChange(i, { intervalHours: Number(e.target.value) })}>
            {INTERVALS.map((iv) => (
              <option key={iv.value} value={iv.value}>
                {iv.label}
              </option>
            ))}
          </select>
        </Labeled>
        <Labeled label="Price min / max">
          <div className="flex gap-2">
            <input type="number" min={0} className="input" value={t.filters?.priceMin ?? ''} onChange={(e) => onChangeFilter(i, { priceMin: e.target.value === '' ? '' : Math.max(0, Number(e.target.value)) })} placeholder="min" />
            <input type="number" min={0} className="input" value={t.filters?.priceMax ?? ''} onChange={(e) => onChangeFilter(i, { priceMax: e.target.value === '' ? '' : Math.max(0, Number(e.target.value)) })} placeholder="max" />
          </div>
        </Labeled>
        <Labeled label="Per-run limit">
          <input type="number" min={1} className="input" value={t.filters?.limit ?? 50} onChange={(e) => onChangeFilter(i, { limit: Number(e.target.value) || 50 })} />
        </Labeled>
      </div>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted">{label}</label>
      {children}
    </div>
  );
}

function Fact({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel2/50 p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-ink">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted">{sub}</div>}
    </div>
  );
}
