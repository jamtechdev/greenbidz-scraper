import { useEffect, useState } from 'react';
import { Tags } from 'lucide-react';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/ui/states';
import { useSyncMeta } from '@/hooks/useApi';
import { CategoryMappingModal } from '@/features/sync/CategoryMappingModal';

export function MappingsTab() {
  const meta = useSyncMeta();
  const [marketplace, setMarketplace] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (meta.data) setMarketplace((m) => m || meta.data.marketplaces[0]?.name || '');
  }, [meta.data]);

  if (meta.isLoading) return <LoadingState label="Loading marketplaces…" />;

  return (
    <Card>
      <CardBody className="space-y-4">
        <div>
          <div className="text-sm font-semibold text-ink">Category mappings</div>
          <p className="mt-0.5 text-xs text-muted">
            Map each site’s scraped categories → main-site categories once. Sync runs then
            auto-select the right category for every product.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Marketplace</span>
            <select className="input" value={marketplace} onChange={(e) => setMarketplace(e.target.value)}>
              {(meta.data?.marketplaces ?? []).map((m) => (
                <option key={m.name} value={m.name}>
                  {m.displayName} — {m.siteType}
                </option>
              ))}
            </select>
          </label>
          <Button icon={<Tags className="h-4 w-4" />} onClick={() => setOpen(true)} disabled={!marketplace}>
            Manage mappings
          </Button>
        </div>
      </CardBody>

      <CategoryMappingModal open={open} onClose={() => setOpen(false)} marketplace={marketplace} />
    </Card>
  );
}
