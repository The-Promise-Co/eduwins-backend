import express from 'express';
import authenticateToken from '../middleware/auth';
import * as withdrawalController from '../controllers/withdrawalController';

const router = express.Router();

/**
 * Teacher Withdrawal Routes
 */

/**
 * GET /api/withdrawals/available-balance
 * Get teacher's available balance for withdrawal
 */
router.get('/available-balance', authenticateToken, withdrawalController.getAvailableBalance as any);

/**
 * POST /api/withdrawals/initiate
 * Initiate a withdrawal request
 */
router.post('/initiate', authenticateToken, withdrawalController.initiateWithdrawal as any);

/**
 * GET /api/withdrawals/history
 * Get teacher's withdrawal history
 */
router.get('/history', authenticateToken, withdrawalController.getWithdrawalHistory as any);

/**
 * GET /api/withdrawals/banks/list
 * Get list of available banks for transfer
 */
router.get('/banks/list', withdrawalController.getBankCodes as any);

/**
 * GET /api/withdrawals/:withdrawalId
 * Get withdrawal details
 */
router.get('/:withdrawalId', authenticateToken, withdrawalController.getWithdrawalDetails as any);


/**
 * DELETE /api/withdrawals/:withdrawalId/cancel
 * Cancel a pending withdrawal request
 */
router.delete('/:withdrawalId/cancel', authenticateToken, withdrawalController.cancelWithdrawal as any);

/**
 * Admin Routes
 */

/**
 * POST /api/admin/withdrawals/process
 * Process a pending withdrawal request
 */
router.post('/admin/process', authenticateToken, withdrawalController.processWithdrawal as any);

export default router;
