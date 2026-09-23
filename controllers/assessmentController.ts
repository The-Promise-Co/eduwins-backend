import { Request, Response } from 'express';
import { db } from '../database/db';
import {
  assessments,
  assessmentQuestions,
  assessmentAssignments,
  assessmentAttempts,
  users,
  children,
} from '../database/schema';
import { eq, and, desc, ilike, or, inArray } from 'drizzle-orm';
import logger from '../utils/logger';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    role: string;
  };
}

function genId() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 8);
}

type QuestionType = 'mcq_single' | 'true_false' | 'short_answer';

interface QuestionInput {
  id?: string;
  prompt: string;
  type: QuestionType;
  marks?: number;
  options?: Array<{ id: string; label: string }>;
  correctOptionId?: string;
  correctBoolean?: boolean;
}

const toQuestionDTO = (q: typeof assessmentQuestions.$inferSelect) => ({
  id: q.id,
  prompt: q.prompt,
  type: q.type,
  marks: q.marks,
  options: (q.options as Array<{ id: string; label: string }> | null) || undefined,
  correctOptionId: q.correctOptionId || undefined,
  correctBoolean: q.correctBoolean ?? undefined,
});

async function getAssessmentWithQuestions(assessmentId: string) {
  const rows = await db.select().from(assessments).where(eq(assessments.id, assessmentId));
  if (rows.length === 0) return null;
  const a = rows[0];
  const qs = await db
    .select()
    .from(assessmentQuestions)
    .where(eq(assessmentQuestions.assessmentId, assessmentId))
    .orderBy(assessmentQuestions.orderIndex);
  return {
    id: a.id,
    title: a.title,
    subject: a.subject,
    description: a.description,
    durationMinutes: a.durationMinutes,
    totalMarks: a.totalMarks,
    dueAt: a.dueAt ? a.dueAt.toISOString() : null,
    status: a.status,
    questions: qs.map(toQuestionDTO),
    createdBy: a.createdBy,
    createdAt: a.createdAt ? a.createdAt.toISOString() : undefined,
    updatedAt: a.updatedAt ? a.updatedAt.toISOString() : undefined,
  };
}

async function resolveAssigneeName(assigneeType: string, assigneeId: string) {
  if (assigneeType === 'parent') {
    const rows = await db.select().from(users).where(eq(users.id, assigneeId));
    if (rows.length === 0) return null;
    return { name: `${rows[0].firstName} ${rows[0].lastName}`.trim(), email: rows[0].email };
  }
  const rows = await db.select().from(children).where(eq(children.id, assigneeId));
  if (rows.length === 0) return null;
  const c = rows[0];
  const u = await db.select().from(users).where(eq(users.id, c.userId));
  return {
    name: `${c.firstName} ${c.lastName}`.trim(),
    email: u.length > 0 ? u[0].email : '',
  };
}

async function toAssignmentDTO(a: typeof assessmentAssignments.$inferSelect) {
  const resolved = await resolveAssigneeName(a.assigneeType, a.assigneeId);
  const asm = await db.select().from(assessments).where(eq(assessments.id, a.assessmentId));
  return {
    id: a.id,
    assessmentId: a.assessmentId,
    assigneeType: a.assigneeType,
    assigneeId: a.assigneeId,
    assigneeName: resolved?.name || 'Invited learner',
    assigneeEmail: resolved?.email || '',
    dueAt: a.dueAt ? a.dueAt.toISOString() : null,
    status: a.status,
    score: a.score,
    attemptId: a.attemptId,
    startedAt: a.startedAt ? a.startedAt.toISOString() : null,
    submittedAt: a.submittedAt ? a.submittedAt.toISOString() : null,
    createdAt: a.createdAt ? a.createdAt.toISOString() : undefined,
    assessmentTitle: asm.length > 0 ? asm[0].title : '',
    assessmentSubject: asm.length > 0 ? asm[0].subject : '',
    assessmentDurationMinutes: asm.length > 0 ? asm[0].durationMinutes : 0,
  };
}

const toAttemptDTO = (t: typeof assessmentAttempts.$inferSelect) => ({
  id: t.id,
  assessmentId: t.assessmentId,
  assignmentId: t.assignmentId,
  answers: (t.answers as Record<string, string>) || {},
  score: t.score,
  status: t.status,
  startedAt: t.startedAt ? t.startedAt.toISOString() : new Date().toISOString(),
  submittedAt: t.submittedAt ? t.submittedAt.toISOString() : null,
});

