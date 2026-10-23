// Role-aware home dashboard. Contract: docs/CONTRACTS.md §E.
import { Link } from 'react-router-dom';
import {
  AlarmClock,
  CalendarClock,
  ClipboardList,
  MessageSquareText,
  Target,
  UserCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type {
  CheckinNudge,
  CheckinStatus,
  EmployeeOut,
  FeedbackOut,
  ReviewCycle,
  ReviewCycleOut,
  Role,
} from '../../shared/types';
import { GROWTH_STATUSES } from '../../shared/types';
import { useFetch } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import {
  Avatar,
  Badge,
  EmptyState,
  ErrorBanner,
  PageHeader,
  Spinner,
  formatDate,
  growthTone,
  statusLabel,
  statusTone,
  type BadgeTone,
} from '../components/ui';
import '../styles/dashboard.css';

interface DashboardData {
  role: Role;
  teamSize?: number;
  directCount?: number;
  reviewCounts?: { completed: number; in_progress: number; not_started: number };
  nudges?: CheckinNudge[];
  upcomingReviews?: ReviewCycleOut[];
  recentFeedback?: Array<FeedbackOut & { employeeName: string }>;
  growthSummary?: Record<string, number>;
  myCheckin?: CheckinStatus;
  myOpenGoals?: number;
  myNextReview?: ReviewCycle | null;
}

function days(n: number): string {
  return `${n} day${n === 1 ? '' : 's'}`;
}

function checkinBadge(status: CheckinStatus): { tone: BadgeTone; label: string } {
  // "Overdue 1,800 days" is noise when no check-in was ever logged (e.g. right
  // after importing an existing team) — call that state out by name instead.
  if (!status.lastCheckin && status.overdueDays > 0) return { tone: 'danger', label: 'No check-in yet' };
  if (status.overdueDays > 0) return { tone: 'danger', label: `Overdue ${days(status.overdueDays)}` };
  if (status.overdueDays === 0) return { tone: 'warning', label: 'Due today' };
  if (status.overdueDays >= -14) return { tone: 'warning', label: `Due in ${days(-status.overdueDays)}` };
  return { tone: 'success', label: 'On track' };
}

/** Theme color for a badge tone — used for the growth meter segments. */
function toneColor(tone: BadgeTone): string {
  if (tone === 'success') return 'var(--success)';
  if (tone === 'warning') return 'var(--warning)';
  if (tone === 'danger') return 'var(--danger)';
  if (tone === 'accent') return 'var(--accent)';
  return 'var(--muted)';
}

function StatTile({
  icon: Icon,
  label,
  value,
  tone = 'accent',
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone?: 'accent' | 'success' | 'warning' | 'danger';
}) {
  return (
    <div className="card stat-tile dash-stat">
      <span className={`stat-ico ${tone}`}>
        <Icon size={18} />
      </span>
      <div>
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}</div>
      </div>
    </div>
  );
}

function ManagerDashboard({ data }: { data: DashboardData }) {
  const nudges = data.nudges ?? [];
  const overdueCount = nudges.filter((n) => n.overdueDays > 0).length;
  const upcoming = data.upcomingReviews ?? [];
  const feedback = data.recentFeedback ?? [];

  // Fixed category order: the known growth statuses first, extras after.
  const summary = data.growthSummary ?? {};
  const growth: Array<[string, number]> = [
    ...GROWTH_STATUSES.filter((s) => summary[s] !== undefined).map((s): [string, number] => [s, summary[s]!]),
    ...Object.entries(summary).filter(([k]) => !(GROWTH_STATUSES as readonly string[]).includes(k)),
  ];
  const growthTotal = growth.reduce((sum, [, n]) => sum + n, 0);

  return (
    <>
      <div className="stat-row">
        <StatTile icon={Users} label="Team size" value={data.teamSize ?? 0} />
        <StatTile icon={UserCheck} label="Direct reports" value={data.directCount ?? 0} />
        <StatTile
          icon={ClipboardList}
          label="Reviews in progress"
          value={data.reviewCounts?.in_progress ?? 0}
          tone="warning"
        />
        <StatTile
          icon={AlarmClock}
          label="Overdue check-ins"
          value={overdueCount}
          tone={overdueCount > 0 ? 'danger' : 'success'}
        />
      </div>

      <div className="dash-grid">
        <section className="card dash-tall">
          <div className="card-title">Check-in nudges</div>
          {nudges.length === 0 ? (
            <EmptyState title="All caught up" message="No check-ins overdue or due in the next 30 days." />
          ) : (
            nudges.map((n) => {
              const badge = checkinBadge(n);
              return (
                <div className="dash-row" key={n.employee.employeeId}>
                  <Avatar name={n.employee.name} size={32} />
                  <div className="dash-row-main">
                    <div className="dash-row-title">{n.employee.name}</div>
                    <div className="small muted">
                      Last check-in: {n.lastCheckin ? formatDate(n.lastCheckin) : 'Never'}
                    </div>
                  </div>
                  <div className="dash-row-side">
                    <Badge tone={badge.tone}>{badge.label}</Badge>
                    <Link className="btn btn-sm" to={`/people/${n.employee.employeeId}`}>
                      Check in
                    </Link>
                  </div>
                </div>
              );
            })
          )}
        </section>

        <section className="card">
          <div className="card-title">Upcoming reviews</div>
          {upcoming.length === 0 ? (
            <EmptyState title="Nothing scheduled" message="No review cycles start in the next 60 days." />
          ) : (
            upcoming.map((c) => (
              <div className="dash-row" key={c.id}>
                <Avatar name={c.employeeName} size={32} />
                <div className="dash-row-main">
                  <div className="dash-row-title">{c.employeeName}</div>
                  <div className="small muted">{c.name}</div>
                </div>
                <span className="small text-secondary">starts {formatDate(c.startDate)}</span>
              </div>
            ))
          )}
        </section>

        <section className="card">
          <div className="card-title">Team growth</div>
          {growthTotal === 0 ? (
            <EmptyState title="No team members" />
          ) : (
            <>
              <div className="growth-meter" aria-hidden="true">
                {growth.map(([status, count]) => (
                  <span
                    key={status}
                    style={{
                      width: `${(count / growthTotal) * 100}%`,
                      background: toneColor(growthTone(status)),
                    }}
                  />
                ))}
              </div>
              {growth.map(([status, count]) => (
                <div className="dash-row" key={status}>
                  <Badge tone={growthTone(status)}>{status}</Badge>
                  <div className="dash-row-main" />
                  <span className="mono" style={{ fontWeight: 650 }}>
                    {count}
                  </span>
                </div>
              ))}
            </>
          )}
        </section>

        <section className="card dash-wide">
          <div className="card-title">Recent feedback</div>
          {feedback.length === 0 ? (
            <EmptyState title="No feedback yet" message="Feedback you give your team will show up here." />
          ) : (
            feedback.map((f) => (
              <div className="dash-row" key={f.id}>
                <Avatar name={f.employeeName} size={32} />
                <div className="dash-row-main">
                  <div className="dash-row-title">
                    {f.employeeName} <span className="muted">· from {f.authorName}</span>
                  </div>
                  <div className="small text-secondary clamp-2">{f.text}</div>
                </div>
                <div className="dash-row-side">
                  <Badge tone={f.type === 'continuous' ? 'accent' : 'neutral'}>{statusLabel(f.type)}</Badge>
                  <span className="small muted">{formatDate(f.date)}</span>
                </div>
              </div>
            ))
          )}
        </section>
      </div>
    </>
  );
}

