// Module A — employees CRUD, tree/flat listing, column management, Excel export.
// Contract: docs/CONTRACTS.md §A
import { Router, type NextFunction, type Request, type Response } from 'express';
import ExcelJS from 'exceljs';
import type { ColumnDef, EmployeeOut, TreeNode } from '../../shared/types';
import { INTERNAL_EMPLOYEE_FIELDS } from '../../shared/types';
import { store, isoDate, type Row } from '../store';
import { ApiError, assertCanManage, hashPassword, requireManager, revokeSessionsFor } from '../auth';

const router = Router();

const CORE_EMPLOYEE_FIELDS = [
  'name',
  'email',
  'designation',
  'mentorId',
  'currentProject',
  'projectHistory',
  'skills',
  'growthStatus',
  'joinDate',
] as const;

const COLUMN_TYPES: ReadonlyArray<ColumnDef['type']> = ['text', 'number', 'date', 'tags', 'select'];

function str(v: unknown): string {
  return v == null ? '' : String(v).trim();
}

/** Keep only editable employee fields (core + defined custom columns) as scalars. */
function pickEmployeeFields(body: Record<string, unknown>): Row {
  const allowed = new Set<string>(CORE_EMPLOYEE_FIELDS);
  for (const col of store.columns()) allowed.add(col.key);
  allowed.delete('employeeId');
  for (const internal of INTERNAL_EMPLOYEE_FIELDS) allowed.delete(internal);

  const out: Row = {};
  for (const [key, value] of Object.entries(body)) {
    if (!allowed.has(key)) continue;
    if (value == null) {
      out[key] = '';
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    } else {
      out[key] = String(value).trim();
    }
  }
  return out;
}

/**
 * Validate a mentor assignment. `targetId` is set when editing an existing
 * employee, in which case the new mentor must not be the employee itself or
 * one of its descendants (that would create a reporting cycle).
 */
function validateMentor(actor: EmployeeOut, mentorId: string, targetId: string | null): void {
  if (!mentorId) {
    if (actor.role !== 'admin') throw new ApiError(400, 'A mentor from your team is required');
    return; // admins may create/keep top-level people
  }
  const mentor = store.getEmployee(mentorId);
  if (!mentor) throw new ApiError(400, `Mentor '${mentorId}' does not exist`);
  if (actor.role !== 'admin') {
    const visible =
      mentorId === actor.employeeId || store.subtreeIds(actor.employeeId).includes(mentorId);
    if (!visible) throw new ApiError(403, 'The mentor must be you or someone in your team');
  }
  if (targetId) {
    if (mentorId === targetId) throw new ApiError(400, 'An employee cannot be their own mentor');
    if (store.subtreeIds(targetId).includes(mentorId)) {
      throw new ApiError(400, 'This mentor change would create a reporting cycle');
    }
  }
}

// ---- employees -----------------------------------------------------------

router.get('/employees', (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = req.actor;
    const view = req.query.view === 'tree' ? 'tree' : 'flat';
    const scope = req.query.scope === 'all' ? 'all' : 'mine';
    if (scope === 'all' && actor.role !== 'admin') {
      throw new ApiError(403, 'Only admins can view everyone');
    }

    if (view === 'tree') {
      let roots: TreeNode[];
      if (scope === 'all') {
        roots = store
          .employees()
          .filter((e) => !str(e.mentorId))
          .map((e) => store.buildTree(e.employeeId))
          .filter((t): t is TreeNode => t !== null);
      } else {
        const tree = store.buildTree(actor.employeeId);
        roots = tree ? [tree] : [];
      }
      res.json({ roots });
      return;
    }

    const ids =
      scope === 'all'
        ? new Set(store.employees().map((e) => e.employeeId))
        : new Set([actor.employeeId, ...store.subtreeIds(actor.employeeId)]);
    res.json({ employees: store.employees().filter((e) => ids.has(e.employeeId)) });
  } catch (err) {
    next(err);
  }
});

