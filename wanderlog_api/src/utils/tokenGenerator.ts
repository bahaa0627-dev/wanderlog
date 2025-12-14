import crypto from 'crypto';

/**
 * 生成 6 位数字验证码
 * 用于邮箱验证
 */
export function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * 生成 UUID Token
 * 用于密码重置等需要更长有效期的场景
 */
export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * 生成短验证码（4位数字）
 * 用于快速验证场景
 */
export function generateShortCode(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}
