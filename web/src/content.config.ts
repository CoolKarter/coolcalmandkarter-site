import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Schema is intentionally permissive on commerce fields (price) so entries
// can exist in a "available but checkout not yet configured" state while
// real pricing data is still being confirmed (see
// docs/new-book-product-data.md). Nothing here should ever be filled with
// invented data — absent fields mean the source data doesn't exist yet.
//
// No Stripe Price ID field exists here deliberately (Phase 14B removed
// it) — the browser never needs one and this schema previously carried a
// hardcoded, test-mode-shaped Price ID string that was never actually
// transmitted to the backend or trusted for checkout, only read as
// Boolean(stripePriceId) to help gate the Add to Cart button. That was a
// duplicated, purely-cosmetic signal; `checkoutEnabled` below is now the
// single, explicit source of truth for frontend availability. The backend
// remains the sole authority on the REAL Stripe Price ID, resolved
// server-side from its own environment variables (see
// server/lib/checkout-catalog.js) — the browser only ever sends
// { slug, quantity }.
const books = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/books' }),
  schema: z.object({
    title: z.string(),
    hook: z.string().optional(),
    shortDescription: z.string().optional(),
    description: z.string(),
    price: z.number().int().nonnegative().optional(),
    currency: z.string().default('usd'),
    // Defaults to true so the originally-live books (which predate this
    // field) remain purchasable without needing a retroactive edit. A
    // title without a real backend Stripe Price ID configured yet must
    // explicitly set this to false — see docs/new-book-product-data.md
    // for which of the 12 books currently have one.
    checkoutEnabled: z.boolean().default(true),
    coverImage: z.string(),
    coverImageAlt: z.string(),
    publishedDate: z.string().optional(),
    rating: z.number().min(0).max(5).optional(),
    ageRange: z.string().optional(),
    availability: z.enum(['available', 'coming-soon']),
    legacyProductPageUrl: z.string().optional(),
    seoTitle: z.string().optional(),
    seoDescription: z.string().optional(),
    reviews: z
      .array(
        z.object({
          quote: z.string(),
          author: z.string().optional(),
        }),
      )
      .default([]),
  }),
});

export const collections = { books };