function autoGrade(
  questions: Array<{ id: string; type: string; marks: number; correctOptionId: string | null; correctBoolean: boolean | null }>,
  answers: Record<string, string>,
) {
  let score = 0;
  let pending = false;
  for (const q of questions) {
    const given = (answers[q.id] || '').trim();
    if (q.type === 'mcq_single') {
      if (given && given === q.correctOptionId) score += q.marks;
    } else if (q.type === 'true_false') {
      if (given !== '' && String(q.correctBoolean) === given) score += q.marks;
    } else if (given) {
      pending = true;
    }
  }
  return { score, pending };
}

/** Parent acting for themselves or for one of their children; students for themselves. */
async function canAccessAssignment(userId: string, role: string, a: typeof assessmentAssignments.$inferSelect) {
  if (role === 'admin') return true;
  if (a.assigneeType === 'parent' && a.assigneeId === userId) return true;
  if (a.assigneeType === 'child') {
    if (role === 'student') {
      const rows = await db.select().from(children).where(eq(children.id, a.assigneeId));
      if (rows.length > 0 && rows[0].userId === userId) return true;
    } else if (role === 'parent') {
      const rows = await db
        .select()
        .from(children)
        .where(and(eq(children.id, a.assigneeId), eq(children.parentId, userId)));
      if (rows.length > 0) return true;
    }
  }
  return false;
}

async function requireTeacherOwner(assessmentId: string, userId: string, role: string) {
  if (role === 'admin') return true;
  const rows = await db.select().from(assessments).where(eq(assessments.id, assessmentId));
  if (rows.length === 0) return null;
  return rows[0].createdBy === userId;
}

/* ------------------------------------------------------------------ */
/* Assessments                                                           */
/* ------------------------------------------------------------------ */

/**
 * GET /api/assessments?status=&search=
 * Teachers see their own; parents see published; admins see all.
 */
export const listAssessments = async (req: AuthenticatedRequest, res: Response) => {
  const { status, search } = req.query as { status?: string; search?: string };
  try {
    const conditions = [];
    if (req.user.role === 'teacher') {
      conditions.push(eq(assessments.createdBy, req.user.id));
    } else if (req.user.role === 'parent' || req.user.role === 'student') {
      conditions.push(eq(assessments.status, 'published'));
    }
    if (status && status !== 'all') conditions.push(eq(assessments.status, status));
    if (search) {
      conditions.push(or(ilike(assessments.title, `%${search}%`), ilike(assessments.subject, `%${search}%`))!);
    }
    const rows = await db
      .select()
      .from(assessments)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(assessments.createdAt));
    const data = await Promise.all(rows.map((r) => getAssessmentWithQuestions(r.id)));
    res.json({ assessments: data });
  } catch (err) {
    logger.error({ err }, 'Failed to list assessments');
    res.status(500).json({ error: 'Failed to list assessments' });
  }
};

/**
 * POST /api/assessments
 * Teacher creates a draft with questions.
 */
export const createAssessment = async (req: AuthenticatedRequest, res: Response) => {
  if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only teachers can create assessments' });
  }
  const { title, subject, description, durationMinutes, dueAt, questions } = req.body as {
    title?: string;
    subject?: string;
    description?: string;
    durationMinutes?: number;
    dueAt?: string;
    questions?: QuestionInput[];
  };
  if (!title?.trim() || !subject?.trim()) {
    return res.status(400).json({ error: 'Title and subject are required' });
  }
  if (!Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ error: 'At least one question is required' });
  }
  try {
    const id = genId();
    const totalMarks = questions.reduce((s, q) => s + (Number(q.marks) || 0), 0);
    await db.insert(assessments).values({
      id,
      createdBy: req.user.id,
      title: title.trim(),
      subject: subject.trim(),
      description: description?.trim() || null,
      durationMinutes: Number(durationMinutes) || 30,
      totalMarks,
      dueAt: dueAt ? new Date(dueAt) : null,
      status: 'draft',
    });
    await db.insert(assessmentQuestions).values(
      questions.map((q, i) => ({
        id: q.id || genId(),
        assessmentId: id,
        prompt: q.prompt,
        type: q.type,
        marks: Number(q.marks) || 1,
        options: q.options || null,
        correctOptionId: q.correctOptionId || null,
        correctBoolean: q.correctBoolean ?? null,
        orderIndex: i,
      })),
    );
    const created = await getAssessmentWithQuestions(id);
    res.status(201).json(created);
  } catch (err) {
    logger.error({ err }, 'Failed to create assessment');
    res.status(500).json({ error: 'Failed to create assessment' });
  }
};

