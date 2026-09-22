# AGENTS — backend booking work

Append-only memory. Update the status table + log at the end of every phase. Never rewrite history.

## Goal
Booking payment: parent pays after tutor accept, funds held in escrow, auto-cancel unpaid accepted bookings after a configurable window.

## Constraints / Decisions
- Use "payment", never "pre-payment".
- `booking_payment_window_hours = 4` in `system_settings`; setting must always exist — missing/invalid is a config error, no silent fallback.
- `reserved_at` = request creation; countdown starts at `accepted_at`.
- Audit fields: `accepted_at`, `denied_at`, `denial_reason`, `paid_at`, `cancelled_at`, `cancelled_by`.
- `cancelled_by`: `system` (auto-cancel) | `parent` | `teacher` | `admin`.
- Deadline derived as `accepted_at + window`; no separate due column.
- Auto-cancel via `node-cron` + defensive checks on list/init/verify.

## Phase status
| Phase | Scope | Status |
|---|---|---|
| 1 | `system_settings` table + seed + booking audit columns (`0029`) | Done, uncommitted |
| 2 | `reserved_at` on create; `accepted_at`/`denied_at`/`denial_reason`; window-backed accept copy | Done, uncommitted |
| 3 | Deny reason API support (`denialReason`) | Done (Phase 2), uncommitted |
| 4 | `paymentWindowHours` + `paymentDueAt` on list/detail responses | Done, uncommitted |
| 5 | `POST /api/paystack/initialize` booking branch + expiry guard | Done, uncommitted |
| 6 | Verify → `paid_escrow` + `paid_at` + notifications; webhook hardened | Done, uncommitted |
| 7 | node-cron scheduler + `cancelExpiredAcceptedBookings` + defensive checks | Done, uncommitted |
| 8 | Accepted/denied/auto-cancel email copy | Partial (`statusDetail` exists) |

## Key files / routes
- `controllers/bookingController.ts` — create/list/detail/accept/deny
- `services/systemSettingsService.ts` — `getBookingPaymentWindowHours()`
- `controllers/paystack/initializePayment.ts` — course + booking branches
- `controllers/paystack/verifyPayment.ts` — course settle; booking verify pending (Phase 6)
- `controllers/paystack/webhook.ts` — partial `paid_escrow` writer (needs Phase 6 guards)
- `routes/bookings.ts` — requests/list/detail/accept/deny
- `routes/paystack.ts` — initialize/verify/webhook
- `database/schema/lessons.ts`, `database/schema/config.ts`
- `drizzle/0029_booking_payment_window_and_audit.sql`
- `templates/emails/booking_request.html`, `booking_status.html`

## Verification log
- 2026-09-14: Phase 1 targeted schema check passed. Phase 2 targeted check passed.
- 2026-09-14: Phase 3–5 implemented. Targeted `tsc` on booking + paystack + settings + schema files passed.
- 2026-09-15: Phase 6–7 implemented. Targeted `tsc` on all new services and controllers passed. Frontend `tsc` passed.

## Next steps
- Phase 8: email templates for accepted/denied/auto-cancel.
- Consider `0029` seed `ON CONFLICT DO UPDATE` → `DO NOTHING` follow-up migration.
- Add `booking_payment_window_hours` admin UI if needed.
