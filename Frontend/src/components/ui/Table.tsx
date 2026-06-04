import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="sticky top-0 z-[1] bg-panel">
      <tr className="border-b border-line">{children}</tr>
    </thead>
  );
}

export function TH({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cn(
        'whitespace-nowrap px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function TR({
  children,
  onClick,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        'border-b border-line/60 transition-colors last:border-0',
        onClick && 'cursor-pointer hover:bg-panel2/60',
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function TD({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return <td className={cn('px-4 py-3 align-middle text-ink', className)}>{children}</td>;
}