router.post('/employees', requireManager, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = req.actor;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const fields = pickEmployeeFields(body);

    const name = str(fields.name);
    const email = str(fields.email);
    const designation = str(fields.designation);
    if (!name || !email || !designation) {
      throw new ApiError(400, 'Name, email and designation are required');
    }
    if (store.getByEmail(email)) {
      throw new ApiError(409, 'An employee with this email already exists');
    }

    const mentorId = str(fields.mentorId);
    validateMentor(actor, mentorId, null);

    const employeeId = str(body.employeeId) || store.nextEmployeeId();
    if (store.getEmployee(employeeId)) {
      throw new ApiError(409, `Employee id '${employeeId}' is already in use`);
    }

    const row: Row = {
      employeeId,
      name,
      email,
      designation,
      mentorId,
      currentProject: str(fields.currentProject),
      projectHistory: str(fields.projectHistory),
      skills: str(fields.skills),
      growthStatus: str(fields.growthStatus) || 'On Track',
      joinDate: str(fields.joinDate) || isoDate(new Date()),
      isAdmin: 'no',
      passwordHash: hashPassword('welcome123'),
    };
    // custom column values supplied at creation time
    for (const col of store.columns()) {
      if (!(col.key in row) && fields[col.key] !== undefined) row[col.key] = fields[col.key] ?? '';
    }

    const employee = await store.insertEmployee(row);
    res.json({ employee });
  } catch (err) {
    next(err);
  }
});

router.patch('/employees/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = req.actor;
    const id = req.params.id;
    if (!store.getEmployee(id)) throw new ApiError(404, 'Employee not found');
    assertCanManage(actor, id); // admins pass for anyone, incl. themselves

    const body = (req.body ?? {}) as Record<string, unknown>;
    if (body.employeeId !== undefined && str(body.employeeId) !== id) {
      throw new ApiError(400, 'The employee id cannot be changed');
    }
    if (body.passwordHash !== undefined) {
      throw new ApiError(400, 'The password cannot be changed through this endpoint');
    }

    const patch = pickEmployeeFields(body);

    if (patch.name !== undefined && !str(patch.name)) {
      throw new ApiError(400, 'Name cannot be empty');
    }
    if (patch.designation !== undefined && !str(patch.designation)) {
      throw new ApiError(400, 'Designation cannot be empty');
    }
    if (patch.email !== undefined) {
      const email = str(patch.email);
      if (!email) throw new ApiError(400, 'Email cannot be empty');
      const existing = store.getByEmail(email);
      if (existing && str(existing.employeeId) !== id) {
        throw new ApiError(409, 'Another employee already uses this email');
      }
      patch.email = email;
    }
    if (patch.mentorId !== undefined) {
      const mentorId = str(patch.mentorId);
      validateMentor(actor, mentorId, id);
      patch.mentorId = mentorId;
    }
    if (body.isAdmin !== undefined) {
      if (actor.role !== 'admin') throw new ApiError(403, 'Only admins can change admin access');
      patch.isAdmin = body.isAdmin === true || str(body.isAdmin) === 'yes' ? 'yes' : 'no';
    }

    const employee = await store.updateEmployee(id, patch);
    res.json({ employee });
  } catch (err) {
    next(err);
  }
});

router.delete('/employees/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id;
    if (!store.getEmployee(id)) throw new ApiError(404, 'Employee not found');
    assertCanManage(req.actor, id);
    await store.deleteEmployee(id);
    revokeSessionsFor(id); // a deleted person's cookie must never authenticate again
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---- columns ---------------------------------------------------------------

router.get('/columns', (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ columns: store.columns() });
  } catch (err) {
    next(err);
  }
});

