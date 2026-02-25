import Stripe from 'stripe';

// Lazy initialization of Stripe client
let stripeInstance = null;

const getStripe = () => {
  if (!stripeInstance) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error('Stripe secret key is not configured. Please set STRIPE_SECRET_KEY in your .env file.');
    }
    stripeInstance = new Stripe(secretKey, {
      apiVersion: '2024-10-28.acacia',
    });
  }
  return stripeInstance;
};

/**
 * Create a payment intent
 * @param {Object} options - Payment options
 * @param {number} options.amount - Amount in cents/pence
 * @param {string} options.currency - Currency code (default: 'gbp')
 * @param {Object} options.metadata - Additional metadata
 * @returns {Promise<Object>} - Payment intent object
 */
export const createPaymentIntent = async ({ amount, currency = 'gbp', metadata = {} }) => {
  const stripe = getStripe();

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      metadata,
      automatic_payment_methods: {
        enabled: true,
      },
    });

    console.log('Payment intent created:', paymentIntent.id);
    return paymentIntent;
  } catch (error) {
    console.error('Error creating payment intent:', error);
    throw error;
  }
};

/**
 * Handle Stripe webhook
 * @param {Buffer} body - Raw request body
 * @param {string} signature - Stripe signature from headers
 * @returns {Promise<Object>} - Event object
 */
export const handleWebhook = async (body, signature) => {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    throw new Error('Stripe webhook secret is not configured');
  }

  const stripe = getStripe();

  try {
    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    return event;
  } catch (error) {
    console.error('Webhook signature verification failed:', error.message);
    throw error;
  }
};

/**
 * Get payment status
 * @param {string} paymentIntentId - Payment intent ID
 * @returns {Promise<Object>} - Payment status
 */
export const getPaymentStatus = async (paymentIntentId) => {
  const stripe = getStripe();

  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    return {
      id: paymentIntent.id,
      status: paymentIntent.status,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      metadata: paymentIntent.metadata,
      created: paymentIntent.created
    };
  } catch (error) {
    console.error('Error retrieving payment intent:', error);
    throw error;
  }
};

/**
 * Create a checkout session (alternative to payment intents)
 * @param {Object} options - Checkout options
 * @param {Array} options.lineItems - Array of line items
 * @param {string} options.successUrl - Success redirect URL
 * @param {string} options.cancelUrl - Cancel redirect URL
 * @param {Object} options.metadata - Additional metadata
 * @param {string} [options.customerEmail] - Customer email
 * @param {Object} [options.shippingAddressCollection] - Shipping address collection config
 * @returns {Promise<Object>} - Checkout session
 */
export const createCheckoutSession = async ({ 
  lineItems, 
  successUrl, 
  cancelUrl, 
  metadata = {},
  customerEmail,
  shippingAddressCollection,
}) => {
  const stripe = getStripe();

  try {
    const sessionConfig = {
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata,
    };

    if (customerEmail) {
      sessionConfig.customer_email = customerEmail;
    }

    if (shippingAddressCollection) {
      sessionConfig.shipping_address_collection = shippingAddressCollection;
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    console.log('Checkout session created:', session.id);
    return session;
  } catch (error) {
    console.error('Error creating checkout session:', error);
    throw error;
  }
};

/**
 * Refund a payment
 * @param {string} paymentIntentId - Payment intent ID
 * @param {number} [amount] - Amount to refund (in cents/pence). If not provided, full refund
 * @returns {Promise<Object>} - Refund object
 */
export const refundPayment = async (paymentIntentId, amount = null) => {
  const stripe = getStripe();

  try {
    const refundParams = {
      payment_intent: paymentIntentId,
    };

    if (amount) {
      refundParams.amount = amount;
    }

    const refund = await stripe.refunds.create(refundParams);
    
    console.log('Refund created:', refund.id);
    return refund;
  } catch (error) {
    console.error('Error creating refund:', error);
    throw error;
  }
};

