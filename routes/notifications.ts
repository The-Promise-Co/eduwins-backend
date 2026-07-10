import express from 'express';
import authenticateToken from '../middleware/auth';
import { listNotifications, markNotificationRead } from '../controllers/notificationController';

const router = express.Router();

router.get('/', authenticateToken, listNotifications as any);
router.patch('/:id/read', authenticateToken, markNotificationRead as any);

export default router;
