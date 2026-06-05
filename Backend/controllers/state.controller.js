/**
 * @file controllers/state.controller.js — GET /api/state
 */
import { CONSTANTS } from '../config/constants.js';
import { countProducts, listPendingMappings } from '../database/queries.js';
import { readAllProfiles } from '../utils/file-manager.js';

export async function getState(req, res) {
  const [counts, profiles, pending] = await Promise.all([
    countProducts(),
    readAllProfiles(),
    listPendingMappings('pending').catch(() => []),
  ]);
  res.json({
    counts,
    profiles: profiles.map((p) => ({
      fileName: p.fileName,
      profileName: p.profile?.profileName,
      domain: p.profile?.domain,
      source: p.profile?.source || 'dom',
      urlPattern: p.profile?.urlPattern,
    })),
    pending,
    listingUrls: CONSTANTS.LISTING_URLS,
  });
}
