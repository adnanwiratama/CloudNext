import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../../config/database';
import { authenticate } from '../../middleware/auth';
import { getEnvDb, resolveCompanyEnv } from '../../config/envDb';
import { createAuditLog } from '../../utils/audit';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, companyCode } = req.body;

    if (!email || !password) {
      res.status(400).json({ success: false, error: 'Email and password are required' });
      return;
    }

    // Resolve environment from the Company Code: a trailing "-SB" selects the
    // sandbox DB. All auth queries below run against the resolved environment's DB.
    const { code: resolvedCode, env } = resolveCompanyEnv(companyCode);
    const edb = getEnvDb(env);

    // Find company first if code provided
    let companyId: string | undefined;
    if (resolvedCode) {
      const company = await edb('companies').where({ code: resolvedCode.toUpperCase(), is_active: true }).first();
      if (!company) {
        res.status(401).json({ success: false, error: 'Company code not found or inactive' });
        return;
      }
      companyId = company.id;
    }

    // Find user
    const query = edb('users as u')
      .join('companies as c', 'u.company_id', 'c.id')
      .leftJoin('roles as r', 'u.role_id', 'r.id')
      .leftJoin('subsidiaries as s', 'u.subsidiary_id', 's.id')
      .where({ 'u.email': email.toLowerCase(), 'u.is_active': true })
      .select('u.*', 'c.name as company_name', 'c.code as company_code', 'c.base_currency',
        'r.name as role_name', 's.name as subsidiary_name');

    if (companyId) query.where({ 'u.company_id': companyId });

    const user = await query.first();

    if (!user) {
      res.status(401).json({ success: false, error: 'Invalid email or password' });
      return;
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      res.status(401).json({ success: false, error: 'Invalid email or password' });
      return;
    }

    // Update last login
    await edb('users').where({ id: user.id }).update({ last_login_at: new Date() });

    // Encode the environment in the token so every subsequent request is routed
    // to the correct DB (prod or sandbox).
    const token = jwt.sign(
      { userId: user.id, companyId: user.company_id, email: user.email, env },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' } as any
    );

    const refreshToken = jwt.sign(
      { userId: user.id, env },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '7d' } as any
    );

    await createAuditLog({
      companyId: user.company_id,
      userId: user.id,
      action: 'login',
      entityType: 'user',
      entityId: user.id,
      entityNumber: user.email,
      ipAddress: req.ip,
      trx: edb, // write the audit log to the resolved environment's DB
    });

    res.json({
      success: true,
      data: {
        token,
        refreshToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          companyId: user.company_id,
          companyName: user.company_name,
          companyCode: user.company_code,
          baseCurrency: user.base_currency,
          subsidiaryId: user.subsidiary_id,
          subsidiaryName: user.subsidiary_name,
          roleId: user.role_id,
          roleName: user.role_name,
          isAdmin: user.is_admin,
          timezone: user.timezone,
          language: user.language,
          env, // 'prod' | 'sandbox' — which database this session is bound to
        },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Login failed. Please try again.' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ success: false, error: 'Refresh token required' });
      return;
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET || 'fallback-secret') as any;
    const env = decoded.env === 'sandbox' ? 'sandbox' : 'prod';
    const edb = getEnvDb(env);
    const user = await edb('users').where({ id: decoded.userId, is_active: true }).first();
    if (!user) {
      res.status(401).json({ success: false, error: 'User not found' });
      return;
    }

    const newToken = jwt.sign(
      { userId: user.id, companyId: user.company_id, email: user.email, env },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' } as any
    );

    res.json({ success: true, data: { token: newToken } });
  } catch {
    res.status(401).json({ success: false, error: 'Invalid refresh token' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await db('users as u')
      .join('companies as c', 'u.company_id', 'c.id')
      .leftJoin('roles as r', 'u.role_id', 'r.id')
      .leftJoin('subsidiaries as s', 'u.subsidiary_id', 's.id')
      .where({ 'u.id': req.user!.id })
      .select('u.*', 'c.name as company_name', 'c.code as company_code', 'c.base_currency',
        'r.name as role_name', 's.name as subsidiary_name')
      .first();

    // Get permissions
    const permissions = await db('role_permissions as rp')
      .join('permissions as p', 'rp.permission_id', 'p.id')
      .where({ 'rp.role_id': user.role_id })
      .select('p.module', 'p.resource', 'p.action');

    res.json({
      success: true,
      data: {
        id: user.id, name: user.name, email: user.email, phone: user.phone,
        companyId: user.company_id, companyName: user.company_name, companyCode: user.company_code,
        baseCurrency: user.base_currency, subsidiaryId: user.subsidiary_id, subsidiaryName: user.subsidiary_name,
        roleId: user.role_id, roleName: user.role_name, isAdmin: user.is_admin,
        timezone: user.timezone, language: user.language,
        permissions: user.is_admin ? [{ module: '*', resource: '*', action: '*' }] : permissions,
      },
    });
  } catch (e: any) {
    console.error("[ERP ERROR]", e.message);
    res.status(500).json({ success: false, error: 'Failed to fetch user profile' });
  }
});

// POST /api/auth/change-password
router.post('/change-password', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      res.status(400).json({ success: false, error: 'Current and new password required' });
      return;
    }
    if (newPassword.length < 8) {
      res.status(400).json({ success: false, error: 'New password must be at least 8 characters' });
      return;
    }

    const user = await db('users').where({ id: req.user!.id }).first();
    const match = await bcrypt.compare(currentPassword, user.password_hash);
    if (!match) {
      res.status(400).json({ success: false, error: 'Current password is incorrect' });
      return;
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await db('users').where({ id: req.user!.id }).update({ password_hash: hash });

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (e: any) {
    console.error("[ERP ERROR]", e.message);
    res.status(500).json({ success: false, error: 'Failed to change password' });
  }
});

export default router;
