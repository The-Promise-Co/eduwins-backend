import { Request, Response } from 'express';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../database/db';
import {
  adminBroadcasts,
  adminBroadcastRecipients,
  adminMessageGroups,
  adminUsers,
} from '../database/schema';
import logger from '../utils/logger';
import { emailService } from '../utils/emailSender';
import { sanitizeBroadcastHtml, renderBroadcastEmail, htmlToText } from '../utils/html';
import {
  BroadcastSegment,
  countAudience,
  listAudience,
  getSegmentOptions,
  normalizeSegment,
} from '../utils/broadcastAudience';
import {
  cancelBroadcast as cancelBroadcastJob,
  describeDevGuard,
  dispatchBroadcast,
  estimateSendSeconds,
  isBroadcastInFlight,
  syncGroupStatus,
} from '../services/broadcastSender';

interface AuthenticatedRequest extends Request {
  admin?: { id: string; role: string; permissions: Record<string, any> };
}

const MAX_SUBJECT_LENGTH = 200;
const MAX_HTML_LENGTH = 100_000;
const RECIPIENT_INSERT_CHUNK = 500;
const TERMINAL_BROADCAST_STATUSES = ['completed', 'partial', 'cancelled', 'failed', 'interrupted'];

const createId = () => Math.random().toString(36).slice(2, 15);

const roleLabel = (role: string) => (role === 'teacher' ? 'tutor' : 'parent');

const requireAdminEmail = async (adminId?: string): Promise<string | null> => {
  if (!adminId) return null;
  const [admin] = await db
    .select({ email: adminUsers.email, name: adminUsers.firstName })
    .from(adminUsers)
    .where(eq(adminUsers.id, adminId));
  return admin?.email ?? null;
};

// ── Segment metadata ────────────────────────────────────────────────────────

export const getBroadcastSegmentOptions = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const options = await getSegmentOptions();
    res.json({ ...options, devGuard: describeDevGuard(), emailConfigured: emailService.isConfigured() });
  } catch (err: any) {
    (req.log || logger).error({ err, adminId: req.admin?.id }, 'admin.broadcast_options_failed');
    res.status(500).json({ error: 'Could not load broadcast options' });
  }
};

// ── Live audience count ─────────────────────────────────────────────────────

export const previewBroadcastAudience = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const segment = normalizeSegment(req.body?.segment);
    const devGuard = describeDevGuard();

    const [count, mailableCount, sample] = await Promise.all([
      countAudience(segment),
      devGuard.active ? countAudience(segment, { restrictToEmails: devGuard.allowlist }) : countAudience(segment),
      listAudience(segment, { limit: 5 }),
    ]);

    res.json({
      role: segment.role,
      count,
      mailableCount,
      devGuardRestricted: devGuard.active,
      sample,
      devGuard,
      emailConfigured: emailService.isConfigured(),
    });
  } catch (err: any) {
    (req.log || logger).warn({ err, adminId: req.admin?.id, body: req.body?.segment }, 'admin.broadcast_preview_failed');
    res.status(400).json({ error: err?.message || 'Invalid audience segment' });
  }
};

// ── Draft preview / dry-run email ───────────────────────────────────────────

const buildDraftEmail = (
  bodyHtml: string,
  firstName: string,
  role: BroadcastSegment['role'],
) => {
  const html = renderBroadcastEmail(emailService.templatesDir, {
    bodyHtml,
    firstName,
    roleLabel: roleLabel(role),
  });
  return { html, text: htmlToText(html) };
};

export const previewBroadcastEmail = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const subject = String(req.body?.subject || '').trim();
    const rawHtml = String(req.body?.messageHtml || '');
    if (!subject) return res.status(400).json({ error: 'subject is required' });

    const bodyHtml = sanitizeBroadcastHtml(rawHtml);
    if (!bodyHtml) return res.status(400).json({ error: 'message has no usable content after sanitizing' });

    const segment = normalizeSegment(req.body?.segment);
    const firstName = String(req.body?.firstName || 'Adebola');

    res.json({
      subject,
      html: buildDraftEmail(bodyHtml, firstName, segment.role).html,
      devGuard: describeDevGuard(),
    });
  } catch (err: any) {
    (req.log || logger).warn({ err, adminId: req.admin?.id }, 'admin.broadcast_html_preview_failed');
    res.status(400).json({ error: err?.message || 'Invalid broadcast draft' });
  }
};

/**
 * Sends the rendered draft to the signed-in admin only. Never to the audience.
 */
