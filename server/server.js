require('dotenv').config();

const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const path = require('path');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const { Parser } = require('json2csv');

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Define Mongo Schemas
const orderSchema = new mongoose.Schema({
  name: String,
  email: String,
  bookTitle: String,
  amount: Number,
  date: { type: Date, default: Date.now }
});
const Order = mongoose.model('Order', orderSchema);

const newsletterSchema = new mongoose.Schema({
  email: { type: String, required: true },
  date: { type: Date, default: Date.now }
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
    const amount = session.amount_total || 0;
    const items = session.metadata?.items ? JSON.parse(session.metadata.items) : [];

    const bookTitleSummary = items.map(i => `${i.name} x${i.quantity}`).join(', ');

    const newOrder = new Order({
      name: customerName,
      email: customerEmail,
      bookTitle: bookTitleSummary,
      amount: amount
    });

    try {
      await newOrder.save();
      console.log('✅ Order saved to database');
    } catch (err) {
      console.error('❌ Error saving order:', err);
    }

    console.log('📧 Sending customer confirmation email...');
    sendConfirmationEmail(customerEmail, customerName, bookTitleSummary);

    console.log('📧 Sending admin notification email...');
    sendAdminNotificationEmail(customerEmail, bookTitleSummary, session.id);
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

// ✅ Stripe Checkout route
app.post('/create-checkout-session', async (req, res) => {
  try {
    const items = req.body.items;
    const customerEmail = req.body.customerEmail;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Invalid items array' });
    }

    const line_items = items.map(item => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: item.name,
          tax_code: 'txcd_99999999',
        },
        unit_amount: item.unit_amount,
      },
      quantity: item.quantity
    }));

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items,
      metadata: { items: JSON.stringify(items) },
      customer_email: customerEmail,
      success_url: 'https://coolcalmandkarter.netlify.app/success.html?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://coolcalmandkarter.netlify.app/cancel.html',
      expires_at: Math.floor(Date.now() / 1000) + 15 * 60,
      automatic_tax: { enabled: true }
    });

    res.json({ id: session.id });
  } catch (err) {
    console.error('❌ Stripe error:', err);
    res.status(500).json({ error: 'Checkout failed' });
  }
});

// ✅ Newsletter signup route
app.post('/api/newsletter', async (req, res) => {
  const { email } = req.body;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  try {
    const newSignup = new NewsletterEmail({ email });
    await newSignup.save();
    res.status(200).json({ message: 'Email saved successfully!' });
  } catch (err) {
    console.error('❌ Failed to save newsletter email:', err);
    res.status(500).json({ error: 'Could not save email' });
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

// ✅ Confirmation email
function sendConfirmationEmail(toEmail, name, summary) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USERNAME,
      pass: process.env.EMAIL_PASSWORD
    }
  });

  const mailOptions = {
    from: `"Cool, Calm & Karter" <${process.env.EMAIL_USERNAME}>`,
    to: toEmail,
    subject: 'Your Order is Confirmed!',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; color: #333;">
        <div style="text-align: center; padding: 20px;">
          <img src="https://coolcalmandkarter.netlify.app/images/coolcalm-logo%20TRANSPARENT.png" alt="Cool, Calm & Karter" style="max-width: 200px;" />
          <h2 style="color: #f46045;">Thank You for Your Order!</h2>
        </div>
        <p>Hi ${name || 'there'},</p>
        <p>Thanks for your purchase from <strong>Cool, Calm & Karter</strong>!</p>
        <p><strong>Order Summary:</strong><br>${summary}</p>
        <p>Your order has been successfully placed. You’ll receive another email when your books ship!</p>
        <p style="margin-top: 2rem;">With love,<br/>The Cool, Calm & Karter Team</p>
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

// ✅ Admin notification
function sendAdminNotificationEmail(customerEmail, bookSummary, sessionId) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USERNAME,
      pass: process.env.EMAIL_PASSWORD
    }
  });

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
        <p><strong>Stripe Session ID:</strong> ${sessionId}</p>
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
      expand: ['line_items']
    });

    const items = session.line_items?.data.map(item => ({
      name: item.description,
      quantity: item.quantity
    })) || [];

    res.json({
      customerEmail: session.customer_details?.email || 'No email found',
      items
    });
  } catch (err) {
    console.error('❌ Failed to fetch session:', err);
    res.status(500).json({ error: 'Could not retrieve session' });
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
