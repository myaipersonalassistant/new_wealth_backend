import nodemailer from 'nodemailer';

// Create reusable transporter with improved deliverability settings
const createTransporter = () => {
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    },
    // Connection timeout settings (increased for slow networks)
    connectionTimeout: 30000, // 30 seconds
    greetingTimeout: 30000, // 30 seconds
    socketTimeout: 30000, // 30 seconds
    // Additional connection options
    requireTLS: process.env.EMAIL_PORT === '465',
    debug: process.env.NODE_ENV === 'development', // Enable debug logging in dev
    // TLS: use secure defaults for better deliverability (rejectUnauthorized: true validates certs)
    tls: {
      rejectUnauthorized: process.env.NODE_ENV !== 'development',
      minVersion: 'TLSv1.2'
    },
    // Connection pooling for better performance
    pool: false, // Disable pooling to avoid connection issues
    // Retry settings
    retry: {
      attempts: 3,
      delay: 2000 // 2 seconds between retries
    }
  });

  // Verify connection on creation (non-blocking)
  transporter.verify((error) => {
    if (error) {
      console.error('Email transporter verification failed:', error.message);
      console.error('   This is non-critical - emails will still be attempted');
    } else {
      console.log('✅ Email transporter verified successfully');
    }
  });

  return transporter;
};

