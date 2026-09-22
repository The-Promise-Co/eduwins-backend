import { ensureWallet } from '../services/walletService';
import logger from './logger';

/**
 * Teacher welfare balance — read from the welfare WALLET, the single source
 * of truth. (The legacy welfare_funds ledger is no longer consulted.)
 */
export const calculateTotalWelfareFund = async (teacherId: string): Promise<number> => {
  try {
    const wallet = await ensureWallet('user', teacherId, 'welfare');
    return parseFloat(wallet?.balance?.toString() || '0');
  } catch (err) {
    logger.error({ err, teacherId }, 'welfare.calculate_total_failed');
    return 0;
  }
};
