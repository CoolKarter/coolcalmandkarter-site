'use strict';

const { Resend } = require('resend');

let cachedClient = null;
let cachedApiKey = null;

/** Lazily constructs the Resend client so a missing RESEND_API_KEY only surfaces when an email is actually attempted, not at module load. Rebuilds if the key changes (e.g. between tests). */
function getDefaultClient(apiKey) {
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured.');
  }
  if (!cachedClient || cachedApiKey !== apiKey) {
    cachedClient = new Resend(apiKey);
    cachedApiKey = apiKey;
  }
  return cachedClient;
}

/**
 * Sends one email via Resend. Never throws — every caller (the webhook,
 * the contact route, the newsletter route) gets back a plain
 * { ok, id? , error? } result and decides for itself what a failure means
 * for its own response, instead of this helper deciding for them. This is
 * what lets order-saving stay fully decoupled from email delivery: a
 * Resend outage can never become an unhandled rejection or an exception
 * that interrupts a caller's own success path.
 *
 * Retries once by default on a failed send (either a thrown error or a
 * `{ error }` result from the SDK) — enough to absorb a transient network
 * blip without building a queue/worker for a storefront this size. No
 * secret value (the API key) is ever logged; only the Resend-assigned
 * message id (on success) or the error message (on failure).
 *
 * `client` and `env` are injectable so this is unit-testable without a
 * real network call, a real API key, or mutating process.env.
 */
async function sendEmail({ to, subject, html, replyTo }, { client, retries = 1, env = process.env } = {}) {
  const from = env.EMAIL_FROM;
  if (!from) {
    console.error('❌ Resend send skipped: EMAIL_FROM is not configured.');
    return { ok: false, error: 'EMAIL_FROM is not configured.' };
  }

  let resend;
  try {
    resend = client || getDefaultClient(env.RESEND_API_KEY);
  } catch (err) {
    console.error('❌ Resend send skipped:', err.message);
    return { ok: false, error: err.message };
  }

  const payload = { from, to, subject, html };
  if (replyTo) payload.reply_to = replyTo;

  let lastError = null;
  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    try {
      const result = await resend.emails.send(payload);
      if (result?.error) {
        lastError = result.error.message || String(result.error);
        console.error(`❌ Resend error sending "${subject}" (attempt ${attempt}):`, lastError);
        continue;
      }
      console.log(`✅ Resend email sent: "${subject}" (attempt ${attempt}, id: ${result?.data?.id || 'unknown'})`);
      return { ok: true, id: result?.data?.id };
    } catch (err) {
      lastError = err.message || String(err);
      console.error(`❌ Resend send threw for "${subject}" (attempt ${attempt}):`, lastError);
    }
  }

  return { ok: false, error: lastError || 'Unknown Resend error' };
}

module.exports = { sendEmail, getDefaultClient };
