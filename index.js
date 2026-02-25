import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables FIRST, before importing services that need them
dotenv.config();

import { sendEmail } from './services/emailService.js';
import { 
  createPaymentIntent, 
  handleWebhook, 
  getPaymentStatus,
  createCheckoutSession 
} from './services/stripeService.js';
import admin from 'firebase-admin';
import {
  updateBookOrder,
  findOrderBySessionId,
  findOrderByEmail,
  createBookOrder,
  getOrderById,
  getFirestoreDb,
  updateFoundationOrder,
  findFoundationOrderBySessionId,
  getFoundationOrderById,
  createFoundationOrder,
  createSeminarOrder,
  updateSeminarOrder,
  findSeminarOrderBySessionId,
  getSeminarOrderById,
  incrementFoundationStats,
  createCourseEnrollment,
  validateCourseCoupon,
  redeemCourseCoupon,
  getCourseSetting,
  isCourseEnrolled,
} from './services/firebaseService.js';
import { getCampaignRecipients, sendCampaign, listCampaigns, deleteCampaign } from './services/campaignService.js';
import {
  listFunnels,
  getSteps,
  createFunnel,
  updateFunnel,
  deleteFunnel,
  saveStep,
  deleteStep,
  enrollSubscribers,
  processFunnel,
  processAllFunnels,
  getFunnelAnalytics,
  getProcessorStatus,
} from './services/funnelService.js';
import { getAnalyticsOverview } from './services/analyticsService.js';
import { getGA4DashboardReport } from './services/ga4AnalyticsService.js';

const app = express();
const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Middleware
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true
}));
app.use(express.json());
// For Stripe webhooks - must be raw body
app.use('/api/stripe-webhook', express.raw({ type: 'application/json' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Email endpoints
app.post('/api/send-email', async (req, res) => {
  try {
    const { to, subject, text, html, template, templateData } = req.body;

    if (!to || !subject) {
      return res.status(400).json({ 
        error: 'Missing required fields: to and subject are required' 
      });
    }

    const result = await sendEmail({
      to,
      subject,
      text,
      html,
      template,
      templateData
    });

    res.json({ 
      success: true, 
      message: 'Email sent successfully',
      messageId: result.messageId 
    });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ 
      error: 'Failed to send email', 
      message: error.message 
    });
  }
});

// Create payment (replaces Supabase create-payment) - returns clientSecret for Stripe Elements
const PRODUCT_AMOUNTS = { book: 19.99, seminar: 25, foundation: 50 };
app.post('/api/create-payment', async (req, res) => {
  try {
    const { productType, email, name } = req.body;
    const amount = PRODUCT_AMOUNTS[productType];
    if (!amount) {
      return res.status(400).json({ error: 'Invalid product type' });
    }
    const paymentIntent = await createPaymentIntent({
      amount: Math.round(amount * 100),
      currency: 'gbp',
      metadata: { productType, email: email || '', name: name || '' },
    });
    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    console.error('Create payment error:', error);
    res.status(500).json({ error: error.message || 'Failed to create payment' });
  }
});

// Stripe payment endpoints
app.post('/api/create-payment-intent', async (req, res) => {
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

    res.json({ 
      success: true, 
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });
  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(500).json({ 
      error: 'Failed to create payment intent', 
      message: error.message 
    });
  }
});

// Create checkout session endpoint (for book purchases)
app.post('/api/create-checkout-session', async (req, res) => {
  try {
    const { 
      productType, 
      quantity, 
      amount, 
      currency = 'gbp',
      customerData,
      metadata = {},
      successUrl,
      cancelUrl,
      orderId // Optional: order ID from Supabase
    } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ 
        error: 'Invalid amount. Amount must be greater than 0' 
      });
    }

    if (!successUrl || !cancelUrl) {
      return res.status(400).json({ 
        error: 'successUrl and cancelUrl are required' 
      });
    }

    // Build line items based on product type
    const productConfig = {
      book: {
        name: 'Build Wealth Through Property - Book',
        description: 'A comprehensive guide to building wealth through property investment',
      },
      foundation: {
        name: 'Build Wealth Through Property — Foundation Edition',
        description: 'Limited special-print signed copy supporting our church & community building vision',
      },
      seminar: {
        name: 'Build Wealth Through Property — Seminar Ticket',
        description: 'Live seminar: 7 Reasons Why Property Builds Lasting Wealth. Saturday 14 March 2026, 2pm–5pm, Europa Hotel, Belfast.',
      },
    };
    const config = productConfig[productType] || { name: 'Product', description: 'Product purchase' };

    const lineItems = [{
      price_data: {
        currency: currency.toLowerCase(),
        product_data: {
          name: config.name,
          description: config.description,
        },
        unit_amount: Math.round((amount / quantity) * 100), // Convert to pence/cents
      },
      quantity: quantity,
    }];

    // Create checkout session with order ID in metadata if provided
    const session = await createCheckoutSession({
      lineItems,
      successUrl: successUrl.replace('{CHECKOUT_SESSION_ID}', '{CHECKOUT_SESSION_ID}'),
      cancelUrl: cancelUrl.replace('{CHECKOUT_SESSION_ID}', '{CHECKOUT_SESSION_ID}'),
      customerEmail: customerData?.email,
      shippingAddressCollection: (productType === 'book' || productType === 'foundation') ? {
        allowed_countries: ['GB', 'US', 'CA', 'AU', 'IE'],
      } : undefined, // No shipping for seminar
      metadata: {
        ...metadata,
        productType: productType || 'unknown',
        ...(orderId && { orderId: orderId.toString() }), // Include order ID if provided
      },
    });

    // If orderId is provided, update the order with the session ID
    if (orderId) {
      try {
        if (productType === 'book') {
          await updateBookOrder(orderId, { stripe_session_id: session.id });
        } else if (productType === 'foundation') {
          await updateFoundationOrder(orderId, { stripe_session_id: session.id });
        } else if (productType === 'seminar') {
          await updateSeminarOrder(orderId, { stripe_session_id: session.id });
        }
        console.log(`Linked ${productType} order ${orderId} to session ${session.id}`);
      } catch (updateError) {
        console.error('Error updating order with session ID:', updateError);
        // Continue anyway - webhook will handle it
      }
    }

    res.json({ 
      success: true, 
      url: session.url,
      sessionId: session.id
    });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ 
      error: 'Failed to create checkout session', 
      message: error.message 
    });
  }
});

