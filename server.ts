import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger';
import { db } from './database/db';
import { teacherProfiles } from './database/schema';
import { eq } from 'drizzle-orm';

// Importing routes
import authRoutes from './routes/auth';
import paymentRoutes from './routes/payments';
import uploadRoutes from './routes/uploads';
import withdrawalRoutes from './routes/withdrawals';
import adminRoutes from './routes/admin';
import vaultRoutes from './routes/vault';
import paystackRoutes from './routes/paystack';
import lessonRoutes from './routes/lessons';
import subjectRoutes from './routes/subjects';
import courseRoutes from './routes/courses';
import referralRoutes from './routes/referrals';
import childrenRoutes from './routes/children';
import teacherRoutes from './routes/teachers';
import walletRoutes from './routes/wallets';
import bookingRoutes from './routes/bookings';
import notificationRoutes from './routes/notifications';

import authenticateToken from './middleware/auth';
import { initRedis } from './config/redis';
import logger from './utils/logger';
import { requestLogger } from './middleware/requestLogger';

const app = express();
// initRedis();

const isProduction = process.env.NODE_ENV === 'production';

const configuredPort = Number(process.env.PORT || process.env.BACKEND_PORT);
const PORT = Number.isFinite(configuredPort) ? configuredPort : 5000;
const HOST = process.env.HOST || (isProduction ? '' : 'localhost');


const PUBLIC_API_URL =
  process.env.PUBLIC_API_URL ||
  process.env.BACKEND_URL ||
  `http://${HOST === '0:0:0:0' ? 'localhost' : HOST}:${PORT}/api`;



const allowedOrigins = (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

if (isProduction) {

  app.set('trust proxy', 1);
}

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
app.use(cors({
  origin: allowedOrigins.length ? allowedOrigins : true,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(requestLogger);
app.use(express.json());
app.use(express.static(uploadsDir));

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
app.use('/api/withdrawals', withdrawalRoutes);
app.use('/api/lessons', lessonRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/vault', vaultRoutes);
app.use('/api/paystack', paystackRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/referrals', referralRoutes);
app.use('/api/children', childrenRoutes);
app.use('/api/teachers', teacherRoutes);
app.use('/api/wallets', walletRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/notifications', notificationRoutes);

app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'Backend is running', timestamp: new Date() });
});

// Swagger Documentation Route
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { explorer: true }));

// Error handling middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  const requestId = req.id;
  const log = req.log || logger;

  log.error({
    err,
    requestId,
    method: req.method,
    path: req.originalUrl || req.url,
    userId: (req as any).user?.id,
    role: (req as any).user?.role,
  }, 'request.unhandled_error');

  res.status(500).json({ error: 'Internal server error', requestId });
});

logger.info({ port: PORT, host: HOST, publicApiUrl: PUBLIC_API_URL, isProduction }, 'server.starting');

app.listen(PORT, HOST, () => {
  logger.info({ port: PORT, host: HOST, publicApiUrl: PUBLIC_API_URL }, 'server.started');
});
