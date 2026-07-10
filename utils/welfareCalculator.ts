import { db } from '../database/db';
import { welfareFunds } from '../database/schema';
import { eq, sql } from 'drizzle-orm';
import logger from './logger';

export const calculateTotalWelfareFund = async (teacherId: string): Promise<number> => {
  try {
    const results = await db.select({
      total: sql<number>`sum(${welfareFunds.amount})`,
    })
      .from(welfareFunds)
      .where(eq(welfareFunds.teacherId, teacherId));

    const total = results[0]?.total || 0;
    return parseFloat(total.toString());
  } catch (err) {
    logger.error({ err, teacherId }, 'welfare.calculate_total_failed');
    return 0;
  }
};