/**
 * GET /api/assessments/lookup?email=
 * Teacher resolves a parent user or a child record by email.
 */
export const lookupAssignee = async (req: AuthenticatedRequest, res: Response) => {
  if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only teachers can look up assignees' });
  }
  const email = ((req.query.email as string) || '').trim().toLowerCase();
  if (!email.includes('@')) return res.json({ result: null });
  try {
    const matched = await db.select().from(users).where(eq(users.email, email));
    if (matched.length > 0) {
      const u = matched[0];
      if (u.role === 'student') {
        const cRows = await db.select().from(children).where(eq(children.userId, u.id));
        if (cRows.length > 0) {
          const c = cRows[0];
          return res.json({
            result: {
              kind: 'child',
              id: c.id,
              name: `${c.firstName} ${c.lastName}`.trim(),
              email: u.email,
            },
          });
        }
      }
      return res.json({
        result: { kind: 'parent', id: u.id, name: `${u.firstName} ${u.lastName}`.trim(), email: u.email },
      });
    }
    return res.json({ result: null });
  } catch (err) {
    logger.error({ err }, 'Failed to look up assignee');
    res.status(500).json({ error: 'Failed to look up assignee' });
  }
};

/**
 * GET /api/assessments/my-assignments
 * Parent: own + children's non-revoked assignments. Students: own.
 */
export const myAssignments = async (req: AuthenticatedRequest, res: Response) => {
  try {
    let rows: Array<typeof assessmentAssignments.$inferSelect> = [];
    if (req.user.role === 'parent') {
      const myChildren = await db.select().from(children).where(eq(children.parentId, req.user.id));
      const childIds = myChildren.map((c) => c.id);
      const ors = [and(eq(assessmentAssignments.assigneeType, 'parent'), eq(assessmentAssignments.assigneeId, req.user.id))!];
      if (childIds.length > 0) {
        ors.push(and(eq(assessmentAssignments.assigneeType, 'child'), inArray(assessmentAssignments.assigneeId, childIds))!);
      }
      rows = await db
        .select()
        .from(assessmentAssignments)
        .where(or(...ors))
        .orderBy(desc(assessmentAssignments.createdAt));
    } else if (req.user.role === 'student') {
      const cRows = await db.select().from(children).where(eq(children.userId, req.user.id));
      const ors = [and(eq(assessmentAssignments.assigneeType, 'parent'), eq(assessmentAssignments.assigneeId, req.user.id))!];
      if (cRows.length > 0) {
        ors.push(eq(assessmentAssignments.assigneeId, cRows[0].id)!);
      }
      rows = await db
        .select()
        .from(assessmentAssignments)
        .where(or(...ors))
        .orderBy(desc(assessmentAssignments.createdAt));
    } else if (req.user.role === 'admin') {
      rows = await db.select().from(assessmentAssignments).orderBy(desc(assessmentAssignments.createdAt));
    } else {
      return res.status(403).json({ error: 'Not allowed' });
    }
    const visible = rows.filter((r) => r.status !== 'revoked');
    res.json({ assignments: await Promise.all(visible.map(toAssignmentDTO)) });
  } catch (err) {
    logger.error({ err }, 'Failed to fetch assignments');
    res.status(500).json({ error: 'Failed to fetch assignments' });
  }
};

/**
 * GET /api/assessments/:id
 * Owner teacher, admin, or an assignee.
 */
