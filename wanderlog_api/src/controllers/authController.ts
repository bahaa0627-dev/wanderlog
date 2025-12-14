import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { GaxiosOptions } from 'gaxios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import prisma from '../config/database';
import { logger } from '../utils/logger';
import { generateVerificationCode, generateToken } from '../utils/tokenGenerator';
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
} from '../services/emailService';

const JWT_SECRET: string = process.env.JWT_SECRET || 'default_secret';
const JWT_ACCESS_EXPIRY: string = process.env.JWT_ACCESS_EXPIRY || '15m';
const JWT_REFRESH_EXPIRY: string = process.env.JWT_REFRESH_EXPIRY || '7d';

// Configure proxy agent if needed
let clientOptions: GaxiosOptions = {};
if (process.env.HTTP_PROXY || process.env.http_proxy) {
  const proxyUrl = process.env.HTTP_PROXY || process.env.http_proxy;
  console.log(`[AUTH] Configuring Google OAuth2 client with proxy: ${proxyUrl}`);
  const agent = new HttpsProxyAgent(proxyUrl);
  clientOptions = { agent };
}

// Google OAuth2 Client with proxy support
const googleClient = new OAuth2Client({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  ...clientOptions,
});

export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user (email not verified yet)
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        authProvider: 'email',
        isEmailVerified: false,
      },
    });

    // Generate verification code
    const verificationCode = generateVerificationCode();
    
    // Save verification token to database
    await prisma.verificationToken.create({
      data: {
        userId: user.id,
        token: verificationCode,
        type: 'EMAIL_VERIFICATION',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
      },
    });

    // Send verification email
    await sendVerificationEmail(email, verificationCode, name || undefined);

    // Generate temporary token (user can login but with limited access)
    const token = jwt.sign(
      { id: user.id, email: user.email, verified: false },
      JWT_SECRET,
      { expiresIn: JWT_ACCESS_EXPIRY as string }
    );

    // 开发模式：在响应中返回验证码（仅用于开发/测试）
    const isDevelopment = process.env.NODE_ENV !== 'production';

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        isEmailVerified: false,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      message: 'Please check your email to verify your account',
      ...(isDevelopment && { verificationCode }), // 仅在开发模式下返回验证码
    });
  } catch (error) {
    logger.error('Register error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Check user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.password) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check if email is verified
    if (!user.isEmailVerified) {
      return res.status(403).json({ 
        error: 'Email not verified',
        message: 'Please verify your email address before logging in. Check your inbox for the verification code.'
      });
    }

    // Generate access token
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email,
        verified: user.isEmailVerified,
        version: user.tokenVersion,
      },
      JWT_SECRET,
      { expiresIn: JWT_ACCESS_EXPIRY }
    );

    // Generate refresh token
    const refreshToken = jwt.sign(
      { 
        id: user.id,
        version: user.tokenVersion,
        type: 'refresh',
      },
      JWT_SECRET,
      { expiresIn: JWT_REFRESH_EXPIRY }
    );

    // Save refresh token to database
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken },
    });

    res.json({
      token,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        isEmailVerified: user.isEmailVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
};

export const getMe = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        isEmailVerified: true,
        authProvider: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    logger.error('Get Me error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * 验证邮箱
 */
export const verifyEmail = async (req: Request, res: Response) => {
  try {
    const { code } = req.body;
    const userId = req.user.id;

    // Find valid verification token
    const token = await prisma.verificationToken.findFirst({
      where: {
        userId,
        token: code,
        type: 'EMAIL_VERIFICATION',
        expiresAt: { gte: new Date() },
        usedAt: null,
      },
    });

    if (!token) {
      return res.status(400).json({ 
        message: 'Invalid or expired verification code' 
      });
    }

    // Mark token as used
    await prisma.verificationToken.update({
      where: { id: token.id },
      data: { usedAt: new Date() },
    });

    // Update user
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        isEmailVerified: true,
        emailVerifiedAt: new Date(),
      },
    });

    // Send welcome email
    await sendWelcomeEmail(user.email, user.name || undefined);

    // Generate new token with verified status
    const newToken = jwt.sign(
      { 
        id: user.id, 
        email: user.email,
        verified: true,
        version: user.tokenVersion,
      },
      JWT_SECRET,
      { expiresIn: JWT_ACCESS_EXPIRY }
    );

    res.json({ 
      message: 'Email verified successfully',
      token: newToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        isEmailVerified: true,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (error) {
    logger.error('Verify email error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * 重发验证码
 */
export const resendVerification = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({ message: 'Email already verified' });
    }

    // Check if a recent verification code was sent (rate limiting)
    const recentToken = await prisma.verificationToken.findFirst({
      where: {
        userId,
        type: 'EMAIL_VERIFICATION',
        createdAt: { gte: new Date(Date.now() - 60 * 1000) }, // Last 60 seconds
      },
    });

    if (recentToken) {
      return res.status(429).json({ 
        message: 'Please wait before requesting a new code',
        retryAfter: 60,
      });
    }

    // Generate new verification code
    const verificationCode = generateVerificationCode();
    
    // Save to database
    await prisma.verificationToken.create({
      data: {
        userId: user.id,
        token: verificationCode,
        type: 'EMAIL_VERIFICATION',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
      },
    });

    // Send email
    await sendVerificationEmail(user.email, verificationCode, user.name || undefined);

    res.json({ 
      message: 'Verification code sent to your email',
    });
  } catch (error) {
    logger.error('Resend verification error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * 忘记密码
 */
export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
    });

    // 如果用户不存在，返回错误（改进用户体验）
    if (!user) {
      return res.status(404).json({ 
        error: 'Email not found',
        message: 'This email didn\'t sign up. Please check your email or create a new account.',
      });
    }

    // Check rate limiting
    const recentToken = await prisma.verificationToken.findFirst({
      where: {
        userId: user.id,
        type: 'PASSWORD_RESET',
        createdAt: { gte: new Date(Date.now() - 60 * 1000) },
      },
    });

    if (recentToken) {
      return res.status(429).json({ 
        message: 'Please wait before requesting another reset code',
        retryAfter: 60,
      });
    }

    // Generate reset code
    const resetCode = generateVerificationCode();
    
    // Save to database
    await prisma.verificationToken.create({
      data: {
        userId: user.id,
        token: resetCode,
        type: 'PASSWORD_RESET',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
      },
    });

    // Send email
    await sendPasswordResetEmail(email, resetCode, user.name || undefined);

    res.json({ 
      message: 'If the email exists, a reset code has been sent',
    });
  } catch (error) {
    logger.error('Forgot password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * 重置密码
 */
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { email, code, newPassword } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid reset code' });
    }

    // Find valid reset token
    const token = await prisma.verificationToken.findFirst({
      where: {
        userId: user.id,
        token: code,
        type: 'PASSWORD_RESET',
        expiresAt: { gte: new Date() },
        usedAt: null,
      },
    });

    if (!token) {
      return res.status(400).json({ 
        message: 'Invalid or expired reset code' 
      });
    }

    // Check if new password is same as old password
    if (user.password) {
      const isSamePassword = await bcrypt.compare(newPassword, user.password);
      if (isSamePassword) {
        return res.status(400).json({ 
          error: 'Same password',
          message: 'New password must be different from your current password. Please choose a different password.',
        });
      }
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password and increment token version (invalidate all tokens)
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        tokenVersion: user.tokenVersion + 1,
        refreshToken: null,
      },
    });

    // Mark token as used
    await prisma.verificationToken.update({
      where: { id: token.id },
      data: { usedAt: new Date() },
    });

    res.json({ 
      message: 'Password reset successfully. Please login with your new password.',
    });
  } catch (error) {
    logger.error('Reset password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * 刷新 Token
 */
export const refreshToken = async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ message: 'Refresh token required' });
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, JWT_SECRET) as any;

    if (decoded.type !== 'refresh') {
      return res.status(401).json({ message: 'Invalid token type' });
    }

    // Get user and verify token version
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
    });

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }

    if (user.tokenVersion !== decoded.version) {
      return res.status(401).json({ message: 'Token has been revoked' });
    }

    // Generate new access token
    const newAccessToken = jwt.sign(
      { 
        id: user.id, 
        email: user.email,
        verified: user.isEmailVerified,
        version: user.tokenVersion,
      },
      JWT_SECRET,
      { expiresIn: JWT_ACCESS_EXPIRY }
    );

    res.json({ 
      token: newAccessToken,
    });
  } catch (error) {
    logger.error('Refresh token error:', error);
    res.status(401).json({ message: 'Invalid or expired refresh token' });
  }
};

