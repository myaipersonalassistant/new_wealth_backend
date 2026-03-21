import { sendEmail } from '../server/services/emailService.js';
import { findOrderBySessionId, findOrderByEmail, updateBookOrder } from '../server/services/firebaseService.js';

/**
 * Backup email endpoint - sends payment confirmation/failure emails
 * Can be called from frontend if webhook fails
 * POST /api/send-payment-email
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
    const { sessionId, email, type = 'success' } = req.body;

    if (!sessionId && !email) {
      return res.status(400).json({
        error: 'sessionId or email is required',
      });
    }

    // Find order
    let order = null;
    if (sessionId) {
      order = await findOrderBySessionId(sessionId);
    }
    
    if (!order && email) {
      // Try to find by email (most recent pending or paid order)
      order = await findOrderByEmail(email, 'pending') || await findOrderByEmail(email, 'paid');
    }

    if (!order) {
      return res.status(404).json({
        error: 'Order not found',
      });
    }

        // Check if email was already sent recently (prevent duplicates within 5 minutes)
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        if (order.email_sent_at && order.email_sent_type === type) {
          const sentAt = new Date(order.email_sent_at);
          if (sentAt > new Date(fiveMinutesAgo)) {
            console.log('Email already sent recently, skipping duplicate');
            res.setHeader('Access-Control-Allow-Origin', '*');
            return res.status(200).json({
              success: true,
              message: 'Email already sent',
              skipped: true,
            });
          }
        }

    const customerEmail = email || order.customer_email;
    const customerName = order.customer_name;

    if (type === 'success') {
      // Send success email
      try {
        await sendEmail({
          to: customerEmail,
          subject: 'Payment Confirmation - Build Wealth Through Property',
          template: 'paymentConfirmation',
          templateData: {
            name: customerName,
            productName: 'Build Wealth Through Property - Book',
            quantity: order.quantity,
            amount: order.total_amount.toFixed(2),
            orderId: order.id,
            transactionId: order.stripe_payment_intent_id || order.stripe_session_id || 'N/A',
            isBook: true,
            dashboardUrl: 'https://buildwealththroughproperty.com',
          },
        });

        // Update order to mark email as sent
        await updateBookOrder(order.id, {
          status: order.status !== 'paid' ? 'paid' : order.status,
          email_sent_at: new Date().toISOString(),
          email_sent_type: 'success',
        });

        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.status(200).json({
          success: true,
          message: 'Confirmation email sent successfully',
          orderId: order.id,
        });
      } catch (emailError) {
        console.error('Error sending success email:', emailError);
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.status(500).json({
          error: 'Failed to send email',
          message: emailError.message,
        });
      }
    } else if (type === 'failure') {
      // Send failure email
      try {
        await sendEmail({
          to: customerEmail,
          subject: 'Payment Issue - Build Wealth Through Property',
          template: 'paymentFailed',
          templateData: {
            name: customerName,
            productName: 'Build Wealth Through Property - Book',
            amount: order.total_amount.toFixed(2),
            reason: 'Payment was not completed',
            retryUrl: 'https://buildwealththroughproperty.com/book-purchase',
          },
        });

        // Update order to mark failure email as sent
        await updateBookOrder(order.id, {
          status: order.status === 'pending' ? 'cancelled' : order.status,
          email_sent_at: new Date().toISOString(),
          email_sent_type: 'failure',
        });

        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.status(200).json({
          success: true,
          message: 'Failure email sent successfully',
        });
      } catch (emailError) {
        console.error('Error sending failure email:', emailError);
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.status(500).json({
          error: 'Failed to send email',
          message: emailError.message,
        });
      }
    } else {
      return res.status(400).json({
        error: 'Invalid type. Must be "success" or "failure"',
      });
    }
  } catch (error) {
    console.error('Error in send-payment-email:', error);
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
}

