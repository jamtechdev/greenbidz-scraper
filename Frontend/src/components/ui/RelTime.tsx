import { timeAgo, timeUntil, formatDateAbsolute } from '@/lib/format';

/**
 * Renders a relative time ("3m ago" / "in 2h") with the exact, unambiguous
 * timestamp exposed on hover via the native `title` tooltip. Use this anywhere
 * a relative time is shown so users can always recover the precise moment.
 */
export function RelTime({
  iso,
  mode = 'ago',
  fallback = '—',
  className,
}: {
  iso: string | null | undefined;
  mode?: 'ago' | 'until';
  fallback?: string;
  className?: string;
}) {
  if (!iso) return <span className={className}>{fallback}</span>;
  const rel = mode === 'until' ? timeUntil(iso) : timeAgo(iso);
  return (
    <span className={className} title={formatDateAbsolute(iso)}>
      {rel}
    </span>
  );
}
