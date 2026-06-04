import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function StatCard({
  label,
  value,
  icon,
  tone = 'default',
  hint,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  tone?: 'default' | 'accent' | 'sky' | 'warn' | 'danger';
  hint?: ReactNode;
}) {
  const toneRing: Record<string, string> = {
    default: 'text-muted',
    accent: 'text-accent',
    sky: 'text-sky2',
    warn: 'text-warn',
    danger: 'text-danger',
  };
  return (
    <div className="card flex items-center gap-4 p-4 transition-colors hover:border-line/80">
      {icon && (
        <div
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-panel2',
            toneRing[tone],
          )}
        >
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <div className="text-2xl font-bold leading-tight text-ink">{value}</div>
        <div className="truncate text-[11px] uppercase tracking-wide text-muted">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
      </div>
    </div>
  );
}
