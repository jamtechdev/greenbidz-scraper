import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { ProductsPage } from '@/features/products/ProductsPage';
import { CrawlsPage } from '@/features/crawls/CrawlsPage';
import { MappingStudioPage } from '@/features/mapping-studio/MappingStudioPage';
import { ProfilesPage } from '@/features/profiles/ProfilesPage';
import { PlaceholderPage } from '@/features/PlaceholderPage';
import { RouteError } from '@/components/layout/RouteError';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'scraper/new', element: <MappingStudioPage /> },
      { path: 'products', element: <ProductsPage /> },
      { path: 'crawls', element: <CrawlsPage /> },
      {
        path: 'sources',
        element: (
          <PlaceholderPage
            title="Sources"
            description="Listing URLs to monitor — promote from .env into a managed table."
            phase="Phase 3"
          />
        ),
      },
      { path: 'profiles', element: <ProfilesPage /> },
      {
        path: 'pending',
        element: (
          <PlaceholderPage
            title="Pending Mappings"
            description="Review queue for unmatched URL patterns."
            phase="Phase 4"
          />
        ),
      },
      {
        path: 'scheduler',
        element: (
          <PlaceholderPage
            title="Scheduler"
            description="Background crawl scheduler — status, run-now, pause/resume."
            phase="Phase 3"
          />
        ),
      },
      {
        path: 'settings',
        element: (
          <PlaceholderPage
            title="Settings"
            description="Editable backend config (interval, image download, retries…)."
            phase="Phase 6"
          />
        ),
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
