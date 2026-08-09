// Builds the Netlify `_redirects` rule that proxies /api/* on the Netlify
// origin through to the Express backend, so the browser sees My Orders
// authentication requests as same-origin (required for the HttpOnly
// session cookie — see Phase 13C's report for the full rationale).
//
// Deliberately never reads process.env itself — the caller (scripts/
// generate-redirects.mjs) passes in whatever PUBLIC_API_BASE_URL resolved
// to for that specific build, so staging and production each get their
// own generated file from their own environment configuration; nothing
// about a specific backend host is ever hardcoded here or committed.
//
// Plain JS (framework-free) so it's unit-testable with Node's built-in
// test runner — see web/test/api-redirects.test.js.

export function buildApiRedirectsRule(rawBackendUrl) {
  if (!rawBackendUrl || typeof rawBackendUrl !== 'string' || rawBackendUrl.trim() === '') {
    return { ok: false, error: 'PUBLIC_API_BASE_URL is not set.' };
  }

  let parsed;
  try {
    parsed = new URL(rawBackendUrl.trim());
  } catch {
    return { ok: false, error: `PUBLIC_API_BASE_URL is not a valid absolute URL: "${rawBackendUrl}"` };
  }

  if (parsed.protocol !== 'https:') {
    return {
      ok: false,
      error: `PUBLIC_API_BASE_URL must be an HTTPS origin for a production/staging build, got "${parsed.protocol}//..." from "${rawBackendUrl}"`,
    };
  }

  // .origin normalizes away any path, trailing slash, or query string —
  // only scheme+host+port survive, so a value like
  // "https://api.example.com/some/path/" produces the same correct rule
  // as "https://api.example.com".
  const origin = parsed.origin;
  const content = `/api/*  ${origin}/api/:splat  200\n`;

  return { ok: true, content, origin };
}
