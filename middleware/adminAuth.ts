import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../database/db';
import { adminUsers } from '../database/schema';
import { eq } from 'drizzle-orm';

interface AdminAuthRequest extends Request {
  admin?: {
    id: string;
    role: string;
    permissions: Record<string, any>;
  };
}

const adminAuthMiddleware = async (req: AdminAuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as { id: string; role: string };

    const admin = await db.query.adminUsers.findFirst({
      where: eq(adminUsers.id, decoded.id),
    });

    if (!admin) {
      return res.status(401).json({ error: 'Admin not found' });
    }

    if (!admin.isActive) {
      return res.status(403).json({ error: 'Admin account is deactivated' });
    }

    req.admin = {
      id: admin.id,
      role: admin.role,
      permissions: (admin.permissions as Record<string, any>) || {},
    };

    next();
  } catch (err: any) {
    res.status(401).json({ error: 'Please authenticate', details: err.message });
  }
};

export default adminAuthMiddleware;
