import { Request, Response } from 'express';
import { and, desc, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { db } from '../database/db';
import {
  bookings,
  courseEnrollments,
  courses,
  users,
  teacherProfiles,
  tutorSubscriptions,
  subscriptionPlans,
  transactions,
  vaultPurchases,
  digitalVault,
  walletTransactions,
  wallets,
  payoutRequests,
  platformConfigs,
} from '../database/schema';
import logger from '../utils/logger';

interface AuthenticatedRequest extends Request {
  admin?: { id: string; role: string; permissions: Record<string, any> };
}

/**
 * Admin analytics & reporting.
 *
 * Everything here is read-only aggregation over the existing money tables:
 * `transactions` (money in), `wallet_transactions` (persisted platform-fee
 * ledger), `tutor_subscriptions`, and `vault_purchases`. No new ledgers.
 */

const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Date-only param (YYYY-MM-DD) → inclusive Date, or undefined when absent/invalid. */
const asDate = (value: unknown, endOfDay = false): Date | undefined => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const csvCell = (value: unknown): string => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const sendCsv = (
  res: Response,
  filename: string,
  headers: string[],
  rows: Record<string, unknown>[],
  columnKeys: string[],
) => {
  const lines = [headers.map(csvCell).join(',')];
  for (const row of rows) lines.push(columnKeys.map((key) => csvCell(row[key])).join(','));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(`\uFEFF${lines.join('\r\n')}`);
};

const fullNameSql = (idExpression: string): SQL =>
  sql.raw(`coalesce((SELECT nullif(u.first_name || ' ' || u.last_name, ' ') FROM users u WHERE u.id = ${idExpression}), '—')`);

// ── Dashboard analytics ─────────────────────────────────────────────────────

export const getDashboardAnalytics = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const notDeleted = isNull(users.deletedAt);

    const [
      totalUsersRow,
      roleRows,
      newRoleRows,
      subscribedRow,
      planRows,
      planCatalog,
      subscriptionTotalRow,
      subscriptionRecentRow,
      bookingFeesRow,
      courseFeesRow,
      vaultSalesRow,
      escrowHeldRow,
      bookingStatusRows,
      publishedCoursesRow,
      enrollmentsRow,
      pendingVettingRow,
      pendingEscrowRow,
    ] = await Promise.all([
      db.select({ value: sql<number>`count(*)::int` }).from(users).where(notDeleted),
      db.select({ role: users.role, value: sql<number>`count(*)::int` }).from(users).where(notDeleted).groupBy(users.role),
      db.select({ role: users.role, value: sql<number>`count(*)::int` }).from(users)
        .where(and(notDeleted, sql`${users.createdAt} >= ${since30d}`)).groupBy(users.role),
      db.select({ value: sql<number>`count(distinct ${tutorSubscriptions.tutorId})::int` })
        .from(tutorSubscriptions)
        .innerJoin(users, eq(users.id, tutorSubscriptions.tutorId))
        .where(and(eq(tutorSubscriptions.status, 'active'), eq(users.role, 'teacher'))),
      db.select({ plan: tutorSubscriptions.planSlug, value: sql<number>`count(distinct ${tutorSubscriptions.tutorId})::int` })
        .from(tutorSubscriptions)
        .innerJoin(users, eq(users.id, tutorSubscriptions.tutorId))
        .where(and(eq(tutorSubscriptions.status, 'active'), eq(users.role, 'teacher')))
        .groupBy(tutorSubscriptions.planSlug),
      db.select({ slug: subscriptionPlans.slug, name: subscriptionPlans.name })
        .from(subscriptionPlans).where(eq(subscriptionPlans.isActive, true)),
      db.select({ value: sql<number>`coalesce(sum(${transactions.amount}), 0)::float8` }).from(transactions)
        .where(eq(transactions.type, 'tutor_subscription')),
      db.select({ value: sql<number>`coalesce(sum(${transactions.amount}), 0)::float8` }).from(transactions)
        .where(and(eq(transactions.type, 'tutor_subscription'), sql`${transactions.createdAt} >= ${since30d}`)),
      db.select({ value: sql<number>`coalesce(sum(${walletTransactions.amount}), 0)::float8` })
        .from(walletTransactions)
        .innerJoin(wallets, eq(wallets.id, walletTransactions.walletId))
        .where(and(
          eq(walletTransactions.type, 'booking_platform_fee'),
          eq(wallets.ownerType, 'platform'),
          eq(wallets.walletType, 'fees'),
        )),
      db.select({ value: sql<number>`coalesce(sum(${walletTransactions.amount}), 0)::float8` })
        .from(walletTransactions)
        .innerJoin(wallets, eq(wallets.id, walletTransactions.walletId))
        .where(and(
          eq(walletTransactions.type, 'course_platform_fee'),
          eq(wallets.ownerType, 'platform'),
          eq(wallets.walletType, 'fees'),
        )),
      db.select({ value: sql<number>`coalesce(sum(${vaultPurchases.pricePaid}), 0)::float8` }).from(vaultPurchases),
      // Money currently held in escrow: booking payments whose booking is
      // still awaiting settlement. Shown on the dashboard but excluded from
      // platform revenue until the escrow is released.
      db.select({ value: sql<number>`coalesce(sum(${transactions.amount}), 0)::float8` })
        .from(transactions)
        .innerJoin(bookings, eq(bookings.id, transactions.bookingId))
        .where(and(eq(transactions.type, 'booking_escrow_payment'), eq(bookings.status, 'paid_escrow'))),
      db.select({ status: bookings.status, value: sql<number>`count(*)::int` }).from(bookings).groupBy(bookings.status),
      db.select({ value: sql<number>`count(*)::int` }).from(courses).where(eq(courses.status, 'published')),
      db.select({ value: sql<number>`count(*)::int` }).from(courseEnrollments),
      db.select({ value: sql<number>`count(*)::int` })
        .from(teacherProfiles)
        .innerJoin(users, eq(users.id, teacherProfiles.userId))
        .where(and(eq(teacherProfiles.isAdminApproved, false), notDeleted)),
      db.select({ value: sql<number>`count(*)::int` }).from(bookings).where(eq(bookings.status, 'paid_escrow')),
    ]);

    const roleCount = (role: string) => num(roleRows.find((row) => row.role === role)?.value);
    const newCount = (role: string) => num(newRoleRows.find((row) => row.role === role)?.value);
    const bookingByStatus = (status: string) => num(bookingStatusRows.find((row) => row.status === status)?.value);

    const teachersTotal = roleCount('teacher');
    const subscribedTutors = num(subscribedRow[0]?.value);
    const planNameBySlug = new Map(planCatalog.map((plan) => [plan.slug, plan.name]));
    const planDistribution = planRows
      .map((row) => ({ plan: row.plan, name: planNameBySlug.get(row.plan) || row.plan, count: num(row.value) }))
      .sort((a, b) => b.count - a.count);

    const subscriptionsTotal = num(subscriptionTotalRow[0]?.value);
    const subscriptionsLast30d = num(subscriptionRecentRow[0]?.value);
    const bookingFees = num(bookingFeesRow[0]?.value);
    const courseFees = num(courseFeesRow[0]?.value);
    const vaultSales = num(vaultSalesRow[0]?.value);
    const escrowHeld = num(escrowHeldRow[0]?.value);
    const escrowFeePercent = await bookingPlatformFeePercent();

    res.json({
      users: {
        total: num(totalUsersRow[0]?.value),
        teachers: teachersTotal,
        parents: roleCount('parent'),
        newTeachers30d: newCount('teacher'),
        newParents30d: newCount('parent'),
      },
      subscriptions: {
        subscribedTutors,
        freeTutors: Math.max(0, teachersTotal - subscribedTutors),
        tutorsTotal: teachersTotal,
        planDistribution,
      },
      revenue: {
        subscriptionsTotal,
        subscriptionsLast30d,
        bookingFees,
        courseFees,
        vaultSales,
        platformTotal: subscriptionsTotal + bookingFees + courseFees + vaultSales,
        escrowHeld,
        escrowEstimatedFee: Math.round(escrowHeld * (escrowFeePercent / 100)),
      },
      bookings: {
        pending: bookingByStatus('pending'),
        paidEscrow: bookingByStatus('paid_escrow'),
        completed: bookingByStatus('completed'),
        cancelled: bookingByStatus('cancelled'),
      },
      courses: {
        published: num(publishedCoursesRow[0]?.value),
        enrollments: num(enrollmentsRow[0]?.value),
      },
      pending: {
        vetting: num(pendingVettingRow[0]?.value),
        escrow: num(pendingEscrowRow[0]?.value),
      },
    });
  } catch (err: any) {
    (req.log || logger).error({ err, adminId: req.admin?.id }, 'admin.dashboard_analytics_failed');
    res.status(500).json({ error: 'Could not fetch dashboard analytics' });
  }
};

