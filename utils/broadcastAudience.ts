import {
  and,
  eq,
  gte,
  isNull,
  lt,
  sql,
  type SQL,
} from 'drizzle-orm';
import { db } from '../database/db';
import {
  users,
  teacherProfiles,
  parentProfiles,
  children,
  subjects,
} from '../database/schema';
import { NIGERIAN_STATES } from '../controllers/locationController';

/**
 * Audience segments for admin broadcasts.
 *
 * `buildAudienceWhere` is the single source of truth: the live recipient count,
 * the queue-time snapshot, and the actual send all resolve through it, so the
 * number an admin sees can never diverge from who actually gets the email.
 */

export const BROADCAST_ROLES = ['teacher', 'parent'] as const;
export type BroadcastRole = (typeof BROADCAST_ROLES)[number];

export type BookingActivityFilter = 'any' | 'active' | 'completed' | 'none';

/** Generic "any / has / none" option filters (certifications, courses, bank details). */
export type AudienceSelectionFilter = 'any' | 'has' | 'none';

/** Teacher profile fields that can be filtered individually (location state is excluded — the dedicated State filter already covers it). */
export const PROFILE_FIELDS = ['bio', 'photo', 'highestDegree', 'yearsOfExperience'] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];

export const DELIVERY_MODES = ['online', 'in_person', 'both'] as const;

export interface BroadcastSegment {
  role: BroadcastRole;

  // ── shared ──────────────────────────────────────────────────────────────
  emailVerifiedOnly?: boolean;
  registeredWithinDays?: number;
  registeredFrom?: string;
  registeredTo?: string;

  // ── tutor ───────────────────────────────────────────────────────────────
  subjects?: string[];
  locationStates?: string[];
  locationLgas?: string[];
  deliveryModes?: string[];
  vettedOnly?: boolean;
  availableOnly?: boolean;
  minRating?: number;
  minSessions?: number;
  certifications?: AudienceSelectionFilter;
  courses?: AudienceSelectionFilter;
  bankDetails?: AudienceSelectionFilter;
  /** Profile fields the tutor must have filled in. */
  profileFieldsRequired?: ProfileField[];
  /** Profile fields the tutor must be missing (also matches tutors with no profile row). */
  profileFieldsMissing?: ProfileField[];

  // ── parent ──────────────────────────────────────────────────────────────
  bookingActivity?: BookingActivityFilter;
  bookingsWithinDays?: number;
  hasChildren?: boolean;
  childGrades?: string[];
  locationLgasParent?: string[];
}

const asStringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const cleaned = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
  return cleaned.length ? cleaned : undefined;
};

const asNumber = (value: unknown): number | undefined => {
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
};

const asDateOnly = (value: unknown, field: string): string | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${field} must be a valid date in YYYY-MM-DD format`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${field} must be a valid date in YYYY-MM-DD format`);
  }
  return value;
};

const asBoolean = (value: unknown): boolean | undefined =>
  value === true ? true : value === false ? false : undefined;

const asSelectionFilter = (value: unknown): AudienceSelectionFilter | undefined => {
  const candidate = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return (['any', 'has', 'none'] as readonly string[]).includes(candidate)
    ? (candidate as AudienceSelectionFilter)
    : undefined;
};

/**
 * Whitelist + coerce an untrusted segment. Unknown keys are dropped, empty
 * arrays are treated as "no filter".
 */
