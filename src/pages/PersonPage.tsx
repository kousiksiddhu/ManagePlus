// Module D — person profile: identity header, check-in banner, and the
// Overview / Goals / Feedback / Progress tabs. Works for self-view (any
// employee at /people/<own id>) and manager-view; manager-only actions are
// hidden here and always enforced again on the server.
import { useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { CalendarClock, MessageSquarePlus, Pencil, Star, Target, Trash2, TrendingUp } from 'lucide-react';
import type {
  CheckinStatus,
  DesignationGoal,
  EmployeeOut,
  FeedbackOut,
  FeedbackType,
  IndividualGoal,
  ReviewCycle,
  SkillWillEntry,
} from '../../shared/types';
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
  TagList,
  formatDate,
  growthTone,
  statusLabel,
  statusTone,
  type BadgeTone,
} from '../components/ui';
import '../styles/person.css';

// ---- shared bits -------------------------------------------------------------

const TYPE_META: Record<FeedbackType, { label: string; tone: BadgeTone }> = {
  continuous: { label: 'Check-in', tone: 'success' },
  performance: { label: 'Performance', tone: 'warning' },
  skill: { label: 'Skill', tone: 'accent' },
  learning: { label: 'Learning', tone: 'neutral' },
};

const TYPE_OPTIONS: { value: FeedbackType; label: string }[] = [
  { value: 'continuous', label: 'Check-in (continuous)' },
  { value: 'performance', label: 'Performance' },
  { value: 'skill', label: 'Skill' },
  { value: 'learning', label: 'Learning' },
];

type TabKey = 'overview' | 'goals' | 'feedback' | 'progress';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'goals', label: 'Goals' },
  { key: 'feedback', label: 'Feedback' },
  { key: 'progress', label: 'Progress' },
];

type GoalsData = { designationGoals: DesignationGoal[]; individualGoals: IndividualGoal[] };

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function days(n: number): string {
  return `${n} day${n === 1 ? '' : 's'}`;
}

function dateMs(iso: string): number {
  return new Date(`${iso}T00:00:00`).getTime();
}

function fmtDayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  // include the year — history can span several years (e.g. imported 10x data)
  return d.toLocaleDateString(undefined, { month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : '2-digit', day: 'numeric' });
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="stars" role="img" aria-label={`Rated ${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={13} className={i <= rating ? undefined : 'star-off'} fill={i <= rating ? 'currentColor' : 'none'} />
      ))}
    </span>
  );
}

function StarPicker({ value, onChange, allowClear }: { value: number; onChange: (v: number) => void; allowClear?: boolean }) {
  return (
    <span className="star-picker">
      {[1, 2, 3, 4, 5].map((i) => (
        <button key={i} type="button" onClick={() => onChange(i)} aria-label={`${i} star${i === 1 ? '' : 's'}`}>
          <Star size={18} className={i <= value ? undefined : 'star-off'} fill={i <= value ? 'currentColor' : 'none'} />
        </button>
      ))}
      {allowClear && value > 0 && (
        <button type="button" className="btn btn-ghost btn-sm picker-clear" onClick={() => onChange(0)}>
          Clear
        </button>
      )}
    </span>
  );
}

function StatTile({ label, value, suffix }: { label: string; value: number | string | null; suffix?: string }) {
  return (
    <div className="card stat-tile">
      <div className="stat-label">{label}</div>
      <div className="stat-value">
        {value ?? '—'}
        {value != null && suffix ? <span className="stat-suffix">{suffix}</span> : null}
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="person-fact">
      <div className="fact-label">{label}</div>
      <div className="fact-value">{value}</div>
    </div>
  );
}

// ---- charts (hand-rolled theme-aware SVG) --------------------------------------

interface TrendSeries {
  name: string;
  color: string;
  marker: 'circle' | 'square';
  points: { date: string; value: number }[];
}

/** Multi-series time line chart: hairline grid, 2px lines, ringed markers,
 *  crosshair + tooltip on hover (and arrow keys on focus), legend for >= 2 series. */
function TrendChart({
  series,
  yMin,
  yMax,
  yTicks,
  ariaLabel,
}: {
  series: TrendSeries[];
  yMin: number;
  yMax: number;
  yTicks: number[];
  ariaLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const dates = useMemo(
    () => Array.from(new Set(series.flatMap((s) => s.points.map((p) => p.date)))).sort(),
    [series],
  );
  if (dates.length === 0) return <EmptyState title="No data yet" />;

  const W = 520;
  const H = 200;
  const L = 36;
  const R = 58;
  const T = 14;
  const B = 26;
  const t0 = dateMs(dates[0]);
  const t1 = dateMs(dates[dates.length - 1]);
  const xOf = (d: string) => (t1 === t0 ? L + (W - L - R) / 2 : L + ((dateMs(d) - t0) / (t1 - t0)) * (W - L - R));
  const yOf = (v: number) => T + (1 - (v - yMin) / (yMax - yMin)) * (H - T - B);

  const labelIdx = Array.from(
    new Set(
      dates.length <= 4
        ? dates.map((_, i) => i)
        : [0, Math.round((dates.length - 1) / 3), Math.round(((dates.length - 1) * 2) / 3), dates.length - 1],
    ),
  );

  // Direct end-labels, nudged apart when two lines converge at the right edge.
  const endLabels = series
    .filter((s) => s.points.length > 0)
    .map((s) => {
      const last = s.points[s.points.length - 1];
      return { name: s.name, x: xOf(last.date) + 9, y: yOf(last.value) };
    });
  if (endLabels.length === 2 && Math.abs(endLabels[0].y - endLabels[1].y) < 16) {
    const [hi, lo] = endLabels[0].y <= endLabels[1].y ? [endLabels[0], endLabels[1]] : [endLabels[1], endLabels[0]];
    const mid = (hi.y + lo.y) / 2;
    hi.y = mid - 8;
    lo.y = mid + 8;
  }

  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bestDist = Infinity;
    dates.forEach((d, i) => {
      const dist = Math.abs(xOf(d) - px);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    });
    setHover(best);
  };

  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowRight') setHover((h) => Math.min((h ?? -1) + 1, dates.length - 1));
    else if (e.key === 'ArrowLeft') setHover((h) => Math.max((h ?? dates.length) - 1, 0));
    else if (e.key === 'Escape') setHover(null);
  };

  const hoverDate = hover !== null ? dates[hover] : null;

  return (
    <div className="chart-box">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={ariaLabel}
        tabIndex={0}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        onBlur={() => setHover(null)}
        onKeyDown={onKey}
      >
        {yTicks.map((tk) => (
          <g key={tk}>
            <line x1={L} x2={W - R} y1={yOf(tk)} y2={yOf(tk)} stroke="var(--border)" strokeWidth={1} />
            <text x={L - 8} y={yOf(tk)} dy={3.5} textAnchor="end" fontSize={11} fill="var(--text-secondary)">
              {tk}
            </text>
          </g>
        ))}
        {hoverDate !== null && (
          <line x1={xOf(hoverDate)} x2={xOf(hoverDate)} y1={T} y2={H - B} stroke="var(--muted)" strokeWidth={1} opacity={0.5} />
        )}
        {series.map((s) => {
          if (s.points.length === 0) return null;
          const d = s.points
            .map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.date).toFixed(1)},${yOf(p.value).toFixed(1)}`)
            .join(' ');
          return (
            <path key={s.name} d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          );
        })}
        {series.map((s) =>
          s.points.map((p) => {
            const cx = xOf(p.date);
            const cy = yOf(p.value);
            const active = hoverDate === p.date;
            return s.marker === 'square' ? (
              <rect
                key={`${s.name}-${p.date}`}
                x={cx - (active ? 5 : 4)}
                y={cy - (active ? 5 : 4)}
                width={active ? 10 : 8}
                height={active ? 10 : 8}
                rx={1.5}
                fill={s.color}
                stroke="var(--surface)"
                strokeWidth={2}
              />
            ) : (
              <circle
                key={`${s.name}-${p.date}`}
                cx={cx}
                cy={cy}
                r={active ? 5 : 4}
                fill={s.color}
                stroke="var(--surface)"
                strokeWidth={2}
              />
            );
          }),
        )}
        {endLabels.map((l) => (
          <text key={l.name} x={l.x} y={l.y} dy={4} fontSize={11} fontWeight={600} fill="var(--text-secondary)">
            {l.name}
          </text>
        ))}
        {labelIdx.map((i) => {
          const d = dates[i];
          const anchor = dates.length === 1 ? 'middle' : i === 0 ? 'start' : i === dates.length - 1 ? 'end' : 'middle';
          return (
            <text key={d} x={xOf(d)} y={H - B + 17} textAnchor={anchor} fontSize={11} fill="var(--text-secondary)">
              {fmtDayLabel(d)}
            </text>
          );
        })}
      </svg>
      {hoverDate !== null && (
        <div
          className="chart-tooltip"
          style={{
            left: `${(xOf(hoverDate) / W) * 100}%`,
            top: 6,
            transform: xOf(hoverDate) > W * 0.6 ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)',
          }}
        >
          <div className="tip-title">{fmtDayLabel(hoverDate)}</div>
          {series.map((s) => {
            const p = s.points.find((pt) => pt.date === hoverDate);
            if (!p) return null;
            return (
              <div key={s.name} className="tip-row">
                <span className="tip-label">
                  <span className="tip-key" style={{ borderTopColor: s.color }} />
                  {s.name}
                </span>
                <span className="tip-value">{p.value}</span>
              </div>
            );
          })}
        </div>
      )}
      {series.length >= 2 && (
        <div className="chart-legend">
          {series.map((s) => (
            <span key={s.name} className="legend-item">
              <span className={`legend-swatch ${s.marker}`} style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Skill–will quadrant: 0–10 axes, quadrant labels, historical trail with the
 *  latest snapshot emphasized; nearest-point hover tooltip. */
function QuadrantChart({ entries }: { entries: SkillWillEntry[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (entries.length === 0) {
    return <EmptyState title="No skill/will snapshots yet" message="Snapshots plot here as a quadrant trail." />;
  }

  const W = 470;
  const H = 330;
  const L = 38;
  const R = 16;
  const T = 22;
  const B = 36;
  const xOf = (v: number) => L + (v / 10) * (W - L - R);
  const yOf = (v: number) => T + (1 - v / 10) * (H - T - B);
  const latest = entries[entries.length - 1];

  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const py = ((e.clientY - rect.top) / rect.height) * H;
    let best: number | null = null;
    let bestDist = 26;
    entries.forEach((en, i) => {
      const dist = Math.hypot(xOf(en.skill) - px, yOf(en.will) - py);
      if (dist <= bestDist) {
        bestDist = dist;
        best = i;
      }
    });
    setHover(best);
  };

  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowRight') setHover((h) => Math.min((h ?? -1) + 1, entries.length - 1));
    else if (e.key === 'ArrowLeft') setHover((h) => Math.max((h ?? entries.length) - 1, 0));
    else if (e.key === 'Escape') setHover(null);
  };

  const trail = entries.map((en, i) => `${i === 0 ? 'M' : 'L'}${xOf(en.skill).toFixed(1)},${yOf(en.will).toFixed(1)}`).join(' ');
  const quads: { label: string; x: number; y: number; anchor: 'start' | 'end' }[] = [
    { label: 'GUIDE', x: L + 10, y: T + 16, anchor: 'start' },
    { label: 'DELEGATE', x: W - R - 10, y: T + 16, anchor: 'end' },
    { label: 'DIRECT', x: L + 10, y: H - B - 10, anchor: 'start' },
    { label: 'MOTIVATE', x: W - R - 10, y: H - B - 10, anchor: 'end' },
  ];
  const latestLabelLeft = xOf(latest.skill) > W * 0.72;
  const hovered = hover !== null ? entries[hover] : null;

  return (
    <div className="chart-box">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Skill versus will quadrant chart"
        tabIndex={0}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        onBlur={() => setHover(null)}
        onKeyDown={onKey}
      >
        {/* tint the quadrant the latest snapshot sits in */}
        <rect
          x={latest.skill >= 5 ? xOf(5) : xOf(0)}
          y={latest.will >= 5 ? yOf(10) : yOf(5)}
          width={xOf(5) - xOf(0)}
          height={yOf(5) - yOf(10)}
          fill="var(--accent-soft)"
          opacity={0.55}
        />
        <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="none" stroke="var(--border)" strokeWidth={1} />
        <line x1={xOf(5)} x2={xOf(5)} y1={T} y2={H - B} stroke="var(--border)" strokeWidth={1} />
        <line x1={L} x2={W - R} y1={yOf(5)} y2={yOf(5)} stroke="var(--border)" strokeWidth={1} />
        {quads.map((q) => (
          <text key={q.label} x={q.x} y={q.y} textAnchor={q.anchor} fontSize={10} fontWeight={650} letterSpacing="0.08em" fill="var(--muted)">
            {q.label}
          </text>
        ))}
        {[0, 5, 10].map((v) => (
          <g key={v}>
            <text x={xOf(v)} y={H - B + 15} textAnchor="middle" fontSize={11} fill="var(--text-secondary)">
              {v}
            </text>
            <text x={L - 8} y={yOf(v)} dy={3.5} textAnchor="end" fontSize={11} fill="var(--text-secondary)">
              {v}
            </text>
          </g>
        ))}
        <text x={(L + W - R) / 2} y={H - 5} textAnchor="middle" fontSize={11} fill="var(--text-secondary)">
          Skill →
        </text>
        <text
          transform={`rotate(-90 12 ${(T + H - B) / 2})`}
          x={12}
          y={(T + H - B) / 2}
          textAnchor="middle"
          fontSize={11}
          fill="var(--text-secondary)"
        >
          Will →
        </text>
        {entries.length > 1 && (
          <path d={trail} fill="none" stroke="var(--accent)" strokeWidth={1.5} opacity={0.35} strokeLinecap="round" strokeLinejoin="round" />
        )}
        {entries.map((en, i) => {
          if (i === entries.length - 1) return null;
          const fade = entries.length > 1 ? 0.35 + 0.55 * (i / (entries.length - 1)) : 1;
          return (
            <circle
              key={en.id}
              cx={xOf(en.skill)}
              cy={yOf(en.will)}
              r={hover === i ? 5.5 : 4.5}
              fill="var(--accent)"
              opacity={fade}
              stroke="var(--surface)"
              strokeWidth={2}
            />
          );
        })}
        <circle cx={xOf(latest.skill)} cy={yOf(latest.will)} r={11} fill="var(--accent)" opacity={0.15} />
        <circle
          cx={xOf(latest.skill)}
          cy={yOf(latest.will)}
          r={hover === entries.length - 1 ? 7 : 6}
          fill="var(--accent)"
          stroke="var(--surface)"
          strokeWidth={2}
        />
        <text
          x={xOf(latest.skill) + (latestLabelLeft ? -14 : 14)}
          y={yOf(latest.will)}
          dy={4}
          textAnchor={latestLabelLeft ? 'end' : 'start'}
          fontSize={11}
          fontWeight={600}
          fill="var(--text-secondary)"
        >
          {fmtDayLabel(latest.date)}
        </text>
      </svg>
      {hovered && hover !== null && (
        <div
          className="chart-tooltip"
          style={{
            left: `${(xOf(hovered.skill) / W) * 100}%`,
            top: `${(yOf(hovered.will) / H) * 100}%`,
            transform: `translate(${xOf(hovered.skill) > W * 0.66 ? '-100%' : xOf(hovered.skill) < W * 0.33 ? '0%' : '-50%'}, ${
              yOf(hovered.will) < H * 0.4 ? '16px' : 'calc(-100% - 16px)'
            })`,
          }}
        >
          <div className="tip-title">{formatDate(hovered.date)}</div>
          <div className="tip-row">
            <span className="tip-label">Skill</span>
            <span className="tip-value">{hovered.skill}/10</span>
          </div>
          <div className="tip-row">
            <span className="tip-label">Will</span>
            <span className="tip-value">{hovered.will}/10</span>
          </div>
          {hovered.notes && <div className="tip-note">{hovered.notes}</div>}
        </div>
      )}
    </div>
  );
}

// ---- feedback card ------------------------------------------------------------

function FeedbackCard({
  entry,
  canEdit,
  onEdit,
  onDelete,
}: {
  entry: FeedbackOut;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const meta = TYPE_META[entry.type];
  return (
    <div className="card feedback-item">
      <div className="fb-top">
        <Badge tone={meta.tone}>{meta.label}</Badge>
        {entry.type === 'skill' && entry.skill && <span className="chip">{entry.skill}</span>}
        {entry.goalTitle ? (
          <span className="chip goal-chip">
            <Target size={11} /> {entry.goalTitle}
          </span>
        ) : (
          <span className="chip">General</span>
        )}
        {entry.rating != null && <Stars rating={entry.rating} />}
        <span className="fb-spacer" />
        <span className="fb-meta">
          {entry.authorName} · {formatDate(entry.date)}
        </span>
        {canEdit && (
          <span className="fb-actions">
            <button className="icon-btn" onClick={onEdit} aria-label="Edit feedback">
              <Pencil size={14} />
            </button>
            <button className="icon-btn danger" onClick={onDelete} aria-label="Delete feedback">
              <Trash2 size={14} />
            </button>
          </span>
        )}
      </div>
      <p className="fb-text">{entry.text}</p>
    </div>
  );
}

// ---- modals ---------------------------------------------------------------------

function FeedbackModal({
  employeeId,
  designation,
  editing,
  presetType,
  goals,
  onClose,
  onSaved,
}: {
  employeeId: string;
  designation: string;
  editing: FeedbackOut | null;
  presetType?: FeedbackType;
  goals: GoalsData | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<FeedbackType>(editing?.type ?? presetType ?? 'performance');
  const [text, setText] = useState(editing?.text ?? '');
  const [skill, setSkill] = useState(editing?.skill ?? '');
  const [goalId, setGoalId] = useState(editing?.goalId ?? '');
  const [rating, setRating] = useState(editing?.rating ?? 0);
  const [date, setDate] = useState(editing?.date ?? todayIso());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const showRating = type === 'continuous' || type === 'performance';
  const individualGoals = goals?.individualGoals ?? [];
  const designationGoals = goals?.designationGoals ?? [];
  const goalKnown =
    !goalId || individualGoals.some((g) => g.id === goalId) || designationGoals.some((g) => g.id === goalId);

  async function submit() {
    if (!text.trim()) {
      setError('Feedback text is required.');
      return;
    }
    if (type === 'skill' && !skill.trim()) {
      setError('Enter the skill this feedback is about.');
      return;
    }
    if (type === 'continuous' && rating === 0) {
      setError('Select a rating for the check-in.');
      return;
    }
    setBusy(true);
    setError(null);
    const body = {
      type,
      text: text.trim(),
      skill: type === 'skill' ? skill.trim() : '',
      goalId: goalId || null,
      rating: showRating && rating > 0 ? rating : null,
      date,
    };
    try {
      if (editing) {
        await api(`/api/feedback/${editing.id}`, { method: 'PATCH', body });
      } else {
        await api(`/api/employees/${encodeURIComponent(employeeId)}/feedback`, { method: 'POST', body });
      }
      onSaved();
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? 'Edit feedback' : presetType === 'continuous' ? 'Log check-in' : 'Add feedback'}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => void submit()} disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save changes' : presetType === 'continuous' ? 'Log check-in' : 'Add feedback'}
          </button>
        </>
      }
    >
      <ErrorBanner message={error} />
      <div className="form-row">
        <Field label="Type">
          <select className="select" value={type} onChange={(e) => setType(e.target.value as FeedbackType)}>
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date">
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      {type === 'skill' && (
        <Field label="Skill" hint="Which skill is this feedback about?">
          <input
            className="input"
            value={skill}
            onChange={(e) => setSkill(e.target.value)}
            placeholder="e.g. React, Kubernetes, Communication"
          />
        </Field>
      )}
      <Field label="Feedback">
        <textarea
          className="textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What did you observe? Be specific."
          rows={4}
        />
      </Field>
      <Field label="Tag a goal (optional)">
        <select className="select" value={goalId} onChange={(e) => setGoalId(e.target.value)}>
          <option value="">General — no goal</option>
          {!goalKnown && editing?.goalId && <option value={editing.goalId}>{editing.goalTitle ?? 'Tagged goal'}</option>}
          {individualGoals.length > 0 && (
            <optgroup label="Individual goals">
              {individualGoals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </optgroup>
          )}
          {designationGoals.length > 0 && (
            <optgroup label={`${designation} goals`}>
              {designationGoals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </Field>
      {showRating && (
        <Field label={type === 'continuous' ? 'Rating' : 'Rating (optional)'}>
          <StarPicker value={rating ?? 0} onChange={setRating} allowClear={type === 'performance'} />
        </Field>
      )}
    </Modal>
  );
}

function SnapshotModal({
  employeeId,
  latest,
  onClose,
  onSaved,
}: {
  employeeId: string;
  latest: SkillWillEntry | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [skill, setSkill] = useState(String(latest?.skill ?? 5));
  const [will, setWill] = useState(String(latest?.will ?? 5));
  const [date, setDate] = useState(todayIso());
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const s = Number(skill);
    const w = Number(will);
    if (!Number.isInteger(s) || s < 1 || s > 10 || !Number.isInteger(w) || w < 1 || w > 10) {
      setError('Skill and will must be whole numbers from 1 to 10.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/api/employees/${encodeURIComponent(employeeId)}/skillwill`, {
        method: 'POST',
        body: { skill: s, will: w, notes: notes.trim(), date },
      });
      onSaved();
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Log skill/will snapshot"
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => void submit()} disabled={busy}>
            {busy ? 'Saving…' : 'Log snapshot'}
          </button>
        </>
      }
    >
      <ErrorBanner message={error} />
      <div className="form-row">
        <Field label="Skill (1–10)" hint="Competence for their current scope">
          <input className="input" type="number" min={1} max={10} value={skill} onChange={(e) => setSkill(e.target.value)} />
        </Field>
        <Field label="Will (1–10)" hint="Motivation and drive">
          <input className="input" type="number" min={1} max={10} value={will} onChange={(e) => setWill(e.target.value)} />
        </Field>
      </div>
      <Field label="Date">
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="Notes (optional)">
        <textarea
          className="textarea"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Context for this snapshot"
          rows={3}
        />
      </Field>
    </Modal>
  );
}

// ---- page -----------------------------------------------------------------------

export default function PersonPage() {
  const { id = '' } = useParams();
  const { me } = useAuth();
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const [tab, setTab] = useState<TabKey>(
    TABS.some((t) => t.key === requestedTab) ? (requestedTab as TabKey) : 'overview',
  );
  const [fbModal, setFbModal] = useState<{ editing: FeedbackOut | null; presetType?: FeedbackType } | null>(null);
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const [deleting, setDeleting] = useState<FeedbackOut | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const eid = encodeURIComponent(id);
  const profile = useFetch<{ employee: EmployeeOut; mentorName: string | null }>(`/api/employees/${eid}/profile`);
  const feedback = useFetch<{ feedback: FeedbackOut[] }>(`/api/employees/${eid}/feedback`);
  const skillwill = useFetch<{ entries: SkillWillEntry[] }>(`/api/employees/${eid}/skillwill`);
  const checkin = useFetch<CheckinStatus>(`/api/employees/${eid}/checkin`);
  const goals = useFetch<GoalsData>(`/api/employees/${eid}/goals`);
  const reviews = useFetch<{ cycles: ReviewCycle[] }>(`/api/employees/${eid}/reviews`);

  // Honor ?tab= deep links; reset to overview when switching people without one.
  useEffect(() => {
    setTab(TABS.some((t) => t.key === requestedTab) ? (requestedTab as TabKey) : 'overview');
    setActionError(null);
  }, [id, requestedTab]);

  const entries = useMemo(
    () => [...(skillwill.data?.entries ?? [])].sort((a, b) => (a.date < b.date ? -1 : 1)),
    [skillwill.data],
  );
  const checkinsAsc = useMemo(
    () =>
      (feedback.data?.feedback ?? [])
        .filter((f) => f.type === 'continuous' && f.rating != null)
        .sort((a, b) => (a.date < b.date ? -1 : 1)),
    [feedback.data],
  );

  if (!me) return null;
  const canManage = me.role === 'admin' || (me.role === 'manager' && id !== me.employeeId);

  if (profile.loading) {
    return (
      <div className="page">
        <PageHeader title="Profile" />
        <Spinner />
      </div>
    );
  }
  if (profile.error || !profile.data) {
    return (
      <div className="page">
        <PageHeader title="Profile" />
        {profile.error ? <ErrorBanner message={profile.error} /> : <EmptyState title="Person not found" />}
      </div>
    );
  }

  const emp = profile.data.employee;
  const mentorName = profile.data.mentorName;
  const fbList = feedback.data?.feedback ?? [];
  const latest = entries.length > 0 ? entries[entries.length - 1] : null;
  const lastRating = (() => {
    const cycles = [...(reviews.data?.cycles ?? [])].sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
    return cycles.find((c) => c.rating != null)?.rating ?? null;
  })();
  const openGoals = goals.data ? goals.data.individualGoals.filter((g) => g.status !== 'completed').length : null;

  const trendSeries: TrendSeries[] = [
    { name: 'Skill', color: 'var(--accent)', marker: 'circle', points: entries.map((e) => ({ date: e.date, value: e.skill })) },
    { name: 'Will', color: 'var(--success)', marker: 'square', points: entries.map((e) => ({ date: e.date, value: e.will })) },
  ];
  const ratingSeries: TrendSeries[] = [
    {
      name: 'Rating',
      color: 'var(--accent)',
      marker: 'circle',
      points: checkinsAsc.map((f) => ({ date: f.date, value: f.rating ?? 0 })),
    },
  ];

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setActionError(null);
    try {
      await api(`/api/feedback/${deleting.id}`, { method: 'DELETE' });
      setDeleting(null);
      feedback.reload();
      checkin.reload();
    } catch (e) {
      setActionError(errMsg(e));
      setDeleting(null);
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="page">
      <PageHeader
        title={emp.name}
        subtitle={`${emp.designation} · ${emp.employeeId}`}
        actions={
          canManage ? (
            <button className="btn btn-primary" onClick={() => setFbModal({ editing: null })}>
              <MessageSquarePlus size={15} /> Add feedback
            </button>
          ) : undefined
        }
      />

      <div className="card person-header">
        <Avatar name={emp.name} size={64} />
        <div className="person-header-main">
          <div className="person-facts">
            <Fact label="Email" value={emp.email} />
            <Fact label="Mentor" value={mentorName ?? '—'} />
            <Fact
              label="Growth"
              value={emp.growthStatus ? <Badge tone={growthTone(emp.growthStatus)}>{emp.growthStatus}</Badge> : '—'}
            />
            <Fact label="Current project" value={emp.currentProject || '—'} />
            <Fact label="Joined" value={formatDate(emp.joinDate)} />
          </div>
          <div className="person-skills">
            <TagList value={emp.skills} />
          </div>
        </div>
      </div>

      {checkin.data && checkin.data.overdueDays >= -14 && (
        <div className={`person-banner ${checkin.data.overdueDays > 0 ? 'danger' : 'warning'}`}>
          <CalendarClock size={18} />
          <div className="banner-text">
            <strong>
              {checkin.data.overdueDays > 0
                ? checkin.data.lastCheckin
                  ? `Check-in overdue by ${days(checkin.data.overdueDays)}`
                  : 'No check-in logged yet'
                : checkin.data.overdueDays === 0
                  ? 'Check-in due today'
                  : `Check-in due in ${days(-checkin.data.overdueDays)}`}
            </strong>
            <div className="banner-sub">
              {checkin.data.lastCheckin ? `Last check-in ${formatDate(checkin.data.lastCheckin)}` : 'No check-ins logged yet'} · due{' '}
              {formatDate(checkin.data.dueDate)}
            </div>
          </div>
          {canManage && (
            <button className="btn btn-sm" onClick={() => setFbModal({ editing: null, presetType: 'continuous' })}>
              Log check-in
            </button>
          )}
        </div>
      )}

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <ErrorBanner message={actionError} />

      {tab === 'overview' && (
        <>
          <div className="stat-row">
            <StatTile label="Latest skill" value={latest ? latest.skill : null} suffix="/10" />
            <StatTile label="Latest will" value={latest ? latest.will : null} suffix="/10" />
            <StatTile label="Last review" value={lastRating} suffix="/5" />
            <StatTile label="Open goals" value={openGoals} />
            <StatTile label="Feedback" value={feedback.data ? fbList.length : null} />
          </div>
          <div className="person-overview-grid">
            <div className="card">
              <div className="card-title">Skill–will matrix</div>
              {skillwill.loading ? (
                <Spinner />
              ) : skillwill.error ? (
                <ErrorBanner message={skillwill.error} />
              ) : (
                <QuadrantChart entries={entries} />
              )}
            </div>
            <div className="card">
              <div className="card-title">Recent feedback</div>
              {feedback.loading ? (
                <Spinner />
              ) : feedback.error ? (
                <ErrorBanner message={feedback.error} />
              ) : fbList.length === 0 ? (
                <EmptyState
                  title="No feedback yet"
                  message={canManage ? 'Use "Add feedback" to log the first entry.' : undefined}
                />
              ) : (
                <>
                  {fbList.slice(0, 4).map((f) => (
                    <div key={f.id} className="fb-mini">
                      <div className="fb-mini-top">
                        <Badge tone={TYPE_META[f.type].tone}>{TYPE_META[f.type].label}</Badge>
                        <span className="small muted">
                          {f.authorName} · {formatDate(f.date)}
                        </span>
                      </div>
                      <p className="fb-mini-text">{f.text}</p>
                    </div>
                  ))}
                  <div style={{ marginTop: 10 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setTab('feedback')}>
                      View all {fbList.length} entries →
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {tab === 'goals' &&
        (goals.loading ? (
          <Spinner />
        ) : goals.error ? (
          <ErrorBanner message={goals.error} />
        ) : goals.data ? (
          <>
            {canManage && (
              <div className="person-toolbar">
                <span className="small muted toolbar-note">
                  Effective goals: everything expected of a {emp.designation}, plus individual goals on top.
                </span>
                <Link className="btn btn-sm" to="/goals">
                  <Target size={14} /> Manage goals
                </Link>
              </div>
            )}
            <div className="person-goals">
              <div className="card">
                <div className="card-title">Designation goals · applies to all {emp.designation}s</div>
                {goals.data.designationGoals.length === 0 ? (
                  <EmptyState title="No designation goals" message={`No common goals defined for ${emp.designation} yet.`} />
                ) : (
                  <div className="person-goal-list">
                    {goals.data.designationGoals.map((g) => (
                      <div key={g.id} className="person-goal">
                        <div className="goal-top">
                          <span className="goal-title">{g.title}</span>
                          {g.category && <Badge tone="neutral">{g.category}</Badge>}
                        </div>
                        {g.description && <p className="goal-desc small text-secondary">{g.description}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="card">
                <div className="card-title">Individual goals · on top</div>
                {goals.data.individualGoals.length === 0 ? (
                  <EmptyState
                    title="No individual goals"
                    message={canManage ? 'Add personal goals from the Goals page.' : 'Personal goals will appear here.'}
                  />
                ) : (
                  <div className="person-goal-list">
                    {goals.data.individualGoals.map((g) => (
                      <div key={g.id} className="person-goal">
                        <div className="goal-top">
                          <span className="goal-title">{g.title}</span>
                          {g.category && <Badge tone="neutral">{g.category}</Badge>}
                          <Badge tone={statusTone(g.status)}>{statusLabel(g.status)}</Badge>
                          {g.targetDate && <span className="small muted">Target {formatDate(g.targetDate)}</span>}
                        </div>
                        {g.description && <p className="goal-desc small text-secondary">{g.description}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : null)}

      {tab === 'feedback' && (
        <>
          <div className="person-toolbar">
            <span className="small muted toolbar-note">
              {feedback.data ? `${fbList.length} ${fbList.length === 1 ? 'entry' : 'entries'}` : ''}
            </span>
            {canManage && (
              <button className="btn btn-primary btn-sm" onClick={() => setFbModal({ editing: null })}>
                <MessageSquarePlus size={14} /> Add feedback
              </button>
            )}
          </div>
          {feedback.loading ? (
            <Spinner />
          ) : feedback.error ? (
            <ErrorBanner message={feedback.error} />
          ) : fbList.length === 0 ? (
            <EmptyState
              title="No feedback yet"
              message={canManage ? `Log the first feedback entry for ${emp.name}.` : 'Feedback from your manager will appear here.'}
            />
          ) : (
            <div className="person-feedback-list">
              {fbList.map((f) => (
                <FeedbackCard
                  key={f.id}
                  entry={f}
                  canEdit={me.role === 'admin' || f.authorId === me.employeeId}
                  onEdit={() => setFbModal({ editing: f })}
                  onDelete={() => setDeleting(f)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'progress' && (
        <>
          {canManage && (
            <div className="person-toolbar">
              <button className="btn btn-primary btn-sm" onClick={() => setSnapshotOpen(true)}>
                <TrendingUp size={14} /> Log skill/will snapshot
              </button>
            </div>
          )}
          <div className="person-charts">
            <div className="card">
              <div className="card-title">Skill & will over time</div>
              {skillwill.loading ? (
                <Spinner />
              ) : skillwill.error ? (
                <ErrorBanner message={skillwill.error} />
              ) : entries.length === 0 ? (
                <EmptyState
                  title="No snapshots yet"
                  message={canManage ? 'Log the first skill/will snapshot to start the trend.' : undefined}
                />
              ) : (
                <TrendChart
                  series={trendSeries}
                  yMin={0}
                  yMax={10}
                  yTicks={[0, 5, 10]}
                  ariaLabel={`Skill and will trend for ${emp.name}`}
                />
              )}
            </div>
            <div className="card">
              <div className="card-title">Check-in ratings over time</div>
              {feedback.loading ? (
                <Spinner />
              ) : feedback.error ? (
                <ErrorBanner message={feedback.error} />
              ) : checkinsAsc.length === 0 ? (
                <EmptyState title="No check-ins yet" message="Quarterly check-in ratings chart here once logged." />
              ) : (
                <TrendChart
                  series={ratingSeries}
                  yMin={1}
                  yMax={5}
                  yTicks={[1, 3, 5]}
                  ariaLabel={`Check-in rating trend for ${emp.name}`}
                />
              )}
            </div>
          </div>
          {entries.length > 0 && (
            <div className="table-wrap" style={{ marginTop: 16 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Skill</th>
                    <th>Will</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {[...entries].reverse().map((e) => (
                    <tr key={e.id}>
                      <td>{formatDate(e.date)}</td>
                      <td className="mono">{e.skill}/10</td>
                      <td className="mono">{e.will}/10</td>
                      <td className="text-secondary">{e.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {fbModal && (
        <FeedbackModal
          employeeId={id}
          designation={emp.designation}
          editing={fbModal.editing}
          presetType={fbModal.presetType}
          goals={goals.data}
          onClose={() => setFbModal(null)}
          onSaved={() => {
            setFbModal(null);
            feedback.reload();
            checkin.reload();
          }}
        />
      )}
      {snapshotOpen && (
        <SnapshotModal
          employeeId={id}
          latest={latest}
          onClose={() => setSnapshotOpen(false)}
          onSaved={() => {
            setSnapshotOpen(false);
            skillwill.reload();
          }}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        title="Delete feedback"
        message={
          deleting
            ? `Delete this ${TYPE_META[deleting.type].label.toLowerCase()} entry from ${formatDate(deleting.date)}? This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        danger
        busy={deleteBusy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
