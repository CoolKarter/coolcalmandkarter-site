// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// `site` is the canonical production URL — required for @astrojs/sitemap
// to generate absolute URLs at all (without it, the integration silently
// skips generation entirely, which is what was happening before this).
// Deliberately always the production domain, even for a staging build:
// the sitemap's job is to describe the site's real canonical URL
// structure, not whichever host happens to be building it. Staging is kept
// out of search results separately, via scripts/generate-robots.mjs
// overriding dist/robots.txt to Disallow everything on that build instead.
export default defineConfig({
  site: 'https://coolcalmandkarter.com',
  integrations: [sitemap()],
});
