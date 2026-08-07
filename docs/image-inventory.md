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
| `hero-background.png` | PNG | 4096×6144 | 16.0 MB | Yes (as a CSS `background-image`) | No | **⚠️ Legacy-only / deprecated — see note below.** |
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

---

## Update — 2026-08-06: `client/images/` reorganized into subfolders

The user reorganized `client/images/` from a single flat folder into 7 subfolders and added a batch of new cinematic-redesign assets (premium backgrounds, Baby Karter character art, decorative UI overlays, a grain texture). **This did not touch any of the audit above** — every file listed there still exists, just nested one level deeper. The rule from the top of this document still holds: nothing inside `client/images/` (at any depth) is renamed, recompressed, or deleted by tooling.

### New folder structure

```
client/images/
├── backgrounds/       4 files  — new cinematic section backgrounds
├── books/              24 files — the same 12 titles (PNG+WEBP) audited above, unchanged content
├── characters/         6 files  — new Baby Karter character art (transparent PNG)
├── customer pictures/  7 files  — same 7 customer photos audited above, unchanged content
├── logos/              5 files  — same logo/favicon files audited above, unchanged content
├── textures/           1 file   — new grain texture
└── ui-assets/          8 files  — cart icon (moved) + 7 new decorative overlay assets
```

Verified via SHA-256: the `books/`, `logos/`, and `customer pictures/` files are byte-identical to the originals audited above — this was a pure reorganization for those, not a re-export. No corruption, no duplicate content anywhere in the new structure.

### New assets (not previously audited)

| File | Folder | Dimensions | Alpha | Approx. size | Intended use |
|---|---|---|---|---|---|
| `Main-hero-background.png` | `backgrounds/` | 1672×941 | No | 1.7 MB | Premium desktop homepage hero background |
| `hero-background-mobile.png` | `backgrounds/` | 941×1672 | No | 1.9 MB | Mobile homepage hero background |
| `story-section-background.png` | `backgrounds/` | 1916×821 | No | 1.6 MB | Brand story / mission section |
| `final-cta-background.png` | `backgrounds/` | 1916×821 | No | 1.9 MB | Final homepage call-to-action section |
| `KarterPointing-Transparent.png` | `characters/` | 1024×1024 | Yes | 1.6 MB | Baby Karter pointing — CTAs, headings |
| `KarterReading-Transparent.png` | `characters/` | 1024×1024 | Yes | 1.7 MB | Reading / story / book-discovery sections |
| `KarterWaving-Transparent.png` | `characters/` | 1024×1536 | Yes | 2.4 MB | Welcoming visitors — hero, footer |
| `KarterRunning-Transparent.png` | `characters/` | 1024×1536 | Yes | 2.4 MB | Motion transitions, adventure sections |
| `baby-karter-peeking.png` | `characters/` | 1024×1536 | Yes | 2.3 MB | Peeking from section/card/nav edge |
| `baby-karter-holding-book.png` | `characters/` | 1024×1536 | Yes | 2.5 MB | Shop intro, featured books, library section |
| `premium-grain-texture.png` | `textures/` | 1536×1024 | Yes | 2.0 MB | Low-opacity anti-flatness texture |
| `celestial-light-ribbon.png` | `ui-assets/` | 1536×1024 | Yes | 2.3 MB | Cinematic light ribbon, premium highlights |
| `cloud-corner-overlay.png` | `ui-assets/` | 1536×1024 | Yes | 2.5 MB | Decorative section-corner cloud treatment |
| `stardust-sweep-overlay.png` | `ui-assets/` | 1536×1024 | Yes | 2.6 MB | Subtle premium sparkle/atmosphere sweep |
| `cloud-divider-bottom.png` | `ui-assets/` | 1536×1024 | Yes | 2.1 MB | Divider between major homepage sections |
| `book-display-platform.png` | `ui-assets/` | 1024×1024 | Yes | 1.4 MB | Pedestal beneath featured book covers |
| `premium-book-mockup.png` | `ui-assets/` | 1024×1024 | Yes | 1.4 MB | Dimensional product-display element |

