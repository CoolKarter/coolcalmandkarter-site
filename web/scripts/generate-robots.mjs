#!/usr/bin/env node
// Runs AFTER `astro build` (see package.json's "build" script), same
// pattern as generate-redirects.mjs. Overwrites dist/robots.txt (Astro
// already copied the static web/public/robots.txt into dist/ during the
// build) with the correct environment-specific policy, driven by
// PUBLIC_SITE_ENV rather than left as whatever the static file happened to
// contain — so there is no "remember to swap robots.txt before
// production" step for a human to forget.
//
// A missing/unrecognized PUBLIC_SITE_ENV fails the build loudly (non-zero
// exit) rather than silently shipping a policy that could either leak
// staging into search results or block production from being indexed.

import { writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRobotsTxt, PRODUCTION_SITE_ENV } from '../src/lib/robots-policy.js';

const webRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const distDir = path.join(webRoot, 'dist');

// Matches astro.config.mjs's `site` value — the sitemap this build
// actually produces (see astro.config.mjs's comment: the sitemap always
// describes the production URL structure regardless of which environment
// is building it).
const PRODUCTION_SITEMAP_URL = 'https://coolcalmandkarter.com/sitemap-index.xml';

const siteEnv = process.env.PUBLIC_SITE_ENV;
const result = buildRobotsTxt({
  siteEnv,
  sitemapUrl: siteEnv === PRODUCTION_SITE_ENV ? PRODUCTION_SITEMAP_URL : undefined,
});

if (!result.ok) {
  console.error(`❌ Cannot generate robots.txt: ${result.error}`);
  console.error('   Set PUBLIC_SITE_ENV to "production" or "staging" for this build environment.');
  process.exit(1);
}

if (!existsSync(distDir)) {
  console.error(`❌ Cannot generate robots.txt: ${distDir} does not exist — run "astro build" first.`);
  process.exit(1);
}

writeFileSync(path.join(distDir, 'robots.txt'), result.content, 'utf8');
console.log(`✅ Generated dist/robots.txt for PUBLIC_SITE_ENV="${siteEnv}"`);