/**
 * 登出（撤销 refresh token）
 */
export const logout = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;

    // Clear refresh token
    await prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * 开发模式：获取最新验证码（仅用于测试）
 */
export const getLatestVerificationCode = async (req: Request, res: Response) => {
  // 仅在开发环境启用
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ message: 'Not available in production' });
  }

  try {
    const userId = req.user.id;
    const token = await prisma.verificationToken.findFirst({
      where: {
        userId,
        type: 'EMAIL_VERIFICATION',
        usedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!token) {
      return res.status(404).json({ message: 'No verification code found' });
    }

    res.json({
      code: token.token,
      expiresAt: token.expiresAt,
      createdAt: token.createdAt,
      message: '⚠️ Development mode only - Do not use in production',
    });
  } catch (error) {
    logger.error('Error getting verification code:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Google 登录
 */
export const googleLogin = async (req: Request, res: Response) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ message: 'ID token is required' });
    }

    // 验证 Google ID Token
    let ticket;
    try {
      ticket = await googleClient.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
    } catch (error) {
      logger.error('Google token verification failed:', error);
      return res.status(401).json({ message: 'Invalid Google token' });
    }

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      return res.status(401).json({ message: 'Invalid token payload' });
    }

    const { email, name, picture, sub: googleId } = payload;

    // 查找或创建用户
    let user = await prisma.user.findUnique({
      where: { email },
    });

    if (user) {
      // 用户已存在，更新 Google ID 和信息（如果需要）
      if (user.authProvider !== 'google' && !user.googleId) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            googleId,
            authProvider: 'google',
            isEmailVerified: true, // Google 账号邮箱已验证
            avatarUrl: picture || user.avatarUrl,
          },
        });
      }
    } else {
      // 创建新用户
      user = await prisma.user.create({
        data: {
          email,
          name: name || email.split('@')[0],
          googleId,
          authProvider: 'google',
          isEmailVerified: true, // Google 账号邮箱已验证
          avatarUrl: picture,
          // Google 登录不需要密码
          password: '',
        },
      });

      // 发送欢迎邮件
      try {
        await sendWelcomeEmail(user.email, user.name || '');
      } catch (emailError) {
        logger.error('Failed to send welcome email:', emailError);
        // 继续，不因邮件失败而中断登录
      }
    }

    // 生成 JWT tokens
    const accessToken = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_ACCESS_EXPIRY }
    );

    const refreshToken = jwt.sign(
      { id: user.id, email: user.email, type: 'refresh' },
      JWT_SECRET,
      { expiresIn: JWT_REFRESH_EXPIRY }
    );

    // 保存 refresh token
    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 天
      },
    });

    logger.info(`Google login successful for user: ${user.email}`);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        isEmailVerified: user.isEmailVerified,
        authProvider: user.authProvider,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    logger.error('Get verification code error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};


