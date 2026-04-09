const { db, admin } = require('../config/firebase');
const path = require('path');

/**
 * Upload teacher headshot
 */
exports.uploadHeadshot = async (req, res) => {
  const { id: teacherId } = req.user;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif'];
    if (!allowedMimes.includes(req.file.mimetype)) {
      return res.status(400).json({ error: 'Only image files allowed (JPEG, PNG, GIF)' });
    }

    if (req.file.size > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'File size must be less than 5MB' });
    }

    const photoUrl = `/uploads/headshots/headshot-${teacherId}-${Date.now()}${path.extname(req.file.originalname)}`;

    // Update teacher profile
    await db.ref(`users/${teacherId}`).update({
      headshot_url: photoUrl,
      headshot_uploaded_at: admin.database.ServerValue.TIMESTAMP,
    });

    // Also update teacher_profiles
    await db.ref(`teacher_profiles/${teacherId}`).update({
      photo_url: photoUrl,
    });

    res.status(200).json({
      message: 'Headshot uploaded successfully',
      photoUrl,
    });
  } catch (err) {
    console.error('Headshot upload error:', err);
    res.status(500).json({ error: 'Failed to upload headshot: ' + err.message });
  }
};

/**
 * Upload teacher video intro (max 1 minute)
 */
exports.uploadVideoIntro = async (req, res) => {
  const { id: teacherId } = req.user;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const allowedMimes = ['video/mp4', 'video/mpeg', 'video/quicktime'];
    if (!allowedMimes.includes(req.file.mimetype)) {
      return res.status(400).json({ error: 'Only video files allowed (MP4, MPEG, MOV)' });
    }

    if (req.file.size > 50 * 1024 * 1024) {
      return res.status(400).json({ error: 'File size must be less than 50MB' });
    }

    const videoUrl = `/uploads/intros/intro-${teacherId}-${Date.now()}${path.extname(req.file.originalname)}`;

    // Update teacher profile
    await db.ref(`users/${teacherId}`).update({
      video_intro_url: videoUrl,
      video_intro_uploaded_at: admin.database.ServerValue.TIMESTAMP,
    });

    res.status(200).json({
      message: 'Video intro uploaded successfully',
      videoUrl,
    });
  } catch (err) {
    console.error('Video intro upload error:', err);
    res.status(500).json({ error: 'Failed to upload video intro: ' + err.message });
  }
};

/**
 * Upload teacher credentials (PDF)
 */
exports.uploadCredentials = async (req, res) => {
  const { id: teacherId } = req.user;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Only PDF files allowed' });
    }

    if (req.file.size > 10 * 1024 * 1024) {
      return res.status(400).json({ error: 'File size must be less than 10MB' });
    }

    const credentialsUrl = `/uploads/credentials/creds-${teacherId}-${Date.now()}.pdf`;

    // Update teacher profile
    await db.ref(`users/${teacherId}`).update({
      credentials_url: credentialsUrl,
      credentials_uploaded_at: admin.database.ServerValue.TIMESTAMP,
      credentials_verified: false, // Admin verification needed
    });

    res.status(200).json({
      message: 'Credentials upload submitted for verification',
      credentialsUrl,
    });
  } catch (err) {
    console.error('Credentials upload error:', err);
    res.status(500).json({ error: 'Failed to upload credentials: ' + err.message });
  }
};

/**
 * Upload premium subject video
 */
