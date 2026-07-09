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
import type { FieldDraft, FieldType, ImagePattern, ImagePick, MappingDraft } from './types';
import {
  IMAGES_KEY,
  IMAGE_ID_KEY,
  NEXT_KEY,
  PRODUCT_LINK_KEY,
  CURRENCY_OPTIONS,
  cleanFieldText,
  expandImagePattern,
} from './types';

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
  onToggleClean: (key: string) => void;
  onSetType: (key: string, type: FieldType) => void;
  onSetSelector: (key: string, selector: string) => void;
  onRemoveImage: (index: number) => void;
  onSetCurrency: (currency: string) => void;
  onSetImageSource: (source: 'dom' | 'pattern') => void;
  onUpdatePattern: (patch: Partial<ImagePattern>) => void;
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
  onToggleClean,
  onSetType,
  onSetSelector,
  onRemoveImage,
  onSetCurrency,
  onSetImageSource,
  onUpdatePattern,
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
          onToggleClean={() => onToggleClean(f.key)}
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

      {/* Images */}
      <div className="rounded-lg border border-line bg-panel2/50 p-3">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-ink">
          <Images className="h-4 w-4 text-sky2" /> Images
          {draft.imageSource === 'dom' && <Badge tone="neutral">{draft.images.length}</Badge>}
        </div>

        {/* Source toggle: pick <img> tags, or build URLs from a pattern. */}
        <div className="mb-3 flex items-center gap-1 rounded-lg border border-line bg-bg p-1">
          {([
            { value: 'dom', label: 'Pick from page' },
            { value: 'pattern', label: 'Build from URL' },
          ] as const).map((m) => (
            <button
              key={m.value}
              onClick={() => onSetImageSource(m.value)}
              className={cn(
                'flex-1 rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors',
                draft.imageSource === m.value ? 'bg-sky2 text-white' : 'text-muted hover:text-ink',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        {draft.imageSource === 'dom' ? (
          <>
            <div className="mb-2 flex items-center justify-end gap-1.5">
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
          </>
        ) : (
          <ImagePatternPanel
            pattern={draft.imagePattern}
            armed={armedKey === IMAGE_ID_KEY}
            matches={draft.imagePattern.idSelector ? countMatches(draft.imagePattern.idSelector) : 0}
            onArmId={() => onArm(IMAGE_ID_KEY)}
            onClearId={() => onClear(IMAGE_ID_KEY)}
            onUpdate={onUpdatePattern}
          />
        )}
      </div>
    </div>
  );
}

// ── Image URL pattern (alternative to picking <img> tags) ───────────────────────
function ImagePatternPanel({
  pattern,
  armed,
  matches,
  onArmId,
  onClearId,
  onUpdate,
}: {
  pattern: ImagePattern;
  armed: boolean;
  matches: number;
  onArmId: () => void;
  onClearId: () => void;
  onUpdate: (patch: Partial<ImagePattern>) => void;
}) {
  const sampleId = pattern.idClean ? cleanFieldText(pattern.idSampleValue ?? '') : pattern.idSampleValue ?? '';
  const preview = expandImagePattern(pattern, sampleId || '{id}');
  const hasN = /\{n\}/.test(pattern.urlTemplate);

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted">
        For sites whose gallery images are broken but whose files follow a pattern. Use{' '}
        <code className="text-sky-300">{'{id}'}</code> for the per-product part and{' '}
        <code className="text-sky-300">{'{n}'}</code> for the image number.
      </p>

      {/* URL template */}
      <div>
        <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted">URL template</label>
        <textarea
          className="block w-full resize-y break-all rounded border border-line bg-bg px-2 py-1 font-mono text-[11px] text-sky-300 outline-none focus:border-sky2"
          rows={2}
          spellCheck={false}
          placeholder="https://shop.example.com/files/ITEM-{id}-{n}.jpg"
          value={pattern.urlTemplate}
          onChange={(e) => onUpdate({ urlTemplate: e.target.value })}
        />
      </div>

      {/* {id} source — picked from the page */}
      <div className="rounded-lg border border-line bg-bg p-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium text-ink">
            <Link2 className="h-3.5 w-3.5 text-sky2" /> Product ID <code className="text-sky-300">{'{id}'}</code>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant={armed ? 'blue' : 'secondary'}
              icon={<Crosshair className="h-3.5 w-3.5" />}
              onClick={onArmId}
            >
              {armed ? 'Picking…' : pattern.idSelector ? 'Re-pick' : 'Pick'}
            </Button>
            {pattern.idSelector && (
              <Button size="sm" variant="ghost" icon={<X className="h-3.5 w-3.5" />} onClick={onClearId} />
            )}
          </div>
        </div>
        {!pattern.idSelector ? (
          <p className="mt-1 text-[11px] text-muted">
            Click the element on the page that shows the product id (e.g. the SKU / item number).
          </p>
        ) : (
          <div className="mt-2 space-y-1">
            <code className="block break-all rounded bg-panel2 px-2 py-1 font-mono text-[11px] text-sky-300">
              {pattern.idSelector}
            </code>
            {pattern.idSampleValue && (
              <div className="text-[11px] text-muted">
                value: <span className="text-ink">“{pattern.idSampleValue}”</span>
                {sampleId !== pattern.idSampleValue && (
                  <span className="text-accent"> → “{sampleId}”</span>
                )}
              </div>
            )}
            <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted">
              <input
                type="checkbox"
                checked={!!pattern.idClean}
                onChange={(e) => onUpdate({ idClean: e.target.checked })}
                className="h-3.5 w-3.5 accent-accent"
              />
              Clean — keep only the value (drop a “Label:” / symbols)
            </label>
            {matches === 0 && (
              <div className="flex items-center gap-1 text-[11px] text-warn">
                <AlertCircle className="h-3 w-3" /> selector matches 0 elements on this page
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sequence controls (only meaningful when the template uses {n}) */}
      {hasN && (
        <div className="grid grid-cols-3 gap-2">
          <NumField
            label="Start at"
            value={pattern.start}
            min={0}
            onChange={(v) => onUpdate({ start: v })}
          />
          <NumField label="Pad" value={pattern.pad} min={0} max={6} onChange={(v) => onUpdate({ pad: v })} />
          <NumField
            label="Max images"
            value={pattern.count}
            min={1}
            max={50}
            onChange={(v) => onUpdate({ count: v })}
          />
        </div>
      )}

      {/* Live preview of the URLs that will be built */}
      {preview.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">
            Preview {hasN && <span className="normal-case">(stops at the first 404 when scraping)</span>}
          </div>
          <div className="space-y-1 rounded-lg border border-line bg-bg p-2">
            {preview.slice(0, 5).map((u, i) => (
              <code key={i} className="block break-all font-mono text-[11px] text-sky-300">
                {u}
              </code>
            ))}
            {preview.length > 5 && (
              <div className="text-[11px] text-muted">+{preview.length - 5} more…</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NumField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted">{label}</span>
      <input
        type="number"
        className="input h-8 text-sm"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
      />
    </label>
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
  onToggleClean,
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
  onToggleClean: () => void;
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
          {/* Clean toggle: when a value tag also holds its label (e.g.
              "Manufacturer: Clausing"), keep only the value. Off by default. */}
          {(field.type === 'text' || field.type === 'number') && (
            <label
              className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted"
              title="Strip a 'Label:' prefix and keep only the value — e.g. 'Manufacturer: Clausing' → 'Clausing'."
            >
              <input
                type="checkbox"
                checked={!!field.clean}
                onChange={onToggleClean}
                className="h-3.5 w-3.5 accent-accent"
              />
              Clean — keep only the value (drop the label)
            </label>
          )}
          {field.clean &&
            field.sampleValue &&
            cleanFieldText(field.sampleValue) !== field.sampleValue && (
              <div className="truncate text-[11px] text-accent" title="Cleaned value">
                → “{cleanFieldText(field.sampleValue)}”
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

      {/* Guidance for the table type: spec blocks often render the value as a
          bare text node next to a bold label, so it can't be picked alone —
          pick the whole block and every "Label: Value" row is captured. */}
      {field.type === 'table' && (
        <div className="mt-2 rounded border border-sky2/30 bg-sky-900/20 px-2 py-1.5 text-[11px] text-sky-200">
          Pick the <b>whole specifications block</b> (not each value). Every row —
          plain tables, <code>label/value</code> lists, or <code>Label: Value</code> text — is
          captured automatically into one object.
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
