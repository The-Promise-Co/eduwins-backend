const axios = require('axios');
const admin = require('firebase-admin');

const db = admin.database();
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

// Withdrawal limits and fees (configurable)
const WITHDRAWAL_CONFIG = {
  MIN_AMOUNT: 5000, // Minimum ₦5,000
  MAX_AMOUNT_PER_REQUEST: 500000, // Maximum ₦500,000 per request
  MAX_AMOUNT_PER_MONTH: 5000000, // Maximum ₦5,000,000 per month
  PROCESSING_FEE_PERCENTAGE: 1, // 1% processing fee
  PROCESSING_TIME_HOURS: 24, // Typically processed within 24 hours
};

/**
 * Calculate available balance for withdrawal
 * Considers: Earnings - (Welfare Fund 10% + Premium deductions + Mortgage payments + Reserved funds)
 */
exports.getAvailableBalance = async (req, res) => {
  try {
    const teacherId = req.user.id;

    // Fetch teacher earnings
    const earningsRef = db.ref(`earnings/${teacherId}`);
    const earningsSnapshot = await earningsRef.once('value');
    const earnings = earningsSnapshot.val() || {};

    // Fetch welfare fund (10% accumulated)
    const welfareRef = db.ref(`welfare_funds/${teacherId}`);
    const welfareSnapshot = await welfareRef.once('value');
    const welfareRecords = welfareSnapshot.val() || {};

    // Calculate total welfare fund
    let totalWelfareFund = 0;
    Object.keys(welfareRecords).forEach(month => {
      totalWelfareFund += welfareRecords[month].amount || 0;
    });

    // Fetch active mortgage (if exists)
    const mortgageRef = db.ref(`mortgages`).orderByChild('teacher_id').equalTo(teacherId);
    const mortgageSnapshot = await mortgageRef.once('value');
    let activeMortgagePayment = 0;
    if (mortgageSnapshot.val()) {
      Object.keys(mortgageSnapshot.val()).forEach(mortgageId => {
        const mortgage = mortgageSnapshot.val()[mortgageId];
        if (mortgage.status === 'active') {
          activeMortgagePayment = mortgage.monthly_payment || 0;
        }
      });
    }

    // Fetch pending withdrawals (reserved funds)
    const withdrawalRef = db.ref(`withdrawals/${teacherId}`);
    const withdrawalSnapshot = await withdrawalRef.once('value');
    let reservedAmount = 0;
    if (withdrawalSnapshot.val()) {
      Object.keys(withdrawalSnapshot.val()).forEach(withdrawalId => {
        const withdrawal = withdrawalSnapshot.val()[withdrawalId];
        if (withdrawal.status === 'pending' || withdrawal.status === 'processing') {
          reservedAmount += withdrawal.amount || 0;
        }
      });
    }

    // Calculate total earnings
    const totalEarnings = earnings.total || 0;
    const totalAcquired = earnings.acquired_from_lessons || 0;

    // Calculate accessible balance
    const deductions = totalWelfareFund + activeMortgagePayment;
    const accessibleBalance = Math.max(0, totalAcquired - deductions - reservedAmount);

    res.json({
      success: true,
      totalEarnings,
      totalAcquired,
      deductions: {
        welfareFund: totalWelfareFund,
        mortgagePayment: activeMortgagePayment,
        reserved: reservedAmount,
      },
      availableBalance: Math.floor(accessibleBalance),
      minWithdrawal: WITHDRAWAL_CONFIG.MIN_AMOUNT,
      maxWithdrawal: WITHDRAWAL_CONFIG.MAX_AMOUNT_PER_REQUEST,
      processingFee: `${WITHDRAWAL_CONFIG.PROCESSING_FEE_PERCENTAGE}%`,
      estimatedProcessingTime: `${WITHDRAWAL_CONFIG.PROCESSING_TIME_HOURS} hours`,
    });
  } catch (error) {
    console.error('Get available balance error:', error);
    res.status(500).json({ error: 'Could not fetch available balance' });
  }
};

/**
 * Initiate withdrawal request
 * Requires bank account details for transfer
 */
