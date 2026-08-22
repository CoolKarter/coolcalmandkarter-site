#!/usr/bin/env node
// Runs AFTER `astro build` (see package.json's "build" script) — never
// before, since Astro owns dist/ and this script only ever adds one file
// to an already-finalized build output, never generates anything Astro
// itself would need to see or could overwrite.
//
// Reads PUBLIC_API_BASE_URL from this build's actual environment (Netlify
// sets a different value per site — staging vs. a future production site
// each configure their own) and writes dist/_redirects proxying /api/* to
// that backend, so the browser sees My Orders requests as same-origin.
// Nothing about a specific backend host is ever hardcoded in this script
// or committed anywhere — see src/lib/api-redirects.js, which this only
// wires up to the filesystem.
//
// A misconfigured/missing PUBLIC_API_BASE_URL fails the build loudly
// (non-zero exit) rather than silently shipping a broken or absent proxy.
//
// Also appends the static book-slug rename redirects (see
// src/lib/book-slug-redirects.js) — permanent 301s from old book URLs to
// their new renamed-title URLs. These never depend on any environment
// variable, so they're identical in every build.

import { writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApiRedirectsRule } from '../src/lib/api-redirects.js';
import { buildBookSlugRedirectsRule } from '../src/lib/book-slug-redirects.js';

const webRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const distDir = path.join(webRoot, 'dist');

const result = buildApiRedirectsRule(process.env.PUBLIC_API_BASE_URL);

if (!result.ok) {
  console.error(`❌ Cannot generate Netlify API proxy redirect: ${result.error}`);
  console.error('   Set PUBLIC_API_BASE_URL (an HTTPS backend origin) for this build environment.');
  process.exit(1);
}

if (!existsSync(distDir)) {
  console.error(`❌ Cannot generate Netlify API proxy redirect: ${distDir} does not exist — run "astro build" first.`);
  process.exit(1);
}

const bookRedirects = buildBookSlugRedirectsRule();
const content = result.content + bookRedirects;

writeFileSync(path.join(distDir, '_redirects'), content, 'utf8');
console.log(`✅ Generated dist/_redirects — /api/* -> ${result.origin}/api/:splat`);
console.log(`✅ Added ${bookRedirects.trim().split('\n').length} permanent book-slug redirect(s)`);
