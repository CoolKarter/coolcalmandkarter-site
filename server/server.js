require('dotenv').config(); // Load environment variables

const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const path = require('path');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');

const app = express(); // ✅ Define the app BEFORE using it

// ✅ Corrected CORS configuration
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

// ✅ Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('✅ Connected to MongoDB');
}).catch(err => {
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

// ✅ Stripe webhook — RAW BODY FIRST
app.post('/webhook', bodyParser.raw({ type: 'application/json' }), async (request, response) => {
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
    const bookTitle = 'And Baby Sleeps'; // Hardcoded title

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

// ✅ Apply body-parsing middleware AFTER webhook
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Serve static frontend
app.use(express.static(path.join(__dirname, '../client')));

// ✅ Stripe Checkout Session Route
app.post('/create-checkout-session', async (req, res) => {
  console.log('✅ Received POST to /create-checkout-session');
  console.log('Request Body:', req.body);
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: [']()
