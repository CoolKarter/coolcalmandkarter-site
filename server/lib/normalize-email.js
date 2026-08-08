'use strict';

// Same shape check already used for customerEmail in validate-checkout-request.js
// — not a full RFC 5322 validator, just enough to catch obviously malformed
// input. Deliberately not exported from that checkout-specific module so
// this stays independent of checkout code, even though the rule is
// identical for consistency.
const MAX_EMAIL_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Normalizes a customer-supplied email to a canonical, comparable form:
 * trimmed and lowercased. Rejects empty/malformed/oversized input. Never
 * constructs a RegExp from the input itself — EMAIL_PATTERN is a fixed
 * literal, the input is only ever tested against it, never used to build
 * a pattern.
 */
function normalizeEmail(rawEmail) {
  if (typeof rawEmail !== 'string') {
    return { ok: false, error: 'Email is required.' };
  }

  const trimmed = rawEmail.trim();
  if (trimmed === '') {
    return { ok: false, error: 'Email is required.' };
  }
  if (trimmed.length > MAX_EMAIL_LENGTH) {
    return { ok: false, error: 'Email is too long.' };
  }
  if (!EMAIL_PATTERN.test(trimmed)) {
    return { ok: false, error: 'Please enter a valid email address.' };
  }

  return { ok: true, email: trimmed.toLowerCase() };
}

module.exports = { normalizeEmail, MAX_EMAIL_LENGTH, EMAIL_PATTERN };
