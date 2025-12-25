import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: any; // Replace 'any' with specific user type if available
    }
  }
}

// Initialize Supabase client for token verification
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export const authenticateToken = async (req: Request, res: Response, next: NextFunction): Promise<void | Response> => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  console.log('[Auth] Token present:', !!token);

  if (!token) {
    return res.status(401).json({ message: 'Authentication token required' });
  }

  try {
    // First try to verify with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    console.log('[Auth] Supabase user:', user?.id, user?.email);
    console.log('[Auth] Supabase error:', error?.message);
    
    if (!error && user) {
      // Supabase token is valid
      req.user = {
        id: user.id,
        email: user.email,
        // Include legacy_id from user_metadata if available (for backward compatibility)
        legacyId: user.user_metadata?.legacy_id,
      };
      console.log('[Auth] User authenticated via Supabase:', req.user.id);
      return next();
    }

    // Fallback to local JWT verification for backward compatibility
    const secret = process.env.JWT_SECRET || 'default_secret';
    jwt.verify(token, secret, (err: any, decoded: any) => {
      if (err) {
        console.log('[Auth] JWT verification failed:', err.message);
        return res.status(403).json({ message: 'Invalid or expired token' });
      }
      req.user = decoded;
      console.log('[Auth] User authenticated via JWT:', req.user.id);
      return next();
    });
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(403).json({ message: 'Invalid or expired token' });
  }
};

/**
 * Optional auth: if Authorization is present, verify and set req.user; otherwise continue.
 * This lets public endpoints still获取用户上下文（比如收藏状态）而不强制登录。
 */
export const authenticateTokenIfPresent = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return next();
  }

  try {
    // First try Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (!error && user) {
      req.user = {
        id: user.id,
        email: user.email,
        legacyId: user.user_metadata?.legacy_id,
      };
      return next();
    }

    // Fallback to local JWT
    const secret = process.env.JWT_SECRET || 'default_secret';
    jwt.verify(token, secret, (err: any, decoded: any) => {
      if (!err) {
        req.user = decoded;
      }
      return next();
    });
  } catch (error) {
    // 无论校验成功与否，都继续，不阻断请求
    return next();
  }
};