All new character/overlay/texture assets are confirmed RGBA with real alpha transparency, as required. All new backgrounds are opaque RGB (correct — full-bleed backgrounds don't need transparency). No corrupt files, no duplicate content (SHA-256 verified against the full library, including the pre-existing files).

### `web/public/images/` — the new Astro static asset library

A parity copy of the approved library above now lives at `web/public/images/`, mirroring the same 7 subfolders, with filenames normalized to lowercase kebab-case (e.g. `KarterWaving-Transparent.png` → `karter-waving-transparent.png`). Format choices per asset:

- **Characters**: transparent PNG (as required).
- **Logos**: the transparent **WebP** (`coolcalm-logo-transparent.webp`, 165 KB) instead of the heavier PNG duplicate (1.1 MB) — same pixels, same alpha channel, no visual-quality loss. The opaque `coolcalm-logo.png` and the PNG logo duplicate were intentionally **not** copied — no destination use case calls for a non-transparent logo, and the smaller WebP fully covers the "transparent logo for header/footer" requirement. Both remain available in `client/images/logos/` if ever needed.
- **Books**: WebP for all 12 titles (all have correct, matching WebP versions — verified same dimensions as their PNG counterparts). Reuses the exact kebab-case filenames already established in `web/src/assets/books/` (the content-collection's existing cover pipeline) for consistency, even though nothing currently reads from this copy — see `web/src/data/visualAssets.ts` for why.
- **Cart icon**: WebP only (`cart-icon.webp`) — the PNG duplicate was not copied, same reasoning as the logo.
- **Backgrounds, overlays, texture**: PNG, unconverted, per instruction ("PNG for cinematic backgrounds and overlays for now").
- **Customer pictures**: copied for inventory/preparation only (`customer-1.png` … `customer-7.png`), not linked from any page and not in the typed registry — see `docs/visual-asset-map.md`.

No file was re-encoded, recompressed, or re-saved through an image library during this copy — every file in `web/public/images/` is a byte-for-byte `cp` of its `client/images/` source (confirmed via SHA-256 spot checks).

### Legacy compatibility copies

The reorganization moved every file at the flat `client/images/` root into a subfolder, which broke every legacy `client/*.html`/`style.css` reference still pointing at the old flat paths (e.g. `/images/favicon.ico`, `/images/florida-beach-and-baby-cover.png`, `images/hero-background.png`). Per the compatibility rule, **exact byte-for-byte copies were restored at every old flat path that a legacy page still references** — the legacy HTML/CSS itself was not modified. Both the organized copy and the compatibility copy now exist side by side; neither was deleted.

Restored at the flat root: `favicon.ico`, `coolcalm-logo.png`, `coolcalm-logo-transparent.png`, `coolcalm-logo-transparent.webp`, `florida-beach-and-baby-cover.png`/`.webp`, `black-beautiful-baby-cover.png`/`.webp`, `adventure-fun-and-baby-cover.png`, `black-puertorican-and-baby-cover.png`, `go-to-sleep-karter-cover.png`/`.webp`, `cart-icon.webp`, `customer1.png`–`customer7.png`, `hero-background.png`.

**Important correction made during this task:** the first attempt at restoring `hero-background.png` mistakenly copied the *new* `backgrounds/Main-hero-background.png` (1672×941 landscape) into that path — visually different artwork from what `style.css`'s `background-image: url('images/hero-background.png')` was originally built around (the original is 4096×6144 portrait, with a botanical/cloud frame designed for a tall single-page layout). That would have silently changed the live legacy site's hero appearance. It was caught immediately (by comparing SHA-256 against the file as tracked in git prior to the reorg) and corrected by restoring the exact original bytes via `git show HEAD:client/images/hero-background.png`. Every other compatibility copy was verified via `git diff --stat` to be byte-for-byte identical to its pre-reorg tracked content — this was an isolated mistake, not a pattern.

**Not restored** (confirmed unreferenced by any legacy page, so no compatibility copy needed): the 7 new not-yet-launched book covers (14 files), `adventure-fun-and-baby-cover.webp`, `black-puertorican-and-baby-cover.webp`, `cart-icon.png`, `favicon.webp`. `client/components/navbar.html` references `images/coolcalm-logo.png` too, but that file is dead code — never included or fetched by any live page (every page has its own inline `<nav>` instead) — so it doesn't affect site functionality either way. Separately, `client/404.html` and `client/cart.html` reference a literal `/images/coolcalm-logo TRANSPARENT.png` (with a space, and "TRANSPARENT" capitalized) — this filename never existed before or after the reorg; it's a pre-existing typo bug in those two pages, unrelated to this task, and was left as-is since fixing legacy HTML is out of scope here.

### Derived asset — `web/public/images/logos/coolcalm-clouds-transparent.webp`

Added 2026-08-06 (Phase 8B brand-identity revision): a cloud-only brand symbol for contexts where the full lockup is too small to read (the site navigation). It is **derived directly from the approved `coolcalm-logo-transparent.png`** by cropping the three-cloud band above the wordmark and clearing the few stray wordmark ascender pixels inside that band — the cloud artwork's own pixels are untouched and its proportions preserved, then downscaled to 930×420 WebP (52 KB) for fast nav loading. No artwork was redrawn, regenerated, or recolored. Registered as `logos.cloudMark` in `visualAssets.ts`. Source file remains untouched in `client/images/logos/`.

### Derived asset — `web/public/images/logos/cck-homepage-title-cropped.png`

Added 2026-08-06 (Phase 8, final homepage title sizing): the user supplied the final approved homepage title artwork at `client/images/logos/cck-homepage-title.png` (1536×1024 PNG, RGBA, real transparency). Audited its alpha channel and found the visible artwork (letters, cloud, sparkles, glow) only filled ~84% of the canvas width and ~61% of its height — the rest was transparent padding, which made the title read smaller on screen than its CSS width implied. Created a **tightly cropped derivative** at `web/public/images/logos/cck-homepage-title-cropped.png` (1333×677 PNG) by detecting the non-transparent bounding box (alpha>6 threshold, stable across thresholds 6–20) and cropping with a 24px safety margin preserved on every side so the soft glow/sparkle falloff is never hard-clipped (verified: border alpha ≈0). No pixels inside the crop were redrawn, recolored, resharpened, or recompressed lossily — it is the same artwork, just without the excess transparent canvas. Registered as `logos.homepageTitleCropped` in `visualAssets.ts` and used in the hero (`HomeHero.astro`). The original full-canvas copy is also kept at `web/public/images/logos/cck-homepage-title.png` (registered as `logos.homepageTitle`) for reference, though the hero uses the cropped version. Source file in `client/images/logos/` is byte-identical to the original the user supplied (SHA-256 verified unchanged throughout every revision pass).

### ⚠️ `client/images/hero-background.png` is legacy-only and deprecated for the new design

The user has confirmed this image was **intentionally removed** from the reorganized library — it is retired and will not be used anywhere in the Astro redesign. The copy restored at `client/images/hero-background.png` exists **solely** as temporary compatibility protection so the still-live legacy `client/` site (which reads it via `style.css`'s `background-image: url('images/hero-background.png')`) keeps rendering correctly until cutover.

Status, explicit:
- **Legacy-only.** Used exclusively by `client/style.css` for the old static site.
- **Deprecated for the new design.** The Astro redesign must never reference this file, this filename, or this artwork. It is not part of the cinematic asset library.
- **Temporary compatibility protection.** It exists only to keep the legacy site visually unchanged while the Astro redesign is built.
- **Removable only after production cutover.** Once the Astro site becomes production and the legacy `client/` site is retired, this file (and the `style.css` rule that references it) can be deleted. Not before.

The Astro redesign's hero/section backgrounds are the four new cinematic assets instead: `web/public/images/backgrounds/main-hero-background.png` (desktop hero), `hero-background-mobile.png` (mobile hero), `story-section-background.png`, and `final-cta-background.png` — registered in `web/src/data/visualAssets.ts` under `backgrounds.*`. Verified: `visualAssets.ts` contains no reference to `hero-background.png`, and that file was never copied into `web/public/images/` in any form.
