require('dotenv').config(); // Load environment variables

const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const path = require('path');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');

const app = express(); // ✅ Define the app BEFORE using it

app.use(cors({
  origin: 'https://coolcalmandkarter.netlify.app',
  methods: ['GET', 'POST'],
  credentials: true
}));

// ✅ Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {

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

// ✅ Stripe webhook must parse raw body — must come before other middleware
app.post('/webhook', bodyParser.raw({ type: 'application/json' }), async (request, response) => {
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
    const bookTitle = 'And Baby Sleeps'; // For now, hardcoded

    console.log(`✅ Saving order for ${customerName} (${customerEmail})`);

    // Save order to database
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

    // Send confirmation email
    sendConfirmationEmail(customerEmail, customerName);
  }

  response.status(200).end();
});

// ✅ Apply body-parsing middleware after webhook
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Serve static frontend files
app.use(express.static(path.join(__dirname, '../client')));

// ✅ Stripe Checkout Session Route
app.post('/create-checkout-session', async (req, res) => {
  console.log('✅ Received POST to /create-checkout-session');
  console.log('Request Body:', req.body);
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: req.body.bookTitle,
            },
            unit_amount: req.body.amount,
          },
          quantity: 1,
        },
      ],
      customer_email: req.body.email || undefined, // Optional field to pass email
      success_url: 'https://coolcalmandkarter.netlify.app/success.html',
      cancel_url: 'https://coolcalmandkarter.netlify.app/cancel.html',
    });

    res.json({ id: session.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Checkout failed' });
  }
});

// ✅ Email Sending Function
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

// ✅ Optional fallback for homepage
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// ✅ Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
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
