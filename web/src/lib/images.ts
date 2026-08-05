import type { ImageMetadata } from 'astro';

// Content-collection entries store coverImage as a plain string path
// (e.g. "src/assets/books/foo-cover.webp") rather than a Zod image()
// reference, since new titles get added before their real assets exist.
// This glob resolves those strings to actual optimizable image modules at
// build time.
const covers = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/books/*.{webp,png,jpg,jpeg}',
  { eager: true },
);

export function resolveCoverImage(coverImage: string): ImageMetadata {
  const filename = coverImage.split('/').pop();
  const match = Object.entries(covers).find(([path]) => path.endsWith(`/${filename}`));

  if (!match) {
    throw new Error(`Cover image not found for coverImage path: "${coverImage}"`);
  }

  return match[1].default;
}
