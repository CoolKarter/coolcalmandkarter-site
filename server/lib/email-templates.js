'use strict';

// Shared branded wrapper + individual template builders for every
// transactional email this backend sends. Table-based, inline-styled HTML
// only (no flexbox/grid, no remote fonts/scripts/animation) so rendering
// stays consistent across real-world email clients. Every builder is a
// pure function — plain data in, { subject, html } out — so template
// content can be tested without touching the Resend SDK at all.

const BRAND_NAVY = '#195569';
const BRAND_CORAL = '#f46045';
const BRAND_CREAM = '#efe1c6';

// The approved brand logo, in PNG (not WEBP) for the widest email-client
// compatibility — copied byte-for-byte from client/images/coolcalm-logo-transparent.png
// into web/public/images/logos/ so the Astro frontend serves it publicly.
// The path is joined onto FRONTEND_BASE_URL at send time (see buildLogoUrl)
// rather than hardcoded to any one environment's domain, so staging emails
// point at the staging frontend and production will point at production
// automatically once FRONTEND_BASE_URL is set there.
const LOGO_ASSET_PATH = '/images/logos/coolcalm-logo-transparent.png';

/**
 * Safely joins FRONTEND_BASE_URL + a public asset path, regardless of
 * whether the base has a trailing slash — never produces a double slash.
 * Returns null (never a fabricated/guessed URL) if no valid base is
 * configured; callers render without a logo in that case rather than
 * falling back to any hardcoded domain.
 */