export const normalizeSegment = (raw: unknown): BroadcastSegment => {
  const input = (raw || {}) as Record<string, any>;
  const role = BROADCAST_ROLES.includes(input.role) ? (input.role as BroadcastRole) : null;
  if (!role) {
    throw new Error('segment.role must be "teacher" or "parent"');
  }

  const normalized: BroadcastSegment = { role, emailVerifiedOnly: true };

  const registeredWithinDays = asNumber(input.registeredWithinDays);
  if (registeredWithinDays && registeredWithinDays > 0) normalized.registeredWithinDays = registeredWithinDays;

  const registeredFrom = asDateOnly(input.registeredFrom, 'registeredFrom');
  const registeredTo = asDateOnly(input.registeredTo, 'registeredTo');
  if (registeredFrom && registeredTo && registeredFrom > registeredTo) {
    throw new Error('registeredFrom must be on or before registeredTo');
  }
  if (registeredFrom) normalized.registeredFrom = registeredFrom;
  if (registeredTo) normalized.registeredTo = registeredTo;

  if (role === 'teacher') {
    const subjects = asStringArray(input.subjects);
    if (subjects) normalized.subjects = subjects;

    const locationStates = asStringArray(input.locationStates);
    if (locationStates) normalized.locationStates = locationStates;

    const locationLgas = asStringArray(input.locationLgas);
    if (locationLgas) normalized.locationLgas = locationLgas;

    const deliveryModes = asStringArray(input.deliveryModes)?.map((mode) => mode.toLowerCase());
    if (deliveryModes) {
      normalized.deliveryModes = deliveryModes.filter((mode) => (DELIVERY_MODES as readonly string[]).includes(mode));
    }

    if (asBoolean(input.vettedOnly)) normalized.vettedOnly = true;
    if (asBoolean(input.availableOnly)) normalized.availableOnly = true;

    const minRating = asNumber(input.minRating);
    if (minRating !== undefined && minRating >= 0) normalized.minRating = minRating;

    const minSessions = asNumber(input.minSessions);
    if (minSessions !== undefined && minSessions >= 0) normalized.minSessions = minSessions;

    const certifications = asSelectionFilter(input.certifications);
    if (certifications && certifications !== 'any') normalized.certifications = certifications;

    const coursesFilter = asSelectionFilter(input.courses);
    if (coursesFilter && coursesFilter !== 'any') normalized.courses = coursesFilter;

    const bankDetails = asSelectionFilter(input.bankDetails);
    if (bankDetails && bankDetails !== 'any') normalized.bankDetails = bankDetails;

    const toProfileFields = (value: unknown): ProfileField[] | undefined => {
      const fields = asStringArray(value)?.filter(
        (field): field is ProfileField => (PROFILE_FIELDS as readonly string[]).includes(field),
      );
      return fields?.length ? Array.from(new Set(fields)) : undefined;
    };
    const profileFieldsRequired = toProfileFields(input.profileFieldsRequired);
    const profileFieldsMissing = toProfileFields(input.profileFieldsMissing);
    if (profileFieldsRequired) normalized.profileFieldsRequired = profileFieldsRequired;
    // A field cannot be required and missing at the same time; required wins.
    const remainingMissing = profileFieldsMissing?.filter(
      (field) => !profileFieldsRequired?.includes(field),
    );
    if (remainingMissing?.length) normalized.profileFieldsMissing = remainingMissing;
  } else {
    const activity = String(input.bookingActivity || 'any').toLowerCase();
    if (['any', 'active', 'completed', 'none'].includes(activity)) {
      normalized.bookingActivity = activity as BookingActivityFilter;
    }

    const bookingsWithinDays = asNumber(input.bookingsWithinDays);
    if (bookingsWithinDays && bookingsWithinDays > 0) normalized.bookingsWithinDays = bookingsWithinDays;

    if (asBoolean(input.hasChildren)) normalized.hasChildren = true;

    const childGrades = asStringArray(input.childGrades);
    if (childGrades) normalized.childGrades = childGrades;

    const locationLgasParent = asStringArray(input.locationLgasParent);
    if (locationLgasParent) normalized.locationLgasParent = locationLgasParent;
  }

  return normalized;
};

/**
 * Parameterised `ARRAY[...]::<type>[]` literal for text[] / enum[] overlap.
 */
const arrayLiteral = (values: string[], cast: string): SQL =>
  sql`ARRAY[${sql.join(values.map((value) => sql`${value}::${sql.raw(cast)}`), sql`, `)}]`;

