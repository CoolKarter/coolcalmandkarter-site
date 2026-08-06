'use strict';

// Origins that are always allowed, regardless of environment configuration.
const BASE_ALLOWED_ORIGINS = [
  'http://127.0.0.1:5500',
  'http://localhost:3000',
  'https://coolcalmandkarter.netlify.app',
  'https://coolcalmandkarter.com',
];

/**
 * Normalizes a URL string down to just its origin (scheme + host + port)
 * using the URL API, so this can only ever produce an exact origin — never
 * a partial/substring match. Returns null for anything that isn't a valid
 * absolute http(s) URL, so a missing or misconfigured FRONTEND_BASE_URL
 * can never silently allow an unintended origin or crash the server.
 */
function normalizeOrigin(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;

  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

  return parsed.origin;
}

/**
 * Builds the full list of allowed CORS origins: the fixed base list plus,
 * if configured, the origin derived from FRONTEND_BASE_URL — so a staging
 * (or any other) deploy's frontend URL is allowed automatically without
 * ever hardcoding it in source.
 */
function getAllowedOrigins(env = process.env) {
  const origins = new Set(BASE_ALLOWED_ORIGINS);

  const frontendOrigin = normalizeOrigin(env.FRONTEND_BASE_URL);
  if (frontendOrigin) {
    origins.add(frontendOrigin);
  }

  return [...origins];
}

module.exports = { BASE_ALLOWED_ORIGINS, normalizeOrigin, getAllowedOrigins };
