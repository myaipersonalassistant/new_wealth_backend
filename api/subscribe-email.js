/**
 * Standalone handler for /api/subscribe-email.
 * Does NOT load the full Express app - only the subscribe service.
 * Uses req.body directly (Vercel pre-parses it) to avoid body parsing conflicts.
 * Always returns JSON so the client never gets Vercel's "A server error occurred" HTML.
 */
import { handleSubscribeEmail } from '../server/services/subscribeEmailService.js';

const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL,
  'https://new-wealth-frontend.vercel.app',
  /^https:\/\/new-wealth-frontend(-[\w-]+)?\.vercel\.app$/,
].filter(Boolean);

function isOriginAllowed(origin) {
  if (!origin) return true;
  return ALLOWED_ORIGINS.some((o) =>
    typeof o === 'string' ? o === origin : o.test(origin)
  );
}

function setCorsHeaders(req, res) {
  const origin = req.headers?.origin || req.headers?.Origin;
  if (origin && isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function sendJson(res, status, data) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).end(JSON.stringify(data));
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { success: false, error: 'Method not allowed' });
    return;
  }

  try {
    // Vercel pre-parses JSON into req.body - use it directly (don't pass through Express)
    const body = req.body || {};
    const { email, source, referrer, firstName, phone } = body;
    const referrerValue = referrer || req.headers?.referer || req.headers?.origin;

    const result = await handleSubscribeEmail({
      email,
      source,
      referrer: referrerValue,
      firstName,
      phone,
    });

    sendJson(res, result.statusCode, result.body);
  } catch (error) {
    console.error('Subscribe email error:', error);
    sendJson(res, 500, {
      success: false,
      error: error.message || 'Failed to subscribe. Please try again.',
    });
  }
}
