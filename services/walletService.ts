import { db } from '../database/db';
import { walletTransactions, wallets } from '../database/schema';
import { and, desc, eq, isNull } from 'drizzle-orm';
import logger from '../utils/logger';

export type WalletType = 'main' | 'referrals' | 'welfare' | 'fees';

type WalletMutationInput = {
  ownerId?: string | null;
  ownerType?: 'user' | 'platform';
  walletType: WalletType;
  amount: number;
  type: string;
  referenceType?: string;
  referenceId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
};

/** Drizzle transaction client (node-postgres). Passed through so multi-leg
 *  writes (e.g. escrow settlement) are atomic. */
export type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type TxInput = {
  tx?: DbTx;
};

const id = (prefix: string) => `${prefix}-${Math.random().toString(36).substring(2, 15)}`;

const walletIdFor = (ownerType: 'user' | 'platform', ownerId: string | null | undefined, walletType: WalletType) => {
  if (ownerType === 'platform') return `wallet-platform-${walletType}`;
  return `wallet-${walletType}-${ownerId}`;
};

export const ensureWallet = async (
  ownerType: 'user' | 'platform',
  ownerId: string | null,
  walletType: WalletType,
  tx?: DbTx,
) => {
  const q = tx || db;
  const where = ownerType === 'platform'
    ? and(eq(wallets.ownerType, 'platform'), isNull(wallets.ownerId), eq(wallets.walletType, walletType))
    : and(eq(wallets.ownerType, 'user'), eq(wallets.ownerId, ownerId || ''), eq(wallets.walletType, walletType));

  const existing = await q.query.wallets.findFirst({ where });
  if (existing) return existing;

  const [created] = await q.insert(wallets).values({
    id: walletIdFor(ownerType, ownerId, walletType),
    ownerType,
    ownerId: ownerType === 'platform' ? null : ownerId,
    walletType,
    balance: '0',
    currency: 'NGN',
    status: 'active',
  }).onConflictDoNothing().returning();

  if (created) {
    logger.info({ ownerType, ownerId, walletType, walletId: created.id }, 'wallet.ensure_created');
    return created;
  }

  return q.query.wallets.findFirst({ where });
};

export const ensureUserWallets = async (userId: string, role: string) => {
  if (role === 'teacher') {
    await ensureWallet('user', userId, 'main');
    await ensureWallet('user', userId, 'referrals');
    await ensureWallet('user', userId, 'welfare');
  } else if (role === 'parent') {
    await ensureWallet('user', userId, 'referrals');
  }
};

export const ensurePlatformWallet = async () => {
  return ensureWallet('platform', null, 'fees');
};

export const getUserWallets = async (userId: string) => {
  return db.select().from(wallets).where(and(eq(wallets.ownerType, 'user'), eq(wallets.ownerId, userId)));
};

/**
 * All legs of one payout group (e.g. the three splits of a booking release),
 * keyed by the shared reference. Doubles as the settlement idempotency guard.
 */
export const getTransactionsByReference = async (
  referenceType: string,
  referenceId: string,
  tx?: DbTx,
) => {
  const q = tx || db;
  return q.select()
    .from(walletTransactions)
    .where(and(
      eq(walletTransactions.referenceType, referenceType),
      eq(walletTransactions.referenceId, referenceId),
    ))
    .orderBy(desc(walletTransactions.createdAt));
};

export const getWalletTransactions = async (walletId: string, userId?: string) => {
  const wallet = await db.query.wallets.findFirst({ where: eq(wallets.id, walletId) });
  if (!wallet || (userId && wallet.ownerId !== userId)) return null;

  const transactions = await db.select()
    .from(walletTransactions)
    .where(eq(walletTransactions.walletId, walletId))
    .orderBy(desc(walletTransactions.createdAt));

  return { wallet, transactions };
};

export const creditWallet = async (input: WalletMutationInput & TxInput) => {
  if (input.amount <= 0) throw new Error('Amount must be greater than 0');

  const q = input.tx || db;
  const ownerType = input.ownerType || 'user';
  const wallet = await ensureWallet(ownerType, input.ownerId || null, input.walletType, input.tx);
  if (!wallet) throw new Error('Wallet not found');

  const balanceBefore = parseFloat(wallet.balance?.toString() || '0');
  const balanceAfter = balanceBefore + input.amount;

  await q.update(wallets)
    .set({ balance: balanceAfter.toString(), updatedAt: new Date() })
    .where(eq(wallets.id, wallet.id));

  const [transaction] = await q.insert(walletTransactions).values({
    id: id('wtx'),
    walletId: wallet.id,
    direction: 'credit',
    amount: input.amount.toString(),
    balanceBefore: balanceBefore.toString(),
    balanceAfter: balanceAfter.toString(),
    type: input.type,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    description: input.description,
    metadata: input.metadata,
  }).returning();

  logger.info({
    walletId: wallet.id,
    ownerId: wallet.ownerId,
    ownerType: wallet.ownerType,
    walletType: wallet.walletType,
    amount: input.amount,
    balanceBefore,
    balanceAfter,
    transactionId: transaction.id,
    transactionType: input.type,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
  }, 'wallet.credit_succeeded');

  return transaction;
};

export const debitWallet = async (input: WalletMutationInput & TxInput) => {
  if (input.amount <= 0) throw new Error('Amount must be greater than 0');

  const q = input.tx || db;
  const ownerType = input.ownerType || 'user';
  const wallet = await ensureWallet(ownerType, input.ownerId || null, input.walletType, input.tx);
  if (!wallet) throw new Error('Wallet not found');

  const balanceBefore = parseFloat(wallet.balance?.toString() || '0');
  if (balanceBefore < input.amount) {
    logger.warn({
      walletId: wallet.id,
      ownerId: wallet.ownerId,
      ownerType: wallet.ownerType,
      walletType: wallet.walletType,
      amount: input.amount,
      balanceBefore,
      transactionType: input.type,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
    }, 'wallet.debit_failed_insufficient_balance');
    throw new Error('Insufficient wallet balance');
  }

  const balanceAfter = balanceBefore - input.amount;

  await q.update(wallets)
    .set({ balance: balanceAfter.toString(), updatedAt: new Date() })
    .where(eq(wallets.id, wallet.id));

  const [transaction] = await q.insert(walletTransactions).values({
    id: id('wtx'),
    walletId: wallet.id,
    direction: 'debit',
    amount: input.amount.toString(),
    balanceBefore: balanceBefore.toString(),
    balanceAfter: balanceAfter.toString(),
    type: input.type,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    description: input.description,
    metadata: input.metadata,
  }).returning();

  logger.info({
    walletId: wallet.id,
    ownerId: wallet.ownerId,
    ownerType: wallet.ownerType,
    walletType: wallet.walletType,
    amount: input.amount,
    balanceBefore,
    balanceAfter,
    transactionId: transaction.id,
    transactionType: input.type,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
  }, 'wallet.debit_succeeded');

  return transaction;
};
