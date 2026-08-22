import test from 'node:test';
import assert from 'node:assert/strict';
import { filterAdminOrders } from '../src/lib/admin-order-filter.js';

function buildOrders() {
  return [
    { orderNumber: 'CCK-20260808-4F2A', name: 'Jamie Buyer', email: 'jamie@example.com', orderStatus: 'received', items: [{ title: 'Beach & Baby' }] },
    { orderNumber: 'CCK-20260101-AAAA', name: 'Sam Customer', email: 'sam@example.com', orderStatus: 'shipped', items: [{ title: 'Go To Sleep, Karter' }] },
    { orderNumber: null, name: 'Legacy Person', email: 'legacy@example.com', orderStatus: undefined, items: [{ title: 'Adventure, Fun & Baby' }] },
  ];
}

test('with no query/status, returns every order unchanged', () => {
  const orders = buildOrders();
  assert.deepEqual(filterAdminOrders(orders), orders);
  assert.deepEqual(filterAdminOrders(orders, { query: '', status: 'all' }), orders);
});

test('matches by CCK order number, case-insensitively', () => {
  const result = filterAdminOrders(buildOrders(), { query: 'cck-20260808' });
  assert.equal(result.length, 1);
  assert.equal(result[0].orderNumber, 'CCK-20260808-4F2A');
});

test('matches by customer name', () => {
  const result = filterAdminOrders(buildOrders(), { query: 'sam' });
  assert.equal(result.length, 1);
  assert.equal(result[0].name, 'Sam Customer');
});

test('matches by customer email', () => {
  const result = filterAdminOrders(buildOrders(), { query: 'legacy@example.com' });
  assert.equal(result.length, 1);
  assert.equal(result[0].name, 'Legacy Person');
});

test('matches by book title', () => {
  const result = filterAdminOrders(buildOrders(), { query: 'sleep' });
  assert.equal(result.length, 1);
  assert.equal(result[0].name, 'Sam Customer');
});

test('a query matching nothing returns an empty list, not an error', () => {
  const result = filterAdminOrders(buildOrders(), { query: 'no-such-order-exists' });
  assert.deepEqual(result, []);
});

test('filters by status, treating a legacy/missing status as "received"', () => {
  const result = filterAdminOrders(buildOrders(), { status: 'received' });
  assert.equal(result.length, 2); // Jamie (received) + the legacy order (normalizes to received)
});

test('status "all" returns every order regardless of query being empty', () => {
  const result = filterAdminOrders(buildOrders(), { status: 'all' });
  assert.equal(result.length, 3);
});

test('query and status combine as AND, not OR', () => {
  const result = filterAdminOrders(buildOrders(), { query: 'sam', status: 'shipped' });
  assert.equal(result.length, 1);

  const noMatch = filterAdminOrders(buildOrders(), { query: 'sam', status: 'cancelled' });
  assert.deepEqual(noMatch, []);
});

test('never mutates the input array', () => {
  const orders = buildOrders();
  const snapshot = JSON.stringify(orders);
  filterAdminOrders(orders, { query: 'sam', status: 'shipped' });
  assert.equal(JSON.stringify(orders), snapshot);
});

test('a non-array input returns an empty list rather than throwing', () => {
  assert.deepEqual(filterAdminOrders(undefined), []);
  assert.deepEqual(filterAdminOrders(null, { query: 'x' }), []);
});
