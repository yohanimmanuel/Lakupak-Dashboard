import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { signAccessToken } from '@/lib/jwt';

/**
 * GET /api/auth/ws-token
 * Returns a short-lived JWT for WebSocket authentication (Dashboard real-time notifications).
 * Requires an active NextAuth session. The JWT sub is the Dashboard User.id.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  const uid = (session?.user as { id?: string | number } | undefined)?.id;
  if (uid == null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = typeof uid === 'string' ? parseInt(uid, 10) : Number(uid);
  if (Number.isNaN(userId)) {
    return NextResponse.json({ error: 'Invalid user' }, { status: 400 });
  }
  try {
    const token = signAccessToken({ sub: userId }, '1h');
    return NextResponse.json({ token });
  } catch (e) {
    return NextResponse.json({ error: 'Failed to issue token' }, { status: 500 });
  }
}
