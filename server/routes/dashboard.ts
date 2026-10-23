// Role-aware dashboard aggregate. Contract: docs/CONTRACTS.md §E.
import { Router } from 'express';
import type {
  CheckinNudge,
  CheckinStatus,
  EmployeeOut,
  FeedbackOut,
  ReviewCycle,
  ReviewCycleOut,
  Role,
} from '../../shared/types';
import { isoDate, store } from '../store';

/** Recent feedback rows carry the subject's name in addition to FeedbackOut joins. */
type TeamFeedback = FeedbackOut & { employeeName: string };

interface DashboardPayload {
  role: Role;
  // manager/admin only:
  teamSize?: number;
  directCount?: number;
  reviewCounts?: { completed: number; in_progress: number; not_started: number };
  nudges?: CheckinNudge[];
  upcomingReviews?: ReviewCycleOut[];
  recentFeedback?: TeamFeedback[];
  growthSummary?: Record<string, number>;
  // every role (about the actor themself):
  myCheckin?: CheckinStatus;
  myOpenGoals?: number;
  myNextReview?: ReviewCycle | null;
}

const router = Router();

router.get('/dashboard', (req, res, next) => {
  try {
    const actor = req.actor;
    const today = isoDate(new Date());
    const byId = new Map<string, EmployeeOut>(store.employees().map((e) => [e.employeeId, e]));

    const payload: DashboardPayload = { role: actor.role };

    // ---- self section (every role) ----
    payload.myCheckin = store.checkinStatus(actor.employeeId);
    payload.myOpenGoals = store
      .individualGoals()
      .filter((g) => g.employeeId === actor.employeeId && g.status !== 'completed').length;
    payload.myNextReview =
      store
        .reviewCycles()
        .filter(
          (c) => c.employeeId === actor.employeeId && c.status !== 'completed' && c.endDate >= today,
        )
        .sort((a, b) => (a.startDate < b.startDate ? -1 : 1))[0] ?? null;

    // ---- team section (manager/admin) ----
    if (actor.role === 'manager' || actor.role === 'admin') {
      const teamIds = store.visibleIds(actor).filter((id) => id !== actor.employeeId);
      const teamSet = new Set(teamIds);

      payload.teamSize = teamIds.length;
      payload.directCount = store.directReports(actor.employeeId).length;

      const teamCycles = store.reviewCycles().filter((c) => teamSet.has(c.employeeId));
      payload.reviewCounts = {
        completed: teamCycles.filter((c) => c.status === 'completed').length,
        in_progress: teamCycles.filter((c) => c.status === 'in_progress').length,
        not_started: teamCycles.filter((c) => c.status === 'not_started').length,
      };

      // Check-in nudges: overdue, or due within the next 30 days. Overdue first,
      // most-overdue → soonest-due (descending overdueDays covers both halves).
      const nudges: CheckinNudge[] = [];
      for (const id of teamIds) {
        const employee = byId.get(id);
        if (!employee) continue;
        const status = store.checkinStatus(id);
        if (status.overdueDays > -30) nudges.push({ ...status, employee });
      }
      nudges.sort((a, b) => b.overdueDays - a.overdueDays);
      payload.nudges = nudges;

      // Reviews starting within the next 60 days, soonest first.
      const horizon = new Date();
      horizon.setDate(horizon.getDate() + 60);
      const horizonIso = isoDate(horizon);
      payload.upcomingReviews = teamCycles
        .filter((c) => c.startDate >= today && c.startDate <= horizonIso)
        .sort((a, b) => (a.startDate < b.startDate ? -1 : 1))
        .map((c) => ({
          ...c,
          employeeName: byId.get(c.employeeId)?.name ?? 'Unknown',
          designation: byId.get(c.employeeId)?.designation ?? '',
        }));

      // Last 5 feedback entries given across the team.
      payload.recentFeedback = store
        .feedback()
        .filter((f) => teamSet.has(f.employeeId))
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, 5)
        .map((f) => ({
          ...f,
          authorName: byId.get(f.authorId)?.name ?? 'Unknown',
          goalTitle: store.goalTitle(f.goalId),
          employeeName: byId.get(f.employeeId)?.name ?? 'Unknown',
        }));

      // growthStatus -> headcount
      const growthSummary: Record<string, number> = {};
      for (const id of teamIds) {
        const status = byId.get(id)?.growthStatus || 'Unset';
        growthSummary[status] = (growthSummary[status] ?? 0) + 1;
      }
      payload.growthSummary = growthSummary;
    }

    res.json(payload);
  } catch (err) {
    next(err);
  }
});

export default router;
