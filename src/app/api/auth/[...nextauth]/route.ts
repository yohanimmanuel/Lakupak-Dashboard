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