exports.uploadSubjectVideo = async (req, res) => {
  const { id: teacherId } = req.user;
  const { subject, title, description, price } = req.body;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!subject || !title || !price) {
      return res.status(400).json({ error: 'Subject, title, and price are required' });
    }

    if (price <= 0) {
      return res.status(400).json({ error: 'Price must be greater than 0' });
    }

    // Check if teacher is premium
    const teacherSnapshot = await db.ref(`users/${teacherId}`).once('value');
    const teacher = teacherSnapshot.val();

    if (!teacher.is_premium || !teacher.subscription_active) {
      return res.status(403).json({
        error: 'Only premium teachers can upload subject videos. Subscribe for premium features.',
      });
    }

    const allowedMimes = ['video/mp4', 'video/mpeg'];
    if (!allowedMimes.includes(req.file.mimetype)) {
      return res.status(400).json({ error: 'Only MP4/MPEG videos allowed' });
    }

    if (req.file.size > 500 * 1024 * 1024) {
      // 500MB limit for subject videos
      return res.status(400).json({ error: 'Video file size must be less than 500MB' });
    }

    const videoId = db.ref('subject_videos').push().key;
    const videoUrl = `/uploads/subject-videos/video-${videoId}-${Date.now()}${path.extname(req.file.originalname)}`;

    const video = {
      id: videoId,
      teacherId,
      subject,
      title,
      description: description || '',
      videoUrl,
      price,
      views: 0,
      likes: 0,
      subscribers: [],
      createdAt: admin.database.ServerValue.TIMESTAMP,
      updatedAt: admin.database.ServerValue.TIMESTAMP,
    };

    await db.ref(`subject_videos/${videoId}`).set(video);

    // Add to teacher's video list
    await db.ref(`users/${teacherId}/subject_videos`).update({
      [videoId]: true,
    });

    res.status(201).json({
      message: 'Subject video uploaded successfully',
      video,
    });
  } catch (err) {
    console.error('Subject video upload error:', err);
    res.status(500).json({ error: 'Failed to upload subject video: ' + err.message });
  }
};

/**
 * Upload teaching material (PDF or Word)
 */
exports.uploadTeachingMaterial = async (req, res) => {
  const { id: teacherId } = req.user;
  const { subject, title, description, price } = req.body;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!subject || !title || !price) {
      return res.status(400).json({ error: 'Subject, title, and price are required' });
    }

    // Check if teacher is premium
    const teacherSnapshot = await db.ref(`users/${teacherId}`).once('value');
    const teacher = teacherSnapshot.val();

    if (!teacher.is_premium || !teacher.subscription_active) {
      return res.status(403).json({
        error: 'Only premium teachers can upload materials. Subscribe for premium features.',
      });
    }

    const allowedMimes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedMimes.includes(req.file.mimetype)) {
      return res.status(400).json({ error: 'Only PDF and Word documents allowed' });
    }

    if (req.file.size > 50 * 1024 * 1024) {
      return res.status(400).json({ error: 'File size must be less than 50MB' });
    }

    const materialId = db.ref('teaching_materials').push().key;
    const fileExt = path.extname(req.file.originalname);
    const materialUrl = `/uploads/materials/material-${materialId}-${Date.now()}${fileExt}`;

    const material = {
      id: materialId,
      teacherId,
      subject,
      title,
      description: description || '',
      materialUrl,
      fileType: fileExt === '.pdf' ? 'pdf' : 'word',
      price,
      downloads: 0,
      purchasers: [],
      createdAt: admin.database.ServerValue.TIMESTAMP,
      updatedAt: admin.database.ServerValue.TIMESTAMP,
    };

    await db.ref(`teaching_materials/${materialId}`).set(material);

    // Add to teacher's materials list
    await db.ref(`users/${teacherId}/teaching_materials`).update({
      [materialId]: true,
    });

    res.status(201).json({
      message: 'Teaching material uploaded successfully',
      material,
    });
  } catch (err) {
    console.error('Material upload error:', err);
    res.status(500).json({ error: 'Failed to upload material: ' + err.message });
  }
};

/**
 * Get teacher's profile completeness
 */
exports.getProfileCompletion = async (req, res) => {
  const { id: teacherId } = req.user;

  try {
    const teacherSnapshot = await db.ref(`users/${teacherId}`).once('value');
    const teacher = teacherSnapshot.val();

    const completion = {
      headshot: !!teacher.headshot_url,
      videoIntro: !!teacher.video_intro_url,
      credentials: !!teacher.credentials_url,
      credentialsVerified: teacher.credentials_verified || false,
      isPremium: teacher.is_premium || false,
      subscriptionActive: teacher.subscription_active || false,
    };

    const checklist = [
      completion.headshot,
      completion.videoIntro,
      completion.credentials,
    ];

    const completionPercentage = (checklist.filter(Boolean).length / checklist.length) * 100;

    res.status(200).json({
      completion,
      completionPercentage,
      nextStep: !completion.headshot
        ? 'Upload a professional headshot'
        : !completion.videoIntro
        ? 'Record a 1-minute video intro'
        : !completion.credentials
        ? 'Upload TRCN/NIN credentials'
        : 'Everything complete! Subscribe to premium for more features.',
    });
  } catch (err) {
    console.error('Error getting profile completion:', err);
    res.status(500).json({ error: 'Failed to get profile completion' });
  }
};
