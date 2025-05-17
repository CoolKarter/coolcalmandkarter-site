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
    const bookTitle = session.metadata?.bookTitle || 'Unknown Book'; // ✅ dynamic title

    console.log(`✅ Saving order for ${customerName} (${customerEmail})`);

    const newOrder = new Order({
      name: customerName,
      email: customerEmail,
      bookTitle: bookTitle,
      amount: amount
    });

    try {
      await newOrder.save();
      console.log('✅ Order saved to database');
    } catch (err) {
      console.error('❌ Error saving order:', err);
    }

    sendConfirmationEmail(customerEmail, customerName);
  }

  response.status(200).end();
});

// ✅ Apply express.json() to all other routes (skip webhook)
app.use((req, res, next) => {
  if (req.originalUrl === '/webhook') {
    next(); // Skip body parsing for webhook route
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

// ✅ Stripe Checkout Session Route
app.post('/create-checkout-session', async (req, res) => {
  console.log('✅ Received POST to /create-checkout-session');
  console.log('📦 Request Body:', req.body);

  try {
    const { bookTitle, amount, quantity } = req.body;

    // ✅ Input validation
    if (!bookTitle || typeof bookTitle !== 'string') {
      return res.status(400).json({ error: 'Invalid book title' });
    }
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    const qty = parseInt(quantity);
    if (!qty || qty <= 0) {
      return res.status(400).json({ error: 'Invalid quantity' });
    }

    console.log(`📚 Book: ${bookTitle}`);
    console.log(`💲 Amount: ${amount} cents`);
    console.log(`📦 Quantity: ${qty}`);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: bookTitle,
            },
            unit_amount: amount,
          },
          quantity: qty,
        },
      ],
      metadata: {
        bookTitle: bookTitle,
        quantity: qty.toString() // ✅ Add quantity to metadata for success.html
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


// ✅ Send confirmation email
function sendConfirmationEmail(toEmail, name) {
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
    text: `Hi ${name || 'there'},\n\nThanks for your purchase from Cool, Calm & Karter!\nYour order has been successfully placed.\n\nBest,\nThe Team`
  };

  transporter.sendMail(mailOptions, function(error, info){
    if (error) {
      console.log('❌ Email Error:', error);
    } else {
      console.log('✅ Email sent: ' + info.response);
    }
  });
}

// ✅ Optional homepage route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// ✅ Orders API route
app.get('/api/orders', async (req, res) => {
  try {
    const orders = await Order.find().sort({ date: -1 });
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

// ✅ Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
