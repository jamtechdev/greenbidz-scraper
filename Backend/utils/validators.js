/**
 * @file utils/validators.js
 * @description URL, selector, and profile-structure validation helpers.
 */

/**
 * Validate that a string is a well-formed http(s) URL.
 * @param {string} url
 * @returns {boolean}
 */
export function isValidUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Best-effort check that a string looks like a usable CSS selector.
 * This does not guarantee the selector exists on a page — only that it is
 * syntactically plausible and not empty.
 * @param {string} selector
 * @returns {boolean}
 */
export function isValidSelector(selector) {
  if (typeof selector !== 'string' || !selector.trim()) return false;
  // Reject obviously broken selectors (unbalanced brackets).
  const open = (selector.match(/\[/g) || []).length;
  const close = (selector.match(/\]/g) || []).length;
  if (open !== close) return false;
  return true;
}

/**
 * Validate a regex pattern string (e.g. a urlPattern from a profile).
 * @param {string} pattern
 * @returns {boolean}
 */
export function isValidRegex(pattern) {
  if (typeof pattern !== 'string' || !pattern.trim()) return false;
  try {
    // eslint-disable-next-line no-new
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate the structure of a mapping profile object.
 * @param {object} profile
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateProfile(profile) {
  const errors = [];
  if (!profile || typeof profile !== 'object') {
    return { valid: false, errors: ['Profile is not an object.'] };
  }

  if (!profile.profileId) errors.push('Missing "profileId".');
  if (!profile.profileName) errors.push('Missing "profileName".');

  if (!profile.urlPattern) {
    errors.push('Missing "urlPattern".');
  } else if (!isValidRegex(profile.urlPattern)) {
    errors.push(`Invalid regex in "urlPattern": ${profile.urlPattern}`);
  }

  if (!profile.domain) errors.push('Missing "domain".');

  if (profile.source === 'api') {
    // API-source profiles are validated on their `api` block, not CSS fields.
    validateApiBlock(profile, errors);
  } else {
    // DOM-source profiles need a `fields` object of CSS selectors.
    validateDomFields(profile, errors);
    if (profile.selectors && typeof profile.selectors !== 'object') {
      errors.push('"selectors" must be an object if present.');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate the CSS-selector `fields` block of a DOM-source profile.
 * @param {object} profile
 * @param {string[]} errors - mutated in place.
 */
function validateDomFields(profile, errors) {
  if (!profile.fields || typeof profile.fields !== 'object') {
    errors.push('Missing or invalid "fields" object.');
    return;
  }
  for (const [name, def] of Object.entries(profile.fields)) {
    if (!def || typeof def !== 'object') {
      errors.push(`Field "${name}" is not an object.`);
      continue;
    }
    if (!def.selector || !isValidSelector(def.selector)) {
      errors.push(`Field "${name}" has missing/invalid "selector".`);
    }
    if (def.type && !['text', 'html', 'attr', 'number'].includes(def.type)) {
      errors.push(
        `Field "${name}" has invalid "type" (expected text|html|attr|number).`,
      );
    }
    if (def.type === 'attr' && !def.attr) {
      errors.push(`Field "${name}" type "attr" requires an "attr" name.`);
    }
  }
}

/**
 * Validate the `api` block of an API-source profile.
 * @param {object} profile
 * @param {string[]} errors - mutated in place.
 */
function validateApiBlock(profile, errors) {
  const api = profile.api;
  if (!api || typeof api !== 'object') {
    errors.push('API profile is missing the "api" block.');
    return;
  }
  const listing = api.listing;
  if (!listing || typeof listing !== 'object') {
    errors.push('Missing "api.listing" object.');
  } else {
    if (!listing.url || !isValidUrl(listing.url)) {
      errors.push('Missing/invalid "api.listing.url".');
    }
    if (!listing.productUrlTemplate || !listing.productUrlTemplate.includes('{id}')) {
      errors.push('"api.listing.productUrlTemplate" must contain "{id}".');
    }
    if (!listing.idField && !(api.fieldMap && api.fieldMap.externalId)) {
      errors.push('Provide "api.listing.idField" or "api.fieldMap.externalId".');
    }
  }
  if (!api.fieldMap || typeof api.fieldMap !== 'object') {
    errors.push('Missing "api.fieldMap" object.');
  } else if (!api.fieldMap.title) {
    errors.push('"api.fieldMap.title" is required (which record key holds the title).');
  }
}

/**
 * Extract the hostname (domain) from a URL.
 * @param {string} url
 * @returns {string|null}
 */
export function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export default { isValidUrl, isValidSelector, isValidRegex, validateProfile, extractDomain };
