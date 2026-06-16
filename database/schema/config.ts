import { pgEnum, pgTable, varchar, decimal, boolean, timestamp, text } from 'drizzle-orm/pg-core';

export const configSplitTargetEnum = pgEnum('config_split_target', [
  'tutor',
  'welfare',
  'platform_fee',
]);

export const configValueTypeEnum = pgEnum('config_value_type', [
  'flat_fee',
  'percentage',
]);

export const platformConfigs = pgTable('platform_configs', {
  id: varchar('id', { length: 255 }).primaryKey(),
  key: varchar('key', { length: 100 }).notNull().unique(),
  label: varchar('label', { length: 255 }).notNull(),
  target: configSplitTargetEnum('target').notNull(),
  valueType: configValueTypeEnum('value_type').notNull(),
  value: decimal('value', { precision: 20, scale: 4 }).notNull(),
  description: text('description'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type PlatformConfig = typeof platformConfigs.$inferSelect;
export type NewPlatformConfig = typeof platformConfigs.$inferInsert;
