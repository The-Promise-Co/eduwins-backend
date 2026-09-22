import 'dotenv/config';
import { randomUUID } from 'crypto';
import { sql } from 'drizzle-orm';
import { db, pool } from '../database/db';
import { subjects } from '../database/schema';

const subjectsToSeed = [
  'Agricultural Science',
  'Arabic Language',
  'Arts',
  'Biology',
  'Chemistry',
  'Chinese Language',
  'Christian Religious Studies',
  'Civic Education',
  'Commerce',
  'Computer Science',
  'Creative Art',
  'Digital Technologies',
  'Economics',
  'English Language',
  'Financial Accounting',
  'Foods & Nutrition',
  'French Language',
  'Further Mathematics',
  'General Mathematics',
  'Geography',
  'German Language',
  'Government',
  'Hausa Language',
  'Igbo Language',
  'Literature in English',
  'Music',
  'Nigerian History',
  'Nigerian Languages',
  'Origami',
  'Physical & Health Education',
  'Physics',
  'Spanish Language',
  'Technical Studies',
  'Visual Arts',
  'Yoruba Language',
];

async function reseedAllSubjectsFresh() {
  console.log(`Subjects to seed: ${subjectsToSeed.length}`);
  console.log(subjectsToSeed.join('\n'));
  console.log('');
  console.log('Truncating subjects table and inserting subject list...');

  await db.transaction(async (tx) => {
    await tx.execute(sql`TRUNCATE TABLE subjects`);

    await tx.insert(subjects).values(
      subjectsToSeed.map((subjectName) => ({
        id: randomUUID(),
        name: subjectName,
        isActive: true,
      })),
    );
  });

  console.log(`Done. Seeded ${subjectsToSeed.length} subjects.`);
}

reseedAllSubjectsFresh()
  .catch((error) => {
    console.error('Fresh subject reseed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
