import { Inject, Injectable, Logger } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';
import type { SentMessageInfo } from 'nodemailer';
import mailConfig, { MailConfig } from '../mail.config';
import { SendMailOptions } from '../interfaces';
import {
  welcomeEmail,
  passwordResetEmail,
  accountLockedEmail,
  accountUnlockedEmail,
  tfaEnabledEmail,
  tfaDisabledEmail,
  WelcomeEmailData,
  PasswordResetEmailData,
  AccountLockedEmailData,
  AccountUnlockedEmailData,
  TfaEnabledEmailData,
  TfaDisabledEmailData,
} from '../templates';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter<SentMessageInfo> | null;
  private readonly fromAddress: string;

  constructor(
    @Inject(mailConfig.KEY)
    private readonly config: MailConfig,
  ) {
    if (!this.config.enabled) {
      this.transporter = null;
      this.logger.warn(
        'Mail is disabled (MAIL_ENABLED=false). No transactional email will be sent.',
      );
    } else if (!this.config.host) {
      this.transporter = null;
      this.logger.warn(
        'Mail is enabled but MAIL_HOST is empty. Set MAIL_HOST (and credentials) or set MAIL_ENABLED=false.',
      );
    } else {
      const useAuth = Boolean(this.config.user && this.config.password);
      if (!useAuth) {
        this.logger.warn(
          'Mail SMTP auth is not configured (MAIL_USER / MAIL_PASSWORD empty). Sending may fail unless the server allows unauthenticated relay.',
        );
      }
      this.transporter = createTransport({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure,
        requireTLS: !this.config.secure && this.config.port === 587,
        auth: useAuth
          ? { user: this.config.user, pass: this.config.password }
          : undefined,
      });
      this.logger.log(
        `Mail transporter ready (host=${this.config.host}, port=${this.config.port.toString()}, secure=${this.config.secure.toString()})`,
      );
    }

    this.fromAddress = `"${this.config.fromName}" <${this.config.fromAddress}>`;
  }

  async send(options: SendMailOptions): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn(
        `Mail not sent (no SMTP transporter): ${options.subject} to ${options.to}`,
      );
      return false;
    }

    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });

      this.logger.log(`Email sent: ${options.subject} to ${options.to}`);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send email: ${options.subject} to ${options.to}`,
        error instanceof Error ? error.stack : String(error),
      );
      return false;
    }
  }

  async sendWelcome(to: string, data: WelcomeEmailData): Promise<boolean> {
    return this.send({
      to,
      subject: 'Welcome to DHIS2 Server Certification',
      html: welcomeEmail(data),
    });
  }

  async sendPasswordReset(
    to: string,
    data: PasswordResetEmailData,
  ): Promise<boolean> {
    return this.send({
      to,
      subject: 'Password Reset Request - DHIS2 Server Certification',
      html: passwordResetEmail(data),
    });
  }

  async sendAccountLocked(
    to: string,
    data: AccountLockedEmailData,
  ): Promise<boolean> {
    return this.send({
      to,
      subject: 'Account Locked - DHIS2 Server Certification',
      html: accountLockedEmail(data),
    });
  }

  async sendAccountUnlocked(
    to: string,
    data: AccountUnlockedEmailData,
  ): Promise<boolean> {
    return this.send({
      to,
      subject: 'Account Unlocked - DHIS2 Server Certification',
      html: accountUnlockedEmail(data),
    });
  }

  async sendTfaEnabled(
    to: string,
    data: TfaEnabledEmailData,
  ): Promise<boolean> {
    return this.send({
      to,
      subject: 'Two-Factor Authentication Enabled - DHIS2 Server Certification',
      html: tfaEnabledEmail(data),
    });
  }

  async sendTfaDisabled(
    to: string,
    data: TfaDisabledEmailData,
  ): Promise<boolean> {
    return this.send({
      to,
      subject:
        'Two-Factor Authentication Disabled - DHIS2 Server Certification',
      html: tfaDisabledEmail(data),
    });
  }

  async verifyConnection(): Promise<boolean> {
    if (!this.transporter) {
      return false;
    }

    try {
      await this.transporter.verify();
      this.logger.log('Mail server connection verified');
      return true;
    } catch (error) {
      this.logger.error(
        'Mail server connection failed',
        error instanceof Error ? error.stack : String(error),
      );
      return false;
    }
  }
}
