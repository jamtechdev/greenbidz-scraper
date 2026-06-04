import { useRouteError, useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function RouteError() {
  const error = useRouteError() as Error;
  const navigate = useNavigate();

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-900/30 text-danger">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <div>
        <h1 className="text-lg font-bold text-ink">Something went wrong</h1>
        <p className="mt-1 max-w-md text-sm text-muted">
          {error?.message || 'An unexpected error occurred while rendering this page.'}
        </p>
      </div>
      <Button variant="secondary" onClick={() => navigate('/')}>
        Back to Dashboard
      </Button>
    </div>
  );
}
