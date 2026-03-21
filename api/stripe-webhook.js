import { handleWebhook } from '../server/services/stripeService.js';
import { sendEmail } from '../server/services/emailService.js';
import { updateBookOrder, findOrderBySessionId, findOrderByEmail } from '../server/services/firebaseService.js';

/**
 * Stripe webhook endpoint
 * POST /api/stripe-webhook
 * 
 * Note: This endpoint must receive raw body for signature verification
 * Vercel serverless functions receive the body as-is when bodyParser is disabled
 */
export const config = {
  api: {
    bodyParser: false, // Disable body parsing, we need raw body for webhook verification
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'];
  
  if (!sig) {
    return res.status(400).json({ error: 'Missing stripe-signature header' });
  }

  try {
    // In Vercel, when bodyParser is false, req.body should be a Buffer
    // However, we need to handle it properly
    let rawBody;
    
    if (Buffer.isBuffer(req.body)) {
      rawBody = req.body;
    } else if (typeof req.body === 'string') {
      rawBody = Buffer.from(req.body);
    } else {
      // If body is already parsed, we need to reconstruct it
      // This shouldn't happen with bodyParser: false, but handle it anyway
      const bodyString = typeof req.body === 'object' 
        ? JSON.stringify(req.body) 
        : String(req.body || '');
      rawBody = Buffer.from(bodyString);
    }

    const event = await handleWebhook(rawBody, sig);
    
    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        console.log('Checkout session completed:', session.id);

        // Update order in Firestore
        try {
          let order = await findOrderBySessionId(session.id);
          
          // If not found by session ID, try to find by email
          if (!order && session.customer_email) {
            order = await findOrderByEmail(session.customer_email, 'pending');
          }

          if (order) {
            // Update order status
            await updateBookOrder(order.id, {
              status: 'paid',
              stripe_session_id: session.id,
              stripe_payment_intent_id: session.payment_intent || null,
              email_sent_at: new Date().toISOString(),
              email_sent_type: 'success',
            });

            // Send confirmation email
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
                  dashboardUrl: 'https://buildwealththroughproperty.com',
                },
              });
              console.log('Confirmation email sent to:', session.customer_email || order.customer_email);
            } catch (emailError) {
              console.error('Error sending confirmation email:', emailError);
              // Don't fail the webhook if email fails
            }
          } else {
            console.warn('Order not found for session:', session.id);
          }
        } catch (dbError) {
          console.error('Error updating order:', dbError);
          // Continue - don't fail the webhook
        }
        break;
      }

      case 'checkout.session.async_payment_failed': {
        const session = event.data.object;
        console.log('Checkout session payment failed:', session.id);

        // Update order status and send failure email
        try {
          let order = await findOrderBySessionId(session.id);
          
          if (!order && session.customer_email) {
            order = await findOrderByEmail(session.customer_email, 'pending');
          }

          if (order) {
            // Update order status
            await updateBookOrder(order.id, {
              status: 'cancelled',
              stripe_session_id: session.id,
              email_sent_at: new Date().toISOString(),
              email_sent_type: 'failure',
            });

            // Send failure email
            try {
              await sendEmail({
                to: session.customer_email || order.customer_email,
                subject: 'Payment Issue - Build Wealth Through Property',
                template: 'paymentFailed',
                templateData: {
                  name: order.customer_name || session.customer_details?.name,
                  productName: 'Build Wealth Through Property - Book',
                  amount: order.total_amount.toFixed(2),
                  reason: session.payment_status === 'unpaid' ? 'Payment was not completed' : 'Payment failed',
                  retryUrl: 'https://buildwealththroughproperty.com/book-purchase',
                },
              });
              console.log('Failure email sent to:', session.customer_email || order.customer_email);
            } catch (emailError) {
              console.error('Error sending failure email:', emailError);
            }
          }
        } catch (dbError) {
          console.error('Error handling failed payment:', dbError);
        }
        break;
      }

      case 'payment_intent.succeeded':
        console.log('Payment intent succeeded:', event.data.object.id);
        // This is handled by checkout.session.completed for checkout sessions
        break;

      case 'payment_intent.payment_failed':
        console.log('Payment intent failed:', event.data.object.id);
        // This is handled by checkout.session.async_payment_failed for checkout sessions
        break;

      case 'charge.refunded':
        console.log('Charge refunded:', event.data.object.id);
        // Handle refunds if needed
        try {
          const charge = event.data.object;
          const paymentIntentId = charge.payment_intent;
          
          // Find order by payment intent ID and update status
          // You would need to add a function to find by payment_intent_id
          // For now, just log it
          console.log('Refund processed for payment intent:', paymentIntentId);
        } catch (error) {
          console.error('Error handling refund:', error);
        }
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(400).json({ 
      error: 'Webhook Error', 
      message: error.message 
    });
  }
}