const bookingExists = (segment: BroadcastSegment): SQL | undefined => {
  const withinDays = segment.bookingsWithinDays;
  const recency = withinDays
    ? sql` AND "bookings"."created_at" >= now() - make_interval(days => ${withinDays})`
    : sql``;

  switch (segment.bookingActivity) {
    case 'active':
      return sql`EXISTS (SELECT 1 FROM "bookings" WHERE "bookings"."parent_id" = ${users.id} AND "bookings"."status" = 'paid_escrow'${recency})`;
    case 'completed':
      return sql`EXISTS (SELECT 1 FROM "bookings" WHERE "bookings"."parent_id" = ${users.id} AND "bookings"."status" = 'completed'${recency})`;
    case 'none':
      return sql`NOT EXISTS (SELECT 1 FROM "bookings" WHERE "bookings"."parent_id" = ${users.id})`;
    default:
      if (withinDays) {
        return sql`EXISTS (SELECT 1 FROM "bookings" WHERE "bookings"."parent_id" = ${users.id}${recency})`;
      }
      return undefined;
  }
};

export interface AudienceSql {
  /** Where clause shared by COUNT and the recipient snapshot */
  where: SQL;
  /** true when the segment needs the teacher_profiles join */
  needsTeacherJoin: boolean;
  /** true when the segment needs the parent_profiles join */
  needsParentJoin: boolean;
}

/**
 * Build the predicate for a segment. Baseline (always applied, not toggleable):
 * matching role, `status = 'active'`, never soft-deleted.
 */
