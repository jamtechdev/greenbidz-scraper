import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { LayoutContext } from './layout-context';
import { cn } from '@/lib/cn';

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { pathname } = useLocation();

  // The Mapping Studio render screen wants the full viewport width.
  const wide = pathname.startsWith('/scraper');

  return (
    <LayoutContext.Provider value={{ collapsed, setCollapsed }}>
      <div className="flex h-full">
        {mobileOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/50 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        <Sidebar open={mobileOpen} collapsed={collapsed} onNavigate={() => setMobileOpen(false)} />

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar onMenu={() => setMobileOpen((v) => !v)} />
          <main className="flex-1 overflow-y-auto">
            <div className={cn(wide ? 'w-full p-4 lg:p-5' : 'mx-auto max-w-7xl p-4 lg:p-6')}>
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </LayoutContext.Provider>
  );
}
