import express from 'express';
import authenticateToken from '../middleware/auth';
import {
  getPayoutAccount,
  validateAccount,
  savePayoutAccount,
  getPayoutAccountChanges,
  getAvailableBalance,
  getBanks,
  requestPayout,
  getPayoutHistory,
  cancelPayout,
} from '../controllers/payoutController';

const router = express.Router();

router.get('/account', authenticateToken, getPayoutAccount as any);
router.get('/account/changes', authenticateToken, getPayoutAccountChanges as any);
router.put('/account', authenticateToken, savePayoutAccount as any);
router.post('/validate-account', authenticateToken, validateAccount as any);

router.get('/available-balance', authenticateToken, getAvailableBalance as any);
router.get('/banks', getBanks as any);

router.post('/request', authenticateToken, requestPayout as any);
router.get('/history', authenticateToken, getPayoutHistory as any);
router.post('/:id/cancel', authenticateToken, cancelPayout as any);

export default router;
