import express from 'express';
import { searchTeachers } from '../controllers/teacherController';

const router = express.Router();

router.get('/search', searchTeachers as any);

export default router;
