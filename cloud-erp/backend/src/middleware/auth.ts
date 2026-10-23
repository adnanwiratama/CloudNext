import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Knex } from 'knex';
import db, { runWithDb } from '../config/database';
import { getEnvDb, DbEnv } from '../config/envDb';

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
      // Environment-aware DB connection resolved per request (Option C).
      dbEnv?: DbEnv;
      db?: Knex;
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

    // Resolve the environment carried in the token ('prod' | 'sandbox') and
    // attach the matching DB connection for this request.
    const env: DbEnv = decoded.env === 'sandbox' ? 'sandbox' : 'prod';
    const edb = getEnvDb(env);
    req.dbEnv = env;
    req.db = edb;

    const user = await edb('users')
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

    // Bind the resolved environment connection for the rest of this request so
    // every `import db` usage transparently targets prod or sandbox.
    runWithDb(edb, () => next());
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

    const rdb = req.db || db;
    const hasPermission = await rdb('role_permissions as rp')
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
