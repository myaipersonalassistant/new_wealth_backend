import { sendEmail } from '../server/services/emailService.js';

/**
 * Send email endpoint
 * POST /api/send-email
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

    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json({ 
      success: true, 
      message: 'Email sent successfully',
      messageId: result.messageId 
    });
  } catch (error) {
    console.error('Error sending email:', error);
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(500).json({ 
      error: 'Failed to send email', 
      message: error.message 
    });
  }
}

