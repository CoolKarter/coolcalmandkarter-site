import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getOrderDisplayNumber,
  getOrderStatusLabel,
  hasRealTrackingInfo,
  resolveCoverForItem,
  formatOrderAmount,
} from '../src/lib/order-list-view.js';

test('getOrderDisplayNumber shows the real order number when present', () => {
  assert.equal(getOrderDisplayNumber({ orderNumber: 'CCK-20260808-4F2A' }), 'CCK-20260808-4F2A');
});

test('getOrderDisplayNumber falls back to a neutral label for a legacy order — never a Mongo _id', () => {
  assert.equal(getOrderDisplayNumber({ orderNumber: null }), 'Earlier Order');
  assert.equal(getOrderDisplayNumber({}), 'Earlier Order');
  assert.equal(getOrderDisplayNumber({ orderNumber: '' }), 'Earlier Order');
  assert.equal(getOrderDisplayNumber({ _id: '674f2a1b9c3d4e5f6a7b8c9d' }), 'Earlier Order');
});

test('getOrderStatusLabel maps every known status to a human label', () => {
  assert.equal(getOrderStatusLabel('received'), 'Received');
  assert.equal(getOrderStatusLabel('processing'), 'Processing');
  assert.equal(getOrderStatusLabel('shipped'), 'Shipped');
  assert.equal(getOrderStatusLabel('delivered'), 'Delivered');
  assert.equal(getOrderStatusLabel('cancelled'), 'Cancelled');
});

test('getOrderStatusLabel falls back to "Received" for a missing/unrecognized status — matches backend normalization', () => {
  assert.equal(getOrderStatusLabel(undefined), 'Received');
  assert.equal(getOrderStatusLabel(null), 'Received');
  assert.equal(getOrderStatusLabel('not-a-real-status'), 'Received');
});

test('hasRealTrackingInfo is true only when carrier or trackingNumber genuinely exist', () => {
  assert.equal(hasRealTrackingInfo({ carrier: 'USPS', trackingNumber: null }), true);
  assert.equal(hasRealTrackingInfo({ carrier: null, trackingNumber: '9400111899223197428490' }), true);
  assert.equal(hasRealTrackingInfo({ carrier: null, trackingNumber: null }), false);
  assert.equal(hasRealTrackingInfo({}), false);
});

test('resolveCoverForItem returns the mapped cover for a known slug', () => {
  const coverMap = { 'florida-beach-and-baby': { src: '/covers/florida.webp', alt: 'Florida, Beach & Baby' } };
  const result = resolveCoverForItem({ slug: 'florida-beach-and-baby' }, coverMap);
  assert.deepEqual(result, coverMap['florida-beach-and-baby']);
});

test('resolveCoverForItem returns null (never a guess) for a legacy item with no slug', () => {
  assert.equal(resolveCoverForItem({ slug: null, title: 'Some Old Book' }, {}), null);
  assert.equal(resolveCoverForItem({}, {}), null);
});

test('resolveCoverForItem returns null for a slug not present in the map, rather than throwing', () => {
  assert.equal(resolveCoverForItem({ slug: 'not-in-catalog' }, {}), null);
});

test('formatOrderAmount formats cents as dollars', () => {
  assert.equal(formatOrderAmount(1998), '$19.98');
  assert.equal(formatOrderAmount(0), '$0.00');
});

test('formatOrderAmount returns a neutral placeholder for a missing amount, never $0.00 or $NaN', () => {
  assert.equal(formatOrderAmount(null), '—');
  assert.equal(formatOrderAmount(undefined), '—');
  assert.equal(formatOrderAmount('not-a-number'), '—');
});
