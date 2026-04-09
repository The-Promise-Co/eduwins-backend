const { db, admin } = require('../config/firebase');

/**
 * Payment Split System:
 * - Teacher: 75%
 * - Platform (EduWins): 15%
 * - Welfare Fund: 10%
 * 
 * All splits happen automatically when parent confirms service (escrow system)
 */

exports.processPaymentWithWelfareFund = async (req, res) => {
  const { lessonId, teacherId, parentId, amount, status } = req.body;

  try {
    if (!lessonId || !teacherId || !parentId || !amount || !status) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (amount <= 0) {
      return res.status(400).json({ error: 'Amount must be greater than 0' });
    }

    // Calculate splits
    const teacherEarnings = amount * 0.75; // 75% to teacher
    const platformFee = amount * 0.15;     // 15% to platform
    const welfareFund = amount * 0.10;     // 10% to welfare fund

    // Create transaction record
    const transactionId = db.ref('transactions').push().key;
    const timestamp = admin.database.ServerValue.TIMESTAMP;

    const transaction = {
      id: transactionId,
      lessonId,
      teacherId,
      parentId,
      totalAmount: amount,
      teacherEarnings,
      platformFee,
      welfareFund,
      status, // 'pending', 'completed', 'disputed', 'refunded'
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    // Store transaction
    await db.ref(`transactions/${transactionId}`).set(transaction);

    // Only disburse funds if status is 'completed'
    if (status === 'completed') {
      // Update teacher wallet
      const teacherRef = db.ref(`users/${teacherId}`);
      const teacherSnapshot = await teacherRef.once('value');
      const teacher = teacherSnapshot.val();

      const newTeacherBalance = (teacher.wallet_balance || 0) + teacherEarnings;
      await teacherRef.update({ wallet_balance: newTeacherBalance });

      // Add to teacher's welfare fund
      const welfareFundRef = db.ref(`welfare_funds/${teacherId}`);
      const welfareFundSnapshot = await welfareFundRef.once('value');
      let welfareFundData = welfareFundSnapshot.val() || {
        total_accumulated: 0,
        available_balance: 0,
        locked_balance: 0,
        contributions: [],
      };

      welfareFundData.total_accumulated += welfareFund;
      welfareFundData.locked_balance += welfareFund; // Lock current month's contribution
      welfareFundData.contributions = welfareFundData.contributions || [];
      welfareFundData.contributions.push({
        transactionId,
        amount: welfareFund,
        date: timestamp,
        status: 'locked', // Locked until next month 5th
      });

      await welfareFundRef.update(welfareFundData);

      // Add platform fee to platform account
      const platformRef = db.ref('platform_account');
      const platformSnapshot = await platformRef.once('value');
      const platformData = platformSnapshot.val() || { total_fees: 0 };
      platformData.total_fees = (platformData.total_fees || 0) + platformFee;
      platformData.lastUpdate = timestamp;
      await platformRef.update(platformData);

      // Update transaction status
      await db.ref(`transactions/${transactionId}`).update({
        disbursed: true,
        disbursedAt: timestamp,
      });
    }

    return res.status(201).json({
      message: 'Payment processed successfully',
      transaction,
      splits: {
        teacherEarnings,
        platformFee,
        welfareFund,
      },
    });
  } catch (err) {
    console.error('Payment processing error:', err);
    return res.status(500).json({ error: 'Payment processing failed: ' + err.message });
  }
};

/**
 * Get teacher's welfare fund details
 */
exports.getWelfareFund = async (req, res) => {
  const { teacherId } = req.params;

  try {
    const welfareFundSnapshot = await db.ref(`welfare_funds/${teacherId}`).once('value');
    const welfareFundData = welfareFundSnapshot.val();

    if (!welfareFundData) {
      return res.status(404).json({ error: 'Welfare fund not found' });
    }

    res.status(200).json({
      teacherId,
      ...welfareFundData,
    });
  } catch (err) {
    console.error('Error fetching welfare fund:', err);
    res.status(500).json({ error: 'Failed to fetch welfare fund' });
  }
};

/**
 * Unlock welfare funds from previous months (runs monthly on the 5th)
 */
exports.unlockWelfareFunds = async (req, res) => {
  try {
    const welfareFundsRef = db.ref('welfare_funds');
    const snapshot = await welfareFundsRef.once('value');
    const allWelfareFunds = snapshot.val();

    if (!allWelfareFunds) {
      return res.status(200).json({ message: 'No welfare funds to unlock' });
    }

    const updates = {};
    let unlockedCount = 0;

    for (const [teacherId, data] of Object.entries(allWelfareFunds)) {
      if (data.locked_balance > 0) {
        updates[`welfare_funds/${teacherId}/available_balance`] =
          (data.available_balance || 0) + data.locked_balance;
        updates[`welfare_funds/${teacherId}/locked_balance`] = 0;

        // Mark contributions as available
        const contributions = data.contributions || [];
        contributions.forEach((contrib, idx) => {
          if (contrib.status === 'locked') {
            updates[`welfare_funds/${teacherId}/contributions/${idx}/status`] = 'available';
          }
        });

        unlockedCount++;
      }
    }

    if (unlockedCount > 0) {
      await db.ref().update(updates);
    }

    res.status(200).json({
      message: `Unlocked welfare funds for ${unlockedCount} teachers`,
      unlockedCount,
    });
  } catch (err) {
    console.error('Error unlocking welfare funds:', err);
    res.status(500).json({ error: 'Failed to unlock welfare funds' });
  }
};

/**
 * Withdraw from welfare fund
 */
exports.getCentralWelfareAnalytics = async (req, res) => {
  try {
    const welfareFundsRef = db.ref('welfare_funds');
    const snapshot = await welfareFundsRef.once('value');
    const allWelfareFunds = snapshot.val() || {};

    let totalAccumulated = 0;
    let totalAvailable = 0;
    let totalLocked = 0;

    for (const [, data] of Object.entries(allWelfareFunds)) {
      totalAccumulated += Number(data.total_accumulated || 0);
      totalAvailable += Number(data.available_balance || 0);
      totalLocked += Number(data.locked_balance || 0);
    }

    res.json({ totalAccumulated, totalAvailable, totalLocked });
  } catch (err) {
    console.error('Central welfare analytics error:', err);
    res.status(500).json({ error: 'Could not calculate welfare analytics' });
  }
};

exports.withdrawFromWelfareFund = async (req, res) => {
  const { teacherId } = req.params;
  const { amount } = req.body;

  try {
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid withdrawal amount' });
    }

    const welfareFundRef = db.ref(`welfare_funds/${teacherId}`);
    const welfareFundSnapshot = await welfareFundRef.once('value');
    const welfareFundData = welfareFundSnapshot.val();

    if (!welfareFundData) {
      return res.status(404).json({ error: 'Welfare fund not found' });
    }

    if (welfareFundData.available_balance < amount) {
      return res.status(400).json({
        error: 'Insufficient available balance',
        available: welfareFundData.available_balance,
        requested: amount,
      });
    }

    // Process withdrawal
    const newAvailableBalance = welfareFundData.available_balance - amount;

    // Create withdrawal record
    const withdrawalId = db.ref('welfare_withdrawals').push().key;
    const timestamp = admin.database.ServerValue.TIMESTAMP;

    const withdrawal = {
      id: withdrawalId,
      teacherId,
      amount,
      status: 'pending', // pending, processing, completed
      requestedAt: timestamp,
      completedAt: null,
    };

    await db.ref(`welfare_withdrawals/${withdrawalId}`).set(withdrawal);

    // Update available balance
    await welfareFundRef.update({
      available_balance: newAvailableBalance,
    });

    res.status(201).json({
      message: 'Withdrawal request submitted',
      withdrawal,
      newAvailableBalance,
    });
  } catch (err) {
    console.error('Withdrawal error:', err);
    res.status(500).json({ error: 'Withdrawal failed: ' + err.message });
  }
};
