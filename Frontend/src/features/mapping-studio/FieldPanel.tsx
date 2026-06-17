import { useState } from 'react';
import {
  Crosshair,
  Check,
  X,
  Trash2,
  Plus,
  Images,
  Link2,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import type { FieldDraft, FieldType, ImagePick, MappingDraft } from './types';
import { IMAGES_KEY, NEXT_KEY, PRODUCT_LINK_KEY, CURRENCY_OPTIONS } from './types';

// Built-in spec fields whose values a `table`-type field already captures, so we
// hint that they don't need to be picked individually (avoids duplicate data).
const SPEC_BUILTIN_KEYS = new Set(['manufacturer', 'model', 'year', 'condition', 'serial']);

interface PanelProps {
  mode: 'listing' | 'fields';
  draft: MappingDraft;
  armedKey: string | null;
  onArm: (key: string) => void;
  onClear: (key: string) => void;
  onAddCustom: (label: string) => void;
  onRemoveField: (key: string) => void;
  onToggleRequired: (key: string) => void;
  onSetType: (key: string, type: FieldType) => void;
  onSetSelector: (key: string, selector: string) => void;
  onRemoveImage: (index: number) => void;
  onSetCurrency: (currency: string) => void;
  countMatches: (selector: string) => number;
}

export function FieldPanel(props: PanelProps) {
  if (props.mode === 'listing') return <ListingPanel {...props} />;
  return <FieldsPanel {...props} />;
}

// ── Listing step ───────────────────────────────────────────────────────────────
function ListingPanel({ draft, armedKey, onArm, onClear, countMatches }: PanelProps) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        On the listing page, click a <b className="text-ink">product link</b> (one of the
        repeating cards) and the <b className="text-ink">Next-page</b> control.
      </p>

      <TargetRow
        icon={<Link2 className="h-4 w-4" />}
        label="Product link"
        hint="An anchor that opens a product detail page"
        armed={armedKey === PRODUCT_LINK_KEY}
        selector={draft.productLinkSelector}
        matches={draft.productLinkSelector ? countMatches(draft.productLinkSelector) : 0}
        onArm={() => onArm(PRODUCT_LINK_KEY)}
        onClear={() => onClear(PRODUCT_LINK_KEY)}
      />
      <TargetRow
        icon={<ChevronRight className="h-4 w-4" />}
        label="Next page"
        hint="Pagination 'Next' button/link (optional)"
        armed={armedKey === NEXT_KEY}
        selector={draft.nextSelector}
        matches={draft.nextSelector ? countMatches(draft.nextSelector) : 0}
        onArm={() => onArm(NEXT_KEY)}
        onClear={() => onClear(NEXT_KEY)}
      />

      {draft.sampleProductUrl && (
        <div className="rounded-lg border border-accent/30 bg-emerald-900/20 p-3 text-xs text-emerald-300">
          <div className="mb-0.5 font-semibold">Sample product found</div>
          <div className="break-all text-emerald-300/80">{draft.sampleProductUrl}</div>
        </div>
      )}
    </div>
  );
}