export const sendBroadcastTestEmail = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const adminEmail = await requireAdminEmail(req.admin?.id);
    if (!adminEmail) return res.status(400).json({ error: 'No email on your admin account' });

    if (!emailService.isConfigured()) {
      return res.status(400).json({ error: 'Email provider is not configured on this server' });
    }

    const subject = String(req.body?.subject || '').trim();
    const bodyHtml = sanitizeBroadcastHtml(String(req.body?.messageHtml || ''));
    if (!subject || !bodyHtml) {
      return res.status(400).json({ error: 'subject and message are required' });
    }

    const segment = normalizeSegment(req.body?.segment);
    const { html, text } = buildDraftEmail(bodyHtml, 'Adebola', segment.role);

    await emailService.sendEmail({
      to: adminEmail,
      subject: `[TEST] ${subject}`,
      html,
      text,
      replyTo: process.env.EMAIL_REPLY_TO || undefined,
    });

    res.json({ message: 'Test email sent', to: adminEmail });
  } catch (err: any) {
    (req.log || logger).error({ err, adminId: req.admin?.id }, 'admin.broadcast_test_failed');
    res.status(500).json({ error: 'Could not send test email' });
  }
};

// ── Campaign groups ─────────────────────────────────────────────────────────

export const listMessageGroups = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rows = await db
      .select({
        id: adminMessageGroups.id,
        name: adminMessageGroups.name,
        status: adminMessageGroups.status,
        createdAt: adminMessageGroups.createdAt,
        cancelledAt: adminMessageGroups.cancelledAt,
        sendCount: sql<number>`(SELECT count(*)::int FROM "admin_broadcasts" WHERE "admin_broadcasts"."group_id" = "admin_message_groups"."id")`,
        recipientCount: sql<number>`(SELECT coalesce(sum("admin_broadcasts"."total_recipients"), 0)::int FROM "admin_broadcasts" WHERE "admin_broadcasts"."group_id" = "admin_message_groups"."id")`,
        sentCount: sql<number>`(SELECT coalesce(sum("admin_broadcasts"."sent_count"), 0)::int FROM "admin_broadcasts" WHERE "admin_broadcasts"."group_id" = "admin_message_groups"."id")`,
        failedCount: sql<number>`(SELECT coalesce(sum("admin_broadcasts"."failed_count"), 0)::int FROM "admin_broadcasts" WHERE "admin_broadcasts"."group_id" = "admin_message_groups"."id")`,
      })
      .from(adminMessageGroups)
      .orderBy(desc(adminMessageGroups.createdAt));

    res.json(rows);
  } catch (err: any) {
    (req.log || logger).error({ err, adminId: req.admin?.id }, 'admin.broadcast_groups_list_failed');
    res.status(500).json({ error: 'Could not fetch message groups' });
  }
};

export const createMessageGroup = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name is required' });
    if (name.length > 120) return res.status(400).json({ error: 'name is too long (max 120 characters)' });

    const [group] = await db
      .insert(adminMessageGroups)
      .values({ id: createId(), name, status: 'open', createdBy: req.admin?.id })
      .returning();

    res.status(201).json(group);
  } catch (err: any) {
    (req.log || logger).error({ err, adminId: req.admin?.id }, 'admin.broadcast_group_create_failed');
    res.status(500).json({ error: 'Could not create message group' });
  }
};

export const getMessageGroup = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const [group] = await db.select().from(adminMessageGroups).where(eq(adminMessageGroups.id, id));
    if (!group) return res.status(404).json({ error: 'Message group not found' });

    const broadcasts = await db
      .select({
        id: adminBroadcasts.id,
        role: adminBroadcasts.role,
        subject: adminBroadcasts.subject,
        status: adminBroadcasts.status,
        totalRecipients: adminBroadcasts.totalRecipients,
        sentCount: adminBroadcasts.sentCount,
        failedCount: adminBroadcasts.failedCount,
        skippedCount: adminBroadcasts.skippedCount,
        createdAt: adminBroadcasts.createdAt,
        startedAt: adminBroadcasts.startedAt,
        completedAt: adminBroadcasts.completedAt,
      })
      .from(adminBroadcasts)
      .where(eq(adminBroadcasts.groupId, id))
      .orderBy(desc(adminBroadcasts.createdAt));

    res.json({ group, broadcasts });
  } catch (err: any) {
    (req.log || logger).error({ err, adminId: req.admin?.id, groupId: req.params.id }, 'admin.broadcast_group_detail_failed');
    res.status(500).json({ error: 'Could not fetch message group' });
  }
};

