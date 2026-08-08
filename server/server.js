require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const path = require('path');
const mongoose = require('mongoose');
const { Parser } = require('json2csv');
const { getCatalog } = require('./lib/checkout-catalog');
const { validateCheckoutRequest } = require('./lib/validate-checkout-request');
const { buildCheckoutRedirectUrls } = require('./lib/frontend-url');
const { getAllowedOrigins } = require('./lib/cors-origins');
const { verifyCheckoutSession } = require('./lib/verify-checkout-session');
const { processCheckoutCompleted } = require('./lib/process-checkout-completed');
const { processNewsletterSignup } = require('./lib/process-newsletter-signup');
const { sendEmail } = require('./lib/send-email');
const { sendSms } = require('./lib/send-sms');
const { buildOrderNotificationSms } = require('./lib/sms-templates');
const { ORDER_STATUSES } = require('./lib/order-status');
const { MAX_CARRIER_LENGTH, MAX_TRACKING_NUMBER_LENGTH } = require('./lib/order-tracking');
const { toCustomerOrderView } = require('./lib/order-views');
const { processOrdersAccessRequest } = require('./lib/process-orders-access-request');
const { verifyOrdersAccessToken } = require('./lib/verify-orders-access-token');
const { createCustomerSession, authenticateCustomerSession, deleteCustomerSession } = require('./lib/customer-session');
const { setSessionCookie, readSessionCookie, clearSessionCookie } = require('./lib/session-cookie');
const { buildCustomerOrdersFilter, buildCustomerOrderDetailFilter, ORDER_EMAIL_COLLATION } = require('./lib/customer-orders');
const { normalizeEmail } = require('./lib/normalize-email');
const { ORDERS_ACCESS_RATE_LIMIT_WINDOW_MS, ORDERS_ACCESS_RATE_LIMIT_MAX } = require('./lib/orders-access-rate-limit');
const {
  buildOrderConfirmationEmail,
  buildAdminOrderNotificationEmail,
  buildContactNotificationEmail,
  buildNewsletterWelcomeEmail,
  buildNewsletterAdminNotification,
} = require('./lib/email-templates');

const app = express();
const PORT = process.env.PORT || 3000;

// Render (like Heroku/most PaaS platforms) terminates TLS and forwards
// every request through exactly one internal reverse-proxy hop. `1` means
// "trust exactly that one hop's X-Forwarded-* headers" — not the full
// chain (`true`), which would trust client-spoofable values if there were
// ever more than one proxy in front of this app. This is what makes
// `req.ip`/`req.secure` accurate (needed by the rate limiter below and by
// the session-cookie __Host- decision), instead of both always resolving
// to Render's internal proxy address/protocol.
app.set('trust proxy', 1);

