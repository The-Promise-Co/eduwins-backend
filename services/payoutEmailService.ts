import { db } from '../database/db';
import { adminUsers } from '../database/schema';
import { eq } from 'drizzle-orm';
import { emailService } from '../utils/emailSender';
import logger from '../utils/logger';

export const getActiveAdminEmails = async (): Promise<string[]> => {
  const admins = await db
    .select({ email: adminUsers.email })
    .from(adminUsers)
    .where(eq(adminUsers.isActive, true));
  return admins.map((a) => a.email).filter(Boolean);
};

const send = async (to: string, subject: string, html: string) => {
  try {
    await emailService.sendEmail({ to, subject, html });
  } catch (err) {
    logger.error({ err, to, subject }, 'payout.email_send_failed');
  }
};

export const notifyAdmins = async (subject: string, html: string) => {
  const emails = await getActiveAdminEmails();
  await Promise.all(emails.map((email) => send(email, subject, html)));
};

export const notifyTutor = async (email: string, subject: string, html: string) => {
  if (!email) return;
  await send(email, subject, html);
};

const money = (n: number | string) => `₦${Number(n || 0).toLocaleString()}`;

export const emailAdminsNewPayoutRequest = async (input: {
  teacherName: string;
  amount: number | string;
  payoutId: string;
}) => {
  await notifyAdmins(
    'New payout request on EduWins',
    `<h2>New payout request</h2>
     <p>${input.teacherName} requested a payout of <strong>${money(input.amount)}</strong>.</p>
     <p>Review and approve it from the admin payouts page.</p>`,
  );
};

export const emailAdminsAccountChanged = async (input: {
  teacherName: string;
  teacherEmail: string;
  oldAccount: string;
  newAccount: string;
}) => {
  await notifyAdmins(
    'Tutor payout account changed',
    `<h2>Payout account updated</h2>
     <p><strong>${input.teacherName}</strong> (${input.teacherEmail}) changed their payout account.</p>
     <p>Old: ${input.oldAccount}</p>
     <p>New: ${input.newAccount}</p>`,
  );
};

export const emailTutorAccountChanged = async (input: {
  email: string;
  account: string;
}) => {
  await notifyTutor(
    input.email,
    'Your payout account was updated',
    `<h2>Payout account updated</h2>
     <p>Your payout account is now:</p>
     <p><strong>${input.account}</strong></p>
     <p>You can change it again in 30 days.</p>`,
  );
};

export const emailTutorPayoutStatus = async (input: {
  email: string;
  status: string;
  amount: number | string;
  reason?: string;
}) => {
  const reasonHtml = input.reason
    ? `<p>Reason: ${input.reason}</p>`
    : '';
  await notifyTutor(
    input.email,
    `Your payout request was ${input.status}`,
    `<h2>Payout ${input.status}</h2>
     <p>Your payout request of <strong>${money(input.amount)}</strong> was ${input.status}.</p>
     ${reasonHtml}`,
  );
};
