import express from 'express';
import adminAuthMiddleware from '../middleware/adminAuth';
import {
  adminLogin,
  adminGetMe,
  createAdmin,
  listAdmins,
  getAdminById,
  updateAdmin,
  changeAdminPassword,
  deleteAdmin,
} from '../controllers/adminAuthController';

const router = express.Router();

// Public
router.post('/login', adminLogin);

// Protected (any admin)
router.get('/me', adminAuthMiddleware as any, adminGetMe as any);

// Superadmin only
router.post('/create', adminAuthMiddleware as any, createAdmin as any);
router.get('/list', adminAuthMiddleware as any, listAdmins as any);
router.get('/:id', adminAuthMiddleware as any, getAdminById as any);
router.put('/:id', adminAuthMiddleware as any, updateAdmin as any);
router.put('/:id/password', adminAuthMiddleware as any, changeAdminPassword as any);
router.delete('/:id', adminAuthMiddleware as any, deleteAdmin as any);

export default router;
