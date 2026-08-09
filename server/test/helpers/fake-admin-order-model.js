'use strict';

// In-memory stand-in for the Mongoose Order model, covering just the
// surface the Phase 13E admin routes actually use: find().sort(),
// findOne({orderNumber}), and a conditional findOneAndUpdate() that
// simulates Mongo's real match-then-update semantics — including the
// optimistic-concurrency guard the admin PATCH route relies on (see
// buildOrderStatusMatchCondition in admin-order-update.js): if the match
// query (built from whatever status was read) no longer matches the
// current document, the update finds nothing and returns null, exactly
// like a real conditional Mongo write would.

function matches(doc, query) {
  return Object.entries(query).every(([key, condition]) => {
    if (condition && typeof condition === 'object' && '$exists' in condition) {
      const has = Object.prototype.hasOwnProperty.call(doc, key) && doc[key] !== undefined;
      return has === condition.$exists;
    }
    return doc[key] === condition;
  });
}

function createFakeAdminOrderModel({ orders = [] } = {}) {
  const store = orders.map((o) => ({ ...o }));

  // Test hook: fired once, synchronously, right before findOneAndUpdate
  // actually applies its match — lets a test inject a concurrent write
  // into the exact gap a real race would land in (between another
  // request's own findOne and findOneAndUpdate), which two sequential
  // fetch() calls in a test can't reliably reproduce on their own.
  let onBeforeUpdate = null;

  return {
    find: (query = {}) => ({
      sort: async () =>
        store
          .filter((o) => matches(o, query))
          .slice()
          .sort((a, b) => new Date(b.date) - new Date(a.date)),
    }),
    findOne: async (query) => store.find((o) => matches(o, query)) || null,
    findOneAndUpdate: async (query, update, options = {}) => {
      if (onBeforeUpdate) {
        const hook = onBeforeUpdate;
        onBeforeUpdate = null; // only fire once, like a single concurrent writer would
        await hook();
      }
      const doc = store.find((o) => matches(o, query));
      if (!doc) return null;
      Object.assign(doc, update.$set || {});
      return options.new ? { ...doc } : doc;
    },
    __setOnBeforeUpdate: (fn) => {
      onBeforeUpdate = fn;
    },
    __store: store,
  };
}

module.exports = { createFakeAdminOrderModel };
