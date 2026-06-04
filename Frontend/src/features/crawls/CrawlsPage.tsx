import { useMemo, useState } from 'react';
import { History, AlertCircle } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { ErrorState, TableSkeleton, EmptyState } from '@/components/ui/states';
import { useCrawlHistory } from '@/hooks/useApi';
import { formatNumber, formatDate, formatDuration, hostFromUrl } from '@/lib/format';
import { cn } from '@/lib/cn';

function statusTone(status: string | null): 'yes' | 'no' | 'warn' | 'neutral' {
  const s = (status || '').toLowerCase();
  if (s.includes('complete') || s === 'success' || s === 'ok') return 'yes';
  if (s.includes('fail') || s.includes('error')) return 'no';
  if (s.includes('partial') || s.includes('warn')) return 'warn';
  return 'neutral';
}

export function CrawlsPage() {
  const { data, isLoading, isError, error, refetch } = useCrawlHistory(200);
  const [onlyErrors, setOnlyErrors] = useState(false);

  const rows = useMemo(() => {
    const list = data?.history ?? [];
    return onlyErrors
      ? list.filter((r) => statusTone(r.status) === 'no' || (r.failed_products ?? 0) > 0)
      : list;
  }, [data, onlyErrors]);

  return (
    <>
      <PageHeader
        title="Crawl History"
        description="Every crawl run recorded by the scheduler and on-demand scrapes."
      />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={onlyErrors}
              onChange={(e) => setOnlyErrors(e.target.checked)}
              className="h-4 w-4 rounded border-line bg-panel2 accent-accent"
            />
            <AlertCircle className="h-4 w-4" />
            Only runs with failures
          </label>
          <span className="text-xs text-muted">{rows.length} runs</span>
        </div>

        <CardBody className="p-0">
          {isLoading ? (
            <TableSkeleton rows={8} cols={6} />
          ) : isError ? (
            <ErrorState message={(error as Error).message} onRetry={() => refetch()} />
          ) : !rows.length ? (
            <EmptyState
              title="No crawl runs"
              hint="Runs appear here once the scheduler or an on-demand scrape executes."
              icon={<History className="h-5 w-5" />}
            />
          ) : (
            <Table>
              <THead>
                <TH>When</TH>
                <TH>Listing</TH>
                <TH>Found</TH>
                <TH>New</TH>
                <TH>Failed</TH>
                <TH>Duration</TH>
                <TH>Status</TH>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.id}>
                    <TD className="whitespace-nowrap text-muted">{formatDate(r.timestamp)}</TD>
                    <TD className="max-w-[260px]">
                      <div className="truncate text-ink" title={r.listing_url}>
                        {hostFromUrl(r.listing_url)}
                      </div>
                      {r.error_message && (
                        <div className="truncate text-xs text-danger" title={r.error_message}>
                          {r.error_message}
                        </div>
                      )}
                    </TD>
                    <TD>{formatNumber(r.products_found)}</TD>
                    <TD className="text-accent">{formatNumber(r.new_products)}</TD>
                    <TD className={cn((r.failed_products ?? 0) > 0 && 'text-danger')}>
                      {formatNumber(r.failed_products)}
                    </TD>
                    <TD className="whitespace-nowrap text-muted">
                      {formatDuration(r.crawl_duration_seconds)}
                    </TD>
                    <TD>
                      <Badge tone={statusTone(r.status)}>{r.status || 'unknown'}</Badge>
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
