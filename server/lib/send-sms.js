'use strict';

const twilio = require('twilio');

let cachedClient = null;
let cachedAccountSid = null;
let cachedAuthToken = null;

/** Lazily constructs the Twilio client so missing credentials only surface when an SMS is actually attempted, not at module load. Rebuilds if the credentials change (e.g. between tests). */
function getDefaultClient(accountSid, authToken) {
  if (!accountSid || !authToken) {
    throw new Error('TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN are not configured.');
  }
  if (!cachedClient || cachedAccountSid !== accountSid || cachedAuthToken !== authToken) {
    cachedClient = twilio(accountSid, authToken);
    cachedAccountSid = accountSid;
    cachedAuthToken = authToken;
  }
  return cachedClient;
}

/**
 * Sends one SMS via Twilio. Never throws — the caller (the webhook) gets
 * back a plain { ok, sid? }/{ ok, error? } result and decides for itself
 * what a failure means, instead of this helper deciding for them. This is
 * what lets order-saving stay fully decoupled from SMS delivery: a Twilio
 * outage can never become an unhandled rejection or an exception that
 * interrupts a caller's own success path — the exact same isolation
 * philosophy as server/lib/send-email.js.
 *
 * Retries once by default on a failed send (either a thrown error or a
 * result without a `sid`) — enough to absorb a transient network blip
 * without building a queue/worker for a storefront this size. No secret
 * value (TWILIO_AUTH_TOKEN) is ever logged; only the Twilio-assigned
 * message SID (on success) or the error message (on failure).
 *
 * `client` and `env` are injectable so this is unit-testable without a
 * real network call or real credentials.
 */
async function sendSms({ to, body }, { client, retries = 1, env = process.env } = {}) {
  const from = env.TWILIO_FROM_NUMBER;
  if (!to) {
    console.error('❌ Twilio send skipped: no destination number configured.');
    return { ok: false, error: 'No destination phone number configured.' };
  }
  if (!from) {
    console.error('❌ Twilio send skipped: TWILIO_FROM_NUMBER is not configured.');
    return { ok: false, error: 'TWILIO_FROM_NUMBER is not configured.' };
  }

  let twilioClient;
  try {
    twilioClient = client || getDefaultClient(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  } catch (err) {
    console.error('❌ Twilio send skipped:', err.message);
    return { ok: false, error: err.message };
  }

  let lastError = null;
  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    try {
      const result = await twilioClient.messages.create({ to, from, body });
      if (!result?.sid) {
        lastError = 'Twilio response did not include a message SID.';
        console.error(`❌ Twilio error sending SMS (attempt ${attempt}):`, lastError);
        continue;
      }
      console.log(`✅ Twilio SMS sent (attempt ${attempt}, sid: ${result.sid})`);
      return { ok: true, sid: result.sid };
    } catch (err) {
      lastError = err.message || String(err);
      console.error(`❌ Twilio send threw (attempt ${attempt}):`, lastError);
    }
  }

  return { ok: false, error: lastError || 'Unknown Twilio error' };
}

module.exports = { sendSms, getDefaultClient };
