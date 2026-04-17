import express from 'express';
import multer from 'multer';
import path from 'path';
import authenticateToken from '../middleware/auth';
import {
  uploadHeadshot,
  uploadVideoIntro,
  uploadCredentials,
  uploadSubjectVideo,
  uploadTeachingMaterial,
  getProfileCompletion,
} from '../controllers/uploadController';

const router = express.Router();

// Configure multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, 'file-' + uniqueSuffix + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max
});

/**
 * Profile Builder Routes
 */
router.post('/headshot', authenticateToken, upload.single('headshot'), uploadHeadshot as any);
router.post('/video-intro', authenticateToken, upload.single('videoIntro'), uploadVideoIntro as any);
router.post('/credentials', authenticateToken, upload.single('credentials'), uploadCredentials as any);
router.get('/profile-completion', authenticateToken, getProfileCompletion as any);

/**
 * Premium Uploads
 */
router.post('/subject-video', authenticateToken, upload.single('video'), uploadSubjectVideo as any);
router.post('/teaching-material', authenticateToken, upload.single('material'), uploadTeachingMaterial as any);

export default router;
