'use strict';

// Cookie name/attributes for the customer session. Designed for the
// SAME-ORIGIN architecture Phase 13D is expected to put in front of this
// (a Netlify redirect/proxy rule forwarding /api/* to Render — see the
// Phase 13C report for the full rationale) — SameSite=Lax, no Domain
// attribute (host-only), and the __Host- prefix when the connection is
// genuinely HTTPS.
//
// __Host- requires Secure + Path=/ + no Domain, all of which this design
// already satisfies — so it's "free" extra hardening (the browser refuses
// to accept the cookie at all unless every requirement is met, guarding
// against it ever being overridden by a sibling subdomain). It is NOT
// used when the connection isn't HTTPS, because Secure cookies (and by
// extension __Host- ones) are never stored by the browser over plain
// http:// — unconditionally requiring it would break local development
// against the plain-http Express server. `req.secure` (correct once
// `trust proxy` is set — see server.js) is what decides which name/flags
// apply, per-request, with no new environment variable needed.
const SECURE_COOKIE_NAME = '__Host-cck_session';
const INSECURE_COOKIE_NAME = 'cck_session';

const SESSION_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days, fixed — not sliding

/** The cookie name to use for this request — depends on whether the connection is genuinely HTTPS. */
function getSessionCookieName(req) {
  return req.secure ? SECURE_COOKIE_NAME : INSECURE_COOKIE_NAME;
}

/** Cookie attributes for setting the session cookie. No Domain attribute (host-only). */
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    secure: req.secure,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_MS,
  };
}

/** Attaches the session cookie to the response. */
function setSessionCookie(req, res, rawSessionToken) {
  res.cookie(getSessionCookieName(req), rawSessionToken, getSessionCookieOptions(req));
}

/** Reads the raw session token from the incoming request's cookies, if present. */
function readSessionCookie(req) {
  return req.cookies?.[getSessionCookieName(req)] || null;
}

/** Expires the session cookie on the response — same name/attributes it was set with, so the browser actually clears it. */
function clearSessionCookie(req, res) {
  res.clearCookie(getSessionCookieName(req), { ...getSessionCookieOptions(req), maxAge: undefined });
}

module.exports = {
  SECURE_COOKIE_NAME,
  INSECURE_COOKIE_NAME,
  SESSION_MAX_AGE_MS,
  getSessionCookieName,
  getSessionCookieOptions,
  setSessionCookie,
  readSessionCookie,
  clearSessionCookie,
};
