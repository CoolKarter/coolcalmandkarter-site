import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Schema is intentionally permissive on commerce fields (price, stripePriceId)
// so entries can exist in a "available but checkout not yet configured" state
// while real pricing/Stripe data is still being confirmed (see
// docs/new-book-product-data.md). Nothing here should ever be filled with
// invented data — absent fields mean the source data doesn't exist yet.
const books = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/books' }),
  schema: z.object({
    title: z.string(),
    hook: z.string().optional(),
    shortDescription: z.string().optional(),
    description: z.string(),
    price: z.number().int().nonnegative().optional(),
    currency: z.string().default('usd'),
    stripePriceId: z.string().optional(),
    // Defaults to true so the 5 currently-live books (which predate this
    // field) remain purchasable without needing a retroactive edit. Titles
    // without a real Stripe Price ID must explicitly set this to false.
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
