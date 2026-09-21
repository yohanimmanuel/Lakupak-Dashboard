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

type SmtpTransport = {
  sendMail: (mail: Record<string, unknown>) => Promise<unknown>;
};

function getSmtpAuth() {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.replace(/\s+/g, '').trim();
  if (!host || !user || !pass) return null;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  return { host, user, pass, port: Number.isFinite(port) ? port : 587 };
}

async function createSmtpTransport(): Promise<{ transporter: SmtpTransport; from: string } | null> {
  const auth = getSmtpAuth();
  if (!auth) {
    console.warn('[email] SMTP_HOST / SMTP_USER / SMTP_PASS is not set; skipping send.');
    return null;
  }

  const nodemailerMod = await import('nodemailer');
  const createTransport =
    typeof nodemailerMod.createTransport === 'function'
      ? nodemailerMod.createTransport
      : nodemailerMod.default.createTransport;

  const transporter = createTransport({
    host: auth.host,
    port: auth.port,
    secure: auth.port === 465,
    requireTLS: auth.port === 587,
    auth: { user: auth.user, pass: auth.pass },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  }) as SmtpTransport;

  return {
    transporter,
    from: process.env.SMTP_FROM?.trim() || `Lakupak <${auth.user}>`,
  };
}

function logSmtpFailure(context: string, err: unknown) {
  const detail = err instanceof Error ? err.message : String(err);
  const code = err && typeof err === 'object' && 'code' in err ? String((err as { code?: unknown }).code) : '';
  console.error(
    `[email] ${context} failed${code ? ` (${code})` : ''}: ${detail.split('\n')[0]}. ` +
      'Gmail needs a current App Password for SMTP_USER (Google Account → Security → 2-Step Verification → App passwords), not the account login password.',
  );
}

export async function sendPasswordResetEmail(
  to: string,
  resetLink: string,
  verificationCode?: string
): Promise<void> {
  try {
    const smtp = await createSmtpTransport();
    if (!smtp) return;

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

    await smtp.transporter.sendMail({
      from: smtp.from,
      to,
      subject: emailContent.subject,
      text: emailContent.text,
      html: emailContent.html,
      attachments,
    });
  } catch (err) {
    logSmtpFailure(`password reset to ${to}`, err);
  }
}

function renderAccountActionEmail(args: {
  to: string;
  subject: string;
  title: string;
  bodyHtml: string;
  bodyText: string;
  buttonLabel: string;
  buttonUrl: string;
  footerText: string;
  logoSrc?: string | null;
}): { subject: string; text: string; html: string } {
  const safeEmail = escapeHtml(args.to.trim());
  const rawLink = args.buttonUrl.trim();
  const isHttpUrl = rawLink.startsWith('http://') || rawLink.startsWith('https://') || rawLink.startsWith('/');
  const safeLink = isHttpUrl ? escapeHtml(rawLink) : '';
  const currentYear = new Date().getFullYear();
  const logoSrc = args.logoSrc?.trim() || resolveLakupakLogoUrl() || 'cid:ii_lakupak_logo';

  const text = `Lakupak

${args.title}

${args.bodyText}

${args.buttonLabel}: ${rawLink}

${args.footerText}`;

  const buttonHtml = safeLink
    ? `
      <div style="margin: 0 0 28px 0;">
        <a href="${safeLink}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #0A60D4; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; font-weight: 600; text-decoration: none; padding: 11px 22px; border-radius: 8px; text-align: center;">
          ${escapeHtml(args.buttonLabel)} &rarr;
        </a>
      </div>
    `
    : '';

  const interpolatedBody = args.bodyHtml.replace(
    /\{\{email\}\}/g,
    `<strong style="color: #111827; font-weight: 600;">${safeEmail}</strong>`,
  );

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(args.subject)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f3f4f6; padding: 48px 16px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 500px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e5e7eb; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.04), 0 2px 4px -2px rgba(0, 0, 0, 0.04); overflow: hidden; text-align: left;">
          <tr>
            <td style="padding: 40px 36px 36px 36px;">
              <div style="margin-bottom: 28px;">
                <img
                  src="${escapeHtml(logoSrc)}"
                  alt="Lakupak!"
                  width="205"
                  height="48"
                  style="display: block; width: 205px; height: 48px; max-width: 100%; border: 0; outline: none; text-decoration: none;"
                />
              </div>
              <h1 style="margin: 0 0 14px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 22px; font-weight: 700; color: #111827; letter-spacing: -0.3px; line-height: 1.3;">
                ${escapeHtml(args.title)}
              </h1>
              <p style="margin: 0 0 28px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 24px; color: #374151;">
                ${interpolatedBody}
              </p>
              ${buttonHtml}
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13px; line-height: 20px; color: #6b7280;">
                <p style="margin: 0;">${escapeHtml(args.footerText)}</p>
              </div>
            </td>
          </tr>
        </table>
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

  return { subject: args.subject, text, html };
}

