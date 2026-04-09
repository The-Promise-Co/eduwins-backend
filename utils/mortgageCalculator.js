const { db, admin } = require('../config/firebase');

/**
 * Calculate monthly mortgage payment
 * Using standard amortization formula: M = P * [r(1+r)^n] / [(1+r)^n - 1]
 * Where: P = principal, r = monthly rate, n = total months
 */
const calculateMonthlyPayment = (principal, annualRate, years) => {
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
const createMortgageContract = async (teacherId, propertyId, mortgageDetails) => {
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
    const mortgageId = db.ref('mortgages').push().key;
    const startDate = Date.now();
    const endDate = startDate + loanTerm * 365.25 * 24 * 60 * 60 * 1000;

    const mortgage = {
      id: mortgageId,
      teacherId,
      propertyId,
      propertyPrice,
      downPayment,
      principal,
      loanTerm: loanTerm,
      interestRate,
      monthlyPayment,
      monthlyIncome,
      debtToIncomeRatio: debtToIncomeRatio.toFixed(2),
      status: 'active',
      totalPaid: 0,
      paymentsCompleted: 0,
      paymentsMissed: 0,
      remainingBalance: principal,
      startDate,
      endDate,
      createdAt: admin.database.ServerValue.TIMESTAMP,
      nextPaymentDue: new Date(startDate).toISOString(),
    };

    await db.ref(`mortgages/${mortgageId}`).set(mortgage);

    // Update teacher record
    await db.ref(`users/${teacherId}`).update({
      has_active_mortgage: true,
      active_mortgage_id: mortgageId,
      housing_status: 'rent-to-own',
    });

    return {
      success: true,
      mortgage,
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
const processMonthlyMortgage = async (teacherId, mortgageId, earningsForMonth) => {
  try {
    const mortgageSnapshot = await db.ref(`mortgages/${mortgageId}`).once('value');
    const mortgage = mortgageSnapshot.val();

    if (!mortgage) {
      return { success: false, error: 'Mortgage not found' };
    }

    if (mortgage.status !== 'active') {
      return { success: false, error: 'Mortgage is not active' };
    }

    // Check if payment is due
    const today = new Date();
    const nextPaymentDueDate = new Date(mortgage.nextPaymentDue);
    if (today < nextPaymentDueDate) {
      return {
        success: false,
        error: 'Payment not yet due',
        nextPaymentDue: mortgage.nextPaymentDue,
      };
    }

    // Check if earnings are sufficient
    if (earningsForMonth < mortgage.monthlyPayment) {
      // Record missed payment
      const missedPaymentId = db.ref('missed_payments').push().key;
      await db.ref(`missed_payments/${missedPaymentId}`).set({
        id: missedPaymentId,
        teacherId,
        mortgageId,
        dueAmount: mortgage.monthlyPayment,
        availableAmount: earningsForMonth,
        dueDate: admin.database.ServerValue.TIMESTAMP,
        status: 'missed',
      });

      // Update mortgage with missed payment
      await db.ref(`mortgages/${mortgageId}`).update({
        paymentsMissed: (mortgage.paymentsMissed || 0) + 1,
      });

      return {
        success: false,
        error: 'Insufficient earnings to cover mortgage payment',
        details: {
          dueAmount: mortgage.monthlyPayment,
          availableAmount: earningsForMonth,
          shortfall: mortgage.monthlyPayment - earningsForMonth,
        },
      };
    }

    // Process payment
    const paymentId = db.ref('mortgage_payments').push().key;
    const newRemainingBalance = Math.max(0, mortgage.remainingBalance - mortgage.monthlyPayment);
    const nextPaymentDue = new Date();
    nextPaymentDue.setMonth(nextPaymentDue.getMonth() + 1);

    // Record payment
    await db.ref(`mortgage_payments/${paymentId}`).set({
      id: paymentId,
      teacherId,
      mortgageId,
      amount: mortgage.monthlyPayment,
      principalPaydown: mortgage.monthlyPayment - (mortgage.remainingBalance > 0 ? (mortgage.monthlyPayment * mortgage.interestRate) / 100 / 12 : 0),
      interestPaid: mortgage.monthlyPayment - (mortgage.remainingBalance > 0 ? (mortgage.monthlyPayment * mortgage.interestRate) / 100 / 12 : 0),
      paymentDate: admin.database.ServerValue.TIMESTAMP,
      status: 'completed',
    });

    // Update mortgage
    const updateData = {
      totalPaid: (mortgage.totalPaid || 0) + mortgage.monthlyPayment,
      paymentsCompleted: (mortgage.paymentsCompleted || 0) + 1,
      remainingBalance: newRemainingBalance,
      nextPaymentDue: nextPaymentDue.toISOString(),
      lastPaymentDate: admin.database.ServerValue.TIMESTAMP,
    };

    // If mortgage is fully paid, mark as complete
    if (newRemainingBalance <= 0) {
      updateData.status = 'completed';
      updateData.completedAt = admin.database.ServerValue.TIMESTAMP;

      // Update teacher status
      await db.ref(`users/${teacherId}`).update({
        has_active_mortgage: false,
        housing_status: 'homeowner',
        property_owned: true,
      });
    }

    await db.ref(`mortgages/${mortgageId}`).update(updateData);

    return {
      success: true,
      payment: {
        paymentId,
        amount: mortgage.monthlyPayment,
        remaining: newRemainingBalance,
        paymentsCompleted: (mortgage.paymentsCompleted || 0) + 1,
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
const generateAmortizationSchedule = async (mortgageId) => {
  try {
    const mortgageSnapshot = await db.ref(`mortgages/${mortgageId}`).once('value');
    const mortgage = mortgageSnapshot.val();

    if (!mortgage) {
      return null;
    }

    const schedule = [];
    let remainingBalance = mortgage.principal;
    const monthlyRate = mortgage.interestRate / 100 / 12;
    const paymentDate = new Date(mortgage.startDate);

    for (let i = 1; i <= mortgage.loanTerm * 12; i++) {
      const interestPayment = remainingBalance * monthlyRate;
      const principalPayment = mortgage.monthlyPayment - interestPayment;
      remainingBalance = Math.max(0, remainingBalance - principalPayment);

      schedule.push({
        paymentNumber: i,
        paymentDate: new Date(paymentDate).toISOString(),
        payment: Math.round(mortgage.monthlyPayment * 100) / 100,
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
const getMortgageStatus = async (teacherId) => {
  try {
    // Get active mortgage for teacher
    const teacherSnapshot = await db.ref(`users/${teacherId}`).once('value');
    const teacher = teacherSnapshot.val();

    if (!teacher.active_mortgage_id) {
      return null;
    }

    const mortgageSnapshot = await db.ref(
      `mortgages/${teacher.active_mortgage_id}`
    ).once('value');
    const mortgage = mortgageSnapshot.val();

    // Get payment history
    const paymentsSnapshot = await db.ref('mortgage_payments')
      .orderByChild('mortgageId')
      .equalTo(mortgage.id)
      .once('value');
    const payments = paymentsSnapshot.val() || {};

    // Calculate equity
    const equity = mortgage.downPayment + (mortgage.totalPaid || 0);
    const equityPercentage = (equity / mortgage.propertyPrice) * 100;

    return {
      mortgage: {
        id: mortgage.id,
        status: mortgage.status,
        propertyPrice: mortgage.propertyPrice,
        downPayment: mortgage.downPayment,
        loanAmount: mortgage.principal,
        monthlyPayment: mortgage.monthlyPayment,
      },
      progress: {
        paymentsCompleted: mortgage.paymentsCompleted,
        totalPayments: mortgage.loanTerm * 12,
        progressPercentage: (mortgage.paymentsCompleted / (mortgage.loanTerm * 12)) * 100,
        remainingBalance: mortgage.remainingBalance,
        totalPaid: mortgage.totalPaid,
        paymentsMissed: mortgage.paymentsMissed || 0,
      },
      equity: {
        totalEquity: equity,
        equityPercentage: Math.round(equityPercentage * 100) / 100,
      },
      timeline: {
        startDate: new Date(mortgage.startDate).toISOString(),
        endDate: new Date(mortgage.endDate).toISOString(),
        nextPaymentDue: mortgage.nextPaymentDue,
        lastPaymentDate: mortgage.lastPaymentDate
          ? new Date(mortgage.lastPaymentDate).toISOString()
          : null,
      },
    };
  } catch (err) {
    console.error('Error getting mortgage status:', err);
    throw err;
  }
};

module.exports = {
  calculateMonthlyPayment,
  createMortgageContract,
  processMonthlyMortgage,
  generateAmortizationSchedule,
  getMortgageStatus,
};