// Stripe webhook endpoint (must use raw body)
app.post('/api/stripe-webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];

  if (!sig) {
    return res.status(400).json({ error: 'Missing stripe-signature header' });
  }

  try {
    const event = await handleWebhook(req.body, sig);
    
    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const productType = session.metadata?.productType || 'book';
        console.log('Checkout session completed:', session.id, 'productType:', productType);

        try {
          if (productType === 'course') {
            const courseId = session.metadata?.courseId;
            let userId = session.metadata?.userId || '';
            const customerEmail = (session.customer_email || '').toLowerCase();
            if (!courseId) {
              console.warn('Course checkout completed but no courseId in metadata:', session.id);
              break;
            }
            if (!userId && customerEmail) {
              try {
                const fbUser = await admin.auth().getUserByEmail(customerEmail);
                userId = fbUser.uid;
              } catch (e) {
                console.warn('Could not find Firebase user by email for course enrollment:', customerEmail);
              }
            }
            if (userId) {
              const alreadyEnrolled = await isCourseEnrolled(userId, courseId);
              if (!alreadyEnrolled) {
                await createCourseEnrollment({
                  userId,
                  courseId,
                  email: customerEmail,
                  source: 'stripe',
                  stripeSessionId: session.id,
                });
                console.log('Course enrollment created:', userId, courseId);
                const course = await getCourseSetting(courseId);
                const courseTitle = course?.title || 'Course';
                try {
                  await sendEmail({
                    to: customerEmail,
                    subject: `You're Enrolled — ${courseTitle}`,
                    template: 'paymentConfirmation',
                    templateData: {
                      name: session.customer_details?.name || 'Student',
                      productName: courseTitle,
                      quantity: 1,
                      amount: session.amount_total ? (session.amount_total / 100).toFixed(2) : '',
                      orderId: session.id,
                      transactionId: session.payment_intent || session.id,
                      isBook: false,
                      dashboardUrl: `${FRONTEND_URL}/dashboard`,
                    },
                  });
                } catch (emailError) {
                  console.error('Course enrollment email error:', emailError);
                }
              }
            } else {
              console.warn('Course checkout: no userId for session', session.id);
            }
            break;
          }
          if (productType === 'foundation') {
            // Foundation order flow
            let order = await findFoundationOrderBySessionId(session.id);
            if (!order && session.metadata?.orderId) {
              order = await getFoundationOrderById(session.metadata.orderId);
            }

            if (order) {
              await updateFoundationOrder(order.id, {
                status: 'paid',
                stripe_session_id: session.id,
                stripe_payment_intent_id: session.payment_intent || null,
              });

              const amountPaid = session.amount_total ? session.amount_total / 100 : (order.total_amount || 50);
              const quantity = order.quantity || 1;
              await incrementFoundationStats(amountPaid, quantity);

              if (!order.email_sent_type || order.email_sent_type !== 'success') {
                try {
                  await sendEmail({
                    to: session.customer_email || order.customer_email,
                    subject: 'Thank You — Foundation Edition Order Confirmed',
                    template: 'paymentConfirmation',
                    templateData: {
                      name: order.customer_name || session.customer_details?.name,
                      productName: 'Build Wealth Through Property — Foundation Edition',
                      quantity: order.quantity || 1,
                      amount: (order.total_amount || amountPaid).toFixed(2),
                      orderId: order.id,
                      transactionId: session.payment_intent || session.id,
                      isBook: true,
                      dashboardUrl: FRONTEND_URL,
                    },
                  });
                  await updateFoundationOrder(order.id, { email_sent_type: 'success' });
                  console.log('Foundation confirmation email sent to:', session.customer_email || order.customer_email);
                } catch (emailError) {
                  console.error('Error sending foundation confirmation email:', emailError);
                }
              }
            } else {
              console.warn('Foundation order not found for session:', session.id);
            }
          } else if (productType === 'seminar') {
            // Seminar order flow
            let order = await findSeminarOrderBySessionId(session.id);
            if (!order && session.metadata?.orderId) {
              order = await getSeminarOrderById(session.metadata.orderId);
            }
            if (order) {
              await updateSeminarOrder(order.id, {
                status: 'paid',
                stripe_session_id: session.id,
                stripe_payment_intent_id: session.payment_intent || null,
              });
              if (!order.email_sent_type || order.email_sent_type !== 'success') {
                try {
                  await sendEmail({
                    to: session.customer_email || order.customer_email,
                    subject: 'Thank You — Seminar Booking Confirmed',
                    template: 'paymentConfirmation',
                    templateData: {
                      name: order.customer_name || session.customer_details?.name,
                      productName: 'Property Investment Seminar - 7 Reasons Why',
                      quantity: order.quantity || 1,
                      amount: (order.total_amount || 25).toFixed(2),
                      orderId: order.id,
                      transactionId: session.payment_intent || session.id,
                      isBook: false,
                      isSeminar: true,
                      dashboardUrl: FRONTEND_URL,
                      seminarDate: 'Saturday, 14 March 2026',
                      seminarTime: '2:00 PM – 5:00 PM',
                      seminarVenue: 'Europa Hotel, Great Victoria Street, Belfast BT2 7AP',
                    },
                  });
                  await updateSeminarOrder(order.id, { email_sent_type: 'success' });
                  console.log('Seminar confirmation email sent to:', session.customer_email || order.customer_email);
                } catch (emailError) {
                  console.error('Error sending seminar confirmation email:', emailError);
                }
              }
            } else {
              console.warn('Seminar order not found for session:', session.id);
            }
          } else {
            // Book order flow
            let order = await findOrderBySessionId(session.id);
            if (!order && session.metadata?.orderId) {
              try {
                order = await getOrderById(session.metadata.orderId);
              } catch (err) {
                console.error('Error fetching order by ID from metadata:', err);
              }
            }
            if (!order && session.customer_email) {
              order = await findOrderByEmail(session.customer_email, 'pending');
            }

            if (order) {
              await updateBookOrder(order.id, {
                status: 'paid',
                stripe_session_id: session.id,
                stripe_payment_intent_id: session.payment_intent || null,
              });

              if (!order.email_sent_type || order.email_sent_type !== 'success') {
                try {
                  await sendEmail({
                    to: session.customer_email || order.customer_email,
                    subject: 'Payment Confirmation - Build Wealth Through Property',
                    template: 'paymentConfirmation',
                    templateData: {
                      name: order.customer_name || session.customer_details?.name,
                      productName: 'Build Wealth Through Property - Book',
                      quantity: order.quantity,
                      amount: order.total_amount.toFixed(2),
                      orderId: order.id,
                      transactionId: session.payment_intent || session.id,
                      isBook: true,
                      dashboardUrl: FRONTEND_URL,
                    },
                  });
                  await updateBookOrder(order.id, { email_sent_type: 'success' });
                  console.log('Confirmation email sent via webhook to:', session.customer_email || order.customer_email);
                } catch (emailError) {
                  console.error('Error sending confirmation email via webhook:', emailError);
                }
              } else {
                console.log('Email already sent for order:', order.id, '- skipping duplicate');
              }
            } else {
              console.warn('Order not found for session:', session.id);
            }
          }
        } catch (dbError) {
          console.error('Error updating order or sending email:', dbError);
        }
        break;
      }

      case 'checkout.session.async_payment_failed': {
        const session = event.data.object;
        const productType = session.metadata?.productType || 'book';
        console.log('Checkout session payment failed:', session.id, 'productType:', productType);

        try {
          let order;
          const retryUrl = productType === 'foundation' ? `${FRONTEND_URL}/foundation` : `${FRONTEND_URL}/book-purchase`;
          const productName = productType === 'foundation'
            ? 'Build Wealth Through Property — Foundation Edition'
            : 'Build Wealth Through Property - Book';

          if (productType === 'foundation') {
            order = await findFoundationOrderBySessionId(session.id);
            if (!order && session.metadata?.orderId) {
              order = await getFoundationOrderById(session.metadata.orderId);
            }
            if (order) {
              await updateFoundationOrder(order.id, {
                status: 'cancelled',
                stripe_session_id: session.id,
                stripe_payment_intent_id: session.payment_intent || null,
              });
            }
          } else {
            order = await findOrderBySessionId(session.id);
            if (!order && session.metadata?.orderId) {
              try {
                order = await getOrderById(session.metadata.orderId);
              } catch (err) {
                console.error('Error fetching order by ID from metadata:', err);
              }
            }
            if (!order && session.customer_email) {
              order = await findOrderByEmail(session.customer_email, 'pending');
            }
            if (order) {
              await updateBookOrder(order.id, {
                status: 'cancelled',
                stripe_session_id: session.id,
                stripe_payment_intent_id: session.payment_intent || null,
              });
            }
          }

          if (order) {
            try {
              await sendEmail({
                to: session.customer_email || order.customer_email,
                subject: 'Payment Failed - Build Wealth Through Property',
                template: 'paymentFailed',
                templateData: {
                  name: order.customer_name || session.customer_details?.name,
                  productName,
                  reason: 'Payment could not be processed.',
                  retryUrl,
                },
              });
              console.log('Failure email sent to:', session.customer_email || order.customer_email);
            } catch (emailError) {
              console.error('Error sending failure email via webhook:', emailError);
            }
          } else {
            console.warn('Order not found for failed session:', session.id);
          }
        } catch (dbError) {
          console.error('Error updating failed order or sending email:', dbError);
        }
        break;
      }

      case 'payment_intent.succeeded':
        console.log('Payment intent succeeded:', event.data.object.id);
        break;
      case 'payment_intent.payment_failed':
        console.log('Payment intent failed:', event.data.object.id);
        break;
      case 'charge.refunded':
        console.log('Charge refunded:', event.data.object.id);
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(400).json({
      error: 'Webhook Error',
      message: error.message
    });
  }
});

