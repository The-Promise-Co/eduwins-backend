import { db } from '../database/db';
import { users, mortgages, mortgagePayments, missedPayments, housingProperties } from '../database/schema';
import { eq, desc } from 'drizzle-orm';

/**
 * Calculate monthly mortgage payment
 * Using standard amortization formula: M = P * [r(1+r)^n] / [(1+r)^n - 1]
 * Where: P = principal, r = monthly rate, n = total months
 */
export const calculateMonthlyPayment = (principal: number, annualRate: number, years: number): number => {
  const monthlyRate = annualRate / 100 / 12;
  const numberOfPayments = years * 12;

  if (monthlyRate === 0) {
    // If no interest, simple division
    return Math.round((principal / numberOfPayments) * 100) / 100;
  }

  const monthlyPayment =
    (principal * (monthlyRate * Math.pow(1 + monthlyRate, numberOfPayments))) /
    (Math.pow(1 + monthlyRate, numberOfPayments) - 1);

  return Math.round(monthlyPayment * 100) / 100;
};

/**
 * Create a housing application/mortgage contract
 */
export const createMortgageContract = async (
  teacherId: string, 
  propertyId: string, 
  mortgageDetails: {
    propertyPrice: number;
    downPayment: number;
    loanTerm: number;
    interestRate: number;
    monthlyIncome: number;
  }
) => {
  try {
    const { propertyPrice, downPayment, loanTerm, interestRate, monthlyIncome } = mortgageDetails;

    // Validate inputs
    if (propertyPrice <= 0 || downPayment < 0 || loanTerm <= 0) {
      throw new Error('Invalid mortgage details');
    }

    // Calculate principal (property price - down payment)
    const principal = propertyPrice - downPayment;

    // Calculate monthly payment
    const monthlyPayment = calculateMonthlyPayment(principal, interestRate, loanTerm);

    // Debt-to-income ratio check (should not exceed 40%)
    const debtToIncomeRatio = (monthlyPayment / monthlyIncome) * 100;
    if (debtToIncomeRatio > 40) {
      return {
        success: false,
        error: 'Monthly payment exceeds 40% of income',
        details: {
          monthlyPayment,
          monthlyIncome,
          ratio: debtToIncomeRatio.toFixed(2) + '%',
          recommendation: 'Consider a larger down payment or longer loan term',
        },
      };
    }

    // Create mortgage record
    const mortgageId = Math.random().toString(36).substring(2, 15);
    const startDate = new Date();
    const endDate = new Date();
    endDate.setFullYear(endDate.getFullYear() + loanTerm);

    await db.insert(mortgages).values({
      id: mortgageId,
      teacherId,
      propertyId,
      propertyPrice: propertyPrice.toString(),
      downPayment: downPayment.toString(),
      principal: principal.toString(),
      loanTerm,
      interestRate: interestRate.toString(),
      monthlyPayment: monthlyPayment.toString(),
      monthlyIncome: monthlyIncome.toString(),
      debtToIncomeRatio: debtToIncomeRatio.toFixed(2),
      status: 'active',
      totalPaid: '0',
      paymentsCompleted: 0,
      paymentsMissed: 0,
      remainingBalance: principal.toString(),
      startDate,
      endDate,
      nextPaymentDue: startDate,
    });

    // Update teacher record in users table
    await db.update(users)
      .set({
        hasActiveMortgage: true,
        activeMortgageId: mortgageId,
        housingStatus: 'rent-to-own',
      })
      .where(eq(users.id, teacherId));

    return {
      success: true,
      mortgage: { id: mortgageId, monthlyPayment, principal, loanTerm, interestRate },
      amortizationSummary: {
        monthlyPayment,
        totalPayments: loanTerm * 12,
        totalInterest: Math.round((monthlyPayment * loanTerm * 12 - principal) * 100) / 100,
        totalCost: Math.round((monthlyPayment * loanTerm * 12) * 100) / 100,
      },
    };
  } catch (err) {
    console.error('Error creating mortgage contract:', err);
    throw err;
  }
};

