import { Request, Response } from 'express';
import { db } from '../database/db';
import { digitalVault, vaultPurchases, users, teacherProfiles, earnings } from '../database/schema';
import { eq, and, sql, desc, gte, lte } from 'drizzle-orm';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    role: string;
  }
}

export const getVaultItems = async (req: Request, res: Response) => {
  try {
    const { subject, teacher_id, min_price, max_price } = req.query as any;

    const list = await db.select({
      id: digitalVault.id,
      teacherId: digitalVault.teacherId,
      title: digitalVault.title,
      description: digitalVault.description,
      subject: digitalVault.subject,
      contentType: digitalVault.contentType,
      price: digitalVault.price,
      fileUrl: digitalVault.fileUrl,
      previewUrl: digitalVault.previewUrl,
      isActive: digitalVault.isActive,
      createdAt: digitalVault.createdAt,
      teacher_name: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
      rating_avg: teacherProfiles.ratingAvg,
      total_sessions: teacherProfiles.totalSessions,
    })
    .from(digitalVault)
    .innerJoin(users, eq(digitalVault.teacherId, users.id))
    .innerJoin(teacherProfiles, eq(digitalVault.teacherId, teacherProfiles.userId))
    .where(and(
      eq(digitalVault.isActive, true),
      subject ? eq(digitalVault.subject, subject) : undefined,
      teacher_id ? eq(digitalVault.teacherId, teacher_id) : undefined,
      min_price ? gte(digitalVault.price, min_price) : undefined,
      max_price ? lte(digitalVault.price, max_price) : undefined,
    ))
    .orderBy(desc(digitalVault.createdAt));

    res.json(list);
  } catch (err: any) {
    console.error('Get vault items error:', err);
    res.status(500).json({ error: 'Failed to fetch vault items' });
  }
};

export const getVaultItem = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await db.select({
      id: digitalVault.id,
      teacherId: digitalVault.teacherId,
      title: digitalVault.title,
      description: digitalVault.description,
      subject: digitalVault.subject,
      contentType: digitalVault.contentType,
      price: digitalVault.price,
      fileUrl: digitalVault.fileUrl,
      previewUrl: digitalVault.previewUrl,
      isActive: digitalVault.isActive,
      createdAt: digitalVault.createdAt,
      teacher_name: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
      rating_avg: teacherProfiles.ratingAvg,
      total_sessions: teacherProfiles.totalSessions,
    })
    .from(digitalVault)
    .innerJoin(users, eq(digitalVault.teacherId, users.id))
    .innerJoin(teacherProfiles, eq(digitalVault.teacherId, teacherProfiles.userId))
    .where(and(eq(digitalVault.id, id), eq(digitalVault.isActive, true)));

    if (result.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json(result[0]);
  } catch (err: any) {
    console.error('Get vault item error:', err);
    res.status(500).json({ error: 'Failed to fetch item' });
  }
};

export const createVaultItem = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { title, description, subject, content_type, price, file_url, preview_url } = req.body;
    const teacherId = req.user.id;

    // Verify user is a teacher
    const teacher = await db.query.teacherProfiles.findFirst({
      where: eq(teacherProfiles.userId, teacherId),
    });

    if (!teacher) {
      return res.status(403).json({ error: 'Only teachers can create vault items' });
    }

    const id = Math.random().toString(36).substring(2, 15);
    const newItem = {
      id,
      teacherId,
      title,
      description,
      subject,
      contentType: content_type,
      price: price.toString(),
      fileUrl: file_url,
      previewUrl: preview_url,
      isActive: true,
      createdAt: new Date(),
    };

    await db.insert(digitalVault).values(newItem);
    res.status(201).json(newItem);
  } catch (err: any) {
    console.error('Create vault item error:', err);
    res.status(500).json({ error: 'Failed to create vault item' });
  }
};

