import { Link, useNavigate } from 'react-router-dom';
import {
  Package,
  CheckCircle2,
  Clock,
  FileCode2,
  ClipboardList,
  ArrowRight,
  Activity,
  MousePointerClick,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { ErrorState, EmptyState, TableSkeleton } from '@/components/ui/states';
import { RelTime } from '@/components/ui/RelTime';
import { useCrawlHistory, useDashboardState, useProducts } from '@/hooks/useApi';
import { formatNumber, formatDuration, timeAgo, hostFromUrl } from '@/lib/format';
import { CrawlVolumeChart } from './CrawlVolumeChart';

/** Vertical list-shaped skeleton for the dashboard side panels. */
function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y divide-line/60">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-3 px-5 py-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="skeleton h-3.5 w-2/3" />
            <div className="skeleton h-3 w-1/3" />
          </div>
          <div className="skeleton h-5 w-12 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const state = useDashboardState();
  const products = useProducts({ limit: 6 });
  const crawls = useCrawlHistory(50);

  const counts = state.data?.counts;
  const lastRun = crawls.data?.history?.[0];

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="At-a-glance health of the scraper — products discovered, crawl activity, and review queue."
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard
          label="Total products"
          value={formatNumber(counts?.total)}
          icon={<Package className="h-5 w-5" />}
          tone="sky"
        />
        <StatCard
          label="Scraped"
          value={formatNumber(counts?.scraped)}
          icon={<CheckCircle2 className="h-5 w-5" />}
          tone="accent"
        />
        <StatCard
          label="Unscraped"
          value={formatNumber(counts?.unscraped)}
          icon={<Clock className="h-5 w-5" />}
          tone="warn"
        />
        <StatCard
          label="Profiles"
          value={formatNumber(state.data?.profiles.length)}
          icon={<FileCode2 className="h-5 w-5" />}
        />
        <StatCard
          label="Pending"
          value={formatNumber(state.data?.pending.length)}
          icon={<ClipboardList className="h-5 w-5" />}
          tone={state.data?.pending.length ? 'warn' : 'default'}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Crawl volume chart */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Crawl activity"
            subtitle="Products found per recent run"
            icon={<Activity className="h-4 w-4" />}
            action={
              lastRun ? (
                <span className="text-xs text-muted">Last run {timeAgo(lastRun.timestamp)}</span>
              ) : null
            }
          />
          <CardBody>
            {crawls.isLoading ? (
              <div className="skeleton h-64 w-full" />
            ) : crawls.isError ? (
              <ErrorState
                message={(crawls.error as Error).message}
                onRetry={() => crawls.refetch()}
              />
            ) : (
              <CrawlVolumeChart runs={crawls.data?.history ?? []} />
            )}
          </CardBody>
        </Card>

        {/* Profiles list */}
        <Card>
          <CardHeader
            title="Profiles"
            subtitle="Active scraping profiles"
            icon={<FileCode2 className="h-4 w-4" />}
          />
          <CardBody className="p-0">
            {state.isLoading ? (
              <ListSkeleton />
            ) : !state.data?.profiles.length ? (
              <EmptyState
                title="No profiles yet"
                hint="Create one in the visual Mapping Studio to start scraping."
                action={
                  <Button size="sm" icon={<MousePointerClick className="h-4 w-4" />} onClick={() => navigate('/scraper/new')}>
                    Create your first scraper
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y divide-line/60">
                {state.data.profiles.slice(0, 6).map((p) => (
                  <li key={p.fileName} className="flex items-center justify-between gap-2 px-5 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-ink">
                        {p.profileName || p.domain || p.fileName}
                      </div>
                      <div className="truncate text-xs text-muted">{p.domain}</div>
                    </div>
                    <Badge tone={p.source === 'api' ? 'api' : 'dom'}>{p.source}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent runs */}
        <Card>
          <CardHeader
            title="Recent crawl runs"
            action={
              <Link to="/crawls" className="flex items-center gap-1 text-xs text-sky2 hover:underline">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            }
          />
          <CardBody className="p-0">
            {crawls.isLoading ? (
              <TableSkeleton rows={6} cols={4} />
            ) : !crawls.data?.history.length ? (
              <EmptyState title="No runs yet" />
            ) : (
              <Table>
                <THead>
                  <TH>Listing</TH>
                  <TH>Found</TH>
                  <TH>New</TH>
                  <TH>Duration</TH>
                </THead>
                <TBody>
                  {crawls.data.history.slice(0, 6).map((r) => (
                    <TR key={r.id}>
                      <TD className="max-w-[180px] truncate text-muted">{hostFromUrl(r.listing_url)}</TD>
                      <TD>{formatNumber(r.products_found)}</TD>
                      <TD className="text-accent">{formatNumber(r.new_products)}</TD>
                      <TD className="text-muted">{formatDuration(r.crawl_duration_seconds)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardBody>
        </Card>

        {/* Recent products */}
        <Card>
          <CardHeader
            title="Recent products"
            action={
              <Link to="/products" className="flex items-center gap-1 text-xs text-sky2 hover:underline">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            }
          />
          <CardBody className="p-0">
            {products.isLoading ? (
              <ListSkeleton />
            ) : !products.data?.products.length ? (
              <EmptyState title="No products yet" hint="Run a crawl to discover products." />
            ) : (
              <ul className="divide-y divide-line/60">
                {products.data.products.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-ink">
                        {p.title || <span className="text-muted">Untitled</span>}
                      </div>
                      <div className="truncate text-xs text-muted"><RelTime iso={p.last_seen_at} /></div>
                    </div>
                    <Badge tone={p.scraped ? 'yes' : 'no'}>{p.scraped ? 'scraped' : 'pending'}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
