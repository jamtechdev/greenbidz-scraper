// Admin auth against the main 101lab API, proxied through our backend
// (/api/auth/login) to avoid CORS. The scraper UI only admits role === 'admin'.
import { API_BASE } from './api';

export interface AuthUser {
  id?: number | string;
  email: string;
  username?: string;
  role: string;
}

export interface LoginResult {
  token: string;
  refreshToken?: string;
  role: string;
  user: AuthUser;
}

/** Pull a value from a few likely shapes of the main API login response. */
function pick<T>(...vals: (T | undefined | null)[]): T | undefined {
  return vals.find((v) => v !== undefined && v !== null) ?? undefined;
}

/**
 * POST credentials to the backend login proxy and normalise the main API's
 * (nested) response into { token, role, user }. Throws with a readable message
 * on HTTP error or an unsuccessful body.
 */
export async function loginRequest(email: string, password: string): Promise<LoginResult> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch (err) {
    throw new Error(`Network error — is the backend running? (${(err as Error).message})`);
  }

  const body = await res.json().catch(() => null);

  if (!res.ok || body?.success === false) {
    throw new Error(body?.message || body?.error || `Login failed (${res.status}).`);
  }

  // The main API nests differently across shapes; extract defensively.
  const token = pick<string>(body?.data?.token, body?.token);
  const refreshToken = pick<string>(body?.data?.refreshToken, body?.refreshToken);
  const role = pick<string>(body?.data?.data?.role, body?.data?.role, body?.role) ?? '';
  const rawUser = pick<Record<string, unknown>>(body?.data?.data?.user, body?.data?.user, body?.user) ?? {};

  if (!token) {
    throw new Error(body?.message || 'Login failed — no token returned.');
  }

  const user: AuthUser = {
    id: rawUser.id as number | string | undefined,
    email,
    username: rawUser.username as string | undefined,
    role,
  };

  return { token, refreshToken, role, user };
}