// ── Payments report (all money in to the platform) ──────────────────────────

const PAYMENT_SOURCES = ['booking', 'course', 'subscription', 'vault', 'payout'] as const;
type PaymentSource = (typeof PAYMENT_SOURCES)[number];

const PAYMENT_REPORT_COLUMNS: ReportColumn[] = [
  { key: 'occurredAt', label: 'Date' },
  { key: 'source', label: 'Source' },
  { key: 'direction', label: 'Direction' },
  { key: 'status', label: 'Status' },
  { key: 'amount', label: 'Amount' },
  { key: 'grossCharged', label: 'Customer charged' },
  { key: 'paystackFee', label: 'Processing fee' },
  { key: 'payer', label: 'Payer / recipient' },
  { key: 'description', label: 'Description' },
  { key: 'reference', label: 'Reference' },
];

const SOURCE_LABELS: Record<PaymentSource, string> = {
  booking: 'Bookings',
  course: 'Courses',
  subscription: 'Subscriptions',
  vault: 'Vault',
  payout: 'Payouts',
};

/**
 * Platform fee % from platform_configs per context, used to estimate the
 * platform's share of money that has not settled yet (calculator fallback 15%).
 */
const contextFeePercent = async (context: 'booking' | 'course'): Promise<number> => {
  const [config] = await db
    .select({ value: platformConfigs.value, valueType: platformConfigs.valueType })
    .from(platformConfigs)
    .where(and(
      eq(platformConfigs.context, context),
      eq(platformConfigs.target, 'platform_fee'),
      eq(platformConfigs.isActive, true),
    ));
  if (config && config.valueType === 'percentage') {
    return Math.min(Math.max(num(config.value), 0), 100);
  }
  return 15;
};

