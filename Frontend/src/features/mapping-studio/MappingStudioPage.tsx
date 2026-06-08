import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Link as LinkIcon, AlertTriangle, Play, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/layout/PageHeader';
import { useLayout } from '@/components/layout/layout-context';
import { useProfiles, useRunProfile } from '@/hooks/useApi';
import { useScrapeLock, formatRemaining } from '@/hooks/useScrapeLock';
import type { ProfileListItem } from '@/types/api';
import { useSelectorBridge } from './useSelectorBridge';
import { PagePreview } from './PagePreview';
import { FieldPanel } from './FieldPanel';
import { ReviewStep } from './ReviewStep';
import {
  emptyDraft,
  generalizeNextSelector,
  generalizeProductLink,
  IMAGES_KEY,
  NEXT_KEY,
  PRODUCT_LINK_KEY,
  type FieldType,
  type MappingDraft,
  type PickedMessage,
} from './types';

const STEPS = ['URLs', 'Listing', 'Fields', 'Review'] as const;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function normHost(url: string): string {
  return hostOf(url).replace(/^www\./, '').toLowerCase();
}

export function MappingStudioPage() {
  const [draft, setDraft] = useState<MappingDraft>(emptyDraft);
  const [step, setStep] = useState(0);
  const [armedKey, setArmedKey] = useState<string | null>(null);
  const [loadingPage, setLoadingPage] = useState(false);
  const [hoverText, setHoverText] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [overrideAck, setOverrideAck] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detect an existing profile for the entered listing URL's domain.
  const profiles = useProfiles().data?.profiles ?? [];
  const matchedProfile = useMemo(() => {
    const host = normHost(draft.listingUrl);
    if (!host) return null;
    return profiles.find((p) => p.domain && normHost(`http://${p.domain}`) === host) ?? null;
  }, [profiles, draft.listingUrl]);

  // Re-require the choice if the URL changes.
  useEffect(() => setOverrideAck(false), [draft.listingUrl]);

  const update = useCallback((patch: Partial<MappingDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
  }, []);

  // ── picking ──────────────────────────────────────────────────────────────────
  const onPicked = useCallback(
    (m: PickedMessage) => {
      const { field, payload, items } = m;
      if (field === PRODUCT_LINK_KEY) {
        // Generalize: a single clicked card → a selector + pattern matching ALL cards.
        const gen = payload.href ? generalizeProductLink(payload.href) : null;
        setDraft((d) => ({
          ...d,
          productLinkSelector: gen?.linkSelector || payload.selector,
          productUrlPattern: gen?.productUrlPattern || d.productUrlPattern,
          urlPattern: gen?.urlPattern || d.urlPattern,
          sampleProductUrl: d.sampleProductUrl || payload.href || '',
          domain: d.domain || hostOf(payload.href || ''),
        }));
        setArmedKey(null);
      } else if (field === NEXT_KEY) {
        update({ nextSelector: generalizeNextSelector(payload) });
        setArmedKey(null);
      } else if (field === IMAGES_KEY) {
        update({
          images: items.map((it) => ({
            selector: it.selector,
            src: it.imgSrc,
            classes: it.classes,
          })),
        });
        // stay armed for further multi-picks
      } else {
        setDraft((d) => ({
          ...d,
          fields: d.fields.map((f) =>
            f.key === field
              ? { ...f, selector: payload.selector, xpath: payload.xpath ?? undefined, sampleValue: payload.text }
              : f,
          ),
        }));
        setArmedKey(null);
      }
    },
    [update],
  );

  const bridge = useSelectorBridge({
    onPicked,
    onReady: () => {
      if (loadTimer.current) clearTimeout(loadTimer.current);
      setLoadingPage(false);
      setLoadError(null);
    },
    onHover: (m) => setHoverText(m.text),
  });

  const { arm: armBridge, disarm, clear: clearBridge, countMatches } = bridge;

  const arm = useCallback(
    (key: string) => {
      setArmedKey(key);
      armBridge(key, { multi: key === IMAGES_KEY });
    },
    [armBridge],
  );

  const clear = useCallback(
    (key: string) => {
      if (key === PRODUCT_LINK_KEY) update({ productLinkSelector: undefined });
      else if (key === NEXT_KEY) update({ nextSelector: undefined });
      else if (key === IMAGES_KEY) update({ images: [] });
      else
        setDraft((d) => ({
          ...d,
          fields: d.fields.map((f) =>
            f.key === key ? { ...f, selector: undefined, xpath: undefined, sampleValue: undefined } : f,
          ),
        }));
      clearBridge(key);
      if (armedKey === key) {
        setArmedKey(null);
        disarm();
      }
    },
    [armedKey, clearBridge, disarm, update],
  );

  // ── field editing ─────────────────────────────────────────────────────────────
  const addCustom = useCallback((label: string) => {
    const key = label.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').toLowerCase() || 'field';
    setDraft((d) =>
      d.fields.some((f) => f.key === key)
        ? d
        : { ...d, fields: [...d.fields, { key, label, type: 'text', required: false, builtin: false }] },
    );
  }, []);
  const removeField = useCallback((key: string) => {
    setDraft((d) => ({ ...d, fields: d.fields.filter((f) => f.key !== key) }));
  }, []);
  const toggleRequired = useCallback((key: string) => {
    setDraft((d) => ({
      ...d,
      fields: d.fields.map((f) => (f.key === key ? { ...f, required: !f.required } : f)),
    }));
  }, []);
  const setType = useCallback((key: string, type: FieldType) => {
    setDraft((d) => ({ ...d, fields: d.fields.map((f) => (f.key === key ? { ...f, type } : f)) }));
  }, []);
  const removeImage = useCallback((index: number) => {
    setDraft((d) => ({ ...d, images: d.images.filter((_, i) => i !== index) }));
  }, []);

  // ── current page src ───────────────────────────────────────────────────────────
  const targetUrl = step === 1 ? draft.listingUrl : step === 2 ? draft.sampleProductUrl : '';
  const src = useMemo(
    () => (targetUrl ? `${api.proxyPageSrc(targetUrl)}&_n=${reloadNonce}` : null),
    [targetUrl, reloadNonce],
  );

  // Reset interaction state whenever the loaded page changes, and arm a timeout
  // so a page that never finishes rendering surfaces an error (not an endless spinner).
  useEffect(() => {
    if (!src) return undefined;
    setLoadingPage(true);
    setLoadError(null);
    setArmedKey(null);
    setHoverText(null);
    if (loadTimer.current) clearTimeout(loadTimer.current);
    loadTimer.current = setTimeout(() => {
      setLoadingPage(false);
      setLoadError(
        'This page took too long to render. It may be very slow or blocking automated access — try Reload, or check the URL.',
      );
    }, 90000);
    return () => {
      if (loadTimer.current) clearTimeout(loadTimer.current);
    };
  }, [src]);

  // Navigate the preview's address bar to a new URL (updates the step's target).
  const onNavigate = useCallback(
    (u: string) => {
      if (step === 1) update({ listingUrl: u });
      else if (step === 2) update({ sampleProductUrl: u });
    },
    [step, update],
  );

  // Fail fast when the backend returns its "could not render" HTML page.
  const onRenderError = useCallback((msg: string) => {
    if (loadTimer.current) clearTimeout(loadTimer.current);
    setLoadingPage(false);
    setLoadError(msg);
  }, []);

  // Collapse the sidebar while the render screen is shown (steps 1 & 2) so the
  // external website gets a big canvas; restore it elsewhere and on unmount.
  const { setCollapsed } = useLayout();
  useEffect(() => {
    setCollapsed(step === 1 || step === 2);
  }, [step, setCollapsed]);
  useEffect(() => () => setCollapsed(false), [setCollapsed]);

  // ── step navigation ──────────────────────────────────────────────────────────
  const goNext = () => {
    if (step === 0) {
      update({ domain: draft.domain || hostOf(draft.listingUrl || draft.sampleProductUrl) });
    }
    setArmedKey(null);
    disarm();
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };
  const goBack = () => {
    setArmedKey(null);
    disarm();
    setStep((s) => Math.max(0, s - 1));
  };

  const canNext =
    step === 0
      ? isHttpUrl(draft.listingUrl) && (!matchedProfile || overrideAck)
      : step === 1
        ? isHttpUrl(draft.sampleProductUrl)
        : true;

  const armedLabel =
    armedKey === IMAGES_KEY
      ? 'Images'
      : armedKey === PRODUCT_LINK_KEY
        ? 'Product link'
        : armedKey === NEXT_KEY
          ? 'Next page'
          : armedKey
            ? draft.fields.find((f) => f.key === armedKey)?.label
            : null;

  return (
    <>
      <PageHeader
        title="New Scraper — Visual Mapping Studio"
        description="Load a page, click elements to map them to product fields, then save a scraping profile."
      />

      <Stepper step={step} />

      <div className="mt-5">
        {step === 0 && (
          <UrlStep
            draft={draft}
            update={update}
            matchedProfile={matchedProfile}
            overrideAck={overrideAck}
            onOverride={() => setOverrideAck(true)}
          />
        )}

        {(step === 1 || step === 2) && (
          <div className="grid h-[calc(100vh-340px)] min-h-[480px] grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
            <div className="card overflow-y-auto p-4">
              <FieldPanel
                mode={step === 1 ? 'listing' : 'fields'}
                draft={draft}
                armedKey={armedKey}
                onArm={arm}
                onClear={clear}
                onAddCustom={addCustom}
                onRemoveField={removeField}
                onToggleRequired={toggleRequired}
                onSetType={setType}
                onRemoveImage={removeImage}
                onSetCurrency={(c) => update({ priceCurrency: c })}
                countMatches={countMatches}
              />
            </div>
            <PagePreview
              iframeRef={bridge.iframeRef}
              src={src}
              loading={loadingPage}
              error={loadError}
              armedLabel={armedLabel}
              hoverText={hoverText}
              url={targetUrl}
              onReload={() => setReloadNonce((n) => n + 1)}
              onNavigate={onNavigate}
              onRenderError={onRenderError}
            />
          </div>
        )}

        {step === 3 && <ReviewStep draft={draft} onChange={update} />}
      </div>

      {/* Footer nav */}
      {step < 3 && (
        <div className="mt-5 flex items-center justify-between">
          <Button variant="secondary" icon={<ArrowLeft className="h-4 w-4" />} onClick={goBack} disabled={step === 0}>
            Back
          </Button>
          <Button onClick={goNext} disabled={!canNext}>
            {step === 2 ? 'Review & Save' : 'Next'}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}
      {step === 3 && (
        <div className="mt-5">
          <Button variant="secondary" icon={<ArrowLeft className="h-4 w-4" />} onClick={goBack}>
            Back to fields
          </Button>
        </div>
      )}
    </>
  );
}

function isHttpUrl(u: string): boolean {
  try {
    const p = new URL(u);
    return p.protocol === 'http:' || p.protocol === 'https:';
  } catch {
    return false;
  }
}

function Stepper({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div
            className={cn(
              'flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
              i === step
                ? 'border-accent bg-accent/15 text-accent'
                : i < step
                  ? 'border-line bg-panel2 text-ink'
                  : 'border-line bg-panel text-muted',
            )}
          >
            <span
              className={cn(
                'flex h-5 w-5 items-center justify-center rounded-full text-[10px]',
                i < step ? 'bg-accent text-accent-ink' : i === step ? 'bg-accent/30' : 'bg-line/60',
              )}
            >
              {i < step ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            {label}
          </div>
          {i < STEPS.length - 1 && <div className="h-px w-5 bg-line" />}
        </div>
      ))}
    </div>
  );
}

