import { Response, Request } from 'express';
import { desc, eq } from 'drizzle-orm';
import { db } from '../database/db';
import { notifications } from '../database/schema';
import logger from '../utils/logger';

interface AuthenticatedRequest extends Request {
  user: { id: string; role: string };
}

export const createNotification = async ({ userId, type, title, message }: { userId: string; type: string; title: string; message: string }) => {
  if (!userId) return null;
  const [notification] = await db.insert(notifications).values({
    id: Math.random().toString(36).slice(2, 15),
    userId,
    type,
    title,
    message,
  }).returning();
  return notification;
};

export const listNotifications = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rows = await db.query.notifications.findMany({
      where: eq(notifications.userId, req.user.id),
      orderBy: [desc(notifications.createdAt)],
      limit: 20,
    });
    const unreadCount = rows.filter((item) => !item.read).length;
    res.status(200).json({ notifications: rows, unreadCount });
  } catch (err: any) {
    logger.error({ err, userId: req.user.id }, 'notifications.list_failed');
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
};

export const markNotificationRead = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    await db.update(notifications).set({ read: true }).where(eq(notifications.id, id));
    res.status(200).json({ message: 'Notification marked as read' });
  } catch (err: any) {
    logger.error({ err, userId: req.user.id }, 'notifications.mark_read_failed');
    res.status(500).json({ error: 'Failed to update notification' });
  }
};
