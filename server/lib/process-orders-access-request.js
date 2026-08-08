'use strict';

const { normalizeEmail } = require('./normalize-email');
const { generateSecureToken, hashToken } = require('./secure-token');
const { sendEmail: defaultSendEmail } = require('./send-email');
const { buildMagicLinkEmail } = require('./email-templates');
const { buildCustomerOrdersFilter, ORDER_EMAIL_COLLATION } = require('./customer-orders');
const { normalizeBaseUrl } = require('./frontend-url');

const TOKEN_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
const RESEND_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes — avoids re-sending on every rapid resubmit

// The one and only public response shape for a well-formed email —
// identical whether or not that email has any orders, whether a token was
// actually created, and regardless of whether the Resend send succeeds.
// This is what makes email enumeration impossible from this endpoint.
const GENERIC_RESPONSE = Object.freeze({
  ok: true,
  message: "If orders exist for that email, we've sent a secure access link.",
});

/**
 * Orchestrates one magic-link access request end-to-end. Always resolves
 * `{ ...GENERIC_RESPONSE, internalOutcome }` for any well-formed email —
 * `internalOutcome` exists purely for safe, generic server-side logging
 * (server.js never sends it to the client) and is one of:
 *   'sent'        — a new token was created and the email was attempted
 *   'cooldown'     — a recent unexpired token already exists; nothing new sent
 *   'no-orders'    — no order exists for this email; nothing sent
 *   'email-failed' — token created, but the Resend send itself failed
 *
 * A genuinely malformed email is the one case with a different response
 * shape (`{ ok: false, error }`) — that's input validation, not an
 * enumeration risk, since it says nothing about any account's existence.
 *
 * All dependencies are injected so this is fully testable without a real
 * database, Resend call, or mutated process.env.
 */
async function processOrdersAccessRequest({
  email,
  OrderModel,
  OrderAccessTokenModel,
  frontendBaseUrl,
  now = new Date(),
  generateToken = generateSecureToken,
  sendEmailFn = defaultSendEmail,
}) {
  const normalized = normalizeEmail(email);
  if (!normalized.ok) {
    return { ok: false, error: normalized.error, internalOutcome: 'invalid-email' };
  }
  const emailNormalized = normalized.email;

  const recentToken = await OrderAccessTokenModel.findOne({
    emailNormalized,
    usedAt: null,
    expiresAt: { $gt: now },
    createdAt: { $gt: new Date(now.getTime() - RESEND_COOLDOWN_MS) },
  });
  if (recentToken) {
    return { ...GENERIC_RESPONSE, internalOutcome: 'cooldown' };
  }

  const existingOrder = await OrderModel.findOne(
    buildCustomerOrdersFilter(emailNormalized),
    null,
    { collation: ORDER_EMAIL_COLLATION },
  );
  if (!existingOrder) {
    return { ...GENERIC_RESPONSE, internalOutcome: 'no-orders' };
  }

  const rawToken = generateToken();
  await OrderAccessTokenModel.create({
    tokenHash: hashToken(rawToken),
    emailNormalized,
    createdAt: now,
    expiresAt: new Date(now.getTime() + TOKEN_EXPIRY_MS),
    usedAt: null,
  });

  const magicLinkUrl = `${normalizeBaseUrl(frontendBaseUrl)}/my-orders/verify#token=${rawToken}`;
  const emailResult = await sendEmailFn(
    {
      to: emailNormalized,
      ...buildMagicLinkEmail({ magicLinkUrl, expiresInMinutes: TOKEN_EXPIRY_MS / 60000 }, { frontendBaseUrl }),
    },
  );

  return { ...GENERIC_RESPONSE, internalOutcome: emailResult.ok ? 'sent' : 'email-failed' };
}

module.exports = { processOrdersAccessRequest, TOKEN_EXPIRY_MS, RESEND_COOLDOWN_MS, GENERIC_RESPONSE };
