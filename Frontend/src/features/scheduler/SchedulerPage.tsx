import {
  CalendarClock,
  Play,
  Pause,
  Loader2,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileCode2,
  PauseCircle,
  Power,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ErrorState, EmptyState } from '@/components/ui/states';
import { useScheduler, useSchedulerActions } from '@/hooks/useApi';
import { formatNumber, formatDate, timeAgo, timeUntil } from '@/lib/format';
import type { SchedulerStatus } from '@/types/api';

/** Render a minutes interval as a compact "every 20m / 2h / 1d" label. */
function formatInterval(minutes?: number): string {
  if (!minutes || minutes <= 0) return '—';
  if (minutes % 1440 === 0) return `every ${minutes / 1440}d`;
  if (minutes % 60 === 0) return `every ${minutes / 60}h`;
  return `every ${minutes}m`;
}

export function SchedulerPage() {
  const { data, isLoading, isError, error, refetch } = useScheduler();
  const { runNow, pause, resume } = useSchedulerActions();

  return (
    <>
      <PageHeader
        title="Scheduler"
        description="Background crawl scheduler — it checks every 5 minutes and crawls each “with job” (auto) profile on its own interval."
        actions={
          data && (
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon={<Play className="h-3.5 w-3.5" />}
                loading={runNow.isPending}
                disabled={data.busy}
                onClick={() => runNow.mutate()}
                title={data.busy ? 'A crawl is already running' : 'Run a crawl cycle now'}
              >
                Run now
              </Button>
              {data.paused ? (
                <Button
                  size="sm"
                  icon={<Power className="h-3.5 w-3.5" />}
                  loading={resume.isPending}
                  onClick={() => resume.mutate()}
                >
                  Resume schedule
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Pause className="h-3.5 w-3.5" />}
                  loading={pause.isPending}
                  onClick={() => pause.mutate()}
                >
                  Pause schedule
                </Button>
              )}
            </div>
          )
        }
      />

      {isLoading ? (
        <div className="space-y-6">
          <div className="skeleton h-44 w-full rounded-xl" />
          <div className="skeleton h-64 w-full rounded-xl" />
        </div>
      ) : isError ? (
        <ErrorState message={(error as Error).message} onRetry={() => refetch()} />
      ) : data ? (
        <div className="space-y-6">
          <StatusCard s={data} />
          <AutoProfilesCard s={data} />
        </div>
      ) : null}
    </>
  );
}

