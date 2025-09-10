import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(`exp://192.168.0.134:8081/--/auth?error=${error}`);
  }

  if (code) {
    // Redirect back to mobile app with the authorization code
    return NextResponse.redirect(`exp://192.168.0.134:8081/--/auth?code=${code}`);
  }

  return NextResponse.redirect(`exp://192.168.0.134:8081/--/auth?error=no_code`);
}
