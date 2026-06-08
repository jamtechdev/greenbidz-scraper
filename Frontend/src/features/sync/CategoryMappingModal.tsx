import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import {
  useSyncMeta,
  useSyncCategories,
  useSourceCategories,
  useSaveCategoryMappings,
} from '@/hooks/useApi';
import type { SyncCategory } from '@/types/api';

interface CatPick {
  categoryId: number | '';
  subcategoryId: number | '';
}

const srcKey = (c: string, s: string) => `${c}||${s || ''}`;

/** Locate a term id in the tree → its {category, subcategory} dropdown values. */
function placeTerm(categories: SyncCategory[], termId: number): CatPick {
  for (const c of categories) {
    if (c.id === termId) return { categoryId: c.id, subcategoryId: '' };
    const s = c.subcategories.find((x) => x.id === termId);
    if (s) return { categoryId: c.id, subcategoryId: s.id };
  }
  return { categoryId: '', subcategoryId: '' };
}

/** Effective main term for a pick: subcategory if chosen, else the category. */
function effFromPick(categories: SyncCategory[], pick: CatPick): { id: number | ''; name: string } {
  if (pick.categoryId === '') return { id: '', name: '' };
  const cat = categories.find((c) => c.id === pick.categoryId);
  if (!cat) return { id: '', name: '' };
  if (cat.subcategories.length && pick.subcategoryId !== '') {
    const s = cat.subcategories.find((x) => x.id === pick.subcategoryId);
    return { id: s?.id ?? cat.id, name: s?.name ?? cat.name };
  }
  return { id: cat.id, name: cat.name };
}

