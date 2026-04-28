import 'dotenv/config';
import { db } from '../database/db';
import { subjects } from '../database/schema';

const defaultSubjects = [
  'Mathematics', 'English', 'Physics', 'Chemistry',
  'Biology', 'Geography', 'History', 'Computer Science', 'Economics',
  'Further Mathematics', 'Civic Education', 'Government', 'Literature',
];

async function seedSubjects() {
  console.log('🌱 Checking and seeding subjects...');

  let addedCount = 0;

  for (const subjectName of defaultSubjects) {
    try {
      // Basic insert, relying on standard ID generation or passing minimal fields
      const uniqueId = `subj_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      
      await db.insert(subjects).values({
        id: uniqueId,
        name: subjectName,
        isActive: true,
      }).onConflictDoNothing({ target: subjects.name });

      addedCount++;
    } catch (error: any) {
      // Ignore unique constraint violations if onConflictDoNothing isn't supported smoothly
      if (!error.message.includes('duplicate key value')) {
        console.error(`❌ Failed to insert ${subjectName}:`, error.message);
      }
    }
  }

  console.log(`✅ Subject seeding processed. Inserted/Ensured ${addedCount} subjects.`);
  process.exit(0);
}

seedSubjects().catch((err) => {
  console.error('Fatal Error during seeding:', err);
  process.exit(1);
});
