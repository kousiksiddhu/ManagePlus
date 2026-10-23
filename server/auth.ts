// Session auth + RBAC middleware. Roles are derived from the Employees sheet:
// isAdmin=yes -> admin; has mentees -> manager; otherwise employee.
import crypto from 'node:crypto';
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import type { EmployeeOut } from '../shared/types';
import { store } from './store';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      actor: EmployeeOut;
    }
  }
}

const SESSION_COOKIE = 'mp_session';
const sessions = new Map<string, string>(); // sid -> employeeId

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(8).toString('hex');
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 32).toString('hex');
  // A hand-edited/corrupt hash cell must fail the login, not crash timingSafeEqual.
  if (hash.length !== candidate.length) return false;
  return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(hash));
}

/** Invalidate every active session belonging to an employee (call after deletion). */
export function revokeSessionsFor(employeeId: string): void {
  for (const [sid, eid] of sessions) {
    if (eid === employeeId) sessions.delete(sid);
  }
}

export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    await store.ready();
    const sid = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
    const employeeId = sid ? sessions.get(sid) : undefined;
    const row = employeeId ? store.getEmployeeRow(employeeId) : undefined;
    if (!row) throw new ApiError(401, 'Not signed in');
    req.actor = store.toOut(row);
    next();
  } catch (err) {
    next(err);
  }
};

export const requireManager: RequestHandler = (req, _res, next) => {
  if (req.actor.role === 'manager' || req.actor.role === 'admin') return next();
  next(new ApiError(403, 'Manager access required'));
};

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (req.actor.role === 'admin') return next();
  next(new ApiError(403, 'Admin access required'));
};

/** Can the actor view this employee's data? (self, subtree, or admin) */
export function canView(actor: EmployeeOut, targetId: string): boolean {
  if (actor.role === 'admin') return true;
  if (actor.employeeId === targetId) return true;
  return store.subtreeIds(actor.employeeId).includes(targetId);
}

/** Can the actor manage (edit/delete/give feedback to) this employee? Excludes self. */
export function canManage(actor: EmployeeOut, targetId: string): boolean {
  if (actor.role === 'admin') return true;
  if (actor.role !== 'manager') return false;
  if (actor.employeeId === targetId) return false;
  return store.subtreeIds(actor.employeeId).includes(targetId);
}

export function assertCanView(actor: EmployeeOut, targetId: string): void {
  if (!canView(actor, targetId)) throw new ApiError(403, 'You do not have access to this employee');
}

export function assertCanManage(actor: EmployeeOut, targetId: string): void {
  if (!canManage(actor, targetId)) throw new ApiError(403, 'You do not have permission to manage this employee');
}

export const authRouter = Router();

authRouter.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await store.ready();
    const { email, password } = (req.body ?? {}) as { email?: string; password?: string };
    if (!email || !password) throw new ApiError(400, 'Email and password are required');
    const row = store.getByEmail(email);
    if (!row || !verifyPassword(password, String(row.passwordHash ?? ''))) {
      throw new ApiError(401, 'Invalid email or password');
    }
    const sid = crypto.randomUUID();
    sessions.set(sid, String(row.employeeId));
    res.cookie(SESSION_COOKIE, sid, { httpOnly: true, sameSite: 'lax' });
    res.json({ employee: store.toOut(row) });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', (req: Request, res: Response) => {
  const sid = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
  if (sid) sessions.delete(sid);
  res.clearCookie(SESSION_COOKIE);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req: Request, res: Response) => {
  res.json({ employee: req.actor });
});
