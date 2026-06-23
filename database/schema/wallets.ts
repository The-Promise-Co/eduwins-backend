import {
  pgTable,
  varchar,
  decimal,
  timestamp,
  jsonb,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { users } from './users';

export const wallets = pgTable('wallets', {
  id: varchar('id', { length: 255 }).primaryKey(),
  ownerType: varchar('owner_type', { length: 50 }).notNull(), // 'user' | 'platform'
  ownerId: varchar('owner_id', { length: 255 }).references(() => users.id),
  walletType: varchar('wallet_type', { length: 50 }).notNull(), // 'main' | 'referrals' | 'welfare' | 'fees'
  balance: decimal('balance', { precision: 20, scale: 2 }).default('0').notNull(),
  currency: varchar('currency', { length: 10 }).default('NGN').notNull(),
  status: varchar('status', { length: 50 }).default('active').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  ownerWalletIdx: uniqueIndex('wallets_owner_wallet_unique').on(
    table.ownerType,
    table.ownerId,
    table.walletType,
  ),
}));

export const walletTransactions = pgTable('wallet_transactions', {
  id: varchar('id', { length: 255 }).primaryKey(),
  walletId: varchar('wallet_id', { length: 255 }).notNull().references(() => wallets.id, { onDelete: 'cascade' }),
  direction: varchar('direction', { length: 20 }).notNull(), // 'credit' | 'debit'
  amount: decimal('amount', { precision: 20, scale: 2 }).notNull(),
  balanceBefore: decimal('balance_before', { precision: 20, scale: 2 }).notNull(),
  balanceAfter: decimal('balance_after', { precision: 20, scale: 2 }).notNull(),
  type: varchar('type', { length: 100 }).notNull(),
  referenceType: varchar('reference_type', { length: 100 }),
  referenceId: varchar('reference_id', { length: 255 }),
  description: varchar('description', { length: 500 }),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
});

export type Wallet = InferSelectModel<typeof wallets>;
export type NewWallet = InferInsertModel<typeof wallets>;
export type WalletTransaction = InferSelectModel<typeof walletTransactions>;
export type NewWalletTransaction = InferInsertModel<typeof walletTransactions>;
