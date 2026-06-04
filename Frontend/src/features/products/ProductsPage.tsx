import { useMemo, useState } from 'react';
import { Search, Package, ImageIcon } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { ErrorState, TableSkeleton, EmptyState } from '@/components/ui/states';
import { useProducts } from '@/hooks/useApi';
import type { Product } from '@/types/api';
import { formatPrice, timeAgo } from '@/lib/format';
import { cn } from '@/lib/cn';
import { ProductDetailDrawer } from './ProductDetailDrawer';

type Filter = 'all' | 'scraped' | 'unscraped';

export function ProductsPage() {
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Product | null>(null);

  const { data, isLoading, isError, error, refetch } = useProducts({
    limit: 200,
    scrapedOnly: filter === 'scraped',
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

  return (
    <>
      <PageHeader
        title="Products"
        description="Every product discovered by the scraper. Click a row for full detail."
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
          <span className="text-xs text-muted">{rows.length} shown</span>
        </div>

        <CardBody className="p-0">
          {isLoading ? (
            <TableSkeleton rows={8} cols={5} />
          ) : isError ? (
            <ErrorState message={(error as Error).message} onRetry={() => refetch()} />
          ) : !rows.length ? (
            <EmptyState
              title="No products match"
              hint={search ? 'Try a different search.' : 'Run a crawl to discover products.'}
              icon={<Package className="h-5 w-5" />}
            />
          ) : (
            <Table>
              <THead>
                <TH className="w-12" />
                <TH>Title</TH>
                <TH>Price</TH>
                <TH>Profile</TH>
                <TH>Status</TH>
                <TH>Last seen</TH>
              </THead>
              <TBody>
                {rows.map((p) => (
                  <TR key={p.id} onClick={() => setSelected(p)}>
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
                      {p.last_error ? (
                        <Badge tone="no">error</Badge>
                      ) : (
                        <Badge tone={p.scraped ? 'yes' : 'neutral'}>
                          {p.scraped ? 'scraped' : 'pending'}
                        </Badge>
                      )}
                    </TD>
                    <TD className="whitespace-nowrap text-xs text-muted">{timeAgo(p.last_seen_at)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
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
