/**
 * Vercel Blob client upload handler
 * POST /api/blob-upload
 * Used by @vercel/blob/client upload() with handleUploadUrl
 */
import { handleUpload } from '@vercel/blob/client';

// Allowed MIME types for blog media (images, videos, docs)
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'video/mp4',
  'video/webm',
  'video/ogg',
  'application/pdf',
];

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body;

  try {
    // Build a Web API Request for handleUpload (needed for token exchange)
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const url = `${protocol}://${host}${req.url}`;
    const request = new Request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ALLOWED_TYPES,
        addRandomSuffix: true,
        pathnamePrefix: 'blog/',
      }),
    });

    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json(jsonResponse);
  } catch (error) {
    console.error('Blob upload error:', error);
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(400).json({ error: error?.message || 'Upload failed' });
  }
}