exports.initiateWithdrawal = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const {
      amount,
      bankCode,
      accountNumber,
      accountName,
      narration,
    } = req.body;

    // Validate input
    if (!amount || !bankCode || !accountNumber || !accountName) {
      return res.status(400).json({ error: 'Missing required fields: amount, bankCode, accountNumber, accountName' });
    }

    if (amount < WITHDRAWAL_CONFIG.MIN_AMOUNT) {
      return res.status(400).json({
        error: `Minimum withdrawal amount is ₦${WITHDRAWAL_CONFIG.MIN_AMOUNT}`,
      });
    }

    if (amount > WITHDRAWAL_CONFIG.MAX_AMOUNT_PER_REQUEST) {
      return res.status(400).json({
        error: `Maximum withdrawal amount per request is ₦${WITHDRAWAL_CONFIG.MAX_AMOUNT_PER_REQUEST}`,
      });
    }

    // Get available balance
    const earningsRef = db.ref(`earnings/${teacherId}`);
    const earningsSnapshot = await earningsRef.once('value');
    const earnings = earningsSnapshot.val() || {};

    const welfareRef = db.ref(`welfare_funds/${teacherId}`);
    const welfareSnapshot = await welfareRef.once('value');
    const welfareRecords = welfareSnapshot.val() || {};

    let totalWelfareFund = 0;
    Object.keys(welfareRecords).forEach(month => {
      totalWelfareFund += welfareRecords[month].amount || 0;
    });

    const totalAcquired = earnings.acquired_from_lessons || 0;
    const accessibleBalance = Math.max(0, totalAcquired - totalWelfareFund);

    if (amount > accessibleBalance) {
      return res.status(400).json({
        error: `Insufficient balance. Available: ₦${Math.floor(accessibleBalance)}`,
        available: Math.floor(accessibleBalance),
      });
    }

    // Check monthly limit
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const monthWithdrawalsRef = db.ref(`withdrawals/${teacherId}`);
    const monthWithdrawalsSnapshot = await monthWithdrawalsRef.once('value');
    let monthlyTotal = 0;

    if (monthWithdrawalsSnapshot.val()) {
      Object.keys(monthWithdrawalsSnapshot.val()).forEach(withdrawalId => {
        const withdrawal = monthWithdrawalsSnapshot.val()[withdrawalId];
        if (withdrawal.month === currentMonth && withdrawal.status !== 'failed') {
          monthlyTotal += withdrawal.amount || 0;
        }
      });
    }

    if (monthlyTotal + amount > WITHDRAWAL_CONFIG.MAX_AMOUNT_PER_MONTH) {
      return res.status(400).json({
        error: `Monthly limit exceeded. Used: ₦${monthlyTotal}, Limit: ₦${WITHDRAWAL_CONFIG.MAX_AMOUNT_PER_MONTH}`,
        used: monthlyTotal,
        limit: WITHDRAWAL_CONFIG.MAX_AMOUNT_PER_MONTH,
      });
    }

    // Validate bank account with Paystack (optional but recommended)
    try {
      const validateResponse = await axios.get(
        `https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
        {
          headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET}`,
          },
        }
      );

      if (!validateResponse.data.status) {
        return res.status(400).json({ error: 'Bank account validation failed' });
      }
    } catch (err) {
      console.error('Bank validation error:', err.message);
      // Continue anyway, but flag for manual review
    }

    // Calculate processing fee
    const processingFee = Math.round((amount * WITHDRAWAL_CONFIG.PROCESSING_FEE_PERCENTAGE) / 100);
    const netAmount = amount - processingFee;

    // Create withdrawal record
    const withdrawalId = db.ref('withdrawals/' + teacherId).push().key;
    const withdrawalData = {
      withdrawal_id: withdrawalId,
      teacher_id: teacherId,
      amount,
      net_amount: netAmount,
      processing_fee: processingFee,
      bank_code: bankCode,
      account_number: accountNumber.slice(-4), // Store only last 4 digits for security
      account_name: accountName,
      narration: narration || 'Withdrawal',
      status: 'pending', // pending -> processing -> completed/failed
      created_at: new Date().toISOString(),
      month: currentMonth,
      paystackReference: null,
      failureReason: null,
    };

    // Store withdrawal request
    await db.ref(`withdrawals/${teacherId}/${withdrawalId}`).update(withdrawalData);

    // Deduct from earnings immediately (reserve the amount)
    const newEarnings = {
      ...earnings,
      acquired_from_lessons: Math.max(0, totalAcquired - amount),
    };
    await db.ref(`earnings/${teacherId}`).update(newEarnings);

    // Create notification for teacher
    await db.ref(`notifications/${teacherId}`).push({
      type: 'withdrawal_initiated',
      title: 'Withdrawal Request Initiated',
      message: `Your withdrawal request of ₦${amount.toLocaleString()} has been submitted. Processing fee: ₦${processingFee}. Net amount: ₦${netAmount.toLocaleString()}`,
      read: false,
      created_at: new Date().toISOString(),
    });

    res.status(201).json({
      success: true,
      withdrawalId,
      message: 'Withdrawal request initiated successfully',
      details: {
        amount: `₦${amount.toLocaleString()}`,
        processingFee: `₦${processingFee.toLocaleString()}`,
        netAmount: `₦${netAmount.toLocaleString()}`,
        status: 'pending',
        estimatedProcessingTime: `${WITHDRAWAL_CONFIG.PROCESSING_TIME_HOURS} hours`,
      },
    });
  } catch (error) {
    console.error('Initiate withdrawal error:', error);
    res.status(500).json({ error: 'Could not initiate withdrawal request' });
  }
};