// Get payment status
app.get('/api/payment-status/:paymentIntentId', async (req, res) => {
  try {
    const { paymentIntentId } = req.params;
    const status = await getPaymentStatus(paymentIntentId);
    res.json({ success: true, status });
  } catch (error) {
    console.error('Error getting payment status:', error);
    res.status(500).json({ 
      error: 'Failed to get payment status', 
      message: error.message 
    });
  }
});

// Verify and process payment if webhook failed (fallback mechanism)
app.post('/api/verify-payment', async (req, res) => {
  try {
    const { sessionId, orderId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    // Import Stripe to check session status
    const Stripe = (await import('stripe')).default;
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      return res.status(500).json({
        error: 'Stripe secret key is not configured',
        message: 'Please set STRIPE_SECRET_KEY in your .env file',
      });
    }
    const stripe = new Stripe(secretKey, {
      apiVersion: '2024-10-28.acacia',
    });

    // Retrieve the checkout session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent'],
    });

    console.log(`Verifying payment for session: ${sessionId}, status: ${session.payment_status}`);

    // Only process if payment is actually complete
    if (session.payment_status !== 'paid') {
      return res.json({
        success: false,
        message: `Payment status is ${session.payment_status}, not paid`,
        paymentStatus: session.payment_status,
      });
    }

    const productType = session.metadata?.productType || 'book';

    // Course: ensure enrollment exists (fallback if webhook hasn't run yet)
    if (productType === 'course') {
      const courseId = session.metadata?.courseId;
      let userId = session.metadata?.userId || '';
      const customerEmail = (session.customer_email || session.customer_details?.email || '').toLowerCase();
      if (!courseId) {
        return res.json({ success: false, message: 'No courseId in session metadata' });
      }
      if (!userId && customerEmail) {
        try {
          const fbUser = await admin.auth().getUserByEmail(customerEmail);
          userId = fbUser.uid;
        } catch (e) {
          console.warn('Could not find Firebase user by email for course verify:', customerEmail);
        }
      }
      if (userId) {
        const alreadyEnrolled = await isCourseEnrolled(userId, courseId);
        if (!alreadyEnrolled) {
          await createCourseEnrollment({
            userId,
            courseId,
            email: customerEmail,
            source: 'stripe',
            stripeSessionId: sessionId,
          });
          console.log('Course enrollment created via verify-payment fallback:', userId, courseId);
        }
      }
      return res.json({
        success: true,
        message: 'Course enrollment verified',
        courseId,
        email: customerEmail || session.customer_email,
        name: session.customer_details?.name || 'Student',
      });
    }

    // Find the order (book, foundation, or seminar)
    let order;
    if (productType === 'foundation') {
      if (orderId) {
        order = await getFoundationOrderById(orderId);
      }
      if (!order) {
        order = await findFoundationOrderBySessionId(sessionId);
      }
    } else if (productType === 'seminar') {
      if (orderId) {
        order = await getSeminarOrderById(orderId);
      }
      if (!order) {
        order = await findSeminarOrderBySessionId(sessionId);
      }
    } else {
      if (orderId) {
        try {
          order = await getOrderById(orderId);
        } catch (err) {
          console.error('Error fetching order by ID:', err);
        }
      }
      if (!order) {
        order = await findOrderBySessionId(sessionId);
      }
      if (!order && session.customer_email) {
        order = await findOrderByEmail(session.customer_email, 'pending');
      }
    }

    // If order still doesn't exist, create it from Stripe session data (book/foundation only; seminar orders are created before checkout)
    if (!order && productType !== 'seminar') {
      console.log('Order not found, creating from Stripe session data...');
      const shippingDetails = session.shipping_details;
      const customerDetails = session.customer_details;
      const metadata = session.metadata || {};
      const quantity = parseInt(metadata.quantity || '1');
      const unitPrice = productType === 'foundation' ? 50 : parseFloat(metadata.bookPrice || '19.99');
      const totalAmount = quantity * unitPrice;

      const orderData = {
        customer_name: customerDetails?.name || metadata.customerName || 'Customer',
        customer_email: (session.customer_email || metadata.customerEmail)?.toLowerCase(),
        customer_phone: customerDetails?.phone || null,
        shipping_address: shippingDetails?.address?.line1 || metadata.address || 'Address not provided',
        shipping_city: shippingDetails?.address?.city || metadata.city || 'City not provided',
        shipping_postcode: shippingDetails?.address?.postal_code || metadata.postcode || 'Postcode not provided',
        quantity,
        unit_price: unitPrice,
        total_amount: totalAmount,
        status: 'paid',
        stripe_session_id: sessionId,
        stripe_payment_intent_id: session.payment_intent?.id || session.payment_intent || null,
        email_sent_at: null,
        email_sent_type: null,
      };

      try {
        if (productType === 'foundation') {
          order = await createFoundationOrder(orderData);
          await incrementFoundationStats(totalAmount, quantity);
        } else {
          order = await createBookOrder(orderData);
        }
        console.log(`${productType} order created from Stripe session:`, order.id);
      } catch (createError) {
        console.error('Error creating order:', createError);
      }
    }

    // Seminar with no order: return success with session email (order may have failed to save; can't create from Stripe - no shipping)
    if (productType === 'seminar' && !order) {
      const customerEmail = session.customer_email || session.metadata?.customerEmail;
      const customerName = session.customer_details?.name || session.metadata?.customerName || 'there';
      return res.json({
        success: true,
        message: 'Seminar payment verified',
        email: customerEmail,
        name: customerName,
        productType: 'seminar',
      });
    }

    // Check if order is already processed
    if (order && order.status === 'paid') {
      const customerEmail = session.customer_email || order.customer_email;
      const customerName = order.customer_name || session.customer_details?.name || 'Customer';
      return res.json({
        success: true,
        message: 'Order already processed',
        orderId: order.id,
        alreadyProcessed: true,
        email: customerEmail,
        name: customerName,
        productType,
      });
    }

    // Update order status if order exists
    if (order) {
      if (productType === 'foundation') {
        await updateFoundationOrder(order.id, {
          status: 'paid',
          stripe_session_id: sessionId,
          stripe_payment_intent_id: session.payment_intent?.id || session.payment_intent || null,
        });
        await incrementFoundationStats(order.total_amount || 50, order.quantity || 1);
      } else if (productType === 'seminar') {
        await updateSeminarOrder(order.id, {
          status: 'paid',
          stripe_session_id: sessionId,
          stripe_payment_intent_id: session.payment_intent?.id || session.payment_intent || null,
        });
      } else {
        await updateBookOrder(order.id, {
          status: 'paid',
          stripe_session_id: sessionId,
          stripe_payment_intent_id: session.payment_intent?.id || session.payment_intent || null,
        });
      }
    }

    const customerEmail = session.customer_email || order?.customer_email || session.metadata?.customerEmail;
    const customerName = order?.customer_name || session.customer_details?.name || session.metadata?.customerName || 'Customer';
    const orderQuantity = order?.quantity || parseInt(session.metadata?.quantity || '1');
    const orderAmount = order?.total_amount || (session.amount_total ? session.amount_total / 100 : (productType === 'foundation' ? 50 : productType === 'seminar' ? 25 : 19.99) * orderQuantity);
    const productName = productType === 'foundation' ? 'Build Wealth Through Property — Foundation Edition' : productType === 'seminar' ? 'Property Investment Seminar' : 'Build Wealth Through Property - Book';

    let emailSent = false;
    const shouldSendEmail = !order || !order.email_sent_type || order.email_sent_type !== 'success';

    if (customerEmail && shouldSendEmail) {
      try {
        await sendEmail({
          to: customerEmail,
          subject: productType === 'foundation' ? 'Thank You — Foundation Edition Order Confirmed' : productType === 'seminar' ? 'Thank You — Seminar Booking Confirmed' : 'Payment Confirmation - Build Wealth Through Property',
          template: 'paymentConfirmation',
          templateData: {
            name: customerName,
            productName,
            quantity: orderQuantity,
            amount: orderAmount.toFixed(2),
            orderId: order?.id || 'N/A',
            transactionId: session.payment_intent?.id || session.id,
            isBook: true,
            dashboardUrl: FRONTEND_URL,
          },
        });
        emailSent = true;
        console.log('Confirmation email sent via verify-payment to:', customerEmail);

        if (order) {
          try {
            if (productType === 'foundation') {
              await updateFoundationOrder(order.id, { email_sent_type: 'success' });
            } else if (productType === 'seminar') {
              await updateSeminarOrder(order.id, { email_sent_type: 'success' });
            } else {
              await updateBookOrder(order.id, { email_sent_type: 'success' });
            }
          } catch (updateError) {
            console.error('Error updating email sent info:', updateError);
          }
        }
      } catch (emailError) {
        console.error('Error sending confirmation email:', emailError);
      }
    } else if (order && order.email_sent_type === 'success') {
      console.log('Email already sent for order:', order.id);
      emailSent = true;
    } else if (!customerEmail) {
      console.warn('No customer email available to send confirmation email');
    }

    return res.json({
      success: true,
      message: order ? 'Payment verified and order processed' : 'Payment verified (order created)',
      orderId: order?.id || null,
      emailSent,
      paymentStatus: session.payment_status,
      email: customerEmail,
      name: customerName,
    });
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({
      error: 'Failed to verify payment',
      message: error.message,
    });
  }
});