export const getAssessment = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  try {
    const rows = await db.select().from(assessments).where(eq(assessments.id, id));
    if (rows.length === 0) return res.status(404).json({ error: 'Assessment not found' });
    const a = rows[0];
    const isOwner = a.createdBy === req.user.id || req.user.role === 'admin';
    if (!isOwner) {
      const assigned = await db
        .select()
        .from(assessmentAssignments)
        .where(eq(assessmentAssignments.assessmentId, id));
      let allowed = false;
      for (const asg of assigned) {
        if (await canAccessAssignment(req.user.id, req.user.role, asg)) {
          allowed = true;
          break;
        }
      }
      if (!allowed) return res.status(403).json({ error: 'Not allowed' });
    }
    res.json(await getAssessmentWithQuestions(id));
  } catch (err) {
    logger.error({ err }, 'Failed to fetch assessment');
    res.status(500).json({ error: 'Failed to fetch assessment' });
  }
};

/**
 * PUT /api/assessments/:id
 * Owner teacher, draft only. Replaces the question set.
 */
export const updateAssessment = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  try {
    const owned = await requireTeacherOwner(id, req.user.id, req.user.role);
    if (owned === null) return res.status(404).json({ error: 'Assessment not found' });
    if (!owned) return res.status(403).json({ error: 'Not allowed' });
    const current = await db.select().from(assessments).where(eq(assessments.id, id));
    if (current[0].status !== 'draft') {
      return res.status(400).json({ error: 'Only drafts can be edited' });
    }
    const { title, subject, description, durationMinutes, dueAt, questions } = req.body as {
      title?: string;
      subject?: string;
      description?: string;
      durationMinutes?: number;
      dueAt?: string | null;
      questions?: QuestionInput[];
    };
    const patch: Partial<typeof assessments.$inferInsert> = { updatedAt: new Date() };
    if (title !== undefined) patch.title = title;
    if (subject !== undefined) patch.subject = subject;
    if (description !== undefined) patch.description = description || null;
    if (durationMinutes !== undefined) patch.durationMinutes = Number(durationMinutes);
    if (dueAt !== undefined) patch.dueAt = dueAt ? new Date(dueAt) : null;
    if (questions !== undefined) {
      patch.totalMarks = questions.reduce((s, q) => s + (Number(q.marks) || 0), 0);
    }
    await db.update(assessments).set(patch).where(eq(assessments.id, id));
    if (questions !== undefined) {
      await db.delete(assessmentQuestions).where(eq(assessmentQuestions.assessmentId, id));
      if (questions.length > 0) {
        await db.insert(assessmentQuestions).values(
          questions.map((q, i) => ({
            id: q.id || genId(),
            assessmentId: id,
            prompt: q.prompt,
            type: q.type,
            marks: Number(q.marks) || 1,
            options: q.options || null,
            correctOptionId: q.correctOptionId || null,
            correctBoolean: q.correctBoolean ?? null,
            orderIndex: i,
          })),
        );
      }
    }
    res.json(await getAssessmentWithQuestions(id));
  } catch (err) {
    logger.error({ err }, 'Failed to update assessment');
    res.status(500).json({ error: 'Failed to update assessment' });
  }
};

/**
 * POST /api/assessments/:id/publish
 * Owner teacher moves draft → published.
 */
export const publishAssessment = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  try {
    const owned = await requireTeacherOwner(id, req.user.id, req.user.role);
    if (owned === null) return res.status(404).json({ error: 'Assessment not found' });
    if (!owned) return res.status(403).json({ error: 'Not allowed' });
    await db.update(assessments).set({ status: 'published', updatedAt: new Date() }).where(eq(assessments.id, id));
    res.json(await getAssessmentWithQuestions(id));
  } catch (err) {
    logger.error({ err }, 'Failed to publish assessment');
    res.status(500).json({ error: 'Failed to publish assessment' });
  }
};

/* ------------------------------------------------------------------ */
/* Assignments                                                           */
/* ------------------------------------------------------------------ */

/**
 * GET /api/assessments/:id/assignments
 * Owner teacher sees all invites with attempt linkage.
 */
export const listAssignments = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  try {
    const owned = await requireTeacherOwner(id, req.user.id, req.user.role);
    if (owned === null) return res.status(404).json({ error: 'Assessment not found' });
    if (!owned) return res.status(403).json({ error: 'Not allowed' });
    const rows = await db
      .select()
      .from(assessmentAssignments)
      .where(eq(assessmentAssignments.assessmentId, id))
      .orderBy(desc(assessmentAssignments.createdAt));
    res.json({ assignments: await Promise.all(rows.map(toAssignmentDTO)) });
  } catch (err) {
    logger.error({ err }, 'Failed to list assignments');
    res.status(500).json({ error: 'Failed to list assignments' });
  }
};

