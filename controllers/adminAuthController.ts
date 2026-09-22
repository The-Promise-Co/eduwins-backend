import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { db } from '../database/db';
import { adminUsers } from '../database/schema';
import { eq } from 'drizzle-orm';
import logger from '../utils/logger';

interface AdminAuthRequest extends Request {
  admin?: {
    id: string;
    role: string;
    permissions: Record<string, any>;
  };
}

export const adminLogin = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const admin = await db.query.adminUsers.findFirst({
      where: eq(adminUsers.email, email),
    });

    if (!admin) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!admin.isActive) {
      return res.status(403).json({ error: 'Admin account is deactivated' });
    }

    const valid = await bcrypt.compare(password, admin.passwordHash || '');
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await db.update(adminUsers)
      .set({ lastLogin: new Date() })
      .where(eq(adminUsers.id, admin.id));

    const token = jwt.sign(
      { id: admin.id, role: admin.role },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: admin.id,
        firstName: admin.firstName,
        lastName: admin.lastName,
        fullName: `${admin.firstName} ${admin.lastName}`,
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions,
      },
    });
    logger.info({ adminId: admin.id }, 'Admin logged in successfully');
  } catch (err: any) {
    logger.error({ err }, 'Admin login error');
    res.status(500).json({ error: 'Login failed. Please try again later.' });
  }
};

export const adminGetMe = async (req: AdminAuthRequest, res: Response) => {
  try {
    const adminId = req.admin?.id;

    const admin = await db.query.adminUsers.findFirst({
      where: eq(adminUsers.id, adminId!),
    });

    if (!admin) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    res.json({
      id: admin.id,
      firstName: admin.firstName,
      lastName: admin.lastName,
      fullName: `${admin.firstName} ${admin.lastName}`,
      email: admin.email,
      role: admin.role,
      permissions: admin.permissions,
      isActive: admin.isActive,
      lastLogin: admin.lastLogin,
      createdAt: admin.createdAt,
    });
  } catch (err: any) {
    logger.error({ err }, 'Admin get me error');
    res.status(500).json({ error: 'Failed to fetch admin profile' });
  }
};

export const createAdmin = async (req: AdminAuthRequest, res: Response) => {
  const { email, password, firstName, lastName, role, permissions } = req.body;

  try {
    if (req.admin?.role !== 'superadmin') {
      return res.status(403).json({ error: 'Only superadmin can create admin users' });
    }

    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ error: 'All required fields must be provided' });
    }

    const existing = await db.query.adminUsers.findFirst({
      where: eq(adminUsers.email, email),
    });

    if (existing) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const adminId = Math.random().toString(36).substring(2, 15);

    const [newAdmin] = await db.insert(adminUsers).values({
      id: adminId,
      email,
      passwordHash,
      firstName,
      lastName,
      role: role || 'admin',
      permissions: permissions || {},
      isActive: true,
    }).returning();

    res.status(201).json({
      message: 'Admin user created successfully',
      admin: {
        id: newAdmin.id,
        email: newAdmin.email,
        firstName: newAdmin.firstName,
        lastName: newAdmin.lastName,
        role: newAdmin.role,
        permissions: newAdmin.permissions,
      },
    });
    logger.info({ adminId: newAdmin.id, email }, 'New admin user created');
  } catch (err: any) {
    logger.error({ err }, 'Create admin error');
    res.status(500).json({ error: 'Failed to create admin user' });
  }
};

export const listAdmins = async (req: AdminAuthRequest, res: Response) => {
  try {
    if (req.admin?.role !== 'superadmin') {
      return res.status(403).json({ error: 'Only superadmin can list admin users' });
    }

    const admins = await db.query.adminUsers.findMany();

    res.json(admins.map((a) => ({
      id: a.id,
      email: a.email,
      firstName: a.firstName,
      lastName: a.lastName,
      role: a.role,
      permissions: a.permissions,
      isActive: a.isActive,
      lastLogin: a.lastLogin,
      createdAt: a.createdAt,
    })));
  } catch (err: any) {
    logger.error({ err }, 'List admins error');
    res.status(500).json({ error: 'Failed to list admin users' });
  }
};

export const getAdminById = async (req: AdminAuthRequest, res: Response) => {
  const { id } = req.params;

  try {
    if (req.admin?.role !== 'superadmin' && req.admin?.id !== id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const admin = await db.query.adminUsers.findFirst({
      where: eq(adminUsers.id, id),
    });

    if (!admin) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    res.json({
      id: admin.id,
      email: admin.email,
      firstName: admin.firstName,
      lastName: admin.lastName,
      role: admin.role,
      permissions: admin.permissions,
      isActive: admin.isActive,
      lastLogin: admin.lastLogin,
      createdAt: admin.createdAt,
      updatedAt: admin.updatedAt,
    });
  } catch (err: any) {
    logger.error({ err }, 'Get admin by id error');
    res.status(500).json({ error: 'Failed to fetch admin user' });
  }
};

export const updateAdmin = async (req: AdminAuthRequest, res: Response) => {
  const { id } = req.params;
  const { role, permissions, isActive, firstName, lastName } = req.body;

  try {
    if (req.admin?.role !== 'superadmin') {
      return res.status(403).json({ error: 'Only superadmin can update admin users' });
    }

    const admin = await db.query.adminUsers.findFirst({
      where: eq(adminUsers.id, id),
    });

    if (!admin) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (role !== undefined) updateData.role = role;
    if (permissions !== undefined) updateData.permissions = permissions;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;

    await db.update(adminUsers)
      .set(updateData)
      .where(eq(adminUsers.id, id));

    res.json({ message: 'Admin user updated successfully' });
    logger.info({ adminId: id }, 'Admin user updated');
  } catch (err: any) {
    logger.error({ err }, 'Update admin error');
    res.status(500).json({ error: 'Failed to update admin user' });
  }
};

export const changeAdminPassword = async (req: AdminAuthRequest, res: Response) => {
  const { id } = req.params;
  const { newPassword } = req.body;

  try {
    if (req.admin?.role !== 'superadmin') {
      return res.status(403).json({ error: 'Only superadmin can change admin passwords' });
    }

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const admin = await db.query.adminUsers.findFirst({
      where: eq(adminUsers.id, id),
    });

    if (!admin) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db.update(adminUsers)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(adminUsers.id, id));

    res.json({ message: 'Password updated successfully' });
    logger.info({ adminId: id }, 'Admin password changed');
  } catch (err: any) {
    logger.error({ err }, 'Change admin password error');
    res.status(500).json({ error: 'Failed to change password' });
  }
};

export const deleteAdmin = async (req: AdminAuthRequest, res: Response) => {
  const { id } = req.params;

  try {
    if (req.admin?.role !== 'superadmin') {
      return res.status(403).json({ error: 'Only superadmin can delete admin users' });
    }

    if (req.admin?.id === id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const admin = await db.query.adminUsers.findFirst({
      where: eq(adminUsers.id, id),
    });

    if (!admin) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    if (admin.role === 'superadmin') {
      const superadmins = await db.query.adminUsers.findMany({
        where: eq(adminUsers.role, 'superadmin'),
      });
      if (superadmins.length <= 1) {
        return res.status(400).json({ error: 'Cannot delete the last superadmin' });
      }
    }

    await db.delete(adminUsers).where(eq(adminUsers.id, id));

    res.json({ message: 'Admin user deleted successfully' });
    logger.info({ adminId: id }, 'Admin user deleted');
  } catch (err: any) {
    logger.error({ err }, 'Delete admin error');
    res.status(500).json({ error: 'Failed to delete admin user' });
  }
};
