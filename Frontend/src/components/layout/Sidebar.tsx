import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/cn';
import { navGroups } from './nav';
import { useDashboardState } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { formatNumber } from '@/lib/format';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
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
  const { user, logout } = useAuth();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = () => {
    setLoggingOut(true);
    // Brief loading delay, then clear the session + toast (Toaster is mounted
    // at the app root, so the toast survives the re-render back to login).
    setTimeout(() => {
      logout();
      toast.success('Signed out');
    }, 1000);
  };

  const badgeValue = (key?: 'products' | 'profiles') => {
    if (key === 'products') return data?.counts.total;
    if (key === 'profiles') return data?.profiles.length;
    return undefined;
  };

  const initial = (user?.username || user?.email || 'A').trim().charAt(0).toUpperCase();

  return (
    <>
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

        {/* Signed-in admin + logout — pinned to the bottom */}
        {user && (
          <div className="border-t border-line p-3">
            {collapsed ? (
              <button
                onClick={() => setConfirmLogout(true)}
                title={`Sign out (${user.email})`}
                aria-label="Sign out"
                className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger/15 hover:text-danger"
              >
                <LogOut className="h-4 w-4" />
              </button>
            ) : (
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm font-bold uppercase text-accent">
                  {initial}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink">{user.username || 'Admin'}</div>
                  <div className="truncate text-[11px] text-muted" title={user.email}>
                    {user.email}
                  </div>
                </div>
                <button
                  onClick={() => setConfirmLogout(true)}
                  title="Sign out"
                  aria-label="Sign out"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger/15 hover:text-danger"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </aside>

      {/* Logout confirmation */}
      <Modal
        open={confirmLogout}
        onClose={() => !loggingOut && setConfirmLogout(false)}
        title="Sign out?"
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              disabled={loggingOut}
              onClick={() => setConfirmLogout(false)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={loggingOut}
              disabled={loggingOut}
              icon={<LogOut className="h-4 w-4" />}
              onClick={handleLogout}
            >
              {loggingOut ? 'Signing out…' : 'Sign out'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          You’ll be returned to the login screen and need to sign in again to access the scraper.
        </p>
      </Modal>
    </>
  );
}
