import { NextRequest } from 'next/server';
import { securityMiddleware } from './src/middleware/security';
import { NextResponse } from 'next/server';
import { getPlatformAdminIdFromRequest } from './src/utils/platform-admin-auth';

/** Next.js 16 renamed the middleware file convention to proxy. */
export function proxy(request: NextRequest) {
  const url = request.nextUrl;

  // Protect admin routes with PlatformAdmin cookie JWT.
  if (url.pathname.startsWith('/admin')) {
    const isLogin = url.pathname === '/admin/login';
    const isRegister = url.pathname === '/admin/register';
    const adminId = getPlatformAdminIdFromRequest(request);
    if (!adminId && !isLogin && !isRegister) {
      const loginUrl = new URL('/admin/login', request.url);
      loginUrl.searchParams.set('next', url.pathname);
      return NextResponse.redirect(loginUrl);
    }
    if (adminId && isLogin) {
      return NextResponse.redirect(new URL('/admin', request.url));
    }
    if (adminId && isRegister) {
      return NextResponse.redirect(new URL('/admin', request.url));
    }
  }

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