// Backup email sending endpoint (for payment confirmations/failures)
app.post('/api/send-payment-email', async (req, res) => {
  try {
    const { type, orderId, sessionId, email, name, productName, amount, transactionId, reason, productType } = req.body;

    if (!type) {
      return res.status(400).json({ error: 'Missing required field: type' });
    }

    const isFoundation = productType === 'foundation';
    const isSeminar = productType === 'seminar';
    const isCourse = productType === 'course';
    let order;
    let customerEmailFromSession = null;
    let customerNameFromSession = null;
    let courseTitleFromSession = null;

    // For course: get customer email from Stripe session (no order exists)
    if (isCourse && sessionId) {
      try {
        const Stripe = (await import('stripe')).default;
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-10-28.acacia' });
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        customerEmailFromSession = (session.customer_email || session.customer_details?.email || '').toLowerCase() || null;
        customerNameFromSession = session.customer_details?.name || 'there';
        const cid = session.metadata?.courseId;
        if (cid) {
          const courseSetting = await getCourseSetting(cid);
          courseTitleFromSession = courseSetting?.title || cid;
        }
      } catch (e) {
        console.error('Error fetching course session for email:', e);
      }
    }

    // For seminar: get customer email from seminar order or Stripe session
    if (isSeminar && sessionId) {
      try {
        order = await findSeminarOrderBySessionId(sessionId);
        if (!order) {
          const Stripe = (await import('stripe')).default;
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-10-28.acacia' });
          const session = await stripe.checkout.sessions.retrieve(sessionId);
          customerEmailFromSession = (session.customer_email || session.customer_details?.email || '').toLowerCase() || null;
          customerNameFromSession = session.customer_details?.name || 'there';
        }
      } catch (e) {
        console.error('Error fetching seminar session for email:', e);
      }
    }

    if (!isCourse && !isSeminar) {
      if (orderId) {
        try {
          order = isFoundation ? await getFoundationOrderById(orderId) : await getOrderById(orderId);
        } catch (err) {
          console.error('Error fetching order by ID:', err);
        }
      } else if (sessionId) {
        order = isFoundation ? await findFoundationOrderBySessionId(sessionId) : await findOrderBySessionId(sessionId);
      } else if (email && !isFoundation) {
        order = await findOrderByEmail(email, type === 'success' ? 'paid' : 'pending');
      }
    }

    const customerName = name || customerNameFromSession || order?.customer_name || 'there';
    const customerEmail = email || customerEmailFromSession || order?.customer_email;
    const product = productName || courseTitleFromSession || (isFoundation ? 'Build Wealth Through Property — Foundation Edition' : isSeminar ? 'Property Investment Seminar' : 'Build Wealth Through Property - Book');
    const orderAmount = amount || order?.total_amount?.toFixed(2) || (isSeminar ? '25.00' : '0.00');
    const orderTransactionId = transactionId || order?.stripe_payment_intent_id || order?.stripe_session_id || 'N/A';
    const orderNumber = order?.id || 'N/A';

    if (!customerEmail) {
      console.error('No customer email available for sending backup email.');
      return res.status(400).json({ error: 'No customer email available.' });
    }

    if (type === 'success') {
      // Only send if email hasn't been sent yet
      if (order && order.email_sent_type === 'success') {
        console.log('Email already sent for order:', order.id, '- skipping backup email');
        return res.json({ 
          success: true, 
          message: 'Email already sent',
          skipped: true 
        });
      }
      
      await sendEmail({
        to: customerEmail,
        subject: isFoundation ? 'Thank You — Foundation Edition Order Confirmed' : isSeminar ? 'Thank You — Seminar Booking Confirmed' : 'Payment Confirmation - Build Wealth Through Property',
        template: 'paymentConfirmation',
        templateData: {
          name: customerName,
          productName: product,
          quantity: order?.quantity || 1,
          amount: orderAmount,
          orderId: orderNumber,
          transactionId: orderTransactionId,
          isBook: !isFoundation && !isSeminar,
          isSeminar,
          seminarDate: 'Saturday, 14 March 2026',
          seminarTime: '2:00 PM – 5:00 PM',
          seminarVenue: 'Europa Hotel, Great Victoria Street, Belfast BT2 7AP',
          dashboardUrl: FRONTEND_URL,
        },
      });
      console.log('Backup success email sent to:', customerEmail);

      if (order) {
        try {
          if (isFoundation) {
            await updateFoundationOrder(order.id, { email_sent_type: 'success' });
          } else if (isSeminar) {
            await updateSeminarOrder(order.id, { email_sent_type: 'success' });
          } else {
            await updateBookOrder(order.id, { email_sent_type: 'success' });
          }
        } catch (updateError) {
          console.error('Error updating email sent info:', updateError);
        }
      }
    } else if (type === 'failure') {
      const retryUrl = isCourse ? `${FRONTEND_URL}/dashboard` : isFoundation ? `${FRONTEND_URL}/foundation` : isSeminar ? `${FRONTEND_URL}/seminar` : `${FRONTEND_URL}/book-purchase`;
      await sendEmail({
        to: customerEmail,
        subject: 'Payment Failed - Build Wealth Through Property',
        template: 'paymentFailed',
        templateData: {
          name: customerName,
          productName: product,
          reason: reason || 'Payment could not be processed.',
          retryUrl,
        },
      });
      console.log('Backup failure email sent to:', customerEmail);
    } else {
      return res.status(400).json({ error: 'Invalid email type specified.' });
    }

    return res.status(200).json({ success: true, message: `Backup ${type} email sent.` });
  } catch (error) {
    console.error('Error in send-payment-email backup function:', error);
    return res.status(500).json({ error: 'Failed to send backup email.', message: error.message });
  }
});

