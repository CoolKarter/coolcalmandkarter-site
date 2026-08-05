# Image Inventory — `client/images/`

Baseline audit taken on the `cinematic-redesign` branch, prior to any Astro work (Phase 2 of the migration plan). Covers all 39 files currently in `client/images/`. Verified via `sha256sum` (no two files are byte-identical — every PNG/WEBP pair is an intentional format variant, not an accidental duplicate).

## ⚠️ Non-negotiable rule for this entire migration

**Files inside `client/images/` must never be renamed, overwritten, moved, optimized in place, or deleted.** They remain the permanent, untouched source archive. Any renaming, recompression, or format conversion happens only on **copies** placed inside the future `web/` project's own asset folder. This applies to every file below, including the ones already flagged unused.

## New book-cover assets (added by the user, not yet in the storefront)

These 7 titles (14 files: PNG + WEBP each) are **new, unreleased catalog additions** — not dead assets. None are wired into any page yet. Real product data (final title/spelling, description, price, Stripe Price ID, availability date) is still needed before they can go into the Astro content collection (tracked as open items from the migration plan).

| Current filename | Type | Dimensions | Approx. size | Used on current site? | Proposed filename (inside `web/` only) |
|---|---|---|---|---|---|
| `Abuelita and Baby Cover.png` | PNG | 1971×2000 (portrait) | 3.3 MB | No | `abuelita-and-baby-cover.png` |
| `Abuelita and Baby Cover.webp` | WEBP | 1971×2000 (portrait) | 344 KB | No | `abuelita-and-baby-cover.webp` |
| `Black, White and Baby Cover.png` | PNG | 1971×2000 (portrait) | 3.7 MB | No | `black-white-and-baby-cover.png` |
| `Black, White and Baby Cover.webp` | WEBP | 1971×2000 (portrait) | 413 KB | No | `black-white-and-baby-cover.webp` |
| `Christmas & Baby Cover.png` | PNG | 1254×1254 (square) | 2.6 MB | No | `christmas-and-baby-cover.png` |
| `Christmas & Baby Cover.webp` | WEBP | 1254×1254 (square) | 484 KB | No | `christmas-and-baby-cover.webp` |
| `Halloween & Baby Cover.png` | PNG | 1254×1254 (square) | 2.7 MB | No | `halloween-and-baby-cover.png` |
| `Halloween & Baby Cover.webp` | WEBP | 1254×1254 (square) | 511 KB | No | `halloween-and-baby-cover.webp` |
| `Mexican & Baby Cover.png` | PNG | 1254×1254 (square) | 3.0 MB | No | `mexican-and-baby-cover.png` |
| `Mexican & Baby Cover.webp` | WEBP | 1254×1254 (square) | 647 KB | No | `mexican-and-baby-cover.webp` |
| `Puertorican, Boricua & Baby COVER.png` | PNG | 1971×2000 (portrait) | 5.0 MB | No | `puertorican-boricua-and-baby-cover.png` |
| `Puertorican, Boricua & Baby COVER.webp` | WEBP | 1971×2000 (portrait) | 768 KB | No | `puertorican-boricua-and-baby-cover.webp` |
| `Thanksgiving & Baby Cover.png` | PNG | 1254×1254 (square) | 2.6 MB | No | `thanksgiving-and-baby-cover.png` |
| `Thanksgiving & Baby Cover.webp` | WEBP | 1254×1254 (square) | 455 KB | No | `thanksgiving-and-baby-cover.webp` |

**Aspect-ratio note:** 3 of the 7 new titles (Abuelita, Black/White, Puerto Rican & Boricua) are 1971×2000 portrait, matching the 5 existing live book covers. The other 4 (Christmas, Halloween, Mexican, Thanksgiving) are 1254×1254 square — a different aspect ratio from the rest of the catalog. See the display-frame requirement below.

## Existing book covers (currently live on the storefront)

