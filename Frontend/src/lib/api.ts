// Thin fetch wrapper + typed endpoint functions. All requests go to /api/*,
// which Vite proxies to the backend (http://localhost:4000) in dev.

import type {
  CrawlHistoryResponse,
  DomProfile,
  Product,
  ProductsResponse,
  ProfilesResponse,
  RunProfileResponse,
  SaveProfileResponse,
  ScrapeProgressResponse,
  StateResponse,
  UrlPatternResponse,
} from '@/types/api';

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
  } catch (err) {
    throw new ApiError(
      `Network error — is the backend running on :4000? (${(err as Error).message})`,
      0,
    );
  }

  const text = await res.text();
  const body = text ? safeParse(text) : null;

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    if (body && typeof body === 'object' && 'error' in body) {
      message = String((body as { error: unknown }).error);
    }
    throw new ApiError(message, res.status, body);
  }
  return body as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export interface ProductsQuery {
  limit?: number;
  scrapedOnly?: boolean;
}

export const api = {
  getState: () => request<StateResponse>('/state'),

  getProducts: (q: ProductsQuery = {}) => {
    const params = new URLSearchParams();
    if (q.limit) params.set('limit', String(q.limit));
    if (q.scrapedOnly) params.set('scrapedOnly', 'true');
    const qs = params.toString();
    return request<ProductsResponse>(`/products${qs ? `?${qs}` : ''}`);
  },

  getProduct: (id: number) => request<{ product: Product }>(`/products/${id}`),

  getCrawlHistory: (limit = 100) =>
    request<CrawlHistoryResponse>(`/crawl-history?limit=${limit}`),

  runScrape: (listingUrl: string) =>
    request<{ ok: boolean; summary: unknown; counts: unknown }>('/scrape', {
      method: 'POST',
      body: JSON.stringify({ listingUrl }),
    }),

  // ── Mapping Studio (Phase 2) ────────────────────────────────────────────────

  /** Same-origin proxied snapshot URL for the Studio iframe (loaded directly). */
  proxyPageSrc: (url: string) => `/api/proxy-page?url=${encodeURIComponent(url)}`,

  getUrlPattern: (url: string) =>
    request<UrlPatternResponse>('/url-pattern', {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),

  saveProfile: (fileName: string | null, profile: DomProfile, runNow = true) =>
    request<SaveProfileResponse>('/save-profile', {
      method: 'POST',
      body: JSON.stringify({ fileName, profile, runNow }),
    }),

  getProfiles: () => request<ProfilesResponse>('/profiles'),

  runProfile: (fileName: string) =>
    request<RunProfileResponse>('/run-profile', {
      method: 'POST',
      body: JSON.stringify({ fileName }),
    }),

  getScrapeProgress: (id: string) =>
    request<ScrapeProgressResponse>(`/scrape-progress?id=${encodeURIComponent(id)}`),

  cancelScrape: (id: string) =>
    request<{ ok: boolean }>('/scrape-cancel', {
      method: 'POST',
      body: JSON.stringify({ id }),
    }),
};
