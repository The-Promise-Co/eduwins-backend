import { Request, Response } from 'express';
import { db } from '../database/db';
import {
  users,
  teacherProfiles,
  teacherDocuments,
  teacherCertifications,
  teacherEducations,
} from '../database/schema';
import { eq } from 'drizzle-orm';
import logger from '../utils/logger';

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
    (req.log || logger).error({ err, teacherId }, 'upload.headshot_failed');
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
    (req.log || logger).error({ err, teacherId }, 'upload.video_intro_failed');
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
    (req.log || logger).error({ err, teacherId }, 'upload.document_failed');
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
    (req.log || logger).error({ err, teacherId }, 'upload.documents_list_failed');
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
    (req.log || logger).error({ err, documentId: id, teacherId: req.user.id }, 'upload.document_delete_failed');
    res.status(500).json({ error: 'Failed to delete document' });
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

    const [certifications, education] = await Promise.all([
      db.query.teacherCertifications.findMany({ where: eq(teacherCertifications.userId, teacherId) }),
      db.query.teacherEducations.findMany({ where: eq(teacherEducations.userId, teacherId) }),
    ]);

    const hasPhoto = !!(profile?.photoUrl || teacher.photoUrl);
    const hasBio = !!(profile?.bio || teacher.bio);
    const hasSubjects = (profile?.subjects || []).length > 0;
    const hasVideo = !!profile?.videoVerified;
    const hasSchedule = Boolean(profile?.availability) && !!profile?.availabilityConfig && Object.values(profile.availabilityConfig as Record<string, any>).some((ranges) => Array.isArray(ranges) && ranges.some((range) => !!(range?.from && range?.to)));
    const hasHourlyPay = Number(profile?.baseHourlyRate || 0) > 0;
    const docsUploaded = docs.length > 0;
    const docsVerified = docs.length > 0 && docs.every((d) => d.verified);
    const hasCertification = docsUploaded || certifications.length > 0;
    const hasEducation = education.length > 0 || !!(profile?.highestDegree || profile?.institution) || (profile?.educationLevels || []).length > 0;

    const completion = {
      photo: hasPhoto,
      profile_picture: hasPhoto,
      bio: hasBio,
      subjects: hasSubjects,
      video_intro: hasVideo,
      video_verified: hasVideo,
      schedule: hasSchedule,
      availability: hasSchedule,
      hourly_pay: hasHourlyPay,
      hourly_rate: hasHourlyPay,
      certification: hasCertification,
      education: hasEducation,
      documents_uploaded: docsUploaded,
      documents_verified: docsVerified,
    };

    const steps = [
      { done: hasPhoto, next: 'Upload a profile photo' },
      { done: hasBio, next: 'Add your bio' },
      { done: hasSubjects, next: 'Select your subjects' },
      { done: hasVideo, next: 'Upload an intro video' },
      { done: hasSchedule, next: 'Set your teaching availability' },
      { done: hasHourlyPay, next: 'Set your hourly pay' },
      { done: hasCertification, next: 'Add certification' },
      { done: hasEducation, next: 'Add education' },
    ];
    const completedCount = steps.filter((step) => step.done).length;
    const completionPercentage = Math.round((completedCount / steps.length) * 100);

    const nextStep = steps.find((step) => !step.done)?.next || (docsUploaded && !docsVerified ? 'Wait for document verification' : 'Profile complete');

    res.status(200).json({
      completionPercentage,
      nextStep,
      completion,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed' });
  }
};
