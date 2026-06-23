import express from 'express';
import authenticateToken from '../middleware/auth';
import {
  createCourse,
  listCourses,
  getCoursesByTeacher,
  getCourseById,
  updateCourse,
  addModule,
  addLesson,
  updateLesson,
  deleteLesson,
  enrollCourse,
  getEnrolledCourses,
} from '../controllers/courses';

const router = express.Router();

const optionalAuth = (req: any, res: any, next: any) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (token) {
    authenticateToken(req, res, next);
  } else {
    next();
  }
};

// Base details
router.get('/', listCourses as any);
router.get('/teacher/:teacherId', optionalAuth, getCoursesByTeacher as any);
router.get('/enrolled', authenticateToken, getEnrolledCourses as any);
router.post('/', authenticateToken, createCourse as any);
router.get('/:id', getCourseById as any);
router.post('/:id/enroll', authenticateToken, enrollCourse as any);
router.put('/:id', authenticateToken, updateCourse as any);

// Modules and Lessons
router.post('/:id/modules', authenticateToken, addModule as any);
router.post('/modules/:moduleId/lessons', authenticateToken, addLesson as any);
router.put('/lessons/:lessonId', authenticateToken, updateLesson as any);
router.delete('/lessons/:lessonId', authenticateToken, deleteLesson as any);

export default router;
