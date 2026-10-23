// Module D — feedback, skill/will snapshots, check-in status, person profile.
// Contract: docs/CONTRACTS.md section D.
import { Router } from 'express';
import type { EmployeeOut, Feedback, FeedbackOut, FeedbackType, SkillWillEntry } from '../../shared/types';
import { ApiError, assertCanManage, assertCanView, requireManager } from '../auth';
import { SHEETS, isoDate, newId, store } from '../store';

const router = Router();

const FEEDBACK_TYPES: FeedbackType[] = ['skill', 'learning', 'performance', 'continuous'];

// ---- helpers ---------------------------------------------------------------

function requireEmployee(id: string) {
  const employee = store.getEmployee(id);
  if (!employee) throw new ApiError(404, `Employee ${id} not found`);
  return employee;
}

function toFeedbackOut(f: Feedback): FeedbackOut {
  return {
    ...f,
    authorName: store.getEmployee(f.authorId)?.name ?? 'Unknown',
    goalTitle: store.goalTitle(f.goalId),
  };
}

function parseDateInput(value: unknown, fallback: string): string {
  if (value === undefined || value === null || value === '') return fallback;
  const s = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(new Date(`${s}T00:00:00`).getTime())) {
    throw new ApiError(400, 'Date must be a valid YYYY-MM-DD date');
  }
  return s;
}

function parseRating(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 5) {
    throw new ApiError(400, 'Rating must be a whole number from 1 to 5');
  }
  return n;
}

function parseScale(value: unknown, label: string): number {
  const n = Number(value);
  if (value === undefined || value === null || value === '' || !Number.isInteger(n) || n < 1 || n > 10) {
    throw new ApiError(400, `${label} must be a whole number from 1 to 10`);
  }
  return n;
}

/** Validate a tagged goal and derive its goalType (client-sent goalType is ignored). */
function resolveGoal(
  employeeId: string,
  goalId: unknown,
): { goalId: string | null; goalType: 'individual' | 'designation' | null } {
  const id = goalId === undefined || goalId === null ? '' : String(goalId);
  if (!id) return { goalId: null, goalType: null };
  const ig = store.individualGoals().find((g) => g.id === id);
  if (ig) {
    if (ig.employeeId !== employeeId) throw new ApiError(400, 'That goal belongs to a different employee');
    return { goalId: id, goalType: 'individual' };
  }
  if (store.designationGoals().some((g) => g.id === id)) return { goalId: id, goalType: 'designation' };
  throw new ApiError(400, 'Tagged goal not found');
}

/**
 * Apply a request body on top of a base Feedback entity, then cross-validate.
 * Used by both POST (base = fresh defaults) and PATCH (base = existing row).
 */
function applyFeedbackBody(base: Feedback, body: Record<string, unknown>): Feedback {
  const next: Feedback = { ...base };
  if ('type' in body) {
    const t = String(body.type ?? '');
    if (!FEEDBACK_TYPES.includes(t as FeedbackType)) {
      throw new ApiError(400, `Feedback type must be one of: ${FEEDBACK_TYPES.join(', ')}`);
    }
    next.type = t as FeedbackType;
  }
  if ('text' in body) next.text = String(body.text ?? '').trim();
  if ('skill' in body) next.skill = String(body.skill ?? '').trim();
  if ('date' in body) next.date = parseDateInput(body.date, base.date);
  if ('rating' in body) next.rating = parseRating(body.rating);
  if ('goalId' in body) {
    const resolved = resolveGoal(next.employeeId, body.goalId);
    next.goalId = resolved.goalId;
    next.goalType = resolved.goalType;
  }

  if (!next.text) throw new ApiError(400, 'Feedback text is required');
  if (next.type === 'skill' && !next.skill) throw new ApiError(400, 'Skill feedback needs a skill name');
  if (next.type !== 'skill') next.skill = '';
  if (next.type === 'continuous' && next.rating === null) {
    throw new ApiError(400, 'Continuous check-ins require a rating from 1 to 5');
  }
  if (next.type !== 'continuous' && next.type !== 'performance') next.rating = null;
  return next;
}

function feedbackRow(f: Feedback) {
  return {
    id: f.id,
    employeeId: f.employeeId,
    authorId: f.authorId,
    date: f.date,
    type: f.type,
    skill: f.skill,
    goalId: f.goalId ?? '',
    goalType: f.goalType ?? '',
    text: f.text,
    rating: f.rating ?? '',
  };
}

function findFeedback(id: string): Feedback {
  const entry = store.feedback().find((f) => f.id === id);
  if (!entry) throw new ApiError(404, `Feedback ${id} not found`);
  return entry;
}

