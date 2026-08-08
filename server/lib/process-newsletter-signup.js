'use strict';

/**
 * Persists a newsletter signup and reports back whether it succeeded,
 * completely independent of whether any welcome/admin email succeeds —
 * callers should only attempt those emails after this resolves, and must
 * never let an email failure change the response already given to the
 * visitor (a real bug found in the pre-Resend implementation: a
 * successful signup could be reported as a 500 if the subsequent,
 * unrelated SMTP send timed out).
 *
 * Duplicate signups (a MongoDB unique-index violation on email) are
 * reported distinctly (`duplicate: true`) so the caller can return 409
 * rather than a generic failure; any other save error is a genuine
 * failure and the caller should treat it as one.
 */
async function processNewsletterSignup({ email, ip, NewsletterEmailModel }) {
  try {
    const doc = new NewsletterEmailModel({ email, ip });
    await doc.save();
    return { ok: true, duplicate: false };
  } catch (err) {
    if (err.code === 11000) {
      return { ok: false, duplicate: true };
    }
    throw err;
  }
}

module.exports = { processNewsletterSignup };