/**
 * POST /api/assessments/:id/assignments
 * Owner teacher invites a parent or child. Auto-assigned, no accept step.
 */
export const inviteAssignment = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { assigneeType, assigneeId, dueAt } = req.body as {
    assigneeType?: string;
    assigneeId?: string;
    dueAt?: string;
  };
  if (assigneeType !== 'parent' && assigneeType !== 'child') {
    return res.status(400).json({ error: 'assigneeType must be parent or child' });
  }
  if (!assigneeId) return res.status(400).json({ error: 'assigneeId is required' });
  try {
    const owned = await requireTeacherOwner(id, req.user.id, req.user.role);
    if (owned === null) return res.status(404).json({ error: 'Assessment not found' });
    if (!owned) return res.status(403).json({ error: 'Not allowed' });
    const resolved = await resolveAssigneeName(assigneeType, assigneeId);
    if (!resolved) return res.status(404).json({ error: 'Assignee not found' });
    const assignmentId = genId();
    await db.insert(assessmentAssignments).values({
      id: assignmentId,
      assessmentId: id,
      assigneeType,
      assigneeId,
      dueAt: dueAt ? new Date(dueAt) : null,
      status: 'assigned',
    });
    const rows = await db.select().from(assessmentAssignments).where(eq(assessmentAssignments.id, assignmentId));
    res.status(201).json(await toAssignmentDTO(rows[0]));
  } catch (err) {
    logger.error({ err }, 'Failed to create assignment');
    res.status(500).json({ error: 'Failed to create assignment' });
  }
};

/**
 * DELETE /api/assessments/:id/assignments/:assignmentId
 * Owner teacher revokes. Blocked once submitted/graded; row kept for audit.
 */
export const revokeAssignment = async (req: AuthenticatedRequest, res: Response) => {
  const { id, assignmentId } = req.params;
  try {
    const owned = await requireTeacherOwner(id, req.user.id, req.user.role);
    if (owned === null) return res.status(404).json({ error: 'Assessment not found' });
    if (!owned) return res.status(403).json({ error: 'Not allowed' });
    const rows = await db
      .select()
      .from(assessmentAssignments)
      .where(and(eq(assessmentAssignments.id, assignmentId), eq(assessmentAssignments.assessmentId, id)));
    if (rows.length === 0) return res.status(404).json({ error: 'Invite not found' });
    if (rows[0].status === 'submitted' || rows[0].status === 'graded') {
      return res.status(400).json({ error: 'Submitted assessments cannot be revoked' });
    }
    await db
      .update(assessmentAssignments)
      .set({ status: 'revoked', updatedAt: new Date() })
      .where(eq(assessmentAssignments.id, assignmentId));
    res.json({ revoked: true });
  } catch (err) {
    logger.error({ err }, 'Failed to revoke assignment');
    res.status(500).json({ error: 'Failed to revoke assignment' });
  }
};

/* ------------------------------------------------------------------ */
/* Attempts                                                              */
/* ------------------------------------------------------------------ */

/**
 * POST /api/assessments/:id/attempts { assignmentId }
 * Assignee starts (or resumes) their attempt. Revoked invites rejected.
 */