// Email subscription endpoint (uses Admin SDK to bypass security rules)
app.post('/api/subscribe-email', async (req, res) => {
  try {
    const { email, source, referrer, firstName, phone } = req.body;

    if (!email || !source) {
      return res.status(400).json({ 
        success: false,
        error: 'Email and source are required' 
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    
    if (!normalizedEmail.includes('@')) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid email address' 
      });
    }

    const db = getFirestoreDb();
    const subscriptionsRef = db.collection('email_subscriptions');

    // Check if email already exists (using Admin SDK - bypasses security rules)
    const existingQuery = await subscriptionsRef
      .where('email', '==', normalizedEmail)
      .limit(1)
      .get();

    if (!existingQuery.empty) {
      const existingDoc = existingQuery.docs[0];
      const existingData = existingDoc.data();

      // If claiming starter-pack, mark it on existing subscription
      if (source === 'starter-pack' && !existingData.starter_pack_claimed) {
        await existingDoc.ref.update({
          starter_pack_claimed: true,
          starter_pack_claimed_at: admin.firestore.FieldValue.serverTimestamp(),
          ...(firstName && { firstName: firstName.trim() }),
          ...(phone && { phone: phone.trim() }),
        });
        console.log(`✅ Starter pack claimed for existing subscriber: ${normalizedEmail}`);
        return res.json({ success: true, message: 'Successfully subscribed!' });
      }
      if (source === 'starter-pack' && existingData.starter_pack_claimed) {
        return res.json({ success: true, message: 'You already have access!' });
      }
      
      if (existingData.status === 'unsubscribed') {
        return res.json({ 
          success: true, 
          message: 'Welcome back! You have been re-subscribed.' 
        });
      }
      
      // Already subscribed
      return res.json({ 
        success: true, 
        message: 'You are already subscribed!' 
      });
    }

    // Create new subscription
    const subscriptionData = {
      email: normalizedEmail,
      source: source,
      referrer: referrer || req.headers.referer || req.headers.origin || 'unknown',
      subscribed_at: admin.firestore.FieldValue.serverTimestamp(),
      status: 'subscribed',
      confirmed: false,
      ...(source === 'starter-pack' && { starter_pack_claimed: true }),
    };

    // Add optional fields if provided
    if (firstName) {
      subscriptionData.firstName = firstName.trim();
    }
    
    if (phone) {
      subscriptionData.phone = phone.trim();
    }

    await subscriptionsRef.add(subscriptionData);

    console.log(`✅ Email subscription created: ${normalizedEmail} (source: ${source})`);

    // Send welcome email for starter-pack signups
    if (source === 'starter-pack') {
      try {
        const dashboardUrl = process.env.STARTER_PACK_DOWNLOAD_URL ||
          `${FRONTEND_URL}/auth?redirect=${encodeURIComponent('/dashboard?tab=starter-pack')}`;
        await sendEmail({
          to: normalizedEmail,
          template: 'starterPackWelcome',
          templateData: {
            name: firstName?.trim() || normalizedEmail.split('@')[0],
            downloadUrl: dashboardUrl,
          },
        });
        console.log(`✅ Starter Pack welcome email sent to ${normalizedEmail}`);
      } catch (emailErr) {
        console.error('Failed to send starter pack email (subscription still saved):', emailErr.message);
        // Don't fail the request — subscription was created successfully
      }
    }

    res.json({ 
      success: true, 
      message: 'Successfully subscribed!' 
    });
  } catch (error) {
    console.error('Error subscribing email:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to subscribe. Please try again.' 
    });
  }
});

