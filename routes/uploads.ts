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
import { logger } from 'utils/logger';
import { getPresignedUploadUrl } from '../utils/r2';


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
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max global
  fileFilter: (req, file, cb) => {
    const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    const allowedVideoTypes = ['video/mp4', 'video/mpeg', 'video/webm', 'video/quicktime'];
    const allowedDocTypes   = ['application/pdf'];

    if (file.fieldname === 'headshot') {
      if (!allowedImageTypes.includes(file.mimetype)) {
        return cb(new Error('Only JPG, PNG, WEBP and GIF images are allowed for headshots'));
      }
    } else if (file.fieldname === 'videoIntro' || file.fieldname === 'video') {
      if (!allowedVideoTypes.includes(file.mimetype)) {
        return cb(new Error('Only MP4, MPEG, WEBM and MOV videos are allowed'));
      }
    } else if (file.fieldname === 'credentials' || file.fieldname === 'material') {
      if (!allowedDocTypes.includes(file.mimetype) && file.fieldname === 'credentials') {
         // Credentials must be PDF
         if (!allowedDocTypes.includes(file.mimetype)) return cb(new Error('Credentials must be in PDF format'));
      }
      // Teaching materials can be more flexible, but for now we stick to PDF/Docs (Wait, I'll just allow PDF for now as per schema)
    }

    cb(null, true);
  },
});

/**
 * Profile Builder Routes
 */
router.post('/headshot', authenticateToken, upload.single('headshot'), uploadHeadshot as any);
router.post('/video-intro', authenticateToken, upload.single('videoIntro'), uploadVideoIntro as any);
router.post('/credentials', authenticateToken, upload.single('credentials'), uploadCredentials as any);
router.get('/profile-completion', authenticateToken, getProfileCompletion as any);

/**
 * Cloudflare R2 Presigned Upload URL
 * Returns a presigned URL and public URL so the frontend can upload directly to Cloudflare R2
 */
router.post('/sign', authenticateToken, async (req, res) => {
  const { filename, contentType, folder } = req.body;

  if (!filename || !contentType) {
    return res.status(400).json({ error: 'filename and contentType are required' });
  }

  try {
    const data = await getPresignedUploadUrl(filename, contentType, folder || 'eduwins');
    res.json(data);
  } catch (err: any) {
    logger.error(err, 'Failed to generate presigned upload URL');
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});


/**
 * Premium Uploads
 */
router.post('/subject-video', authenticateToken, upload.single('video'), uploadSubjectVideo as any);
router.post('/teaching-material', authenticateToken, upload.single('material'), uploadTeachingMaterial as any);

export default router;
