import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { navGroups } from './nav';
import { useDashboardState } from '@/hooks/useApi';
import { formatNumber } from '@/lib/format';
import logoUrl from '@/assets/greenbidz_logo.png';

export function Sidebar({
  open,
  collapsed,
  onNavigate,
}: {
  open: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const { data } = useDashboardState();

  const badgeValue = (key?: 'products' | 'profiles') => {
    if (key === 'products') return data?.counts.total;
    if (key === 'profiles') return data?.profiles.length;
    return undefined;
  };

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-line bg-panel transition-all duration-200 lg:static lg:translate-x-0',
        open ? 'translate-x-0' : '-translate-x-full',
        collapsed && 'lg:w-16',
      )}
    >
      {/* Brand */}
      <div className={cn('flex h-16 items-center justify-center gap-3 border-b border-line px-5', collapsed && 'lg:px-0')}>
        {/* Collapsed: white chip cropped to the network mark on the left of the logo. */}
        <div className={cn('hidden h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-white', collapsed ? 'lg:block' : 'lg:hidden')}>
          <img src={logoUrl} alt="GreenBidz" className="h-full w-auto max-w-none" />
        </div>
        {/* Expanded: full logo on a white chip (navy logo needs a light backdrop). */}
        <div className={cn('flex items-center rounded-lg bg-white px-6 py-1', collapsed && 'lg:hidden')}>
          <img src={logoUrl} alt="GreenBidz" className="h-10 max-w-full w-auto" />
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {navGroups.map((group) => (
          <div key={group.heading} className="mb-5">
            <div
              className={cn(
                'px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted/70',
                collapsed && 'lg:hidden',
              )}
            >
              {group.heading}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  title={collapsed ? item.label : undefined}
                  className={({ isActive }) =>
                    cn(
                      'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      collapsed && 'lg:justify-center lg:px-0',
                      isActive
                        ? 'bg-accent/15 text-accent'
                        : 'text-muted hover:bg-panel2 hover:text-ink',
                    )
                  }
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className={cn('flex-1', collapsed && 'lg:hidden')}>{item.label}</span>
                  {item.soon && (
                    <span
                      className={cn(
                        'rounded bg-panel2 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-muted',
                        collapsed && 'lg:hidden',
                      )}
                    >
                      soon
                    </span>
                  )}
                  {item.badge && badgeValue(item.badge) != null && (
                    <span
                      className={cn(
                        'ml-auto rounded-full bg-panel2 px-2 py-0.5 text-[10px] font-semibold text-ink',
                        collapsed && 'lg:hidden',
                      )}
                    >
                      {formatNumber(badgeValue(item.badge))}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
