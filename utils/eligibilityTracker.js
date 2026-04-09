const { db, admin } = require('../config/firebase');

/**
 * Check if teacher meets basic housing eligibility requirements
 * Requirement: 6 months active teaching + 4.5 star rating
 */
const checkHousingEligibility = async (teacherId) => {
  try {
    const teacherSnapshot = await db.ref(`users/${teacherId}`).once('value');
    const teacher = teacherSnapshot.val();

    if (!teacher) {
      return {
        eligible: false,
        reason: 'Teacher not found',
        details: {},
      };
    }

    // Check registration date (6 months requirement)
    const registrationDate = teacher.createdAt || Date.now();
    const sixMonthsAgo = Date.now() - 180 * 24 * 60 * 60 * 1000;
    const completedSixMonths = registrationDate <= sixMonthsAgo;

    // Check rating (4.5 stars requirement)
    const rating = teacher.rating || 0;
    const meetsRatingRequirement = rating >= 4.5;

    // Check active teaching (has completed lessons)
    const lessonsSnapshot = await db.ref('lessons')
      .orderByChild('teacherId')
      .equalTo(teacherId)
      .once('value');
    const lessons = lessonsSnapshot.val() || {};
    const hasActiveLessons = Object.keys(lessons).length > 0;

    // Check verification status
    const isVerified = teacher.credentials_verified === true;

    const eligibilityDetails = {
      educatorTenure: {
        requirement: '6 months active teaching',
        met: completedSixMonths,
        startDate: new Date(registrationDate).toISOString(),
        qualified: completedSixMonths ? 'Yes' : 'No',
        daysRemaining: Math.max(0, Math.ceil((sixMonthsAgo - registrationDate) / (24 * 60 * 60 * 1000))),
      },
      ratingRequirement: {
        requirement: '4.5+ star rating',
        met: meetsRatingRequirement,
        currentRating: rating,
        qualified: meetsRatingRequirement ? 'Yes' : 'No',
      },
      activeLessons: {
        requirement: 'Must have active lessons',
        met: hasActiveLessons,
        totalLessons: Object.keys(lessons).length,
        qualified: hasActiveLessons ? 'Yes' : 'No',
      },
      verification: {
        requirement: 'Credentials verified by admin',
        met: isVerified,
        qualified: isVerified ? 'Yes' : 'No',
      },
    };

    // Eligible if ALL requirements are met
    const allRequirementsMet =
      completedSixMonths &&
      meetsRatingRequirement &&
      hasActiveLessons &&
      isVerified;

    return {
      eligible: allRequirementsMet,
      reason: allRequirementsMet
        ? 'Teacher meets all eligibility requirements'
        : 'Teacher does not meet all requirements',
      details: eligibilityDetails,
      nextStep: allRequirementsMet
        ? 'Teacher is eligible for Housing Tier Step 2 (Welfare Fund Milestone)'
        : 'Complete remaining requirements',
    };
  } catch (err) {
    console.error('Error checking housing eligibility:', err);
    throw err;
  }
};

/**
 * Track teacher's progress toward housing qualification
 */
const trackEligibilityProgress = async (teacherId) => {
  try {
    const eligibility = await checkHousingEligibility(teacherId);

    // Store eligibility tracking record
    const trackingId = db.ref('housing_eligibility').push().key;
    const tracking = {
      id: trackingId,
      teacherId,
      ...eligibility,
      checkedAt: admin.database.ServerValue.TIMESTAMP,
      lastUpdated: admin.database.ServerValue.TIMESTAMP,
    };

    await db.ref(`housing_eligibility/${trackingId}`).set(tracking);

    // Update teacher's housing status
    await db.ref(`users/${teacherId}`).update({
      housing_eligible: eligibility.eligible,
      housing_eligibility_checked: true,
      housing_eligibility_details: eligibility.details,
    });

    return eligibility;
  } catch (err) {
    console.error('Error tracking eligibility:', err);
    throw err;
  }
};

/**
 * Get current eligibility status for teacher
 */
const getEligibilityStatus = async (teacherId) => {
  try {
    const teacherSnapshot = await db.ref(`users/${teacherId}`).once('value');
    const teacher = teacherSnapshot.val();

    if (!teacher) {
      return null;
    }

    const eligibilitySnapshot = await db.ref('housing_eligibility')
      .orderByChild('teacherId')
      .equalTo(teacherId)
      .limitToLast(1)
      .once('value');

    const records = eligibilitySnapshot.val() || {};
    if (Object.keys(records).length === 0) {
      // If no tracking record yet, generate one
      return await trackEligibilityProgress(teacherId);
    }

    const latestRecord = Object.values(records)[0];
    return latestRecord;
  } catch (err) {
    console.error('Error getting eligibility status:', err);
    throw err;
  }
};

module.exports = {
  checkHousingEligibility,
  trackEligibilityProgress,
  getEligibilityStatus,
};
