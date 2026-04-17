import express from 'express';
import authenticateToken from '../middleware/auth';
import {
  getParentChildren,
  getParentPendingConfirmations,
  parentConfirmLesson,
  teacherCompleteLesson,
} from '../controllers/lessonController';

const router = express.Router();

router.get('/parent/children', authenticateToken, getParentChildren as any);
router.get('/parent/pending', authenticateToken, getParentPendingConfirmations as any);
router.post('/:lessonId/confirm', authenticateToken, parentConfirmLesson as any);
router.post('/:lessonId/complete', authenticateToken, teacherCompleteLesson as any);

export default router;
