'use strict';

const { ADMIN_SESSION_MAX_AGE_MS } = require('./admin-session');

// Cookie name/attributes for the admin session — a completely separate
// cookie from the customer session's `__Host-cck_session`/`cck_session`
// (session-cookie.js). Same same-origin-proxy design (SameSite=Lax, no
// Domain attribute, __Host- prefix only over genuine HTTPS — see
// session-cookie.js's comment for the full rationale, which applies
// identically here), but a distinct name so the two session systems can
// never be confused with, or substituted for, one another.
const SECURE_COOKIE_NAME = '__Host-cck_admin_session';
const INSECURE_COOKIE_NAME = 'cck_admin_session';

function getAdminSessionCookieName(req) {
  return req.secure ? SECURE_COOKIE_NAME : INSECURE_COOKIE_NAME;
}

function getAdminSessionCookieOptions(req) {
  return {
    httpOnly: true,
    secure: req.secure,
    sameSite: 'lax',
    path: '/',
    maxAge: ADMIN_SESSION_MAX_AGE_MS,
  };
}

function setAdminSessionCookie(req, res, rawSessionToken) {
  res.cookie(getAdminSessionCookieName(req), rawSessionToken, getAdminSessionCookieOptions(req));
}

function readAdminSessionCookie(req) {
  return req.cookies?.[getAdminSessionCookieName(req)] || null;
}

function clearAdminSessionCookie(req, res) {
  res.clearCookie(getAdminSessionCookieName(req), { ...getAdminSessionCookieOptions(req), maxAge: undefined });
}

module.exports = {
  SECURE_COOKIE_NAME,
  INSECURE_COOKIE_NAME,
  getAdminSessionCookieName,
  getAdminSessionCookieOptions,
  setAdminSessionCookie,
  readAdminSessionCookie,
  clearAdminSessionCookie,
};
