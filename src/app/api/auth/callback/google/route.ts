import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  console.log('Google OAuth callback received:', { code: !!code, error });

  if (error) {
    return new NextResponse(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Authentication Error</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
      </head>
      <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
        <h2>Authentication Failed</h2>
        <p>Error: ${error}</p>
        <p>Please close this window and try again.</p>
        <script>
          // Auto close after 3 seconds
          setTimeout(() => {
            try {
              window.close();
            } catch(e) {
              console.log('Cannot close window automatically');
            }
          }, 3000);
        </script>
      </body>
      </html>
    `, {
      headers: { 'Content-Type': 'text/html' }
    });
  }

  if (code) {
    return new NextResponse(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Authentication Successful</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
      </head>
      <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
        <h2>✅ Authentication Successful!</h2>
        <p>Authorization code received.</p>
        <p>Please close this window and return to the app.</p>
        <script>
          // Auto close after 2 seconds
          setTimeout(() => {
            try {
              window.close();
            } catch(e) {
              console.log('Cannot close window automatically');
            }
          }, 2000);
        </script>
      </body>
      </html>
    `, {
      headers: { 'Content-Type': 'text/html' }
    });
  }

  return new NextResponse(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Authentication Error</title>
    </head>
    <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
      <h2>❌ Authentication Failed</h2>
      <p>No authorization code received.</p>
      <p>Please close this window and try again.</p>
    </body>
    </html>
  `, {
    headers: { 'Content-Type': 'text/html' }
  });
}