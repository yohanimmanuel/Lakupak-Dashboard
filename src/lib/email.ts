/**
 * Send password reset / verification email. No-op if SMTP is not configured or send fails.
 * Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in env (see env.example).
 */
import path from 'path';
import fs from 'fs';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Resolves an external HTTPS image URL for the Lakupak logo if configured (e.g. from CDN or deployed app).
 */
export function resolveLakupakLogoUrl(): string | null {
  const custom = process.env.LAKUPAK_LOGO_URL?.trim();
  if (custom && (custom.startsWith('http://') || custom.startsWith('https://'))) {
    return custom;
  }
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || '').trim();
  if (appUrl.startsWith('https://') && !appUrl.includes('localhost')) {
    return `${appUrl.replace(/\/$/, '')}/LakupakSmall.png`;
  }
  return null;
}

/**
 * Resolves the absolute path to the LakupakSmall.png logo or fallback logo files.
 */
export function resolveLakupakLogoPath(): string | null {
  const candidates = [
    path.resolve(process.cwd(), 'public/LakupakSmall.png'),
    path.resolve(process.cwd(), 'Lakupak-Dashboard/public/LakupakSmall.png'),
    path.resolve(__dirname, '../../public/LakupakSmall.png'),
    path.resolve(__dirname, '../../../public/LakupakSmall.png'),
    path.resolve(process.cwd(), 'public/Lakupak!.png'),
    path.resolve(process.cwd(), 'public/lakupak.png'),
    path.resolve(process.cwd(), 'Lakupak-Dashboard/public/Lakupak!.png'),
    path.resolve(process.cwd(), 'Lakupak-Dashboard/public/lakupak.png'),
    path.resolve(__dirname, '../../public/Lakupak!.png'),
    path.resolve(__dirname, '../../../public/Lakupak!.png'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return p;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

/**
 * Builds a modern, clean HTML email template inspired by Koyeb / modern SaaS verification emails.
 * Uses a centered card layout, the official Lakupak logo, large letter-spaced code, and clean typography.
 */
export function renderPasswordResetEmail(args: {
  to: string;
  resetLink?: string;
  verificationCode?: string;
  logoSrc?: string | null;
}): { subject: string; text: string; html: string } {
  const safeEmail = escapeHtml(args.to.trim());
  const trimmedCode = (args.verificationCode ?? '').trim();
  const safeCode = escapeHtml(trimmedCode);
  const rawLink = (args.resetLink ?? '').trim();
  const isHttpUrl = rawLink.startsWith('http://') || rawLink.startsWith('https://');
  const safeLink = isHttpUrl ? escapeHtml(rawLink) : '';

  const subject = trimmedCode
    ? `Lakupak verification code: ${trimmedCode}`
    : 'Reset your Lakupak password';

  const codeTextBlock = trimmedCode ? `\n\n${trimmedCode}\n\n` : '\n\n';
  const directLinkTextBlock = isHttpUrl
    ? `Or reset your password directly using this link:\n${rawLink}\n\n`
    : '';

  const text = `Lakupak

Verify your email

We need to verify your email address (${args.to}) before you can reset your password. Enter the code below in your open browser window or app:${codeTextBlock}${directLinkTextBlock}This code expires in 1 hour.

If you didn't request a password reset, you can safely ignore this email. Someone else might have typed your email address by mistake.`;

  const codeHtmlBlock = trimmedCode
    ? `
      <div style="margin: 0 0 28px 0;">
        <div style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-size: 38px; font-weight: 700; letter-spacing: 8px; color: #111827; line-height: 1.2; padding: 4px 0 24px 0; border-bottom: 1px solid #e5e7eb;">
          ${safeCode}
        </div>
      </div>
    `
    : '';

  const directLinkHtmlBlock = isHttpUrl
    ? `
      <div style="margin: 0 0 28px 0;">
        <a href="${safeLink}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #0A60D4; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; font-weight: 600; text-decoration: none; padding: 11px 22px; border-radius: 8px; text-align: center;">
          Reset password directly &rarr;
        </a>
      </div>
    `
    : '';

  const currentYear = new Date().getFullYear();
  const logoSrc = args.logoSrc?.trim() || resolveLakupakLogoUrl() || 'cid:ii_lakupak_logo';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f3f4f6; padding: 48px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 500px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e5e7eb; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.04), 0 2px 4px -2px rgba(0, 0, 0, 0.04); overflow: hidden; text-align: left;">
          <tr>
            <td style="padding: 40px 36px 36px 36px;">
              <!-- Lakupak Brand Logo -->
              <div style="margin-bottom: 28px;">
                <img
                  src="${escapeHtml(logoSrc)}"
                  alt="Lakupak!"
                  width="205"
                  height="48"
                  style="display: block; width: 205px; height: 48px; max-width: 100%; border: 0; outline: none; text-decoration: none;"
                />
              </div>

              <!-- Title -->
              <h1 style="margin: 0 0 14px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 22px; font-weight: 700; color: #111827; letter-spacing: -0.3px; line-height: 1.3;">
                Verify your email
              </h1>

              <!-- Instruction Body -->
              <p style="margin: 0 0 28px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 24px; color: #374151;">
                We need to verify your email address <strong style="color: #111827; font-weight: 600;">${safeEmail}</strong> before you can reset your password. Enter the code below in your open browser window or app.
              </p>

              <!-- Verification Code Display -->
              ${codeHtmlBlock}

              <!-- Direct Reset Button (if HTTP link available) -->
              ${directLinkHtmlBlock}

              <!-- Expiration & Disclaimer -->
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13px; line-height: 20px; color: #6b7280;">
                <p style="margin: 0 0 8px 0;">This code expires in 1 hour.</p>
                <p style="margin: 0;">If you didn't sign up or request a reset, you can safely ignore this email. Someone else might have typed your email address by mistake.</p>
              </div>
            </td>
          </tr>
        </table>

        <!-- Subtle Outer Footer -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 500px; margin-top: 20px; text-align: center;">
          <tr>
            <td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; color: #9ca3af; line-height: 18px;">
              &copy; ${currentYear} Lakupak. All rights reserved.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}

export async function sendPasswordResetEmail(
  to: string,
  resetLink: string,
  verificationCode?: string
): Promise<void> {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    return;
  }
  try {
    const nodemailerMod = await import('nodemailer');
    const createTransport =
      typeof nodemailerMod.createTransport === 'function'
        ? nodemailerMod.createTransport
        : nodemailerMod.default.createTransport;

    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const transporter = createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    const logoUrl = resolveLakupakLogoUrl();
    const logoPath = resolveLakupakLogoPath();

    const attachments: Array<{
      path: string;
      cid: string;
      filename: false;
      contentType: string;
      contentDisposition: 'inline';
      headers?: Record<string, string>;
    }> = [];

    let logoSrc = logoUrl;

    // If no public HTTPS URL is configured, embed the logo file inline without a filename header
    // so Gmail treats it strictly as an inline graphic and does NOT display an attachment preview pill in the inbox.
    if (!logoSrc && logoPath) {
      logoSrc = 'cid:ii_lakupak_logo';
      attachments.push({
        path: logoPath,
        cid: 'ii_lakupak_logo',
        filename: false,
        contentType: 'image/png',
        contentDisposition: 'inline',
        headers: {
          'X-Attachment-Id': 'ii_lakupak_logo',
        },
      });
    }

    const emailContent = renderPasswordResetEmail({
      to,
      resetLink,
      verificationCode,
      logoSrc,
    });

    await transporter.sendMail({
      from: process.env.SMTP_FROM || user,
      to,
      subject: emailContent.subject,
      text: emailContent.text,
      html: emailContent.html,
      attachments,
    });
  } catch {
    // Fail silently so API response stays generic
  }
}