// ✅ Define Mongo Schemas
const orderSchema = new mongoose.Schema({
  name: String,
  email: String,
  bookTitle: String,
  shippingMethod: String,
  items: [
  {
    slug: String,
    title: String,
    quantity: Number,
    // Real Stripe-reported amounts, in cents — null on orders resolved via
    // the metadata fallback path (see resolve-order-items.js), never
    // guessed. Additive fields: historical orders saved before this field
    // existed simply don't have it, and remain perfectly valid documents.
    unitPrice: Number,
    lineTotal: Number
  }
],
  amount: Number,
  address: {
    line1: String,
    line2: String,
    city: String,
    state: String,
    postal_code: String,
    country: String
  },
  date: { type: Date, default: Date.now },
  // Both additive/optional so every existing historical order (saved
  // before either field existed) remains a perfectly valid document —
  // nothing reads/requires these fields for old orders.
  //
  // stripeSessionId: the Stripe Checkout Session ID that produced this
  // order. `sparse: true` means the unique index only applies to documents
  // where the field is actually present, so it enforces "no two orders for
  // the same Stripe session" going forward without conflicting with old
  // orders that never had one. This is what makes webhook retries safe —
  // see server/lib/process-checkout-completed.js.
  stripeSessionId: { type: String, unique: true, sparse: true },
  // orderNumber: the customer-facing "CCK-YYYYMMDD-XXXX" identifier (see
  // server/lib/order-number.js) — generated only for newly-created orders,
  // never for a duplicate/already-processed webhook delivery. Same sparse
  // pattern as stripeSessionId.
  orderNumber: { type: String, unique: true, sparse: true },
  // Order status/tracking foundation (Phase 13B) — all optional/additive,
  // so every historical order saved before these fields existed remains a
  // perfectly valid document. No default here deliberately: a genuinely
  // new order gets orderStatus: 'received' explicitly from
  // process-checkout-completed.js, and a legacy order missing this field
  // is normalized to 'received' for display purposes by
  // server/lib/order-status.js's normalizeOrderStatus() — two distinct,
  // explicit mechanisms for two distinct concerns, not one implicit
  // schema default trying to cover both. `enum` is a defense-in-depth
  // guard against a future bug ever writing an unrecognized status value;
  // it has no effect on documents that simply lack the field.
  orderStatus: { type: String, enum: ORDER_STATUSES },
  // carrier/trackingNumber: real, administrator-supplied shipment
  // information only — never fabricated. See order-tracking.js for the
  // validation these pass through before ever being written (this
  // `maxlength` is a DB-level backstop, not the primary validation).
  carrier: { type: String, maxlength: MAX_CARRIER_LENGTH },
  trackingNumber: { type: String, maxlength: MAX_TRACKING_NUMBER_LENGTH },
  // Server-controlled timestamps — never client-supplied, never defaulted,
  // only ever set by applyOrderStatusTransition() (order-status.js) the
  // first time an order genuinely transitions into that state.
  shippedAt: Date,
  deliveredAt: Date,
  cancelledAt: Date,
  // Phase 13C — the trimmed/lowercased form of the Stripe customer email,
  // populated only for newly-created orders (see
  // process-checkout-completed.js). Optional/additive: legacy orders
  // never get this field written retroactively. My Orders lookups match
  // on EITHER this field OR a case-insensitive collation match against
  // the original `email` field — see server/lib/customer-orders.js —
  // never a RegExp built from customer input. Not unique: the same
  // customer legitimately places multiple orders.
  emailNormalized: { type: String, sparse: true }
});
const Order = mongoose.model('Order', orderSchema);

// Magic-link access tokens for the My Orders customer portal. Only a
// SHA-256 hash of the raw token is ever stored (see secure-token.js) —
// the raw value exists only in the email/URL fragment, never in this
// database. `usedAt` starting null and being set exactly once (atomically
// — see verify-orders-access-token.js) is what makes the token one-time-
// use. `expiresAt` carries a native MongoDB TTL index (set up below) so
// expired tokens clean themselves up with no cron job/worker.
const orderAccessTokenSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true },
  emailNormalized: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null }
});
const OrderAccessToken = mongoose.model('OrderAccessToken', orderAccessTokenSchema);

// Customer sessions for the My Orders portal, established only after a
// magic-link token has been successfully (and atomically) consumed. The
// session token is a second, independent secret — the magic-link token
// itself is never reused as a session credential. Only its hash is
// stored; the raw value lives only in the HttpOnly cookie (see
// session-cookie.js). Fixed 14-day lifetime, not sliding — see
// customer-session.js.
const customerSessionSchema = new mongoose.Schema({
  sessionTokenHash: { type: String, required: true, unique: true },
  emailNormalized: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true }
});
const CustomerSession = mongoose.model('CustomerSession', customerSessionSchema);

const newsletterSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    index: true, // Adds a MongoDB index automatically
  },
  ip: String,
  date: {
    type: Date,
    default: Date.now
  }
});
const NewsletterEmail = mongoose.model('NewsletterEmail', newsletterSchema);