export const updateVaultItem = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { title, description, subject, price, file_url, preview_url, is_active } = req.body;
    const itemId = req.params.id;
    const teacherId = req.user.id;

    const item = await db.query.digitalVault.findFirst({
      where: eq(digitalVault.id, itemId),
    });

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    if (item.teacherId !== teacherId) {
      return res.status(403).json({ error: 'You can only edit your own items' });
    }

    await db.update(digitalVault)
      .set({
        title,
        description,
        subject,
        price: price ? price.toString() : undefined,
        fileUrl: file_url,
        previewUrl: preview_url,
        isActive: is_active,
        updatedAt: new Date(),
      })
      .where(eq(digitalVault.id, itemId));

    res.json({ message: 'Item updated successfully' });
  } catch (err: any) {
    console.error('Update vault item error:', err);
    res.status(500).json({ error: 'Failed to update vault item' });
  }
};

export const purchaseVaultItem = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const itemId = req.params.id;
    const buyerId = req.user.id;

    const item = await db.query.digitalVault.findFirst({
      where: and(eq(digitalVault.id, itemId), eq(digitalVault.isActive, true)),
    });

    if (!item) {
      return res.status(404).json({ error: 'Item not found or not available' });
    }

    const existingPurchase = await db.query.vaultPurchases.findFirst({
      where: and(eq(vaultPurchases.itemId, itemId), eq(vaultPurchases.buyerId, buyerId)),
    });

    if (existingPurchase) {
      return res.status(400).json({ error: 'Item already purchased' });
    }

    const purchaseId = Math.random().toString(36).substring(2, 15);
    await db.insert(vaultPurchases).values({
      id: purchaseId,
      itemId,
      buyerId,
      pricePaid: item.price,
      purchaseDate: new Date(),
    });

    // Update teacher's earnings
    if (item.teacherId) {
      const currentEarnings = await db.query.earnings.findFirst({
        where: eq(earnings.teacherId, item.teacherId),
      });

      const amount = parseFloat(item.price.toString());
      
      if (currentEarnings) {
        await db.update(earnings)
          .set({
            total: (parseFloat(currentEarnings.total?.toString() || '0') + amount).toString(),
            acquiredFromVault: (parseFloat(currentEarnings.acquiredFromVault?.toString() || '0') + amount).toString(),
            updatedAt: new Date(),
          })
          .where(eq(earnings.teacherId, item.teacherId));
      }
    }

    res.json({
      download_url: item.fileUrl,
      message: 'Purchase successful! You can now download the content.'
    });
  } catch (err: any) {
    console.error('Purchase vault item error:', err);
    res.status(500).json({ error: 'Failed to purchase item' });
  }
};

export const getTeacherVaultItems = async (req: Request, res: Response) => {
  try {
    const { teacherId } = req.params;
    const list = await db.select()
      .from(digitalVault)
      .where(eq(digitalVault.teacherId, teacherId))
      .orderBy(desc(digitalVault.createdAt));

    res.json(list);
  } catch (err: any) {
    console.error('Get teacher vault items error:', err);
    res.status(500).json({ error: 'Failed to fetch items' });
  }
};

export const getMyPurchases = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const list = await db.select({
      id: vaultPurchases.id,
      itemId: vaultPurchases.itemId,
      buyerId: vaultPurchases.buyerId,
      pricePaid: vaultPurchases.pricePaid,
      purchaseDate: vaultPurchases.purchaseDate,
      itemTitle: digitalVault.title,
      itemDescription: digitalVault.description,
      subject: digitalVault.subject,
      contentType: digitalVault.contentType,
      teacherName: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
    })
    .from(vaultPurchases)
    .innerJoin(digitalVault, eq(vaultPurchases.itemId, digitalVault.id))
    .innerJoin(users, eq(digitalVault.teacherId, users.id))
    .where(eq(vaultPurchases.buyerId, req.user.id))
    .orderBy(desc(vaultPurchases.purchaseDate));

    res.json(list);
  } catch (err: any) {
    console.error('Get user purchases error:', err);
    res.status(500).json({ error: 'Failed to fetch purchases' });
  }
};