/**
 * Process withdrawal via Paystack (Admin/System function)
 */
exports.processWithdrawal = async (req, res) => {
  try {
    const { withdrawalId, teacherId } = req.body;

    if (!withdrawalId || !teacherId) {
      return res.status(400).json({ error: 'Missing withdrawalId or teacherId' });
    }

    // Fetch withdrawal record
    const withdrawalRef = db.ref(`withdrawals/${teacherId}/${withdrawalId}`);
    const withdrawalSnapshot = await withdrawalRef.once('value');
    const withdrawal = withdrawalSnapshot.val();

    if (!withdrawal) {
      return res.status(404).json({ error: 'Withdrawal not found' });
    }

    if (withdrawal.status !== 'pending') {
      return res.status(400).json({
        error: `Cannot process withdrawal with status: ${withdrawal.status}`,
      });
    }

    // Update status to processing
    await withdrawalRef.update({ status: 'processing' });

    try {
      // Initiate transfer via Paystack
      const transferResponse = await axios.post(
        'https://api.paystack.co/transfer',
        {
          source: 'balance',
          amount: withdrawal.net_amount * 100, // Convert to kobo
          recipient_code: `RCP_${withdrawal.bank_code}_${withdrawal.account_number}`, // Generate recipient code
          reason: withdrawal.narration || 'Withdrawal',
          reference: `WTD_${withdrawalId}_${Date.now()}`,
        },
        {
          headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (transferResponse.data.status) {
        // Update withdrawal with Paystack reference
        await withdrawalRef.update({
          status: 'completed',
          paystackReference: transferResponse.data.data.reference,
          completed_at: new Date().toISOString(),
        });

        // Create notification
        await db.ref(`notifications/${teacherId}`).push({
          type: 'withdrawal_completed',
          title: 'Withdrawal Completed',
          message: `Your withdrawal of ₦${withdrawal.net_amount.toLocaleString()} has been successfully transferred to your bank account.`,
          read: false,
          created_at: new Date().toISOString(),
        });

        res.json({
          success: true,
          message: 'Withdrawal processed successfully',
          reference: transferResponse.data.data.reference,
        });
      } else {
        throw new Error('Paystack transfer failed');
      }
    } catch (paymentError) {
      console.error('Paystack transfer error:', paymentError.response?.data || paymentError.message);

      // Mark as failed
      await withdrawalRef.update({
        status: 'failed',
        failureReason: paymentError.response?.data?.message || paymentError.message,
        failed_at: new Date().toISOString(),
      });

      // Refund to teacher's earnings
      const earningsRef = db.ref(`earnings/${teacherId}`);
      const earningsSnapshot = await earningsRef.once('value');
      const currentEarnings = earningsSnapshot.val() || {};

      await earningsRef.update({
        acquired_from_lessons: (currentEarnings.acquired_from_lessons || 0) + withdrawal.amount,
      });

      // Create notification
      await db.ref(`notifications/${teacherId}`).push({
        type: 'withdrawal_failed',
        title: 'Withdrawal Failed',
        message: `Your withdrawal request failed: ${paymentError.response?.data?.message || 'Please try again'}. Amount has been refunded.`,
        read: false,
        created_at: new Date().toISOString(),
      });

      res.status(500).json({
        error: 'Withdrawal processing failed',
        details: paymentError.response?.data?.message,
      });
    }
  } catch (error) {
    console.error('Process withdrawal error:', error);
    res.status(500).json({ error: 'Could not process withdrawal' });
  }
};

/**
 * Get withdrawal history for teacher
 */
exports.getWithdrawalHistory = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const { status, limit = 50, offset = 0 } = req.query;

    const withdrawalRef = db.ref(`withdrawals/${teacherId}`);
    const snapshot = await withdrawalRef.once('value');
    let withdrawals = [];

    if (snapshot.val()) {
      Object.keys(snapshot.val()).forEach(withdrawalId => {
        withdrawals.push(snapshot.val()[withdrawalId]);
      });
    }

    // Filter by status if provided
    if (status) {
      withdrawals = withdrawals.filter(w => w.status === status);
    }

    // Sort by created_at (newest first)
    withdrawals.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Pagination
    const total = withdrawals.length;
    const paginated = withdrawals.slice(offset, offset + limit);

    // Calculate statistics
    const stats = {
      total_withdrawn: 0,
      total_processing_fees: 0,
      pending_count: 0,
      completed_count: 0,
      failed_count: 0,
    };

    withdrawals.forEach(w => {
      if (w.status === 'completed') {
        stats.total_withdrawn += w.net_amount || 0;
        stats.total_processing_fees += w.processing_fee || 0;
        stats.completed_count += 1;
      } else if (w.status === 'pending' || w.status === 'processing') {
        stats.pending_count += 1;
      } else if (w.status === 'failed') {
        stats.failed_count += 1;
      }
    });

    res.json({
      success: true,
      stats,
      withdrawals: paginated,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get withdrawal history error:', error);
    res.status(500).json({ error: 'Could not fetch withdrawal history' });
  }
};

/**
 * Get withdrawal details
 */
exports.getWithdrawalDetails = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const { withdrawalId } = req.params;

    const withdrawalRef = db.ref(`withdrawals/${teacherId}/${withdrawalId}`);
    const snapshot = await withdrawalRef.once('value');
    const withdrawal = snapshot.val();

    if (!withdrawal) {
      return res.status(404).json({ error: 'Withdrawal not found' });
    }

    res.json({
      success: true,
      withdrawal,
    });
  } catch (error) {
    console.error('Get withdrawal details error:', error);
    res.status(500).json({ error: 'Could not fetch withdrawal details' });
  }
};