// ✅ Stripe webhook handler — in isolated sub-app
const webhookApp = express();
webhookApp.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  console.log("🔔 Incoming webhook request received!");

  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.log(`❌ Webhook Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log('✅ Webhook received:', event.type);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    // Idempotent: safe to call more than once for the same Stripe session
    // (a webhook retry, or a redelivery after a slow/failed response).
    // `created: false` means this session was already processed — no new
    // order, no new order number, no duplicate emails — see
    // server/lib/process-checkout-completed.js for exactly how that's
    // guaranteed even under a concurrent race.
    let result;
    try {
      result = await processCheckoutCompleted({
        session,
        stripeClient: stripe,
        catalog: getCatalog(),
        OrderModel: Order,
      });
    } catch (err) {
      // A genuine (non-duplicate) failure to save the order — e.g. MongoDB
      // unreachable. Respond non-200 so Stripe retries the delivery later;
      // the idempotency check above makes that retry safe. Never send a
      // "your order is confirmed" email when we don't actually have a
      // saved order to reference.
      console.error('❌ Error processing checkout session:', err.message);
      return res.status(500).end();
    }

    if (!result.created) {
      console.log(`ℹ️ Checkout session ${session.id} already processed (order ${result.order?.orderNumber || result.order?._id}) — skipping duplicate order/emails.`);
      return res.status(200).end();
    }

    const order = result.order;
    console.log(`✅ Order saved to database: ${order.orderNumber}`);

    // Fire-and-forget: email delivery must never determine whether a paid,
    // already-saved order is treated as successful, and must never delay
    // or affect this webhook's response back to Stripe.
    console.log('📧 Sending customer confirmation email...');
    sendEmail(
      { to: order.email, ...buildOrderConfirmationEmail(order, { frontendBaseUrl: process.env.FRONTEND_BASE_URL }) },
    ).catch((err) => console.error('❌ Unexpected error sending confirmation email:', err.message));

    console.log('📧 Sending admin notification email...');
    if (process.env.ADMIN_EMAIL) {
      sendEmail(
        { to: process.env.ADMIN_EMAIL, ...buildAdminOrderNotificationEmail(order, { stripeSessionId: session.id, frontendBaseUrl: process.env.FRONTEND_BASE_URL }) },
      ).catch((err) => console.error('❌ Unexpected error sending admin notification email:', err.message));
    }

    console.log('📱 Sending admin notification SMS...');
    if (process.env.ADMIN_PHONE_NUMBER) {
      sendSms(
        { to: process.env.ADMIN_PHONE_NUMBER, body: buildOrderNotificationSms(order) },
      ).catch((err) => console.error('❌ Unexpected error sending admin notification SMS:', err.message));
    } else {
      console.log('ℹ️ Skipping admin SMS: ADMIN_PHONE_NUMBER is not configured.');
    }
  }

  res.status(200).end();
});

// ✅ Mount webhook FIRST — BEFORE ANY OTHER middleware
app.use(webhookApp);

// ✅ Now apply other middleware
// Always includes the fixed production/localhost origins, plus (if
// configured) the exact origin derived from FRONTEND_BASE_URL — so a
// staging frontend is allowed automatically without hardcoding its URL
// here. See server/lib/cors-origins.js.
const allowedOrigins = getAllowedOrigins();

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log(`❌ Blocked CORS request from: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ✅ Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

  // 👇 Add unique index to newsletter collection (only needs to run once)
NewsletterEmail.collection.createIndex({ email: 1 }, { unique: true })
  .then(() => console.log('✅ Unique index created on email field'))
  .catch(err => console.error('❌ Failed to create unique index:', err.message));

// 👇 Sparse unique indexes backing webhook idempotency and order numbers —
// sparse so historical orders saved before either field existed are never
// evaluated against the uniqueness constraint (see orderSchema above).
Order.collection.createIndex({ stripeSessionId: 1 }, { unique: true, sparse: true })
  .then(() => console.log('✅ Unique sparse index created on stripeSessionId field'))
  .catch(err => console.error('❌ Failed to create stripeSessionId index:', err.message));

Order.collection.createIndex({ orderNumber: 1 }, { unique: true, sparse: true })
  .then(() => console.log('✅ Unique sparse index created on orderNumber field'))
  .catch(err => console.error('❌ Failed to create orderNumber index:', err.message));

// 👇 Not unique (a customer can place multiple orders) — sparse so legacy
// orders without emailNormalized are unaffected.
Order.collection.createIndex({ emailNormalized: 1 }, { sparse: true })
  .then(() => console.log('✅ Index created on emailNormalized field'))
  .catch(err => console.error('❌ Failed to create emailNormalized index:', err.message));

// 👇 My Orders magic-link tokens: unique index enforces one row per token
// hash; TTL index means an expired token is automatically deleted by
// MongoDB itself (expireAfterSeconds: 0 = delete at expiresAt, no grace
// period) — no cron job/worker.
OrderAccessToken.collection.createIndex({ tokenHash: 1 }, { unique: true })
  .then(() => console.log('✅ Unique index created on OrderAccessToken.tokenHash'))
  .catch(err => console.error('❌ Failed to create tokenHash index:', err.message));

OrderAccessToken.collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
  .then(() => console.log('✅ TTL index created on OrderAccessToken.expiresAt'))
  .catch(err => console.error('❌ Failed to create OrderAccessToken TTL index:', err.message));

// 👇 My Orders customer sessions: same unique + TTL pattern as above.
CustomerSession.collection.createIndex({ sessionTokenHash: 1 }, { unique: true })
  .then(() => console.log('✅ Unique index created on CustomerSession.sessionTokenHash'))
  .catch(err => console.error('❌ Failed to create sessionTokenHash index:', err.message));

CustomerSession.collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
  .then(() => console.log('✅ TTL index created on CustomerSession.expiresAt'))
  .catch(err => console.error('❌ Failed to create CustomerSession TTL index:', err.message));

// ✅ Admin auth
const basicAuth = require('express-basic-auth');
app.use('/api/orders', basicAuth({
  users: { 'admin': process.env.ADMIN_PASSWORD },
  challenge: true,
}));
app.use('/api/newsletter/emails', basicAuth({
  users: { 'admin': process.env.ADMIN_PASSWORD },
  challenge: true,
}));

// ✅ Serve frontend
app.use(express.static(path.join(__dirname, '../client')));

// ✅ Calculate Shipping
app.post('/calculate-shipping', async (req, res) => {
  const { address } = req.body;

  if (!address || !address.country || !address.state) {
    return res.status(400).json({ error: 'Invalid address' });
  }

  let shippingCost;

  if (address.country !== 'US') {
    shippingCost = 1599; // $15.99 for international
  } else if (['HI', 'AK'].includes(address.state.toUpperCase())) {
    shippingCost = 799; // $7.99 for Hawaii/Alaska
  } else {
    shippingCost = 399; // $3.99 standard for all other US states (including FL)
  }

  res.json({ shippingCost });
});


// ⚠️ LEGACY CHECKOUT ROUTE — remove only after the Astro production cutover.
// This is the exact original /create-checkout-session behavior, restored
// verbatim so client/cart.html (the current live frontend) keeps working
// unmodified if this branch is ever deployed before the Astro cart is
// cut over to /api/checkout/session below. Do not strengthen, validate,
// or redesign this route — it must stay behaviorally identical to what
// production already calls.
app.post('/create-checkout-session', async (req, res) => {
  try {
    const items = req.body.items;
    const customerEmail = req.body.customerEmail;

    if (!Array.isArray(items) || items.length === 0 || !customerEmail) {
      return res.status(400).json({ error: 'Invalid input' });
    }

    const itemsWithTitles = items.map(item => ({
      price: item.price,
      quantity: item.quantity,
      title: item.title || item.name || 'Unknown'
    }));

    const line_items = items.map(item => ({
      price: item.price,
      quantity: item.quantity
    }));

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items,
      customer_email: customerEmail,

      // ✅ Let Stripe collect the shipping address
      shipping_address_collection: {
        allowed_countries: ['US', 'CA'],
      },

      // ✅ Add multiple shipping options
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: 350, currency: 'usd' },
            display_name: 'Standard Shipping (5–8 Business Days)',
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 5 },
              maximum: { unit: 'business_day', value: 8 },
            },
          }
        },
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: 999, currency: 'usd' },
            display_name: 'Expedited Shipping (2–3 Business Days)',
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 2 },
              maximum: { unit: 'business_day', value: 3 },
            },
          }
        },
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: 1999, currency: 'usd' },
            display_name: 'Express Shipping (1–2 Business Days)',
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 1 },
              maximum: { unit: 'business_day', value: 2 },
            },
          }
        }
      ],

      metadata: {
        items: JSON.stringify(itemsWithTitles),
      },

      success_url: 'https://coolcalmandkarter.netlify.app/success.html?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://coolcalmandkarter.netlify.app/cancel.html',
      automatic_tax: { enabled: true }
    });

    res.json({ id: session.id });
  } catch (err) {
    console.error('❌ Error creating checkout session:', err.message);
    res.status(500).json({ error: 'Checkout failed' });
  }
});