function StatusCard({ s }: { s: SchedulerStatus }) {
  const state = s.busy
    ? { label: 'Running now', tone: 'info' as const, icon: <Loader2 className="h-4 w-4 animate-spin" /> }
    : s.paused
      ? { label: 'Paused', tone: 'warn' as const, icon: <PauseCircle className="h-4 w-4" /> }
      : { label: 'Active', tone: 'yes' as const, icon: <CheckCircle2 className="h-4 w-4" /> };

  return (
    <Card>
      <CardBody className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/15 text-accent">
              <CalendarClock className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-ink">Crawl scheduler</span>
                <Badge tone={state.tone}>
                  <span className="mr-1 inline-flex align-middle">{state.icon}</span>
                  {state.label}
                </Badge>
              </div>
              <div className="text-xs text-muted">
                Checks every 5 min · each profile on its own interval ·{' '}
                <span className="font-mono">{s.pollExpression}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Fact
            icon={<Clock className="h-4 w-4" />}
            label="Next run"
            value={s.paused ? 'Paused' : s.nextRunAt ? timeUntil(s.nextRunAt) : '—'}
            sub={!s.paused && s.nextRunAt ? formatDate(s.nextRunAt) : undefined}
          />
          <Fact
            icon={<Clock className="h-4 w-4" />}
            label="Last run"
            value={s.lastRunAt ? timeAgo(s.lastRunAt) : 'never'}
            sub={s.lastRunAt ? formatDate(s.lastRunAt) : undefined}
          />
          <Fact
            icon={<CalendarClock className="h-4 w-4" />}
            label="Check cadence"
            value="Every 5 min"
            sub="profiles run on their own intervals"
          />
          <Fact
            icon={<FileCode2 className="h-4 w-4" />}
            label="Active profiles"
            value={formatNumber(s.activeProfileCount)}
            sub={`${s.autoProfiles.length} auto total`}
          />
        </div>

        {/* Last run summary */}
        {s.lastSummary && (
          <div className="rounded-lg border border-line bg-panel2/50 p-3">
            <div className="mb-2 text-[10px] uppercase tracking-wide text-muted">Last cycle</div>
            <div className="flex flex-wrap gap-4 text-sm">
              <Stat label="Listings" value={s.lastSummary.listings} />
              <Stat label="Found" value={s.lastSummary.found} />
              <Stat label="New" value={s.lastSummary.new} tone="text-accent" />
              <Stat label="Scraped" value={s.lastSummary.scraped} tone="text-emerald-300 light:text-emerald-600" />
              <Stat
                label="Failed"
                value={s.lastSummary.failed}
                tone={s.lastSummary.failed > 0 ? 'text-danger' : undefined}
              />
            </div>
          </div>
        )}

        {s.lastError && (
          <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-red-900/20 p-3 text-xs text-red-300 light:bg-red-50 light:text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Last cycle error: {s.lastError}</span>
          </div>
        )}

        {s.paused && (
          <p className="text-xs text-muted">
            The schedule is paused — no automatic crawls will run. Use{' '}
            <span className="text-ink">Run now</span> for a one-off crawl, or{' '}
            <span className="text-ink">Resume schedule</span> to re-enable the recurring job.
          </p>
        )}
      </CardBody>
    </Card>
  );
}

function AutoProfilesCard({ s }: { s: SchedulerStatus }) {
  const navigate = useNavigate();
  return (
    <Card>
      <div className="flex items-center justify-between border-b border-line p-4">
        <div>
          <div className="font-semibold text-ink">Auto profiles</div>
          <div className="text-xs text-muted">
            Profiles set to “with job” mode — each runs on its own interval (shown per row).
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => navigate('/profiles')}>
          Manage profiles
        </Button>
      </div>
      <CardBody className="p-0">
        {!s.autoProfiles.length ? (
          <EmptyState
            title="No auto profiles"
            hint="Set a profile’s mode to “with job” in its settings to have the scheduler crawl it automatically."
            icon={<FileCode2 className="h-5 w-5" />}
          />
        ) : (
          <ul className="divide-y divide-line">
            {s.autoProfiles.map((p) => {
              return (
                <li key={p.fileName} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-ink">{p.profileName}</span>
                      {p.paused ? (
                        <Badge tone="warn">
                          <PauseCircle className="mr-1 inline h-3 w-3" />
                          paused
                        </Badge>
                      ) : p.listingUrlCount === 0 ? (
                        <Badge tone="neutral">no listing URLs</Badge>
                      ) : (
                        <Badge tone="yes">scheduled</Badge>
                      )}
                    </div>
                    <div className="truncate text-xs text-muted">
                      {p.domain || p.fileName}
                      {!p.paused && p.listingUrlCount > 0 && p.nextRunAt && (
                        <> · next {timeUntil(p.nextRunAt)}</>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-xs text-muted">
                    <Badge tone="info">{formatInterval(p.intervalMinutes)}</Badge>
                    <Badge tone="neutral">
                      {p.listingUrlCount} URL{p.listingUrlCount === 1 ? '' : 's'}
                    </Badge>
                    <Badge tone="neutral">{p.scrapeLimit ? `≤${p.scrapeLimit}/run` : 'all/run'}</Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function Fact({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: string;
}) {
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

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div>
      <span className={tone ? `font-semibold ${tone}` : 'font-semibold text-ink'}>
        {formatNumber(value)}
      </span>{' '}
      <span className="text-xs text-muted">{label}</span>
    </div>
  );
}