function EmployeeDashboard({ data, me }: { data: DashboardData; me: EmployeeOut }) {
  const checkin = data.myCheckin;
  const badge = checkin ? checkinBadge(checkin) : null;
  const review = data.myNextReview ?? null;
  const profile = `/people/${me.employeeId}`;

  return (
    <div className="dash-grid-3">
      <section className="card">
        <div className="card-title">
          <CalendarClock size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
          My quarterly check-in
        </div>
        {checkin && badge ? (
          <>
            <div style={{ marginBottom: 8 }}>
              <Badge tone={badge.tone}>{badge.label}</Badge>
            </div>
            <div className="dash-kv">
              <span>Last check-in</span>
              <span>{checkin.lastCheckin ? formatDate(checkin.lastCheckin) : 'Never'}</span>
            </div>
            <div className="dash-kv">
              <span>Next due</span>
              <span>{formatDate(checkin.dueDate)}</span>
            </div>
          </>
        ) : (
          <p className="muted">No check-in data yet.</p>
        )}
        <div className="dash-card-foot">
          <span className="small muted">Check-ins happen with your mentor every quarter.</span>
        </div>
      </section>

      <section className="card">
        <div className="card-title">
          <Target size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
          Open goals
        </div>
        <div className="dash-hero">{data.myOpenGoals ?? 0}</div>
        <p className="small text-secondary">
          individual goal{(data.myOpenGoals ?? 0) === 1 ? '' : 's'} still in flight
        </p>
        <div className="dash-card-foot">
          <Link className="btn btn-sm" to={`${profile}?tab=goals`}>
            View my goals
          </Link>
        </div>
      </section>

      <section className="card">
        <div className="card-title">
          <ClipboardList size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
          My next review
        </div>
        {review ? (
          <>
            <div className="dash-row-title" style={{ marginBottom: 6 }}>
              {review.name}
            </div>
            <div className="small text-secondary" style={{ marginBottom: 8 }}>
              {formatDate(review.startDate)} – {formatDate(review.endDate)}
            </div>
            <Badge tone={statusTone(review.status)}>{statusLabel(review.status)}</Badge>
          </>
        ) : (
          <p className="muted">No upcoming review scheduled.</p>
        )}
        <div className="dash-card-foot">
          <Link className="btn btn-sm" to={`${profile}?tab=feedback`}>
            <MessageSquareText size={14} />
            My feedback
          </Link>
          <Link className="btn btn-sm" to={`${profile}?tab=progress`}>
            My progress
          </Link>
        </div>
      </section>
    </div>
  );
}

export default function DashboardPage() {
  const { me } = useAuth();
  const { data, error, loading } = useFetch<DashboardData>('/api/dashboard');

  if (!me) return null;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = me.name.split(/\s+/)[0] ?? me.name;
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const isManagerView = data !== null && (data.role === 'manager' || data.role === 'admin');

  return (
    <div className="page">
      <PageHeader
        title={`${greeting}, ${firstName}`}
        subtitle={today}
        actions={
          data !== null && !isManagerView ? (
            <Link className="btn" to={`/people/${me.employeeId}`}>
              My profile
            </Link>
          ) : undefined
        }
      />
      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorBanner message={error} />
      ) : data === null ? (
        <EmptyState title="Nothing to show" message="The dashboard returned no data." />
      ) : isManagerView ? (
        <ManagerDashboard data={data} />
      ) : (
        <EmployeeDashboard data={data} me={me} />
      )}
    </div>
  );
}
