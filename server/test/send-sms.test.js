'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { sendSms } = require('../lib/send-sms');

const TEST_ENV = {
  TWILIO_ACCOUNT_SID: 'ACtest_placeholder',
  TWILIO_AUTH_TOKEN: 'test_auth_token_placeholder',
  TWILIO_FROM_NUMBER: '+15550001111',
};

function fakeClientThatSucceeds() {
  const calls = [];
  return {
    calls,
    messages: {
      create: async (payload) => {
        calls.push(payload);
        return { sid: 'SM_test_123' };
      },
    },
  };
}

test('sends successfully via an injected fake client (no real network call, no real credentials)', async () => {
  const client = fakeClientThatSucceeds();
  const result = await sendSms({ to: '+15550002222', body: 'Hello' }, { client, env: TEST_ENV });

  assert.equal(result.ok, true);
  assert.equal(result.sid, 'SM_test_123');
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].from, TEST_ENV.TWILIO_FROM_NUMBER);
  assert.equal(client.calls[0].to, '+15550002222');
  assert.equal(client.calls[0].body, 'Hello');
});

test('never sends TWILIO_AUTH_TOKEN anywhere in the outgoing payload', async () => {
  const client = fakeClientThatSucceeds();
  await sendSms({ to: '+15550002222', body: 'Hello' }, { client, env: TEST_ENV });

  const serializedPayload = JSON.stringify(client.calls[0]);
  assert.ok(!serializedPayload.includes(TEST_ENV.TWILIO_AUTH_TOKEN));
});

test('fails closed (never throws) when no destination number is provided', async () => {
  const client = fakeClientThatSucceeds();
  const result = await sendSms({ to: undefined, body: 'Hello' }, { client, env: TEST_ENV });

  assert.equal(result.ok, false);
  assert.match(result.error, /destination/i);
  assert.equal(client.calls.length, 0);
});

test('fails closed (never throws) when TWILIO_FROM_NUMBER is not configured', async () => {
  const client = fakeClientThatSucceeds();
  const result = await sendSms(
    { to: '+15550002222', body: 'Hello' },
    { client, env: { TWILIO_ACCOUNT_SID: 'ACtest', TWILIO_AUTH_TOKEN: 'test' } },
  );

  assert.equal(result.ok, false);
  assert.match(result.error, /TWILIO_FROM_NUMBER/);
  assert.equal(client.calls.length, 0);
});

test('fails closed (never throws) when TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN are not configured and no client is injected', async () => {
  const result = await sendSms(
    { to: '+15550002222', body: 'Hello' },
    { env: { TWILIO_FROM_NUMBER: '+15550001111' } },
  );

  assert.equal(result.ok, false);
  assert.match(result.error, /TWILIO_ACCOUNT_SID/);
});

test('retries once on a thrown network error, then succeeds', async () => {
  let attempts = 0;
  const client = {
    messages: {
      create: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('simulated network timeout');
        return { sid: 'SM_after_retry' };
      },
    },
  };

  const result = await sendSms({ to: '+15550002222', body: 'Hello' }, { client, env: TEST_ENV });

  assert.equal(result.ok, true);
  assert.equal(result.sid, 'SM_after_retry');
  assert.equal(attempts, 2);
});

test('retries once when the response is missing a message SID, then succeeds', async () => {
  let attempts = 0;
  const client = {
    messages: {
      create: async () => {
        attempts += 1;
        if (attempts === 1) return {};
        return { sid: 'SM_after_retry_2' };
      },
    },
  };

  const result = await sendSms({ to: '+15550002222', body: 'Hello' }, { client, env: TEST_ENV });
  assert.equal(result.ok, true);
  assert.equal(attempts, 2);
});

test('retry behavior is bounded: exhausts retries and returns a failure result instead of throwing', async () => {
  let attempts = 0;
  const client = {
    messages: {
      create: async () => {
        attempts += 1;
        throw new Error('persistently down');
      },
    },
  };

  const result = await sendSms(
    { to: '+15550002222', body: 'Hello' },
    { client, env: TEST_ENV, retries: 1 },
  );

  assert.equal(result.ok, false);
  assert.match(result.error, /persistently down/);
  assert.equal(attempts, 2); // 1 initial attempt + 1 retry, never more
});

test('resolves (never rejects/throws) even when the underlying client throws synchronously', async () => {
  const client = { messages: { create: () => { throw new Error('sync throw'); } } };
  await assert.doesNotReject(() =>
    sendSms({ to: '+15550002222', body: 'Hello' }, { client, env: TEST_ENV, retries: 0 }),
  );
});
