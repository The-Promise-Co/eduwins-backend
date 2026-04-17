import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { db } from './database/db';
import { teacherProfiles } from './database/schema';
import { eq } from 'drizzle-orm';

// Importing routes
import authRoutes from './routes/auth';
import paymentRoutes from './routes/payments';
import uploadRoutes from './routes/uploads';
import premiumRoutes from './routes/premium';
import housingRoutes from './routes/housing';
import withdrawalRoutes from './routes/withdrawals';
import ambassadorRoutes from './routes/ambassador';
import progressRoutes from './routes/progressReports';
import adminRoutes from './routes/admin';
import vaultRoutes from './routes/vault';
import paystackRoutes from './routes/paystack';
import lessonRoutes from './routes/lessons';

import authenticateToken from './middleware/auth';
import { initRedis } from './config/redis';

const app = express();
// initRedis();

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'photo-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Security middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.static(uploadsDir));

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
app.use('/api', limiter);

// Upload endpoint for teacher photos
// app.post('/api/teachers/upload-photo', authenticateToken, upload.single('photo'), async (req: Request & { file?: Express.Multer.File, user: any }, res: Response) => {
//   try {
//     if (!req.file) {
//       return res.status(400).json({ error: 'No file uploaded' });
//     }

//     const photoUrl = `/photo-${req.file.filename}`;

//     // Update teacher profile with photo URL in Postgres
//     await db.update(teacherProfiles)
//       .set({ photoUrl })
//       .where(eq(teacherProfiles.userId, req.user.id));

//     res.json({ photoUrl, message: 'Photo uploaded successfully' });
//   } catch (err) {
//     console.error('Upload error:', err);
//     res.status(500).json({ error: 'Failed to upload photo' });
//   }
// });

app.use('/api/auth', authRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/premium', premiumRoutes);
app.use('/api/housing', housingRoutes);
app.use('/api/admin/housing', housingRoutes);
app.use('/api/withdrawals', withdrawalRoutes);
app.use('/api/lessons', lessonRoutes);
app.use('/api/ambassadors', ambassadorRoutes);
app.use('/api/progress-reports', progressRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/vault', vaultRoutes);
app.use('/api/paystack', paystackRoutes);

app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'Backend is running', timestamp: new Date() });
});

// Error handling middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || process.env.BACKEND_PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
  console.log(`📍 API available at http://localhost:${PORT}/api`);
});
