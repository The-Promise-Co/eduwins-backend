const axios = require('axios');
const { pool } = require('../config/db');

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

exports.initializePayment = async (req, res) => {
  const { email, amount, currency, reference, callback_url } = req.body;

  if (!PAYSTACK_SECRET) {
    return res.status(500).json({ error: 'Paystack not configured' });
  }

  try {
    const response = await axios.post('https://api.paystack.co/transaction/initialize', {
      email,
      amount: Math.round(amount * 100),
      currency: currency || 'NGN',
      reference,
      callback_url: callback_url || `${process.env.FRONTEND_URL}/payment-success`,
    }, {
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        'Content-Type': 'application/json',
      },
    });

    res.json(response.data.data);
  } catch (err) {
    console.error('Paystack initialize error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Payment initialization failed' });
  }
};

exports.verifyPayment = async (req, res) => {
  const { reference } = req.params;

  if (!PAYSTACK_SECRET) {
    return res.status(500).json({ error: 'Paystack not configured' });
  }

  try {
    const response = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
      },
    });

    const data = response.data.data;

    // Record transaction for later reconciliation
    await pool.query(`
      INSERT INTO transactions (booking_id, teacher_id, amount, type, metadata)
      VALUES ($1, $2, $3, $4, $5)
    `, [data.metadata?.booking_id || null, data.metadata?.teacher_id || null, data.amount / 100, 'payment_in', data]);

    res.json(data);
  } catch (err) {
    console.error('Paystack verify error:', err.response?.data || err.message);
    return res.status(500).json({ error: 'Could not verify payment' });
  }
};

exports.paystackWebhook = async (req, res) => {
  const hash = req.headers['x-paystack-signature'];
  const secret = process.env.PAYSTACK_SECRET_KEY;

  if (!secret) return res.status(500).json({ error: 'Paystack not configured' });

  const crypto = require('crypto');
  const body = JSON.stringify(req.body);
  const expectedHash = crypto.createHmac('sha512', secret).update(body).digest('hex');

  if (expectedHash !== hash) {
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  const event = req.body;

  if (event.event === 'charge.success') {
    // handle business logic: update booking, release funds to teacher, etc.
    try {
      const metadata = event.data.metadata || {};

      await pool.query(`
        UPDATE bookings
        SET status = 'paid_escrow', payment_reference = $1
        WHERE id = $2
      `, [event.data.reference, metadata.booking_id || null]);

      await pool.query(`
        INSERT INTO transactions (booking_id, teacher_id, amount, type, metadata)
        VALUES ($1, $2, $3, $4, $5)
      `, [metadata.booking_id || null, metadata.teacher_id || null, event.data.amount / 100, 'payment_in', event.data]);
    } catch (err) {
      console.error('Paystack webhook processing failed:', err);
      return res.status(500).json({ error: 'Webhook processing failed' });
    }
  }

  res.json({ received: true });
};
