/**
 * @file services/normalize.js
 * @description Intelligent "simplify" helpers that turn messy scraped values
 * into the clean shapes the main GreenBidz API expects. They are deliberately
 * tolerant: a site that returns clean data (e.g. quantity "1", condition "New")
 * passes straight through, while a site that returns markup or prose
 * (e.g. "<span>Available quantity:</span>1", "Used. Untested.") is simplified.
 *
 * Used at sync-time by syncMapper so the stored raw_data stays faithful to what
 * was scraped — only the outgoing payload is normalised.
 */

/** Strip HTML tags + decode a few common entities, collapse whitespace. */
export function stripHtml(input) {
  if (input == null) return '';
  return String(input)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Plain trimmed text (HTML stripped). Returns null when empty. */
export function cleanText(input) {
  const t = stripHtml(input);
  return t || null;
}

/**
 * Reduce a quantity value to a positive integer string. Handles clean input
 * ("1"), labelled markup ("<span>Available quantity:</span>1"), and prose
 * ("Qty: 3 pcs"). Returns null when no number is found.
 * @param {*} raw
 * @returns {string|null}
 */
export function simplifyQuantity(raw) {
  const text = stripHtml(raw);
  if (!text) return null;
  // Prefer a number that follows a "quantity/qty" label, else the first integer.
  const labelled = text.match(/(?:quantit(?:y|ies)|qty)[^\d]*(\d[\d,]*)/i);
  const m = labelled || text.match(/(\d[\d,]*)/);
  if (!m) return null;
  const n = parseInt(m[1].replace(/,/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? String(n) : null;
}

/**
 * Map free-form condition text to the main API's two codes. Returns
 * 'new' | 'usedFunctional', or null when nothing recognisable is present.
 * @param {*} raw
 * @returns {'new'|'usedFunctional'|null}
 */
export function normalizeCondition(raw) {
  const t = stripHtml(raw).toLowerCase();
  if (!t) return null;
  // Unambiguous "new" signals first (so "unopened"/"sealed" win over a stray word).
  if (/\bunopened\b|\bsealed\b|\bbrand[\s-]?new\b|\bfactory[\s-]?sealed\b|\bunused\b|\bmint\b/.test(t)) {
    return 'new';
  }
  // Used / functional signals.
  if (/\bused\b|\brefurb\w*|\bpre[\s-]?owned\b|\bsecond[\s-]?hand\b|\buntested\b|\bas[\s-]?is\b|\bfor parts\b|\bworking\b|\bfunctional\b|\bfair\b|\brefurbished\b|\bgood condition\b/.test(t)) {
    return 'usedFunctional';
  }
  // Plain "new" last.
  if (/\bnew\b/.test(t)) return 'new';
  return null;
}

/**
 * Extract a numeric weight from messy text ("2.6", "2.6 kg", "12,5 lbs").
 * Unit is left to the API field (weight_per_unit is a bare float). Null if none.
 * @param {*} raw
 * @returns {number|null}
 */
export function parseWeight(raw) {
  const t = stripHtml(raw);
  if (!t) return null;
  // Accept "2.6" or European "12,5" — normalise comma decimals.
  const m = t.match(/(\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * Find the value of the first spec whose label matches any of the given regex
 * patterns (in priority order). Spec keys vary per site — "Manufacturer" vs
 * "Brand", "Size" vs "Dimensions" — so callers pass a small pattern list.
 * @param {Record<string, unknown>} specs
 * @param {RegExp[]} patterns - tried in order; first match wins.
 * @returns {string|null}
 */
export function findSpec(specs, patterns) {
  if (!specs || typeof specs !== 'object') return null;
  const keys = Object.keys(specs);
  for (const pat of patterns) {
    const key = keys.find((k) => pat.test(k));
    if (key != null) {
      const v = cleanText(specs[key]);
      // Skip obvious non-values like "N/A" / "-".
      if (v && !/^(n\/?a|na|none|-|—)$/i.test(v)) return v;
    }
  }
  return null;
}

export default {
  stripHtml,
  cleanText,
  simplifyQuantity,
  normalizeCondition,
  parseWeight,
  findSpec,
};
