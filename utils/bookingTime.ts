/**
 * Canonical booking wall-clock handling.
 *
 * Booking rows store wall-clock with no zone (DATE + VARCHAR HH:MM), and the
 * product rule is that this wall-clock is Africa/Lagos time. Parsing it with
 * a bare `new Date("dateTtime")` silently adopts the process TZ, so a server
 * in UTC disagrees with Lagos users by an hour. These helpers interpret the
 * wall-clock explicitly as Lagos time and return an absolute Date.
 *
 * Lagos is UTC+1 with no DST (never observed), so the fixed offset below is
 * exact. If per-user zones are ever needed, swap the body for a zone-aware
 * implementation — call sites stay unchanged.
 */
export const BOOKING_TIMEZONE = 'Africa/Lagos';
export const LAGOS_OFFSET_MS = 60 * 60 * 1000; // UTC+1, no DST

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

/** "2026-09-23" + "10:00" (or "10:00:00") -> absolute Date of that Lagos wall time. Null on bad input. */
export function parseBookingDateTime(scheduledDate: string, time: string): Date | null {
  const d = DATE_RE.exec(scheduledDate);
  const t = TIME_RE.exec(time);
  if (!d || !t) return null;
  const utcMs = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]), Number(t[3] ?? 0));
  if (!Number.isFinite(utcMs)) return null;
  const date = new Date(utcMs - LAGOS_OFFSET_MS);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Start of a Lagos calendar day as an absolute Date. */
export function parseBookingDayStart(scheduledDate: string): Date | null {
  return parseBookingDateTime(scheduledDate, '00:00');
}

/** YYYY-MM-DD of "today in Lagos" for a given instant. */
export function getLagosTodayString(now: Date = new Date()): string {
  return new Date(now.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
}
