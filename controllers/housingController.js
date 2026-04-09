const { db, admin } = require('../config/firebase');
const {
  checkHousingEligibility,
  trackEligibilityProgress,
  getEligibilityStatus,
} = require('../utils/eligibilityTracker');
const {
  checkHousingMilestone,
  getWelfareFundProgress,
  estimateMilestoneDate,
} = require('../utils/welfareCalculator');
const {
  createMortgageContract,
  processMonthlyMortgage,
  getMortgageStatus,
  generateAmortizationSchedule,
} = require('../utils/mortgageCalculator');

/**
 * GET /api/housing/eligibility
 * Check teacher's housing eligibility status
 */
exports.checkEligibility = async (req, res) => {
  const { id: teacherId } = req.user;

  try {
    // Track eligibility progress
    const eligibility = await trackEligibilityProgress(teacherId);

    // Check if housing tier is unlocked via welfare fund
    const welfareProgress = await getWelfareFundProgress(teacherId);

    res.status(200).json({
      teacherId,
      step1Entry: {
        name: 'Entry - Trust Building',
        requirements: {
          sixMonthsTeaching: eligibility.details.educatorTenure,
          fourPointFiveRating: eligibility.details.ratingRequirement,
          activeLessons: eligibility.details.activeLessons,
          credentialsVerified: eligibility.details.verification,
        },
        overallRequirementsMet: eligibility.eligible,
      },
      step2Seed: {
        name: 'Seed - Welfare Fund Milestone',
        welfareFundProgress: welfareProgress,
        milestoneStatus: welfareProgress.milestoneReached
          ? 'Housing Tier Unlocked'
          : `${Math.round(welfareProgress.progressPercentage)}% toward ₦500,000 milestone`,
      },
      status: eligibility.eligible
        ? 'Eligible for Housing Program'
        : 'Not Yet Eligible - ' + eligibility.reason,
      nextSteps: eligibility.eligible
        ? [
            'Step 1: Maintain teaching quality and consistency',
            'Step 2: Build welfare fund to ₦500,000 to unlock Housing Tier',
            'Step 3: Edu-Wins negotiates partnerships with developers/FMBN',
            'Step 4: Apply for rent-to-own property',
          ]
        : ['Complete remaining eligibility requirements'],
    });
  } catch (err) {
    console.error('Error checking eligibility:', err);
    res.status(500).json({ error: 'Failed to check housing eligibility: ' + err.message });
  }
};

/**
 * GET /api/housing/status
 * Get teacher's housing program status
 */
exports.getHousingStatus = async (req, res) => {
  const { id: teacherId } = req.user;

  try {
    const teacherSnapshot = await db.ref(`users/${teacherId}`).once('value');
    const teacher = teacherSnapshot.val();

    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found' });
    }

    // Get eligibility status
    const eligibility = await getEligibilityStatus(teacherId);

    // Get welfare progress
    const welfareProgress = await getWelfareFundProgress(teacherId);
    const estimatedMilestone = await estimateMilestoneDate(teacherId);

    // Get mortgage status if active
    let mortgageStatus = null;
    if (teacher.has_active_mortgage) {
      mortgageStatus = await getMortgageStatus(teacherId);
    }

    res.status(200).json({
      teacherId,
      hosingProgram: {
        enrolled: teacher.housing_eligible_for_application || false,
        currentStatus: teacher.housing_status || 'not-started',
      },
      eligibility: {
        step1Met: eligibility.eligible,
        step1Details: eligibility.details,
      },
      welfareFund: {
        totalAccumulated: welfareProgress.totalAccumulated,
        progressTowardMilestone: welfareProgress.progressPercentage.toFixed(2) + '%',
        milestonReached: welfareProgress.milestoneReached,
        tierUnlocked: welfareProgress.housingTierUnlocked,
        estimatedMilestoneDate: estimatedMilestone?.estimatedMonthYear || 'N/A',
      },
      mortgage: mortgageStatus,
      summary: {
        step: teacher.housing_status === 'homeowner'
          ? 'Complete - Homeowner'
          : teacher.has_active_mortgage
          ? 'Step 4 - Rent-to-Own in Progress'
          : welfareProgress.milestoneReached
          ? 'Step 3 - Ready for Partnership Properties'
          : 'Step 2 - Building Welfare Fund',
      },
    });
  } catch (err) {
    console.error('Error getting housing status:', err);
    res.status(500).json({ error: 'Failed to retrieve housing status: ' + err.message });
  }
};

/**
 * POST /api/housing/apply
 * Teacher applies for housing program
 */