const bookingPlatformFeePercent = () => contextFeePercent('booking');

/**
 * Money movement union across all sources. `amount` is always the PLATFORM's
 * share of the movement: realized platform fee for settled bookings/courses
 * (from the platform fees wallet ledger), estimated fee for bookings still in
 * escrow, full amount for subscriptions/vault (100% platform), payout gross
 * for money out. `escrow_held` carries the held booking amount separately so
 * escrow can be reported without counting it as income. `in_escrow` marks
 * booking payments still held. `gross_charged`/`paystack_fee` come from the
 * payment metadata where available.
 */
const paymentsUnionSql = (bookingPct: number, coursePct: number) => sql`
  SELECT t.created_at AS occurred_at,
         'booking' AS source,
         'in' AS direction,
         (b.status = 'paid_escrow') AS in_escrow,
         b.status AS status,
         coalesce(
           (SELECT sum(f.amount) FROM wallet_transactions f
             WHERE f.type = 'booking_platform_fee' AND f.reference_type = 'booking' AND f.reference_id = t.booking_id),
           CASE WHEN b.status = 'paid_escrow' THEN round(t.amount * ${bookingPct}::numeric / 100.0, 2) ELSE 0 END
         )::float8 AS amount,
         CASE WHEN b.status = 'paid_escrow' THEN t.amount ELSE 0 END::float8 AS escrow_held,
         coalesce((t.metadata->>'chargedAmount')::float8, t.amount::float8) AS gross_charged,
         coalesce((t.metadata->>'paystackFee')::float8, 0) AS paystack_fee,
         ${fullNameSql(`t.metadata->>'parentId'`)} AS payer,
         'Booking · ' || coalesce(left(t.booking_id, 12), '') AS description,
         t.id AS reference_id,
         t.paystack_reference
    FROM transactions t
    LEFT JOIN bookings b ON b.id = t.booking_id
   WHERE t.type = 'booking_escrow_payment'
  UNION ALL
  SELECT t.created_at,
         'course',
         'in',
         false,
         NULL,
         coalesce(
           (SELECT sum(f.amount) FROM wallet_transactions f
             WHERE f.type = 'course_platform_fee' AND f.reference_type = 'course_payment' AND f.reference_id = t.paystack_reference),
           round(t.amount * ${coursePct}::numeric / 100.0, 2)
         )::float8,
         0,
         coalesce((t.metadata->>'chargedAmount')::float8, t.amount::float8),
         coalesce((t.metadata->>'paystackFee')::float8, 0),
         ${fullNameSql(`t.metadata->>'user_id'`)},
         'Course · ' || coalesce(c.title, 'unknown course'),
         t.id,
         t.paystack_reference
    FROM transactions t
    LEFT JOIN courses c ON c.id::text = (t.metadata->>'course_id')
   WHERE t.type = 'course_payment'
  UNION ALL
  SELECT t.created_at,
         'subscription',
         'in',
         false,
         s.status,
         t.amount::float8,
         0,
         coalesce((t.metadata->>'chargedAmount')::float8, t.amount::float8),
         coalesce((t.metadata->>'paystackFee')::float8, 0),
         ${fullNameSql('t.teacher_id')},
         'Subscription · ' || coalesce(t.metadata->>'planSlug', 'plan') || ' · ' || coalesce(t.metadata->>'durationMonths', '') || 'mo',
         t.id,
         t.paystack_reference
    FROM transactions t
    LEFT JOIN tutor_subscriptions s ON s.id = (t.metadata->>'subscriptionId')
   WHERE t.type = 'tutor_subscription'
  UNION ALL
  SELECT v.purchase_date,
         'vault',
         'in',
         false,
         NULL,
         v.price_paid::float8,
         0,
         v.price_paid::float8,
         0,
         ${fullNameSql('v.buyer_id')},
         'Vault · ' || coalesce(dv.title, 'item'),
         v.id,
         NULL
    FROM vault_purchases v
    LEFT JOIN digital_vault dv ON dv.id = v.item_id
  UNION ALL
  SELECT p.created_at,
         'payout',
         'out',
         false,
         p.status,
         p.amount::float8,
         0,
         p.amount::float8,
         coalesce(p.processing_fee, 0)::float8,
         ${fullNameSql('p.teacher_id')},
         'Payout · ' || coalesce(p.bank_name, '') || ' ····' || right(p.account_number, 4),
         p.id,
         p.paystack_reference
    FROM payout_requests p
   WHERE p.status NOT IN ('declined', 'failed')
`;

