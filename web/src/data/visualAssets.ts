// Typed registry of the cinematic asset library living in web/public/images/.
// These are static, unoptimized public paths (not astro:assets modules) —
// suited for full-bleed backgrounds, decorative overlays, and character art
// that don't need per-page responsive variants yet.
//
// Book covers are intentionally NOT included here: the content collection
// (src/content/books/*.md) plus src/lib/images.ts remain the source of
// truth for cover art, since that pipeline already runs covers through
// astro:assets optimization. web/public/images/books/ holds a parity copy
// of the same approved covers for library completeness, but nothing reads
// from it yet.
//
// Customer photos are intentionally NOT included here — see
// docs/visual-asset-map.md for why they're inventoried but not registered.

export const visualAssets = {
  backgrounds: {
    heroDesktop: '/images/backgrounds/main-hero-background.png',
    heroMobile: '/images/backgrounds/hero-background-mobile.png',
    storySection: '/images/backgrounds/story-section-background.png',
    finalCta: '/images/backgrounds/final-cta-background.png',
  },
  characters: {
    pointing: '/images/characters/karter-pointing-transparent.png',
    reading: '/images/characters/karter-reading-transparent.png',
    waving: '/images/characters/karter-waving-transparent.png',
    running: '/images/characters/karter-running-transparent.png',
    peeking: '/images/characters/baby-karter-peeking.png',
    holdingBook: '/images/characters/baby-karter-holding-book.png',
  },
  logos: {
    primary: '/images/logos/coolcalm-logo-transparent.webp',
    // Cloud-only symbol, derived by cropping the approved transparent logo
    // (same pixels, wordmark band removed) — used where the full lockup
    // would be too small to read, e.g. the nav brand.
    cloudMark: '/images/logos/coolcalm-clouds-transparent.webp',
    // Final approved dimensional homepage hero title artwork — same source
    // pixels as client/images/logos/cck-homepage-title.png, unmodified.
    homepageTitle: '/images/logos/cck-homepage-title.png',
    // Tightly cropped derivative of the same artwork (excess transparent
    // canvas padding removed, ~24px safety margin kept around the visible
    // glow/sparkles) — the source PNG's real content only filled ~84% of
    // its width and ~61% of its height, making the hero title read smaller
    // than intended. Used in the hero for accurate, larger on-screen sizing.
    homepageTitleCropped: '/images/logos/cck-homepage-title-cropped.png',
    favicon: '/images/logos/favicon.ico',
  },
  ui: {
    cartIcon: '/images/ui-assets/cart-icon.webp',
    celestialLightRibbon: '/images/ui-assets/celestial-light-ribbon.png',
    cloudCornerOverlay: '/images/ui-assets/cloud-corner-overlay.png',
    stardustSweepOverlay: '/images/ui-assets/stardust-sweep-overlay.png',
    cloudDividerBottom: '/images/ui-assets/cloud-divider-bottom.png',
    bookDisplayPlatform: '/images/ui-assets/book-display-platform.png',
    premiumBookMockup: '/images/ui-assets/premium-book-mockup.png',
  },
  textures: {
    premiumGrain: '/images/textures/premium-grain-texture.png',
  },
} as const;
