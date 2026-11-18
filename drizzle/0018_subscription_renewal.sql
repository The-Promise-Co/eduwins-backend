-- Subscription renewal support:
--  - renewal_reminder_sent_at marks that the T-7 "term ending soon"
--    notification has been sent for this subscription row, so the reminder
--    job is idempotent across runs.

ALTER TABLE tutor_subscriptions
  ADD COLUMN IF NOT EXISTS renewal_reminder_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS tutor_subscriptions_ends_at_idx
  ON tutor_subscriptions (ends_at)
  WHERE status = 'active';
