// Module C — review cycle calendar. Year timeline of review cycles per team
// member, with create/edit/delete and a detail modal. Contract: docs/CONTRACTS.md §C.
import { useMemo, useState } from 'react';
import { CalendarRange, ChevronLeft, ChevronRight, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import type { EmployeeOut, ReviewCycleOut, ReviewStatus } from '../../shared/types';
import { api, useFetch } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import {
  Avatar,
  Badge,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  Field,
  Modal,
  PageHeader,
  Spinner,
  formatDate,
  statusLabel,
  statusTone,
} from '../components/ui';
import '../styles/reviews.css';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const STATUSES: ReviewStatus[] = ['not_started', 'in_progress', 'completed'];
const LEGEND_ORDER: ReviewStatus[] = ['completed', 'in_progress', 'not_started'];
const RATING_LABELS: Record<number, string> = {
  5: '5 — Outstanding',
  4: '4 — Exceeds expectations',
  3: '3 — Meets expectations',
  2: '2 — Below expectations',
  1: '1 — Unsatisfactory',
};

const BAR_HEIGHT = 20;
const LANE_GAP = 6;
const TRACK_PAD = 9;
const MIN_ROW_HEIGHT = 52;

/** Horizontal position of a date within the year, month-proportional so bars
 *  align with the 12 equal-width month columns. Clamped to [0, 1]. */
function yearFraction(iso: string, year: number, edge: 'start' | 'end'): number {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return 0;
  if (y < year) return 0;
  if (y > year) return 1;
  const daysInMonth = new Date(y, m, 0).getDate();
  const dayFraction = edge === 'start' ? (d - 1) / daysInMonth : d / daysInMonth;
  return Math.min(1, Math.max(0, (m - 1 + dayFraction) / 12));
}

/** Compact bar label: "Q1 Review" -> "Q1", "Annual Review" -> "Annual". */
function shortCycleLabel(name: string): string {
  const q = name.match(/\bQ([1-4])\b/i);
  if (q) return `Q${q[1]}`;
  if (/annual/i.test(name)) return 'Annual';
  return name;
}

/** Width of the fixed pill used for single-date review cycles (fraction of the year). */
const PILL_WIDTH = 0.066;

/** Greedy interval layout: overlapping cycles get stacked into lanes. */
function assignLanes(cycles: ReviewCycleOut[]): Map<string, number> {
  const lanes = new Map<string, number>();
  const laneEnds: string[] = [];
  const sorted = [...cycles].sort((a, b) => a.startDate.localeCompare(b.startDate));
  for (const c of sorted) {
    let lane = laneEnds.findIndex((end) => end < c.startDate);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(c.endDate);
    } else {
      laneEnds[lane] = c.endDate;
    }
    lanes.set(c.id, lane);
  }
  return lanes;
}

function todayIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="stars" aria-label={`Rated ${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={15} className={i <= rating ? 'star filled' : 'star'} />
      ))}
    </span>
  );
}

interface CycleForm {
  employeeId: string;
  name: string;
  startDate: string;
  endDate: string;
  status: ReviewStatus;
  rating: string;
  notes: string;
}

const EMPTY_FORM: CycleForm = {
  employeeId: '',
  name: '',
  startDate: '',
  endDate: '',
  status: 'not_started',
  rating: '',
  notes: '',
};

export default function ReviewsPage() {
  const { me } = useAuth();
  const myId = me?.employeeId ?? '';
  const [year, setYear] = useState(() => new Date().getFullYear());

  const employeesRes = useFetch<{ employees: EmployeeOut[] }>(
    me?.role === 'admin' ? '/api/employees?view=flat&scope=all' : '/api/employees?view=flat',
  );
  const cyclesRes = useFetch<{ cycles: ReviewCycleOut[] }>(`/api/reviews?year=${year}`);

  const [selected, setSelected] = useState<ReviewCycleOut | null>(null);
  const [editor, setEditor] = useState<{ cycle: ReviewCycleOut | null } | null>(null);
  const [form, setForm] = useState<CycleForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ReviewCycleOut | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const cycles = useMemo(() => cyclesRes.data?.cycles ?? [], [cyclesRes.data]);

  /** People the actor can create cycles for (visible team, never self). */
  const manageable = useMemo(
    () => (employeesRes.data?.employees ?? []).filter((e) => e.employeeId !== myId),
    [employeesRes.data, myId],
  );

  /** One row per team member; anyone with a cycle this year also gets a row. */
  const rows = useMemo(() => {
    const map = new Map<string, { id: string; name: string; designation: string }>();
    for (const e of manageable) {
      map.set(e.employeeId, { id: e.employeeId, name: e.name, designation: e.designation });
    }
    for (const c of cycles) {
      if (!map.has(c.employeeId)) {
        map.set(c.employeeId, { id: c.employeeId, name: c.employeeName, designation: c.designation });
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [manageable, cycles]);

  const cyclesByEmployee = useMemo(() => {
    const map = new Map<string, ReviewCycleOut[]>();
    for (const c of cycles) {
      const list = map.get(c.employeeId);
      if (list) list.push(c);
      else map.set(c.employeeId, [c]);
    }
    return map;
  }, [cycles]);

  const counts = useMemo(() => {
    const c: Record<ReviewStatus, number> = { not_started: 0, in_progress: 0, completed: 0 };
    for (const cycle of cycles) c[cycle.status] += 1;
    return c;
  }, [cycles]);

  const today = todayIso();
  const todayFraction = today.startsWith(`${year}-`) ? yearFraction(today, year, 'start') : null;

  const initialLoading =
    (employeesRes.loading && !employeesRes.data) || (cyclesRes.loading && !cyclesRes.data);
  const loadError = employeesRes.error ?? cyclesRes.error;

  const canManageCycle = (cycle: ReviewCycleOut) =>
    me?.role === 'admin' || (me?.role === 'manager' && cycle.employeeId !== myId);

  function openCreate() {
    setForm({ ...EMPTY_FORM, employeeId: manageable[0]?.employeeId ?? '' });
    setFormError(null);
    setEditor({ cycle: null });
  }

  function openEdit(cycle: ReviewCycleOut) {
    setForm({
      employeeId: cycle.employeeId,
      name: cycle.name,
      startDate: cycle.startDate,
      endDate: cycle.endDate,
      status: cycle.status,
      rating: cycle.rating != null ? String(cycle.rating) : '',
      notes: cycle.notes,
    });
    setFormError(null);
    setSelected(null);
    setEditor({ cycle });
  }

  async function save() {
    if (!editor) return;
    if (!editor.cycle && !form.employeeId) {
      setFormError('Choose a team member for this review cycle');
      return;
    }
    if (!form.name.trim()) {
      setFormError('Give the cycle a name');
      return;
    }
    if (!form.startDate || !form.endDate) {
      setFormError('Both start and end dates are required');
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      if (editor.cycle) {
        const body: Record<string, unknown> = {
          name: form.name.trim(),
          startDate: form.startDate,
          endDate: form.endDate,
          status: form.status,
          notes: form.notes,
        };
        if (form.status === 'completed' && form.rating) body.rating = Number(form.rating);
        await api(`/api/reviews/${editor.cycle.id}`, { method: 'PATCH', body });
      } else {
        await api('/api/reviews', {
          method: 'POST',
          body: {
            employeeId: form.employeeId,
            name: form.name.trim(),
            startDate: form.startDate,
            endDate: form.endDate,
            status: form.status,
            notes: form.notes,
          },
        });
      }
      setEditor(null);
      cyclesRes.reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    setActionError(null);
    try {
      await api(`/api/reviews/${deleting.id}`, { method: 'DELETE' });
      cyclesRes.reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(null);
      setSelected(null);
      setBusy(false);
    }
  }

  if (!me) return null;

  return (
    <div className="page">
      <PageHeader
        title="Review cycles"
        subtitle="Plan and track performance reviews across your team"
        actions={
          <>
            <div className="year-switch">
              <button className="icon-btn" onClick={() => setYear((y) => y - 1)} aria-label="Previous year">
                <ChevronLeft size={16} />
              </button>
              <span className="year-label mono">{year}</span>
              <button className="icon-btn" onClick={() => setYear((y) => y + 1)} aria-label="Next year">
                <ChevronRight size={16} />
              </button>
            </div>
            <button className="btn btn-primary" onClick={openCreate} disabled={manageable.length === 0}>
              <Plus size={15} /> New review cycle
            </button>
          </>
        }
      />

      <ErrorBanner message={loadError ?? actionError} />

      {initialLoading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        !loadError && (
          <EmptyState
            title="No team members"
            message="Review cycles appear here once people report into you."
          />
        )
      ) : (
        <>
          <div className={`reviews-board${cyclesRes.loading ? ' is-loading' : ''}`}>
            <div className="reviews-grid">
              <div className="rg-corner">Team member</div>
              <div className="rg-months">
                {MONTHS.map((m) => (
                  <span key={m} className="rg-month">
                    {m}
                  </span>
                ))}
                {todayFraction !== null && (
                  <span className="rg-today-flag" style={{ left: `${todayFraction * 100}%` }}>
                    Today
                  </span>
                )}
              </div>

              {rows.map((row) => {
                const rowCycles = cyclesByEmployee.get(row.id) ?? [];
                const lanes = assignLanes(rowCycles);
                const laneCount = rowCycles.length === 0 ? 1 : Math.max(...lanes.values()) + 1;
                const height = Math.max(
                  MIN_ROW_HEIGHT,
                  TRACK_PAD * 2 + laneCount * BAR_HEIGHT + (laneCount - 1) * LANE_GAP,
                );
                return (
                  <div key={row.id} style={{ display: 'contents' }}>
                    <div className="rg-person">
                      <Avatar name={row.name} size={28} />
                      <div className="rg-person-meta">
                        <div className="rg-person-name">{row.name}</div>
                        <div className="rg-person-role">{row.designation}</div>
                      </div>
                    </div>
                    <div className="rg-track" style={{ minHeight: height }}>
                      {todayFraction !== null && (
                        <span className="rg-today" style={{ left: `${todayFraction * 100}%` }} />
                      )}
                      {rowCycles.map((c) => {
                        const start = yearFraction(c.startDate, year, 'start');
                        const end = yearFraction(c.endDate, year, 'end');
                        const lane = lanes.get(c.id) ?? 0;
                        // Single-date cycles (the normal case: a review held at
                        // quarter end) render as a compact pill ending at that
                        // date rather than a range bar.
                        const isPoint = c.startDate === c.endDate;
                        const left = isPoint
                          ? Math.min(Math.max(end - PILL_WIDTH, 0), 1 - PILL_WIDTH)
                          : start;
                        const width = isPoint ? PILL_WIDTH : Math.max(end - start, 0.008);
                        return (
                          <button
                            key={c.id}
                            className={`rg-bar rc-${c.status}`}
                            style={{
                              left: `${left * 100}%`,
                              width: `${width * 100}%`,
                              top: TRACK_PAD + lane * (BAR_HEIGHT + LANE_GAP),
                            }}
                            title={
                              isPoint
                                ? `${c.name} · ${formatDate(c.endDate)}`
                                : `${c.name} · ${formatDate(c.startDate)} → ${formatDate(c.endDate)}`
                            }
                            onClick={() => setSelected(c)}
                          >
                            <span className="rg-bar-label">{shortCycleLabel(c.name)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="reviews-legend card">
            {LEGEND_ORDER.map((s) => (
              <div key={s} className="legend-item">
                <span className={`legend-swatch rc-${s}`} />
                <span className="legend-label">{statusLabel(s)}</span>
                <span className="legend-count mono">{counts[s]}</span>
              </div>
            ))}
            <span className="legend-total muted small">
              {cycles.length} {cycles.length === 1 ? 'cycle' : 'cycles'} in {year}
            </span>
          </div>

          {cycles.length === 0 && (
            <EmptyState
              title={`No review cycles in ${year}`}
              message='Use "New review cycle" to schedule the first one.'
            />
          )}
        </>
      )}

      {/* ---- detail modal ---- */}
      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.name ?? 'Review cycle'}
        footer={
          selected && canManageCycle(selected) ? (
            <>
              <button className="btn btn-danger" onClick={() => setDeleting(selected)}>
                <Trash2 size={14} /> Delete
              </button>
              <button className="btn btn-primary" onClick={() => openEdit(selected)}>
                <Pencil size={14} /> Edit
              </button>
            </>
          ) : undefined
        }
      >
        {selected && (
          <div>
            <div className="cycle-person">
              <Avatar name={selected.employeeName} size={36} />
              <div>
                <div className="cycle-person-name">{selected.employeeName}</div>
                <div className="small text-secondary">{selected.designation}</div>
              </div>
            </div>
            <div className="cycle-meta">
              <div className="cycle-meta-row">
                <span className="meta-label">Period</span>
                <span>
                  <CalendarRange size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                  {selected.startDate === selected.endDate
                    ? formatDate(selected.endDate)
                    : `${formatDate(selected.startDate)} → ${formatDate(selected.endDate)}`}
                </span>
              </div>
              <div className="cycle-meta-row">
                <span className="meta-label">Status</span>
                <Badge tone={statusTone(selected.status)}>{statusLabel(selected.status)}</Badge>
              </div>
              {selected.status === 'completed' && (
                <div className="cycle-meta-row">
                  <span className="meta-label">Rating</span>
                  {selected.rating != null ? (
                    <Stars rating={selected.rating} />
                  ) : (
                    <span className="muted">Not rated yet</span>
                  )}
                </div>
              )}
              <div className="cycle-meta-row align-top">
                <span className="meta-label">Notes</span>
                {selected.notes ? (
                  <p className="cycle-notes">{selected.notes}</p>
                ) : (
                  <span className="muted">No notes</span>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ---- create / edit modal ---- */}
      <Modal
        open={editor !== null}
        onClose={() => setEditor(null)}
        title={editor?.cycle ? 'Edit review cycle' : 'New review cycle'}
        footer={
          <>
            <button className="btn" onClick={() => setEditor(null)} disabled={busy}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={() => void save()} disabled={busy}>
              {busy ? 'Saving…' : editor?.cycle ? 'Save changes' : 'Create cycle'}
            </button>
          </>
        }
      >
        <ErrorBanner message={formError} />
        {editor && !editor.cycle && (
          <Field label="Team member">
            <select
              className="select"
              value={form.employeeId}
              onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))}
            >
              <option value="">Select a person…</option>
              {manageable.map((e) => (
                <option key={e.employeeId} value={e.employeeId}>
                  {e.name} — {e.designation}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Cycle name">
          <input
            className="input"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder={`e.g. Mid-Year Review ${year}`}
          />
        </Field>
        <div className="form-row">
          <Field label="Start date">
            <input
              type="date"
              className="input"
              value={form.startDate}
              onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
            />
          </Field>
          <Field label="End date">
            <input
              type="date"
              className="input"
              value={form.endDate}
              onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
            />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Status">
            <select
              className="select"
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ReviewStatus }))}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
          </Field>
          {editor?.cycle && form.status === 'completed' && (
            <Field label="Rating" hint="Set once the review is completed">
              <select
                className="select"
                value={form.rating}
                onChange={(e) => setForm((f) => ({ ...f, rating: e.target.value }))}
              >
                <option value="">Not rated</option>
                {[5, 4, 3, 2, 1].map((r) => (
                  <option key={r} value={r}>
                    {RATING_LABELS[r]}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
        <Field label="Notes">
          <textarea
            className="textarea"
            rows={3}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="Focus areas, outcomes, follow-ups…"
          />
        </Field>
      </Modal>

      {/* ---- delete confirmation ---- */}
      <ConfirmDialog
        open={deleting !== null}
        title="Delete review cycle"
        message={
          deleting
            ? `Delete "${deleting.name}" for ${deleting.employeeName}? This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        danger
        busy={busy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
