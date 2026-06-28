import "dotenv/config";
import nodemailer from "nodemailer";

type SendNewsletterInput = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
};

type SendNewsletterOutput = {
  messageId: string;
  response: string;
};

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }

  return value;
}

function smtpPort(): number {
  const value = process.env.SMTP_PORT;
  return value ? Number.parseInt(value, 10) : 465;
}

function smtpSecure(port: number): boolean {
  const value = process.env.SMTP_SECURE;

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return port === 465;
}

export class GmailClient {
  private readonly host: string;
  private readonly port: number;
  private readonly secure: boolean;
  private readonly user: string;
  private readonly password: string;

  constructor() {
    this.host = process.env.SMTP_HOST ?? "smtp.gmail.com";
    this.port = smtpPort();
    this.secure = smtpSecure(this.port);
    this.user = process.env.SMTP_USER ?? requireEnv("GMAIL_USER");
    this.password = process.env.SMTP_PASSWORD ?? requireEnv("GMAIL_APP_PASSWORD");
  }

  async sendNewsletter(input: SendNewsletterInput): Promise<SendNewsletterOutput> {
    const transporter = nodemailer.createTransport({
      host: this.host,
      port: this.port,
      secure: this.secure,
      auth: {
        user: this.user,
        pass: this.password
      }
    });

    const info = await transporter.sendMail({
      from: this.user,
      to: Array.isArray(input.to) ? input.to.join(", ") : input.to,
      subject: input.subject,
      html: input.html,
      text: input.text
    });

    return {
      messageId: info.messageId,
      response: info.response
    };
  }
}
