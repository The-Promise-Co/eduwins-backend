import 'dotenv/config';
import bcrypt from 'bcrypt';
import { db, pool } from '../database/db';
import { adminUsers } from '../database/schema';
import { eq } from 'drizzle-orm';

const ADMIN_EMAIL = 'admin@eduwins.com';
const ADMIN_PASSWORD = 'Admin@123';
const ADMIN_FIRST_NAME = 'Super';
const ADMIN_LAST_NAME = 'Admin';

async function seedAdmin() {
  try {
    console.log('Checking for existing superadmin...');

    const existing = await db.query.adminUsers.findFirst({
      where: eq(adminUsers.email, ADMIN_EMAIL),
    });

    if (existing) {
      console.log(`Superadmin already exists: ${ADMIN_EMAIL} (id: ${existing.id})`);
      await pool.end();
      return;
    }

    console.log('Creating superadmin user...');
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    const adminId = Math.random().toString(36).substring(2, 15);

    await db.insert(adminUsers).values({
      id: adminId,
      email: ADMIN_EMAIL,
      passwordHash,
      firstName: ADMIN_FIRST_NAME,
      lastName: ADMIN_LAST_NAME,
      role: 'admin',
      permissions: { all: true },
      isActive: true,
    });

    console.log('Superadmin user created successfully!');
    console.log('---');
    console.log(`Email:       ${ADMIN_EMAIL}`);
    console.log(`Password:    ${ADMIN_PASSWORD}`);
    console.log(`Role:        superadmin`);
    console.log(`Permissions: {"all": true}`);
    console.log(`User ID:     ${adminId}`);
  } catch (err) {
    console.error('Failed to seed admin user:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seedAdmin();
