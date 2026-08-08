'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { processNewsletterSignup } = require('../lib/process-newsletter-signup');

function makeDuplicateKeyError() {
  const err = new Error('E11000 duplicate key error collection: test.newsletteremails index: email_1');
  err.code = 11000;
  return err;
}

function createFakeNewsletterModel({ existing = [] } = {}) {
  const store = [...existing];
  class FakeNewsletterEmail {
    constructor(data) {
      Object.assign(this, data);
    }
    async save() {
      if (store.includes(this.email)) throw makeDuplicateKeyError();
      store.push(this.email);
      return this;
    }
  }
  FakeNewsletterEmail.__store = store;
  return FakeNewsletterEmail;
}

test('persists a new signup and reports success independent of any email step', async () => {
  const NewsletterEmailModel = createFakeNewsletterModel();
  const result = await processNewsletterSignup({ email: 'fan@example.com', ip: '1.2.3.4', NewsletterEmailModel });

  assert.deepEqual(result, { ok: true, duplicate: false });
  assert.deepEqual(NewsletterEmailModel.__store, ['fan@example.com']);
});

test('reports a duplicate signup distinctly, without throwing', async () => {
  const NewsletterEmailModel = createFakeNewsletterModel({ existing: ['fan@example.com'] });
  const result = await processNewsletterSignup({ email: 'fan@example.com', ip: '1.2.3.4', NewsletterEmailModel });

  assert.deepEqual(result, { ok: false, duplicate: true });
});

test('a genuine (non-duplicate) database error propagates instead of being swallowed', async () => {
  class ThrowingModel {
    constructor(data) { Object.assign(this, data); }
    async save() { throw new Error('MongoDB unreachable'); }
  }

  await assert.rejects(
    () => processNewsletterSignup({ email: 'fan@example.com', ip: '1.2.3.4', NewsletterEmailModel: ThrowingModel }),
    /MongoDB unreachable/,
  );
});

test('persistence success is fully determined before any email would be attempted — the caller decides email timing, this never touches it', async () => {
  // Demonstrates the core bug fix: this function's contract has no email
  // parameter or email step at all, so a caller structurally cannot make
  // the signup's success/failure outcome depend on email delivery.
  const NewsletterEmailModel = createFakeNewsletterModel();
  const result = await processNewsletterSignup({ email: 'fan@example.com', ip: null, NewsletterEmailModel });
  assert.equal(result.ok, true);
  assert.equal('sendEmail' in result, false);
});
