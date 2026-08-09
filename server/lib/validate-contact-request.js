'use strict';

const { normalizeEmail } = require('./normalize-email');

// Generous enough for a real name/subject/message, small enough to bound
// an abusive oversized payload. Not derived from any external spec — a
// picture-book storefront's contact form has no legitimate reason to
// receive a multi-megabyte message.
const MAX_NAME_LENGTH = 100;
const MAX_REASON_LENGTH = 100;
const MAX_SUBJECT_LENGTH = 150;
const MAX_MESSAGE_LENGTH = 5000;

function validateTrimmedField(value, { fieldName, maxLength, required = true }) {
  if (value === undefined || value === null) {
    if (required) return { ok: false, error: `Please enter your ${fieldName}.` };
    return { ok: true, value: undefined };
  }
  if (typeof value !== 'string') {
    return { ok: false, error: `${fieldName} must be a string.` };
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    if (required) return { ok: false, error: `Please enter your ${fieldName}.` };
    return { ok: true, value: undefined };
  }
  if (trimmed.length > maxLength) {
    return { ok: false, error: `${fieldName} cannot exceed ${maxLength} characters.` };
  }
  return { ok: true, value: trimmed };
}

/**
 * Validates the /api/contact request body — preserves the existing
 * frontend contract exactly (name/email/reason/subject/message, all
 * always sent as strings by contact.astro's form, `reason` populated from
 * a <select> that always has a real selected value) while replacing the
 * old presence-only check (`!name || !email || !subject || !message`)
 * with real length bounds and, for email, the project's existing
 * normalize-email.js validation rather than a separate, redundant regex.
 * Never invents a value for a missing field — every rejection names
 * exactly which field failed, same as the rest of this codebase's
 * validators.
 */
function validateContactRequest(body) {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be an object.' };
  }

  const nameResult = validateTrimmedField(body.name, { fieldName: 'name', maxLength: MAX_NAME_LENGTH });
  if (!nameResult.ok) return nameResult;

  const emailResult = normalizeEmail(body.email);
  if (!emailResult.ok) return emailResult;

  // Reason is populated from a <select> with no blank option, so the real
  // frontend always sends a non-empty string — but this is intentionally
  // lenient (optional, no error if blank/absent) rather than rejecting a
  // direct API call that omits it, since the email template already
  // handles a missing reason gracefully.
  const reasonResult = validateTrimmedField(body.reason, { fieldName: 'reason', maxLength: MAX_REASON_LENGTH, required: false });
  if (!reasonResult.ok) return reasonResult;

  const subjectResult = validateTrimmedField(body.subject, { fieldName: 'subject', maxLength: MAX_SUBJECT_LENGTH });
  if (!subjectResult.ok) return subjectResult;

  const messageResult = validateTrimmedField(body.message, { fieldName: 'message', maxLength: MAX_MESSAGE_LENGTH });
  if (!messageResult.ok) return messageResult;

  return {
    ok: true,
    name: nameResult.value,
    email: emailResult.email,
    reason: reasonResult.value,
    subject: subjectResult.value,
    message: messageResult.value,
  };
}

module.exports = {
  validateContactRequest,
  MAX_NAME_LENGTH,
  MAX_REASON_LENGTH,
  MAX_SUBJECT_LENGTH,
  MAX_MESSAGE_LENGTH,
};