/** Valid status filter values. `in_escrow` is virtual (derived, not stored). */
const PAYMENT_STATUS_FILTERS = [
  'in_escrow', 'pending', 'paid_escrow', 'completed', 'cancelled',
  'active', 'expired', 'superseded', 'failed', 'processing', 'declined',
] as const;

const toPaymentFilters = (query: Record<string, any>): SQL => {
  const filters: SQL[] = [sql`1 = 1`];
  const from = asDate(query?.from);
  const to = asDate(query?.to, true);
  if (from) filters.push(sql`occurred_at >= ${from.toISOString()}`);
  if (to) filters.push(sql`occurred_at <= ${to.toISOString()}`);

  // Categories: accepts `types` (comma-separated) or legacy single `type`.
  const rawTypes = String(query?.types || query?.type || 'all')
    .split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
  const selectedTypes = rawTypes.filter((value) => (PAYMENT_SOURCES as readonly string[]).includes(value as PaymentSource));
  if (rawTypes[0] !== 'all' && selectedTypes.length > 0) {
    filters.push(sql`source IN (${sql.join(selectedTypes.map((value) => sql`${value}`), sql`, `)})`);
  }

  // Statuses: comma-separated, OR-combined. `in_escrow` matches the derived
  // flag; anything else matches the row status. Rows without a status
  // (courses, vault) only show when no status filter is set.
  const rawStatuses = String(query?.statuses || '')
    .split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
  const escrowOnly = rawStatuses.includes('in_escrow');
  const plainStatuses = rawStatuses.filter((value) =>
    value !== 'in_escrow' && (PAYMENT_STATUS_FILTERS as readonly string[]).includes(value));
  if (escrowOnly && plainStatuses.length > 0) {
    filters.push(sql`(in_escrow = true OR status IN (${sql.join(plainStatuses.map((value) => sql`${value}`), sql`, `)}))`);
  } else if (escrowOnly) {
    filters.push(sql`in_escrow = true`);
  } else if (plainStatuses.length > 0) {
    filters.push(sql`status IN (${sql.join(plainStatuses.map((value) => sql`${value}`), sql`, `)})`);
  }

  return sql.join(filters, sql` AND `);
};

