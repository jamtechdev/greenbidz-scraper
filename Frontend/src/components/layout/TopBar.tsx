import { Menu, RefreshCw, Circle, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { useDashboardState } from '@/hooks/useApi';
import { useLayout } from './layout-context';

export function TopBar({ onMenu }: { onMenu: () => void }) {
  const fetching = useIsFetching() > 0;
  const qc = useQueryClient();
  const { isError } = useDashboardState();
  const { collapsed, setCollapsed } = useLayout();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-bg/80 px-4 backdrop-blur lg:px-6">
      <button
        onClick={onMenu}
        className="rounded-lg p-2 text-muted hover:bg-panel2 hover:text-ink lg:hidden"
        aria-label="Toggle menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <button
        onClick={() => setCollapsed(!collapsed)}
        className="hidden rounded-lg p-2 text-muted hover:bg-panel2 hover:text-ink lg:inline-flex"
        aria-label="Toggle sidebar"
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
      </button>

      <div className="flex-1" />

      {/* Backend status light (red = offline, green = connected) */}
      <span
        className="flex items-center rounded-full border border-line bg-panel p-2"
        title={isError ? 'Backend offline' : 'Backend connected'}
        aria-label={isError ? 'Backend offline' : 'Backend connected'}
      >
        <Circle
          className={
            isError
              ? 'h-2.5 w-2.5 fill-danger text-danger'
              : 'h-2.5 w-2.5 fill-accent text-accent'
          }
        />
      </span>

      <Button
        variant="secondary"
        size="sm"
        icon={<RefreshCw className={fetching ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />}
        onClick={() => qc.invalidateQueries()}
      >
        Refresh
      </Button>
    </header>
  );
}