async function sendTransactionalHtmlEmail(to: string, content: { subject: string; text: string; html: string }): Promise<void> {
  try {
    const smtp = await createSmtpTransport();
    if (!smtp) return;

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

    const html = logoSrc
      ? content.html.replace('cid:ii_lakupak_logo', logoSrc)
      : content.html;

    await smtp.transporter.sendMail({
      from: smtp.from,
      to,
      subject: content.subject,
      text: content.text,
      html,
      attachments,
    });
  } catch (err) {
    logSmtpFailure(`"${content.subject}" to ${to}`, err);
  }
}

export async function sendRegistrationPendingEmail(args: {
  to: string;
  firstName?: string | null;
  loginUrl: string;
}): Promise<void> {
  const name = (args.firstName ?? '').trim();
  const greeting = name ? `Hi ${escapeHtml(name)},` : 'Hi,';
  const content = renderAccountActionEmail({
    to: args.to,
    subject: 'Your Lakupak account is under review',
    title: 'Account under review',
    bodyHtml: `${greeting}<br /><br />We received a distributor registration for {{email}}. Your account is under review while Lakupak checks your NIB and NPWP documents.<br /><br />You will get another email when the account is approved. You can visit the login page anytime, but sign-in will work only after approval.`,
    bodyText: `${name ? `Hi ${name},` : 'Hi,'}\n\nWe received a distributor registration for ${args.to}. Your account is under review while Lakupak checks your NIB and NPWP documents.\n\nYou will get another email when the account is approved.\n\nGo to login:\n${args.loginUrl}`,
    buttonLabel: 'Go to login',
    buttonUrl: args.loginUrl,
    footerText: 'If you did not register with Lakupak, you can ignore this email.',
  });
  await sendTransactionalHtmlEmail(args.to, content);
}

export async function sendAccountApprovedEmail(args: {
  to: string;
  firstName?: string | null;
  loginUrl: string;
}): Promise<void> {
  const name = (args.firstName ?? '').trim();
  const greeting = name ? `Hi ${escapeHtml(name)},` : 'Hi,';
  const content = renderAccountActionEmail({
    to: args.to,
    subject: 'Your Lakupak distributor account is approved',
    title: 'Your account is approved',
    bodyHtml: `${greeting}<br /><br />Good news — {{email}} has been approved. You can now sign in to your Lakupak distributor dashboard.`,
    bodyText: `${name ? `Hi ${name},` : 'Hi,'}\n\nGood news — ${args.to} has been approved. You can now sign in to your Lakupak distributor dashboard.\n\nGo to login:\n${args.loginUrl}`,
    buttonLabel: 'Go to login',
    buttonUrl: args.loginUrl,
    footerText: 'If you did not register with Lakupak, you can ignore this email.',
  });
  await sendTransactionalHtmlEmail(args.to, content);
}

export async function sendKycRejectedEmail(args: {
  to: string;
  firstName?: string | null;
  resubmitUrl: string;
}): Promise<void> {
  const name = (args.firstName ?? '').trim();
  const greeting = name ? `Hi ${escapeHtml(name)},` : 'Hi,';
  const content = renderAccountActionEmail({
    to: args.to,
    subject: 'Your Lakupak documents need to be uploaded again',
    title: 'Documents were not approved',
    bodyHtml: `${greeting}<br /><br />Lakupak reviewed the NIB and NPWP files for {{email}} and could not approve them. Your account has not been deleted — it stays pending until new documents are reviewed.<br /><br />Please upload replacement NIB and NPWP files using the button below.`,
    bodyText: `${name ? `Hi ${name},` : 'Hi,'}\n\nLakupak reviewed the NIB and NPWP files for ${args.to} and could not approve them. Your account has not been deleted — it stays pending until new documents are reviewed.\n\nUpload replacement documents:\n${args.resubmitUrl}`,
    buttonLabel: 'Upload documents again',
    buttonUrl: args.resubmitUrl,
    footerText: 'This link expires in 14 days. If you did not register with Lakupak, you can ignore this email.',
  });
  await sendTransactionalHtmlEmail(args.to, content);
}
