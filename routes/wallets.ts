import express from 'express';
import authenticateToken from '../middleware/auth';
import { getMyWalletTransactions, getMyWallets } from '../controllers/walletController';

const router = express.Router();

router.get('/my', authenticateToken, getMyWallets as any);
router.get('/:walletId/transactions', authenticateToken, getMyWalletTransactions as any);

export default router;
