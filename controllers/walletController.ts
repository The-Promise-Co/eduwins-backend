import { Request, Response } from 'express';
import { ensurePlatformWallet, ensureUserWallets, getUserWallets, getWalletTransactions } from '../services/walletService';
import logger from '../utils/logger';

type AuthenticatedRequest = Request & { user: { id: string; role: string } };

export const getMyWallets = async (req: AuthenticatedRequest, res: Response) => {
  const log = req.log || logger;

  try {
    await ensureUserWallets(req.user.id, req.user.role);
    await ensurePlatformWallet();

    const data = await getUserWallets(req.user.id);
    log.info({
      userId: req.user.id,
      role: req.user.role,
      walletCount: data.length,
    }, 'wallet.list_succeeded');
    res.json({ wallets: data });
  } catch (err: any) {
    log.error({ err, userId: req.user.id, role: req.user.role }, 'wallet.list_failed');
    res.status(500).json({ error: 'Unable to fetch wallets' });
  }
};

export const getMyWalletTransactions = async (req: AuthenticatedRequest, res: Response) => {
  const log = req.log || logger;

  try {
    const result = await getWalletTransactions(req.params.walletId, req.user.id);
    if (!result) {
      log.warn({
        userId: req.user.id,
        walletId: req.params.walletId,
      }, 'wallet.transactions_not_found');
      return res.status(404).json({ error: 'Wallet not found' });
    }

    log.info({
      userId: req.user.id,
      walletId: req.params.walletId,
      transactionCount: result.transactions.length,
    }, 'wallet.transactions_list_succeeded');
    res.json(result);
  } catch (err: any) {
    log.error({ err, userId: req.user.id, walletId: req.params.walletId }, 'wallet.transactions_list_failed');
    res.status(500).json({ error: 'Unable to fetch wallet transactions' });
  }
};
