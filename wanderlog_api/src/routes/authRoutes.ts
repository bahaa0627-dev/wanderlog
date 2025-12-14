import { Router } from 'express';
import {
  register,
  login,
  getMe,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  refreshToken,
  logout,
  getLatestVerificationCode,
} from '../controllers/authController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/refresh-token', refreshToken);

// Protected routes (require authentication)
router.get('/me', authenticateToken, getMe);
router.post('/verify-email', authenticateToken, verifyEmail);
router.post('/resend-verification', authenticateToken, resendVerification);
router.post('/logout', authenticateToken, logout);

// Development only routes
router.get('/dev/verification-code', authenticateToken, getLatestVerificationCode);

export default router;



