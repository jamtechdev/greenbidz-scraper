import type { ReactNode } from 'react';
import { Construction } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';

export function PlaceholderPage({
  title,
  description,
  phase,
  children,
}: {
  title: string;
  description: string;
  phase?: string;
  children?: ReactNode;
}) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <Card>
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-900/30 text-warn">
            <Construction className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium text-ink">Coming soon</p>
          <p className="max-w-md text-sm text-muted">
            This screen is part of {phase ?? 'a later phase'} of the rebuild. The backend pieces
            it depends on are not wired up yet.
          </p>
          {children}
        </div>
      </Card>
    </>
  );
}