// ✅ Secure checkout route — target for the new Astro cart.
//
// Contract: { items: [{ slug, quantity }], customerEmail? }
// The browser never supplies a price, title, or Stripe Price ID — every
// line item is resolved server-side from the catalog (server/lib/*), and
// only known, checkout-enabled slugs with a validated 1–20 quantity (40
// per cart) are accepted. customerEmail is optional — if omitted, Stripe
// Checkout collects it directly — but if supplied, it must be a
// reasonably-shaped, reasonably-sized email address. See
// server/lib/validate-checkout-request.js for the full rules.
app.post('/api/checkout/session', async (req, res) => {
  try {
    const catalog = getCatalog();
    const validation = validateCheckoutRequest(req.body, catalog);
    if (!validation.ok) {
      return res.status(400).json({ error: validation.error });
    }

    const redirectUrls = buildCheckoutRedirectUrls();
    if (!redirectUrls.ok) {
      console.error('❌ Cannot create checkout session:', redirectUrls.error);
      return res.status(500).json({ error: 'Checkout is temporarily unavailable.' });
    }

    const line_items = validation.items.map(item => ({
      price: item.stripePriceId,
      quantity: item.quantity,
    }));

    // Compact and server-generated from validated catalog data only (slug +
    // quantity, not full titles) — kept small since Stripe caps each
    // metadata value at 500 characters. This is a fallback source for order
    // titles; the webhook prefers Stripe's own line-items record (see
    // server/lib/resolve-order-items.js) and only falls back to parsing
    // this if that lookup fails.
    const metadataItems = validation.items.map(item => `${item.slug}:${item.quantity}`).join(',');

    const sessionParams = {
      payment_method_types: ['card'],
      mode: 'payment',
      line_items,

      // ✅ Let Stripe collect the shipping address
      shipping_address_collection: {
        allowed_countries: ['US', 'CA'],
      },

      // ✅ Add multiple shipping options
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: 350, currency: 'usd' },
            display_name: 'Standard Shipping (5–8 Business Days)',
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 5 },
              maximum: { unit: 'business_day', value: 8 },
            },
          }
        },
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: 999, currency: 'usd' },
            display_name: 'Expedited Shipping (2–3 Business Days)',
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 2 },
              maximum: { unit: 'business_day', value: 3 },
            },
          }
        },
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: 1999, currency: 'usd' },
            display_name: 'Express Shipping (1–2 Business Days)',
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 1 },
              maximum: { unit: 'business_day', value: 2 },
            },
          }
        }
      ],

      metadata: {
        items: metadataItems,
      },

      success_url: redirectUrls.successUrl,
      cancel_url: redirectUrls.cancelUrl,
      automatic_tax: { enabled: true },
    };

    if (validation.customerEmail) {
      sessionParams.customer_email = validation.customerEmail;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    res.json({ url: session.url });
  } catch (err) {
    console.error('❌ Error creating checkout session:', err.message);
    res.status(500).json({ error: 'Checkout failed' });
  }
});