/**
 * Process monthly mortgage payment (deducted from earnings)
 */
export const processMonthlyMortgage = async (teacherId: string, mortgageId: string, earningsForMonth: number) => {
  try {
    const mortgage = await db.query.mortgages.findFirst({
      where: eq(mortgages.id, mortgageId),
    });

    if (!mortgage) {
      return { success: false, error: 'Mortgage not found' };
    }

    if (mortgage.status !== 'active') {
      return { success: false, error: 'Mortgage is not active' };
    }

    const monthlyPayment = parseFloat(mortgage.monthlyPayment?.toString() || '0');

    // Check if earnings are sufficient
    if (earningsForMonth < monthlyPayment) {
      // Record missed payment
      const missedPaymentId = Math.random().toString(36).substring(2, 15);
      await db.insert(missedPayments).values({
        id: missedPaymentId,
        teacherId,
        mortgageId,
        dueAmount: monthlyPayment.toString(),
        availableAmount: earningsForMonth.toString(),
        dueDate: new Date(),
        status: 'missed',
      });

      // Update mortgage with missed payment count
      await db.update(mortgages)
        .set({
          paymentsMissed: (mortgage.paymentsMissed || 0) + 1,
        })
        .where(eq(mortgages.id, mortgageId));

      return {
        success: false,
        error: 'Insufficient earnings to cover mortgage payment',
        details: {
          dueAmount: monthlyPayment,
          availableAmount: earningsForMonth,
          shortfall: monthlyPayment - earningsForMonth,
        },
      };
    }

    // Process payment
    const paymentId = Math.random().toString(36).substring(2, 15);
    const remainingBalance = parseFloat(mortgage.remainingBalance?.toString() || '0');
    const newRemainingBalance = Math.max(0, remainingBalance - monthlyPayment);
    
    const nextPaymentDue = new Date(mortgage.nextPaymentDue || new Date());
    nextPaymentDue.setMonth(nextPaymentDue.getMonth() + 1);

    const interestRate = parseFloat(mortgage.interestRate?.toString() || '0');
    const interestPaid = (remainingBalance * interestRate) / 100 / 12;
    const principalPaydown = monthlyPayment - interestPaid;

    // Record payment
    await db.insert(mortgagePayments).values({
      id: paymentId,
      teacherId,
      mortgageId,
      amount: monthlyPayment.toString(),
      principalPaydown: principalPaydown.toString(),
      interestPaid: interestPaid.toString(),
      paymentDate: new Date(),
      status: 'completed',
    });

    // Update mortgage record
    const updateData: any = {
      totalPaid: (parseFloat(mortgage.totalPaid?.toString() || '0') + monthlyPayment).toString(),
      paymentsCompleted: (mortgage.paymentsCompleted || 0) + 1,
      remainingBalance: newRemainingBalance.toString(),
      nextPaymentDue,
      lastPaymentDate: new Date(),
    };

    // If mortgage is fully paid, mark as complete
    if (newRemainingBalance <= 0) {
      updateData.status = 'completed';
      updateData.completedAt = new Date();

      // Update teacher status in users table
      await db.update(users)
        .set({
          hasActiveMortgage: false,
          housingStatus: 'homeowner',
          propertyOwned: true,
        })
        .where(eq(users.id, teacherId));
    }

    await db.update(mortgages)
      .set(updateData)
      .where(eq(mortgages.id, mortgageId));

    return {
      success: true,
      payment: {
        paymentId,
        amount: monthlyPayment,
        remaining: newRemainingBalance,
        paymentsCompleted: updateData.paymentsCompleted,
        totalPayments: mortgage.loanTerm * 12,
        status: newRemainingBalance <= 0 ? 'Mortgage Completed - Homeowner!' : 'Payment Processed',
      },
    };
  } catch (err) {
    console.error('Error processing mortgage payment:', err);
    throw err;
  }
};

