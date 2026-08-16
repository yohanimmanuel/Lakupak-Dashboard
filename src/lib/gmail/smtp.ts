/**
 * Gmail SMTP helpers for Automations. Uses an App Password, not the Google account password.
 * Do not log app passwords.
 */

export type GmailSmtpCredentials = {
  email: string;
  appPassword: string;
  host: string;
  port: number;
};

export class GmailSmtpError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = 'GmailSmtpError';
    this.status = status;
  }
}

function trimStr(value: unknown): string {
  return String(value ?? '').trim();
}

export function resolveGmailSmtpCredentials(partial?: {
  email?: string | null;
  appPassword?: string | null;
  host?: string | null;
  port?: string | number | null;
}): GmailSmtpCredentials | null {
  const email =
    trimStr(partial?.email) ||
    trimStr(process.env.GMAIL_SMTP_USER) ||
    trimStr(process.env.SMTP_USER);
  const appPassword =
    trimStr(partial?.appPassword) ||
    trimStr(process.env.GMAIL_SMTP_APP_PASSWORD) ||
    trimStr(process.env.SMTP_PASS);
  if (!email || !appPassword) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;

  const host =
    trimStr(partial?.host) ||
    trimStr(process.env.GMAIL_SMTP_HOST) ||
    trimStr(process.env.SMTP_HOST) ||
    'smtp.gmail.com';
  const portRaw =
    partial?.port ?? process.env.GMAIL_SMTP_PORT ?? process.env.SMTP_PORT ?? '587';
  const port = typeof portRaw === 'number' ? portRaw : parseInt(String(portRaw).trim() || '587', 10);

  return {
    email,
    appPassword,
    host,
    port: Number.isFinite(port) ? port : 587,
  };
}

export function credentialsFromGmailAppConfig(
  config: Record<string, unknown> | null | undefined,
): GmailSmtpCredentials | null {
  if (!config) return resolveGmailSmtpCredentials();
  return resolveGmailSmtpCredentials({
    email: trimStr(config.email) || null,
    appPassword: trimStr(config.appPassword) || null,
    host: trimStr(config.smtpHost) || null,
    port: trimStr(config.smtpPort) || null,
  });
}

export async function sendGmailMessage(args: {
  creds: GmailSmtpCredentials;
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
}): Promise<{ messageId?: string }> {
  const toList = (Array.isArray(args.to) ? args.to : [args.to])
    .map((v) => v.trim())
    .filter(Boolean);
  if (toList.length === 0) {
    throw new GmailSmtpError('Recipient email is required.', 400);
  }
  const subject = args.subject.trim();
  const text = args.text.trim();
  if (!subject) throw new GmailSmtpError('Subject is required.', 400);
  if (!text) throw new GmailSmtpError('Message text is required.', 400);

  try {
    const nodemailerMod = await import('nodemailer');
    const createTransport =
      typeof nodemailerMod.createTransport === 'function'
        ? nodemailerMod.createTransport
        : nodemailerMod.default.createTransport;
    const transporter = createTransport({
      host: args.creds.host,
      port: args.creds.port,
      secure: args.creds.port === 465,
      auth: { user: args.creds.email, pass: args.creds.appPassword },
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
    });
    const info = (await transporter.sendMail({
      from: args.creds.email,
      to: toList.join(', '),
      subject,
      text,
      html: args.html?.trim() || undefined,
    })) as { messageId?: string };
    return { messageId: info.messageId };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new GmailSmtpError(
      `Gmail SMTP failed: ${detail}. Use a Gmail App Password (Google Account → Security → App passwords), not your login password.`,
      502,
    );
  }
}
