import { Request, Response } from 'express';
import { db } from '../database/db';
import { 
  users, 
  teacherProfiles, 
  subjectVideos, 
  teachingMaterials 
} from '../database/schema';
import { eq } from 'drizzle-orm';
import path from 'path';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    role: string;
  }
}

export const uploadHeadshot = async (req: AuthenticatedRequest, res: Response) => {
  const teacherId = req.user.id;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const photoUrl = `/uploads/${req.file.filename}`;

    // Update user and teacher profile
    await db.update(users)
      .set({ photoUrl, updatedAt: new Date() })
      .where(eq(users.id, teacherId));

    await db.update(teacherProfiles)
      .set({ photoUrl, updatedAt: new Date() })
      .where(eq(teacherProfiles.userId, teacherId));

    res.status(200).json({
      message: 'Headshot uploaded successfully',
      photoUrl,
    });
  } catch (err: any) {
    console.error('Headshot upload error:', err);
    res.status(500).json({ error: 'Failed to upload headshot' });
  }
};

export const uploadVideoIntro = async (req: AuthenticatedRequest, res: Response) => {
  const teacherId = req.user.id;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const videoUrl = `/uploads/${req.file.filename}`;

    // Update teacher profile with bio or specific video field if we add it
    // For now we'll just return it as a success
    // In schema, we might need a videoIntroUrl field.
    
    res.status(200).json({
      message: 'Video intro uploaded successfully',
      videoUrl,
    });
  } catch (err: any) {
    console.error('Video intro upload error:', err);
    res.status(500).json({ error: 'Failed to upload video intro' });
  }
};

export const uploadCredentials = async (req: AuthenticatedRequest, res: Response) => {
  const teacherId = req.user.id;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const credentialsUrl = `/uploads/${req.file.filename}`;

    // Assuming we have this field or just returning it for verification flow
    res.status(200).json({
      message: 'Credentials upload submitted for verification',
      credentialsUrl,
    });
  } catch (err: any) {
    console.error('Credentials upload error:', err);
    res.status(500).json({ error: 'Failed to upload credentials' });
  }
};

export const uploadSubjectVideo = async (req: AuthenticatedRequest, res: Response) => {
  const teacherId = req.user.id;
  const { subject, title, description, price } = req.body;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Verify premium status
    const teacher = await db.query.users.findFirst({
      where: eq(users.id, teacherId),
    });

    if (!teacher || !teacher.isPremium) {
      return res.status(403).json({ error: 'Premium subscription required' });
    }

    const videoId = Math.random().toString(36).substring(2, 15);
    const videoUrl = `/uploads/${req.file.filename}`;

    const newVideo = {
      id: videoId,
      teacherId,
      subject,
      title,
      description: description || '',
      videoUrl,
      price: price.toString(),
      createdAt: new Date(),
    };

    await db.insert(subjectVideos).values(newVideo);

    res.status(201).json({
      message: 'Subject video uploaded successfully',
      video: newVideo,
    });
  } catch (err: any) {
    console.error('Subject video upload error:', err);
    res.status(500).json({ error: 'Failed' });
  }
};

export const uploadTeachingMaterial = async (req: AuthenticatedRequest, res: Response) => {
  const teacherId = req.user.id;
  const { subject, title, description, price } = req.body;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const teacher = await db.query.users.findFirst({
      where: eq(users.id, teacherId),
    });

    if (!teacher || !teacher.isPremium) {
      return res.status(403).json({ error: 'Premium subscription required' });
    }

    const materialId = Math.random().toString(36).substring(2, 15);
    const fileExt = path.extname(req.file.originalname);
    const materialUrl = `/uploads/${req.file.filename}`;

    const newMaterial = {
      id: materialId,
      teacherId,
      subject,
      title,
      description: description || '',
      materialUrl,
      contentType: fileExt === '.pdf' ? 'pdf' : 'word',
      price: price.toString(),
      createdAt: new Date(),
    };

    await db.insert(teachingMaterials).values(newMaterial);

    res.status(201).json({
      message: 'Teaching material uploaded successfully',
      material: newMaterial,
    });
  } catch (err: any) {
    console.error('Material upload error:', err);
    res.status(500).json({ error: 'Failed' });
  }
};

export const getProfileCompletion = async (req: AuthenticatedRequest, res: Response) => {
  const teacherId = req.user.id;

  try {
    const teacher = await db.query.users.findFirst({
      where: eq(users.id, teacherId),
    });

    if (!teacher) return res.status(404).json({ error: 'Not found' });

    const completion = {
      headshot: !!teacher.photoUrl,
      isPremium: teacher.isPremium || false,
      subscriptionActive: teacher.subscriptionActive || false,
    };

    res.status(200).json({
      completion,
      completionPercentage: teacher.photoUrl ? 100 : 0, // Simplified
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed' });
  }
};
