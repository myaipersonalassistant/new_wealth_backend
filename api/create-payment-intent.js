import { createPaymentIntent } from '../server/services/stripeService.js';

/**
 * Create Stripe payment intent
 * POST /api/create-payment-intent
 */
export default async function handler(req, res) {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { amount, currency = 'gbp', metadata = {} } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ 
        error: 'Invalid amount. Amount must be greater than 0' 
      });
    }

    const paymentIntent = await createPaymentIntent({
      amount: Math.round(amount * 100), // Convert to cents/pence
      currency,
      metadata
    });

    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json({ 
      success: true, 
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });
  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(500).json({ 
      error: 'Failed to create payment intent', 
      message: error.message 
    });
  }
}

