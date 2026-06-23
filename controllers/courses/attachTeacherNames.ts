import { db } from '../../database/db';
import { users } from '../../database/schema';
import { sql, inArray } from 'drizzle-orm';

export const attachTeacherNames = async <T extends { teacher_id?: string | null }>(courseList: T[]) => {
  const teacherIds = Array.from(new Set(courseList.map((course) => course.teacher_id).filter(Boolean))) as string[];
  if (teacherIds.length === 0) return courseList.map((course) => ({ ...course, teacher_name: '' }));

  const teacherRows = await db.select({
    id: users.id,
    teacher_name: sql<string>`CONCAT(${users.firstName}, ' ', ${users.lastName})`,
  })
    .from(users)
    .where(inArray(users.id, teacherIds));

  const teacherNames = new Map(teacherRows.map((teacher) => [teacher.id, teacher.teacher_name]));
  return courseList.map((course) => ({
    ...course,
    teacher_name: course.teacher_id ? teacherNames.get(course.teacher_id) || '' : '',
  }));
};