// Email templates
const templates = {
  welcome: (data) => ({
    subject: 'Welcome to Build Wealth Through Property!',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #f59e0b, #d97706); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; padding: 12px 24px; background: #f59e0b; color: white; text-decoration: none; border-radius: 6px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome to Build Wealth Through Property!</h1>
            </div>
            <div class="content">
              <p>Hi ${data.name || 'there'},</p>
              <p>Thank you for joining Build Wealth Through Property. We're excited to help you on your property investment journey!</p>
              <p>Get started by exploring our resources and courses.</p>
              <a href="${data.dashboardUrl || 'https://buildwealththroughproperty.com/dashboard'}" class="button">Go to Dashboard</a>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `Welcome to Build Wealth Through Property!\n\nHi ${data.name || 'there'},\n\nThank you for joining Build Wealth Through Property. We're excited to help you on your property investment journey!\n\nGet started by exploring our resources and courses.`
  }),

  starterPackWelcome: (data) => {
    const downloadUrl = data.downloadUrl || process.env.STARTER_PACK_DOWNLOAD_URL || 'https://buildwealththroughproperty.com/auth?redirect=/dashboard?tab=starter-pack';
    return {
      subject: 'Your Free Property Investor Starter Pack is Ready!',
      html: `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; background: #f3f4f6; }
            .container { max-width: 600px; margin: 0 auto; background: #fff; }
            .header { background: linear-gradient(135deg, #f59e0b, #d97706); color: white; padding: 40px 30px; text-align: center; }
            .header h1 { margin: 0; font-size: 24px; }
            .content { padding: 40px 30px; }
            .button { display: inline-block; padding: 14px 28px; background: #f59e0b; color: white !important; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; }
            ul { margin: 20px 0; padding-left: 24px; }
            li { margin: 10px 0; }
            .footer { background: #f9fafb; padding: 24px 30px; font-size: 12px; color: #6b7280; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Your Starter Pack is Ready!</h1>
            </div>
            <div class="content">
              <p>Hi ${data.name || 'there'},</p>
              <p>Thanks for signing up. Here's what you've got in your <strong>Property Investor Starter Pack</strong>:</p>
              <ul>
                <li>Free Chapter from Build Wealth Through Property</li>
                <li>7 Questions to Ask Before Buying Your First Property (checklist)</li>
                <li>Deal Analyser Spreadsheet</li>
                <li>Viewing Checklist</li>
                <li>Mortgage Readiness Guide</li>
                <li>First-Time Investor Checklist</li>
              </ul>
              <p><a href="${downloadUrl}" class="button">Download Your Starter Pack</a></p>
              <p>Over the next few days, I'll send short, practical guidance to help you take the next steps. No hype — just clarity.</p>
              <p>— Chris Ifonlaja</p>
            </div>
            <div class="footer">
              <p>Build Wealth Through Property · Property investment education</p>
              <p><a href="https://buildwealththroughproperty.com">buildwealththroughproperty.com</a></p>
            </div>
          </div>
        </body>
      </html>
      `,
      text: `Your Starter Pack is Ready!\n\nHi ${data.name || 'there'},\n\nThanks for signing up. Your Property Investor Starter Pack includes:\n\n• Free Chapter from Build Wealth Through Property\n• 7 Questions to Ask Before Buying (checklist)\n• Deal Analyser Spreadsheet\n• Viewing Checklist\n• Mortgage Readiness Guide\n• First-Time Investor Checklist\n\nDownload: ${downloadUrl}\n\nOver the next few days I'll send short, practical guidance. No hype — just clarity.\n\n— Chris Ifonlaja\n\nBuild Wealth Through Property\nbuildwealththroughproperty.com`
    };
  },

  paymentConfirmation: (data) => ({
    subject: data.isSeminar ? 'Seminar Booking Confirmed — Build Wealth Through Property' : 'Order Confirmation - Your Book Purchase',
    html: `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="X-UA-Compatible" content="IE=edge">
          <title>Order Confirmation</title>
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; 
              line-height: 1.6; 
              color: #1f2937; 
              margin: 0;
              padding: 0;
              background-color: #f3f4f6;
            }
            .email-wrapper { 
              max-width: 600px; 
              margin: 0 auto; 
              background-color: #ffffff;
            }
            .header { 
              background: linear-gradient(135deg, #f59e0b, #d97706); 
              color: #ffffff; 
              padding: 40px 30px; 
              text-align: center;
            }
            .header h1 {
              margin: 0;
              font-size: 24px;
              font-weight: 700;
            }
            .content { 
              padding: 40px 30px; 
            }
            .greeting {
              font-size: 16px;
              margin-bottom: 20px;
            }
            .info-box { 
              background: #f9fafb; 
              border: 1px solid #e5e7eb;
              border-left: 4px solid #f59e0b; 
              padding: 20px; 
              margin: 25px 0; 
              border-radius: 4px;
            }
            .info-box p {
              margin: 8px 0;
              font-size: 14px;
            }
            .info-box strong {
              color: #1f2937;
            }
            .button { 
              display: inline-block; 
              padding: 14px 28px; 
              background: #f59e0b; 
              color: #ffffff; 
              text-decoration: none; 
              border-radius: 6px; 
              margin: 25px 0;
              font-weight: 600;
              font-size: 15px;
            }
            .button:hover {
              background: #d97706;
            }
            .footer {
              background: #f9fafb;
              border-top: 1px solid #e5e7eb;
              padding: 30px;
              font-size: 12px;
              color: #6b7280;
              line-height: 1.8;
            }
            .footer a {
              color: #f59e0b;
              text-decoration: none;
            }
            .footer-address {
              margin-top: 15px;
              padding-top: 15px;
              border-top: 1px solid #e5e7eb;
            }
            ul {
              margin: 15px 0;
              padding-left: 20px;
            }
            li {
              margin: 8px 0;
              font-size: 14px;
            }
            @media only screen and (max-width: 600px) {
              .content { padding: 30px 20px; }
              .header { padding: 30px 20px; }
            }
          </style>
        </head>
        <body>
          <div class="email-wrapper">
            <div class="header">
              <h1>${data.isSeminar ? 'Seminar Booking Confirmed' : 'Order Confirmation'}</h1>
            </div>
            <div class="content">
              <p class="greeting">Dear ${data.name || 'Customer'},</p>
              
              <p>Thank you for your purchase. Your payment has been successfully processed and your order is confirmed.</p>
              
              <div class="info-box">
                <p><strong>Order Details:</strong></p>
                <p><strong>Product:</strong> ${data.productName || 'Build Wealth Through Property - Book'}</p>
                <p><strong>Quantity:</strong> ${data.quantity || 1}</p>
                <p><strong>Total Amount:</strong> £${data.amount || '0.00'}</p>
                ${data.orderId ? `<p><strong>Order Number:</strong> ${data.orderId}</p>` : ''}
                ${data.transactionId ? `<p><strong>Transaction Reference:</strong> ${data.transactionId}</p>` : ''}
              </div>
              
              ${data.isBook ? `
                <p><strong>What happens next?</strong></p>
                <ul>
                  <li>Your book will be dispatched within 1 to 3 business days</li>
                  <li>You will receive a shipping notification email with tracking details</li>
                  <li>All proceeds from this purchase go to Place of Victory Charity</li>
                </ul>
              ` : ''}
              ${data.isSeminar ? `
                <p><strong>Event Details:</strong></p>
                <ul>
                  <li><strong>Date:</strong> ${data.seminarDate || 'Saturday, 14 March 2026'}</li>
                  <li><strong>Time:</strong> ${data.seminarTime || '2:00 PM – 5:00 PM'}</li>
                  <li><strong>Venue:</strong> ${data.seminarVenue || 'Europa Hotel, Great Victoria Street, Belfast BT2 7AP'}</li>
                </ul>
                <p>Please bring a copy of this confirmation (or show it on your phone) when you arrive. We look forward to seeing you there!</p>
              ` : ''}
              
              <p>If you have any questions about your order, please contact us at <a href="mailto:support@buildwealththroughproperty.com" style="color: #f59e0b;">support@buildwealththroughproperty.com</a></p>
              
              <a href="${data.dashboardUrl || 'https://buildwealththroughproperty.com'}" class="button">Visit Our Website</a>
            </div>
            
            <div class="footer">
              <p><strong>Build Wealth Through Property</strong></p>
              <p>Property investment education and resources</p>
              <div class="footer-address">
                <p><strong>Contact Information:</strong></p>
                <p>Email: <a href="mailto:support@buildwealththroughproperty.com">support@buildwealththroughproperty.com</a></p>
                <p>Website: <a href="https://buildwealththroughproperty.com">buildwealththroughproperty.com</a></p>
                <p style="margin-top: 15px;"><strong>Business Address:</strong><br>
                Build Wealth Through Property<br>
                London, United Kingdom</p>
              </div>
              <p style="margin-top: 20px; font-size: 11px; color: #9ca3af;">
                This is an automated email. Please do not reply directly to this message. 
                If you need assistance, contact us at support@buildwealththroughproperty.com
              </p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `Order Confirmation - Build Wealth Through Property

Dear ${data.name || 'Customer'},

Thank you for your purchase. Your payment has been successfully processed and your order is confirmed.

ORDER DETAILS:
Product: ${data.productName || 'Build Wealth Through Property - Book'}
Quantity: ${data.quantity || 1}
Total Amount: £${data.amount || '0.00'}
${data.orderId ? `Order Number: ${data.orderId}\n` : ''}${data.transactionId ? `Transaction Reference: ${data.transactionId}\n` : ''}

${data.isBook ? `WHAT HAPPENS NEXT:
- Your book will be dispatched within 1 to 3 business days
- You will receive a shipping notification email with tracking details
- All proceeds from this purchase go to Place of Victory Charity

` : ''}${data.isSeminar ? `EVENT DETAILS:
- Date: ${data.seminarDate || 'Saturday, 14 March 2026'}
- Time: ${data.seminarTime || '2:00 PM – 5:00 PM'}
- Venue: ${data.seminarVenue || 'Europa Hotel, Great Victoria Street, Belfast BT2 7AP'}

Please bring this confirmation when you arrive. We look forward to seeing you there!

` : ''}If you have any questions about your order, please contact us at support@buildwealththroughproperty.com

Visit our website: ${data.dashboardUrl || 'https://buildwealththroughproperty.com'}

---
Build Wealth Through Property
Property investment education and resources

Contact Information:
Email: support@buildwealththroughproperty.com
Website: buildwealththroughproperty.com

Business Address:
Build Wealth Through Property
London, United Kingdom

This is an automated email. Please do not reply directly to this message.
If you need assistance, contact us at support@buildwealththroughproperty.com`
  }),

  paymentFailed: (data) => ({
    subject: 'Payment Not Completed - Action Required',
    html: `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="X-UA-Compatible" content="IE=edge">
          <title>Payment Not Completed</title>
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; 
              line-height: 1.6; 
              color: #1f2937; 
              margin: 0;
              padding: 0;
              background-color: #f3f4f6;
            }
            .email-wrapper { 
              max-width: 600px; 
              margin: 0 auto; 
              background-color: #ffffff;
            }
            .header { 
              background: linear-gradient(135deg, #dc2626, #b91c1c); 
              color: #ffffff; 
              padding: 40px 30px; 
              text-align: center;
            }
            .header h1 {
              margin: 0;
              font-size: 24px;
              font-weight: 700;
            }
            .content { 
              padding: 40px 30px; 
            }
            .greeting {
              font-size: 16px;
              margin-bottom: 20px;
            }
            .info-box { 
              background: #fef2f2; 
              border: 1px solid #fecaca;
              border-left: 4px solid #dc2626; 
              padding: 20px; 
              margin: 25px 0; 
              border-radius: 4px;
            }
            .info-box p {
              margin: 8px 0;
              font-size: 14px;
            }
            .help-box { 
              background: #fffbeb; 
              border: 1px solid #fde68a;
              padding: 20px; 
              margin: 25px 0;
              border-radius: 4px;
            }
            .help-box ul {
              margin: 10px 0;
              padding-left: 20px;
            }
            .help-box li {
              margin: 6px 0;
              font-size: 14px;
            }
            .button { 
              display: inline-block; 
              padding: 14px 28px; 
              background: #f59e0b; 
              color: #ffffff; 
              text-decoration: none; 
              border-radius: 6px; 
              margin: 25px 0;
              font-weight: 600;
              font-size: 15px;
            }
            .button:hover {
              background: #d97706;
            }
            .footer {
              background: #f9fafb;
              border-top: 1px solid #e5e7eb;
              padding: 30px;
              font-size: 12px;
              color: #6b7280;
              line-height: 1.8;
            }
            .footer a {
              color: #f59e0b;
              text-decoration: none;
            }
            .footer-address {
              margin-top: 15px;
              padding-top: 15px;
              border-top: 1px solid #e5e7eb;
            }
            ul {
              margin: 15px 0;
              padding-left: 20px;
            }
            li {
              margin: 8px 0;
              font-size: 14px;
            }
            @media only screen and (max-width: 600px) {
              .content { padding: 30px 20px; }
              .header { padding: 30px 20px; }
            }
          </style>
        </head>
        <body>
          <div class="email-wrapper">
            <div class="header">
              <h1>Payment Not Completed</h1>
            </div>
            <div class="content">
              <p class="greeting">Dear ${data.name || 'Customer'},</p>
              
              <p>We noticed that your payment attempt for <strong>${data.productName || 'Build Wealth Through Property - Book'}</strong> was not completed.</p>
              
              <div class="info-box">
                <p><strong>Order Details:</strong></p>
                <p><strong>Product:</strong> ${data.productName || 'Build Wealth Through Property - Book'}</p>
                <p><strong>Amount:</strong> £${data.amount || '0.00'}</p>
                ${data.reason ? `<p><strong>Status:</strong> ${data.reason}</p>` : ''}
              </div>
              
              <div class="help-box">
                <p><strong>Common reasons for payment issues:</strong></p>
                <ul>
                  <li>Insufficient funds in your account</li>
                  <li>Card declined by your bank for security reasons</li>
                  <li>Incorrect card number, expiry date, or CVV code</li>
                  <li>Card has expired</li>
                  <li>Daily spending limit reached</li>
                </ul>
              </div>
              
              <p><strong>What you can do:</strong></p>
              <ul>
                <li>Try again with the same or a different payment method</li>
                <li>Contact your bank to ensure your card is active and has sufficient funds</li>
                <li>Verify your card details are correct</li>
                <li>Reach out to us if you need assistance with your order</li>
              </ul>
              
              <a href="${data.retryUrl || 'https://buildwealththroughproperty.com/book-purchase'}" class="button">Complete Your Purchase</a>
              
              <p>If you continue to experience issues, please contact us at <a href="mailto:support@buildwealththroughproperty.com" style="color: #f59e0b;">support@buildwealththroughproperty.com</a> and we will be happy to help.</p>
            </div>
            
            <div class="footer">
              <p><strong>Build Wealth Through Property</strong></p>
              <p>Property investment education and resources</p>
              <div class="footer-address">
                <p><strong>Contact Information:</strong></p>
                <p>Email: <a href="mailto:support@buildwealththroughproperty.com">support@buildwealththroughproperty.com</a></p>
                <p>Website: <a href="https://buildwealththroughproperty.com">buildwealththroughproperty.com</a></p>
                <p style="margin-top: 15px;"><strong>Business Address:</strong><br>
                Build Wealth Through Property<br>
                London, United Kingdom</p>
              </div>
              <p style="margin-top: 20px; font-size: 11px; color: #9ca3af;">
                This is an automated email. Please do not reply directly to this message. 
                If you need assistance, contact us at support@buildwealththroughproperty.com
              </p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `Payment Not Completed - Action Required

Dear ${data.name || 'Customer'},

We noticed that your payment attempt for ${data.productName || 'Build Wealth Through Property - Book'} was not completed.

ORDER DETAILS:
Product: ${data.productName || 'Build Wealth Through Property - Book'}
Amount: £${data.amount || '0.00'}
${data.reason ? `Status: ${data.reason}\n` : ''}

COMMON REASONS FOR PAYMENT ISSUES:
- Insufficient funds in your account
- Card declined by your bank for security reasons
- Incorrect card number, expiry date, or CVV code
- Card has expired
- Daily spending limit reached

WHAT YOU CAN DO:
- Try again with the same or a different payment method
- Contact your bank to ensure your card is active and has sufficient funds
- Verify your card details are correct
- Reach out to us if you need assistance with your order

Complete your purchase: ${data.retryUrl || 'https://buildwealththroughproperty.com/book-purchase'}

If you continue to experience issues, please contact us at support@buildwealththroughproperty.com and we will be happy to help.

---
Build Wealth Through Property
Property investment education and resources

Contact Information:
Email: support@buildwealththroughproperty.com
Website: buildwealththroughproperty.com

Business Address:
Build Wealth Through Property
London, United Kingdom

This is an automated email. Please do not reply directly to this message.
If you need assistance, contact us at support@buildwealththroughproperty.com`
  }),

  contactForm: (data) => ({
    subject: `Contact Form Submission from ${data.name}`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .content { background: #f9fafb; padding: 30px; border-radius: 8px; }
            .field { margin: 15px 0; }
            .label { font-weight: bold; color: #f59e0b; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="content">
              <h2>New Contact Form Submission</h2>
              <div class="field">
                <span class="label">Name:</span> ${data.name}
              </div>
              <div class="field">
                <span class="label">Email:</span> ${data.email}
              </div>
              <div class="field">
                <span class="label">Message:</span>
                <p>${data.message}</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `New Contact Form Submission\n\nName: ${data.name}\nEmail: ${data.email}\nMessage: ${data.message}`
  })
};

/**
 * Send an email
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject
 * @param {string} [options.text] - Plain text version
 * @param {string} [options.html] - HTML version
 * @param {string} [options.template] - Template name (welcome, paymentConfirmation, contactForm)
 * @param {Object} [options.templateData] - Data for template
 * @returns {Promise<Object>} - Result with messageId
 */
export const sendEmail = async ({ to, subject, text, html, template, templateData = {} }) => {
  // Validate required fields
  if (!to) {
    throw new Error('to is required');
  }

  // Check if email service is configured
  if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
    throw new Error('Email service is not configured. Please set EMAIL_HOST, EMAIL_USER, and EMAIL_PASSWORD environment variables.');
  }

  // Use template if provided
  if (template && templates[template]) {
    const templateContent = templates[template](templateData);
    subject = subject || templateContent.subject;
    html = html || templateContent.html;
    text = text || templateContent.text;
  }

  if (!subject) {
    throw new Error('subject is required (or use a template that provides it)');
  }

  // Create transporter
  const transporter = createTransporter();

  // Parse sending domain from EMAIL_USER (e.g. noreply@domain.com -> domain.com)
  const fromDomain = (process.env.EMAIL_USER || '').split('@')[1] || 'buildwealththroughproperty.com';

  // Email options - transactional-friendly headers (avoid spam triggers)
  const mailOptions = {
    from: `"Build Wealth Through Property" <${process.env.EMAIL_USER}>`,
    replyTo: process.env.EMAIL_REPLY_TO || 'support@buildwealththroughproperty.com',
    to,
    subject,
    text: text || (html ? html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : ''),
    html,
    // Headers for transactional deliverability (avoid bulk/marketing headers)
    headers: {
      'X-Mailer': 'Build Wealth Through Property',
      'X-Priority': '3',
      'Importance': 'normal',
      'Auto-Submitted': 'auto-generated', // RFC 3834: expected automated message
      'X-Auto-Response-Suppress': 'OOF, AutoReply',
    },
    messageId: `<${Date.now()}.${Math.random().toString(36).substring(2, 11)}@${fromDomain}>`,
    date: new Date(),
  };

  // Send email with retry logic
  let lastError;
  let currentTransporter = transporter; // Use a variable instead of const
  const maxRetries = 3;
  const retryDelay = 2000; // 2 seconds

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const info = await currentTransporter.sendMail(mailOptions);
      console.log(`✅ Email sent successfully (attempt ${attempt}/${maxRetries}):`, info.messageId);
      return { messageId: info.messageId, response: info.response };
    } catch (error) {
      lastError = error;
      console.error(`❌ Email send attempt ${attempt}/${maxRetries} failed:`, error.message);
      
      // If it's a connection/timeout error and we have retries left, wait and retry
      if (attempt < maxRetries && (
        error.code === 'ETIMEDOUT' || 
        error.code === 'ESOCKET' || 
        error.code === 'ECONNREFUSED' ||
        error.code === 'ETIMEOUT' ||
        error.message?.includes('timeout') ||
        error.message?.includes('Connection timeout')
      )) {
        const delay = retryDelay * attempt; // Exponential backoff
        console.log(`   Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Create a new transporter for retry (in case connection is stale)
        console.log('   Creating new transporter for retry...');
        currentTransporter = createTransporter();
      } else {
        // Not a retryable error or out of retries
        throw error;
      }
    }
  }

  // If we get here, all retries failed
  throw new Error(`Failed to send email after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
};

/**
 * Verify email configuration
 * @returns {Promise<boolean>} - True if configuration is valid
 */
export const verifyEmailConfig = async () => {
  try {
    const transporter = createTransporter();
    await transporter.verify();
    console.log('✅ Email service is configured correctly');
    return true;
  } catch (error) {
    console.error('❌ Email service configuration error:', error.message);
    return false;
  }
};

