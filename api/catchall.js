/**
 * Vercel serverless catch-all: forwards /api/* requests (except those with
 * dedicated handlers) to the Express app in server/index.js.
 *
 * Dedicated handlers: api/stripe-webhook.js (raw body), api/blob-upload.js.
 * vercel.json rewrites /api/:path* -> /api/catchall?path=:path* so we restore req.url for Express.
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
  const origin = req.headers.origin || req.headers.Origin;
  if (origin && isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function getPathFromQuery(req) {
  const p = req.query?.path;
  if (p == null) return null;
  return Array.isArray(p) ? p.join('/') : String(p);
}

export default function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const path = getPathFromQuery(req);
  if (path != null && path !== '') {
    const originalUrl = '/api/' + path + (req.url && req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '');
    req.url = originalUrl;
  }
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