// Course coupon validation (public - for checkout form)
app.post('/api/validate-coupon', async (req, res) => {
  try {
    const { courseId, code } = req.body;
    if (!courseId || !code) {
      return res.status(400).json({ valid: false, error: 'Course ID and coupon code are required' });
    }
    const result = await validateCourseCoupon(courseId, code);
    res.json(result);
  } catch (error) {
    console.error('Validate coupon error:', error);
    res.status(500).json({ valid: false, error: 'Failed to validate coupon' });
  }
});

// Course enrollment via coupon (requires auth)
app.post('/api/course-enroll-coupon', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization required' });
    }
    const token = authHeader.slice(7);
    const decoded = await admin.auth().verifyIdToken(token);
    const userId = decoded.uid;
    const { courseId, code } = req.body;
    if (!courseId || !code) {
      return res.status(400).json({ error: 'Course ID and coupon code are required' });
    }
    const enrolled = await isCourseEnrolled(userId, courseId);
    if (enrolled) {
      return res.json({ success: true, message: 'Already enrolled' });
    }
    const result = await validateCourseCoupon(courseId, code);
    if (!result.valid) {
      return res.status(400).json({ error: result.error || 'Invalid coupon' });
    }
    await createCourseEnrollment({
      userId,
      courseId,
      email: decoded.email,
      source: 'coupon',
    });
    await redeemCourseCoupon(result.couponId);
    console.log(`Course enrollment via coupon: ${userId} -> ${courseId}`);
    res.json({ success: true, message: 'Enrolled successfully' });
  } catch (error) {
    console.error('Course enroll coupon error:', error);
    res.status(500).json({ error: error.message || 'Failed to enroll' });
  }
});

// Course checkout - create Stripe session for course purchase
app.post('/api/course-checkout', async (req, res) => {
  try {
    const { courseId, successUrl, cancelUrl, userId, customerEmail } = req.body;
    if (!courseId || !successUrl || !cancelUrl) {
      return res.status(400).json({ error: 'courseId, successUrl, and cancelUrl are required' });
    }
    const course = await getCourseSetting(courseId);
    if (!course || course.is_free) {
      return res.status(400).json({ error: 'Invalid or free course' });
    }
    const priceMatch = (course.price || '£0').match(/£?([\d.]+)/);
    const amount = priceMatch ? Math.round(parseFloat(priceMatch[1]) * 100) : 9700;
    if (amount <= 0) return res.status(400).json({ error: 'Invalid course price' });

    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-10-28.acacia' });
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'gbp',
          product_data: {
            name: course.title,
            description: course.description || '',
          },
          unit_amount: amount,
        },
        quantity: 1,
      }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: customerEmail || undefined,
      metadata: {
        productType: 'course',
        courseId,
        userId: userId || '',
      },
    });
    res.json({ success: true, url: session.url, sessionId: session.id });
  } catch (error) {
    console.error('Course checkout error:', error);
    res.status(500).json({ error: error.message || 'Checkout failed' });
  }
});

