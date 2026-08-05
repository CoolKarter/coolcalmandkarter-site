require('dotenv').config();

const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const path = require('path');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const { Parser } = require('json2csv');
const { getCatalog } = require('./lib/checkout-catalog');
const { validateCheckoutRequest } = require('./lib/validate-checkout-request');
const { resolveOrderItems } = require('./lib/resolve-order-items');
const { buildCheckoutRedirectUrls } = require('./lib/frontend-url');

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Define Mongo Schemas
const orderSchema = new mongoose.Schema({
  name: String,
  email: String,
  bookTitle: String,
  shippingMethod: String,
  items: [
  {
    title: String,
    quantity: Number
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
  date: { type: Date, default: Date.now }
});
const Order = mongoose.model('Order', orderSchema);

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

    const customerEmail = session.customer_details?.email || 'no-email';
    const customerName = session.customer_details?.name || 'Customer';
    const shipping = session.customer_details?.address || {};
    const amount = session.amount_total || 0;
    // Titles/quantities come from Stripe's own line-items record for this
    // session (mapped back to our catalog for the title), never from
    // anything the browser submitted — falls back to the compact,
    // catalog-resolved metadata only if that lookup fails.
    const items = await resolveOrderItems({ session, stripeClient: stripe, catalog: getCatalog() });
    const bookTitleSummary = items.map(i => `${i.title} x${i.quantity}`).join(', ');
    let shippingMethod = 'No shipping selected';
    if (session.shipping_cost?.shipping_rate) {
      try {
        const shippingRateObj = await stripe.shippingRates.retrieve(session.shipping_cost.shipping_rate);
        shippingMethod = shippingRateObj.display_name || 'No shipping selected';
      } catch (err) {
        console.error('❌ Failed to retrieve shipping rate from Stripe:', err.message);
      }
    }
    const shippingName = session.shipping?.name || 'No name';
    const shippingAddress = session.shipping?.address || {};
    const shippingSummary = `
      Name: ${shippingName}
      Address: ${shippingAddress.line1 || ''}, ${shippingAddress.city || ''}, ${shippingAddress.state || ''} ${shippingAddress.postal_code || ''}, ${shippingAddress.country || ''}
      Shipping Rate ID: ${shippingMethod}
    `;    


    const newOrder = new Order({
      name: customerName,
      email: customerEmail,
      bookTitle: bookTitleSummary,
      items: items.map(i => ({
        title: i.title,
        quantity: i.quantity
      })),
      amount: amount,
      address: {
        line1: shipping.line1,
        line2: shipping.line2 || '',
        city: shipping.city,
        state: shipping.state,
        postal_code: shipping.postal_code,
        country: shipping.country
      },
      shippingMethod: shippingMethod
    });

    try {
      await newOrder.save();
      console.log('✅ Order saved to database');
    } catch (err) {
      console.error('❌ Error saving order:', err);
    }
    
    console.log('📧 Sending customer confirmation email...');
    sendConfirmationEmail(customerEmail, customerName, bookTitleSummary, amount, shipping, shippingMethod);

    console.log('📧 Sending admin notification email...');
    sendAdminNotificationEmail(customerEmail, bookTitleSummary, session.id, shipping, customerName, shippingMethod, amount);
  }

  res.status(200).end();
});

// ✅ Mount webhook FIRST — BEFORE ANY OTHER middleware
app.use(webhookApp);

// ✅ Now apply other middleware
const allowedOrigins = [
  'http://127.0.0.1:5500',
  'http://localhost:3000',
  'https://coolcalmandkarter.netlify.app',
  'https://coolcalmandkarter.com'
];

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

// ✅ Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

  // 👇 Add unique index to newsletter collection (only needs to run once)
NewsletterEmail.collection.createIndex({ email: 1 }, { unique: true })
  .then(() => console.log('✅ Unique index created on email field'))
  .catch(err => console.error('❌ Failed to create unique index:', err.message));

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

  try {
    const newSignup = new NewsletterEmail({ email, ip });
    await newSignup.save();

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD
      }
    });

    await transporter.sendMail({
      from: `"Cool, Calm & Karter" <${process.env.EMAIL_USERNAME}>`,
      to: email,
      subject: "🎉 Thanks for joining Cool, Calm & Karter!",
      html: `<h2>You're officially part of the family!</h2><p>Thanks for signing up for our newsletter.</p>`
    });

    await transporter.sendMail({
      from: `"Cool, Calm & Karter" <${process.env.EMAIL_USERNAME}>`,
      to: process.env.ADMIN_EMAIL,
      subject: "📬 New Newsletter Signup",
      html: `<p>New signup: <strong>${email}</strong><br>IP: ${ip}</p>`
    });

    res.status(200).json({ message: 'Signup successful!' });

  } catch (err) {
    if (err.code === 11000) {
      // Duplicate key error
      return res.status(409).json({ error: 'You’ve already signed up.' });
    }

    console.error('❌ Newsletter signup error:', err);
    res.status(500).json({ error: 'Server error during signup' });
  }
});