const toPaymentRow = (row: Record<string, any>) => ({
  occurredAt: row.occurred_at,
  source: String(row.source) as PaymentSource,
  sourceLabel: SOURCE_LABELS[String(row.source) as PaymentSource] || String(row.source),
  direction: String(row.direction) as 'in' | 'out',
  escrow: Boolean(row.in_escrow),
  status: row.status || null,
  reference: row.paystack_reference || row.reference_id,
  amount: num(row.amount),
  grossCharged: num(row.gross_charged),
  paystackFee: num(row.paystack_fee),
  payer: row.payer,
  description: row.description,
});

interface PaymentTotals {
  count: number;
  moneyIn: number;
  escrowHeld: number;
  escrowEstimatedFee: number;
  moneyOut: number;
  moneyOutCompleted: number;
}

/**
 * Escrow-aware totals. `amount` is the platform's share; escrowed bookings
 * contribute only their estimated fee to that figure while the held amount
 * is reported separately via `escrowHeld`. Payouts that did not move money
 * (declined/failed) are excluded from the report entirely at the union.
 */
const paymentsTotalsSql = sql`
  SELECT count(*)::int AS count,
         coalesce(sum(CASE WHEN direction = 'in' AND NOT in_escrow THEN amount END), 0)::float8 AS money_in,
         coalesce(sum(escrow_held), 0)::float8 AS escrow_held,
         coalesce(sum(CASE WHEN in_escrow THEN amount END), 0)::float8 AS escrow_estimated_fee,
         coalesce(sum(CASE WHEN direction = 'out' THEN amount END), 0)::float8 AS money_out,
         coalesce(sum(CASE WHEN source = 'payout' AND status = 'completed' THEN amount END), 0)::float8 AS money_out_completed,
         count(*) FILTER (WHERE in_escrow)::int AS escrow_count,
         count(*) FILTER (WHERE source = 'payout' AND status IN ('pending','processing'))::int AS payouts_pending,
         count(*) FILTER (WHERE source = 'payout' AND status = 'completed')::int AS payouts_completed
`;

const paymentsUnion = async () => paymentsUnionSql(await bookingPlatformFeePercent(), await contextFeePercent('course'));

const paymentsTotals = async (where: SQL): Promise<PaymentTotals & Record<string, number>> => {
  const result = await db.execute(sql`${paymentsTotalsSql} FROM (${await paymentsUnion()}) AS payments WHERE ${where}`);
  const row = ((result.rows as Record<string, any>[]) || [])[0] || {};
  return {
    count: num(row.count),
    moneyIn: num(row.money_in),
    escrowHeld: num(row.escrow_held),
    escrowEstimatedFee: num(row.escrow_estimated_fee),
    moneyOut: num(row.money_out),
    moneyOutCompleted: num(row.money_out_completed),
    escrowCount: num(row.escrow_count),
    payoutsPending: num(row.payouts_pending),
    payoutsCompleted: num(row.payouts_completed),
  };
};

export const getPaymentsReport = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const where = toPaymentFilters(req.query as Record<string, any>);
    const wantsCsv = String(req.query?.format || '').toLowerCase() === 'csv';
    const limit = Math.min(Math.max(Number(req.query?.limit) || 25, 1), 200);
    const page = Math.max(Number(req.query?.page) || 1, 1);

    const union = await paymentsUnion();

    const [rowsResult, summaryResult, totals] = await Promise.all([
      db.execute(sql`
        SELECT occurred_at, source, direction, in_escrow, status, reference_id, paystack_reference, amount,
               gross_charged, paystack_fee, payer, description
          FROM (${union}) AS payments
         WHERE ${where}
         ORDER BY occurred_at DESC
         LIMIT ${limit} OFFSET ${(page - 1) * limit}
      `),
      db.execute(sql`
        SELECT source, direction,
               count(*)::int AS count,
               coalesce(sum(amount), 0)::float8 AS total
          FROM (${union}) AS payments
         WHERE ${where}
         GROUP BY source, direction
      `),
      paymentsTotals(where),
    ]);

    const rows = ((rowsResult.rows as Record<string, any>[]) || []).map(toPaymentRow);
    const summaryRows = (summaryResult.rows as Record<string, any>[]) || [];

    if (wantsCsv) {
      return sendCsv(
        res,
        `payments-report-${new Date().toISOString().slice(0, 10)}.csv`,
        PAYMENT_REPORT_COLUMNS.map((column) => column.label),
        rows,
        PAYMENT_REPORT_COLUMNS.map((column) => column.key),
      );
    }

    res.json({
      columns: PAYMENT_REPORT_COLUMNS,
      rows,
      summary: {
        totals: {
          count: totals.count,
          moneyIn: totals.moneyIn,
          escrowHeld: totals.escrowHeld,
          escrowCount: totals.escrowCount,
          escrowEstimatedFee: totals.escrowEstimatedFee,
          moneyOut: totals.moneyOut,
          moneyOutCompleted: totals.moneyOutCompleted,
          payoutsPending: totals.payoutsPending,
          payoutsCompleted: totals.payoutsCompleted,
          net: totals.moneyIn - totals.moneyOutCompleted,
        },
        sources: summaryRows.map((row) => ({
          source: String(row.source) as PaymentSource,
          label: SOURCE_LABELS[String(row.source) as PaymentSource] || String(row.source),
          direction: String(row.direction) as 'in' | 'out',
          count: num(row.count),
          amount: num(row.total),
        })),
      },
      pagination: {
        page,
        limit,
        total: totals.count,
        totalPages: Math.ceil(totals.count / limit) || 1,
      },
    });
  } catch (err: any) {
    (req.log || logger).error({ err, adminId: req.admin?.id }, 'admin.payments_report_failed');
    res.status(500).json({ error: 'Could not fetch payments report' });
  }
};

