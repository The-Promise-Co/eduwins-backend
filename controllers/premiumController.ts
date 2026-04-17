import { Request, Response } from 'express';
import { db } from '../database/db';
import { 
  users, 
  subscriptions, 
  teacherProfiles, 
  subjectVideos, 
  teachingMaterials, 
  videoAccess, 
  materialPurchases 
} from '../database/schema';
import { eq, and, sql } from 'drizzle-orm';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    role: string;
  }
}

export const subscribeToPremium = async (req: AuthenticatedRequest, res: Response) => {
  const teacherId = req.user.id;
  const { plan, paymentMethodId } = req.body;

  try {
    if (!plan || !['monthly', 'quarterly', 'annual'].includes(plan)) {
      return res.status(400).json({ error: 'Invalid subscription plan' });
    }

    const plans: Record<string, { price: number; duration: number; label: string }> = {
      monthly: { price: 5000, duration: 30, label: '₦5,000/month' },
      quarterly: { price: 12000, duration: 90, label: '₦12,000/3 months' },
      annual: { price: 40000, duration: 365, label: '₦40,000/year' },
    };

    const planDetails = plans[plan];
    const subscriptionId = Math.random().toString(36).substring(2, 15);
    const startDate = new Date();
    const endDate = new Date(Date.now() + planDetails.duration * 24 * 60 * 60 * 1000);

    const subscription = {
      id: subscriptionId,
      teacherId,
      plan,
      price: planDetails.price.toString(),
      duration: planDetails.duration,
      status: 'active',
      paymentMethodId,
      startDate,
      endDate,
      autoRenew: true,
      createdAt: new Date(),
    };

    await db.insert(subscriptions).values(subscription);

    await db.update(users)
      .set({
        isPremium: true,
        subscriptionActive: true,
        subscriptionId,
        subscriptionPlan: plan,
        subscriptionEndDate: endDate,
        updatedAt: new Date(),
      })
      .where(eq(users.id, teacherId));

    await db.update(teacherProfiles)
      .set({
        searchRank: 'premium',
        updatedAt: new Date(),
      })
      .where(eq(teacherProfiles.userId, teacherId));

    res.status(201).json({
      message: `Successfully subscribed to ${plan} plan`,
      subscription,
    });
  } catch (err: any) {
    console.error('Subscription error:', err);
    res.status(500).json({ error: 'Subscription failed' });
  }
};

export const getTeacherPremiumContent = async (req: Request, res: Response) => {
  const { teacherId } = req.params;

  try {
    const teacher = await db.query.users.findFirst({
      where: eq(users.id, teacherId),
    });

    if (!teacher || !teacher.isPremium) {
      return res.status(200).json({ teacherId, isPremium: false, content: [] });
    }

    const videos = await db.select().from(subjectVideos).where(eq(subjectVideos.teacherId, teacherId));
    const materials = await db.select().from(teachingMaterials).where(eq(teachingMaterials.teacherId, teacherId));

    const content = [
      ...videos.map(v => ({ ...v, type: 'video' })),
      ...materials.map(m => ({ ...m, type: 'material' }))
    ];

    res.status(200).json({
      teacherId,
      isPremium: true,
      content,
      totalContent: content.length,
    });
  } catch (err: any) {
    console.error('Error fetching content:', err);
    res.status(500).json({ error: 'Failed' });
  }
};

export const subscribeToVideo = async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user.id;
  const { videoId } = req.params;
  const { transactionId } = req.body;

  try {
    const video = await db.query.subjectVideos.findFirst({
      where: eq(subjectVideos.id, videoId),
    });

    if (!video) return res.status(404).json({ error: 'Video not found' });

    const accessId = Math.random().toString(36).substring(2, 15);
    await db.insert(videoAccess).values({
      id: accessId,
      userId,
      videoId,
      teacherId: video.teacherId,
      price: video.price,
      transactionId,
      accessGrantedAt: new Date(),
    });

    res.status(200).json({ message: 'Subscribed to video', videoId, accessId });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed' });
  }
};

export const purchaseMaterial = async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user.id;
  const { materialId } = req.params;
  const { transactionId } = req.body;

  try {
    const material = await db.query.teachingMaterials.findFirst({
      where: eq(teachingMaterials.id, materialId),
    });

    if (!material) return res.status(404).json({ error: 'Material not found' });

    const purchaseId = Math.random().toString(36).substring(2, 15);
    await db.insert(materialPurchases).values({
      id: purchaseId,
      userId,
      materialId,
      teacherId: material.teacherId,
      price: material.price,
      transactionId,
      purchasedAt: new Date(),
    });

    res.status(200).json({ 
      message: 'Material purchased', 
      materialId, 
      downloadUrl: material.materialUrl 
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed' });
  }
};

export const checkVideoAccess = async (req: Request, res: Response) => {
  const { userId } = req.query as any;
  const { videoId } = req.params;

  try {
    const access = await db.query.videoAccess.findFirst({
      where: and(eq(videoAccess.videoId, videoId), eq(videoAccess.userId, userId)),
    });

    res.status(200).json({ hasAccess: !!access });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed' });
  }
};

export const cancelSubscription = async (req: AuthenticatedRequest, res: Response) => {
  const teacherId = req.user.id;
  const { immediately } = req.body;

  try {
    const teacher = await db.query.users.findFirst({
      where: eq(users.id, teacherId),
    });

    if (!teacher || !teacher.subscriptionId) {
      return res.status(400).json({ error: 'No active subscription' });
    }

    await db.update(subscriptions)
      .set({
        status: immediately ? 'cancelled' : 'cancellation_pending',
        cancellationRequestedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, teacher.subscriptionId));

    await db.update(users)
      .set({ subscriptionActive: false })
      .where(eq(users.id, teacherId));

    res.status(200).json({ message: 'Subscription status updated' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed' });
  }
};

export const getSubscriptionStatus = async (req: AuthenticatedRequest, res: Response) => {
  const teacherId = req.user.id;

  try {
    const teacher = await db.query.users.findFirst({
      where: eq(users.id, teacherId),
    });

    if (!teacher || !teacher.subscriptionId) {
      return res.status(200).json({ hasSubscription: false });
    }

    const sub = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.id, teacher.subscriptionId),
    });

    if (!sub) return res.status(200).json({ hasSubscription: false });

    const daysRemaining = Math.max(0, Math.ceil(((sub.endDate?.getTime() || 0) - Date.now()) / (24 * 60 * 60 * 1000)));

    res.status(200).json({
      hasSubscription: true,
      isPremium: teacher.isPremium,
      plan: sub.plan,
      status: sub.status,
      endDate: sub.endDate,
      daysRemaining,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed' });
  }
};

export const getTeacherOwnContent = async (req: AuthenticatedRequest, res: Response) => {
  const teacherId = req.user.id;

  try {
    const videos = await db.select().from(subjectVideos).where(eq(subjectVideos.teacherId, teacherId));
    const materials = await db.select().from(teachingMaterials).where(eq(teachingMaterials.teacherId, teacherId));

    const content = [
      ...videos.map(v => ({ ...v, type: 'video' })),
      ...materials.map(m => ({ ...m, type: 'material' }))
    ];

    res.status(200).json({ content });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed' });
  }
};
