import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../database/db';
import {
  adminBroadcasts,
  adminBroadcastRecipients,
  adminMessageGroups,
} from '../database/schema';
import { emailService } from '../utils/emailSender';
import { renderBroadcastEmail, htmlToText } from '../utils/html';
import logger from '../utils/logger';

/**
 * Broadcast send worker.
 *
 * Sends run in-process (no queue dependency): a broadcast row plus its
 * recipient snapshot is the source of truth, so a restart leaves a clean
 * `interrupted` state that can be resumed or retried instead of lost mail.
 */

const CONCURRENCY = Math.max(1, Number(process.env.BROADCAST_CONCURRENCY || 2));
const SPACING_MS = Math.max(0, Number(process.env.BROADCAST_SPACING_MS || 300));
const PROGRESS_FLUSH_EVERY = 10;

type ActiveJob = { cancelled: boolean; broadcastId: string };

const activeJobs = new Map<string, ActiveJob>();

const isTerminal = (status: string) =>
  ['completed', 'partial', 'cancelled', 'failed', 'interrupted'].includes(status);

export const estimateSendSeconds = (pendingCount: number): number => {
  if (pendingCount <= 0) return 0;
  const batches = Math.ceil(pendingCount / CONCURRENCY);
  return Math.ceil((batches * (SPACING_MS + 1500)) / 1000);
};

/**
 * Non-production safety net: never mass-mail real accounts from a dev machine.
 * Outside production only BROADCAST_DEV_ALLOWLIST addresses are actually
 * mailed (default: just EMAIL_FROM); everyone else is recorded as `skipped`.
 * Set BROADCAST_DEV_ALLOWLIST="*" to disable the guard.
 */
const devAllowlist = (): Set<string> | null => {
  if (process.env.NODE_ENV === 'production') return null;
  const raw = (process.env.BROADCAST_DEV_ALLOWLIST || '').trim();
  if (raw === '*') return null;
  const entries = raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (process.env.EMAIL_FROM) entries.push(process.env.EMAIL_FROM.trim().toLowerCase());
  return new Set(entries);
};

/**
 * Surfaced on the count endpoint so the composer can warn before sending.
 */
