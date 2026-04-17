import express from 'express';
import authenticateToken from '../middleware/auth';
import { createReport, getReports } from '../controllers/progressReportController';

const router = express.Router();

router.post('/', authenticateToken, createReport as any);
router.get('/my', authenticateToken, getReports as any);

export default router;