// Error handling middleware
// Admin subscribers API (replaces Supabase admin-subscribers)
async function verifyAdminToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization' });
  }
  try {
    const token = authHeader.slice(7);
    const decoded = await admin.auth().verifyIdToken(token);
    const db = getFirestoreDb();
    const profileSnap = await db.collection('user_profiles').doc(decoded.uid).get();
    const role = profileSnap.exists ? profileSnap.data()?.role : null;
    if (role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    req.adminUid = decoded.uid;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

app.post('/api/admin/subscribers', verifyAdminToken, async (req, res) => {
  try {
    const { action, page = 1, perPage = 20, status, search, source: sourceFilter, subscriberId, newStatus } = req.body;
    const db = getFirestoreDb();
    const col = db.collection('email_subscriptions');

    if (action === 'stats') {
      const all = await col.get();
      let active = 0, unsubscribed = 0, bounced = 0;
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      let recentCount = 0, monthlyCount = 0;
      const dailyCounts = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        dailyCounts[d.toISOString().slice(0, 10)] = 0;
      }
      const sourceBreakdown = {};
      all.docs.forEach((d) => {
        const data = d.data();
        const s = (data.status || 'active').toLowerCase();
        if (s === 'unsubscribed') unsubscribed++;
        else if (s === 'bounced') bounced++;
        else active++;
        const subAt = data.subscribed_at?.toDate?.() || new Date(data.subscribed_at || 0);
        if (subAt >= sevenDaysAgo) recentCount++;
        if (subAt >= thirtyDaysAgo) monthlyCount++;
        const dateKey = subAt.toISOString ? subAt.toISOString().slice(0, 10) : String(subAt).slice(0, 10);
        if (dailyCounts[dateKey] !== undefined) dailyCounts[dateKey]++;
        const src = (data.source || 'direct').toLowerCase().trim() || 'direct';
        const srcKey = src.includes('free') || src.includes('chapter') ? 'free-chapter' : src.includes('starter') ? 'starter-pack' : src.includes('calc') ? 'calculator' : src.includes('home') ? 'homepage' : src;
        sourceBreakdown[srcKey] = (sourceBreakdown[srcKey] || 0) + 1;
      });
      const dailyBreakdown = Object.entries(dailyCounts).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));
      return res.json({
        success: true,
        stats: { total: all.size, active, unsubscribed, bounced, recentCount, monthlyCount, dailyBreakdown, sourceBreakdown },
      });
    }

    if (action === 'list') {
      const snapshot = await col.get();
      let docs = snapshot.docs.map((d) => {
        const data = d.data();
        return { id: d.id, ...data, subscribed_at: data.subscribed_at?.toDate?.()?.toISOString?.() || data.subscribed_at };
      });
      if (status === 'unsubscribed') docs = docs.filter((d) => d.status === 'unsubscribed');
      else if (status === 'active') docs = docs.filter((d) => d.status !== 'unsubscribed');
      if (sourceFilter) {
        const src = (sourceFilter + '').toLowerCase().trim();
        docs = docs.filter((d) => {
          const s = (d.source || 'direct').toLowerCase();
          if (src === 'free-chapter') return s.includes('free') || s.includes('chapter') || s === 'starter-pack';
          if (src === 'starter-pack') return s.includes('starter');
          if (src === 'calculator') return s.includes('calc');
          if (src === 'homepage') return s.includes('home') || s.includes('homepage');
          return s.includes(src);
        });
      }
      if (search) {
        const s = search.toLowerCase();
        docs = docs.filter((d) => (d.email || '').toLowerCase().includes(s) || (d.firstName || '').toLowerCase().includes(s));
      }
      docs.sort((a, b) => (b.subscribed_at || '').localeCompare(a.subscribed_at || ''));
      const total = docs.length;
      const start = (page - 1) * perPage;
      const paginated = docs.slice(start, start + perPage);
      return res.json({ success: true, subscribers: paginated, total, totalPages: Math.ceil(total / perPage) });
    }

    if (action === 'export') {
      const snapshot = await col.get();
      let docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (status === 'unsubscribed') docs = docs.filter((d) => d.status === 'unsubscribed');
      else if (status === 'active') docs = docs.filter((d) => d.status !== 'unsubscribed');
      if (sourceFilter) {
        const src = (sourceFilter + '').toLowerCase().trim();
        docs = docs.filter((d) => {
          const s = (d.source || 'direct').toLowerCase();
          if (src === 'free-chapter') return s.includes('free') || s.includes('chapter') || s === 'starter-pack';
          if (src === 'starter-pack') return s.includes('starter');
          if (src === 'calculator') return s.includes('calc');
          if (src === 'homepage') return s.includes('home') || s.includes('homepage');
          return s.includes(src);
        });
      }
      const rows = [['email', 'firstName', 'source', 'status', 'subscribed_at']];
      docs.forEach((d) => {
        const subAt = d.subscribed_at?.toDate?.()?.toISOString?.() || d.subscribed_at || '';
        rows.push([d.email || '', d.firstName || '', d.source || '', d.status || 'subscribed', subAt]);
      });
      const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
      return res.json({ success: true, csv, count: docs.length });
    }

    if (action === 'update-status' && subscriberId && newStatus) {
      await col.doc(subscriberId).update({ status: newStatus, updated_at: admin.firestore.FieldValue.serverTimestamp() });
      return res.json({ success: true });
    }

    if (action === 'delete' && subscriberId) {
      await col.doc(subscriberId).delete();
      return res.json({ success: true });
    }

    return res.status(400).json({ error: 'Invalid action or parameters' });
  } catch (err) {
    console.error('Admin subscribers error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

// Admin campaigns API (send-campaign)
app.post('/api/admin/invoke', verifyAdminToken, async (req, res) => {
  const { function: fnName, body = {} } = req.body || {};
  try {
    if (fnName === 'send-campaign') {
      const { action, recipientFilter, selectedEmails, singleEmail, page, perPage, campaignId, subject, htmlBody, plainText, senderEmail, senderName } = body;
      if (action === 'preview-count') {
        let count;
        if (singleEmail && typeof singleEmail === 'string' && singleEmail.trim()) {
          count = 1;
        } else if (Array.isArray(selectedEmails) && selectedEmails.length > 0) {
          const seen = new Set();
          count = selectedEmails.filter((e) => {
            const email = (typeof e === 'string' ? e.trim().toLowerCase() : '');
            return email && !seen.has(email) && seen.add(email);
          }).length;
        } else {
          const recipients = await getCampaignRecipients(recipientFilter || 'all_active');
          count = recipients.length;
        }
        return res.json({ success: true, count });
      }
      if (action === 'send') {
        const result = await sendCampaign({
          subject,
          htmlBody,
          plainText,
          recipientFilter: recipientFilter || 'all_active',
          selectedEmails: Array.isArray(selectedEmails) ? selectedEmails : undefined,
          singleEmail: typeof singleEmail === 'string' ? singleEmail : undefined,
          senderEmail: senderEmail || 'noreply@buildwealththroughproperty.com',
          senderName: senderName || 'Build Wealth Through Property',
        });
        return res.json(result);
      }
      if (action === 'list') {
        const result = await listCampaigns(page || 1, perPage || 10);
        return res.json({ success: true, ...result });
      }
      if (action === 'delete' && campaignId) {
        await deleteCampaign(campaignId);
        return res.json({ success: true });
      }
      return res.status(400).json({ error: 'Invalid campaign action' });
    }

    if (fnName === 'email-funnel') {
      const { action, funnelId, name, description, trigger_on, trigger_filter, stepId, step_number, subject, html_body, delay_days, delay_hours, step_purpose, cta_url, cta_label, sender_name, sender_email, is_active, recipientFilter, chain_to_funnel_id } = body;
      if (action === 'list-funnels') {
        const result = await listFunnels();
        return res.json(result);
      }
      if (action === 'get-steps' && funnelId) {
        const result = await getSteps(funnelId);
        return res.json(result);
      }
      if (action === 'create-funnel') {
        const result = await createFunnel({ name, description, trigger_on, trigger_filter });
        return res.json(result);
      }
      if (action === 'delete-funnel' && funnelId) {
        await deleteFunnel(funnelId);
        return res.json({ success: true });
      }
      if (action === 'update-funnel' && funnelId) {
        const updates = {};
        if (typeof is_active === 'boolean') updates.is_active = is_active;
        if (chain_to_funnel_id !== undefined) updates.chain_to_funnel_id = chain_to_funnel_id || null;
        await updateFunnel(funnelId, updates);
        return res.json({ success: true });
      }
      if (action === 'save-step' && funnelId) {
        await saveStep({
          funnelId,
          stepId,
          step_number,
          subject,
          html_body,
          delay_days,
          delay_hours,
          step_purpose,
          cta_url,
          cta_label,
          sender_name,
          sender_email,
          is_active,
        });
        return res.json({ success: true });
      }
      if (action === 'delete-step' && stepId) {
        await deleteStep(stepId);
        return res.json({ success: true });
      }
      if (action === 'enroll-subscribers' && funnelId) {
        const result = await enrollSubscribers(funnelId, recipientFilter);
        return res.json(result);
      }
      if (action === 'process-funnel' && funnelId) {
        const result = await processFunnel(funnelId);
        return res.json(result);
      }
      if (action === 'funnel-analytics' && funnelId) {
        const result = await getFunnelAnalytics(funnelId);
        return res.json(result);
      }
      if (action === 'get-processor-status') {
        const result = await getProcessorStatus();
        return res.json(result);
      }
      return res.status(400).json({ error: 'Invalid funnel action' });
    }

    if (fnName === 'process-all-funnels') {
      const result = await processAllFunnels();
      return res.json(result);
    }

    if (fnName === 'analytics-dashboard') {
      const { action, days } = body;
      if (action === 'overview') {
        const result = await getAnalyticsOverview(days || 30);
        return res.json(result);
      }
      return res.status(400).json({ error: 'Invalid analytics action' });
    }

    if (fnName === 'ga4-analytics') {
      const { action, days } = body;
      if (action === 'report') {
        try {
          const result = await getGA4DashboardReport(days || 30);
          return res.json(result);
        } catch (err) {
          console.error('GA4 analytics error:', err);
          return res.status(500).json({
            success: false,
            error: err.message || 'Failed to fetch GA4 analytics. Ensure GA4_PROPERTY_ID and credentials are set.',
          });
        }
      }
      return res.status(400).json({ error: 'Invalid ga4-analytics action' });
    }

    if (fnName === 'admin-sales') {
      const { action } = body;
      if (action === 'overview') {
        const db = getFirestoreDb();
        const campaignsSnap = await db.collection('campaigns').get();
        const subsSnap = await db.collection('email_subscriptions').get();
        const activeSubs = subsSnap.docs.filter((d) => d.data().status !== 'unsubscribed').length;
        const foundationSnap = await db.collection('foundation_orders').get();
        let foundationRevenue = 0, foundationSold = 0;
        foundationSnap.docs.forEach((d) => {
          const o = d.data();
          if (o.status === 'paid') {
            foundationRevenue += (o.amount || 0) * (o.quantity || 1);
            foundationSold += o.quantity || 1;
          }
        });
        const funnelEnrollSnap = await db.collection('email_funnel_enrollments').get();
        let activeEnrollments = 0;
        funnelEnrollSnap.docs.forEach((d) => {
          if (d.data().status === 'active') activeEnrollments++;
        });
        const sales = {
          booksSold: 0,
          ticketsSold: 0,
          foundationSold,
          totalRevenue: foundationRevenue,
          bookRevenue: 0,
          seminarRevenue: 0,
          foundationRevenue,
          recentOrders: [],
          stripeConnected: !!process.env.STRIPE_SECRET_KEY,
          totalOrders: foundationSnap.size,
        };
        const siteMetrics = {
          subscribers: { total: subsSnap.size, active: activeSubs, recentWeek: 0 },
          blog: { total: 0, published: 0 },
          reviews: { total: 0, approved: 0, pending: 0, averageRating: 0 },
          courses: { conversions: 0 },
          funnels: { totalEnrollments: funnelEnrollSnap.size, activeEnrollments },
          campaigns: { total: campaignsSnap.size, sent: campaignsSnap.docs.filter((d) => d.data().status === 'sent' || d.data().status === 'partial').length },
          emailEvents: { total: 0 },
        };
        return res.json({ success: true, sales, siteMetrics });
      }
      return res.status(400).json({ error: 'Invalid sales action' });
    }

    // Not implemented
    res.status(501).json({
      success: false,
      error: 'This feature is being migrated to Firebase. Full functionality will be available soon.',
    });
  } catch (err) {
    console.error('Admin invoke error:', err);
    res.status(500).json({ success: false, error: err.message || 'Server error' });
  }
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error', 
    message: err.message 
  });
});

// Export app for Vercel serverless (api/catchall.js). Do not listen when on Vercel.
export default app;

if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log('\n🚀 ========================================');
    console.log('   Build Wealth Through Property Server');
    console.log('   Development Mode');
    console.log('========================================\n');
    console.log(`✅ Server running on: http://localhost:${PORT}`);
    console.log(`🌐 Frontend URL: ${FRONTEND_URL}`);
    console.log(`📧 Email service: ${process.env.EMAIL_HOST ? '✅ Configured' : '❌ Not configured'}`);
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (stripeKey) {
      const keyPreview = stripeKey.substring(0, 7) + '...' + stripeKey.substring(stripeKey.length - 4);
      console.log(`💳 Stripe service: ✅ Configured (${keyPreview})`);
    } else {
      console.log(`💳 Stripe service: ❌ Not configured`);
      console.log(`   ⚠️  Make sure STRIPE_SECRET_KEY is set in server/.env`);
    }
    const firebaseConfigured = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH ||
      process.env.FIREBASE_SERVICE_ACCOUNT ||
      process.env.FIREBASE_PROJECT_ID;
    console.log(`🔥 Firebase: ${firebaseConfigured ? '✅ Configured' : '❌ Not configured'}`);
    if (!firebaseConfigured) {
      console.log(`   ⚠️  Make sure Firebase credentials are set in server/.env`);
    }
    console.log('\n📋 Available endpoints:');
    console.log(`   GET  /health`);
    console.log(`   POST /api/send-email`);
    console.log(`   POST /api/create-payment-intent`);
    console.log(`   POST /api/create-checkout-session`);
    console.log(`   POST /api/stripe-webhook`);
    console.log(`   POST /api/send-payment-email`);
    console.log(`   POST /api/verify-payment (fallback if webhook fails)`);
    console.log(`   GET  /api/payment-status/:paymentIntentId`);
    console.log(`   POST /api/subscribe-email`);
    console.log('💡 See WEBHOOK_FAILURE_HANDLING.md for fallback mechanisms\n');
  });
}