// ── Fields step ────────────────────────────────────────────────────────────────
function FieldsPanel({
  draft,
  armedKey,
  onArm,
  onClear,
  onAddCustom,
  onRemoveField,
  onToggleRequired,
  onSetType,
  onSetSelector,
  onRemoveImage,
  onSetCurrency,
  countMatches,
}: PanelProps) {
  const [custom, setCustom] = useState('');

  // A mapped `table`-type field captures every spec row, so the discrete spec
  // fields below it become redundant — hint that they can be left unmapped.
  const hasTable = draft.fields.some(
    (f) => (f.type === 'table' || f.type === 'keyValueTable') && !!f.selector,
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Click a field, then click the matching element on the product page. Only
        <b className="text-ink"> Title</b> is required — the rest are optional.
      </p>

      {/* Profile-level price currency (a fixed value, not picked from the page) */}
      <div className="flex items-center justify-between gap-2 rounded-lg border border-line bg-panel2/50 p-3">
        <div className="text-sm font-medium text-ink">Price currency</div>
        <select
          className="rounded border border-line bg-bg px-2 py-1 text-sm text-ink"
          value={draft.priceCurrency}
          onChange={(e) => onSetCurrency(e.target.value)}
        >
          {CURRENCY_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {draft.fields.map((f) => (
        <FieldRow
          key={f.key}
          field={f}
          armed={armedKey === f.key}
          matches={f.selector ? countMatches(f.selector) : 0}
          coveredByTable={hasTable && f.builtin && SPEC_BUILTIN_KEYS.has(f.key) && !f.selector}
          onArm={() => onArm(f.key)}
          onClear={() => onClear(f.key)}
          onRemove={() => onRemoveField(f.key)}
          onToggleRequired={() => onToggleRequired(f.key)}
          onSetType={(t) => onSetType(f.key, t)}
          onSetSelector={(s) => onSetSelector(f.key, s)}
        />
      ))}

      {/* Add custom field */}
      <div className="flex gap-2">
        <input
          className="input"
          placeholder="Add custom field (e.g. brand)"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && custom.trim()) {
              onAddCustom(custom.trim());
              setCustom('');
            }
          }}
        />
        <Button
          variant="secondary"
          size="sm"
          icon={<Plus className="h-4 w-4" />}
          disabled={!custom.trim()}
          onClick={() => {
            onAddCustom(custom.trim());
            setCustom('');
          }}
        >
          Add
        </Button>
      </div>

      {/* Images (multi) */}
      <div className="rounded-lg border border-line bg-panel2/50 p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-ink">
            <Images className="h-4 w-4 text-sky2" /> Images
            <Badge tone="neutral">{draft.images.length}</Badge>
          </div>
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant={armedKey === IMAGES_KEY ? 'blue' : 'secondary'}
              icon={<Crosshair className="h-3.5 w-3.5" />}
              onClick={() => onArm(IMAGES_KEY)}
            >
              {armedKey === IMAGES_KEY ? 'Picking…' : 'Pick'}
            </Button>
            {draft.images.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                icon={<Trash2 className="h-3.5 w-3.5" />}
                onClick={() => onClear(IMAGES_KEY)}
              />
            )}
          </div>
        </div>
        <p className="mb-2 text-[11px] text-muted">
          Multi-select — click several images on the page; click again to deselect.
        </p>
        {draft.images.length > 0 && (
          <div className="grid grid-cols-4 gap-2">
            {draft.images.map((img, i) => (
              <ImageThumb key={i} img={img} onRemove={() => onRemoveImage(i)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FieldRow({
  field,
  armed,
  matches,
  coveredByTable,
  onArm,
  onClear,
  onRemove,
  onToggleRequired,
  onSetType,
  onSetSelector,
}: {
  field: FieldDraft;
  armed: boolean;
  matches: number;
  coveredByTable: boolean;
  onArm: () => void;
  onClear: () => void;
  onRemove: () => void;
  onToggleRequired: () => void;
  onSetType: (t: FieldType) => void;
  onSetSelector: (s: string) => void;
}) {
  const mapped = !!field.selector;
  return (
    <div
      className={cn(
        'rounded-lg border bg-panel2/50 p-3 transition-colors',
        armed ? 'border-sky2' : mapped ? 'border-accent/40' : 'border-line',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-ink">{field.label}</span>
          {field.required && <Badge tone="warn">required</Badge>}
          {mapped && (
            <span className="flex items-center gap-1 text-[11px] text-accent">
              <Check className="h-3 w-3" /> mapped
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant={armed ? 'blue' : 'secondary'}
            icon={<Crosshair className="h-3.5 w-3.5" />}
            onClick={onArm}
          >
            {armed ? 'Picking…' : mapped ? 'Re-pick' : 'Pick'}
          </Button>
          {mapped && (
            <Button size="sm" variant="ghost" icon={<X className="h-3.5 w-3.5" />} onClick={onClear} />
          )}
          {!field.builtin && (
            <Button size="sm" variant="ghost" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={onRemove} />
          )}
        </div>
      </div>

      {coveredByTable && (
        <div className="mt-2 text-[11px] text-muted">
          Covered by your Specifications table — no need to pick this individually.
        </div>
      )}

      {mapped && (
        <div className="mt-2 space-y-1">
          {/* Editable selector — pick sets it, but you can hand-fix it too
              (e.g. a brittle picked path → a stable class). Live-validated below. */}
          <textarea
            className="block w-full resize-y break-all rounded border border-line bg-bg px-2 py-1 font-mono text-[11px] text-sky-300 outline-none focus:border-sky2"
            rows={2}
            spellCheck={false}
            value={field.selector ?? ''}
            onChange={(e) => onSetSelector(e.target.value)}
            title="CSS selector — edit to override the picked one"
          />
          {field.sampleValue && (
            <div className="truncate text-xs text-muted" title={field.sampleValue}>
              “{field.sampleValue}”
            </div>
          )}
          {matches === 0 && (
            <div className="flex items-center gap-1 text-[11px] text-warn">
              <AlertCircle className="h-3 w-3" /> selector matches 0 elements on this page
            </div>
          )}
        </div>
      )}

      {/* Type + required controls for non-builtin fields */}
      {!field.builtin && (
        <div className="mt-2 flex items-center gap-3 text-xs text-muted">
          <label className="flex items-center gap-1.5">
            type
            <select
              className="rounded border border-line bg-bg px-1.5 py-1 text-ink"
              value={field.type}
              onChange={(e) => onSetType(e.target.value as FieldType)}
            >
              <option value="text">text</option>
              <option value="html">html</option>
              <option value="number">number</option>
              <option value="table">table (key/value)</option>
            </select>
          </label>
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={field.required}
              onChange={onToggleRequired}
              className="h-3.5 w-3.5 accent-accent"
            />
            required
          </label>
        </div>
      )}
    </div>
  );
}

function ImageThumb({ img, onRemove }: { img: ImagePick; onRemove: () => void }) {
  return (
    <div className="group relative aspect-square overflow-hidden rounded border border-line bg-bg">
      {img.src ? (
        <img src={img.src} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full items-center justify-center text-[10px] text-muted">no src</div>
      )}
      <button
        onClick={onRemove}
        className="absolute right-0.5 top-0.5 rounded bg-black/60 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function TargetRow({
  icon,
  label,
  hint,
  armed,
  selector,
  matches,
  onArm,
  onClear,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  armed: boolean;
  selector?: string;
  matches: number;
  onArm: () => void;
  onClear: () => void;
}) {
  const mapped = !!selector;
  return (
    <div
      className={cn(
        'rounded-lg border bg-panel2/50 p-3 transition-colors',
        armed ? 'border-sky2' : mapped ? 'border-accent/40' : 'border-line',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-ink">
          <span className="text-sky2">{icon}</span>
          {label}
          {mapped && <Check className="h-3.5 w-3.5 text-accent" />}
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant={armed ? 'blue' : 'secondary'}
            icon={<Crosshair className="h-3.5 w-3.5" />}
            onClick={onArm}
          >
            {armed ? 'Picking…' : mapped ? 'Re-pick' : 'Pick'}
          </Button>
          {mapped && (
            <Button size="sm" variant="ghost" icon={<X className="h-3.5 w-3.5" />} onClick={onClear} />
          )}
        </div>
      </div>
      {!mapped && <p className="mt-1 text-[11px] text-muted">{hint}</p>}
      {mapped && (
        <div className="mt-2 space-y-1">
          <code className="block break-all rounded bg-bg px-2 py-1 font-mono text-[11px] text-sky-300">
            {selector}
          </code>
          <div className="text-[11px] text-muted">matches {matches} element(s) on this page</div>
        </div>
      )}
    </div>
  );
}
