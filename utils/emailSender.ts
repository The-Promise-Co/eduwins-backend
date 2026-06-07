import nodemailer from 'nodemailer';
import { BrevoClient } from '@getbrevo/brevo';
import fs from 'fs';
import path from 'path';

/**
 * Email Options Interface
 */
export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
  fromName?: string;
}

/**
 * Email Provider Interface
 */
export interface EmailProvider {
  send(options: EmailOptions): Promise<any>;
}

/**
 * Brevo Implementation using the latest @getbrevo/brevo SDK
 */
class BrevoProvider implements EmailProvider {
  private brevo: BrevoClient | null = null;

  constructor() {
    try {
      this.brevo = new BrevoClient({
        apiKey: process.env.BREVO_API_KEY || '',
      });
    } catch (err) {
      console.warn('⚠️ Brevo SDK initialization failed. Ensure @getbrevo/brevo is installed correctly.');
    }
  }

  async send(options: EmailOptions): Promise<any> {
    if (!this.brevo) {
      throw new Error('Brevo SDK not initialized');
    }

    const result = await this.brevo.transactionalEmails.sendTransacEmail({
      subject: options.subject,
      htmlContent: options.html,
      sender: {
        name: options.fromName || process.env.EMAIL_FROM_NAME || 'EduWins',
        email: options.from || process.env.EMAIL_FROM || ''
      },
      to: [{ email: options.to }]
    });

    return result;
  }
}

/**
 * Nodemailer (Gmail/SMTP) Implementation
 */
class GmailProvider implements EmailProvider {
  private transporter: any;

  constructor() {
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });
  }

  async send(options: EmailOptions): Promise<any> {
    const mailOptions = {
      from: `"${options.fromName || process.env.EMAIL_FROM_NAME || 'EduWins'}" <${options.from || process.env.EMAIL_USER}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
    };

    const info = await this.transporter.sendMail(mailOptions);
    return info;
  }
}


/**
 * Email Service Manager
 */
export class EmailService {
  private provider: EmailProvider;
  private templatesPath: string;

  constructor() {
    this.templatesPath = path.join(process.cwd(), 'templates', 'emails');
    const providerType = (process.env.EMAIL_PROVIDER || 'test').toLowerCase();

    switch (providerType) {
      case 'brevo':
        this.provider = new BrevoProvider();
        break;
      case 'gmail':
        this.provider = new GmailProvider();
        break;
      default:
        this.provider = new BrevoProvider();
        break;
    }
  }

  /**
   * Load and parse a template file
   */
  private loadTemplate(templateName: string, data: Record<string, string>): string {
    const filePath = path.join(this.templatesPath, `${templateName}.html`);

    if (!fs.existsSync(filePath)) {
      console.error(`❌ Template not found: ${filePath}`);
      return '';
    }

    let content = fs.readFileSync(filePath, 'utf8');

    // Replace placeholders {{key}} with data[key]
    Object.keys(data).forEach(key => {
      const placeholder = new RegExp(`{{${key}}}`, 'g');
      content = content.replace(placeholder, data[key]);
    });

    return content;
  }

  /**
   * Generic send method
   */
  async sendEmail(options: EmailOptions): Promise<void> {
    const isDev = process.env.NODE_ENV === 'development';
    const provider = (process.env.EMAIL_PROVIDER || 'brevo').toLowerCase();

    if (!options.to) {
      console.warn('⚠️ Recipient email missing — send skipped');
      return;
    }

    try {
      const response = await this.provider.send(options);

      if (isDev) {
        console.log('✅ [DEV] Email sent successfully:', {
          provider,
          to: options.to,
          subject: options.subject,
          from: options.from || process.env.EMAIL_FROM,
          providerResponse: response,
        });
      }
    } catch (error: any) {
      if (isDev) {
        console.error('❌ [DEV] Email send FAILED:', {
          provider,
          to: options.to,
          subject: options.subject,
          error: error.message,
          details: error.response?.data ?? error.response ?? null,
        });
      } else {
        console.error('⚠️ Email service failed:', error.message);
      }
      throw error; // re-throw so callers know the send failed
    }
  }

  /**
   * Send verification email (OTP only)
   */
  async sendVerificationEmail(email: string, otp: string): Promise<void> {
    const html = this.loadTemplate('verification', { otp });

    if (!html) {
      console.error('❌ Failed to load verification template');
      // Fallback if template is missing
      await this.sendEmail({
        to: email,
        subject: 'EduWins - Verify your email address',
        html: `<h2>Welcome to EduWins!</h2><p>Your verification code is: <strong>${otp}</strong></p>`,
      });
      return;
    }

    await this.sendEmail({
      to: email,
      subject: 'EduWins - Verify your email address',
      html,
    });
  }

  /**
   * Send Welcome Email
   */
  async sendWelcomeEmail(email: string, fullName: string): Promise<void> {
    const html = this.loadTemplate('welcome', {
      fullName,
      loginUrl: process.env.FRONTEND_URL || 'https://eduwins.com/login'
    });

    if (!html) {
      console.error('❌ Failed to load welcome template');
      return;
    }

    await this.sendEmail({
      to: email,
      subject: 'Welcome to EduWins',
      html,
    });
  }

  /**
   * Send Password Reset Email
   */
  async sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
    const html = this.loadTemplate('password_reset', { resetUrl });

    if (!html) {
      console.error('❌ Failed to load password_reset template');
      // Fallback if template is missing
      await this.sendEmail({
        to: email,
        subject: 'EduWins - Reset Your Password',
        html: `<h2>Reset your EduWins password</h2><p>Click the link below to reset your password (valid for 1 hour):</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
      });
      return;
    }

    await this.sendEmail({
      to: email,
      subject: 'EduWins - Reset Your Password',
      html,
    });
  }

  /**
   * Send 2FA login OTP email
   */
  async send2faOtpEmail(email: string, otp: string): Promise<void> {
    const html = this.loadTemplate('otp', { otp });

    if (!html) {
      console.error('❌ Failed to load OTP template');
      await this.sendEmail({
        to: email,
        subject: 'EduWins - Two-Factor Authentication OTP',
        html: `<h2>EduWins Security</h2><p>Your two-factor authentication verification code is: <strong>${otp}</strong></p>`,
      });
      return;
    }

    await this.sendEmail({
      to: email,
      subject: 'EduWins - Two-Factor Authentication OTP',
      html,
    });
  }
}

// Export singleton instance
export const emailService = new EmailService();
