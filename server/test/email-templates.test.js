'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildOrderConfirmationEmail,
  buildAdminOrderNotificationEmail,
  buildContactNotificationEmail,
  buildNewsletterWelcomeEmail,
  buildNewsletterAdminNotification,
  buildMagicLinkEmail,
  buildPublicAssetUrl,
  LOGO_ASSET_PATH,
} = require('../lib/email-templates');

const OLD_HARDCODED_LOGO_URL = 'https://coolcalmandkarter.netlify.app/images/coolcalm-logo%20TRANSPARENT.png';

function buildTestOrder(overrides = {}) {
  return {
    orderNumber: 'CCK-20260808-4F2A',
    name: 'Jamie Buyer',
    email: 'buyer@example.com',
    amount: 2997,
    items: [
      { title: 'Florida, Beach & Baby', quantity: 3, unitPrice: 999, lineTotal: 2997, slug: 'florida-beach-and-baby' },
    ],
    shippingMethod: 'Standard Shipping (5–8 Business Days)',
    address: { line1: '1 Main St', line2: '', city: 'Tampa', state: 'FL', postal_code: '33602', country: 'US' },
    ...overrides,
  };
}

test('order confirmation email includes every field the checklist requires when present', () => {
  const { subject, html } = buildOrderConfirmationEmail(buildTestOrder(), { frontendBaseUrl: 'https://staging.example.com' });

  assert.match(subject, /CCK-20260808-4F2A/);
  assert.match(html, /Jamie Buyer/);
  assert.match(html, /Florida, Beach &amp; Baby/);
  assert.match(html, /\$9\.99/); // unit price
  assert.match(html, /\$29\.97/); // line total and order total
  assert.match(html, /Tampa/);
  assert.match(html, /Standard Shipping/);
  assert.match(html, /CCK-20260808-4F2A/);
  assert.match(html, /https:\/\/staging\.example\.com\/contact/);
});

test('order confirmation email never invents tracking number, carrier, delivery date, or shipping status', () => {
  const { html } = buildOrderConfirmationEmail(buildTestOrder());
  const lower = html.toLowerCase();

  assert.ok(!lower.includes('tracking'));
  assert.ok(!lower.includes('carrier'));
  assert.ok(!lower.includes('delivery date'));
  assert.ok(!lower.includes('estimated delivery'));
  assert.ok(!lower.includes('has shipped')); // never claims a shipment already happened
});

test('order confirmation email gracefully omits price columns when no pricing data is available (legacy/fallback order)', () => {
  const order = buildTestOrder({
    items: [{ title: 'Legacy Book', quantity: 1, unitPrice: null, lineTotal: null, slug: null }],
  });
  const { html } = buildOrderConfirmationEmail(order);

  assert.match(html, /Legacy Book/);
  assert.ok(!html.includes('Unit Price')); // no price column header when nothing has pricing
});

test('order confirmation email works with no orderNumber (should never happen post-migration, but must not crash)', () => {
  const order = buildTestOrder({ orderNumber: undefined });
  assert.doesNotThrow(() => buildOrderConfirmationEmail(order));
});

test('admin order notification includes order number, Stripe session ID, and never includes a secret key', () => {
  const { subject, html } = buildAdminOrderNotificationEmail(buildTestOrder(), { stripeSessionId: 'cs_test_abc123' });

  assert.match(subject, /CCK-20260808-4F2A/);
  assert.match(html, /cs_test_abc123/);
  assert.match(html, /buyer@example\.com/);
  assert.ok(!html.includes('sk_test_'));
  assert.ok(!html.includes('sk_live_'));
  assert.ok(!html.toLowerCase().includes('stripe_secret_key'));
});

test('contact notification preserves name/email/reason/message content', () => {
  const { subject, html } = buildContactNotificationEmail({
    name: 'Alex Fan',
    email: 'alex@example.com',
    reason: 'General Inquiry',
    subject: 'Question about a book',
    message: 'Do you ship internationally?',
  });

  assert.equal(subject, 'Contact Form: Question about a book');
  assert.match(html, /Alex Fan/);
  assert.match(html, /alex@example\.com/);
  assert.match(html, /General Inquiry/);
  assert.match(html, /Do you ship internationally\?/);
});

test('contact notification escapes HTML in a hostile message body rather than injecting it', () => {
  const { html } = buildContactNotificationEmail({
    name: '<script>evil()</script>',
    email: 'a@b.com',
    reason: 'x',
    subject: 'x',
    message: '<img src=x onerror=alert(1)>',
  });

  assert.ok(!html.includes('<script>evil()</script>'));
  assert.ok(!html.includes('<img src=x onerror=alert(1)>'));
  assert.match(html, /&lt;script&gt;/);
});

test('newsletter welcome and admin templates render without throwing', () => {
  assert.doesNotThrow(() => buildNewsletterWelcomeEmail());
  const { html } = buildNewsletterAdminNotification({ email: 'fan@example.com', ip: '1.2.3.4' });
  assert.match(html, /fan@example\.com/);
});

