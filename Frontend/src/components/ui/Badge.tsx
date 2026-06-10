import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'api' | 'dom' | 'yes' | 'no' | 'neutral' | 'warn' | 'info';

const tones: Record<Tone, string> = {
  api: 'bg-sky-900/60 text-sky-200 light:bg-sky-100 light:text-sky-700',
  dom: 'bg-amber-900/40 text-amber-200 light:bg-amber-100 light:text-amber-700',
  yes: 'bg-emerald-900/50 text-emerald-300 light:bg-emerald-100 light:text-emerald-700',
  no: 'bg-red-900/40 text-red-300 light:bg-red-100 light:text-red-700',
  neutral: 'bg-panel2 text-muted',
  warn: 'bg-amber-900/40 text-amber-200 light:bg-amber-100 light:text-amber-700',
  info: 'bg-sky-900/50 text-sky-200 light:bg-sky-100 light:text-sky-700',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
