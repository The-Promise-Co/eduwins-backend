import express from 'express';
import { getTeacherById, getTeacherAreas, searchTeachers } from '../controllers/teacherController';

const router = express.Router();

router.get('/search', searchTeachers as any);
router.get('/areas', getTeacherAreas as any);
router.get('/:id', getTeacherById as any);

export default router;