export const buildAudienceSql = (segment: BroadcastSegment): AudienceSql => {
  const conditions: SQL[] = [
    eq(users.role, segment.role),
    eq(users.status, 'active'),
    isNull(users.deletedAt),
    eq(users.emailVerified, true),
    sql`${users.email} IS NOT NULL`,
    sql`trim(${users.email}) <> ''`,
  ];

  if (segment.registeredWithinDays) {
    const since = new Date(Date.now() - segment.registeredWithinDays * 24 * 60 * 60 * 1000);
    conditions.push(gte(users.createdAt, since));
  }
  if (segment.registeredFrom) {
    conditions.push(gte(users.createdAt, new Date(`${segment.registeredFrom}T00:00:00.000Z`)));
  }
  if (segment.registeredTo) {
    const exclusiveEnd = new Date(`${segment.registeredTo}T00:00:00.000Z`);
    exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
    conditions.push(lt(users.createdAt, exclusiveEnd));
  }

  let needsTeacherJoin = false;
  let needsParentJoin = false;

  if (segment.role === 'teacher') {
    needsTeacherJoin = Boolean(
      segment.subjects || segment.locationStates?.length || segment.locationLgas?.length ||
      segment.deliveryModes?.length || segment.vettedOnly || segment.availableOnly ||
      segment.minRating !== undefined || segment.minSessions !== undefined,
    );

    if (needsTeacherJoin) conditions.push(sql`"teacher_profiles"."user_id" IS NOT NULL`);

    if (segment.vettedOnly) conditions.push(eq(teacherProfiles.isAdminApproved, true));
    if (segment.availableOnly) conditions.push(eq(teacherProfiles.availability, true));
    if (segment.minRating !== undefined) conditions.push(gte(teacherProfiles.ratingAvg, String(segment.minRating)));
    if (segment.minSessions !== undefined) conditions.push(gte(teacherProfiles.totalSessions, segment.minSessions));

    // subjects / delivery modes are text[] / enum[] columns: array overlap
    if (segment.subjects) {
      conditions.push(sql`${teacherProfiles.subjects} && ${arrayLiteral(segment.subjects, 'text')}`);
    }
    if (segment.deliveryModes) {
      conditions.push(sql`${teacherProfiles.deliveryModes} && ${arrayLiteral(segment.deliveryModes, 'delivery_mode')}`);
    }
    if (segment.locationStates) {
      conditions.push(sql`lower("teacher_profiles"."location_state") IN (${sql.join(segment.locationStates.map((state) => sql`${state.toLowerCase()}`), sql`, `)})`);
    }
    if (segment.locationLgas) {
      conditions.push(sql`lower("teacher_profiles"."location_lga") IN (${sql.join(segment.locationLgas.map((lga) => sql`${lga.toLowerCase()}`), sql`, `)})`);
    }

    // Certifications / courses / payout details are pure EXISTS subqueries so
    // they also apply to teachers whose profile row is missing entirely
    // ("none" must still match a teacher with no profile at all).
    const activeCertificationSubquery = sql`(
      SELECT 1 FROM "teacher_certifications"
      WHERE "teacher_certifications"."user_id" = ${users.id}
        AND ("teacher_certifications"."does_not_expire" = true
          OR "teacher_certifications"."expiry_date" IS NULL
          OR "teacher_certifications"."expiry_date" >= current_date))`;
    if (segment.certifications === 'has') {
      conditions.push(sql`EXISTS ${activeCertificationSubquery}`);
    } else if (segment.certifications === 'none') {
      conditions.push(sql`NOT EXISTS ${activeCertificationSubquery}`);
    }

    const publishedCourseSubquery = sql`(
      SELECT 1 FROM "courses"
      WHERE "courses"."teacher_id" = ${users.id}
        AND "courses"."status" = 'published')`;
    if (segment.courses === 'has') {
      conditions.push(sql`EXISTS ${publishedCourseSubquery}`);
    } else if (segment.courses === 'none') {
      conditions.push(sql`NOT EXISTS ${publishedCourseSubquery}`);
    }

    const payoutAccountSubquery = sql`(
      SELECT 1 FROM "payout_accounts"
      WHERE "payout_accounts"."teacher_id" = ${users.id})`;
    if (segment.bankDetails === 'has') {
      conditions.push(sql`EXISTS ${payoutAccountSubquery}`);
    } else if (segment.bankDetails === 'none') {
      conditions.push(sql`NOT EXISTS ${payoutAccountSubquery}`);
    }

    // Profile-field filters are EXISTS subqueries too, so "missing" also
    // matches teachers who have no profile row at all, and "filled in" is
    // impossible without one — no join needed either way.
    const profileFieldFilledSql = (field: ProfileField): SQL => {
      const columns: Record<ProfileField, { column: string; numeric?: boolean }> = {
        bio: { column: 'bio' },
        photo: { column: 'photo_url' },
        highestDegree: { column: 'highest_degree' },
        yearsOfExperience: { column: 'years_of_experience', numeric: true },
      };
      const target = columns[field];
      const ref = sql`tp."${sql.raw(target.column)}"`; // column names come from our own whitelist
      return target.numeric
        ? sql`${ref} IS NOT NULL`
        : sql`${ref} IS NOT NULL AND trim(${ref}) <> ''`;
    };

    for (const field of segment.profileFieldsRequired || []) {
      conditions.push(sql`EXISTS (
        SELECT 1 FROM "teacher_profiles" AS tp
        WHERE tp."user_id" = ${users.id} AND ${profileFieldFilledSql(field)})`);
    }
    for (const field of segment.profileFieldsMissing || []) {
      conditions.push(sql`NOT EXISTS (
        SELECT 1 FROM "teacher_profiles" AS tp
        WHERE tp."user_id" = ${users.id} AND ${profileFieldFilledSql(field)})`);
    }
  } else {
    const bookingClause = bookingExists(segment);
    if (bookingClause) conditions.push(bookingClause);

    if (segment.hasChildren) {
      conditions.push(sql`EXISTS (SELECT 1 FROM "children" WHERE "children"."parent_id" = ${users.id})`);
    }
    if (segment.childGrades) {
      conditions.push(sql`EXISTS (SELECT 1 FROM "children" WHERE "children"."parent_id" = ${users.id} AND lower("children"."grade") IN (${sql.join(segment.childGrades.map((grade) => sql`${grade.toLowerCase()}`), sql`, `)}))`);
    }
    if (segment.locationLgasParent?.length) {
      needsParentJoin = true;
      conditions.push(sql`lower("parent_profiles"."default_location_lga") IN (${sql.join(segment.locationLgasParent.map((lga) => sql`${lga.toLowerCase()}`), sql`, `)})`);
    }
  }

  return { where: and(...conditions) as SQL, needsTeacherJoin, needsParentJoin };
};

