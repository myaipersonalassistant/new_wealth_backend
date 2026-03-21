# Build Wealth Through Property - Local Development Server

A Node.js Express server for handling email sending and Stripe payments during local development.

## Quick Start

1. **Install dependencies:**
   ```bash
   cd server
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env
   ```
   Then edit `.env` with your actual credentials.

3. **Start the server:**
   ```bash
   npm run dev
   # or
   npm start
   ```

The server will start on `http://localhost:3001` by default.

## Environment Variables

### Required

- `EMAIL_HOST` - SMTP server host (e.g., `smtp.gmail.com`)
- `EMAIL_USER` - Your email address
- `EMAIL_PASSWORD` - Your email password or app password
- `STRIPE_SECRET_KEY` - Your Stripe secret key (use test key for development)
- `FIREBASE_SERVICE_ACCOUNT_KEY_PATH` - Path to Firebase service account JSON (or use `FIREBASE_SERVICE_ACCOUNT` / `FIREBASE_PROJECT_ID` + `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY`)

### Optional

- `PORT` - Server port (default: 3001)
- `FRONTEND_URL` - Frontend URL (default: http://localhost:5173)
- `FIREBASE_SERVICE_ACCOUNT` - Firebase service account JSON string (alternative to key file)
- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` - Firebase credentials (alternative to service account file)
- `EMAIL_REPLY_TO` - Reply-to email address
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook secret (for webhook verification)

## Frontend Configuration

Make sure your frontend `.env` file includes:

```env
VITE_API_URL=http://localhost:3001
```

## API Endpoints

### Health Check
```
GET /health
```

### Send Email
```
POST /api/send-email
Body: {
  to: string,
  subject: string,
  template?: string,
  templateData?: object
}
```

### Create Payment Intent
```
POST /api/create-payment-intent
Body: {
  amount: number,
  currency?: string,
  metadata?: object
}
```

### Create Checkout Session (for book purchases)
```
POST /api/create-checkout-session
Body: {
  productType: 'book',
  quantity: number,
  amount: number,
  currency?: 'gbp',
  customerData: {
    name: string,
    email: string,
    phone?: string,
    shipping: {
      address: {...},
      name: string
    }
  },
  successUrl: string,
  cancelUrl: string,
  metadata?: object
}
```

### Stripe Webhook
```
POST /api/stripe-webhook
Headers: {
  'stripe-signature': string
}
Body: Raw JSON (from Stripe)
```

### Send Payment Email (Backup)
```
POST /api/send-payment-email
Body: {
  type: 'success' | 'failure',
  orderId?: string,
  sessionId?: string,
  email: string,
  name?: string,
  productName?: string,
  amount?: string,
  transactionId?: string,
  reason?: string
}
```

### Get Payment Status
```
GET /api/payment-status/:paymentIntentId
```

## Testing Webhooks Locally

To test Stripe webhooks locally, use Stripe CLI:

1. **Install Stripe CLI:**
   ```bash
   # Windows (using Scoop)
   scoop install stripe

   # Or download from: https://stripe.com/docs/stripe-cli
   ```

2. **Login to Stripe:**
   ```bash
   stripe login
   ```

3. **Forward webhooks to local server:**
   ```bash
   stripe listen --forward-to localhost:3001/api/stripe-webhook
   ```

4. **Copy the webhook signing secret** and add it to your `.env`:
   ```
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```

5. **Trigger test events:**
   ```bash
   stripe trigger checkout.session.completed
   stripe trigger checkout.session.async_payment_failed
   ```

## Email Setup

The server works with any SMTP provider. Common options:

### Business Email (e.g., support@buildwealththroughproperty.com)

**If using a business email provider (cPanel, hosting provider, etc.):**
- Contact your hosting provider for SMTP settings
- Common settings:
  - Host: `mail.yourdomain.com` or `smtp.yourdomain.com`
  - Port: `587` (TLS) or `465` (SSL)
  - Username: Your full email address
  - Password: Your email password

**Example for cPanel/WHM:**
```env
EMAIL_HOST=smtp.buildwealththroughproperty.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=support@buildwealththroughproperty.com
EMAIL_PASSWORD=your-email-password
```

### Gmail/Google Workspace (Alternative)

If you prefer Gmail:
1. Enable 2-factor authentication on your Google account
2. Generate an App Password:
   - Go to https://myaccount.google.com/apppasswords
   - Create a new app password for "Mail"
   - Use this password in `EMAIL_PASSWORD`

## Troubleshooting

### Email not sending
- Check your email credentials
- Verify SMTP settings
- Check firewall/antivirus isn't blocking connections
- For Gmail, make sure you're using an App Password, not your regular password

### Stripe webhook errors
- Make sure `STRIPE_WEBHOOK_SECRET` is set correctly
- Use Stripe CLI to forward webhooks locally
- Check that the webhook endpoint is receiving raw body (not parsed JSON)

### CORS errors
- Make sure `FRONTEND_URL` matches your frontend URL exactly
- Check that your frontend is using the correct `VITE_API_URL`

## Production Deployment

For production, deploy to Vercel or another hosting platform. The serverless functions in the `api/` directory are optimized for Vercel deployment.
