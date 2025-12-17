import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: any; // Replace 'any' with specific user type if available
    }
  }
}

export const authenticateToken = (req: Request, res: Response, next: NextFunction): void | Response => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ message: 'Authentication token required' });
  }

  const secret = process.env.JWT_SECRET || 'default_secret';

  jwt.verify(token, secret, (err: any, user: any) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid or expired token' });
    }
    req.user = user;
    return next();
  });
};

/**
 * Optional auth: if Authorization is present, verify and set req.user; otherwise continue.
 * This lets public endpoints still获取用户上下文（比如收藏状态）而不强制登录。
 */
export const authenticateTokenIfPresent = (req: Request, _res: Response, next: NextFunction): void => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return next();
  }

  const secret = process.env.JWT_SECRET || 'default_secret';

  jwt.verify(token, secret, (err: any, user: any) => {
    if (!err) {
      req.user = user;
    }
    // 无论校验成功与否，都继续，不阻断请求（失败只是不带用户信息）
    return next();
  });
};






