require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db } = require('./config/firebase');

const app = express();

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
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
app.use('/api', limiter);

// Firebase initialized via config/firebase.js
console.log('✓ Firebase Real time Database configured');

// Routes
const authRoutes = require('./routes/auth');
const paymentRoutes = require('./routes/payments');
const uploadRoutes = require('./routes/uploads');
const housingRoutes = require('./routes/housing');
const withdrawalRoutes = require('./routes/withdrawals');
const ambassadorRoutes = require('./routes/ambassador');
const progressRoutes = require('./routes/progressReports');
const adminRoutes = require('./routes/admin');
const vaultRoutes = require('./routes/vault');
const paystackRoutes = require('./routes/paystack');
const lessonRoutes = require('./routes/lessons');

// Upload endpoint for teacher photos (Firebase compatible)
const authenticateToken = require('./middleware/auth');
app.post('/api/teachers/upload-photo', authenticateToken, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const photoUrl = `/photo-${req.file.filename}`;

    // Update teacher profile with photo URL in Firebase
    await db.ref(`teacher_profiles/${req.user.id}`).update({
      photo_url: photoUrl,
    });

    res.json({ photoUrl, message: 'Photo uploaded successfully' });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Failed to upload photo' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/premium', uploadRoutes); // Premium features use same file
app.use('/api/housing', housingRoutes);
app.use('/api/admin/housing', housingRoutes); // Admin housing endpoints
app.use('/api/withdrawals', withdrawalRoutes); // Teacher cash-out / withdrawal system
app.use('/api/lessons', lessonRoutes); // Lesson completion + parent approval + OTP flow
app.use('/api/ambassadors', ambassadorRoutes);
app.use('/api/progress-reports', progressRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/vault', vaultRoutes);
app.use('/api/paystack', paystackRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'Backend is running', timestamp: new Date() });
});

// Test auth endpoint
app.post('/api/auth/test', (req, res) => {
  res.json({ message: 'Auth route test successful', body: req.body });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || process.env.BACKEND_PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
  console.log(`📍 API available at http://localhost:${PORT}/api`);
});