function buildPublicAssetUrl(frontendBaseUrl, assetPath) {
  if (!frontendBaseUrl || typeof frontendBaseUrl !== 'string' || frontendBaseUrl.trim() === '') return null;
  const base = frontendBaseUrl.trim().replace(/\/+$/, '');
  const path = assetPath.startsWith('/') ? assetPath : `/${assetPath}`;
  return `${base}${path}`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

function formatCurrency(cents) {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return null;
  return `$${(cents / 100).toFixed(2)}`;
}

function formatAddress(address = {}) {
  const line2 = address.line2 ? `${escapeHtml(address.line2)}<br>` : '';
  return `
    ${escapeHtml(address.line1 || '')}<br>
    ${line2}
    ${escapeHtml(address.city || '')}, ${escapeHtml(address.state || '')} ${escapeHtml(address.postal_code || '')}<br>
    ${escapeHtml(address.country || '')}
  `.trim();
}

/** Shared branded shell every template renders inside. Omits the logo entirely (rather than guessing a URL) when no valid frontendBaseUrl is configured. */
function wrapEmailBody(innerHtml, { frontendBaseUrl } = {}) {
  const logoUrl = buildPublicAssetUrl(frontendBaseUrl, LOGO_ASSET_PATH);
  const header = logoUrl
    ? `
      <div style="text-align: center; padding-bottom: 12px;">
        <img src="${logoUrl}" alt="Cool, Calm & Karter" style="max-width: 180px; height: auto;" />
      </div>
    `
    : '';

  return `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #333333; background-color: #ffffff;">
      ${header}
      ${innerHtml}
      <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #eeeeee; text-align: center; font-size: 13px; color: #888888;">
        Cool, Calm &amp; Karter
      </div>
    </div>
  `;
}

/** Renders the items table shared by the customer and admin order emails. Gracefully omits price columns when pricing wasn't available (legacy fallback path — see resolve-order-items.js). */
function renderItemsTable(items = []) {
  const hasPricing = items.some((item) => typeof item.lineTotal === 'number');

  const rows = items
    .map((item) => {
      const unit = formatCurrency(item.unitPrice);
      const line = formatCurrency(item.lineTotal);
      const priceCells = hasPricing
        ? `
          <td style="padding: 8px 0; border-bottom: 1px solid #f0f0f0; text-align: right; color: #333333;">${unit ?? '—'}</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #f0f0f0; text-align: right; color: #333333;">${line ?? '—'}</td>
        `
        : '';
      return `
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #f0f0f0; color: #333333;">${escapeHtml(item.title)}</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #f0f0f0; text-align: center; color: #333333;">${item.quantity}</td>
          ${priceCells}
        </tr>
      `;
    })
    .join('');

  const priceHeaders = hasPricing
    ? `
      <th style="padding: 8px 0; text-align: right; font-size: 13px; color: #888888;">Unit Price</th>
      <th style="padding: 8px 0; text-align: right; font-size: 13px; color: #888888;">Line Total</th>
    `
    : '';

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin: 12px 0;">
      <thead>
        <tr>
          <th style="padding: 8px 0; text-align: left; font-size: 13px; color: #888888;">Book</th>
          <th style="padding: 8px 0; text-align: center; font-size: 13px; color: #888888;">Qty</th>
          ${priceHeaders}
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

/**
 * Customer order-confirmation email. Only ever renders fields present on
 * `order` — never invents a tracking number, carrier, delivery date, or
 * shipping status (none of that exists yet in this system).
 */
function buildOrderConfirmationEmail(order, { frontendBaseUrl } = {}) {
  const total = formatCurrency(order.amount);
  const supportUrl = frontendBaseUrl ? `${frontendBaseUrl.replace(/\/+$/, '')}/contact` : null;
  const myOrdersUrl = frontendBaseUrl ? `${frontendBaseUrl.replace(/\/+$/, '')}/my-orders` : null;

  const inner = `
    <h2 style="color: ${BRAND_CORAL}; text-align: center; margin: 8px 0 4px;">Thank you for your order${order.name ? `, ${escapeHtml(order.name)}` : ''}!</h2>
    ${order.orderNumber ? `<p style="text-align: center; color: #666666; margin: 0 0 20px;">Order #${escapeHtml(order.orderNumber)}</p>` : ''}

    <p style="font-size: 16px; line-height: 1.6;">We've received your order and it's being prepared. Here's what you purchased:</p>

    ${renderItemsTable(order.items)}

    <p style="text-align: right; font-size: 16px; font-weight: bold; margin: 12px 0 0; color: #333333;">
      Order Total: ${total ?? '—'}
    </p>

    <div style="margin-top: 24px; padding: 16px; background-color: ${BRAND_CREAM}22; border-radius: 8px;">
      <p style="margin: 0 0 8px; font-weight: bold; color: ${BRAND_NAVY};">Shipping Details</p>
      <p style="margin: 0; line-height: 1.6;">${formatAddress(order.address)}</p>
      ${order.shippingMethod ? `<p style="margin: 8px 0 0;"><strong>Method:</strong> ${escapeHtml(order.shippingMethod)}</p>` : ''}
      ${order.email ? `<p style="margin: 8px 0 0;"><strong>Order Email:</strong> ${escapeHtml(order.email)}</p>` : ''}
    </div>

    <p style="margin-top: 24px; font-size: 15px; line-height: 1.6;">
      Your order has been received and is confirmed. We'll send you another email as soon as it ships.
    </p>

    ${myOrdersUrl ? `<p style="margin-top: 16px; font-size: 14px; line-height: 1.6;">Want to check on this order later? <a href="${myOrdersUrl}" style="color: ${BRAND_CORAL};">View My Orders</a> any time — just enter this email to get a secure link.</p>` : ''}

    <p style="margin-top: 24px; font-size: 14px; color: #777777; line-height: 1.6;">
      Questions about your order? ${supportUrl ? `<a href="${supportUrl}" style="color: ${BRAND_CORAL};">Contact us</a>` : 'Reach out and we\'ll be glad to help.'} — thank you for supporting Cool, Calm &amp; Karter!
    </p>
  `;

  return {
    subject: order.orderNumber
      ? `Your Cool, Calm & Karter Order Confirmation (#${order.orderNumber})`
      : 'Your Cool, Calm & Karter Order Confirmation',
    html: wrapEmailBody(inner, { frontendBaseUrl }),
  };
}

/**
 * Internal admin order-notification email. Includes the Stripe Checkout
 * Session ID for support/troubleshooting lookups in the Stripe Dashboard —
 * that ID is an identifier, not a credential, and is never itself a
 * secret. Never includes STRIPE_SECRET_KEY or any other credential.
 */
function buildAdminOrderNotificationEmail(order, { stripeSessionId, frontendBaseUrl } = {}) {
  const total = formatCurrency(order.amount);

  const inner = `
    <h2 style="color: ${BRAND_CORAL}; margin: 8px 0 16px;">New Order Placed</h2>
    ${order.orderNumber ? `<p style="margin: 0 0 4px;"><strong>Order Number:</strong> ${escapeHtml(order.orderNumber)}</p>` : ''}
    ${stripeSessionId ? `<p style="margin: 0 0 16px; font-size: 13px; color: #888888;"><strong>Stripe Session:</strong> ${escapeHtml(stripeSessionId)}</p>` : ''}

    <p style="margin: 0 0 4px;"><strong>Customer:</strong> ${escapeHtml(order.name || 'Unknown')}</p>
    <p style="margin: 0 0 16px;"><strong>Email:</strong> ${escapeHtml(order.email || 'Unknown')}</p>

    ${renderItemsTable(order.items)}

    <p style="text-align: right; font-size: 16px; font-weight: bold; margin: 12px 0 0;">Total Paid: ${total ?? '—'}</p>

    <div style="margin-top: 20px;">
      <p style="margin: 0 0 4px;"><strong>Shipping Address:</strong></p>
      <p style="margin: 0; line-height: 1.6;">${formatAddress(order.address)}</p>
      ${order.shippingMethod ? `<p style="margin: 8px 0 0;"><strong>Shipping Method:</strong> ${escapeHtml(order.shippingMethod)}</p>` : ''}
    </div>
  `;

  return {
    subject: order.orderNumber ? `🛒 New Order Placed — ${order.orderNumber}` : '🛒 New Order Placed',
    html: wrapEmailBody(inner, { frontendBaseUrl }),
  };
}

function buildContactNotificationEmail({ name, email, reason, subject, message }, { frontendBaseUrl } = {}) {
  const inner = `
    <h3 style="color: ${BRAND_NAVY}; margin: 8px 0 16px;">New message from the Contact form</h3>
    <p style="margin: 0 0 4px;"><strong>Name:</strong> ${escapeHtml(name)}</p>
    <p style="margin: 0 0 4px;"><strong>Email:</strong> ${escapeHtml(email)}</p>
    ${reason ? `<p style="margin: 0 0 4px;"><strong>Reason:</strong> ${escapeHtml(reason)}</p>` : ''}
    <p style="margin: 16px 0 0;"><strong>Message:</strong></p>
    <p style="white-space: pre-wrap; line-height: 1.6;">${escapeHtml(message)}</p>
  `;

  return {
    subject: `Contact Form: ${subject}`,
    html: wrapEmailBody(inner, { frontendBaseUrl }),
  };
}

function buildNewsletterWelcomeEmail({ frontendBaseUrl } = {}) {
  return {
    subject: "🎉 Thanks for joining Cool, Calm & Karter!",
    html: wrapEmailBody(`
      <h2 style="color: ${BRAND_CORAL}; text-align: center;">You're officially part of the family!</h2>
      <p style="text-align: center; font-size: 15px; line-height: 1.6;">Thanks for signing up for our newsletter.</p>
    `, { frontendBaseUrl }),
  };
}

function buildNewsletterAdminNotification({ email, ip }, { frontendBaseUrl } = {}) {
  return {
    subject: '📬 New Newsletter Signup',
    html: wrapEmailBody(`
      <p style="margin: 0 0 4px;">New signup: <strong>${escapeHtml(email)}</strong></p>
      ${ip ? `<p style="margin: 0; color: #888888; font-size: 13px;">IP: ${escapeHtml(ip)}</p>` : ''}
    `, { frontendBaseUrl }),
  };
}

/**
 * My Orders magic-link email. Provides secure authentication access only
 * — deliberately contains no order data whatsoever (no order numbers,
 * purchases, shipping address, tracking, or anything else that would turn
 * a compromised/misdirected email into an information leak on its own).
 * `magicLinkUrl` is expected to already be a complete URL with the raw
 * token in a fragment (`#token=...`), built by the caller
 * (process-orders-access-request.js) — this function only renders it.
 */
function buildMagicLinkEmail({ magicLinkUrl, expiresInMinutes = 15 } = {}, { frontendBaseUrl } = {}) {
  const inner = `
    <h2 style="color: ${BRAND_NAVY}; text-align: center; margin: 8px 0 16px;">Access Your Order History</h2>
    <p style="font-size: 15px; line-height: 1.6; text-align: center;">
      Someone requested access to view the Cool, Calm &amp; Karter order history for this email address. If that was you, click below to securely view your orders.
    </p>
    <div style="text-align: center; margin: 28px 0;">
      <a href="${magicLinkUrl}" style="display: inline-block; background-color: ${BRAND_CORAL}; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 999px; font-weight: bold; font-size: 16px;">View My Orders</a>
    </div>
    <p style="font-size: 13px; color: #888888; text-align: center; margin: 0 0 8px;">
      This link expires in ${expiresInMinutes} minutes and can only be used once.
    </p>
    <p style="font-size: 13px; color: #888888; text-align: center; margin: 0;">
      If you didn't request this, no action is needed — you can safely ignore this email.
    </p>
  `;

  return {
    subject: 'Access Your Cool, Calm & Karter Order History',
    html: wrapEmailBody(inner, { frontendBaseUrl }),
  };
}

module.exports = {
  buildOrderConfirmationEmail,
  buildAdminOrderNotificationEmail,
  buildContactNotificationEmail,
  buildNewsletterWelcomeEmail,
  buildNewsletterAdminNotification,
  buildMagicLinkEmail,
  buildPublicAssetUrl,
  formatCurrency,
  formatAddress,
  escapeHtml,
  LOGO_ASSET_PATH,
};
