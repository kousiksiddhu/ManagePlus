// Module B — Goals. Designation goals (common to everyone with that
// designation) + individual goals layered on top per employee.
// Contract: docs/CONTRACTS.md section B.
import { Router, type NextFunction, type Request, type Response } from 'express';
import type { DesignationGoal, GoalStatus, IndividualGoal } from '../../shared/types';
import { DEFAULT_DESIGNATIONS } from '../../shared/types';
import { ApiError, assertCanManage, assertCanView, requireManager } from '../auth';
import { newId, SHEETS, store } from '../store';

const router = Router();

const GOAL_STATUSES: readonly GoalStatus[] = ['not_started', 'in_progress', 'completed'];

function trimmed(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function isValidIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00`).getTime());
}

function parseStatus(v: unknown): GoalStatus {
  const s = trimmed(v);
  if (!(GOAL_STATUSES as readonly string[]).includes(s)) {
    throw new ApiError(400, `Status must be one of: ${GOAL_STATUSES.join(', ')}`);
  }
  return s as GoalStatus;
}

function parseTargetDate(v: unknown): string {
  const s = trimmed(v);
  if (s && !isValidIsoDate(s)) throw new ApiError(400, 'Target date must be a valid YYYY-MM-DD date');
  return s;
}

function findDesignationGoal(id: string): DesignationGoal {
  const goal = store.designationGoals().find((g) => g.id === id);
  if (!goal) throw new ApiError(404, 'Designation goal not found');
  return goal;
}

function findIndividualGoal(id: string): IndividualGoal {
  const goal = store.individualGoals().find((g) => g.id === id);
  if (!goal) throw new ApiError(404, 'Individual goal not found');
  return goal;
}

// ---- designations ----------------------------------------------------------

/** All known designations: defaults ∪ employees ∪ designation goals, sorted. */
router.get('/designations', (_req: Request, res: Response, next: NextFunction) => {
  try {
    const set = new Set<string>(DEFAULT_DESIGNATIONS);
    for (const emp of store.employees()) {
      if (emp.designation) set.add(emp.designation);
    }
    for (const goal of store.designationGoals()) {
      if (goal.designation) set.add(goal.designation);
    }
    res.json({ designations: [...set].sort((a, b) => a.localeCompare(b)) });
  } catch (err) {
    next(err);
  }
});

// ---- designation goals -----------------------------------------------------

router.get('/goals/designation', (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ goals: store.designationGoals() });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/goals/designation',
  requireManager,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const designation = trimmed(body.designation);
      const title = trimmed(body.title);
      if (!designation) throw new ApiError(400, 'Designation is required');
      if (!title) throw new ApiError(400, 'Title is required');
      const goal: DesignationGoal = {
        id: newId('dg'),
        designation,
        title,
        description: trimmed(body.description),
        category: trimmed(body.category),
      };
      await store.insertRow(SHEETS.designationGoals, { ...goal });
      res.json({ goal });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/goals/designation/:id',
  requireManager,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const existing = findDesignationGoal(req.params.id);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const patch: Record<string, string> = {};
      if (body.designation !== undefined) {
        const designation = trimmed(body.designation);
        if (!designation) throw new ApiError(400, 'Designation cannot be empty');
        patch.designation = designation;
      }
      if (body.title !== undefined) {
        const title = trimmed(body.title);
        if (!title) throw new ApiError(400, 'Title cannot be empty');
        patch.title = title;
      }
      if (body.description !== undefined) patch.description = trimmed(body.description);
      if (body.category !== undefined) patch.category = trimmed(body.category);
      if (Object.keys(patch).length === 0) throw new ApiError(400, 'Nothing to update');
      await store.updateRow(SHEETS.designationGoals, existing.id, patch);
      res.json({ goal: findDesignationGoal(existing.id) });
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/goals/designation/:id',
  requireManager,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const existing = findDesignationGoal(req.params.id);
      await store.removeRow(SHEETS.designationGoals, existing.id);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// ---- effective goals per employee ------------------------------------------

/**
 * Both goal lists for one employee: the designation goals that apply to
 * everyone with their designation + their own individual goals.
 * Consumed by other modules (PersonPage) — keep the shape stable.
 */
router.get('/employees/:id/goals', (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id;
    assertCanView(req.actor, id);
    const employee = store.getEmployee(id);
    if (!employee) throw new ApiError(404, 'Employee not found');
    const designationGoals = store
      .designationGoals()
      .filter((g) => g.designation === employee.designation);
    const individualGoals = store.individualGoals().filter((g) => g.employeeId === id);
    res.json({ designationGoals, individualGoals });
  } catch (err) {
    next(err);
  }
});

// ---- individual goals --------------------------------------------------------

router.post('/employees/:id/goals', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id;
    assertCanManage(req.actor, id);
    const employee = store.getEmployee(id);
    if (!employee) throw new ApiError(404, 'Employee not found');
    const body = (req.body ?? {}) as Record<string, unknown>;
    const title = trimmed(body.title);
    if (!title) throw new ApiError(400, 'Title is required');
    const goal: IndividualGoal = {
      id: newId('ig'),
      employeeId: id,
      title,
      description: trimmed(body.description),
      category: trimmed(body.category),
      status: body.status === undefined || body.status === '' ? 'not_started' : parseStatus(body.status),
      targetDate: parseTargetDate(body.targetDate),
    };
    await store.insertRow(SHEETS.individualGoals, { ...goal });
    res.json({ goal });
  } catch (err) {
    next(err);
  }
});

router.patch('/goals/individual/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = findIndividualGoal(req.params.id);
    assertCanManage(req.actor, existing.employeeId);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const patch: Record<string, string> = {};
    if (body.title !== undefined) {
      const title = trimmed(body.title);
      if (!title) throw new ApiError(400, 'Title cannot be empty');
      patch.title = title;
    }
    if (body.description !== undefined) patch.description = trimmed(body.description);
    if (body.category !== undefined) patch.category = trimmed(body.category);
    if (body.status !== undefined) patch.status = parseStatus(body.status);
    if (body.targetDate !== undefined) patch.targetDate = parseTargetDate(body.targetDate);
    if (Object.keys(patch).length === 0) throw new ApiError(400, 'Nothing to update');
    await store.updateRow(SHEETS.individualGoals, existing.id, patch);
    res.json({ goal: findIndividualGoal(existing.id) });
  } catch (err) {
    next(err);
  }
});

router.delete('/goals/individual/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = findIndividualGoal(req.params.id);
    assertCanManage(req.actor, existing.employeeId);
    await store.removeRow(SHEETS.individualGoals, existing.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
