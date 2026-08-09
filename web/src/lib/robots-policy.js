// Pure, build-time robots.txt generation for the two deploy contexts this
// site builds for — see scripts/generate-robots.mjs, the only caller,
// which writes this module's output to dist/robots.txt AFTER `astro
// build` (mirroring api-redirects.js/generate-redirects.mjs's existing
// pattern exactly).
//
// A single committed robots.txt can't say "production = index, staging =
// don't" by itself, so this is driven by an explicit PUBLIC_SITE_ENV
// build variable rather than guessed from the hostname (a brittle signal
// this site doesn't otherwise depend on anywhere). Required, not
// optional — see generate-robots.mjs, which fails the build loudly on a
// missing/unrecognized value instead of silently shipping a robots.txt
// that could either leak staging into search results or accidentally
// block production.

export const PRODUCTION_SITE_ENV = 'production';
export const STAGING_SITE_ENV = 'staging';
export const VALID_SITE_ENVS = [PRODUCTION_SITE_ENV, STAGING_SITE_ENV];

/**
 * Builds the exact robots.txt content for the given deploy context.
 *
 * production: fully crawlable, advertises the real sitemap.
 * staging: disallows everything and never advertises any sitemap at all —
 *   a crawler that somehow still reached staging should find nothing
 *   pointing it toward more pages, let alone the production sitemap URL.
 *
 * Returns `{ ok: false, error }` for a missing/unrecognized siteEnv (or a
 * production siteEnv with no sitemapUrl) rather than guessing a default.
 */
export function buildRobotsTxt({ siteEnv, sitemapUrl } = {}) {
  if (siteEnv === PRODUCTION_SITE_ENV) {
    if (!sitemapUrl || typeof sitemapUrl !== 'string' || sitemapUrl.trim() === '') {
      return { ok: false, error: 'A sitemapUrl is required to build the production robots.txt.' };
    }
    return {
      ok: true,
      content: `User-agent: *\nAllow: /\n\nSitemap: ${sitemapUrl}\n`,
    };
  }

  if (siteEnv === STAGING_SITE_ENV) {
    return {
      ok: true,
      content: `User-agent: *\nDisallow: /\n`,
    };
  }

  return {
    ok: false,
    error: `PUBLIC_SITE_ENV must be one of: ${VALID_SITE_ENVS.join(', ')}. Got: ${JSON.stringify(siteEnv)}.`,
  };
}