export const describeDevGuard = (): { active: boolean; allowlist: string[] } => {
  const allowlist = devAllowlist();
  return {
    active: allowlist !== null,
    allowlist: allowlist ? Array.from(allowlist) : [],
  };
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface StatusCounts {
  total: number;
  pending: number;
  sending: number;
  sent: number;
  failed: number;
  skipped: number;
  cancelled: number;
}

/**
 * Recipient rows are the source of truth for progress: counts are always
 * recomputed from them, never accumulated in memory.
 */
const recipientStatusCounts = async (broadcastId: string): Promise<StatusCounts> => {
  const rows = await db
    .select({
      status: adminBroadcastRecipients.status,
      value: sql<number>`count(*)::int`,
    })
    .from(adminBroadcastRecipients)
    .where(eq(adminBroadcastRecipients.broadcastId, broadcastId))
    .groupBy(adminBroadcastRecipients.status);

  const counts: StatusCounts = { total: 0, pending: 0, sending: 0, sent: 0, failed: 0, skipped: 0, cancelled: 0 };
  for (const row of rows) {
    const key = row.status as keyof StatusCounts;
    if (key in counts) counts[key] = Number(row.value);
    counts.total += Number(row.value);
  }
  return counts;
};

const flushProgress = async (broadcastId: string) => {
  const counts = await recipientStatusCounts(broadcastId);
  await db
    .update(adminBroadcasts)
    .set({
      totalRecipients: counts.total,
      sentCount: counts.sent,
      failedCount: counts.failed,
      skippedCount: counts.skipped + counts.cancelled,
      updatedAt: new Date(),
    })
    .where(eq(adminBroadcasts.id, broadcastId));
};

const finalize = async (broadcastId: string) => {
  const [broadcast] = await db
    .select()
    .from(adminBroadcasts)
    .where(eq(adminBroadcasts.id, broadcastId));

  if (!broadcast) return;

  const counts = await recipientStatusCounts(broadcastId);
  const job = activeJobs.get(broadcastId);
  const outstanding = counts.pending + counts.sending;

  let status: string;
  if (job?.cancelled || broadcast.status === 'cancelled') {
    status = 'cancelled';
  } else if (outstanding > 0) {
    // Some rows were never attempted (provider preflight failed, worker
    // crashed mid-batch). Keep it resumable instead of claiming completion.
    status = 'interrupted';
  } else if (counts.failed > 0) {
    status = counts.sent > 0 ? 'partial' : 'failed';
  } else {
    status = 'completed';
  }

  await db
    .update(adminBroadcasts)
    .set({
      status,
      totalRecipients: counts.total,
      sentCount: counts.sent,
      failedCount: counts.failed,
      skippedCount: counts.skipped + counts.cancelled,
      completedAt: status === 'interrupted' ? broadcast.completedAt : new Date(),
      updatedAt: new Date(),
    })
    .where(eq(adminBroadcasts.id, broadcastId));

  await syncGroupStatus(broadcast.groupId);
  activeJobs.delete(broadcastId);

  logger.info({ broadcastId, status, ...counts }, 'broadcast.finished');
};

/**
 * Keeps a campaign's status in sync with its sends: it closes when every send
 * is terminal, and re-opens if a finished send is retried (cancelled groups
 * stay cancelled — those must never accept new mail).
 */
export const syncGroupStatus = async (groupId: string): Promise<void> => {
  const [group] = await db
    .select({ status: adminMessageGroups.status })
    .from(adminMessageGroups)
    .where(eq(adminMessageGroups.id, groupId));

  if (!group || group.status === 'cancelled') return;

  const [openSends] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(adminBroadcasts)
    .where(
      and(
        eq(adminBroadcasts.groupId, groupId),
        sql`"status" NOT IN ('completed','partial','cancelled','failed','interrupted')`,
      ),
    );

  const hasOpenSends = Number(openSends?.value ?? 0) > 0;

  if (hasOpenSends && group.status !== 'open') {
    await db
      .update(adminMessageGroups)
      .set({ status: 'open', updatedAt: new Date() })
      .where(eq(adminMessageGroups.id, groupId));
    return;
  }

  if (!hasOpenSends && group.status === 'open') {
    await db
      .update(adminMessageGroups)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(eq(adminMessageGroups.id, groupId));
  }
};

const attemptRecipient = async (
  recipient: { id: string; email: string; firstName: string | null },
  render: (firstName: string | null) => { html: string; text: string },
  subject: string,
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> => {
  const allowlist = devAllowlist();
  if (allowlist && !allowlist.has(recipient.email.toLowerCase())) {
    return { ok: false, skipped: true, error: 'dev guard: address not in BROADCAST_DEV_ALLOWLIST' };
  }

  const { html, text } = render(recipient.firstName);

  try {
    await emailService.sendEmail({
      to: recipient.email,
      subject,
      html,
      text,
      replyTo: process.env.EMAIL_REPLY_TO || undefined,
    });
    await db
      .update(adminBroadcastRecipients)
      .set({ status: 'sent', sentAt: new Date() })
      .where(eq(adminBroadcastRecipients.id, recipient.id));
    return { ok: true };
  } catch (err: any) {
    const message = String(
      err?.response?.body?.message || err?.message || err || 'unknown send error',
    ).slice(0, 500);
    await db
      .update(adminBroadcastRecipients)
      .set({ status: 'failed', error: message, sentAt: null })
      .where(eq(adminBroadcastRecipients.id, recipient.id));
    return { ok: false, error: message };
  }
};

/**
 * Drain a queued/interrupted broadcast. Safe to call twice: the second call is
 * ignored while a job for the same id is already in flight.
 */
export const runBroadcast = async (broadcastId: string): Promise<void> => {
  if (activeJobs.has(broadcastId)) {
    logger.warn({ broadcastId }, 'broadcast.already_running');
    return;
  }

  const [broadcast] = await db
    .select()
    .from(adminBroadcasts)
    .where(eq(adminBroadcasts.id, broadcastId));

  if (!broadcast) {
    logger.error({ broadcastId }, 'broadcast.not_found');
    return;
  }

  if (!emailService.isConfigured()) {
    logger.error({ broadcastId }, 'broadcast.provider_not_configured');
    await db
      .update(adminBroadcasts)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(eq(adminBroadcasts.id, broadcastId));
    return;
  }

  const job: ActiveJob = { cancelled: false, broadcastId };
  activeJobs.set(broadcastId, job);

  await db
    .update(adminBroadcasts)
    .set({ status: 'running', startedAt: broadcast.startedAt ?? new Date(), updatedAt: new Date() })
    .where(eq(adminBroadcasts.id, broadcastId));

  const roleLabel = broadcast.role === 'teacher' ? 'tutor' : 'parent';
  const render = (firstName: string | null) => {
    const html = renderBroadcastEmail(emailService.templatesDir, {
      bodyHtml: broadcast.messageHtml,
      firstName: firstName ?? undefined,
      roleLabel,
    });
    return { html, text: htmlToText(html) };
  };

  let processed = 0;

  try {
    while (!job.cancelled) {
      const batch = await db
        .select({
          id: adminBroadcastRecipients.id,
          email: adminBroadcastRecipients.email,
          firstName: adminBroadcastRecipients.firstName,
        })
        .from(adminBroadcastRecipients)
        .where(
          and(
            eq(adminBroadcastRecipients.broadcastId, broadcastId),
            eq(adminBroadcastRecipients.status, 'pending'),
          ),
        )
        .limit(CONCURRENCY);

      if (!batch.length) break;

      // Claim rows so a concurrent resume can't double-send them.
      await db
        .update(adminBroadcastRecipients)
        .set({ status: 'sending' })
        .where(inArray(adminBroadcastRecipients.id, batch.map((row) => row.id)));

      await Promise.all(
        batch.map(async (recipient) => {
          const result = await attemptRecipient(recipient, render, broadcast.subject);
          if (!result.ok && !result.skipped) {
            logger.warn({ broadcastId, recipientId: recipient.id, error: result.error }, 'broadcast.recipient_failed');
          }
          if (result.skipped) {
            await db
              .update(adminBroadcastRecipients)
              .set({ status: 'skipped', error: result.error ?? 'skipped' })
              .where(eq(adminBroadcastRecipients.id, recipient.id));
          }
        }),
      );

      processed += batch.length;
      if (processed >= PROGRESS_FLUSH_EVERY) {
        await flushProgress(broadcastId);
        processed = 0;
        // Cooperative cancel even when only the DB was touched (e.g. another
        // process instance, or a cancel that raced this job's start).
        const [fresh] = await db
          .select({ status: adminBroadcasts.status })
          .from(adminBroadcasts)
          .where(eq(adminBroadcasts.id, broadcastId));
        if (fresh?.status === 'cancelled') job.cancelled = true;
      }

      if (SPACING_MS) await sleep(SPACING_MS);
    }

    if (job.cancelled) {
      await db
        .update(adminBroadcastRecipients)
        .set({ status: 'cancelled', error: 'cancelled before send' })
        .where(
          and(
            eq(adminBroadcastRecipients.broadcastId, broadcastId),
            inArray(adminBroadcastRecipients.status, ['pending', 'sending']),
          ),
        );
    }

    await flushProgress(broadcastId);
    await finalize(broadcastId);
  } catch (err) {
    logger.error({ err, broadcastId }, 'broadcast.worker_crashed');
    await db
      .update(adminBroadcasts)
      .set({ status: 'interrupted', updatedAt: new Date() })
      .where(eq(adminBroadcasts.id, broadcastId));
    activeJobs.delete(broadcastId);
    throw err;
  }
};

/**
 * Fire-and-forget entry point used by the API layer.
 */
export const dispatchBroadcast = (broadcastId: string): void => {
  setImmediate(() => {
    runBroadcast(broadcastId).catch((err) => {
      logger.error({ err, broadcastId }, 'broadcast.dispatch_failed');
    });
  });
};

export const cancelBroadcast = async (broadcastId: string): Promise<boolean> => {
  const job = activeJobs.get(broadcastId);
  if (job) job.cancelled = true;

  const rows = await db
    .update(adminBroadcasts)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(
      and(
        eq(adminBroadcasts.id, broadcastId),
        sql`"status" IN ('queued','running','interrupted')`,
      ),
    )
    .returning({ id: adminBroadcasts.id });

  if (!rows.length && !job) return false;

  await db
    .update(adminBroadcastRecipients)
    .set({ status: 'cancelled', error: 'cancelled by admin' })
    .where(
      and(
        eq(adminBroadcastRecipients.broadcastId, broadcastId),
        inArray(adminBroadcastRecipients.status, ['pending', 'sending']),
      ),
    );

  await flushProgress(broadcastId);
  const [broadcast] = await db
    .select({ groupId: adminBroadcasts.groupId })
    .from(adminBroadcasts)
    .where(eq(adminBroadcasts.id, broadcastId));
  if (broadcast) await syncGroupStatus(broadcast.groupId);

  return true;
};

/**
 * Stop every queued/running send in a campaign at once.
 */
export const cancelGroup = async (groupId: string): Promise<string[]> => {
  const sends = await db
    .select({ id: adminBroadcasts.id, status: adminBroadcasts.status })
    .from(adminBroadcasts)
    .where(eq(adminBroadcasts.groupId, groupId));

  const cancelled: string[] = [];
  for (const send of sends) {
    if (isTerminal(send.status)) continue;
    await cancelBroadcast(send.id);
    cancelled.push(send.id);
  }

  await db
    .update(adminMessageGroups)
    .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
    .where(eq(adminMessageGroups.id, groupId));

  return cancelled;
};

export const isBroadcastInFlight = (broadcastId: string): boolean => activeJobs.has(broadcastId);

/**
 * Boot hook: a send cannot survive a restart, so stale work becomes resumable.
 */
export const markStaleBroadcastsInterrupted = async (): Promise<number> => {
  const rows = await db
    .update(adminBroadcasts)
    .set({ status: 'interrupted', updatedAt: new Date() })
    .where(inArray(adminBroadcasts.status, ['queued', 'running']))
    .returning({ id: adminBroadcasts.id });

  if (!rows.length) return 0;

  // Half-claimed rows would otherwise never be picked up again.
  await db
    .update(adminBroadcastRecipients)
    .set({ status: 'pending' })
    .where(
      and(
        inArray(adminBroadcastRecipients.broadcastId, rows.map((row) => row.id)),
        eq(adminBroadcastRecipients.status, 'sending'),
      ),
    );

  logger.warn({ count: rows.length }, 'broadcast.marked_interrupted_on_boot');
  return rows.length;
};
