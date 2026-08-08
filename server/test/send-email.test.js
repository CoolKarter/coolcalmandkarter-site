'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { sendEmail } = require('../lib/send-email');

const TEST_ENV = { RESEND_API_KEY: 're_test_placeholder', EMAIL_FROM: 'Test Sender <test@example.com>' };

function fakeClientThatSucceeds() {
  const calls = [];
  return {
    calls,
    emails: {
      send: async (payload) => {
        calls.push(payload);
        return { data: { id: 'email_test_123' } };
      },
    },
  };
}

test('sends successfully via an injected fake client (no real network call, no real API key)', async () => {
  const client = fakeClientThatSucceeds();
  const result = await sendEmail(
    { to: 'buyer@example.com', subject: 'Hello', html: '<p>Hi</p>' },
    { client, env: TEST_ENV },
  );

  assert.equal(result.ok, true);
  assert.equal(result.id, 'email_test_123');
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].from, TEST_ENV.EMAIL_FROM);
  assert.equal(client.calls[0].to, 'buyer@example.com');
});

test('never sends the API key value anywhere in the outgoing payload', async () => {
  const client = fakeClientThatSucceeds();
  await sendEmail({ to: 'buyer@example.com', subject: 'Hello', html: '<p>Hi</p>' }, { client, env: TEST_ENV });

  const serializedPayload = JSON.stringify(client.calls[0]);
  assert.ok(!serializedPayload.includes(TEST_ENV.RESEND_API_KEY));
});

test('fails closed (never throws) when EMAIL_FROM is not configured', async () => {
  const client = fakeClientThatSucceeds();
  const result = await sendEmail(
    { to: 'buyer@example.com', subject: 'Hello', html: '<p>Hi</p>' },
    { client, env: { RESEND_API_KEY: 're_test_placeholder' } },
  );

  assert.equal(result.ok, false);
  assert.match(result.error, /EMAIL_FROM/);
  assert.equal(client.calls.length, 0);
});

test('retries once on a thrown network error, then succeeds', async () => {
  let attempts = 0;
  const client = {
    emails: {
      send: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('simulated network timeout');
        return { data: { id: 'email_after_retry' } };
      },
    },
  };

  const result = await sendEmail({ to: 'buyer@example.com', subject: 'Hello', html: '<p>Hi</p>' }, { client, env: TEST_ENV });

  assert.equal(result.ok, true);
  assert.equal(result.id, 'email_after_retry');
  assert.equal(attempts, 2);
});

test('retries once on an SDK-reported error result, then succeeds', async () => {
  let attempts = 0;
  const client = {
    emails: {
      send: async () => {
        attempts += 1;
        if (attempts === 1) return { error: { message: 'simulated Resend rejection' } };
        return { data: { id: 'email_after_retry_2' } };
      },
    },
  };

  const result = await sendEmail({ to: 'buyer@example.com', subject: 'Hello', html: '<p>Hi</p>' }, { client, env: TEST_ENV });
  assert.equal(result.ok, true);
  assert.equal(attempts, 2);
});

test('exhausts retries and returns a failure result instead of throwing when every attempt fails', async () => {
  let attempts = 0;
  const client = {
    emails: {
      send: async () => {
        attempts += 1;
        throw new Error('persistently down');
      },
    },
  };

  const result = await sendEmail(
    { to: 'buyer@example.com', subject: 'Hello', html: '<p>Hi</p>' },
    { client, env: TEST_ENV, retries: 1 },
  );

  assert.equal(result.ok, false);
  assert.match(result.error, /persistently down/);
  assert.equal(attempts, 2); // 1 initial attempt + 1 retry
});

test('resolves (never rejects) even when the underlying client throws synchronously', async () => {
  const client = { emails: { send: () => { throw new Error('sync throw'); } } };
  await assert.doesNotReject(() =>
    sendEmail({ to: 'buyer@example.com', subject: 'Hello', html: '<p>Hi</p>' }, { client, env: TEST_ENV, retries: 0 }),
  );
});
