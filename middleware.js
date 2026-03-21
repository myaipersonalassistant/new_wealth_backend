import { next } from '@vercel/functions';

const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL,
  'https://new-wealth-frontend.vercel.app',
].filter(Boolean);

const CORS_HEADERS = {
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function isOriginAllowed(origin) {
  if (!origin) return false;
  return ALLOWED_ORIGINS.includes(origin) ||
    /^https:\/\/new-wealth-frontend(-[\w-]+)?\.vercel\.app$/.test(origin);
}

export default function middleware(request) {
  const origin = request.headers.get('origin') || request.headers.get('Origin');
  const corsHeaders = { ...CORS_HEADERS };
  if (origin && isOriginAllowed(origin)) {
    corsHeaders['Access-Control-Allow-Origin'] = origin;
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  return next({ headers: corsHeaders });
}

export const config = {
  matcher: '/api/:path*',
};
