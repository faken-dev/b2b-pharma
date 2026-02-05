import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sgMail from '@sendgrid/mail';
import { Twilio } from 'twilio';
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly from: string;
  private readonly twilio?: Twilio;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('SENDGRID_API_KEY');

    if (!apiKey) {
      this.logger.error('SENDGRID_API_KEY is not defined in the environment');
      // Throwing here stops the app early – better than silently failing.
      throw new Error('Missing SENDGRID_API_KEY');
    }

    sgMail.setApiKey(apiKey);
    this.from =
      this.configService.get<string>('SENDGRID_FROM') ??
      'no-reply@pharmab2b.com';

    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');

    if (accountSid && authToken) {
      this.twilio = new Twilio(accountSid, authToken);
      this.logger.log('Twilio initialized successfully');
    } else {
      this.logger.warn(
        'Twilio credentials missing. SMS functionality will be disabled.',
      );
    }
  }

  /**
   * Sends a verification e‑mail to the supplied address.
   *
   * @param email Recipient e‑mail address
   * @param token Verification token that will be embedded in the URL
   */
  async sendVerificationEmail(email: string, token: string): Promise<void> {
    const frontUrl =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';

    const verifyUrl = `${frontUrl}/verify?token=${encodeURIComponent(token)}`;

    const msg: sgMail.MailDataRequired = {
      to: email,
      from: this.from,
      subject: 'Verify your PharmaB2B account',
      text: `Welcome to PharmaB2B! Please verify your account: ${verifyUrl}`,
      html: `
        <p>Welcome to <strong>PharmaB2B</strong>!</p>
        <p>Please verify your account by clicking the button below:</p>
        <a href="${verifyUrl}"
           style="display:inline-block;padding:10px 20px;background:#28a745;color:#fff;text-decoration:none;border-radius:5px;">
          Verify Email
        </a>
        <p>If you did not create this account, you can ignore this e-mail.</p>
      `,
    };

    try {
      await sgMail.send(msg);
      this.logger.log(`Verification e-mail sent to ${email}`);
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

  /**
   * Sends a custom e-mail to the specified recipient.
   *
   * @param to Recipient e-mail address
   * @param subject E-mail subject
   * @param html HTML content of the e-mail
   */
  async sendCustomEmail(
    to: string,
    subject: string,
    html: string,
  ): Promise<void> {
    const msg: sgMail.MailDataRequired = {
      to,
      from: this.from,
      subject,
      html,
    };

    try {
      await sgMail.send(msg);
      this.logger.log(`E-mail sent → ${to} | subject: ${subject}`);
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

      this.logger.error(`Failed to send e-mail to ${to}: ${errMsg}`);

      throw error;
    }
  }

  /**
   * Sends an SMS message.
   *
   * UsesTwilio
   * In VietNam  need to have brand name to send SMS
   * So we use WhatsApp instead of SMS
   */
  async sendSms(to: string, message: string): Promise<void> {
    const fromNumber = this.configService.get<string>('TWILIO_FROM_PHONE');

    if (!this.twilio || !fromNumber) {
      this.logger.error('Twilio SMS configuration missing');
      throw new Error('Missing SMS configuration');
    }

    try {
      await this.twilio.messages.create({
        from: fromNumber,
        to,
        body: message,
      });

      this.logger.log(`SMS sent → ${to}`);
    } catch (error: unknown) {
      let errMsg = 'Unknown error';

      if (error instanceof Error) {
        errMsg = error.message;
      }

      this.logger.error(`Failed to send SMS to ${to}: ${errMsg}`);
      throw error;
    }
  }

  /**
   * Sends a WhatsApp message.
   * Uses Twilio WhatsApp API in sandbox mode.
   * @param to Recipient WhatsApp number in E.164 format (e.g., +1234567890)
   * @param message Message content
   */
  async sendWhatsApp(to: string, message: string): Promise<void> {
    // const fromWhatsApp = `whatsapp:${this.configService.get<string>('TWILIO_WHATSAPP_NUMBER')}`;
    // const toWhatsApp = `whatsapp:${to}`;
    const fromWhatsApp = 'whatsapp:+14155238886';
    const toWhatsApp = `whatsapp:+84833216274`;

    if (!this.twilio || !fromWhatsApp) {
      this.logger.error('Twilio WhatsApp configuration missing');
      throw new Error('Missing configuration');
    }

    try {
      await this.twilio.messages.create({
        from: fromWhatsApp,
        to: toWhatsApp,
        body: message,
      });

      this.logger.log(`WhatsApp sent → ${to}`);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to send WhatsApp to ${to}: ${errMsg}`);
      throw error;
    }
  }
}
