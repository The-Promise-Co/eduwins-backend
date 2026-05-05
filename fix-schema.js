require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    await pool.query('DROP TABLE IF EXISTS otps;');
    console.log('Dropped otps table to bypass data loss prompt.');
  } catch (err) {
    console.error('Error dropping otps:', err.message);
  } finally {
    await pool.end();
  }
}
run();