exports.applyForHousing = async (req, res) => {
  const { id: teacherId } = req.user;
  const { propertyId, mortgageDetails } = req.body;

  try {
    // Verify eligibility
    const eligibility = await checkHousingEligibility(teacherId);
    if (!eligibility.eligible) {
      return res.status(403).json({
        error: 'Not eligible for housing program',
        reason: eligibility.reason,
      });
    }

    // Check welfare fund milestone
    const welfareProgress = await getWelfareFundProgress(teacherId);
    if (!welfareProgress.milestoneReached) {
      return res.status(403).json({
        error: 'Welfare fund milestone not reached',
        current: welfareProgress.totalAccumulated,
        required: welfareProgress.milestonTarget,
        remaining: welfareProgress.remainingAmount,
      });
    }

    // Get property details
    const propertySnapshot = await db.ref(`housing_properties/${propertyId}`).once('value');
    const property = propertySnapshot.val();

    if (!property) {
      return res.status(404).json({ error: 'Property not found' });
    }

    if (property.status !== 'available') {
      return res.status(400).json({ error: 'Property is not available' });
    }

    // Get teacher's monthly income (from earnings)
    const teacherSnapshot = await db.ref(`users/${teacherId}`).once('value');
    const teacher = teacherSnapshot.val();
    const monthlyIncome = teacher.average_monthly_earnings || 50000; // Default estimate

    // Create mortgage contract
    const mortgageResult = await createMortgageContract(
      teacherId,
      propertyId,
      {
        propertyPrice: property.price,
        downPayment: mortgageDetails.downPayment ||  Math.min(
          property.price * 0.2,
          welfareProgress.totalAccumulated
        ), // 20% or welfare fund available
        loanTerm: mortgageDetails.loanTerm || 10,
        interestRate: mortgageDetails.interestRate || 8.5, // Standard mortgage rate
        monthlyIncome,
      }
    );

    if (!mortgageResult.success) {
      return res.status(400).json({
        error: 'Mortgage application rejected',
        details: mortgageResult.details,
      });
    }

    // Create application record
    const applicationId = db.ref('housing_applications').push().key;
    const application = {
      id: applicationId,
      teacherId,
      propertyId,
      mortgageId: mortgageResult.mortgage.id,
      status: 'approved',
      propertyDetails: {
        address: property.address,
        price: property.price,
        bedrooms: property.bedrooms,
        bathrooms: property.bathrooms,
      },
      mortgageDetails: mortgageResult.mortgage,
      appliedAt: admin.database.ServerValue.TIMESTAMP,
      approvedAt: admin.database.ServerValue.TIMESTAMP,
    };

    await db.ref(`housing_applications/${applicationId}`).set(application);

    // Mark property as occupied
    await db.ref(`housing_properties/${propertyId}`).update({
      status: 'occupied',
      occupiedBy: teacherId,
      occupiedSince: admin.database.ServerValue.TIMESTAMP,
    });

    res.status(201).json({
      success: true,
      applicationId,
      message: 'Housing application approved! Mortgage contract created.',
      application,
      nextSteps: [
        'Review your mortgage amortization schedule',
        'Prepare documents for property transfer',
        'Monthly mortgage payments will be deducted from your earnings',
      ],
    });
  } catch (err) {
    console.error('Error applying for housing:', err);
    res.status(500).json({ error: 'Failed to process housing application: ' + err.message });
  }
};

/**
 * POST /api/housing/process-payment
 * Process monthly mortgage payment from teacher earnings
 */
exports.processMonthlyPayment = async (req, res) => {
  const { id: teacherId } = req.user;
  const { earningsForMonth } = req.body;

  try {
    const teacherSnapshot = await db.ref(`users/${teacherId}`).once('value');
    const teacher = teacherSnapshot.val();

    if (!teacher.active_mortgage_id) {
      return res.status(404).json({ error: 'No active mortgage found' });
    }

    // Process the payment
    const paymentResult = await processMonthlyMortgage(
      teacherId,
      teacher.active_mortgage_id,
      earningsForMonth
    );

    if (!paymentResult.success) {
      return res.status(400).json(paymentResult);
    }

    res.status(200).json({
      success: true,
      payment: paymentResult.payment,
      message:
        paymentResult.payment.status === 'Mortgage Completed - Homeowner!'
          ? 'Congratulations! Your mortgage is fully paid. You are now a homeowner!'
          : 'Mortgage payment processed successfully',
    });
  } catch (err) {
    console.error('Error processing payment:', err);
    res.status(500).json({ error: 'Failed to process mortgage payment: ' + err.message });
  }
};

/**
 * GET /api/housing/mortgage/:mortgageId/schedule
 * Get amortization schedule for mortgage
 */
exports.getMortgageSchedule = async (req, res) => {
  const { mortgageId } = req.params;

  try {
    const schedule = await generateAmortizationSchedule(mortgageId);

    if (!schedule) {
      return res.status(404).json({ error: 'Mortgage not found' });
    }

    res.status(200).json({
      mortgageId,
      totalPayments: schedule.length,
      schedule: schedule,
      summary: {
        totalPayments: schedule.length,
        totalPrincipal: Math.round(
          schedule.reduce((sum, p) => sum + p.principal, 0) * 100
        ) / 100,
        totalInterest: Math.round(
          schedule.reduce((sum, p) => sum + p.interest, 0) * 100
        ) / 100,
        totalCost: Math.round(
          schedule.reduce((sum, p) => sum + p.payment, 0) * 100
        ) / 100,
      },
    });
  } catch (err) {
    console.error('Error getting mortgage schedule:', err);
    res.status(500).json({ error: 'Failed to retrieve mortgage schedule: ' + err.message });
  }
};

/**
 * GET /api/housing/payments
 * Get teacher's mortgage payment history
 */
exports.getPaymentHistory = async (req, res) => {
  const { id: teacherId } = req.user;

  try {
    const paymentsSnapshot = await db.ref('mortgage_payments')
      .orderByChild('teacherId')
      .equalTo(teacherId)
      .once('value');

    const payments = paymentsSnapshot.val() || {};
    const paymentList = Object.values(payments).sort(
      (a, b) => new Date(b.paymentDate) - new Date(a.paymentDate)
    );

    res.status(200).json({
      teacherId,
      totalPayments: Object.keys(payments).length,
      payments: paymentList,
    });
  } catch (err) {
    console.error('Error getting payment history:', err);
    res.status(500).json({ error: 'Failed to retrieve payment history: ' + err.message });
  }
};
