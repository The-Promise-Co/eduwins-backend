import { Request, Response } from 'express';
import { db } from '../database/db';
import {
  users,
  teacherProfiles,
  subjectVideos,
  teachingMaterials,
  teacherDocuments,
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

    await db.update(teacherProfiles)
      .set({ videoVerified: videoUrl, updatedAt: new Date() })
      .where(eq(teacherProfiles.userId, teacherId));

    res.status(200).json({
      message: 'Video intro uploaded successfully',
      videoUrl,
    });
  } catch (err: any) {
    console.error('Video intro upload error:', err);
    res.status(500).json({ error: 'Failed to upload video intro' });
  }
};

export const uploadDocument = async (req: AuthenticatedRequest, res: Response) => {
  const teacherId = req.user.id;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { name, tags } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Document name is required' });
    }

    const docUrl = `/uploads/${req.file.filename}`;
    const docId = Math.random().toString(36).substring(2, 15);
    const tagArray: string[] = tags
      ? (Array.isArray(tags) ? tags : [tags])
      : [];

    const newDoc = {
      id: docId,
      teacherId,
      url: docUrl,
      name,
      tags: tagArray,
      verified: false,
      uploadedAt: new Date(),
    };

    await db.insert(teacherDocuments).values(newDoc);

    res.status(201).json(newDoc);
  } catch (err: any) {
    console.error('Document upload error:', err);
    res.status(500).json({ error: 'Failed to upload document' });
  }
};

export const listDocuments = async (req: AuthenticatedRequest, res: Response) => {
  const teacherId = req.user.id;

  try {
    const docs = await db.query.teacherDocuments.findMany({
      where: eq(teacherDocuments.teacherId, teacherId),
      orderBy: (docs, { desc }) => [desc(docs.uploadedAt)],
    });

    res.status(200).json(docs);
  } catch (err: any) {
    console.error('List documents error:', err);
    res.status(500).json({ error: 'Failed to list documents' });
  }
};

export const deleteDocument = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  try {
    await db.delete(teacherDocuments)
      .where(eq(teacherDocuments.id, id));

    res.status(200).json({ message: 'Document deleted' });
  } catch (err: any) {
    console.error('Delete document error:', err);
    res.status(500).json({ error: 'Failed to delete document' });
  }
};

export const uploadSubjectVideo = async (req: AuthenticatedRequest, res: Response) => {
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

    const profile = await db.query.teacherProfiles.findFirst({
      where: eq(teacherProfiles.userId, teacherId),
    });

    const docs = await db.query.teacherDocuments.findMany({
      where: eq(teacherDocuments.teacherId, teacherId),
    });

    const hasPhoto = !!profile?.photoUrl;
    const hasVideo = !!profile?.videoVerified;
    const docsUploaded = docs.length > 0;
    const docsVerified = docs.length > 0 && docs.every((d) => d.verified);

    const completion = {
      photo: hasPhoto,
      video_verified: hasVideo,
      documents_uploaded: docsUploaded,
      documents_verified: docsVerified,
    };

    const completedCount = [hasPhoto, hasVideo, docsUploaded].filter(Boolean).length;
    const completionPercentage = Math.round((completedCount / 3) * 100);

    let nextStep = 'Upload a profile photo';
    if (!hasVideo) nextStep = 'Upload an intro video';
    else if (!docsUploaded) nextStep = 'Upload credential documents';
    else if (!docsVerified) nextStep = 'Wait for document verification';
    else nextStep = 'All steps completed!';

    res.status(200).json({
      completionPercentage,
      nextStep,
      isPremium: teacher.isPremium || false,
      completion,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed' });
  }
};