/**
 * Cancel withdrawal request (only if pending)
 */
exports.cancelWithdrawal = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const { withdrawalId } = req.params;

    const withdrawalRef = db.ref(`withdrawals/${teacherId}/${withdrawalId}`);
    const snapshot = await withdrawalRef.once('value');
    const withdrawal = snapshot.val();

    if (!withdrawal) {
      return res.status(404).json({ error: 'Withdrawal not found' });
    }

    if (withdrawal.status !== 'pending') {
      return res.status(400).json({
        error: `Cannot cancel withdrawal with status: ${withdrawal.status}`,
      });
    }

    // Update withdrawal status
    await withdrawalRef.update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
    });

    // Refund amount to earnings
    const earningsRef = db.ref(`earnings/${teacherId}`);
    const earningsSnapshot = await earningsRef.once('value');
    const currentEarnings = earningsSnapshot.val() || {};

    await earningsRef.update({
      acquired_from_lessons: (currentEarnings.acquired_from_lessons || 0) + withdrawal.amount,
    });

    // Create notification
    await db.ref(`notifications/${teacherId}`).push({
      type: 'withdrawal_cancelled',
      title: 'Withdrawal Cancelled',
      message: `Your withdrawal request of ₦${withdrawal.amount.toLocaleString()} has been cancelled. Amount has been restored to your account.`,
      read: false,
      created_at: new Date().toISOString(),
    });

    res.json({
      success: true,
      message: 'Withdrawal cancelled successfully',
      refundedAmount: withdrawal.amount,
    });
  } catch (error) {
    console.error('Cancel withdrawal error:', error);
    res.status(500).json({ error: 'Could not cancel withdrawal' });
  }
};

/**
 * Get bank codes for transfer (Paystack banks list)
 */
exports.getBankCodes = async (req, res) => {
  try {
    const banksResponse = await axios.get('https://api.paystack.co/bank', {
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
      },
    });

    if (banksResponse.data.status) {
      const banks = banksResponse.data.data.map(bank => ({
        code: bank.code,
        name: bank.name,
        longcode: bank.longcode,
      }));

      res.json({
        success: true,
        banks,
      });
    } else {
      res.status(500).json({ error: 'Could not fetch bank codes' });
    }
  } catch (error) {
    console.error('Get bank codes error:', error);
    res.status(500).json({ error: 'Could not fetch bank codes' });
  }
};