// ✅ Secure checkout session verification — for the success page.
//
// GET /api/checkout/session-status?session_id=cs_...
// Never trusts anything the browser claims about payment status — always
// asks Stripe directly for the session and only reports back the minimal
// { verified, paymentStatus, sessionStatus } shape. Never the full Stripe
// session object, payment method details, billing address, or any other
// unnecessary personal information. Read-only — never touches Order
// records (the webhook remains the only thing that writes orders).
app.get('/api/checkout/session-status', async (req, res) => {
  try {
    const result = await verifyCheckoutSession({
      sessionId: req.query.session_id,
      stripeClient: stripe,
    });
    res.status(result.status).json(result.body);
  } catch (err) {
    console.error('❌ Error verifying checkout session:', err.message);
    res.status(500).json({ error: 'Unable to verify checkout session.' });
  }
});

// ==================================================================
// My Orders — secure passwordless customer access (Phase 13C: backend
// only, no frontend page exists yet). See server/lib/process-orders-
// access-request.js, verify-orders-access-token.js, customer-session.js,
// session-cookie.js, customer-orders.js for the actual logic — these
// routes are thin wiring, per this codebase's existing convention.
// ==================================================================

// IP-scoped abuse protection on the one endpoint that could otherwise be
// used to spam a victim's inbox or brute-force-probe which emails have
// orders. req.ip is accurate here because of `app.set('trust proxy', 1)`
// above. The email-specific resend cooldown (a stricter, complementary
// protection) lives inside processOrdersAccessRequest itself.
const ordersAccessRequestLimiter = rateLimit({
  windowMs: ORDERS_ACCESS_RATE_LIMIT_WINDOW_MS,
  max: ORDERS_ACCESS_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

// ✅ Request a My Orders magic link.
//
// POST /api/orders/access/request  { email }
// Always returns the same generic response for a well-formed email,
// regardless of whether that email has any orders — see
// process-orders-access-request.js for exactly how that's guaranteed.
// Never reveals order existence/count/customer name — see that module's
// GENERIC_RESPONSE constant, which this route echoes verbatim.
app.post('/api/orders/access/request', ordersAccessRequestLimiter, async (req, res) => {
  console.log('🔐 My Orders access request received.');

  let result;
  try {
    result = await processOrdersAccessRequest({
      email: req.body?.email,
      OrderModel: Order,
      OrderAccessTokenModel: OrderAccessToken,
      frontendBaseUrl: process.env.FRONTEND_BASE_URL,
    });
  } catch (err) {
    // A genuine internal failure (e.g. Mongo unreachable) — still never
    // reveal anything about the email's existence via the error path.
    console.error('❌ Error processing My Orders access request:', err.message);
    return res.status(500).json({ error: 'Unable to process this request right now. Please try again later.' });
  }

  if (!result.ok) {
    // Malformed email — ordinary input validation, not an enumeration risk.
    return res.status(400).json({ error: result.error });
  }

  console.log(`🔐 My Orders access request outcome: ${result.internalOutcome}`);
  res.status(200).json({ ok: result.ok, message: result.message });
});

// ✅ Verify a My Orders magic link and establish a customer session.
//
// POST /api/orders/access/verify  { token }
// Atomically consumes the token (see verify-orders-access-token.js) —
// expired, already-used, and invalid tokens all produce the identical
// generic failure response. On success, issues a brand-new, independent
// session credential (the magic-link token itself is never reused as a
// session credential) and sets it as an HttpOnly cookie.
app.post('/api/orders/access/verify', async (req, res) => {
  const token = req.body?.token;

  let verifyResult;
  try {
    verifyResult = await verifyOrdersAccessToken({ token, OrderAccessTokenModel: OrderAccessToken });
  } catch (err) {
    console.error('❌ Error verifying My Orders access token:', err.message);
    return res.status(500).json({ error: 'Unable to verify this link right now. Please try again later.' });
  }

  if (!verifyResult.ok) {
    console.log('🔐 My Orders access attempt rejected (invalid, expired, or already-used link).');
    return res.status(401).json({ error: 'This link is invalid or has expired. Please request a new one.' });
  }

  const { rawToken } = await createCustomerSession({
    emailNormalized: verifyResult.emailNormalized,
    CustomerSessionModel: CustomerSession,
  });
  setSessionCookie(req, res, rawToken);

  console.log('🔐 My Orders session created.');
  res.status(200).json({ ok: true });
});

// ✅ Log out of My Orders.
//
// POST /api/orders/access/logout
// Deletes the session server-side (real revocation, not just clearing the
// cookie) and expires the cookie. Idempotent — calling this with no
// active session, or twice in a row, is a normal success, not an error.
app.post('/api/orders/access/logout', async (req, res) => {
  const rawToken = readSessionCookie(req);
  await deleteCustomerSession({ rawToken, CustomerSessionModel: CustomerSession });
  clearSessionCookie(req, res);
  console.log('🔐 My Orders logout processed.');
  res.status(200).json({ ok: true });
});

/** Shared auth guard for the two GET routes below — resolves the verified customer email from the session cookie, or null if unauthenticated. */
async function getAuthenticatedCustomerEmail(req) {
  const rawToken = readSessionCookie(req);
  const result = await authenticateCustomerSession({ rawToken, CustomerSessionModel: CustomerSession });
  return result.ok ? result.emailNormalized : null;
}

// ✅ List the authenticated customer's own orders, newest first.
//
// GET /api/my-orders
// Identity comes ONLY from the session — the client never supplies which
// email to look up. Uses toCustomerOrderView() from Phase 13B, the same
// exposure boundary a future admin dashboard will build on — never
// stripeSessionId/Mongo _id/__v.
app.get('/api/my-orders', async (req, res) => {
  const emailNormalized = await getAuthenticatedCustomerEmail(req);
  if (!emailNormalized) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }

  try {
    const orders = await Order.find(
      buildCustomerOrdersFilter(emailNormalized),
      null,
      { collation: ORDER_EMAIL_COLLATION },
    ).sort({ date: -1 });

    res.status(200).json({ orders: orders.map(toCustomerOrderView) });
  } catch (err) {
    console.error('❌ Error fetching My Orders list:', err.message);
    res.status(500).json({ error: 'Unable to fetch your orders right now.' });
  }
});

// ✅ Fetch one of the authenticated customer's own orders.
//
// GET /api/my-orders/:orderNumber
// Ownership requires BOTH the order number AND the session's verified
// email to match, in the same query — orderNumber alone is never
// sufficient. A real order that belongs to someone else, and an order
// number that doesn't exist at all, produce the identical 404 — this
// never confirms that another customer's order exists.
app.get('/api/my-orders/:orderNumber', async (req, res) => {
  const emailNormalized = await getAuthenticatedCustomerEmail(req);
  if (!emailNormalized) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }

  try {
    const order = await Order.findOne(
      buildCustomerOrderDetailFilter(req.params.orderNumber, emailNormalized),
      null,
      { collation: ORDER_EMAIL_COLLATION },
    );

    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    res.status(200).json({ order: toCustomerOrderView(order) });
  } catch (err) {
    console.error('❌ Error fetching My Orders detail:', err.message);
    res.status(500).json({ error: 'Unable to fetch this order right now.' });
  }
});

