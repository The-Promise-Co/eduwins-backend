import { db } from '../database/db';
import { users, welfareFunds, housingMilestones } from '../database/schema';
import { eq, sql } from 'drizzle-orm';

/**
 * Calculate total welfare fund accumulated
 */
export const calculateTotalWelfareFund = async (teacherId: string): Promise<number> => {
  try {
    const results = await db.select({
      total: sql<number>`sum(${welfareFunds.amount})`
    })
    .from(welfareFunds)
    .where(eq(welfareFunds.teacherId, teacherId));

    const total = results[0]?.total || 0;
    return parseFloat(total.toString());
  } catch (err) {
    console.error('Error calculating welfare fund:', err);
    return 0;
  }
};

/**
 * Check if teacher has reached housing milestone (₦500,000)
 * If yes, unlock Housing Tier access
 */
export const checkHousingMilestone = async (teacherId: string) => {
  try {
    const total = await calculateTotalWelfareFund(teacherId);
    const HOUSING_MILESTONE = 500000; // ₦500,000
    const milestoneReached = total >= HOUSING_MILESTONE;

    // If milestone reached, unlock Housing Tier
    if (milestoneReached) {
      const teacher = await db.query.users.findFirst({
        where: eq(users.id, teacherId),
      });

      if (teacher && !teacher.housingEligible) {
        await db.update(users)
          .set({
            housingEligible: true,
            housingStatus: 'ready-for-properties', // Custom status for milestone reached
          })
          .where(eq(users.id, teacherId));

        // Create milestone achievement record
        const achievementId = Math.random().toString(36).substring(2, 15);
        await db.insert(housingMilestones).values({
          id: achievementId,
          teacherId,
          milestoneType: 'welfare_fund_500k',
          amount: total.toString(),
          achievedAt: new Date(),
          status: 'completed',
        });

        return {
          milestoneReached: true,
          action: 'Housing Tier Unlocked',
          message: `Teacher has reached ₦${total.toLocaleString()} in welfare fund savings. Housing Tier is now unlocked!`,
          totalWelfareFund: total,
        };
      }
    }

    return {
      milestoneReached,
      totalWelfareFund: total,
      progressPercentage: Math.min(100, (total / HOUSING_MILESTONE) * 100),
      remainingToMilestone: Math.max(0, HOUSING_MILESTONE - total),
    };
  } catch (err) {
    console.error('Error checking housing milestone:', err);
    throw err;
  }
};

/**
 * Get welfare fund progress toward housing tier
 */
export const getWelfareFundProgress = async (teacherId: string) => {
  try {
    const total = await calculateTotalWelfareFund(teacherId);
    const HOUSING_MILESTONE = 500000;

    const teacher = await db.query.users.findFirst({
      where: eq(users.id, teacherId),
    });

    if (!teacher) throw new Error('Teacher not found');

    return {
      teacherId,
      totalAccumulated: total,
      milestonTarget: HOUSING_MILESTONE,
      progressPercentage: Math.min(100, (total / HOUSING_MILESTONE) * 100),
      remainingAmount: Math.max(0, HOUSING_MILESTONE - total),
      milestoneReached: total >= HOUSING_MILESTONE,
      housingTierUnlocked: teacher.housingEligible || false,
      status: total >= HOUSING_MILESTONE
        ? 'Housing Tier Unlocked - Eligible for Housing Applications'
        : `${Math.ceil((HOUSING_MILESTONE - total) / 12)} months remaining at current savings rate`,
    };
  } catch (err) {
    console.error('Error getting welfare fund progress:', err);
    throw err;
  }
};

/**
 * Simulate welfare fund growth to estimate when milestone is reached
 */
export const estimateMilestoneDate = async (teacherId: string) => {
  try {
    const historicalFunds = await db.select()
      .from(welfareFunds)
      .where(eq(welfareFunds.teacherId, teacherId));

    if (historicalFunds.length === 0) {
      return null;
    }

    const amounts = historicalFunds.map((m) => parseFloat(m.amount?.toString() || '0'));
    const averageMonthly = amounts.reduce((a, b) => a + b, 0) / historicalFunds.length;

    const currentTotal = await calculateTotalWelfareFund(teacherId);
    const HOUSING_MILESTONE = 500000;

    if (currentTotal >= HOUSING_MILESTONE) {
      return {
        alreadyReached: true,
        reachedOnDate: historicalFunds[historicalFunds.length - 1].createdAt?.toISOString(),
      };
    }

    const remainingAmount = HOUSING_MILESTONE - currentTotal;
    const monthsRemaining = Math.max(1, Math.ceil(remainingAmount / (averageMonthly || 41666))); // 41666 is safe fallback (500k/12)
    
    const estimatedDate = new Date();
    estimatedDate.setMonth(estimatedDate.getMonth() + monthsRemaining);

    return {
      alreadyReached: false,
      currentTotal,
      averageMonthlyContribution: averageMonthly,
      remainingAmount,
      estimatedMonthsRemaining: monthsRemaining,
      estimatedDate: estimatedDate.toISOString(),
      estimatedMonthYear: estimatedDate.toLocaleString('en-US', {
        month: 'long',
        year: 'numeric',
      }),
    };
  } catch (err) {
    console.error('Error estimating milestone date:', err);
    throw err;
  }
};
