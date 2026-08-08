'use strict';

// A minimal in-memory stand-in for the Mongoose Order model, just enough of
// the surface process-checkout-completed.js actually uses (`findOne`,
// `new Model(data)`, `.save()`) to unit-test idempotency/order-number logic
// without a real MongoDB connection. Simulates MongoDB's unique-index
// duplicate-key error (code 11000) for stripeSessionId/orderNumber so the
// same race-handling code path under test runs against something
// realistic, not a guess at what a real error looks like.

function makeDuplicateKeyError(field, value) {
  const err = new Error(`E11000 duplicate key error collection: test.orders index: ${field}_1 dup key: { ${field}: "${value}" }`);
  err.code = 11000;
  err.keyPattern = { [field]: 1 };
  err.keyValue = { [field]: value };
  return err;
}

function createFakeOrderModel({ existing = [] } = {}) {
  const store = [...existing];

  // Test hook: called synchronously right before a `.save()` actually
  // commits, so a test can simulate a concurrent writer racing in between
  // this model's `findOne` idempotency check and its `.save()` call.
  let onBeforeSave = null;

  class FakeOrder {
    constructor(data) {
      Object.assign(this, data);
    }

    async save() {
      if (onBeforeSave) {
        const hook = onBeforeSave;
        onBeforeSave = null; // only fire once, like a single concurrent writer would
        await hook();
      }

      if (this.stripeSessionId && store.some((o) => o.stripeSessionId === this.stripeSessionId)) {
        throw makeDuplicateKeyError('stripeSessionId', this.stripeSessionId);
      }
      if (this.orderNumber && store.some((o) => o.orderNumber === this.orderNumber)) {
        throw makeDuplicateKeyError('orderNumber', this.orderNumber);
      }

      store.push(this);
      return this;
    }
  }

  FakeOrder.findOne = async (query) => {
    if (query?.stripeSessionId) {
      return store.find((o) => o.stripeSessionId === query.stripeSessionId) || null;
    }
    return null;
  };

  FakeOrder.__setOnBeforeSave = (fn) => {
    onBeforeSave = fn;
  };
  FakeOrder.__store = store;

  return FakeOrder;
}

module.exports = { createFakeOrderModel, makeDuplicateKeyError };