// ---- Email logo URL (Phase 11B correction) ----

test('buildPublicAssetUrl joins a base with no trailing slash correctly', () => {
  assert.equal(
    buildPublicAssetUrl('https://staging.example.com', '/images/logos/coolcalm-logo-transparent.png'),
    'https://staging.example.com/images/logos/coolcalm-logo-transparent.png',
  );
});

test('buildPublicAssetUrl joins a base with a trailing slash without introducing a double slash', () => {
  assert.equal(
    buildPublicAssetUrl('https://staging.example.com/', '/images/logos/coolcalm-logo-transparent.png'),
    'https://staging.example.com/images/logos/coolcalm-logo-transparent.png',
  );
});

test('buildPublicAssetUrl strips multiple trailing slashes', () => {
  assert.equal(
    buildPublicAssetUrl('https://staging.example.com///', '/images/logos/coolcalm-logo-transparent.png'),
    'https://staging.example.com/images/logos/coolcalm-logo-transparent.png',
  );
});

test('buildPublicAssetUrl returns null (never a guessed/hardcoded URL) when no base is configured', () => {
  assert.equal(buildPublicAssetUrl(undefined, LOGO_ASSET_PATH), null);
  assert.equal(buildPublicAssetUrl('', LOGO_ASSET_PATH), null);
  assert.equal(buildPublicAssetUrl('   ', LOGO_ASSET_PATH), null);
});

test('LOGO_ASSET_PATH points at the approved PNG now published under web/public/images/logos/', () => {
  assert.equal(LOGO_ASSET_PATH, '/images/logos/coolcalm-logo-transparent.png');
});

for (const [name, build] of [
  ['order confirmation', () => buildOrderConfirmationEmail(buildTestOrder(), { frontendBaseUrl: 'https://staging.example.com/' })],
  ['admin order notification', () => buildAdminOrderNotificationEmail(buildTestOrder(), { stripeSessionId: 'cs_test_x', frontendBaseUrl: 'https://staging.example.com/' })],
  ['contact notification', () => buildContactNotificationEmail(
    { name: 'A', email: 'a@b.com', reason: 'x', subject: 'x', message: 'x' },
    { frontendBaseUrl: 'https://staging.example.com/' },
  )],
  ['newsletter welcome', () => buildNewsletterWelcomeEmail({ frontendBaseUrl: 'https://staging.example.com/' })],
  ['newsletter admin notification', () => buildNewsletterAdminNotification({ email: 'a@b.com', ip: null }, { frontendBaseUrl: 'https://staging.example.com/' })],
]) {
  test(`${name} email: old hardcoded production logo URL is gone, replaced by a FRONTEND_BASE_URL-derived one with no double slash`, () => {
    const { html } = build();

    assert.ok(!html.includes(OLD_HARDCODED_LOGO_URL));
    assert.ok(!html.includes('%20TRANSPARENT'));
    assert.ok(!html.includes('coolcalmandkarter.netlify.app'));
    assert.match(html, /src="https:\/\/staging\.example\.com\/images\/logos\/coolcalm-logo-transparent\.png"/);
    assert.ok(!html.includes('.com//images')); // no malformed double slash from the trailing-slash base
  });
}

test('order confirmation email omits the logo image entirely (rather than a broken/guessed src) when FRONTEND_BASE_URL is not configured', () => {
  const { html } = buildOrderConfirmationEmail(buildTestOrder());
  assert.ok(!html.includes('<img'));
});

// ---- Magic-link email (Phase 13C) ----

test('magic-link email includes the provided link, an expiration notice, and branding', () => {
  const { subject, html } = buildMagicLinkEmail(
    { magicLinkUrl: 'https://staging.example.com/my-orders/verify#token=abc123', expiresInMinutes: 15 },
    { frontendBaseUrl: 'https://staging.example.com' },
  );

  assert.match(subject, /Order History/i);
  assert.match(html, /href="https:\/\/staging\.example\.com\/my-orders\/verify#token=abc123"/);
  assert.match(html, /15 minutes/);
  assert.match(html, /View My Orders/);
  assert.match(html, /ignore this email/i);
});

test('magic-link email never includes order numbers, purchases, shipping address, or tracking information', () => {
  const { html } = buildMagicLinkEmail(
    { magicLinkUrl: 'https://staging.example.com/my-orders/verify#token=abc123', expiresInMinutes: 15 },
    { frontendBaseUrl: 'https://staging.example.com' },
  );
  const lower = html.toLowerCase();

  assert.ok(!lower.includes('cck-'));
  assert.ok(!lower.includes('order total'));
  assert.ok(!lower.includes('shipping address'));
  assert.ok(!lower.includes('tracking'));
  assert.ok(!lower.includes('$'));
});

test('magic-link email defaults expiresInMinutes to 15 when not supplied', () => {
  const { html } = buildMagicLinkEmail({ magicLinkUrl: 'https://staging.example.com/x#token=abc' });
  assert.match(html, /15 minutes/);
});