/**
 * Get mortgage amortization schedule
 */
export const generateAmortizationSchedule = async (mortgageId: string) => {
  try {
    const mortgage = await db.query.mortgages.findFirst({
      where: eq(mortgages.id, mortgageId),
    });

    if (!mortgage) {
      return null;
    }

    const schedule = [];
    const principal = parseFloat(mortgage.principal?.toString() || '0');
    let remainingBalance = principal;
    const monthlyPayment = parseFloat(mortgage.monthlyPayment?.toString() || '0');
    const interestRate = parseFloat(mortgage.interestRate?.toString() || '0');
    const monthlyRate = interestRate / 100 / 12;
    const startDate = mortgage.startDate ? new Date(mortgage.startDate) : new Date();
    const paymentDate = new Date(startDate);

    for (let i = 1; i <= mortgage.loanTerm * 12; i++) {
      const interestPayment = remainingBalance * monthlyRate;
      const principalPayment = monthlyPayment - interestPayment;
      remainingBalance = Math.max(0, remainingBalance - principalPayment);

      schedule.push({
        paymentNumber: i,
        paymentDate: new Date(paymentDate).toISOString(),
        payment: Math.round(monthlyPayment * 100) / 100,
        principal: Math.round(principalPayment * 100) / 100,
        interest: Math.round(interestPayment * 100) / 100,
        balance: Math.round(remainingBalance * 100) / 100,
      });

      paymentDate.setMonth(paymentDate.getMonth() + 1);
    }

    return schedule;
  } catch (err) {
    console.error('Error generating amortization schedule:', err);
    throw err;
  }
};

/**
 * Get mortgage status and progress
 */
export const getMortgageStatus = async (teacherId: string) => {
  try {
    const teacher = await db.query.users.findFirst({
      where: eq(users.id, teacherId),
    });

    if (!teacher || !teacher.activeMortgageId) {
      return null;
    }

    const mortgage = await db.query.mortgages.findFirst({
      where: eq(mortgages.id, teacher.activeMortgageId),
    });

    if (!mortgage) return null;

    // Get payment history
    const history = await db.select()
      .from(mortgagePayments)
      .where(eq(mortgagePayments.mortgageId, mortgage.id))
      .orderBy(desc(mortgagePayments.paymentDate));

    // Calculate equity
    const downPayment = parseFloat(mortgage.downPayment?.toString() || '0');
    const totalPaid = parseFloat(mortgage.totalPaid?.toString() || '0');
    const propertyPrice = parseFloat(mortgage.propertyPrice?.toString() || '0');
    const equity = downPayment + totalPaid;
    const equityPercentage = (equity / propertyPrice) * 100;

    return {
      mortgage: {
        id: mortgage.id,
        status: mortgage.status,
        propertyPrice: propertyPrice,
        downPayment: downPayment,
        loanAmount: parseFloat(mortgage.principal?.toString() || '0'),
        monthlyPayment: parseFloat(mortgage.monthlyPayment?.toString() || '0'),
      },
      progress: {
        paymentsCompleted: mortgage.paymentsCompleted,
        totalPayments: mortgage.loanTerm * 12,
        progressPercentage: (mortgage.paymentsCompleted / (mortgage.loanTerm * 12)) * 100,
        remainingBalance: parseFloat(mortgage.remainingBalance?.toString() || '0'),
        totalPaid: totalPaid,
        paymentsMissed: mortgage.paymentsMissed || 0,
      },
      equity: {
        totalEquity: equity,
        equityPercentage: Math.round(equityPercentage * 100) / 100,
      },
      timeline: {
        startDate: mortgage.startDate?.toISOString(),
        endDate: mortgage.endDate?.toISOString(),
        nextPaymentDue: mortgage.nextPaymentDue?.toISOString(),
        lastPaymentDate: mortgage.lastPaymentDate?.toISOString(),
      },
    };
  } catch (err) {
    console.error('Error getting mortgage status:', err);
    throw err;
  }
};