export interface AudienceRecipient {
  userId: string;
  firstName: string;
  email: string;
}

export interface AudienceOptions {
  limit?: number;
  /**
   * Restrict to an explicit email set (used by the dev safety net so the
   * composer can show how many recipients would actually be mailed).
   */
  restrictToEmails?: string[];
}

const buildFinalWhere = (where: SQL, options?: AudienceOptions): SQL => {
  if (options?.restrictToEmails?.length) {
    const list = options.restrictToEmails.map((email) => sql`${email}`);
    return and(where, sql`lower("users"."email") IN (${sql.join(list, sql`, `)})`) as SQL;
  }
  return where;
};

/**
 * How many accounts match a segment right now.
 */
export const countAudience = async (segment: BroadcastSegment, options?: AudienceOptions): Promise<number> => {
  const { where, needsTeacherJoin, needsParentJoin } = buildAudienceSql(segment);

  const query = db
    .select({ value: sql<number>`count(*)::int` })
    .from(users)
    .$dynamic();

  if (needsTeacherJoin) {
    query.leftJoin(teacherProfiles, eq(teacherProfiles.userId, users.id));
  }
  if (needsParentJoin) {
    query.leftJoin(parentProfiles, eq(parentProfiles.userId, users.id));
  }

  const [row] = await query.where(buildFinalWhere(where, options));
  return Number(row?.value ?? 0);
};

/**
 * Snapshot of the accounts matching a segment (queue time).
 */
export const listAudience = async (
  segment: BroadcastSegment,
  options?: AudienceOptions,
): Promise<AudienceRecipient[]> => {
  const { where, needsTeacherJoin, needsParentJoin } = buildAudienceSql(segment);

  const query = db
    .select({
      userId: users.id,
      firstName: users.firstName,
      email: users.email,
    })
    .from(users)
    .$dynamic();

  if (needsTeacherJoin) {
    query.leftJoin(teacherProfiles, eq(teacherProfiles.userId, users.id));
  }
  if (needsParentJoin) {
    query.leftJoin(parentProfiles, eq(parentProfiles.userId, users.id));
  }

  const base = query.where(buildFinalWhere(where, options)).orderBy(users.firstName);
  const rows = options?.limit ? await base.limit(options.limit) : await base;
  return rows.map((row) => ({
    userId: row.userId,
    firstName: row.firstName,
    email: row.email.trim().toLowerCase(),
  }));
};

/**
 * Filter metadata for the composer UI.
 * `teacher_profiles.subjects` stores subject **ids**, so options are resolved
 * against the subjects table and fall back to the raw value for legacy rows.
 */
export const getSegmentOptions = async () => {
  const [rawSubjects, subjectCatalog, gradeRows] = await Promise.all([
    db.selectDistinct({ value: sql<string>`unnest("subjects")` }).from(teacherProfiles),
    db.select({ id: subjects.id, name: subjects.name }).from(subjects),
    db.selectDistinct({ value: children.grade }).from(children),
  ]);

  const nameById = new Map(subjectCatalog.map((row) => [row.id, row.name]));

  return {
    subjects: subjectCatalog
      .map((row) => ({ id: row.id, name: row.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    legacySubjectValues: Array.from(
      new Set(
        rawSubjects
          .map((row) => row.value)
          .filter((value) => value && !nameById.has(value)),
      ),
    ).sort(),
    childGrades: gradeRows.map((row) => row.value).filter(Boolean).sort() as string[],
    deliveryModes: DELIVERY_MODES,
    // Canonical list (mirrors GET /api/locations/states) so the composer does
    // not need a second round-trip; only state names we actually know about.
    states: NIGERIAN_STATES.map((state) => state.name),
    lgasByState: NIGERIAN_STATES.reduce<Record<string, string[]>>((acc, state) => {
      acc[state.name] = state.lgas;
      return acc;
    }, {}),
  };
};