export const startAttempt = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { assignmentId } = req.body as { assignmentId?: string };
  if (!assignmentId) return res.status(400).json({ error: 'assignmentId is required' });
  try {
    const asgRows = await db
      .select()
      .from(assessmentAssignments)
      .where(and(eq(assessmentAssignments.id, assignmentId), eq(assessmentAssignments.assessmentId, id)));
    if (asgRows.length === 0) return res.status(404).json({ error: 'Invite not found' });
    const asg = asgRows[0];
    if (!(await canAccessAssignment(req.user.id, req.user.role, asg))) {
      return res.status(403).json({ error: 'Not allowed' });
    }
    if (asg.status === 'revoked') return res.status(403).json({ error: 'This invite was revoked' });
    if (asg.status === 'submitted' || asg.status === 'graded') {
      return res.status(400).json({ error: 'Assessment already submitted' });
    }
    const existing = await db
      .select()
      .from(assessmentAttempts)
      .where(
        and(
          eq(assessmentAttempts.assignmentId, assignmentId),
          eq(assessmentAttempts.status, 'in_progress'),
        ),
      );
    if (existing.length > 0) return res.json(toAttemptDTO(existing[0]));
    const attemptId = genId();
    await db.insert(assessmentAttempts).values({
      id: attemptId,
      assessmentId: id,
      assignmentId,
      answers: {},
      status: 'in_progress',
    });
    await db
      .update(assessmentAssignments)
      .set({ status: 'started', attemptId, startedAt: new Date(), updatedAt: new Date() })
      .where(eq(assessmentAssignments.id, assignmentId));
    const rows = await db.select().from(assessmentAttempts).where(eq(assessmentAttempts.id, attemptId));
    res.status(201).json(toAttemptDTO(rows[0]));
  } catch (err) {
    logger.error({ err }, 'Failed to start attempt');
    res.status(500).json({ error: 'Failed to start attempt' });
  }
};

async function loadAttemptWithAccess(attemptId: string, userId: string, role: string) {
  const tRows = await db.select().from(assessmentAttempts).where(eq(assessmentAttempts.id, attemptId));
  if (tRows.length === 0) return { error: 'Attempt not found' as const };
  const attempt = tRows[0];
  const asgRows = await db.select().from(assessmentAssignments).where(eq(assessmentAssignments.id, attempt.assignmentId));
  if (asgRows.length === 0) return { error: 'Attempt not found' as const };
  const asg = asgRows[0];
  if (role !== 'admin') {
    const asmRows = await db.select().from(assessments).where(eq(assessments.id, attempt.assessmentId));
    const isOwner = asmRows.length > 0 && asmRows[0].createdBy === userId;
    if (!isOwner && !(await canAccessAssignment(userId, role, asg))) {
      return { error: 'Not allowed' as const };
    }
  }
  return { attempt, assignment: asg };
}

/**
 * GET /api/attempts/:attemptId — assignee or owner teacher.
 */
export const getAttempt = async (req: AuthenticatedRequest, res: Response) => {
  const { attemptId } = req.params;
  try {
    const loaded = await loadAttemptWithAccess(attemptId, req.user.id, req.user.role);
    if ('error' in loaded) {
      return res.status(loaded.error === 'Attempt not found' ? 404 : 403).json({ error: loaded.error });
    }
    res.json(toAttemptDTO(loaded.attempt));
  } catch (err) {
    logger.error({ err }, 'Failed to fetch attempt');
    res.status(500).json({ error: 'Failed to fetch attempt' });
  }
};

/**
 * PUT /api/attempts/:attemptId/answers — assignee autosave, in-progress only.
 */
export const saveAttemptAnswers = async (req: AuthenticatedRequest, res: Response) => {
  const { attemptId } = req.params;
  const { answers } = req.body as { answers?: Record<string, string> };
  try {
    const loaded = await loadAttemptWithAccess(attemptId, req.user.id, req.user.role);
    if ('error' in loaded) {
      return res.status(loaded.error === 'Attempt not found' ? 404 : 403).json({ error: loaded.error });
    }
    if (loaded.attempt.status !== 'in_progress') {
      return res.status(400).json({ error: 'Attempt is no longer in progress' });
    }
    if (loaded.assignment.status === 'revoked') {
      return res.status(403).json({ error: 'This invite was revoked' });
    }
    await db
      .update(assessmentAttempts)
      .set({ answers: answers || {}, updatedAt: new Date() })
      .where(eq(assessmentAttempts.id, attemptId));
    const rows = await db.select().from(assessmentAttempts).where(eq(assessmentAttempts.id, attemptId));
    res.json(toAttemptDTO(rows[0]));
  } catch (err) {
    logger.error({ err }, 'Failed to save answers');
    res.status(500).json({ error: 'Failed to save answers' });
  }
};

/**
 * POST /api/attempts/:attemptId/submit
 * Server auto-grades mcq/true-false; any answered short-answer → submitted
 * (pending manual grade), otherwise graded. submittedAt is server-set.
 */
