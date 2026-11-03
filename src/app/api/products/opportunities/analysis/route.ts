import { NextRequest, NextResponse } from 'next/server';
import { getSecurityHeaders } from '@/utils/auth-security';
import { getAuthenticatedUserId } from '@/utils/auth-helpers';
import { buildAssortmentAnalysis } from '@/lib/assortmentOpportunities/analysis';

export async function GET(req: NextRequest) {
  const headers = getSecurityHeaders();
  const userId = await getAuthenticatedUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  const locale = req.nextUrl.searchParams.get('locale') || 'en';
  const analysis = await buildAssortmentAnalysis(userId, locale);
  return NextResponse.json(analysis, { headers });
}