// ✅ Fetch newsletter emails
app.get('/api/newsletter', async (req, res) => {
  try {
    const emails = await NewsletterEmail.find().sort({ date: -1 });
    res.json(emails);
  } catch (err) {
    console.error('❌ Failed to fetch newsletter emails:', err);
    res.status(500).json({ error: 'Could not fetch newsletter emails' });
  }
});

// ✅ View newsletter emails
app.get('/api/newsletter/emails', async (req, res) => {
  try {
    const emails = await NewsletterEmail.find().sort({ date: -1 });
    res.json(emails);
  } catch (err) {
    console.error('❌ Failed to fetch newsletter emails:', err);
    res.status(500).json({ error: 'Failed to retrieve newsletter emails' });
  }
});

// ✅ Export newsletter emails as CSV
app.get('/api/newsletter/export', async (req, res) => {
  try {
    const emails = await NewsletterEmail.find().sort({ date: -1 });
    const fields = ['email', 'date'];
    const parser = new Parser({ fields });
    const csv = parser.parse(emails);

    res.header('Content-Type', 'text/csv');
    res.attachment('newsletter_emails.csv');
    res.send(csv);
  } catch (err) {
    console.error('❌ Failed to export newsletter emails:', err);
    res.status(500).json({ error: 'Could not export newsletter emails' });
  }
});

