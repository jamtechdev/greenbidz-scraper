import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { loginRequest, type AuthUser } from '@/lib/auth';

interface AuthState {
  token: string;
  user: AuthUser;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const STORAGE_KEY = 'gb_scraper_auth';

const AuthContext = createContext<AuthContextValue | null>(null);

/** Load a previously-stored admin session (only trust role === 'admin'). */
function loadStored(): AuthState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthState;
    if (parsed?.token && parsed?.user?.role === 'admin') return parsed;
  } catch {
    /* ignore malformed storage */
  }
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState | null>(loadStored);

  const login = useCallback(async (email: string, password: string) => {
    const result = await loginRequest(email, password);
    if (result.role !== 'admin') {
      throw new Error('Admin access only — this account does not have administrator rights.');
    }
    const next: AuthState = { token: result.token, user: result.user };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setState(next);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setState(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user: state?.user ?? null,
        token: state?.token ?? null,
        isAuthenticated: !!state,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
