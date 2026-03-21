/**
 * Dedicated handler for /api/send-welcome-email - reliable CORS for frontend signup flow.
 * Delegates to Express app (same as subscribe-email).
 */
import app from '../server/index.js';

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

export default function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  req.url = '/api/send-welcome-email' + (req.url && req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '');

  return new Promise((resolve, reject) => {
    const onEnd = () => resolve();
    res.on('finish', onEnd);
    res.on('close', onEnd);
    res.on('error', reject);
    try {
      app(req, res);
    } catch (err) {
      reject(err);
    }
  });
}
