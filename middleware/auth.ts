import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../database/db';
import { users } from '../database/schema';
import { eq } from 'drizzle-orm';

interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
  };
}

const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as { id: string; role: string };
    
    // Query Postgres using Drizzle
    const user = await db.query.users.findFirst({
      where: eq(users.id, decoded.id),
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = { 
      id: user.id, 
      role: user.role 
    };
    
    next();
  } catch (err: any) {
    res.status(401).json({ error: 'Please authenticate', details: err.message });
  }
};

export default authMiddleware;
