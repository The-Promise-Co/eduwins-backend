import express from 'express';
import authenticateToken from '../middleware/auth';
import requireAdmin from '../middleware/requireAdmin';
import {
  listVettingQueue,
  processVetting,
  verifyDocument,
  rejectDocument,
  getWelfareAnalytics,
  listPlatformConfigs,
  createPlatformConfig,
  updatePlatformConfig,
  deletePlatformConfig,
} from '../controllers/adminController';

const router = express.Router();

// Vetting queue
router.get('/vetting', authenticateToken, listVettingQueue as any);
router.post('/vetting/:teacherId', authenticateToken, processVetting as any);

// Document verification
router.put('/documents/:documentId/verify', authenticateToken, verifyDocument as any);
router.put('/documents/:documentId/reject', authenticateToken, rejectDocument as any);

// Welfare Analytics
router.get('/welfare-analytics', authenticateToken, getWelfareAnalytics as any);

// Platform config: tutor/welfare/fee split rules
router.get('/configs', authenticateToken, requireAdmin as any, listPlatformConfigs as any);
router.post('/configs', authenticateToken, requireAdmin as any, createPlatformConfig as any);
router.put('/configs/:id', authenticateToken, requireAdmin as any, updatePlatformConfig as any);
router.delete('/configs/:id', authenticateToken, requireAdmin as any, deletePlatformConfig as any);

export default router;
