import express from 'express';
import authenticateToken from '../middleware/auth';
import {
  createCourse,
  getCourseById,
  updateCourse,
  addModule,
  addLesson
} from '../controllers/courseController';

const router = express.Router();

// Base details
router.post('/', authenticateToken, createCourse as any);
router.get('/:id', getCourseById as any);
router.put('/:id', authenticateToken, updateCourse as any);

// Modules and Lessons
router.post('/:id/modules', authenticateToken, addModule as any);
router.post('/modules/:moduleId/lessons', authenticateToken, addLesson as any);

export default router;