// ── Quick reports (extensible, one case per report type) ────────────────────

interface ReportColumn {
  key: string;
  label: string;
}

interface ReportResult {
  rows: Record<string, unknown>[];
  summary: { label: string; value: string | number }[];
}

interface ReportDefinition {
  label: string;
  columns: ReportColumn[];
  fetch: (from?: Date, to?: Date) => Promise<ReportResult>;
}

const REPORT_PAGE_SIZE = 1000;

const REPORT_DEFINITIONS: Record<string, ReportDefinition> = {
  users: {
    label: 'Users',
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'email', label: 'Email' },
      { key: 'role', label: 'Role' },
      { key: 'status', label: 'Status' },
      { key: 'emailVerified', label: 'Email verified' },
      { key: 'createdAt', label: 'Registered' },
    ],
    fetch: async (from, to) => {
      const conditions: SQL[] = [];
      if (from) conditions.push(sql`${users.createdAt} >= ${from.toISOString()}`);
      if (to) conditions.push(sql`${users.createdAt} <= ${to.toISOString()}`);

      const rowsResult = await db
        .select({
          name: sql<string | null>`nullif(${users.firstName} || ' ' || ${users.lastName}, ' ')`,
          email: users.email,
          role: users.role,
          status: users.status,
          emailVerified: users.emailVerified,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(users.createdAt))
        .limit(REPORT_PAGE_SIZE);

      const byRole = (role: string) => rowsResult.filter((row) => row.role === role).length;
      return {
        rows: rowsResult.map((row) => ({
          name: row.name || '—',
          email: row.email,
          role: row.role,
          status: row.status,
          emailVerified: row.emailVerified ? 'Yes' : 'No',
          createdAt: row.createdAt,
        })),
        summary: [
          { label: 'Teachers', value: byRole('teacher') },
          { label: 'Parents', value: byRole('parent') },
          { label: 'Admins', value: byRole('admin') },
          { label: 'Total', value: rowsResult.length },
        ],
      };
    },
  },

  bookings: {
    label: 'Bookings',
    columns: [
      { key: 'reference', label: 'Booking' },
      { key: 'teacher', label: 'Tutor' },
      { key: 'parent', label: 'Parent' },
      { key: 'status', label: 'Status' },
      { key: 'amount', label: 'Amount (₦)' },
      { key: 'createdAt', label: 'Created' },
      { key: 'paidAt', label: 'Paid' },
    ],
    fetch: async (from, to) => {
      const conditions: SQL[] = [];
      if (from) conditions.push(sql`${bookings.createdAt} >= ${from.toISOString()}`);
      if (to) conditions.push(sql`${bookings.createdAt} <= ${to.toISOString()}`);

      const rowsResult = await db
        .select({
          reference: bookings.id,
          teacher: fullNameSql('bookings.teacher_id'),
          parent: fullNameSql('bookings.parent_id'),
          status: bookings.status,
          amount: sql<number>`${bookings.totalAmount}::float8`,
          createdAt: bookings.createdAt,
          paidAt: bookings.paidAt,
        })
        .from(bookings)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(bookings.createdAt))
        .limit(REPORT_PAGE_SIZE);

      const statusCount = (status: string) =>
        rowsResult.filter((row) => (row.status || 'pending') === status).length;
      const amountFor = (statuses: string[]) =>
        rowsResult
          .filter((row) => statuses.includes(row.status || 'pending'))
          .reduce((acc, row) => acc + num(row.amount), 0);

      return {
        rows: rowsResult.map((row) => ({
          reference: row.reference,
          teacher: row.teacher,
          parent: row.parent,
          status: row.status || 'pending',
          amount: num(row.amount),
          createdAt: row.createdAt,
          paidAt: row.paidAt,
        })),
        summary: [
          { label: 'Pending', value: statusCount('pending') },
          { label: 'In escrow', value: statusCount('paid_escrow') },
          { label: 'Completed', value: statusCount('completed') },
          { label: 'Cancelled', value: statusCount('cancelled') },
          { label: 'Paid volume', value: `₦${amountFor(['paid_escrow', 'completed']).toLocaleString()}` },
        ],
      };
    },
  },

  subscriptions: {
    label: 'Subscriptions',
    columns: [
      { key: 'tutor', label: 'Tutor' },
      { key: 'plan', label: 'Plan' },
      { key: 'durationMonths', label: 'Duration (months)' },
      { key: 'amount', label: 'Amount (₦)' },
      { key: 'status', label: 'Status' },
      { key: 'startsAt', label: 'Starts' },
      { key: 'endsAt', label: 'Ends' },
    ],
    fetch: async (from, to) => {
      const conditions: SQL[] = [];
      if (from) conditions.push(sql`${tutorSubscriptions.createdAt} >= ${from.toISOString()}`);
      if (to) conditions.push(sql`${tutorSubscriptions.createdAt} <= ${to.toISOString()}`);

      const rowsResult = await db
        .select({
          tutor: fullNameSql('tutor_subscriptions.tutor_id'),
          plan: tutorSubscriptions.planSlug,
          durationMonths: tutorSubscriptions.durationMonths,
          amount: sql<number>`${tutorSubscriptions.amountPaid}::float8`,
          status: tutorSubscriptions.status,
          startsAt: tutorSubscriptions.startsAt,
          endsAt: tutorSubscriptions.endsAt,
        })
        .from(tutorSubscriptions)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(tutorSubscriptions.createdAt))
        .limit(REPORT_PAGE_SIZE);

      const countBy = (status: string) => rowsResult.filter((row) => row.status === status).length;
      const valueBy = (statuses: string[]) =>
        rowsResult.filter((row) => statuses.includes(row.status)).reduce((acc, row) => acc + num(row.amount), 0);

      return {
        rows: rowsResult,
        summary: [
          { label: 'Active', value: countBy('active') },
          { label: 'Expired', value: countBy('expired') },
          { label: 'Failed', value: countBy('failed') },
          { label: 'Earned (active + expired)', value: `₦${valueBy(['active', 'expired']).toLocaleString()}` },
        ],
      };
    },
  },

  courses: {
    label: 'Courses',
    columns: [
      { key: 'title', label: 'Course' },
      { key: 'teacher', label: 'Tutor' },
      { key: 'status', label: 'Status' },
      { key: 'price', label: 'Price (₦)' },
      { key: 'free', label: 'Free' },
      { key: 'enrolledCount', label: 'Enrolled' },
      { key: 'createdAt', label: 'Created' },
    ],
    fetch: async (from, to) => {
      const conditions: SQL[] = [];
      if (from) conditions.push(sql`${courses.created_at} >= ${from.toISOString()}`);
      if (to) conditions.push(sql`${courses.created_at} <= ${to.toISOString()}`);

      const rowsResult = await db
        .select({
          title: courses.title,
          teacher: fullNameSql('courses.teacher_id'),
          status: courses.status,
          price: sql<number>`coalesce(${courses.price}, 0)::float8`,
          free: courses.is_free,
          enrolledCount: courses.enrolled_count,
          createdAt: courses.created_at,
        })
        .from(courses)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(courses.created_at))
        .limit(REPORT_PAGE_SIZE);

      const countBy = (status: string) => rowsResult.filter((row) => row.status === status).length;
      const enrollments = rowsResult.reduce((acc, row) => acc + num(row.enrolledCount), 0);

      return {
        rows: rowsResult.map((row) => ({ ...row, free: row.free ? 'Yes' : 'No' })),
        summary: [
          { label: 'Published', value: countBy('published') },
          { label: 'Draft', value: countBy('draft') },
          { label: 'Archived', value: countBy('archived') },
          { label: 'Enrollments', value: enrollments },
        ],
      };
    },
  },
};