/** Fuzzy-suggest a {category, subcategory} for a scraped category text. */
function suggestPlacement(categories: SyncCategory[], text: string): CatPick | null {
  const hay = (text || '').toLowerCase();
  if (!hay.trim()) return null;
  let best: CatPick | null = null;
  let bestScore = 0;
  for (const c of categories) {
    const cands = c.subcategories.length
      ? c.subcategories.map((s) => ({ cat: c, sub: s as { id: number; name: string } | null, name: s.name }))
      : [{ cat: c, sub: null as { id: number; name: string } | null, name: c.name }];
    for (const cand of cands) {
      const words = cand.name
        .toLowerCase()
        .replace(/\(.*?\)/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .split(' ')
        .filter((w) => w.length > 3);
      if (!words.length) continue;
      const score = words.reduce((acc, w) => acc + (hay.includes(w) ? 1 : 0), 0);
      if (score > bestScore) {
        best = { categoryId: cand.cat.id, subcategoryId: cand.sub ? cand.sub.id : '' };
        bestScore = score;
      }
    }
  }
  return bestScore > 0 ? best : null;
}

/**
 * Map a site's scraped categories → main-site categories. Self-contained:
 * pick the marketplace, then map each scraped category (auto-suggested), Save.
 * Scope by `profile` (Profiles page) or `productIds` (Sync page).
 */
export function CategoryMappingModal({
  open,
  onClose,
  onSaved,
  profile,
  productIds,
  marketplace: initialMarketplace,
}: {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  profile?: string;
  productIds?: number[];
  marketplace?: string;
}) {
  const meta = useSyncMeta();
  const marketplaces = meta.data?.marketplaces ?? [];
  const [mk, setMk] = useState(initialMarketplace ?? '');
  useEffect(() => {
    if (open && initialMarketplace) setMk(initialMarketplace);
  }, [open, initialMarketplace]);
  useEffect(() => {
    if (!mk && marketplaces.length) setMk(marketplaces[0].name);
  }, [marketplaces, mk]);

  const catsQ = useSyncCategories(mk);
  const categories = catsQ.data?.categories ?? [];
  const srcQ = useSourceCategories(mk, { profile, productIds }, open && !!mk);
  const save = useSaveCategoryMappings();
  const items = srcQ.data?.items ?? [];

  const [picks, setPicks] = useState<Record<string, CatPick>>({});
  const [suggested, setSuggested] = useState<Record<string, boolean>>({});

  const seed = useMemo(
    () => () => {
      if (!srcQ.data || !categories.length) return;
      const next: Record<string, CatPick> = {};
      const sug: Record<string, boolean> = {};
      for (const it of srcQ.data.items) {
        const k = srcKey(it.source_category, it.source_subcategory);
        if (it.main_term_id != null) {
          next[k] = placeTerm(categories, it.main_term_id);
        } else {
          const s = suggestPlacement(categories, `${it.source_subcategory} ${it.source_category}`);
          next[k] = s ?? { categoryId: '', subcategoryId: '' };
          if (s) sug[k] = true;
        }
      }
      setPicks(next);
      setSuggested(sug);
    },
    [srcQ.data, categories],
  );
  useEffect(() => seed(), [seed]);

  const setCat = (k: string, catId: number | '') =>
    setPicks((p) => ({ ...p, [k]: { categoryId: catId, subcategoryId: '' } }));
  const setSub = (k: string, subId: number | '') =>
    setPicks((p) => ({ ...p, [k]: { ...p[k], subcategoryId: subId } }));

  const onSave = () => {
    const mappings = items
      .map((it) => {
        const k = srcKey(it.source_category, it.source_subcategory);
        const eff = effFromPick(categories, picks[k] ?? { categoryId: '', subcategoryId: '' });
        if (eff.id === '') return null;
        return {
          source_category: it.source_category,
          source_subcategory: it.source_subcategory,
          main_term_id: Number(eff.id),
          main_term_name: eff.name,
        };
      })
      .filter(Boolean) as Array<{ source_category: string; source_subcategory: string; main_term_id: number; main_term_name: string }>;
    save.mutate({ siteType: mk, mappings }, { onSuccess: () => { onSaved?.(); onClose(); } });
  };

  const mappedCount = items.filter((it) => {
    const k = srcKey(it.source_category, it.source_subcategory);
    return effFromPick(categories, picks[k] ?? { categoryId: '', subcategoryId: '' }).id !== '';
  }).length;

  const loading = srcQ.isLoading || catsQ.isLoading;

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="max-w-4xl"
      title="Map scraped categories → main site"
      footer={
        <>
          <span className="mr-auto text-xs text-muted">
            {mappedCount}/{items.length} mapped · subcategory optional
          </span>
          <Button variant="ghost" size="sm" onClick={seed} title="Revert unsaved changes">
            Reset
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" loading={save.isPending} disabled={!items.length} onClick={onSave}>
            Save mappings
          </Button>
        </>
      }
    >
      {/* Marketplace selector */}
      <div className="mb-3 flex items-center gap-2">
        <label className="text-xs font-medium text-muted">Marketplace</label>
        <select
          className="input max-w-xs"
          value={mk}
          onChange={(e) => setMk(e.target.value)}
        >
          {marketplaces.map((m) => (
            <option key={m.name} value={m.name}>
              {m.displayName} — {m.siteType}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="max-h-[55vh] overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-panel">
              <tr className="border-b border-line text-left text-muted">
                <th className="py-2 pr-3 font-semibold">Scraped category</th>
                <th className="py-2 pr-3 font-semibold">Main category *</th>
                <th className="py-2 font-semibold">Main subcategory</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-line/60 align-top last:border-0">
                  <td className="py-2 pr-3">
                    <div className="skeleton h-4 w-32" style={{ opacity: 1 - i * 0.12 }} />
                  </td>
                  <td className="py-2 pr-3">
                    <div className="skeleton h-8 w-full" style={{ opacity: 1 - i * 0.12 }} />
                  </td>
                  <td className="py-2">
                    <div className="skeleton h-8 w-full" style={{ opacity: 1 - i * 0.12 }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !items.length ? (
        <p className="text-muted">
          No scraped categories found for this profile. Make sure the profile maps the Category
          field in the Mapping Studio.
        </p>
      ) : (
        <div className="max-h-[55vh] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-panel">
              <tr className="border-b border-line text-left text-muted">
                <th className="py-2 pr-3 font-semibold">Scraped category</th>
                <th className="py-2 pr-3 font-semibold">Main category *</th>
                <th className="py-2 font-semibold">Main subcategory</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const k = srcKey(it.source_category, it.source_subcategory);
                const pick = picks[k] ?? { categoryId: '', subcategoryId: '' };
                const selCat = categories.find((c) => c.id === pick.categoryId);
                const subs = selCat?.subcategories ?? [];
                const isSuggested = suggested[k] && pick.categoryId !== '';
                return (
                  <tr key={k} className="border-b border-line/60 align-top last:border-0">
                    <td className="py-2 pr-3 text-ink">
                      {it.source_category}
                      {it.source_subcategory ? <span className="text-muted"> › {it.source_subcategory}</span> : null}
                      {isSuggested && (
                        <span className="ml-1.5 rounded bg-sky-900/50 px-1.5 py-0.5 text-[10px] text-sky-200">
                          suggested
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <select
                        className="input"
                        value={pick.categoryId}
                        onChange={(e) => setCat(k, e.target.value ? Number(e.target.value) : '')}
                      >
                        <option value="">— not mapped —</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2">
                      <select
                        className="input disabled:opacity-50"
                        value={pick.subcategoryId}
                        disabled={subs.length === 0}
                        onChange={(e) => setSub(k, e.target.value ? Number(e.target.value) : '')}
                      >
                        <option value="">{subs.length ? '— (use category) —' : '— none —'}</option>
                        {subs.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