/** camelCase slug of a human label: "Slack Handle" -> "slackHandle" */
function camelSlug(label: string): string {
  const words = label
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);
  return words
    .map((w, i) => (i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join('');
}

router.post('/columns', requireManager, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const label = str(body.label);
    if (!label) throw new ApiError(400, 'A column label is required');
    const type = (str(body.type) || 'text') as ColumnDef['type'];
    if (!COLUMN_TYPES.includes(type)) {
      throw new ApiError(400, `Column type must be one of: ${COLUMN_TYPES.join(', ')}`);
    }
    const key = camelSlug(label);
    if (!key) throw new ApiError(400, 'The column label must contain letters or numbers');
    if ((INTERNAL_EMPLOYEE_FIELDS as readonly string[]).includes(key) || key === 'employeeId') {
      throw new ApiError(400, `'${key}' is a reserved field name`);
    }
    if (store.columns().some((c) => c.key === key)) {
      throw new ApiError(409, `A column with key '${key}' already exists`);
    }
    const column = await store.addColumn({ key, label, type, options: str(body.options) });
    res.json({ column });
  } catch (err) {
    next(err);
  }
});

router.patch('/columns/:key', requireManager, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const key = req.params.key;
    if (!store.columns().some((c) => c.key === key)) throw new ApiError(404, 'Column not found');
    const body = (req.body ?? {}) as Record<string, unknown>;
    const patch: Partial<ColumnDef> = {};
    if (body.label !== undefined) {
      const label = str(body.label);
      if (!label) throw new ApiError(400, 'A column label cannot be empty');
      patch.label = label;
    }
    if (body.type !== undefined) {
      const type = str(body.type) as ColumnDef['type'];
      if (!COLUMN_TYPES.includes(type)) {
        throw new ApiError(400, `Column type must be one of: ${COLUMN_TYPES.join(', ')}`);
      }
      patch.type = type;
    }
    if (body.options !== undefined) patch.options = str(body.options);
    if (body.visible !== undefined) patch.visible = Boolean(body.visible);
    if (body.order !== undefined) {
      const order = Number(body.order);
      if (!Number.isFinite(order)) throw new ApiError(400, 'Order must be a number');
      patch.order = order;
    }
    const column = await store.updateColumn(key, patch);
    res.json({ column });
  } catch (err) {
    next(err);
  }
});

router.delete('/columns/:key', requireManager, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const key = req.params.key;
    const column = store.columns().find((c) => c.key === key);
    if (!column) throw new ApiError(404, 'Column not found');
    if (column.core) throw new ApiError(400, 'Core columns cannot be deleted');
    await store.removeColumn(key);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---- export ----------------------------------------------------------------

router.post('/export', requireManager, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = req.actor;
    const body = (req.body ?? {}) as { columnKeys?: unknown; employeeIds?: unknown };

    const allColumns = store.columns();
    const requestedKeys = Array.isArray(body.columnKeys) ? body.columnKeys.map(String) : [];
    const cols = requestedKeys
      .map((k) => allColumns.find((c) => c.key === k))
      .filter((c): c is ColumnDef => c !== undefined);
    if (!cols.length) throw new ApiError(400, 'Select at least one column to export');

    const visible = new Set(store.visibleIds(actor));
    let idSet: Set<string>;
    if (Array.isArray(body.employeeIds) && body.employeeIds.length) {
      idSet = new Set(body.employeeIds.map(String).filter((id) => visible.has(id)));
      if (!idSet.size) throw new ApiError(400, 'None of the selected rows are visible to you');
    } else {
      idSet = visible;
    }

    const everyone = store.employees();
    const byId = new Map(everyone.map((e) => [e.employeeId, e]));
    const rows = everyone.filter((e) => idSet.has(e.employeeId));

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Team');
    ws.addRow(cols.map((c) => c.label));
    ws.getRow(1).font = { bold: true };
    for (const emp of rows) {
      ws.addRow(
        cols.map((c) => {
          if (c.key === 'mentorId') {
            const mentorId = str(emp.mentorId);
            return mentorId ? byId.get(mentorId)?.name ?? mentorId : '';
          }
          const value = (emp as Record<string, unknown>)[c.key];
          if (value == null) return '';
          return typeof value === 'number' || typeof value === 'boolean' ? value : String(value);
        }),
      );
    }
    ws.columns.forEach((col, i) => {
      col.width = Math.max(16, (cols[i]?.label ?? '').length + 6);
    });
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    const buffer = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=manageplus-export.xlsx');
    res.send(Buffer.from(buffer));
  } catch (err) {
    next(err);
  }
});

export default router;