function assertAuthorOrAdmin(actorRole: string, actorId: string, entry: Feedback, action: string): void {
  if (actorRole !== 'admin' && actorId !== entry.authorId) {
    throw new ApiError(403, `Only the author or an admin can ${action} this feedback`);
  }
}

// ---- person profile (identity header for PersonPage) ------------------------

router.get('/employees/:id/profile', (req, res, next) => {
  try {
    const employee = requireEmployee(req.params.id);
    assertCanView(req.actor, employee.employeeId);
    const mentorName = employee.mentorId ? (store.getEmployee(employee.mentorId)?.name ?? null) : null;
    res.json({ employee, mentorName });
  } catch (err) {
    next(err);
  }
});

// ---- feedback ---------------------------------------------------------------

router.get('/employees/:id/feedback', (req, res, next) => {
  try {
    const employee = requireEmployee(req.params.id);
    assertCanView(req.actor, employee.employeeId);
    const feedback = store
      .feedback()
      .filter((f) => f.employeeId === employee.employeeId)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .map(toFeedbackOut);
    res.json({ feedback });
  } catch (err) {
    next(err);
  }
});

router.post('/employees/:id/feedback', async (req, res, next) => {
  try {
    const employee = requireEmployee(req.params.id);
    assertCanManage(req.actor, employee.employeeId);
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (!('type' in body)) throw new ApiError(400, 'Feedback type is required');
    const base: Feedback = {
      id: newId('fb'),
      employeeId: employee.employeeId,
      authorId: req.actor.employeeId,
      date: isoDate(new Date()),
      type: 'performance',
      skill: '',
      goalId: null,
      goalType: null,
      text: '',
      rating: null,
    };
    const entry = applyFeedbackBody(base, body);
    await store.insertRow(SHEETS.feedback, feedbackRow(entry));
    res.json({ feedback: toFeedbackOut(entry) });
  } catch (err) {
    next(err);
  }
});

router.patch('/feedback/:id', async (req, res, next) => {
  try {
    const existing = findFeedback(req.params.id);
    assertAuthorOrAdmin(req.actor.role, req.actor.employeeId, existing, 'edit');
    const entry = applyFeedbackBody(existing, (req.body ?? {}) as Record<string, unknown>);
    await store.updateRow(SHEETS.feedback, entry.id, feedbackRow(entry));
    res.json({ feedback: toFeedbackOut(entry) });
  } catch (err) {
    next(err);
  }
});

router.delete('/feedback/:id', async (req, res, next) => {
  try {
    const existing = findFeedback(req.params.id);
    assertAuthorOrAdmin(req.actor.role, req.actor.employeeId, existing, 'delete');
    await store.removeRow(SHEETS.feedback, existing.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---- skill / will snapshots ---------------------------------------------------

router.get('/employees/:id/skillwill', (req, res, next) => {
  try {
    const employee = requireEmployee(req.params.id);
    assertCanView(req.actor, employee.employeeId);
    const entries = store
      .skillWill()
      .filter((e) => e.employeeId === employee.employeeId)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    res.json({ entries });
  } catch (err) {
    next(err);
  }
});

router.post('/employees/:id/skillwill', async (req, res, next) => {
  try {
    const employee = requireEmployee(req.params.id);
    assertCanManage(req.actor, employee.employeeId);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const entry: SkillWillEntry = {
      id: newId('sw'),
      employeeId: employee.employeeId,
      date: parseDateInput(body.date, isoDate(new Date())),
      skill: parseScale(body.skill, 'Skill'),
      will: parseScale(body.will, 'Will'),
      notes: String(body.notes ?? '').trim(),
    };
    await store.insertRow(SHEETS.skillWill, { ...entry });
    res.json({ entry });
  } catch (err) {
    next(err);
  }
});

router.get('/skillwill/consolidated', requireManager, (req, res, next) => {
  try {
    const entries = store.skillWill();
    const points: Array<{ employee: EmployeeOut; skill: number; will: number; date: string }> = [];
    for (const id of store.visibleIds(req.actor)) {
      if (id === req.actor.employeeId) continue;
      const latest = entries
        .filter((e) => e.employeeId === id)
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
        .pop();
      const employee = store.getEmployee(id);
      if (latest && employee) {
        points.push({ employee, skill: latest.skill, will: latest.will, date: latest.date });
      }
    }
    res.json({ points });
  } catch (err) {
    next(err);
  }
});

// ---- check-in status ----------------------------------------------------------

router.get('/employees/:id/checkin', (req, res, next) => {
  try {
    const employee = requireEmployee(req.params.id);
    assertCanView(req.actor, employee.employeeId);
    res.json(store.checkinStatus(employee.employeeId));
  } catch (err) {
    next(err);
  }
});

export default router;
