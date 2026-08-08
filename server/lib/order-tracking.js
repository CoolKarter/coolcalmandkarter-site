'use strict';

// Deliberately loose: different carriers format tracking numbers completely
// differently (USPS, UPS, FedEx, DHL, regional carriers, etc.), so this
// only trims/rejects-blank/caps length — it never validates a specific
// format. Both fields are always optional; providing neither is a
// legitimate outcome (some shipments genuinely have no trackable number),
// not an error.
const MAX_CARRIER_LENGTH = 60;
const MAX_TRACKING_NUMBER_LENGTH = 100;

function validateTrimmedField(value, { fieldName, maxLength }) {
  if (value === undefined || value === null) {
    return { ok: true, value: undefined };
  }
  if (typeof value !== 'string') {
    return { ok: false, error: `${fieldName} must be a string.` };
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return { ok: false, error: `${fieldName} cannot be blank or whitespace-only.` };
  }
  if (trimmed.length > maxLength) {
    return { ok: false, error: `${fieldName} cannot exceed ${maxLength} characters.` };
  }
  return { ok: true, value: trimmed };
}

/**
 * Validates and normalizes optional carrier/trackingNumber input.
 * Never invents a value — omitting a field is always valid; supplying one
 * requires it to be a real, non-blank, reasonably-sized string. Returns
 * `{ ok: true, carrier?, trackingNumber? }` (only the fields that were
 * actually supplied, trimmed) or `{ ok: false, error }`.
 */
function validateTrackingFields({ carrier, trackingNumber } = {}) {
  const carrierResult = validateTrimmedField(carrier, { fieldName: 'carrier', maxLength: MAX_CARRIER_LENGTH });
  if (!carrierResult.ok) return carrierResult;

  const trackingResult = validateTrimmedField(trackingNumber, {
    fieldName: 'trackingNumber',
    maxLength: MAX_TRACKING_NUMBER_LENGTH,
  });
  if (!trackingResult.ok) return trackingResult;

  const normalized = { ok: true };
  if (carrierResult.value !== undefined) normalized.carrier = carrierResult.value;
  if (trackingResult.value !== undefined) normalized.trackingNumber = trackingResult.value;
  return normalized;
}

module.exports = { validateTrackingFields, MAX_CARRIER_LENGTH, MAX_TRACKING_NUMBER_LENGTH };
