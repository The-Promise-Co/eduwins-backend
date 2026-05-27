import { Response } from 'express';
import { db } from '../database/db';
import { users, referrals } from '../database/schema';
import { eq } from 'drizzle-orm';
import logger from '../utils/logger';

interface AuthenticatedRequest {
  user: { id: string; role: string };
}

// Reward table — mirrors authController constants; single source of truth should
// eventually live in a shared config file.
const PLAN_REWARDS: Record<string, number> = {
  monthly: 500,
  quarterly: 1500,
  annual: 5000,
};

const PLAN_PRICES: Record<string, number> = {
  monthly: 5000,
  quarterly: 12000,
  annual: 40000,
};

/**
 * GET /api/referrals/my
 * Returns all referrals made by the authenticated user.
 * Each entry includes:
 *  - referee name, role, and join date
 *  - subscription plan details (plan label, price, reward) — shown once the referee subscribes
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

    // Fetch referee user records in bulk
    const refereeIds = rows.map((r) => r.refereeId);
    const refereeUsers = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        email: users.email,
      })
      .from(users)
      .where(eq(users.id, refereeIds[0])); // initial fetch — see note below

    // Drizzle doesn't have inArray in this version easily accessible via query builder
    // so we fetch all referees individually if there are multiple. Fine for referral counts.
    const refereeMap: Record<string, { firstName: string; lastName: string; role: string; email: string }> = {};

    await Promise.all(
      refereeIds.map(async (rid) => {
        const u = await db.query.users.findFirst({ where: eq(users.id, rid) });
        if (u) {
          refereeMap[rid] = {
            firstName: u.firstName,
            lastName: u.lastName,
            role: u.role,
            email: u.email,
          };
        }
      }),
    );

    // Shape each row
    const shaped = rows.map((row) => {
      const referee = refereeMap[row.refereeId];
      const plan = row.subscriptionPlan;

      // Potential reward the referrer can earn for this referee's subscription (for display in pending rows)
      const pendingRewardEstimates = {
        monthly:   { price: PLAN_PRICES.monthly,   reward: PLAN_REWARDS.monthly },
        quarterly: { price: PLAN_PRICES.quarterly, reward: PLAN_REWARDS.quarterly },
        annual:    { price: PLAN_PRICES.annual,    reward: PLAN_REWARDS.annual },
      };

      return {
        id: row.id,
        referee: referee
          ? {
              id: row.refereeId,
              name: `${referee.firstName} ${referee.lastName}`,
              role: referee.role,
              email: referee.email,
            }
          : null,
        status: row.status,
        rewardCredited: row.rewardCredited,
        createdAt: row.createdAt,
        rewardedAt: row.rewardedAt,

        // Subscription details — only populated after the referee subscribes
        subscription: plan
          ? {
              plan,
              planLabel: formatPlanLabel(plan),
              price: Number(row.subscriptionPrice),
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
    monthly: 'Monthly (₦5,000/mo)',
    quarterly: 'Quarterly (₦12,000/3mo)',
    annual: 'Annual (₦40,000/yr)',
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
    .reduce((sum) => sum + PLAN_REWARDS.monthly, 0); // conservative estimate using lowest plan

  return {
    total,
    pending,
    subscribed,
    totalRewardCredited,
    pendingRewardEstimate,
  };
}
