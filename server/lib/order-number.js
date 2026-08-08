'use strict';

const crypto = require('crypto');

/** Formats a Date as YYYYMMDD in UTC, so the date segment is stable regardless of server timezone. */
function formatDateForOrderNumber(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/**
 * Generates a customer-facing order number: CCK-YYYYMMDD-XXXX, where XXXX is
 * 4 uppercase hex characters from a cryptographically random source (not
 * sequential, not derived from the MongoDB _id or the Stripe session ID).
 * Collisions within the same day are astronomically unlikely (65,536
 * possible suffixes) and are additionally guarded by a unique index at the
 * database layer — see process-checkout-completed.js, which regenerates and
 * retries on the rare event of a collision.
 */
function generateOrderNumber(date = new Date()) {
  const datePart = formatDateForOrderNumber(date);
  const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `CCK-${datePart}-${suffix}`;
}

module.exports = { generateOrderNumber, formatDateForOrderNumber };
