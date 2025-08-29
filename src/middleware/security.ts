// Security middleware for production deployment
import { NextRequest, NextResponse } from 'next/server';

export function securityMiddleware(request: NextRequest) {
  const response = NextResponse.next();
  
  // Security Headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  
  // Content Security Policy (CSP)
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: https: blob:",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self' https://www.google-analytics.com",
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join('; ');
  
  response.headers.set('Content-Security-Policy', csp);
  
  // HTTPS Redirect in production
  if (process.env.NODE_ENV === 'production' && !request.url.startsWith('https:')) {
    return NextResponse.redirect(request.url.replace('http:', 'https:'), 301);
  }
  
  return response;
}

// Rate limiting utility (basic implementation)
export class RateLimiter {
  private static requests = new Map<string, number[]>();
  
  static isAllowed(ip: string, maxRequests = 100, windowMs = 15 * 60 * 1000): boolean {
    const now = Date.now();
    const userRequests = this.requests.get(ip) || [];
    
    // Remove old requests outside the window
    const recentRequests = userRequests.filter(time => now - time < windowMs);
    
    if (recentRequests.length >= maxRequests) {
      return false;
    }
    
    recentRequests.push(now);
    this.requests.set(ip, recentRequests);
    
    return true;
  }
  
  static resetForTesting() {
    this.requests.clear();
  }
}
