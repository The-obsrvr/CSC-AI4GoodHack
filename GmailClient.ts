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

function requireEnv(name: "GMAIL_USER" | "GMAIL_APP_PASSWORD"): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }

  return value;
}

export class GmailClient {
  private readonly user: string;
  private readonly appPassword: string;

  constructor() {
    this.user = requireEnv("GMAIL_USER");
    this.appPassword = requireEnv("GMAIL_APP_PASSWORD");
  }

  async sendNewsletter(input: SendNewsletterInput): Promise<SendNewsletterOutput> {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: this.user,
        pass: this.appPassword
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
