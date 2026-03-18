import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

@Injectable()
export class MailService {
    private readonly logger = new Logger(MailService.name);
    private transporter: Transporter;

    constructor(private readonly configService: ConfigService) {
        this.transporter = nodemailer.createTransport({
            host: this.configService.get<string>('MAIL_HOST'),
            port: this.configService.get<number>('MAIL_PORT'),
            auth: {
                user: this.configService.get<string>('MAIL_USER'),
                pass: this.configService.get<string>('MAIL_PASS'),
            },
        });
    }

    async sendOtp(to: string, firstName: string, otp: string): Promise<void> {
        try {
            await this.transporter.sendMail({
                from: this.configService.get<string>('MAIL_FROM'),
                to,
                subject: 'CredFX — Verify Your Email Address',
                html: this.buildOtpTemplate(firstName, otp),
            });
            this.logger.log(`OTP email sent to ${to}`);
        } catch (error) {
            this.logger.error(`Failed to send OTP email to ${to}: ${(error as Error).message}`);
        }
    }

    private buildOtpTemplate(firstName: string, otp: string): string {
        return `
      <!DOCTYPE html>
      <html>
        <head><meta charset="utf-8"></head>
        <body style="font-family: Arial, sans-serif; background: #f4f4f4; padding: 40px;">
          <div style="max-width: 600px; margin: auto; background: #fff; border-radius: 8px; padding: 40px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #1a1a2e; font-size: 28px; margin: 0;">Cred<span style="color: #e94560;">FX</span></h1>
            </div>
            <h2 style="color: #333; font-size: 22px;">Welcome, ${firstName}!</h2>
            <p style="color: #666; font-size: 16px; line-height: 1.6;">
              Thank you for registering with CredFX. Use the OTP below to verify your email address.
              This code expires in <strong>10 minutes</strong>.
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <span style="background: #1a1a2e; color: #e94560; font-size: 36px; font-weight: bold; letter-spacing: 12px; padding: 16px 32px; border-radius: 8px;">
                ${otp}
              </span>
            </div>
            <p style="color: #999; font-size: 13px; text-align: center;">
              If you did not create an account with CredFX, please ignore this email.
            </p>
          </div>
        </body>
      </html>
    `;
    }
}