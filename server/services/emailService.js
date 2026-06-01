import nodemailer from 'nodemailer';

// Create reusable transporter with improved deliverability settings
const createTransporter = () => {
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD || process.env.EMAIL_PASS
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

  newUserWelcome: (data) => {
    const dashboardUrl = data.dashboardUrl || process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/dashboard` : 'https://new-wealth-frontend.vercel.app/dashboard';
    const name = data.name || 'there';
    const firstName = name.split(' ')[0] || name;
    return {
      subject: `Welcome aboard, ${firstName}! Your property journey starts here 🏠`,
      html: `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.7; color: #1e293b; margin: 0; padding: 0; background: #f8fafc; }
            .container { max-width: 560px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
            .hero { background: linear-gradient(135deg, #f59e0b 0%, #d97706 50%, #b45309 100%); color: white; padding: 48px 32px; text-align: center; position: relative; }
            .hero::after { content: ''; position: absolute; bottom: -1px; left: 0; right: 0; height: 24px; background: #fff; border-radius: 24px 24px 0 0; }
            .hero h1 { margin: 0; font-size: 26px; font-weight: 700; letter-spacing: -0.5px; }
            .hero .wave { font-size: 48px; margin-bottom: 8px; display: block; }
            .content { padding: 40px 32px; }
            .content p { margin: 0 0 18px; }
            .quote { background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-left: 4px solid #f59e0b; padding: 20px 24px; margin: 28px 0; border-radius: 0 12px 12px 0; font-style: italic; color: #78350f; }
            .steps { margin: 28px 0; padding: 0; list-style: none; }
            .steps li { display: flex; align-items: flex-start; gap: 16px; margin-bottom: 20px; padding: 16px; background: #f8fafc; border-radius: 12px; }
            .steps li .num { width: 32px; height: 32px; background: #f59e0b; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; flex-shrink: 0; }
            .steps li strong { display: block; margin-bottom: 4px; color: #0f172a; }
            .steps li span { color: #64748b; font-size: 14px; }
            .cta { text-align: center; margin: 36px 0 24px; }
            .button { display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #f59e0b, #d97706); color: white !important; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 16px; box-shadow: 0 4px 14px rgba(245, 158, 11, 0.4); transition: transform 0.2s; }
            .button:hover { transform: translateY(-2px); }
            .signature { margin-top: 32px; }
            .signature strong { display: block; color: #0f172a; }
            .signature span { color: #64748b; font-size: 14px; }
            .footer { background: #f1f5f9; padding: 24px 32px; font-size: 12px; color: #64748b; text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="hero">
              <span class="wave">👋</span>
              <h1>Welcome, ${firstName}!</h1>
              <p style="margin: 12px 0 0; opacity: 0.95; font-size: 16px;">You've just taken the first step toward building lasting wealth through property.</p>
            </div>
            <div class="content">
              <p>Hi ${name},</p>
              <p>Thanks for creating your account. Whether you're exploring your first investment or looking to grow an existing portfolio, you're in the right place.</p>
              <div class="quote">"The best time to plant a tree was 20 years ago. The second best time is now." — Your property journey starts the moment you decide to act.</div>
              <p><strong>Here's how to get the most from your dashboard:</strong></p>
              <ul class="steps">
                <li>
                  <span class="num">1</span>
                  <div>
                    <strong>Explore the Starter Pack</strong>
                    <span>Free videos, guides, and spreadsheets to help you think like an investor.</span>
                  </div>
                </li>
                <li>
                  <span class="num">2</span>
                  <div>
                    <strong>Check out the courses</strong>
                    <span>Structured learning from foundations to advanced strategies.</span>
                  </div>
                </li>
                <li>
                  <span class="num">3</span>
                  <div>
                    <strong>Run the numbers</strong>
                    <span>Use our calculator to model deals and see real projections.</span>
                  </div>
                </li>
              </ul>
              <div class="cta">
                <a href="${dashboardUrl}" class="button">Open My Dashboard →</a>
              </div>
              <div class="signature">
                <strong>Chris Ifonlaja</strong>
                <span>Author, Build Wealth Through Property</span>
              </div>
            </div>
            <div class="footer">
              <p>Build Wealth Through Property · You're receiving this because you created an account.</p>
            </div>
          </div>
        </body>
      </html>
      `,
      text: `Welcome, ${firstName}!\n\nHi ${name},\n\nThanks for creating your account. Whether you're exploring your first investment or looking to grow an existing portfolio, you're in the right place.\n\nHere's how to get started:\n1. Explore the Starter Pack - Free videos, guides, and spreadsheets.\n2. Check out the courses - Structured learning from foundations to advanced strategies.\n3. Run the numbers - Use our calculator to model deals.\n\nOpen your dashboard: ${dashboardUrl}\n\n— Chris Ifonlaja\nAuthor, Build Wealth Through Property`
    };
  },

  freeChapterWelcome: (data) => {
    const pdfUrl = data.pdfUrl || process.env.FREE_CHAPTER_PDF_URL || 'https://buildwealththroughproperty.com';
    return {
      subject: 'Your Free Chapter — Build Wealth Through Property',
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
            .button { display: inline-block; padding: 14px 28px; background: #f59e0b; color: white !important; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 10px 8px 10px 0; }
            .button-secondary { background: #1e293b; color: white !important; }
            .footer { background: #f9fafb; padding: 24px 30px; font-size: 12px; color: #6b7280; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Your Free Chapter is Ready</h1>
            </div>
            <div class="content">
              <p>Hi ${data.name || 'there'},</p>
              <p>Thanks for your interest in <strong>Build Wealth Through Property</strong>. Your free chapter and the "7 Questions to Ask Before Buying Your First Property" checklist are ready.</p>
              <p><a href="${pdfUrl}" class="button">View or Download the Free Chapter</a></p>
              <p>The chapter introduces the foundational principles of property wealth building. Enjoy the read.</p>
              <p>— Chris Ifonlaja</p>
            </div>
            <div class="footer">
              <p>Build Wealth Through Property · buildwealththroughproperty.com</p>
            </div>
          </div>
        </body>
      </html>
      `,
      text: `Your Free Chapter — Build Wealth Through Property\n\nHi ${data.name || 'there'},\n\nThanks for your interest. Your free chapter and the "7 Questions to Ask Before Buying Your First Property" checklist are ready.\n\nView or download: ${pdfUrl}\n\n— Chris Ifonlaja\n\nBuild Wealth Through Property`
    };
  },

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

  adminPaymentNotification: (data) => {
    const row = (label, value) =>
      value
        ? `<tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:13px;width:38%;vertical-align:top;"><strong>${label}</strong></td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#111827;font-size:14px;">${value}</td></tr>`
        : '';
    const fulfillment = data.fulfillmentNotes
      ? `<div style="background:#ecfdf5;border:1px solid #a7f3d0;border-left:4px solid #059669;padding:16px 18px;margin:20px 0;border-radius:4px;"><p style="margin:0 0 8px;font-weight:700;color:#065f46;">Fulfillment</p><p style="margin:0;font-size:14px;color:#047857;">${data.fulfillmentNotes}</p></div>`
      : '';
    return {
      subject: data.subject || `[New paid order] ${data.productLabel || 'Order'} — ${data.customerName || 'Customer'}`,
      html: `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>New payment received</title>
        </head>
        <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;line-height:1.5;color:#1f2937;margin:0;padding:0;background:#f3f4f6;">
          <div style="max-width:640px;margin:0 auto;background:#fff;">
            <div style="background:linear-gradient(135deg,#1e3a5f,#0f172a);color:#fff;padding:28px 24px;">
              <p style="margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;opacity:0.85;">Build Wealth Through Property</p>
              <h1 style="margin:0;font-size:22px;font-weight:700;">New successful payment</h1>
              <p style="margin:10px 0 0;font-size:14px;opacity:0.9;">You can fulfil this order from the details below — no need to open the admin panel.</p>
            </div>
            <div style="padding:28px 24px;">
              <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
                <tbody>
                  ${row('Product', data.productName)}
                  ${row('Order type', data.productLabel)}
                  ${row('Amount paid', data.amountPaid ? `£${data.amountPaid}` : '')}
                  ${row('Quantity', data.quantity != null ? String(data.quantity) : '')}
                  ${row('Unit price', data.unitPrice ? `£${data.unitPrice}` : '')}
                  ${row('Paid at', data.paidAt)}
                  ${row('Order ID', data.orderId)}
                  ${row('Stripe session', data.stripeSessionId)}
                  ${row('Payment reference', data.transactionId)}
                </tbody>
              </table>
              <h2 style="font-size:16px;margin:28px 0 12px;color:#111827;">Customer</h2>
              <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
                <tbody>
                  ${row('Name', data.customerName)}
                  ${row('Email', data.customerEmail ? `<a href="mailto:${data.customerEmail}" style="color:#d97706;">${data.customerEmail}</a>` : '')}
                  ${row('Phone', data.customerPhone)}
                  ${row('Firebase user', data.userId)}
                </tbody>
              </table>
              ${data.shippingBlock ? `
              <h2 style="font-size:16px;margin:28px 0 12px;color:#111827;">Shipping address</h2>
              <div style="background:#f9fafb;border:1px solid #e5e7eb;border-left:4px solid #f59e0b;padding:16px 18px;border-radius:4px;font-size:14px;white-space:pre-line;">${data.shippingBlock}</div>
              ` : ''}
              ${data.courseBlock ? `
              <h2 style="font-size:16px;margin:28px 0 12px;color:#111827;">Course access</h2>
              <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
                <tbody>
                  ${row('Course', data.courseTitle)}
                  ${row('Course ID', data.courseId)}
                </tbody>
              </table>
              ` : ''}
              ${fulfillment}
              <p style="margin:24px 0 0;font-size:13px;color:#6b7280;">Customer confirmation email is sent automatically. This alert is for your records and fulfilment.</p>
            </div>
            <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 24px;font-size:12px;color:#6b7280;">
              Automated admin alert · Build Wealth Through Property
            </div>
          </div>
        </body>
      </html>
    `,
      text: `NEW SUCCESSFUL PAYMENT — Build Wealth Through Property

Product: ${data.productName || ''}
Type: ${data.productLabel || ''}
Amount: £${data.amountPaid || '0.00'}
Quantity: ${data.quantity ?? 1}
Paid at: ${data.paidAt || ''}

CUSTOMER
Name: ${data.customerName || ''}
Email: ${data.customerEmail || ''}
Phone: ${data.customerPhone || '—'}
${data.userId ? `User ID: ${data.userId}\n` : ''}

${data.shippingBlock ? `SHIPPING\n${data.shippingBlock.replace(/<br\\/?>/gi, '\n')}\n\n` : ''}${data.courseBlock ? `COURSE: ${data.courseTitle || ''} (${data.courseId || ''})\n\n` : ''}${data.fulfillmentNotes ? `FULFILLMENT: ${data.fulfillmentNotes}\n\n` : ''}ORDER ID: ${data.orderId || '—'}
Stripe session: ${data.stripeSessionId || '—'}
Payment ref: ${data.transactionId || '—'}
`,
    };
  },

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
 * @param {string} [options.template] - Template name (welcome, paymentConfirmation, adminPaymentNotification, contactForm)
 * @param {Object} [options.templateData] - Data for template
 * @returns {Promise<Object>} - Result with messageId
 */
export const sendEmail = async ({ to, subject, text, html, template, templateData = {} }) => {
  // Validate required fields
  if (!to) {
    throw new Error('to is required');
  }

  // Check if email service is configured
  const emailPass = process.env.EMAIL_PASSWORD || process.env.EMAIL_PASS;
  if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !emailPass) {
    throw new Error('Email service is not configured. Please set EMAIL_HOST, EMAIL_USER, and EMAIL_PASSWORD (or EMAIL_PASS) environment variables.');
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

