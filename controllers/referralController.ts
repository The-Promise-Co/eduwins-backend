import { Response } from 'express';
import { db } from '../database/db';
import { users, referrals } from '../database/schema';
import { eq, inArray } from 'drizzle-orm';
import logger from '../utils/logger';

interface AuthenticatedRequest {
  user: { id: string; role: string };
}

// Reward for the referrer when a referred tutor's FIRST PAID subscription
// (Silver and up) is verified. Mirrors authController; pricing lives in the
// subscription plan catalog, never here.
const REFERRAL_SUBSCRIPTION_REWARD = 150;

/**
 * GET /api/referrals/my
 * Returns all referrals made by the authenticated user.
 * Each entry includes:
 *  - referee name, role, and join date
 *  - subscription plan details (plan label, reward) — shown once the referee subscribes
 *  - status: 'pending' | 'subscribed'
 *  - rewardCredited, rewardedAt
 */
export const getMyReferrals = async (req: any, res: Response) => {
  try {
    const referrerId = req.user.id;

    // Fetch all referral rows for this referrer
    const rows = await db.select().from(referrals).where(eq(referrals.referrerId, referrerId));

    if (rows.length === 0) {
      return res.json({ referrals: [], summary: buildSummary([]) });
    }

    const refereeIds = rows.map((r) => r.refereeId);
    const refereeUsers = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        email: users.email,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(inArray(users.id, refereeIds));

    const refereeMap = new Map(refereeUsers.map((u) => [u.id, u]));

    // Shape each row
    const shaped = rows.map((row) => {
      const referee = refereeMap.get(row.refereeId);
      const plan = row.subscriptionPlan;

      // Potential reward the referrer can earn once this referee takes a paid
      // subscription (for display in pending rows)
      const pendingRewardEstimates = {
        silver: { reward: REFERRAL_SUBSCRIPTION_REWARD },
        gold: { reward: REFERRAL_SUBSCRIPTION_REWARD },
        platinum: { reward: REFERRAL_SUBSCRIPTION_REWARD },
      };

      return {
        id: row.id,
        referrerId: row.referrerId,
        refereeId: row.refereeId,
        subscriptionPlan: row.subscriptionPlan,
        rewardAmount: row.rewardAmount,
        status: row.status,
        rewardCredited: row.rewardCredited,
        createdAt: row.createdAt,
        rewardedAt: row.rewardedAt,
        referee: referee
          ? {
              id: row.refereeId,
              name: `${referee.firstName} ${referee.lastName}`,
              role: referee.role,
              email: referee.email,
              joinedAt: referee.createdAt,
            }
          : null,
        // Subscription details — only populated after the referee subscribes
        subscription: plan
          ? {
              plan,
              planLabel: formatPlanLabel(plan),
              rewardAmount: Number(row.rewardAmount),
            }
          : null,

        // Reward estimates for pending referrals (so the UI can show potential earnings)
        pendingRewardEstimates: row.status === 'pending' ? pendingRewardEstimates : null,
      };
    });

    return res.json({
      referrals: shaped,
      summary: buildSummary(rows),
    });
  } catch (err: any) {
    logger.error({ err }, 'Failed to fetch referrals');
    res.status(500).json({ error: 'Unable to fetch referrals' });
  }
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatPlanLabel(plan: string): string {
  const labels: Record<string, string> = {
    silver: 'Silver',
    gold: 'Gold',
    platinum: 'Platinum',
  };
  return labels[plan] ?? plan;
}

function buildSummary(rows: any[]) {
  const total = rows.length;
  const pending = rows.filter((r) => r.status === 'pending').length;
  const subscribed = rows.filter((r) => r.status === 'subscribed').length;
  const totalRewardCredited = rows
    .filter((r) => r.rewardCredited)
    .reduce((sum, r) => sum + Number(r.rewardAmount || 0), 0);
  const pendingRewardEstimate = rows
    .filter((r) => r.status === 'pending')
    .reduce((sum) => sum + REFERRAL_SUBSCRIPTION_REWARD, 0);

  return {
    total,
    pending,
    subscribed,
    totalRewardCredited,
    pendingRewardEstimate,
  };
}
