import { Request, Response } from 'express';
import { ensurePlatformWallet, ensureUserWallets, getUserWallets, getWalletTransactions } from '../services/walletService';
import logger from '../utils/logger';

type AuthenticatedRequest = Request & { user: { id: string; role: string } };

export const getMyWallets = async (req: AuthenticatedRequest, res: Response) => {
  try {
    await ensureUserWallets(req.user.id, req.user.role);
    await ensurePlatformWallet();

    const data = await getUserWallets(req.user.id);
    res.json({ wallets: data });
  } catch (err: any) {
    logger.error({ err }, 'Failed to fetch wallets');
    res.status(500).json({ error: 'Unable to fetch wallets' });
  }
};

export const getMyWalletTransactions = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await getWalletTransactions(req.params.walletId, req.user.id);
    if (!result) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    res.json(result);
  } catch (err: any) {
    logger.error({ err }, 'Failed to fetch wallet transactions');
    res.status(500).json({ error: 'Unable to fetch wallet transactions' });
  }
};
