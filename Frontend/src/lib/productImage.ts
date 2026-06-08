import { API_BASE } from './api';
import type { Product } from '@/types/api';

type ImgFields = Pick<Product, 'images_local_urls' | 'images_remote_urls'>;

/**
 * First display image for a product. Prefers a locally-downloaded image served
 * by the backend (/downloads/...), falling back to the remote source URL.
 */
export function productImageUrl(p: ImgFields): string | undefined {
  const local = p.images_local_urls?.[0];
  if (local) return `${API_BASE}${local}`;
  return p.images_remote_urls?.[0];
}

/** All display images (local preferred, else remote). */
export function productImageUrls(p: ImgFields): string[] {
  if (p.images_local_urls?.length) return p.images_local_urls.map((u) => `${API_BASE}${u}`);
  return p.images_remote_urls ?? [];
}