export const listQuickReports = async (_req: AuthenticatedRequest, res: Response) => {
  res.json({
    reports: [
      { type: 'users', label: 'Users', description: 'All registered accounts with role, status and registration date.' },
      { type: 'bookings', label: 'Bookings', description: 'Every booking with tutor, parent, status and amount.' },
      { type: 'subscriptions', label: 'Subscriptions', description: 'Tutor subscription purchases: plan, term and status.' },
      { type: 'payments', label: 'Payments', description: 'All money in — bookings, courses, subscriptions and vault sales.' },
      { type: 'courses', label: 'Courses', description: 'Courses, pricing and enrollment counts.' },
    ],
  });
};

export const getQuickReport = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const type = String(req.params?.type || '').toLowerCase();
    const from = asDate(req.query?.from);
    const to = asDate(req.query?.to, true);
    const wantsCsv = String(req.query?.format || '').toLowerCase() === 'csv';

    // Payments reuses the money-movement union from the payments report.
    if (type === 'payments') {
      const where = toPaymentFilters({ ...req.query, type: 'all', format: undefined });
      const union = await paymentsUnion();
      const rowsResult = await db.execute(sql`
        SELECT occurred_at, source, direction, in_escrow, status, reference_id, paystack_reference, amount,
               gross_charged, paystack_fee, payer, description
          FROM (${union}) AS payments
         WHERE ${where}
         ORDER BY occurred_at DESC
         LIMIT ${REPORT_PAGE_SIZE}
      `);
      const rows = ((rowsResult.rows as Record<string, any>[]) || []).map(toPaymentRow);
      const totals = await paymentsTotals(where);

      if (wantsCsv) {
        return sendCsv(
          res,
          `report-payments-${new Date().toISOString().slice(0, 10)}.csv`,
          PAYMENT_REPORT_COLUMNS.map((column) => column.label),
          rows,
          PAYMENT_REPORT_COLUMNS.map((column) => column.key),
        );
      }

      const bySource = (source: PaymentSource) => rows.filter((row) => row.source === source).length;
      return res.json({
        meta: {
          type: 'payments',
          label: 'Payments',
          columns: PAYMENT_REPORT_COLUMNS,
          generatedAt: new Date().toISOString(),
          range: { from: req.query?.from || null, to: req.query?.to || null },
          truncated: rows.length >= REPORT_PAGE_SIZE,
        },
        rows,
        summary: [
          { label: 'Platform income', value: `₦${Math.round(totals.moneyIn).toLocaleString()}` },
          { label: 'Held in escrow', value: `₦${Math.round(totals.escrowHeld).toLocaleString()}` },
          { label: 'Est. escrow fee', value: `₦${Math.round(totals.escrowEstimatedFee).toLocaleString()}` },
          { label: 'Payouts (completed)', value: `₦${Math.round(totals.moneyOutCompleted).toLocaleString()}` },
          { label: 'Net position', value: `₦${Math.round(totals.moneyIn - totals.moneyOutCompleted).toLocaleString()}` },
          { label: 'Booking rows', value: bySource('booking') },
          { label: 'Course rows', value: bySource('course') },
          { label: 'Subscription rows', value: bySource('subscription') },
          { label: 'Vault rows', value: bySource('vault') },
          { label: 'Payout rows', value: bySource('payout') },
        ],
      });
    }

    const definition = REPORT_DEFINITIONS[type];
    if (!definition) {
      return res.status(404).json({ error: `Unknown report type "${type}"` });
    }

    const { rows, summary } = await definition.fetch(from, to);

    if (wantsCsv) {
      return sendCsv(
        res,
        `report-${type}-${new Date().toISOString().slice(0, 10)}.csv`,
        definition.columns.map((column) => column.label),
        rows,
        definition.columns.map((column) => column.key),
      );
    }

    res.json({
      meta: {
        type,
        label: definition.label,
        columns: definition.columns,
        generatedAt: new Date().toISOString(),
        range: { from: req.query?.from || null, to: req.query?.to || null },
        truncated: rows.length >= REPORT_PAGE_SIZE,
      },
      rows,
      summary,
    });
  } catch (err: any) {
    (req.log || logger).error({ err, adminId: req.admin?.id, reportType: req.params?.type }, 'admin.quick_report_failed');
    res.status(500).json({ error: 'Could not generate report' });
  }
};
