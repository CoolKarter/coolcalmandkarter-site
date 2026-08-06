# Visual Asset Map — `web/public/images/`

Explains what each asset in the new cinematic library is *for*, and the accessibility/performance rules that apply when it's actually wired into a page. This document is guidance for the implementation phase — no homepage layout, component, or page has been built or changed as part of creating this map.

See [`web/src/data/visualAssets.ts`](../web/src/data/visualAssets.ts) for the typed paths, and [`docs/image-inventory.md`](./image-inventory.md) for the raw file audit (dimensions, formats, transparency, sizes).

## ⚠️ The old hero background is retired — do not use it in Astro

`client/images/hero-background.png` (the original 4096×6144 portrait background) is **legacy-only and deprecated for the new design**. It was intentionally removed from the reorganized library by the user and must never be referenced by any Astro component, page, or asset registry entry. The copy that exists at that legacy path is temporary compatibility protection for the still-live `client/` site only, and is removable once the Astro site becomes production and `client/` is retired — not before.

The Astro redesign uses the four new cinematic background assets instead — `backgrounds.heroDesktop`, `backgrounds.heroMobile`, `backgrounds.storySection`, and `backgrounds.finalCta` in `visualAssets.ts` — documented in the table below.

## 1–4. Page/section intent, decorative vs. content-bearing

| Asset | Registry key | Page / section | Decorative or content-bearing? |
|---|---|---|---|
| `main-hero-background.png` | `backgrounds.heroDesktop` | Homepage hero, desktop | Decorative (atmosphere) |
| `hero-background-mobile.png` | `backgrounds.heroMobile` | Homepage hero, mobile | Decorative (atmosphere) |
| `story-section-background.png` | `backgrounds.storySection` | Homepage/About "Our Story" section | Decorative (atmosphere) |
| `final-cta-background.png` | `backgrounds.finalCta` | Homepage final CTA, near footer | Decorative (atmosphere) |
| `karter-pointing-transparent.png` | `characters.pointing` | Near CTA buttons, product highlights, headings | **Content-bearing when placed** — his pose is a directional cue ("look here"), not pure decoration |
| `karter-reading-transparent.png` | `characters.reading` | Story/education/book-discovery sections | Content-bearing — reinforces the "reading" theme of the section |
| `karter-waving-transparent.png` | `characters.waving` | Homepage hero greeting, footer goodbye | Content-bearing — a greeting is communicative, not decorative |
| `karter-running-transparent.png` | `characters.running` | Playful transitions, adventure-themed sections | Content-bearing — motion pose ties to "adventure" messaging |
| `baby-karter-peeking.png` | `characters.peeking` | Peeking from a card/section/nav edge | Decorative-leaning — a personality flourish, not conveying unique information |
| `baby-karter-holding-book.png` | `characters.holdingBook` | Shop intro, featured books, library section | Content-bearing — directly illustrates "here are the books" |
| `coolcalm-logo-transparent.webp` | `logos.primary` | Header, footer | Content-bearing (brand identity) |
| `favicon.ico` | `logos.favicon` | Browser tab / bookmarks | Content-bearing (brand identity), but never rendered in-page |
| `cart-icon.webp` | `ui.cartIcon` | Nav cart link | Content-bearing (functional icon — but the *link* already has an accessible name; see §4/§5) |
| `celestial-light-ribbon.png` | `ui.celestialLightRibbon` | Hero lighting, premium section highlights | Decorative |
| `cloud-corner-overlay.png` | `ui.cloudCornerOverlay` | Section corners | Decorative |
| `stardust-sweep-overlay.png` | `ui.stardustSweepOverlay` | Atmospheric sparkle accents | Decorative — must stay subtle enough to never compete with text/products |
| `cloud-divider-bottom.png` | `ui.cloudDividerBottom` | Between major homepage sections | Decorative |
| `book-display-platform.png` | `ui.bookDisplayPlatform` | Beneath featured book covers | Decorative (staging element, not the product itself) |
| `premium-book-mockup.png` | `ui.premiumBookMockup` | Dimensional product presentation | Decorative (presentation chrome around the real cover art) |
| `premium-grain-texture.png` | `textures.premiumGrain` | Low-opacity overlay on flat backgrounds | Decorative |
| Book covers (`web/public/images/books/*.webp`) | *not in registry* | N/A — not currently wired to any page | Content-bearing when used, but the **content collection + `src/lib/images.ts`** remain the actual source for cover rendering. This folder is a parity copy only. |
| Customer photos (`web/public/images/customer-pictures/*.png`) | *not in registry* | Reserved for a future testimonial/community section | Content-bearing when used, but **not yet approved for public placement** — see §4 below |

## 4–5. Alt text rules

**Empty `alt=""` (hidden from screen readers) — pure decoration:**
`main-hero-background.png`, `hero-background-mobile.png`, `story-section-background.png`, `final-cta-background.png`, `celestial-light-ribbon.png`, `cloud-corner-overlay.png`, `stardust-sweep-overlay.png`, `cloud-divider-bottom.png`, `book-display-platform.png`, `premium-book-mockup.png`, `premium-grain-texture.png`, `baby-karter-peeking.png`.