app.post('/api/newsletter', async (req, res) => {
  const { email } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  // Persistence and email notification are treated as separate outcomes:
  // once the signup is genuinely saved, a subsequent email-provider failure
  // must never cause the response to falsely tell the visitor their signup
  // failed (this was a real bug — see server/lib/process-newsletter-signup.js
  // and the Phase 11B audit for context).
  let signupResult;
  try {
    signupResult = await processNewsletterSignup({ email, ip, NewsletterEmailModel: NewsletterEmail });
  } catch (err) {
    console.error('❌ Newsletter signup error:', err);
    return res.status(500).json({ error: 'Server error during signup' });
  }

  if (signupResult.duplicate) {
    return res.status(409).json({ error: 'You’ve already signed up.' });
  }

  res.status(200).json({ message: 'Signup successful!' });

  // Fire-and-forget, after the response is already sent — a Resend failure
  // here can no longer change what the visitor was told.
  sendEmail({ to: email, ...buildNewsletterWelcomeEmail({ frontendBaseUrl: process.env.FRONTEND_BASE_URL }) })
    .catch((err) => console.error('❌ Unexpected error sending newsletter welcome email:', err.message));

  if (process.env.ADMIN_EMAIL) {
    sendEmail({ to: process.env.ADMIN_EMAIL, ...buildNewsletterAdminNotification({ email, ip }, { frontendBaseUrl: process.env.FRONTEND_BASE_URL }) })
      .catch((err) => console.error('❌ Unexpected error sending newsletter admin notification:', err.message));
  }
});


