const { db, admin } = require('../config/firebase');

/**
 * Calculate total welfare fund accumulated
 */
const calculateTotalWelfareFund = async (teacherId) => {
  try {
    const welfareSnapshot = await db.ref(`welfare_funds/${teacherId}`).once('value');
    const welfare = welfareSnapshot.val();

    if (!welfare) {
      return 0;
    }

    // Sum all monthly accumulations
    const total = Object.values(welfare).reduce((sum, month) => {
      return sum + (month.amount || 0);
    }, 0);

    return total;
  } catch (err) {
    console.error('Error calculating welfare fund:', err);
    return 0;
  }
};

/**
 * Check if teacher has reached housing milestone (₦500,000)
 * If yes, unlock Housing Tier access
 */
const checkHousingMilestone = async (teacherId) => {
  try {
    const total = await calculateTotalWelfareFund(teacherId);
    const HOUSING_MILESTONE = 500000; // ₦500,000
    const milestoneReached = total >= HOUSING_MILESTONE;

    // Store milestone tracking
    const milestoneRecord = {
      teacherId,
      totalWelfareFund: total,
      milestoneAmount: HOUSING_MILESTONE,
      milestoneReached,
      checkedAt: admin.database.ServerValue.TIMESTAMP,
    };

    // If milestone reached, unlock Housing Tier
    if (milestoneReached) {
      // Check if already unlocked to avoid duplicate processing
      const teacherSnapshot = await db.ref(`users/${teacherId}`).once('value');
      const teacher = teacherSnapshot.val();

      if (!teacher.housing_tier_unlocked) {
        await db.ref(`users/${teacherId}`).update({
          housing_tier_unlocked: true,
          housing_tier_unlock_date: admin.database.ServerValue.TIMESTAMP,
          housing_eligible_for_application: true,
        });

        // Create milestone achievement record
        const achievementId = db.ref('housing_milestones').push().key;
        await db.ref(`housing_milestones/${achievementId}`).set({
          id: achievementId,
          teacherId,
          milestoneType: 'welfare_fund_500k',
          amount: total,
          achievedAt: admin.database.ServerValue.TIMESTAMP,
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
const getWelfareFundProgress = async (teacherId) => {
  try {
    const total = await calculateTotalWelfareFund(teacherId);
    const HOUSING_MILESTONE = 500000;

    const teacherSnapshot = await db.ref(`users/${teacherId}`).once('value');
    const teacher = teacherSnapshot.val();

    return {
      teacherId,
      totalAccumulated: total,
      milestonTarget: HOUSING_MILESTONE,
      progressPercentage: Math.min(100, (total / HOUSING_MILESTONE) * 100),
      remainingAmount: Math.max(0, HOUSING_MILESTONE - total),
      milestoneReached: total >= HOUSING_MILESTONE,
      housingTierUnlocked: teacher.housing_tier_unlocked || false,
      unlockDate: teacher.housing_tier_unlock_date
        ? new Date(teacher.housing_tier_unlock_date).toISOString()
        : null,
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
const estimateMilestoneDate = async (teacherId) => {
  try {
    const welfareSnapshot = await db.ref(`welfare_funds/${teacherId}`).once('value');
    const welfare = welfareSnapshot.val() || {};

    // Calculate average monthly savings
    const months = Object.keys(welfare);
    if (months.length === 0) {
      return null;
    }

    const amounts = Object.values(welfare).map((m) => m.amount || 0);
    const averageMonthly = amounts.reduce((a, b) => a + b, 0) / months.length;

    const currentTotal = await calculateTotalWelfareFund(teacherId);
    const HOUSING_MILESTONE = 500000;

    if (currentTotal >= HOUSING_MILESTONE) {
      return {
        alreadyReached: true,
        reachedOnDate: new Date(welfare[months[months.length - 1]].createdAt).toISOString(),
      };
    }

    const remainingAmount = HOUSING_MILESTONE - currentTotal;
    const monthsRemaining = Math.ceil(remainingAmount / averageMonthly);
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

module.exports = {
  calculateTotalWelfareFund,
  checkHousingMilestone,
  getWelfareFundProgress,
  estimateMilestoneDate,
};
