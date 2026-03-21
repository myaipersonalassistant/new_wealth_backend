# Build Wealth Through Property - Backend API

Backend for payments, email, webhooks, and admin. Deploy to its own Vercel project.

## Structure

- api/     - Vercel serverless functions
- server/  - Express app (shared logic)

## Local dev

npm install
cd server && npm install
npm run dev

Runs on http://localhost:3001. Set VITE_API_URL in frontend.

## Deploy (Vercel)

1. New Vercel project for this backend
2. Set env vars (see .env.example)
3. Stripe webhook -> https://YOUR-BACKEND-DOMAIN/api/stripe-webhook
4. Deploy

## CORS

Set FRONTEND_URL to your frontend domain.
