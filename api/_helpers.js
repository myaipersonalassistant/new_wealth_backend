/**
 * Helper functions for Vercel serverless functions
 */

/**
 * Set CORS headers
 */
export function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

/**
 * Handle CORS preflight requests
 */
export function handleCors(req, res) {
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res);
    return res.status(200).end();
  }
  return false;
}

/**
 * Create success response
 */
export function successResponse(res, data, statusCode = 200) {
  setCorsHeaders(res);
  return res.status(statusCode).json({
    success: true,
    ...data
  });
}

/**
 * Create error response
 */
export function errorResponse(res, error, statusCode = 500) {
  setCorsHeaders(res);
  return res.status(statusCode).json({
    success: false,
    error: error.message || error,
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
}

/**
 * Validate required fields
 */
export function validateFields(body, requiredFields) {
  const missing = requiredFields.filter(field => !body[field]);
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }
}

