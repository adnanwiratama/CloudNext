import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import db from '../config/database';

export interface AuthUser {
  id: string;
  companyId: string;
  email: string;
  name: string;
  isAdmin: boolean;
  roleId: string;
  subsidiaryId: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret') as any;

    const user = await db('users')
      .where({ id: decoded.userId, is_active: true })
      .first();

    if (!user) {
      res.status(401).json({ success: false, error: 'User not found or inactive' });
      return;
    }

    req.user = {
      id: user.id,
      companyId: user.company_id,
      email: user.email,
      name: user.name,
      isAdmin: user.is_admin,
      roleId: user.role_id,
      subsidiaryId: user.subsidiary_id,
    };

    next();
  } catch (error) {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
};

export const requirePermission = (module: string, resource: string, action: string) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    if (req.user.isAdmin) {
      next();
      return;
    }

    const hasPermission = await db('role_permissions as rp')
      .join('permissions as p', 'rp.permission_id', 'p.id')
      .where({
        'rp.role_id': req.user.roleId,
        'p.module': module,
        'p.resource': resource,
        'p.action': action,
      })
      .first();

    if (!hasPermission) {
      res.status(403).json({
        success: false,
        error: `You do not have permission to ${action} ${resource} in ${module}`,
      });
      return;
    }

    next();
  };
};

export const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user?.isAdmin) {
    res.status(403).json({ success: false, error: 'Administrator access required' });
    return;
  }
  next();
};
