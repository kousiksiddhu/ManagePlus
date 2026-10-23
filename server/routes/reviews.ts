// Module C — review cycle calendar API. Contract: docs/CONTRACTS.md §C.
import { Router, type NextFunction, type Request, type Response } from 'express';
import type { ReviewCycle, ReviewCycleOut, ReviewStatus } from '../../shared/types';
import { ApiError, assertCanManage, assertCanView, requireManager } from '../auth';
import { newId, SHEETS, store, type Row } from '../store';

const router = Router();

const STATUSES: ReviewStatus[] = ['not_started', 'in_progress', 'completed'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(value: unknown, field: string): string {
  const s = String(value ?? '').trim();
  if (!DATE_RE.test(s) || Number.isNaN(new Date(`${s}T00:00:00`).getTime())) {
    throw new ApiError(400, `${field} must be a valid date (YYYY-MM-DD)`);
  }
  return s;
}

function parseStatus(value: unknown): ReviewStatus {
  const s = String(value ?? '').trim() as ReviewStatus;
  if (!STATUSES.includes(s)) {
    throw new ApiError(400, `status must be one of: ${STATUSES.join(', ')}`);
  }
  return s;
}

/** Join employee name + designation onto a cycle. */
function toOut(cycle: ReviewCycle): ReviewCycleOut {
  const emp = store.getEmployee(cycle.employeeId);
  return {
    ...cycle,
    employeeName: emp?.name ?? 'Unknown',
    designation: emp?.designation ?? '',
  };
}

function getCycleOr404(id: string): ReviewCycle {
  const cycle = store.reviewCycles().find((c) => c.id === id);
  if (!cycle) throw new ApiError(404, 'Review cycle not found');
  return cycle;
}

// GET /api/reviews?year=2026 — cycles overlapping the year for visible
// employees (manager: subtree; admin: everyone), joined with name/designation.
router.get('/reviews', requireManager, (req: Request, res: Response, next: NextFunction) => {
  try {
    const raw = req.query.year !== undefined ? String(req.query.year) : String(new Date().getFullYear());
    const year = Number(raw);
    if (!Number.isInteger(year) || year < 1900 || year > 9999) {
      throw new ApiError(400, 'year must be a valid 4-digit year');
    }
    const visible = new Set(
      req.actor.role === 'admin'
        ? store.employees().map((e) => e.employeeId)
        : store.subtreeIds(req.actor.employeeId),
    );
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    const cycles = store
      .reviewCycles()
      .filter((c) => visible.has(c.employeeId) && c.startDate <= yearEnd && c.endDate >= yearStart)
      .map(toOut)
      .sort(
        (a, b) =>
          a.employeeName.localeCompare(b.employeeName) || a.startDate.localeCompare(b.startDate),
      );
    res.json({ cycles });
  } catch (err) {
    next(err);
  }
});

// POST /api/reviews — create a cycle for an employee the actor manages.
router.post('/reviews', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const employeeId = String(body.employeeId ?? '').trim();
    if (!employeeId) throw new ApiError(400, 'employeeId is required');
    assertCanManage(req.actor, employeeId);
    if (!store.getEmployee(employeeId)) throw new ApiError(404, 'Employee not found');

    const name = String(body.name ?? '').trim();
    if (!name) throw new ApiError(400, 'Cycle name is required');
    const startDate = parseDate(body.startDate, 'startDate');
    const endDate = parseDate(body.endDate, 'endDate');
    if (startDate > endDate) throw new ApiError(400, 'Start date must be on or before end date');
    const status = body.status !== undefined && body.status !== '' ? parseStatus(body.status) : 'not_started';
    const notes = String(body.notes ?? '');

    const row: Row = {
      id: newId('rc'),
      employeeId,
      name,
      startDate,
      endDate,
      status,
      rating: '',
      notes,
    };
    await store.insertRow(SHEETS.reviewCycles, row);
    res.json({ cycle: toOut(getCycleOr404(String(row.id))) });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/reviews/:id — edit name/dates/status/rating/notes.
router.patch('/reviews/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = getCycleOr404(req.params.id);
    assertCanManage(req.actor, existing.employeeId);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const patch: Row = {};

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) throw new ApiError(400, 'Cycle name cannot be empty');
      patch.name = name;
    }
    if (body.startDate !== undefined) patch.startDate = parseDate(body.startDate, 'startDate');
    if (body.endDate !== undefined) patch.endDate = parseDate(body.endDate, 'endDate');
    const nextStart = String(patch.startDate ?? existing.startDate);
    const nextEnd = String(patch.endDate ?? existing.endDate);
    if (nextStart > nextEnd) throw new ApiError(400, 'Start date must be on or before end date');

    if (body.status !== undefined) patch.status = parseStatus(body.status);
    const nextStatus = String(patch.status ?? existing.status) as ReviewStatus;

    if (body.rating !== undefined && body.rating !== null && body.rating !== '') {
      const rating = Number(body.rating);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        throw new ApiError(400, 'Rating must be an integer from 1 to 5');
      }
      if (nextStatus !== 'completed') {
        throw new ApiError(400, 'Rating can only be set on a completed review');
      }
      patch.rating = rating;
    } else if (body.rating === null || body.rating === '') {
      patch.rating = '';
    }
    // A cycle that is not completed never carries a rating.
    if (nextStatus !== 'completed') patch.rating = '';

    if (body.notes !== undefined) patch.notes = String(body.notes);

    if (Object.keys(patch).length === 0) throw new ApiError(400, 'Nothing to update');
    await store.updateRow(SHEETS.reviewCycles, existing.id, patch);
    res.json({ cycle: toOut(getCycleOr404(existing.id)) });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/reviews/:id
router.delete('/reviews/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = getCycleOr404(req.params.id);
    assertCanManage(req.actor, existing.employeeId);
    await store.removeRow(SHEETS.reviewCycles, existing.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/employees/:id/reviews — consumed by PersonPage; keep shape stable:
// { cycles: ReviewCycle[] } sorted by startDate desc.
router.get('/employees/:id/reviews', (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id;
    assertCanView(req.actor, id);
    if (!store.getEmployee(id)) throw new ApiError(404, 'Employee not found');
    const cycles = store
      .reviewCycles()
      .filter((c) => c.employeeId === id)
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
    res.json({ cycles });
  } catch (err) {
    next(err);
  }
});

export default router;
