'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateTrackingFields, MAX_CARRIER_LENGTH, MAX_TRACKING_NUMBER_LENGTH } = require('../lib/order-tracking');

test('accepts valid carrier and trackingNumber, trimming surrounding whitespace', () => {
  const result = validateTrackingFields({ carrier: '  USPS  ', trackingNumber: '  9400111899223197428490  ' });
  assert.equal(result.ok, true);
  assert.equal(result.carrier, 'USPS');
  assert.equal(result.trackingNumber, '9400111899223197428490');
});

test('both fields are optional — supplying neither is valid, not an error', () => {
  const result = validateTrackingFields({});
  assert.equal(result.ok, true);
  assert.equal('carrier' in result, false);
  assert.equal('trackingNumber' in result, false);
});

test('supplying only one of the two fields is valid', () => {
  const result = validateTrackingFields({ carrier: 'UPS' });
  assert.equal(result.ok, true);
  assert.equal(result.carrier, 'UPS');
  assert.equal('trackingNumber' in result, false);
});

test('rejects a whitespace-only carrier', () => {
  const result = validateTrackingFields({ carrier: '   ' });
  assert.equal(result.ok, false);
  assert.match(result.error, /carrier/i);
});

test('rejects a whitespace-only trackingNumber', () => {
  const result = validateTrackingFields({ trackingNumber: '\t\n  ' });
  assert.equal(result.ok, false);
  assert.match(result.error, /trackingNumber/i);
});

test('rejects an oversized carrier value', () => {
  const result = validateTrackingFields({ carrier: 'x'.repeat(MAX_CARRIER_LENGTH + 1) });
  assert.equal(result.ok, false);
  assert.match(result.error, new RegExp(`${MAX_CARRIER_LENGTH}`));
});

test('rejects an oversized trackingNumber value', () => {
  const result = validateTrackingFields({ trackingNumber: '9'.repeat(MAX_TRACKING_NUMBER_LENGTH + 1) });
  assert.equal(result.ok, false);
});

test('accepts values at exactly the maximum length', () => {
  const result = validateTrackingFields({
    carrier: 'x'.repeat(MAX_CARRIER_LENGTH),
    trackingNumber: '9'.repeat(MAX_TRACKING_NUMBER_LENGTH),
  });
  assert.equal(result.ok, true);
});

test('does not restrict tracking-number format to any single carrier\'s conventions', () => {
  // USPS-style numeric, UPS-style alphanumeric, FedEx-style numeric,
  // DHL-style alphanumeric, and a completely made-up regional format —
  // all must be accepted; this function only trims/rejects-blank/caps length.
  const formats = ['9400111899223197428490', '1Z999AA10123456784', '039813852990', 'JD0123456789', 'REGIONAL-XYZ-001'];
  for (const trackingNumber of formats) {
    const result = validateTrackingFields({ trackingNumber });
    assert.equal(result.ok, true, `expected "${trackingNumber}" to be accepted`);
    assert.equal(result.trackingNumber, trackingNumber);
  }
});

test('rejects a non-string carrier/trackingNumber rather than silently coercing it', () => {
  assert.equal(validateTrackingFields({ carrier: 12345 }).ok, false);
  assert.equal(validateTrackingFields({ trackingNumber: {} }).ok, false);
});

test('null is treated the same as omitted (valid, not an error)', () => {
  const result = validateTrackingFields({ carrier: null, trackingNumber: null });
  assert.equal(result.ok, true);
});
