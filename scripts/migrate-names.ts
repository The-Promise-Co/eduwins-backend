import { db } from '../database/db';
import { sql } from 'drizzle-orm';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
  console.log('Running name migration...');
  
  try {
    // 1. First ensure the columns exist if they don't already (this might fail if already created by drizzle push, but good to have)
    try {
      await db.execute(sql`ALTER TABLE users ADD COLUMN first_name VARCHAR(255)`);
      await db.execute(sql`ALTER TABLE users ADD COLUMN last_name VARCHAR(255)`);
      console.log('Added first_name and last_name columns.');
    } catch (e: any) {
      console.log('Columns might already exist, skipping creation.', e.message);
    }

    // 2. Migrate data
    // Fetch all users that have full_name
    const result = await db.execute(sql`SELECT id, full_name FROM users WHERE first_name IS NULL OR last_name IS NULL`);
    
    const rows = result.rows || result; // Depends on pg driver

    console.log(`Found ${rows.length} users to migrate.`);

    for (const user of rows as any[]) {
      const fullName = (user.full_name || '').trim();
      let firstName = 'Unknown';
      let lastName = 'Unknown';

      if (fullName) {
        const parts = fullName.split(' ');
        firstName = parts[0];
        lastName = parts.slice(1).join(' ') || 'Unknown';
      }

      await db.execute(sql`
        UPDATE users 
        SET first_name = ${firstName}, last_name = ${lastName}
        WHERE id = ${user.id}
      `);
    }

    console.log('Data migration complete. You can now safely run drizzle-kit push (which may prompt to drop full_name).');

  } catch (error) {
    console.error('Migration failed:', error);
  }
  
  process.exit(0);
}

run();
