import { Resend } from 'resend';
import { logger } from '../utils/logger';
import {
  emailVerificationTemplate,
  passwordResetTemplate,
  welcomeEmailTemplate,
} from '../utils/emailTemplates';

// 延迟初始化 Resend 客户端（确保环境变量已加载）
let resend: Resend | null = null;

function getResendClient(): Resend {
  if (!resend) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not configured in environment variables');
    }
    resend = new Resend(apiKey);
  }
  return resend;
}

// 邮件发送配置
const EMAIL_CONFIG = {
  from: process.env.RESEND_FROM_EMAIL || 'WanderLog <onboarding@resend.dev>',
  replyTo: process.env.RESEND_REPLY_TO_EMAIL,
};

/**
 * 发送邮箱验证邮件
 */
export async function sendVerificationEmail(
  email: string,
  code: string,
  userName?: string
): Promise<boolean> {
  try {
    const client = getResendClient();
    const { data, error } = await client.emails.send({
      from: EMAIL_CONFIG.from,
      to: email,
      subject: 'Verify your WanderLog account 🌍',
      html: emailVerificationTemplate({ code, userName }),
    });

    if (error) {
      logger.error('Failed to send verification email:', error);
      return false;
    }

    logger.info(`Verification email sent to ${email}`, { emailId: data?.id });
    return true;
  } catch (error) {
    logger.error('Error sending verification email:', error);
    return false;
  }
}

/**
 * 发送密码重置邮件
 */
export async function sendPasswordResetEmail(
  email: string,
  resetLink: string,
  userName?: string
): Promise<boolean> {
  try {
    const client = getResendClient();
    const { data, error } = await client.emails.send({
      from: EMAIL_CONFIG.from,
      to: email,
      subject: 'Reset your WanderLog password 🔒',
      html: passwordResetTemplate({ resetLink, userName }),
    });

    if (error) {
      logger.error('Failed to send password reset email:', error);
      return false;
    }

    logger.info(`Password reset email sent to ${email}`, { emailId: data?.id });
    return true;
  } catch (error) {
    logger.error('Error sending password reset email:', error);
    return false;
  }
}

/**
 * 发送欢迎邮件（邮箱验证成功后）
 */
export async function sendWelcomeEmail(
  email: string,
  userName?: string
): Promise<boolean> {
  try {
    const client = getResendClient();
    const { data, error } = await client.emails.send({
      from: EMAIL_CONFIG.from,
      to: email,
      subject: 'Welcome to WanderLog! 🎉',
      html: welcomeEmailTemplate({ userName }),
    });

    if (error) {
      logger.error('Failed to send welcome email:', error);
      return false;
    }

    logger.info(`Welcome email sent to ${email}`, { emailId: data?.id });
    return true;
  } catch (error) {
    logger.error('Error sending welcome email:', error);
    return false;
  }
}

/**
 * 批量发送邮件（用于通知等）
 */
export async function sendBulkEmails(
  recipients: string[],
  subject: string,
  htmlContent: string
): Promise<{ success: number; failed: number }> {
  const results = { success: 0, failed: 0 };

  for (const email of recipients) {
    try {
      const client = getResendClient();
      const { error } = await client.emails.send({
        from: EMAIL_CONFIG.from,
        to: email,
        subject,
        html: htmlContent,
      });

      if (error) {
        results.failed++;
        logger.error(`Failed to send email to ${email}:`, error);
      } else {
        results.success++;
      }

      // 避免触发 rate limit，添加短暂延迟
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      results.failed++;
      logger.error(`Error sending email to ${email}:`, error);
    }
  }

  logger.info('Bulk email send complete', results);
  return results;
}

/**
 * 验证 Resend 配置是否正确
 */
export async function verifyEmailConfiguration(): Promise<boolean> {
  try {
    if (!process.env.RESEND_API_KEY) {
      logger.error('RESEND_API_KEY is not configured');
      return false;
    }

    logger.info('Email service configuration verified');
    return true;
  } catch (error) {
    logger.error('Email service configuration error:', error);
    return false;
  }
}