function UrlStep({
  draft,
  update,
  matchedProfile,
  overrideAck,
  onOverride,
}: {
  draft: MappingDraft;
  update: (p: Partial<MappingDraft>) => void;
  matchedProfile: ProfileListItem | null;
  overrideAck: boolean;
  onOverride: () => void;
}) {
  const navigate = useNavigate();
  const run = useRunProfile();
  const lock = useScrapeLock(matchedProfile?.fileName ?? '');

  const onScrapeExisting = () => {
    if (!matchedProfile) return;
    run.mutate(matchedProfile.fileName, {
      onSuccess: () => {
        lock.lock();
        navigate('/products');
      },
    });
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="card p-6">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-ink">
          <LinkIcon className="h-4 w-4 text-sky2" /> Enter the page URLs
        </div>
        <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted">
          Listing URL (product list) *
        </label>
        <input
          className="input"
          placeholder="https://101lab.co/buyer-marketplace"
          value={draft.listingUrl}
          onChange={(e) => update({ listingUrl: e.target.value })}
        />

        {matchedProfile && !overrideAck && (
          <div className="mt-4 rounded-lg border border-warn/40 bg-amber-900/20 p-3">
            <div className="flex items-start gap-2 text-xs text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                A profile already matches this URL:{' '}
                <code className="font-mono">{matchedProfile.fileName}</code>
                {matchedProfile.profileName ? ` (${matchedProfile.profileName})` : ''}. Rebuilding
                and saving with the same domain will <b>overwrite</b> it.
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                icon={run.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                onClick={onScrapeExisting}
                loading={run.isPending}
                disabled={lock.locked || matchedProfile.listingUrls.length === 0}
              >
                {lock.locked ? `Scraping… ${formatRemaining(lock.remainingMs)}` : 'Scrape new products'}
              </Button>
              <Button size="sm" variant="secondary" onClick={onOverride}>
                Override (rebuild profile)
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-amber-200/70">
              “Scrape new products” runs the existing profile now. “Override” lets you re-map and
              overwrite it.
            </p>
          </div>
        )}
        {matchedProfile && overrideAck && (
          <p className="mt-3 text-[11px] text-warn">
            Overwriting <code className="font-mono">{matchedProfile.fileName}</code> on save.
          </p>
        )}
        {/* <label className="mb-1 mt-4 block text-[11px] uppercase tracking-wide text-muted">
          Sample product URL (optional — auto-filled when you pick a product link)
        </label>
        <input
          className="input"
          placeholder="https://101lab.co/buyer-marketplace/2473"
          value={draft.sampleProductUrl}
          onChange={(e) => update({ sampleProductUrl: e.target.value })}
        />
        <p className="mt-4 text-xs text-muted">
          The listing URL is where products are listed (and paginated). On the next step you'll
          visually pick a product link and the “Next page” control; then you'll map the detail
          fields on a sample product page.
        </p> */}
      </div>
    </div>
  );
}
