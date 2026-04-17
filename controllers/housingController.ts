import { Request, Response } from 'express';
import { db } from '../database/db';
import { users, housingApplications, housingProperties, mortgagePayments } from '../database/schema';
import { eq, desc } from 'drizzle-orm';
import { trackEligibilityProgress, getEligibilityStatus, checkHousingEligibility } from '../utils/eligibilityTracker';
import { getWelfareFundProgress, estimateMilestoneDate } from '../utils/welfareCalculator';
import { createMortgageContract, processMonthlyMortgage, getMortgageStatus, generateAmortizationSchedule } from '../utils/mortgageCalculator';

// Extend Request type to include user
interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    role: string;
  }
}

/**
 * GET /api/housing/eligibility
 * Check teacher's housing eligibility status
 */
export const checkEligibility = async (req: AuthenticatedRequest, res: Response) => {
  const teacherId = req.user.id;

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
          sixMonthsTeaching: (eligibility.details as any).educatorTenure,
          fourPointFiveRating: (eligibility.details as any).ratingRequirement,
          activeLessons: (eligibility.details as any).activeLessons,
          credentialsVerified: (eligibility.details as any).verification,
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
  } catch (err: any) {
    console.error('Error checking eligibility:', err);
    res.status(500).json({ error: 'Failed to check housing eligibility: ' + err.message });
  }
};

/**
 * GET /api/housing/status
 * Get teacher's housing program status
 */
export const getHousingStatus = async (req: AuthenticatedRequest, res: Response) => {
  const teacherId = req.user.id;

  try {
    const teacher = await db.query.users.findFirst({
      where: eq(users.id, teacherId),
    });

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
    if (teacher.hasActiveMortgage) {
      mortgageStatus = await getMortgageStatus(teacherId);
    }

    res.status(200).json({
      teacherId,
      housingProgram: {
        enrolled: teacher.housingEligible || false,
        currentStatus: teacher.housingStatus || 'not-started',
      },
      eligibility: {
        step1Met: (eligibility as any)?.eligible || false,
        step1Details: (eligibility as any)?.details || {},
      },
      welfareFund: {
        totalAccumulated: welfareProgress.totalAccumulated,
        progressTowardMilestone: welfareProgress.progressPercentage.toFixed(2) + '%',
        milestoneReached: welfareProgress.milestoneReached,
        tierUnlocked: welfareProgress.housingTierUnlocked,
        estimatedMilestoneDate: (estimatedMilestone as any)?.estimatedMonthYear || 'N/A',
      },
      mortgage: mortgageStatus,
      summary: {
        step: teacher.housingStatus === 'homeowner'
          ? 'Complete - Homeowner'
          : teacher.hasActiveMortgage
          ? 'Step 4 - Rent-to-Own in Progress'
          : welfareProgress.milestoneReached
          ? 'Step 3 - Ready for Partnership Properties'
          : 'Step 2 - Building Welfare Fund',
      },
    });
  } catch (err: any) {
    console.error('Error getting housing status:', err);
    res.status(500).json({ error: 'Failed to retrieve housing status: ' + err.message });
  }
};

/**
 * POST /api/housing/apply
 * Teacher applies for housing program
 */
export const applyForHousing = async (req: AuthenticatedRequest, res: Response) => {
  const teacherId = req.user.id;
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
    const property = await db.query.housingProperties.findFirst({
      where: eq(housingProperties.id, propertyId),
    });

    if (!property) {
      return res.status(404).json({ error: 'Property not found' });
    }

    if (property.status !== 'available') {
      return res.status(400).json({ error: 'Property is not available' });
    }

    const teacher = await db.query.users.findFirst({
      where: eq(users.id, teacherId),
    });
    const monthlyIncome = parseFloat(teacher?.averageMonthlyEarnings?.toString() || '50000');

    // Create mortgage contract
    const mortgageResult = await createMortgageContract(
      teacherId,
      propertyId,
      {
        propertyPrice: parseFloat(property.price?.toString() || '0'),
        downPayment: mortgageDetails.downPayment || Math.min(
          parseFloat(property.price?.toString() || '0') * 0.2,
          welfareProgress.totalAccumulated
        ),
        loanTerm: mortgageDetails.loanTerm || 10,
        interestRate: mortgageDetails.interestRate || 8.5,
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
    const applicationId = Math.random().toString(36).substring(2, 15);
    const application = {
      id: applicationId,
      teacherId,
      propertyId,
      mortgageId: mortgageResult.mortgage?.id,
      status: 'approved',
      propertyDetails: {
        address: property.address,
        price: property.price,
        bedrooms: property.bedrooms,
        bathrooms: property.bathrooms,
      },
      mortgageDetails: mortgageResult.mortgage,
      appliedAt: new Date(),
      approvedAt: new Date(),
    };

    await db.insert(housingApplications).values(application);

    // Mark property as occupied
    await db.update(housingProperties)
      .set({
        status: 'occupied',
        occupiedBy: teacherId,
        occupiedSince: new Date(),
      })
      .where(eq(housingProperties.id, propertyId));

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
  } catch (err: any) {
    console.error('Error applying for housing:', err);
    res.status(500).json({ error: 'Failed to process housing application: ' + err.message });
  }
};

/**
 * POST /api/housing/process-payment
 * Process monthly mortgage payment from teacher earnings
 */
export const processMonthlyPayment = async (req: AuthenticatedRequest, res: Response) => {
  const teacherId = req.user.id;
  const { earningsForMonth } = req.body;

  try {
    const teacher = await db.query.users.findFirst({
      where: eq(users.id, teacherId),
    });

    if (!teacher || !teacher.activeMortgageId) {
      return res.status(404).json({ error: 'No active mortgage found' });
    }

    // Process the payment
    const paymentResult = await processMonthlyMortgage(
      teacherId,
      teacher.activeMortgageId,
      earningsForMonth
    );

    if (!paymentResult.success) {
      return res.status(400).json(paymentResult);
    }

    res.status(200).json({
      success: true,
      payment: paymentResult.payment,
      message:
        (paymentResult.payment as any).status === 'Mortgage Completed - Homeowner!'
          ? 'Congratulations! Your mortgage is fully paid. You are now a homeowner!'
          : 'Mortgage payment processed successfully',
    });
  } catch (err: any) {
    console.error('Error processing payment:', err);
    res.status(500).json({ error: 'Failed to process mortgage payment: ' + err.message });
  }
};

/**
 * GET /api/housing/mortgage/:mortgageId/schedule
 * Get amortization schedule for mortgage
 */
export const getMortgageSchedule = async (req: Request, res: Response) => {
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
  } catch (err: any) {
    console.error('Error getting mortgage schedule:', err);
    res.status(500).json({ error: 'Failed to retrieve mortgage schedule: ' + err.message });
  }
};

/**
 * GET /api/housing/payments
 * Get teacher's mortgage payment history
 */
export const getPaymentHistory = async (req: AuthenticatedRequest, res: Response) => {
  const teacherId = req.user.id;

  try {
    const payments = await db.select()
      .from(mortgagePayments)
      .where(eq(mortgagePayments.teacherId, teacherId))
      .orderBy(desc(mortgagePayments.paymentDate));

    res.status(200).json({
      teacherId,
      totalPayments: payments.length,
      payments: payments,
    });
  } catch (err: any) {
    console.error('Error getting payment history:', err);
    res.status(500).json({ error: 'Failed to retrieve payment history: ' + err.message });
  }
};