If any of these is applied as a CSS `background-image` instead of an `<img>`, no `alt` attribute question even arises — that's the preferred technique for all of them, since none carry unique information a screen-reader user needs.

**Meaningful, specific alt text required:**
- Book covers — alt text must contain the actual book title (this convention already exists in `src/content/books/*.md` via `coverImageAlt` and is already followed correctly in `BookCard.astro`/`images.ts` — no change needed here).
- `coolcalm-logo-transparent.webp` — alt text identifying the brand, e.g. "Cool, Calm & Karter" (already done correctly on the legacy site and should carry over).
- `karter-pointing-transparent.png`, `karter-reading-transparent.png`, `karter-waving-transparent.png`, `karter-running-transparent.png`, `baby-karter-holding-book.png` — these need alt text **only because their pose communicates something** (pointing at a CTA, waving hello, etc.) — the alt text should describe what the pose *means in context*, not "cartoon baby," e.g. `alt="Baby Karter waving hello"` for the hero greeting, or `alt=""` if the exact same message is already conveyed by adjacent visible text (avoid redundant announcements).
- `cart-icon.webp` — the icon itself should get `alt=""` since the surrounding `<a aria-label="View cart">` (already implemented in `Nav.astro`) supplies the accessible name; don't double up.

**Requires consent + real alt text before any public use:**
- All 7 customer photos. Per the task instructions, they are inventoried and copied only — not placed on any page, not in `visualAssets.ts`. Before any future use: confirm photo-usage consent from each customer, then write alt text describing the real, relevant content (not generic "customer photo").

## 6. Desktop-specific vs. mobile-specific

- `main-hero-background.png` (1672×941, landscape) — **desktop only**.
- `hero-background-mobile.png` (941×1672, portrait) — **mobile only**.
- Everything else in `backgrounds/` and `ui-assets/` is orientation-agnostic and can be shared across breakpoints (sized/positioned via CSS, not swapped by breakpoint).

## 7–8. Loading strategy

- **Eager load** (no `loading="lazy"`, and preload if used as the LCP element): `main-hero-background.png` / `hero-background-mobile.png` — whichever one actually renders per breakpoint. This is very likely the largest above-the-fold paint on the homepage.
- **Lazy load** (`loading="lazy"`): `story-section-background.png`, `final-cta-background.png`, all `ui-assets/` overlays, `premium-grain-texture.png`, and any character art placed below the first viewport. None of these affect first paint and all are non-essential to initial content.
- Character art placed *inside* the hero (e.g. a waving Karter greeting) should load eagerly alongside the hero background, since it's part of the same above-the-fold moment.

## 6/7 performance note: avoid downloading both hero variants

When the hero is implemented, use `<picture>`/`srcset` with media conditions (or a CSS `image-set()`/media-query background) so the browser fetches **only** the desktop *or* mobile hero background, never both. Do not rely on `display: none` on an `<img>` for the unused variant — the browser still downloads it.

## 9. `object-fit: contain` vs. `cover`

- **`cover`**: full-bleed section backgrounds — `main-hero-background.png`, `hero-background-mobile.png`, `story-section-background.png`, `final-cta-background.png`. These are meant to fill their container edge-to-edge; some cropping at extreme viewport ratios is expected and acceptable.
- **`contain`**: anything where losing part of the image would lose meaning or break the art — book covers (already the established pattern via the `.cover-frame` CSS class in `tokens.css`), all Baby Karter character art, the logo, and all `ui-assets/` overlay/decoration PNGs. None of these should ever be cropped.

## 10. Never stretch, crop, recolor, or distort

Applies to **every** asset in this library without exception, per the task's non-negotiable rule — but especially worth calling out for:
- Baby Karter character art (`characters/*`) — his canonical appearance must render exactly as approved; no recoloring, no distortion to fit a container.
- `coolcalm-logo-transparent.webp` — brand mark, fixed aspect ratio only.
- Book covers — already governed by the existing `.cover-frame` (`object-fit: contain`, no stretch) pattern in `tokens.css`; that pattern must be preserved, not replaced, when new covers are added.

## Additional accessibility/performance rules (from the task brief)

- Decorative overlays, textures, stardust, dividers, and light ribbons: always empty `alt=""` (or CSS background, avoiding the question entirely).
- No text is ever baked into a background image in this library — all copy stays in real, selectable, accessible HTML text. Section backgrounds must be checked for contrast against whatever text sits on top of them once implemented.
- The site must remain usable if any decorative image fails to load — decorative images must never be load-bearing for layout, navigation, or comprehension. Content-bearing images (book covers, logo) already have real alt text as a fallback for that case.
- No destructive compression was performed while building this library (see `docs/image-inventory.md` — every copy is a byte-for-byte `cp`). Real optimization (responsive `srcset` variants, recompression) is explicitly deferred to a later implementation phase, not done here.
