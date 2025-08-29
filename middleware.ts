import { NextRequest } from 'next/server';
import { securityMiddleware } from './src/middleware/security';

export function middleware(request: NextRequest) {
  // Apply security middleware to all routes
  return securityMiddleware(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/health (health check endpoint)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api/health|_next/static|_next/image|favicon.ico).*)',
  ],
};
