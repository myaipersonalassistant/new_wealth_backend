/**
 * Vercel serverless catch-all: forwards /api/* requests (except those with
 * dedicated handlers) to the Express app in server/index.js.
 *
 * Dedicated handlers: api/stripe-webhook.js (raw body), api/blob-upload.js.
 * vercel.json rewrites /api/:path* -> /api/catchall?path=:path* so we restore req.url for Express.
 */
import app from '../server/index.js';

function getPathFromQuery(req) {
  const p = req.query?.path;
  if (p == null) return null;
  return Array.isArray(p) ? p.join('/') : String(p);
}

export default function handler(req, res) {
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