app.post('/api/contact', async (req, res) => {
  const { name, email, reason, subject, message } = req.body;

  if (!name || !email || !subject || !message) {
    return res.status(400).json({ error: 'Please fill out all required fields.' });
  }

  const result = await sendEmail({
    to: process.env.ADMIN_EMAIL,
    replyTo: email,
    ...buildContactNotificationEmail({ name, email, reason, subject, message }, { frontendBaseUrl: process.env.FRONTEND_BASE_URL }),
  });

  if (!result.ok) {
    console.error('❌ Error sending contact form email:', result.error);
    return res.status(500).json({ error: 'Failed to send message. Please try again later.' });
  }

  res.status(200).json({ message: 'Message sent successfully!' });
});

// ✅ Orders API
app.get('/api/orders', async (req, res) => {
  try {
    const { email, bookTitle } = req.query;
    const filter = {};
    if (email) filter.email = new RegExp(email, 'i');
    if (bookTitle) filter.bookTitle = new RegExp(bookTitle, 'i');

    const orders = await Order.find(filter).sort({ date: -1 });
    res.json(orders);
  } catch (err) {
    console.error('❌ Failed to fetch orders:', err);
    res.status(500).json({ error: 'Failed to retrieve orders' });
  }
});

// ✅ Export orders
app.get('/api/orders/export', async (req, res) => {
  try {
    const orders = await Order.find().sort({ date: -1 });
    const fields = ['name', 'email', 'bookTitle', 'amount', 'date'];
    const parser = new Parser({ fields });
    const csv = parser.parse(orders);

    res.header('Content-Type', 'text/csv');
    res.attachment('orders.csv');
    res.send(csv);
  } catch (err) {
    console.error('❌ Failed to export orders:', err);
    res.status(500).json({ error: 'Could not export orders' });
  }
});

// ✅ Session fetch for success page
app.get('/api/session/:id', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.id, {
      expand: ['customer_details', 'shipping_cost.shipping_rate']
    });

    if (session.status !== 'complete') {
      return res.status(400).json({ error: 'Session is not completed.' });
    }

    let shippingMethod = session.shipping_cost?.shipping_rate?.display_name || 'No shipping selected';

    res.json({
      session_id: session.id,
      customer_name: session.customer_details.name,
      customer_email: session.customer_details.email,
      customer_address: session.customer_details.address,
      amount_total: session.amount_total,
      shipping_method: shippingMethod, // ✅ Must match this exact key
      items: session.metadata?.items ? JSON.parse(session.metadata.items) : []
    });
  } catch (err) {
    console.error('Error fetching session:', err.message);
    res.status(500).json({ error: 'Unable to fetch session details' });
  }
});

// ✅ Homepage route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// ✅ Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
