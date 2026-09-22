import express from 'express';
import authenticateToken from '../middleware/auth';
import { listNotifications, markNotificationRead, markAllRead } from '../controllers/notificationController';

const router = express.Router();

router.get('/', authenticateToken, listNotifications as any);
router.patch('/read-all', authenticateToken, markAllRead as any);
router.patch('/:id/read', authenticateToken, markNotificationRead as any);

export default router;
