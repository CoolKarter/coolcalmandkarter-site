'use strict';

// Case-insensitive EXACT email matching via MongoDB collation — never a
// RegExp built from customer-supplied input. Strength 2 = case-insensitive,
// accent-sensitive, which is the standard Mongo recommendation for
// case-insensitive exact-match queries. Applied via the query `options`
// argument (not `.collation()` chaining) so this stays trivially fakeable
// in tests without reproducing Mongoose's full chainable Query API.
const ORDER_EMAIL_COLLATION = { locale: 'en', strength: 2 };

/**
 * Matches an order to a verified customer email two ways at once: new
 * orders via the always-lowercase `emailNormalized` field, and legacy
 * orders (saved before that field existed) via case-insensitive collation
 * on the original `email` field. `emailNormalized` passed in here is
 * assumed already normalized (lowercased) by normalize-email.js — this
 * function does no normalization of its own, it only builds the filter.
 */
function buildCustomerOrdersFilter(emailNormalized) {
  return { $or: [{ emailNormalized }, { email: emailNormalized }] };
}

/**
 * Same ownership match as buildCustomerOrdersFilter, additionally
 * constrained to one exact orderNumber. This is the enforcement point for
 * "customer A can never retrieve customer B's order" — orderNumber alone
 * is never sufficient, the email match is always required in the same
 * query, not checked afterward.
 */
function buildCustomerOrderDetailFilter(orderNumber, emailNormalized) {
  return { orderNumber, $or: [{ emailNormalized }, { email: emailNormalized }] };
}

module.exports = { buildCustomerOrdersFilter, buildCustomerOrderDetailFilter, ORDER_EMAIL_COLLATION };
