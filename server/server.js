require('dotenv').config(); // Load environment variables

const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const path = require('path');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const { Parser } = require('json2csv'); // ✅ CSV export support

const app = express(); // ✅ Define the app BEFORE using it

// ✅ Corrected CORS configuration
const allowedOrigins = [
  'http://127.0.0.1:5500',
  'http://localhost:3000',
  'https://coolcalmandkarter.netlify.app',
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || origin === null) {
      callback(null, true);
    } else {
      console.log(`❌ Blocked CORS request from: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

// ✅ Stripe webhook — MUST come BEFORE any body parser
app.post('/webhook', express.raw({ type: 'application/json' }), async (request, response) => {
  console.log("🔔 Incoming webhook request received!");

  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = request.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(request.body, sig, endpointSecret);
  } catch (err) {
    console.log(`❌ Webhook Error: ${err.message}`);
    return response.status(400).send(`Webhook Error: ${err.message}`);
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

    sendConfirmationEmail(customerEmail, customerName, bookTitleSummary);
    sendAdminNotificationEmail(customerEmail, bookTitleSummary, session.id);
  }

  response.status(200).end();
});

// ✅ Apply express.json() to all other routes (skip webhook)
app.use((req, res, next) => {
  if (req.originalUrl === '/webhook') {
    next();
  } else {
    express.json()(req, res, next);
  }
});
app.use(express.urlencoded({ extended: true }));

// ✅ Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB');
  })
  .catch(err => {
    console.error('❌ MongoDB Connection Error:', err);
  });

// ✅ Define Order schema & model
const orderSchema = new mongoose.Schema({
  name: String,
  email: String,
  bookTitle: String,
  amount: Number,
  date: { type: Date, default: Date.now }
});
const Order = mongoose.model('Order', orderSchema);

// ✅ Add admin password protection to /api/orders
const basicAuth = require('express-basic-auth');
app.use('/api/orders', basicAuth({
  users: { 'admin': process.env.ADMIN_PASSWORD },
  challenge: true,
}));

// ✅ Serve static frontend
app.use(express.static(path.join(__dirname, '../client')));

// ✅ Stripe Checkout Session Route (multi-item)
app.post('/create-checkout-session', async (req, res) => {
  console.log('✅ Received POST to /create-checkout-session');
  console.log('📦 Request Body:', req.body);

  try {
    const items = req.body.items;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Invalid items array' });
    }

    const line_items = items.map(item => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: item.name,
        },
        unit_amount: item.unit_amount,
      },
      quantity: item.quantity
    }));

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items,
      metadata: {
        items: JSON.stringify(items)
      },
      success_url: 'https://coolcalmandkarter.netlify.app/success.html?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://coolcalmandkarter.netlify.app/cancel.html'
    });

    res.json({ id: session.id });
  } catch (err) {
    console.error('❌ Stripe error:', err);
    res.status(500).json({ error: 'Checkout failed' });
  }
});

// ✅ Send confirmation email
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
    text: `Hi ${name || 'there'},\n\nThanks for your purchase from Cool, Calm & Karter!\n\nOrder Summary:\n${summary}\n\nYour order has been successfully placed.\n\nBest,\nThe Team`
  };

  transporter.sendMail(mailOptions, function(error, info) {
    if (error) {
      console.log('❌ Email Error:', error);
    } else {
      console.log('✅ Email sent: ' + info.response);
    }
  });
}

// ✅ Send admin notification email
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
    text: `
A new order has been placed.

Customer Email: ${customerEmail}

Books:
${bookSummary}

Stripe Session ID: ${sessionId}
    `.trim()
  };

  transporter.sendMail(mailOptions, (err, info) => {
    if (err) {
      console.error('❌ Admin Email Error:', err);
    } else {
      console.log('✅ Admin email sent:', info.response);
    }
  });
}

// ✅ Optional homepage route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// ✅ Orders API route with optional filtering by book title or email
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

// ✅ Export Orders as CSV route
app.get('/api/orders/export', async (req, res) => {
  try {
    const orders = await Order.find().sort({ date: -1 });

    const fields = ['name', 'email', 'bookTitle', 'amount', 'date'];
    const parser = new Parser({ fields });
    const csv = parser.parse(orders);

    res.header('Content-Type', 'text/csv');
    res.attachment('orders.csv');
    return res.send(csv);
  } catch (err) {
    console.error('❌ Failed to export orders:', err);
    res.status(500).json({ error: 'Could not export orders' });
  }
});

// ✅ GET session details by ID (for success.html)
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

// ✅ Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
