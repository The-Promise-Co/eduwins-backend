const express = require('express');
const router = express.Router();
const withdrawalController = require('../controllers/withdrawalController');
const auth = require('../middleware/auth');

/**
 * Teacher Withdrawal Routes
 */

/**
 * GET /api/withdrawals/available-balance
 * Get teacher's available balance for withdrawal
 * No parameters required
 * Returns: available balance, deductions breakdown, limits
 */
router.get('/available-balance', auth, withdrawalController.getAvailableBalance);

/**
 * POST /api/withdrawals/initiate
 * Initiate a withdrawal request
 * Body: {
 *   amount: number (₦5,000 - ₦500,000),
 *   bankCode: string,
 *   accountNumber: string,
 *   accountName: string,
 *   narration: string (optional)
 * }
 * Returns: withdrawal ID, status, and details
 */
router.post('/initiate', auth, withdrawalController.initiateWithdrawal);

/**
 * GET /api/withdrawals/history
 * Get teacher's withdrawal history
 * Query params: status (pending/completed/failed), limit, offset
 * Returns: list of withdrawals with pagination and stats
 */
router.get('/history', auth, withdrawalController.getWithdrawalHistory);

/**
 * GET /api/withdrawals/:withdrawalId
 * Get withdrawal details
 * Returns: detailed withdrawal information
 */
router.get('/:withdrawalId', auth, withdrawalController.getWithdrawalDetails);

/**
 * DELETE /api/withdrawals/:withdrawalId/cancel
 * Cancel a pending withdrawal request
 * Only works if status is 'pending'
 * Returns: success message and refunded amount
 */
router.delete('/:withdrawalId/cancel', auth, withdrawalController.cancelWithdrawal);

/**
 * GET /api/withdrawals/banks/list
 * Get list of available banks for transfer
 * Returns: array of banks with codes
 */
router.get('/banks/list', withdrawalController.getBankCodes);

/**
 * Admin Routes (protected by auth, additional admin middleware should be added)
 */

/**
 * POST /api/admin/withdrawals/process
 * Process a pending withdrawal request
 * Body: { withdrawalId: string, teacherId: string }
 * Initiates Paystack transfer
 */
router.post('/admin/process', auth, withdrawalController.processWithdrawal);

module.exports = router;
