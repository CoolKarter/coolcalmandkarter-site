'use strict';

const { validateCheckoutItems } = require('./validate-checkout-items');

const ALLOWED_TOP_LEVEL_KEYS = new Set(['items', 'customerEmail']);

// Practical mailbox-length ceiling (RFC 5321 caps the mailbox at 254
// characters) — generous for any real address, small enough to reject
// obvious abuse.
const MAX_EMAIL_LENGTH = 254;

// Same lightweight shape check already used elsewhere in this codebase
// (the legacy newsletter signup form) — not a full RFC 5322 validator,
// just enough to catch obviously malformed input.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates a full /api/checkout/session request body: rejects unsupported
 * top-level fields, validates an optional customerEmail, and (via
 * validateCheckoutItems) validates every cart line item against the
 * server-side catalog. Stripe Checkout can collect the customer's email
 * itself, so customerEmail may be omitted or blank — but if a non-blank
 * value is supplied, it must look like a real, reasonably-sized email
 * address.
 */
function validateCheckoutRequest(body, catalog) {
  if (!isPlainObject(body)) {
    return { ok: false, error: 'Request body must be an object.' };
  }

  const unknownKeys = Object.keys(body).filter((key) => !ALLOWED_TOP_LEVEL_KEYS.has(key));
  if (unknownKeys.length > 0) {
    return { ok: false, error: `Unsupported request field(s): ${unknownKeys.join(', ')}.` };
  }

  let customerEmail;
  if (body.customerEmail !== undefined && body.customerEmail !== null) {
    if (typeof body.customerEmail !== 'string') {
      return { ok: false, error: 'customerEmail must be a string.' };
    }

    const trimmed = body.customerEmail.trim();

    if (trimmed.length > MAX_EMAIL_LENGTH) {
      return { ok: false, error: 'customerEmail is too long.' };
    }

    if (trimmed !== '') {
      if (!EMAIL_PATTERN.test(trimmed)) {
        return { ok: false, error: 'customerEmail must be a valid email address.' };
      }
      customerEmail = trimmed;
    }
  }

  const itemsResult = validateCheckoutItems(body, catalog);
  if (!itemsResult.ok) {
    return itemsResult;
  }

  return {
    ok: true,
    items: itemsResult.items,
    totalQuantity: itemsResult.totalQuantity,
    customerEmail,
  };
}

module.exports = { validateCheckoutRequest, MAX_EMAIL_LENGTH };
