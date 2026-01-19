import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sgMail from '@sendgrid/mail';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('SENDGRID_API_KEY');

    if (!apiKey) {
      this.logger.error('SENDGRID_API_KEY is not defined in the environment');
      // Throwing here stops the app early – better than silently failing.
      throw new Error('Missing SENDGRID_API_KEY');
    }

    sgMail.setApiKey(apiKey);
  }

  /**
   * Sends a verification e‑mail to the supplied address.
   *
   * @param email Recipient e‑mail address
   * @param token Verification token that will be embedded in the URL
   */
  async sendVerificationEmail(email: string, token: string): Promise<void> {
    const from =
      this.configService.get<string>('SENDGRID_FROM') ??
      'no-reply@pharmab2b.com';
    const frontUrl =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    const verificationUrl = `${frontUrl}/verify?token=${encodeURIComponent(token)}`;

    const msg: sgMail.MailDataRequired = {
      to: email,
      from,
      subject: 'Verify your PharmaB2B account',
      text: `Welcome to PharmaB2B! Please verify your account by clicking the following link: ${verificationUrl}`,
      html: `
        <p>Welcome to <strong>PharmaB2B</strong>!</p>
        <p>Please verify your account by clicking the button below:</p>
        <a href="${verificationUrl}"
           style="display:inline-block;padding:10px 20px;background:#28a745;color:#fff;text-decoration:none;border-radius:5px;">
          Verify Email
        </a>
        <p>If you did not request this, you can safely ignore this e‑mail.</p>
      `,
    };

    try {
      await sgMail.send(msg);
      this.logger.log(`Verification e‑mail sent to ${email}`);
    } catch (error: unknown) {
      let errMsg = 'Unknown error';

      if (error instanceof Error) {
        errMsg = error.message;
      }

      if (typeof error === 'object' && error !== null && 'response' in error) {
        const response = (
          error as {
            response?: {
              body?: {
                errors?: Array<{ message?: string }>;
              };
            };
          }
        ).response;

        const sendgridMsg = response?.body?.errors?.[0]?.message;
        if (sendgridMsg) {
          errMsg = sendgridMsg;
        }
      }

      this.logger.error(
        `Failed to send verification e-mail to ${email}: ${errMsg}`,
      );

      throw error;
    }
  }
}
