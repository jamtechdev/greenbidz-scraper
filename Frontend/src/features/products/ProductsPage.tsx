import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Package, ImageIcon, UploadCloud, ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { ErrorState, TableSkeleton, EmptyState } from '@/components/ui/states';
import { useProducts } from '@/hooks/useApi';
import type { Product } from '@/types/api';
import { formatPrice, timeAgo } from '@/lib/format';
import { cn } from '@/lib/cn';
import { ProductDetailDrawer } from './ProductDetailDrawer';

type Filter = 'all' | 'scraped' | 'unscraped';

export function ProductsPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Product | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const PAGE_SIZE = 50;
  const [page, setPage] = useState(0);

  const { data, isLoading, isError, error, refetch } = useProducts({
    limit: 500,
    scrapedOnly: filter === 'scraped',
  });

  const toggleId = (id: number) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const rows = useMemo(() => {
    let list = data?.products ?? [];
    if (filter === 'unscraped') list = list.filter((p) => !p.scraped);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.title?.toLowerCase().includes(q) ||
          p.product_url.toLowerCase().includes(q) ||
          p.external_id?.toLowerCase().includes(q),
      );
    }
    return list;
  }, [data, filter, search]);

  // Reset to the first page whenever the filtered set changes.
  useEffect(() => setPage(0), [filter, search]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount - 1);
  const pageRows = rows.slice(clampedPage * PAGE_SIZE, clampedPage * PAGE_SIZE + PAGE_SIZE);
  const selectablePageRows = pageRows.filter((p) => !p.synced);

  return (
    <>
      <PageHeader
        title="Products"
        description="Every product discovered by the scraper. Select products to sync to the main site, or click a row for detail."
        actions={
          <Button
            icon={<UploadCloud className="h-4 w-4" />}
            disabled={selectedIds.size === 0}
            onClick={() => navigate(`/sync?ids=${[...selectedIds].join(',')}`)}
          >
            Sync to main site{selectedIds.size ? ` (${selectedIds.size})` : ''}
          </Button>
        }
      />

      <Card>
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              className="input pl-9"
              placeholder="Search title, URL, or ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-line bg-panel2 p-1">
            {(['all', 'scraped', 'unscraped'] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition-colors',
                  filter === f ? 'bg-accent text-accent-ink' : 'text-muted hover:text-ink',
                )}
              >
                {f}
              </button>
            ))}
          </div>
          <span className="text-xs text-muted">
            {rows.length} total{selectedIds.size ? ` · ${selectedIds.size} selected` : ''}
          </span>
        </div>

        <CardBody className="p-0">
          {isLoading ? (
            <TableSkeleton rows={8} cols={7} />
          ) : isError ? (
            <ErrorState message={(error as Error).message} onRetry={() => refetch()} />
          ) : !rows.length ? (
            <EmptyState
              title="No products match"
              hint={search ? 'Try a different search.' : 'Run a crawl to discover products.'}
              icon={<Package className="h-5 w-5" />}
            />
          ) : (
            <>
            <Table>
              <THead>
                <TH className="w-10">
                  <input
                    type="checkbox"
                    className="h-4 w-4 cursor-pointer accent-accent"
                    title="Select all (unsynced) on this page"
                    checked={
                      selectablePageRows.length > 0 &&
                      selectablePageRows.every((p) => selectedIds.has(p.id))
                    }
                    onChange={(e) =>
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) selectablePageRows.forEach((p) => next.add(p.id));
                        else selectablePageRows.forEach((p) => next.delete(p.id));
                        return next;
                      })
                    }
                  />
                </TH>
                <TH className="w-12" />
                <TH>Title</TH>
                <TH>Price</TH>
                <TH>Profile</TH>
                <TH>Status</TH>
                <TH>Last seen</TH>
              </THead>
              <TBody>
                {pageRows.map((p) => (
                  <TR key={p.id} onClick={() => setSelected(p)}>
                    <TD>
                      <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer accent-accent disabled:cursor-not-allowed disabled:opacity-40"
                        checked={selectedIds.has(p.id)}
                        disabled={!!p.synced}
                        title={p.synced ? 'Already synced to main site' : undefined}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggleId(p.id)}
                      />
                    </TD>
                    <TD>
                      <Thumb product={p} />
                    </TD>
                    <TD className="max-w-[320px]">
                      <div className="truncate font-medium text-ink">
                        {p.title || <span className="text-muted">Untitled</span>}
                      </div>
                      <div className="truncate text-xs text-muted">{p.product_url}</div>
                    </TD>
                    <TD className="whitespace-nowrap">{formatPrice(p.price)}</TD>
                    <TD className="max-w-[140px] truncate text-xs text-muted">
                      {p.profile_file_name || '—'}
                    </TD>
                    <TD>
                      <div className="flex items-center gap-1.5">
                        {p.last_error ? (
                          <Badge tone="no">error</Badge>
                        ) : (
                          <Badge tone={p.scraped ? 'yes' : 'neutral'}>
                            {p.scraped ? 'scraped' : 'pending'}
                          </Badge>
                        )}
                        {p.synced && (
                          <Badge tone="info">
                            <CheckCircle2 className="mr-1 inline h-3 w-3" />
                            synced
                          </Badge>
                        )}
                      </div>
                    </TD>
                    <TD className="whitespace-nowrap text-xs text-muted">{timeAgo(p.last_seen_at)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {pageCount > 1 && (
              <div className="flex items-center justify-between border-t border-line px-4 py-3 text-xs text-muted">
                <span>
                  Showing {clampedPage * PAGE_SIZE + 1}–
                  {Math.min((clampedPage + 1) * PAGE_SIZE, rows.length)} of {rows.length}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    className="inline-flex items-center gap-1 rounded-lg border border-line bg-panel2 px-2.5 py-1.5 font-medium text-ink disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={clampedPage === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" /> Prev
                  </button>
                  <span>
                    Page {clampedPage + 1} / {pageCount}
                  </span>
                  <button
                    className="inline-flex items-center gap-1 rounded-lg border border-line bg-panel2 px-2.5 py-1.5 font-medium text-ink disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={clampedPage >= pageCount - 1}
                    onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  >
                    Next <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
            </>
          )}
        </CardBody>
      </Card>

      <ProductDetailDrawer product={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function Thumb({ product }: { product: Product }) {
  const src = product.images_remote_urls?.[0];
  if (!src) {
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-panel2 text-muted">
        <ImageIcon className="h-4 w-4" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      className="h-10 w-10 rounded-md border border-line object-cover"
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).src =
          'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E';
      }}
    />
  );
}
