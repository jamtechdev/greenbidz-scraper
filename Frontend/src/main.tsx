import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';

import { router } from './router';
import { queryClient } from './lib/queryClient';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginPage } from './features/auth/LoginPage';
import './index.css';

/** Show the login page until an admin is authenticated; then render the app. */
function AuthGate() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <RouterProvider router={router} /> : <LoginPage />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#1e293b',
            color: '#e2e8f0',
            border: '1px solid #334155',
            fontSize: '13px',
          },
          success: { iconTheme: { primary: '#22c55e', secondary: '#04210f' } },
          error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
        }}
      />
    </QueryClientProvider>
  </React.StrictMode>,
);