export const cancelMessageGroup = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const [group] = await db.select().from(adminMessageGroups).where(eq(adminMessageGroups.id, id));
    if (!group) return res.status(404).json({ error: 'Message group not found' });
    if (group.status === 'cancelled') return res.status(409).json({ error: 'Message group is already cancelled' });

    const broadcasts = await db
      .select({ id: adminBroadcasts.id, status: adminBroadcasts.status })
      .from(adminBroadcasts)
      .where(eq(adminBroadcasts.groupId, id));

    const stopped: string[] = [];
    for (const broadcast of broadcasts) {
      if (TERMINAL_BROADCAST_STATUSES.includes(broadcast.status)) continue;
      await cancelBroadcastJob(broadcast.id);
      stopped.push(broadcast.id);
    }

    await db
      .update(adminMessageGroups)
      .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
      .where(eq(adminMessageGroups.id, id));

    res.json({ message: 'Message group cancelled', groupId: id, stoppedBroadcasts: stopped });
  } catch (err: any) {
    (req.log || logger).error({ err, adminId: req.admin?.id, groupId: req.params.id }, 'admin.broadcast_group_cancel_failed');
    res.status(500).json({ error: 'Could not cancel message group' });
  }
};

// ── Broadcasts ──────────────────────────────────────────────────────────────

export const listBroadcasts = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = Math.min(Math.max(Number(req.query?.limit) || 50, 1), 200);
    const offset = Math.max(Number(req.query?.offset) || 0, 0);
    const groupId = req.query?.groupId ? String(req.query.groupId) : null;
    const status = req.query?.status ? String(req.query.status) : null;

    const conditions = [];
    if (groupId) conditions.push(eq(adminBroadcasts.groupId, groupId));
    if (status) conditions.push(eq(adminBroadcasts.status, status));

    const rows = await db
      .select({
        id: adminBroadcasts.id,
        groupId: adminBroadcasts.groupId,
        groupName: adminMessageGroups.name,
        role: adminBroadcasts.role,
        subject: adminBroadcasts.subject,
        status: adminBroadcasts.status,
        totalRecipients: adminBroadcasts.totalRecipients,
        sentCount: adminBroadcasts.sentCount,
        failedCount: adminBroadcasts.failedCount,
        skippedCount: adminBroadcasts.skippedCount,
        createdAt: adminBroadcasts.createdAt,
        startedAt: adminBroadcasts.startedAt,
        completedAt: adminBroadcasts.completedAt,
      })
      .from(adminBroadcasts)
      .innerJoin(adminMessageGroups, eq(adminBroadcasts.groupId, adminMessageGroups.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(adminBroadcasts.createdAt))
      .limit(limit)
      .offset(offset);

    res.json(rows);
  } catch (err: any) {
    (req.log || logger).error({ err, adminId: req.admin?.id }, 'admin.broadcasts_list_failed');
    res.status(500).json({ error: 'Could not fetch broadcasts' });
  }
};

export const getBroadcast = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const statusFilter = req.query?.status ? String(req.query.status) : null;
    const limit = Math.min(Math.max(Number(req.query?.limit) || 100, 1), 500);
    const offset = Math.max(Number(req.query?.offset) || 0, 0);

    const [broadcast] = await db
      .select({
        id: adminBroadcasts.id,
        groupId: adminBroadcasts.groupId,
        groupName: adminMessageGroups.name,
        role: adminBroadcasts.role,
        segment: adminBroadcasts.segment,
        subject: adminBroadcasts.subject,
        messageHtml: adminBroadcasts.messageHtml,
        status: adminBroadcasts.status,
        totalRecipients: adminBroadcasts.totalRecipients,
        sentCount: adminBroadcasts.sentCount,
        failedCount: adminBroadcasts.failedCount,
        skippedCount: adminBroadcasts.skippedCount,
        createdAt: adminBroadcasts.createdAt,
        startedAt: adminBroadcasts.startedAt,
        completedAt: adminBroadcasts.completedAt,
      })
      .from(adminBroadcasts)
      .innerJoin(adminMessageGroups, eq(adminBroadcasts.groupId, adminMessageGroups.id))
      .where(eq(adminBroadcasts.id, id));

    if (!broadcast) return res.status(404).json({ error: 'Broadcast not found' });

    const breakdown = await db
      .select({
        status: adminBroadcastRecipients.status,
        value: sql<number>`count(*)::int`,
      })
      .from(adminBroadcastRecipients)
      .where(eq(adminBroadcastRecipients.broadcastId, id))
      .groupBy(adminBroadcastRecipients.status);

    const recipients = await db
      .select({
        id: adminBroadcastRecipients.id,
        userId: adminBroadcastRecipients.userId,
        email: adminBroadcastRecipients.email,
        firstName: adminBroadcastRecipients.firstName,
        status: adminBroadcastRecipients.status,
        error: adminBroadcastRecipients.error,
        sentAt: adminBroadcastRecipients.sentAt,
      })
      .from(adminBroadcastRecipients)
      .where(statusFilter
        ? and(
            eq(adminBroadcastRecipients.broadcastId, id),
            eq(adminBroadcastRecipients.status, statusFilter),
          )
        : eq(adminBroadcastRecipients.broadcastId, id))
      .orderBy(adminBroadcastRecipients.firstName)
      .limit(limit)
      .offset(offset);

    res.json({
      broadcast,
      breakdown: Object.fromEntries(breakdown.map((row) => [row.status, row.value])),
      recipients,
      isRunning: isBroadcastInFlight(id),
    });
  } catch (err: any) {
    (req.log || logger).error({ err, adminId: req.admin?.id, broadcastId: req.params.id }, 'admin.broadcast_detail_failed');
    res.status(500).json({ error: 'Could not fetch broadcast' });
  }
};

