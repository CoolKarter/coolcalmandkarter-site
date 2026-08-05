'use strict';

// Server-side source of truth for what can be checked out. Slugs match the
// Astro content collection ids (web/src/content/books/*.md) so the two
// systems stay aligned without sharing code between the two projects.
//
// Real Stripe Price IDs are never hardcoded here — each book's Price ID
// lives in its own environment variable, so test-mode and live-mode
// deployments (and the 7 books that don't have real Price IDs yet) can
// each supply only what they actually have, with no code change. A book
// with an unset/empty env var is simply disabled for checkout.
const CATALOG_DEFINITIONS = [
  {
    slug: 'florida-beach-and-baby',
    title: 'Florida, Beach & Baby',
    priceEnvVar: 'STRIPE_PRICE_FLORIDA_BEACH_AND_BABY',
  },
  {
    slug: 'black-beautiful-and-baby',
    title: 'Black, Beautiful & Baby',
    priceEnvVar: 'STRIPE_PRICE_BLACK_BEAUTIFUL_AND_BABY',
  },
  {
    slug: 'black-puerto-rican-and-baby',
    title: 'Black, Puerto Rican & Baby',
    priceEnvVar: 'STRIPE_PRICE_BLACK_PUERTO_RICAN_AND_BABY',
  },
  {
    slug: 'adventure-fun-and-baby',
    title: 'Adventure, Fun & Baby',
    priceEnvVar: 'STRIPE_PRICE_ADVENTURE_FUN_AND_BABY',
  },
  {
    slug: 'go-to-sleep-karter',
    title: 'Go To Sleep, Karter!',
    priceEnvVar: 'STRIPE_PRICE_GO_TO_SLEEP_KARTER',
  },
  {
    slug: 'abuelita-and-baby',
    title: 'Abuelita & Baby',
    priceEnvVar: 'STRIPE_PRICE_ABUELITA_AND_BABY',
  },
  {
    slug: 'black-white-and-baby',
    title: 'Black, White & Baby',
    priceEnvVar: 'STRIPE_PRICE_BLACK_WHITE_AND_BABY',
  },
  {
    slug: 'christmas-and-baby',
    title: 'Christmas & Baby',
    priceEnvVar: 'STRIPE_PRICE_CHRISTMAS_AND_BABY',
  },
  {
    slug: 'halloween-and-baby',
    title: 'Halloween & Baby',
    priceEnvVar: 'STRIPE_PRICE_HALLOWEEN_AND_BABY',
  },
  {
    slug: 'mexican-and-baby',
    title: 'Mexican & Baby',
    priceEnvVar: 'STRIPE_PRICE_MEXICAN_AND_BABY',
  },
  {
    slug: 'puertorican-boricua-and-baby',
    title: 'Puertorican, Boricua & Baby',
    priceEnvVar: 'STRIPE_PRICE_PUERTORICAN_BORICUA_AND_BABY',
  },
  {
    slug: 'thanksgiving-and-baby',
    title: 'Thanksgiving & Baby',
    priceEnvVar: 'STRIPE_PRICE_THANKSGIVING_AND_BABY',
  },
];

/**
 * Builds the catalog fresh from the given env source (defaults to
 * process.env). Accepting an env object rather than reading process.env
 * internally keeps this pure/injectable for tests.
 */
function getCatalog(env = process.env) {
  const catalog = new Map();

  for (const def of CATALOG_DEFINITIONS) {
    const raw = env[def.priceEnvVar];
    const stripePriceId = typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null;

    catalog.set(def.slug, {
      slug: def.slug,
      title: def.title,
      priceEnvVar: def.priceEnvVar,
      stripePriceId,
      enabled: stripePriceId !== null,
    });
  }

  return catalog;
}

/** Reverse lookup: given a Stripe Price ID, find the catalog entry that owns it (or null). */
function findByPriceId(catalog, priceId) {
  if (!priceId) return null;
  for (const entry of catalog.values()) {
    if (entry.stripePriceId === priceId) return entry;
  }
  return null;
}

module.exports = { CATALOG_DEFINITIONS, getCatalog, findByPriceId };
