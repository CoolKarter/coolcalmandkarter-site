'use strict';

// Minimal in-memory stand-ins for the OrderAccessToken/CustomerSession
// Mongoose models — just enough surface (create/findOne/findOneAndUpdate/
// deleteOne) to unit-test the security-critical logic in
// verify-orders-access-token.js and customer-session.js without a real
// MongoDB connection.
//
// createFakeOrderAccessTokenModel's findOneAndUpdate performs its
// read-check-mutate entirely synchronously (no `await` inside), which is
// what makes it a faithful stand-in for MongoDB's real atomic guarantee:
// two "near-simultaneous" calls issued back-to-back (Promise.all, no
// await between issuing them) will genuinely serialize against this fake
// exactly as they would against a real atomic findOneAndUpdate, so a test
// asserting "exactly one of two concurrent verifications succeeds" is
// actually proving verify-orders-access-token.js relies on a single
// atomic operation rather than a separate read-then-write.

function matchesExpiresAtGt(doc, gtValue) {
  return doc.expiresAt instanceof Date && gtValue instanceof Date && doc.expiresAt.getTime() > gtValue.getTime();
}

function createFakeOrderAccessTokenModel({ existing = [] } = {}) {
  const store = existing.map((doc) => ({ ...doc }));

  return {
    __store: store,

    async create(data) {
      const doc = { usedAt: null, ...data };
      store.push(doc);
      return doc;
    },

    async findOne(query) {
      return (
        store.find(
          (doc) =>
            (query.tokenHash === undefined || doc.tokenHash === query.tokenHash) &&
            (query.emailNormalized === undefined || doc.emailNormalized === query.emailNormalized) &&
            (query.usedAt === undefined || doc.usedAt === query.usedAt) &&
            (query.expiresAt?.$gt === undefined || matchesExpiresAtGt(doc, query.expiresAt.$gt)) &&
            (query.createdAt?.$gt === undefined || doc.createdAt.getTime() > query.createdAt.$gt.getTime()),
        ) || null
      );
    },

    // Synchronous critical section — see file header.
    async findOneAndUpdate(filter, update, options = {}) {
      const doc = store.find(
        (d) =>
          d.tokenHash === filter.tokenHash &&
          d.usedAt === filter.usedAt &&
          matchesExpiresAtGt(d, filter.expiresAt.$gt),
      );
      if (!doc) return null;
      Object.assign(doc, update.$set);
      return options.new ? doc : { ...doc };
    },
  };
}

function createFakeCustomerSessionModel({ existing = [] } = {}) {
  const store = existing.map((doc) => ({ ...doc }));

  return {
    __store: store,

    async create(data) {
      const doc = { ...data };
      store.push(doc);
      return doc;
    },

    async findOne(query) {
      return (
        store.find(
          (doc) =>
            doc.sessionTokenHash === query.sessionTokenHash &&
            (query.expiresAt?.$gt === undefined || matchesExpiresAtGt(doc, query.expiresAt.$gt)),
        ) || null
      );
    },

    async deleteOne(query) {
      const index = store.findIndex((doc) => doc.sessionTokenHash === query.sessionTokenHash);
      if (index === -1) return { deletedCount: 0 };
      store.splice(index, 1);
      return { deletedCount: 1 };
    },
  };
}

module.exports = { createFakeOrderAccessTokenModel, createFakeCustomerSessionModel };
