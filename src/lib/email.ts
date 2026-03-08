/**
 * Send password reset email. No-op if SMTP is not configured or send fails.
 * Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in env (see env.example).
 */
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
    const nodemailer = await import('nodemailer');
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const transporter = nodemailer.default.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    const codeBlock =
      typeof verificationCode === 'string' && verificationCode.trim()
        ? `\n\nYour verification code is: ${verificationCode}`
        : '';
    const htmlCodeBlock =
      typeof verificationCode === 'string' && verificationCode.trim()
        ? `<p><strong>Your verification code is: ${verificationCode}</strong></p><p>Enter this code in the app to reset your password.</p>`
        : '';
    await transporter.sendMail({
      from: process.env.SMTP_FROM || user,
      to,
      subject: 'Reset your password',
      text: `You requested a password reset. Open this link to set a new password:\n\n${resetLink}${codeBlock}\n\nThis link and code expire in 1 hour. If you didn't request this, you can ignore this email.`,
      html: `<!DOCTYPE html><html><body><p>You requested a password reset.</p><p><a href="${resetLink}">Reset your password</a></p>${htmlCodeBlock}<p>This link and code expire in 1 hour. If you didn't request this, you can ignore this email.</p></body></html>`,
    });
  } catch {
    // Fail silently so API response stays generic
  }
}