export const submitAttempt = async (req: AuthenticatedRequest, res: Response) => {
  const { attemptId } = req.params;
  const { answers } = req.body as { answers?: Record<string, string> };
  try {
    const loaded = await loadAttemptWithAccess(attemptId, req.user.id, req.user.role);
    if ('error' in loaded) {
      return res.status(loaded.error === 'Attempt not found' ? 404 : 403).json({ error: loaded.error });
    }
    const { attempt, assignment } = loaded;
    if (attempt.status !== 'in_progress') {
      return res.status(400).json({ error: 'Attempt already submitted' });
    }
    if (assignment.status === 'revoked') {
      return res.status(403).json({ error: 'This invite was revoked' });
    }
    const finalAnswers = answers || (attempt.answers as Record<string, string>) || {};
    const qs = await db
      .select()
      .from(assessmentQuestions)
      .where(eq(assessmentQuestions.assessmentId, attempt.assessmentId));
    const { score, pending } = autoGrade(
      qs.map((q) => ({ id: q.id, type: q.type, marks: q.marks, correctOptionId: q.correctOptionId, correctBoolean: q.correctBoolean })),
      finalAnswers,
    );
    const status = pending ? 'submitted' : 'graded';
    const submittedAt = new Date();
    await db
      .update(assessmentAttempts)
      .set({ answers: finalAnswers, score, status, submittedAt, updatedAt: new Date() })
      .where(eq(assessmentAttempts.id, attemptId));
    await db
      .update(assessmentAssignments)
      .set({ status, score, attemptId, submittedAt, updatedAt: new Date() })
      .where(eq(assessmentAssignments.id, attempt.assignmentId));
    const rows = await db.select().from(assessmentAttempts).where(eq(assessmentAttempts.id, attemptId));
    res.json(toAttemptDTO(rows[0]));
  } catch (err) {
    logger.error({ err }, 'Failed to submit attempt');
    res.status(500).json({ error: 'Failed to submit attempt' });
  }
};

/**
 * PATCH /api/attempts/:attemptId/grade { scores }
 * Owner teacher grades short answers. Total = recomputed auto + manual.
 */
export const gradeAttempt = async (req: AuthenticatedRequest, res: Response) => {
  const { attemptId } = req.params;
  const { scores } = req.body as { scores?: Record<string, number> };
  try {
    const loaded = await loadAttemptWithAccess(attemptId, req.user.id, req.user.role);
    if ('error' in loaded) {
      return res.status(loaded.error === 'Attempt not found' ? 404 : 403).json({ error: loaded.error });
    }
    const asmRows = await db.select().from(assessments).where(eq(assessments.id, loaded.attempt.assessmentId));
    const isOwner =
      req.user.role === 'admin' || (asmRows.length > 0 && asmRows[0].createdBy === req.user.id);
    if (!isOwner) return res.status(403).json({ error: 'Only the teacher can grade' });
    const qs = await db
      .select()
      .from(assessmentQuestions)
      .where(eq(assessmentQuestions.assessmentId, loaded.attempt.assessmentId));
    const stored = (loaded.attempt.answers as Record<string, string>) || {};
    let auto = 0;
    for (const q of qs) {
      if (q.type === 'short_answer') continue;
      const given = (stored[q.id] || '').trim();
      if (q.type === 'mcq_single' && given && given === q.correctOptionId) auto += q.marks;
      if (q.type === 'true_false' && given !== '' && String(q.correctBoolean) === given) auto += q.marks;
    }
    const manual = Object.values(scores || {}).reduce((s, v) => s + (Number(v) || 0), 0);
    const total = auto + manual;
    await db
      .update(assessmentAttempts)
      .set({ score: total, status: 'graded', updatedAt: new Date() })
      .where(eq(assessmentAttempts.id, attemptId));
    await db
      .update(assessmentAssignments)
      .set({ status: 'graded', score: total, updatedAt: new Date() })
      .where(eq(assessmentAssignments.id, loaded.attempt.assignmentId));
    const rows = await db.select().from(assessmentAttempts).where(eq(assessmentAttempts.id, attemptId));
    res.json(toAttemptDTO(rows[0]));
  } catch (err) {
    logger.error({ err }, 'Failed to grade attempt');
    res.status(500).json({ error: 'Failed to grade attempt' });
  }
};