// ✅ Confirmation email
function sendConfirmationEmail(toEmail, name, summary, amount, address = {}, shippingMethod = '') {

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USERNAME,
      pass: process.env.EMAIL_PASSWORD
    }
  });

    const fullAddress = `
      ${address.line1 || ''}<br>
      ${address.line2 ? address.line2 + '<br>' : ''}
      ${address.city || ''}, ${address.state || ''} ${address.postal_code || ''}<br>
      ${address.country || ''}
    `.trim();

  const mailOptions = {
    from: `"Cool, Calm & Karter" <${process.env.EMAIL_USERNAME}>`,
    to: toEmail,
    subject: '📚 Your Cool, Calm & Karter Order Confirmation',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; color: #333;">
        <div style="text-align: center;">
          <img src="https://coolcalmandkarter.netlify.app/images/coolcalm-logo%20TRANSPARENT.png" alt="Cool, Calm & Karter" style="max-width: 180px; margin-bottom: 20px;" />
          <h2 style="color: #f46045;">Thank You for Your Order, ${name || 'Friend'}!</h2>
        </div>

        <p style="font-size: 16px;">We’ve received your order and we’re getting it ready to ship. Here’s what you purchased:</p>

        <div style="background-color: #fefefe; padding: 15px; border-radius: 8px; border: 1px solid #eee; margin-top: 20px;">
          <p style="margin: 0 0 10px;"><strong>Order Summary:</strong></p>
          <p style="margin: 0 0 10px;">${summary}</p>
          <p><strong>Total Paid:</strong> $${(amount / 100).toFixed(2)}</p>
        </div>

        <div style="margin-top: 20px;">
          <p style="margin: 0 0 10px;"><strong>Shipping Address:</strong></p>
          <p style="margin: 0; line-height: 1.6;">${fullAddress}</p>
          <p style="margin: 10px 0 0;"><strong>Shipping Method:</strong> ${shippingMethod}</p>
        </div>

        <div style="text-align: center; margin-top: 30px;">
          <a href="https://coolcalmandkarter.netlify.app/shop.html" style="display: inline-block; background-color: #f46045; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Browse More Books</a>
        </div>

        <p style="margin-top: 40px; font-size: 14px; color: #777;">We’ll notify you when your order ships. Thank you for supporting Cool, Calm & Karter!</p>
      </div>
    `
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.log('❌ Email Error:', error);
    } else {
      console.log('✅ Email sent:', info.response);
    }
  });
}

// ✅ ADD THIS TO YOUR EXISTING server.js
app.post('/api/contact', async (req, res) => {
  const { name, email, reason, subject, message } = req.body;

  if (!name || !email || !subject || !message) {
    return res.status(400).json({ error: 'Please fill out all required fields.' });
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USERNAME,
      pass: process.env.EMAIL_PASSWORD
    }
  });

  const mailOptions = {
    from: `\"${name}\" <${email}>`,
    to: process.env.ADMIN_EMAIL,
    subject: `Contact Form: ${subject}`,
    html: `
      <h3>You’ve received a new message from Cool, Calm & Karter</h3>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Reason for Contact:</strong> ${reason}</p>
      <p><strong>Message:</strong><br>${message}</p>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    res.status(200).json({ message: 'Message sent successfully!' });
  } catch (err) {
    console.error('❌ Error sending contact form email:', err);
    res.status(500).json({ error: 'Failed to send message. Please try again later.' });
  }
});



// ✅ Admin notification
function sendAdminNotificationEmail(customerEmail, bookSummary, sessionId, address = {}, name = '', shippingMethod = '', amount = 0) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USERNAME,
      pass: process.env.EMAIL_PASSWORD
    }
  });

  const formattedAddress = `
    ${name}<br>
    ${address.line1 || ''}<br>
    ${address.line2 ? address.line2 + '<br>' : ''}
    ${address.city || ''}, ${address.state || ''} ${address.postal_code || ''}<br>
    ${address.country || ''}
  `.trim();

  const mailOptions = {
    from: `"Cool, Calm & Karter" <${process.env.EMAIL_USERNAME}>`,
    to: process.env.ADMIN_EMAIL,
    subject: '🛒 New Order Placed',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; color: #333;">
        <div style="text-align: center; padding: 20px;">
          <img src="https://coolcalmandkarter.netlify.app/images/coolcalm-logo%20TRANSPARENT.png" alt="Cool, Calm & Karter" style="max-width: 200px;" />
          <h2 style="color: #f46045;">New Order Alert</h2>
        </div>
        <p><strong>Customer Email:</strong> ${customerEmail}</p>
        <p><strong>Books Ordered:</strong><br>${bookSummary}</p>
        <p><strong>Shipping Address:</strong><br>${formattedAddress}</p>
        <p><strong>Shipping Method:</strong><br>${shippingMethod}</p>
        <p><strong>Stripe Session ID:</strong> ${sessionId}</p>
        <p><strong>Total Paid:</strong> $${(amount / 100).toFixed(2)}</p>
        <p style="margin-top: 2rem;">Log into your dashboard for more details.</p>
      </div>
    `
  };

  transporter.sendMail(mailOptions, (err, info) => {
    if (err) {
      console.error('❌ Admin Email Error:', err);
    } else {
      console.log('✅ Admin email sent:', info.response);
    }
  });
}

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
