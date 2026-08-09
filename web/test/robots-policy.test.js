import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRobotsTxt, PRODUCTION_SITE_ENV, STAGING_SITE_ENV, VALID_SITE_ENVS } from '../src/lib/robots-policy.js';

const SITEMAP_URL = 'https://coolcalmandkarter.com/sitemap-index.xml';

test('production: fully crawlable and advertises the real sitemap', () => {
  const result = buildRobotsTxt({ siteEnv: PRODUCTION_SITE_ENV, sitemapUrl: SITEMAP_URL });
  assert.equal(result.ok, true);
  assert.match(result.content, /^User-agent: \*/);
  assert.match(result.content, /Allow: \//);
});

test('production content never contains a Disallow directive', () => {
  const result = buildRobotsTxt({ siteEnv: PRODUCTION_SITE_ENV, sitemapUrl: SITEMAP_URL });
  assert.ok(!result.content.includes('Disallow'));
});

test('production content references the exact real generated sitemap filename (sitemap-index.xml), not a guess', () => {
  const result = buildRobotsTxt({ siteEnv: PRODUCTION_SITE_ENV, sitemapUrl: SITEMAP_URL });
  assert.match(result.content, /Sitemap: https:\/\/coolcalmandkarter\.com\/sitemap-index\.xml/);
});

test('production without a sitemapUrl fails clearly rather than silently omitting the Sitemap line', () => {
  const result = buildRobotsTxt({ siteEnv: PRODUCTION_SITE_ENV });
  assert.equal(result.ok, false);
  assert.match(result.error, /sitemapUrl/);
});

test('staging: disallows everything', () => {
  const result = buildRobotsTxt({ siteEnv: STAGING_SITE_ENV });
  assert.equal(result.ok, true);
  assert.match(result.content, /^User-agent: \*/);
  assert.match(result.content, /Disallow: \//);
});

test('staging never advertises any sitemap — not even the production one', () => {
  const result = buildRobotsTxt({ siteEnv: STAGING_SITE_ENV, sitemapUrl: SITEMAP_URL });
  assert.equal(result.ok, true);
  assert.ok(!result.content.toLowerCase().includes('sitemap'));
});

test('staging content never allows crawling', () => {
  const result = buildRobotsTxt({ siteEnv: STAGING_SITE_ENV });
  assert.ok(!result.content.includes('Allow: /'));
});

test('a missing siteEnv fails clearly rather than defaulting to either policy', () => {
  const result = buildRobotsTxt({});
  assert.equal(result.ok, false);
  assert.match(result.error, /PUBLIC_SITE_ENV/);
});

test('an unrecognized siteEnv value fails clearly rather than being silently treated as staging or production', () => {
  const result = buildRobotsTxt({ siteEnv: 'not-a-real-environment' });
  assert.equal(result.ok, false);
  assert.match(result.error, /PUBLIC_SITE_ENV/);
});

test('VALID_SITE_ENVS documents exactly the two supported values', () => {
  assert.deepEqual(VALID_SITE_ENVS.sort(), ['production', 'staging']);
});

test('production and staging produce genuinely different output — nothing hardcoded/shared by accident', () => {
  const prod = buildRobotsTxt({ siteEnv: PRODUCTION_SITE_ENV, sitemapUrl: SITEMAP_URL });
  const staging = buildRobotsTxt({ siteEnv: STAGING_SITE_ENV });
  assert.notEqual(prod.content, staging.content);
});
