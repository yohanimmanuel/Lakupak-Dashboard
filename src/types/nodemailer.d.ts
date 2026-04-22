declare module 'nodemailer' {
  export type TransportOptions = Record<string, unknown>;

  export interface Transporter {
    sendMail(mailOptions: Record<string, unknown>): Promise<unknown>;
  }

  export interface Nodemailer {
    createTransport(options: TransportOptions): Transporter;
  }

  const nodemailer: Nodemailer & { default: Nodemailer };
  export default nodemailer;
}