/**
 * Queue a targeted send. Responds as soon as the recipient snapshot is stored;
 * actual delivery continues in the background.
 */
export const createBroadcast = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const subject = String(req.body?.subject || '').trim();
    const rawHtml = String(req.body?.messageHtml || '');

    if (!subject) return res.status(400).json({ error: 'subject is required' });
    if (subject.length > MAX_SUBJECT_LENGTH) {
      return res.status(400).json({ error: `subject is too long (max ${MAX_SUBJECT_LENGTH} characters)` });
    }
    if (!rawHtml.trim()) return res.status(400).json({ error: 'message is required' });
    if (rawHtml.length > MAX_HTML_LENGTH) {
      return res.status(400).json({ error: `message is too large (max ${MAX_HTML_LENGTH} characters)` });
    }

    const bodyHtml = sanitizeBroadcastHtml(rawHtml);
    if (!bodyHtml) return res.status(400).json({ error: 'message has no usable content after sanitizing' });

    if (!emailService.isConfigured()) {
      return res.status(400).json({ error: 'Email provider is not configured on this server' });
    }

    const segment = normalizeSegment(req.body?.segment);

    // Group is mandatory: either an existing open campaign or a new named one.
    let groupId = req.body?.groupId ? String(req.body.groupId) : null;
    let groupCreated = false;

    if (groupId) {
      const [existing] = await db
        .select({ id: adminMessageGroups.id, status: adminMessageGroups.status })
        .from(adminMessageGroups)
        .where(eq(adminMessageGroups.id, groupId));

      if (!existing) return res.status(404).json({ error: 'Message group not found' });
      if (existing.status !== 'open') {
        return res.status(409).json({ error: `Message group is ${existing.status} and cannot accept new sends` });
      }
    } else {
      const name = String(req.body?.groupName || '').trim();
      if (!name) return res.status(400).json({ error: 'groupId or groupName is required' });
      if (name.length > 120) return res.status(400).json({ error: 'groupName is too long (max 120 characters)' });

      groupId = createId();
      await db.insert(adminMessageGroups).values({ id: groupId, name, status: 'open', createdBy: req.admin?.id });
      groupCreated = true;
    }

    const audience = await listAudience(segment);
    if (!audience.length) {
      if (groupCreated) {
        await db.delete(adminMessageGroups).where(eq(adminMessageGroups.id, groupId));
      }
      return res.status(400).json({ error: 'No active accounts match this audience segment' });
    }

    const broadcastId = createId();
    const now = new Date();

    await db.transaction(async (tx) => {
      await tx.insert(adminBroadcasts).values({
        id: broadcastId,
        groupId,
        role: segment.role,
        segment,
        subject,
        messageHtml: bodyHtml,
        status: 'queued',
        totalRecipients: audience.length,
        createdBy: req.admin?.id,
        createdAt: now,
        updatedAt: now,
      });

      for (let index = 0; index < audience.length; index += RECIPIENT_INSERT_CHUNK) {
        const chunk = audience.slice(index, index + RECIPIENT_INSERT_CHUNK);
        await tx.insert(adminBroadcastRecipients).values(
          chunk.map((recipient) => ({
            id: createId(),
            broadcastId,
            userId: recipient.userId,
            email: recipient.email,
            firstName: recipient.firstName,
            status: 'pending',
          })),
        );
      }
    });

    dispatchBroadcast(broadcastId);

    const devGuard = describeDevGuard();
    const mailableCount = devGuard.active
      ? audience.filter((recipient) => devGuard.allowlist.includes(recipient.email)).length
      : audience.length;

    res.status(202).json({
      id: broadcastId,
      groupId,
      groupName: req.body?.groupName || null,
      role: segment.role,
      subject,
      total: audience.length,
      mailableCount,
      estimatedSeconds: estimateSendSeconds(mailableCount),
      status: 'queued',
      devGuard,
    });
  } catch (err: any) {
    (req.log || logger).error({ err, adminId: req.admin?.id }, 'admin.broadcast_create_failed');
    res.status(500).json({ error: 'Could not queue broadcast' });
  }
};

