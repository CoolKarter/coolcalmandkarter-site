require('dotenv').config(); // Load environment variables

const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const path = require('path');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const { Parser } = require('json2csv');

const app = express();

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
    const rawItems = session.metadata?.items || '{}';

    let parsedItems = [];
    try {
      parsedItems = JSON.parse(rawItems);
    } catch (e) {
      console.error('❌ Failed to parse metadata.items:', e);
    }

    const orderSummary = parsedItems.map(i => `${i.title} x${i.quantity}`).join(', ');

    const newOrder = new Order({
      name: customerName,
      email: customerEmail,
      bookTitle: orderSummary,
      amount: amount
    });

    try {
      await newOrder.save();
      console.log('✅ Order saved to database');
    } catch (err) {
      console.error('❌ Error saving order:', err);
    }

    sendConfirmationEmail(customerEmail, customerName, orderSummary);
  }

  response.status(200).end();
});

app.use((req, res, next) => {
  if (req.originalUrl === '/webhook') {
    next();
  } else {
    express.json()(req, res, next);
  }
});
app.use(express.urlencoded({ extended: true }));

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB');
  })
  .catch(err => {
    console.error('❌ MongoDB Connection Error:', err);
  });

const orderSchema = new mongoose.Schema({
  name: String,
  email: String,
  bookTitle: String,
  amount: Number,
  date: { type: Date, default: Date.now }
});
const Order = mongoose.model('Order', orderSchema);

const basicAuth = require('express-basic-auth');
app.use('/api/orders', basicAuth({
  users: { 'admin': process.env.ADMIN_PASSWORD },
  challenge: true,
}));

app.use(express.static(path.join(__dirname, '../client')));

app.post('/create-checkout-session', async (req, res) => {
  console.log('✅ Received POST to /create-checkout-session');
  console.log('📦 Request Body:', req.body);

  try {
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Invalid items array' });
    }

    const lineItems = items.map(book => {
      if (!book.title || typeof book.title !== 'string') {
        throw new Error('Invalid book title');
      }
      const quantity = parseInt(book.quantity);
      const unitAmount = parseInt(book.amount);
      if (!quantity || quantity <= 0 || !unitAmount || unitAmount <= 0) {
        throw new Error('Invalid quantity or amount');
      }
      return {
        price_data: {
          currency: 'usd',
          product_data: { name: book.title },
          unit_amount: unitAmount
        },
        quantity: quantity
      };
    });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: lineItems,
      metadata: {
        items: JSON.stringify(items)
      },
      success_url: 'https://coolcalmandkarter.netlify.app/success.html?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://coolcalmandkarter.netlify.app/cancel.html',
    });

    res.json({ id: session.id });
  } catch (err) {
    console.error('❌ Stripe error:', err);
    res.status(500).json({ error: 'Checkout failed' });
  }
});

function sendConfirmationEmail(toEmail, name, orderSummary) {
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
    text: `Hi ${name || 'there'},\n\nThanks for your purchase from Cool, Calm & Karter!\n\nOrder Summary:\n${orderSummary}\n\nYour order has been successfully placed.\n\nBest,\nThe Team`
  };

  transporter.sendMail(mailOptions, function(error, info){
    if (error) {
      console.log('❌ Email Error:', error);
    } else {
      console.log('✅ Email sent: ' + info.response);
    }
  });
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

app.get('/api/orders', async (req, res) => {
  try {
    const orders = await Order.find().sort({ date: -1 });
    res.json(orders);
  } catch (err) {
    console.error('❌ Failed to fetch orders:', err);
    res.status(500).json({ error: 'Failed to retrieve orders' });
  }
});

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

app.get('/api/session/:id', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.id);

    let orderSummary = 'Unknown';
    try {
      const items = JSON.parse(session.metadata?.items || '[]');
      orderSummary = items.map(i => `${i.title} x${i.quantity}`).join(', ');
    } catch {}

    res.json({
      bookTitle: orderSummary,
      quantity: '—',
      customerEmail: session.customer_details?.email || 'No email found'
    });
  } catch (err) {
    console.error('❌ Failed to fetch session:', err);
    res.status(500).json({ error: 'Could not retrieve session' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