| Current filename | Type | Dimensions | Approx. size | Used on current site? | New book cover? | Proposed filename (inside `web/`) |
|---|---|---|---|---|---|---|
| `florida-beach-and-baby-cover.png` | PNG | 1971×2000 | 2.9 MB | Yes | No | unchanged (already URL-safe) |
| `florida-beach-and-baby-cover.webp` | WEBP | 1971×2000 | 127 KB | Yes | No | unchanged |
| `black-beautiful-baby-cover.png` | PNG | 1971×2000 | 2.7 MB | Yes | No | unchanged |
| `black-beautiful-baby-cover.webp` | WEBP | 1971×2000 | 108 KB | Yes | No | unchanged |
| `black-puertorican-and-baby-cover.png` | PNG | 1971×2000 | 2.8 MB | Yes | No | unchanged |
| `black-puertorican-and-baby-cover.webp` | WEBP | 1971×2000 | 103 KB | **No** (page links the `.png` directly; `.webp` isn't wired up) | No | unchanged |
| `adventure-fun-and-baby-cover.png` | PNG | 1971×2000 | 4.1 MB | Yes | No | unchanged |
| `adventure-fun-and-baby-cover.webp` | WEBP | 1971×2000 | 133 KB | **No** (same as above — `.webp` not wired up) | No | unchanged |
| `go-to-sleep-karter-cover.png` | PNG | 1971×2000 | 4.1 MB | Yes | No | unchanged |
| `go-to-sleep-karter-cover.webp` | WEBP | 1971×2000 | 121 KB | Yes | No | unchanged |

## Site chrome, brand, and social-proof assets (not book covers)

| Current filename | Type | Dimensions | Approx. size | Used on current site? | New book cover? | Proposed filename (inside `web/`) |
|---|---|---|---|---|---|---|
| `coolcalm-logo.png` | PNG | 1971×2000 | 1.7 MB | Yes | No | unchanged |
| `coolcalm-logo-transparent.png` | PNG | 1499×1255 | 1.1 MB | Yes | No | unchanged |
| `coolcalm-logo-transparent.webp` | WEBP | 1499×1255 | 165 KB | Yes | No | unchanged |
| `hero-background.png` | PNG | 4096×6144 | 16.0 MB | Yes (as a CSS `background-image`) | No | unchanged (flagged separately for optimization work in a later phase — not renamed or touched now) |
| `cart-icon.png` | PNG | 1024×1024 | 1.5 MB | **No** (`.webp` is what's actually used) | No | unchanged |
| `cart-icon.webp` | WEBP | 1024×1024 | 117 KB | Yes | No | unchanged |
| `favicon.ico` | ICO | 16×16 | 15 KB | Yes | No | unchanged |
| `favicon.webp` | WEBP | 48×48 | <1 KB | **No** (`.ico` is what's actually used) | No | unchanged |
| `customer1.png` | PNG | 1536×2048 | 3.2 MB | Yes | No | unchanged |
| `customer2.png` | PNG | 2560×1920 | 5.0 MB | Yes | No | unchanged |
| `customer3.png` | PNG | 946×2048 | 2.5 MB | Yes | No | unchanged |
| `customer4.png` | PNG | 4032×3024 | 10.8 MB | Yes | No | unchanged |
| `customer5.png` | PNG | 1536×2048 | 2.4 MB | Yes | No | unchanged |
| `customer6.png` | PNG | 4032×3024 | 11.8 MB | Yes | No | unchanged |
| `customer7.png` | PNG | 2415×4025 | 9.4 MB | Yes | No | unchanged |

## Summary counts

- **39** total files in `client/images/`.
- **21** currently referenced by a page in `client/`.
- **18** currently unreferenced: the 14 new-book-cover files above, plus 2 unused format duplicates of existing UI assets (`cart-icon.png`, `favicon.webp`), plus 2 unused format duplicates of *existing* (not new) book covers (`adventure-fun-and-baby-cover.webp`, `black-puertorican-and-baby-cover.webp`).
- **0** byte-identical duplicate files anywhere in the folder (SHA-256 verified).

## Design requirement carried into the Astro rebuild

The catalog now mixes **portrait (1971×2000)** and **square (1254×1254)** cover artwork. The future Astro storefront must intentionally support both aspect ratios inside **consistent display frames**, without stretching or cropping the artwork — i.e., the frame adapts to the art, not the other way around. This is a deliberate design requirement for Phase 3/4 of the migration plan, not an inconsistency to silently fix by cropping source images.

## Still open before Phase 3 can start

- Confirm which of the 7 new titles are launch-ready vs. placeholder.
- Final title spelling, description, price, and Stripe Price ID for each new title going live.
- Confirmation on whether "Black, White and Baby" and "Puertorican, Boricua & Baby" are intentional additional titles beyond the 5 originally named, or need correction.