export const cancelBroadcast = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const cancelled = await cancelBroadcastJob(id);
    if (!cancelled) return res.status(409).json({ error: 'Broadcast is already finished' });

    const [broadcast] = await db
      .select({ groupId: adminBroadcasts.groupId })
      .from(adminBroadcasts)
      .where(eq(adminBroadcasts.id, id));
    if (broadcast) await syncGroupStatus(broadcast.groupId);

    res.json({ message: 'Broadcast cancelled', id });
  } catch (err: any) {
    (req.log || logger).error({ err, adminId: req.admin?.id, broadcastId: req.params.id }, 'admin.broadcast_cancel_failed');
    res.status(500).json({ error: 'Could not cancel broadcast' });
  }
};

/**
 * Re-queue the recipients that failed. Already-sent mail is never duplicated,
 * and a cancelled campaign cannot be revived (that would surprise recipients).
 */
export const retryBroadcast = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const [broadcast] = await db.select().from(adminBroadcasts).where(eq(adminBroadcasts.id, id));
    if (!broadcast) return res.status(404).json({ error: 'Broadcast not found' });
    if (isBroadcastInFlight(id)) return res.status(409).json({ error: 'Broadcast is already running' });
    if (broadcast.status === 'cancelled') {
      return res.status(409).json({ error: 'Cancelled broadcasts cannot be retried' });
    }

    const [group] = await db
      .select({ status: adminMessageGroups.status })
      .from(adminMessageGroups)
      .where(eq(adminMessageGroups.id, broadcast.groupId));
    if (group?.status === 'cancelled') {
      return res.status(409).json({ error: 'Message group is cancelled' });
    }

    const requeued = await db
      .update(adminBroadcastRecipients)
      .set({ status: 'pending' })
      .where(
        and(
          eq(adminBroadcastRecipients.broadcastId, id),
          inArray(adminBroadcastRecipients.status, ['failed', 'sending']),
        ),
      )
      .returning({ id: adminBroadcastRecipients.id });

    if (!requeued.length) {
      return res.status(400).json({ error: 'No failed recipients to retry' });
    }

    await db
      .update(adminBroadcasts)
      .set({ status: 'queued', completedAt: null, updatedAt: new Date() })
      .where(eq(adminBroadcasts.id, id));

    dispatchBroadcast(id);

    res.status(202).json({
      message: 'Retry queued',
      id,
      retryCount: requeued.length,
      estimatedSeconds: estimateSendSeconds(requeued.length),
    });
  } catch (err: any) {
    (req.log || logger).error({ err, adminId: req.admin?.id, broadcastId: req.params.id }, 'admin.broadcast_retry_failed');
    res.status(500).json({ error: 'Could not retry broadcast' });
  }
};

/**
 * Resume an interrupted send: re-attempt everything that never went out.
 */
export const resumeBroadcast = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const [broadcast] = await db.select().from(adminBroadcasts).where(eq(adminBroadcasts.id, id));
    if (!broadcast) return res.status(404).json({ error: 'Broadcast not found' });
    if (isBroadcastInFlight(id)) return res.status(409).json({ error: 'Broadcast is already running' });
    if (broadcast.status !== 'interrupted') {
      return res.status(409).json({ error: 'Only interrupted broadcasts can be resumed' });
    }

    const [group] = await db
      .select({ status: adminMessageGroups.status })
      .from(adminMessageGroups)
      .where(eq(adminMessageGroups.id, broadcast.groupId));
    if (group?.status === 'cancelled') {
      return res.status(409).json({ error: 'Message group is cancelled' });
    }

    dispatchBroadcast(id);

    res.status(202).json({ message: 'Broadcast resumed', id });
  } catch (err: any) {
    (req.log || logger).error({ err, adminId: req.admin?.id, broadcastId: req.params.id }, 'admin.broadcast_resume_failed');
    res.status(500).json({ error: 'Could not resume broadcast' });
  }
};
