import type { NextRequest } from "next/server";

/** Next.js 15 route handler context for this dynamic segment */
type RouteContext = { params: Promise<{ nextauth: string[] }> };

/** Context object next-auth expects when used as App Router route handler (has .params) */
type NextAuthRouteHandlerContext = { params: { nextauth: string[] } };

/**
 * NextAuth is lazy-loaded so the build (Collecting page data) does not load it
 * and require AUTH_SECRET. Avoids putting AUTH_SECRET in the Dockerfile.
 */
async function nextAuthHandler(req: NextRequest, context: RouteContext) {
  // Automatically adapt NEXTAUTH_URL in hosted environments (e.g. Render, Vercel) if localhost is detected
  if (process.env.RENDER_EXTERNAL_URL && (!process.env.NEXTAUTH_URL || process.env.NEXTAUTH_URL.includes("localhost"))) {
    process.env.NEXTAUTH_URL = process.env.RENDER_EXTERNAL_URL;
  } else if (!process.env.NEXTAUTH_URL || process.env.NEXTAUTH_URL.includes("localhost")) {
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    const proto = req.headers.get("x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https");
    if (host && !host.includes("localhost")) {
      process.env.NEXTAUTH_URL = `${proto}://${host}`;
    }
  }
  if (!process.env.AUTH_TRUST_HOST) {
    process.env.AUTH_TRUST_HOST = "true";
  }

  const NextAuth = (await import("next-auth")).default;
  const { authOptions } = await import("@/lib/auth-options");
  const handler = NextAuth(authOptions);
  const params = await context.params;
  const handlerContext: NextAuthRouteHandlerContext = { params };
  return handler(req as unknown as Request, handlerContext);
}

export async function GET(req: NextRequest, context: RouteContext) {
  return nextAuthHandler(req, context);
}

export async function POST(req: NextRequest, context: RouteContext) {
  return nextAuthHandler(req, context);
}
