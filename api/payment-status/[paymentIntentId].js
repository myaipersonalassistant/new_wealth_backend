import { getPaymentStatus } from '../../../server/services/stripeService.js';

/**
 * Get payment status
 * GET /api/payment-status/:paymentIntentId
 */
export default async function handler(req, res) {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { paymentIntentId } = req.query;

    if (!paymentIntentId) {
      return res.status(400).json({ 
        error: 'Missing paymentIntentId parameter' 
      });
    }

    const status = await getPaymentStatus(paymentIntentId);
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json({ success: true, status });
  } catch (error) {
    console.error('Error getting payment status:', error);
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(500).json({ 
      error: 'Failed to get payment status', 
      message: error.message 
    });
  }
}

