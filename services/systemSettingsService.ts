import { eq } from 'drizzle-orm';
import { db } from '../database/db';
import { systemSettings } from '../database/schema';

export const getRequiredSystemSetting = async (key: string) => {
  const setting = await db.query.systemSettings.findFirst({
    where: eq(systemSettings.key, key),
  });

  if (!setting?.value) {
    throw new Error(`${key} setting is missing`);
  }

  return setting.value;
};

export const getBookingPaymentWindowHours = async () => {
  const value = await getRequiredSystemSetting('booking_payment_window_hours');
  const hours = Number(value);

  if (!Number.isFinite(hours) || hours <= 0) {
    throw new Error('booking_payment_window_hours setting is invalid');
  }

  return hours;
};
