import 'dotenv/config';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { db, pool } from '../database/db';
import { subjects } from '../database/schema';

const desiredSubjects = [
  'Computer Science',
  'Creative Art',
  'Literature in English',
  'Nigerian History',
  'Government',
  'Christian Religious Studies',
  'Nigerian Languages',
  'Visual Arts',
  'Origami',
  'Financial Accounting',
  'Commerce',
  'Economics',
  'Foods & Nutrition',
  'Agricultural Science',
  'Further Mathematics',
  'Geography',
  'Physical & Health Education',
  'General Mathematics',
  'Civic Education',
  'Digital Technologies',
  'Arabic Language',
  'Technical Studies',
  'Arts',
];

const subjectRenames: Record<string, string> = {
  Accounting: 'Financial Accounting',
  'Food and Nutrition': 'Foods & Nutrition',
  History: 'Nigerian History',
  Mathematics: 'General Mathematics',
  'Technical Drawing': 'Technical Studies',
};

async function renameExistingSubjects() {
  let renamedCount = 0;

  for (const [fromName, toName] of Object.entries(subjectRenames)) {
    const existingTarget = await db.query.subjects.findFirst({
      where: eq(subjects.name, toName),
    });

    if (existingTarget) {
      console.log(`Skipping rename "${fromName}" -> "${toName}" because target already exists.`);
      continue;
    }

    const [renamed] = await db
      .update(subjects)
      .set({
        name: toName,
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(subjects.name, fromName))
      .returning({ name: subjects.name });

    if (renamed) {
      renamedCount += 1;
      console.log(`Renamed "${fromName}" -> "${toName}".`);
    }
  }

  return renamedCount;
}

async function insertMissingSubjects() {
  let insertedCount = 0;

  for (const subjectName of desiredSubjects) {
    const [inserted] = await db
      .insert(subjects)
      .values({
        id: randomUUID(),
        name: subjectName,
        isActive: true,
      })
      .onConflictDoNothing({ target: subjects.name })
      .returning({ name: subjects.name });

    if (inserted) {
      insertedCount += 1;
      console.log(`Inserted "${subjectName}".`);
    }
  }

  return insertedCount;
}

async function seedSubjects() {
  console.log('Seeding subjects...');

  const renamedCount = await renameExistingSubjects();
  const insertedCount = await insertMissingSubjects();

  console.log(`Done. Renamed ${renamedCount} subjects and inserted ${insertedCount} missing subjects.`);
}

seedSubjects()
  .catch((error) => {
    console.error('Subject seeding failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
