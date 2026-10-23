// Module B — Goals. Tab 1: designation-wide goals (common to every employee
// with that designation). Tab 2: individual goals layered on top per person.
import { useMemo, useState } from 'react';
import { CalendarDays, ChevronRight, Layers, Pencil, Plus, Target, Trash2 } from 'lucide-react';
import type { DesignationGoal, EmployeeOut, GoalStatus, IndividualGoal } from '../../shared/types';
import { api, useFetch } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import {
  Avatar,
  Badge,
  type BadgeTone,
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
import '../styles/goals.css';

interface EffectiveGoals {
  designationGoals: DesignationGoal[];
  individualGoals: IndividualGoal[];
}

const GOAL_STATUSES: GoalStatus[] = ['not_started', 'in_progress', 'completed'];

const NEXT_STATUS: Record<GoalStatus, GoalStatus> = {
  not_started: 'in_progress',
  in_progress: 'completed',
  completed: 'not_started',
};

const STATUS_ORDER: Record<GoalStatus, number> = { in_progress: 0, not_started: 1, completed: 2 };

const CATEGORY_TONES: BadgeTone[] = ['accent', 'success', 'warning', 'neutral'];

/** Deterministic tone per category so the same category is always the same color. */
function categoryTone(category: string): BadgeTone {
  let hash = 0;
  for (const ch of category) hash = (hash * 31 + ch.charCodeAt(0)) % 4096;
  return CATEGORY_TONES[hash % CATEGORY_TONES.length];
}

function firstName(name: string): string {
  return name.split(/\s+/)[0] ?? name;
}

// ---- goal cards -------------------------------------------------------------

function DesignationGoalCard({
  goal,
  onEdit,
  onDelete,
}: {
  goal: DesignationGoal;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="card goal-card">
      <div className="goal-card-head">
        <div className="goal-card-title">{goal.title}</div>
        {onEdit && onDelete && (
          <div className="goal-card-actions">
            <button className="icon-btn" onClick={onEdit} aria-label={`Edit ${goal.title}`}>
              <Pencil size={15} />
            </button>
            <button className="icon-btn danger" onClick={onDelete} aria-label={`Delete ${goal.title}`}>
              <Trash2 size={15} />
            </button>
          </div>
        )}
      </div>
      {goal.description && <p className="goal-card-desc">{goal.description}</p>}
      {goal.category && (
        <div className="goal-card-meta">
          <Badge tone={categoryTone(goal.category)}>{goal.category}</Badge>
        </div>
      )}
    </div>
  );
}

function IndividualGoalCard({
  goal,
  cycling,
  onCycle,
  onEdit,
  onDelete,
}: {
  goal: IndividualGoal;
  cycling: boolean;
  onCycle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="card goal-card">
      <div className="goal-card-head">
        <div className="goal-card-title">{goal.title}</div>
        <div className="goal-card-actions">
          <button className="icon-btn" onClick={onEdit} aria-label={`Edit ${goal.title}`}>
            <Pencil size={15} />
          </button>
          <button className="icon-btn danger" onClick={onDelete} aria-label={`Delete ${goal.title}`}>
            <Trash2 size={15} />
          </button>
        </div>
      </div>
      {goal.description && <p className="goal-card-desc">{goal.description}</p>}
      <div className="goal-card-meta">
        <button
          className={`status-cycle badge badge-${statusTone(goal.status)}`}
          onClick={onCycle}
          disabled={cycling}
          title={`Click to mark ${statusLabel(NEXT_STATUS[goal.status])}`}
        >
          {statusLabel(goal.status)}
          <ChevronRight size={12} />
        </button>
        {goal.category && <Badge tone={categoryTone(goal.category)}>{goal.category}</Badge>}
        {goal.targetDate && (
          <span className="target-date">
            <CalendarDays size={13} />
            {formatDate(goal.targetDate)}
          </span>
        )}
      </div>
    </div>
  );
}

// ---- modals ------------------------------------------------------------------

function DesignationGoalModal({
  initial,
  designations,
  defaultDesignation,
  onClose,
  onSaved,
}: {
  initial: DesignationGoal | null;
  designations: string[];
  defaultDesignation: string;
  onClose: () => void;
  onSaved: (goal: DesignationGoal) => void;
}) {
  const [designation, setDesignation] = useState(initial?.designation ?? defaultDesignation);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [category, setCategory] = useState(initial?.category ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = {
        designation,
        title: title.trim(),
        description: description.trim(),
        category: category.trim(),
      };
      const { goal } = initial
        ? await api<{ goal: DesignationGoal }>(`/api/goals/designation/${initial.id}`, {
            method: 'PATCH',
            body,
          })
        : await api<{ goal: DesignationGoal }>('/api/goals/designation', { method: 'POST', body });
      onSaved(goal);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? 'Edit designation goal' : 'New designation goal'}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => void save()} disabled={busy}>
            {busy ? 'Saving…' : initial ? 'Save changes' : 'Create goal'}
          </button>
        </>
      }
    >
      <ErrorBanner message={error} />
      <Field label="Designation" hint="This goal applies to every employee with this designation.">
        <select
          className="select"
          value={designation}
          onChange={(e) => setDesignation(e.target.value)}
        >
          {designations.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Title">
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Mentor associate engineers"
          autoFocus
        />
      </Field>
      <Field label="Category">
        <input
          className="input"
          list="goal-category-options"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="e.g. Leadership"
        />
      </Field>
      <Field label="Description">
        <textarea
          className="textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What does success look like?"
        />
      </Field>
    </Modal>
  );
}

function IndividualGoalModal({
  initial,
  person,
  onClose,
  onSaved,
}: {
  initial: IndividualGoal | null;
  person: EmployeeOut;
  onClose: () => void;
  onSaved: (goal: IndividualGoal) => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [category, setCategory] = useState(initial?.category ?? '');
  const [status, setStatus] = useState<GoalStatus>(initial?.status ?? 'not_started');
  const [targetDate, setTargetDate] = useState(initial?.targetDate ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = {
        title: title.trim(),
        description: description.trim(),
        category: category.trim(),
        status,
        targetDate,
      };
      const { goal } = initial
        ? await api<{ goal: IndividualGoal }>(`/api/goals/individual/${initial.id}`, {
            method: 'PATCH',
            body,
          })
        : await api<{ goal: IndividualGoal }>(`/api/employees/${person.employeeId}/goals`, {
            method: 'POST',
            body,
          });
      onSaved(goal);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? `Edit goal for ${firstName(person.name)}` : `New goal for ${firstName(person.name)}`}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => void save()} disabled={busy}>
            {busy ? 'Saving…' : initial ? 'Save changes' : 'Create goal'}
          </button>
        </>
      }
    >
      <ErrorBanner message={error} />
      <Field label="Title" hint={`Layered on top of the ${person.designation} goals.`}>
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Lead the v2 launch end-to-end"
          autoFocus
        />
      </Field>
      <div className="form-row">
        <Field label="Status">
          <select
            className="select"
            value={status}
            onChange={(e) => setStatus(e.target.value as GoalStatus)}
          >
            {GOAL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Target date">
          <input
            className="input"
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Category">
        <input
          className="input"
          list="goal-category-options"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="e.g. Delivery"
        />
      </Field>
      <Field label="Description">
        <textarea
          className="textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What does success look like?"
        />
      </Field>
    </Modal>
  );
}

// ---- page ---------------------------------------------------------------------

type TabId = 'designation' | 'individual';

export default function GoalsPage() {
  const { me } = useAuth();
  const [tab, setTab] = useState<TabId>('designation');

  // Tab 1 — designation goals
  const designationsFetch = useFetch<{ designations: string[] }>('/api/designations');
  const dgFetch = useFetch<{ goals: DesignationGoal[] }>('/api/goals/designation');
  const [pickedDesignation, setPickedDesignation] = useState<string | null>(null);

  // Tab 2 — individual goals layered per person
  const employeesFetch = useFetch<{ employees: EmployeeOut[] }>(
    `/api/employees?view=flat${me?.role === 'admin' ? '&scope=all' : ''}`,
  );
  const [pickedPersonId, setPickedPersonId] = useState<string | null>(null);

  const designations = designationsFetch.data?.designations ?? [];
  const selectedDesignation = pickedDesignation ?? designations[0] ?? null;

  const people = useMemo(() => {
    const list = employeesFetch.data?.employees ?? [];
    const filtered =
      me && me.role === 'manager' ? list.filter((e) => e.employeeId !== me.employeeId) : list;
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [employeesFetch.data, me]);

  const selectedPersonId =
    pickedPersonId && people.some((p) => p.employeeId === pickedPersonId)
      ? pickedPersonId
      : (people[0]?.employeeId ?? null);
  const selectedPerson = people.find((p) => p.employeeId === selectedPersonId) ?? null;

  const effFetch = useFetch<EffectiveGoals>(
    selectedPersonId ? `/api/employees/${selectedPersonId}/goals` : null,
  );

  const sortedIndividualGoals = useMemo(() => {
    const goals = effFetch.data?.individualGoals ?? [];
    return [...goals].sort((a, b) => {
      const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      if (byStatus !== 0) return byStatus;
      return (a.targetDate || '9999').localeCompare(b.targetDate || '9999');
    });
  }, [effFetch.data]);

  const categorySuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const g of dgFetch.data?.goals ?? []) if (g.category) set.add(g.category);
    for (const g of effFetch.data?.individualGoals ?? []) if (g.category) set.add(g.category);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [dgFetch.data, effFetch.data]);

  // Modals / dialogs / transient action state
  const [dgModal, setDgModal] = useState<{ goal: DesignationGoal | null } | null>(null);
  const [igModal, setIgModal] = useState<{ goal: IndividualGoal | null } | null>(null);
  const [dgToDelete, setDgToDelete] = useState<DesignationGoal | null>(null);
  const [igToDelete, setIgToDelete] = useState<IndividualGoal | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [cyclingId, setCyclingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!me) return null;

  const goalsForDesignation = (dgFetch.data?.goals ?? []).filter(
    (g) => g.designation === selectedDesignation,
  );

  function countFor(designation: string): number {
    return (dgFetch.data?.goals ?? []).filter((g) => g.designation === designation).length;
  }

  function jumpToDesignation(designation: string) {
    setPickedDesignation(designation);
    setTab('designation');
  }

  async function cycleStatus(goal: IndividualGoal) {
    setCyclingId(goal.id);
    setActionError(null);
    try {
      await api(`/api/goals/individual/${goal.id}`, {
        method: 'PATCH',
        body: { status: NEXT_STATUS[goal.status] },
      });
      effFetch.reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setCyclingId(null);
    }
  }

  async function confirmDeleteDesignationGoal() {
    if (!dgToDelete) return;
    setDeleteBusy(true);
    setActionError(null);
    try {
      await api(`/api/goals/designation/${dgToDelete.id}`, { method: 'DELETE' });
      dgFetch.reload();
      effFetch.reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setDgToDelete(null);
      setDeleteBusy(false);
    }
  }

  async function confirmDeleteIndividualGoal() {
    if (!igToDelete) return;
    setDeleteBusy(true);
    setActionError(null);
    try {
      await api(`/api/goals/individual/${igToDelete.id}`, { method: 'DELETE' });
      effFetch.reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setIgToDelete(null);
      setDeleteBusy(false);
    }
  }

  const tab1Loading =
    (designationsFetch.loading && !designationsFetch.data) || (dgFetch.loading && !dgFetch.data);
  const tab1Error = designationsFetch.error ?? dgFetch.error;

  return (
    <div className="page">
      <PageHeader
        title="Goals"
        subtitle="Common goals per designation, with individual goals layered on top per person."
        actions={
          tab === 'designation' ? (
            <button
              className="btn btn-primary"
              onClick={() => setDgModal({ goal: null })}
              disabled={!selectedDesignation}
            >
              <Plus size={15} />
              New designation goal
            </button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={() => setIgModal({ goal: null })}
              disabled={!selectedPerson}
            >
              <Plus size={15} />
              New individual goal
            </button>
          )
        }
      />

      <div className="tabs">
        <button
          className={tab === 'designation' ? 'tab active' : 'tab'}
          onClick={() => setTab('designation')}
        >
          Designation goals
        </button>
        <button
          className={tab === 'individual' ? 'tab active' : 'tab'}
          onClick={() => setTab('individual')}
        >
          Individual goals
        </button>
      </div>

      <ErrorBanner message={actionError} />

      {tab === 'designation' && (
        <>
          <ErrorBanner message={tab1Error} />
          {tab1Loading ? (
            <Spinner />
          ) : (
            <>
              <div className="goals-picker">
                {designations.map((d) => (
                  <button
                    key={d}
                    className={
                      d === selectedDesignation ? 'goals-picker-chip active' : 'goals-picker-chip'
                    }
                    onClick={() => setPickedDesignation(d)}
                  >
                    {d}
                    <span className="count">{countFor(d)}</span>
                  </button>
                ))}
              </div>
              {selectedDesignation === null ? (
                <div className="card">
                  <EmptyState
                    title="No designations found"
                    message="Add people to the team to define designation goals."
                  />
                </div>
              ) : (
                <div className="goal-section">
                  <div className="goal-section-head">
                    <span className="goal-section-title">
                      <Layers size={15} />
                      Common goals · {selectedDesignation}
                    </span>
                    <span className="goal-section-note">
                      Every {selectedDesignation} shares these goals.
                    </span>
                  </div>
                  {goalsForDesignation.length === 0 ? (
                    <div className="card">
                      <EmptyState
                        title={`No goals for ${selectedDesignation} yet`}
                        message="Create the common goals every employee of this designation should share."
                      />
                    </div>
                  ) : (
                    <div className="goal-grid">
                      {goalsForDesignation.map((goal) => (
                        <DesignationGoalCard
                          key={goal.id}
                          goal={goal}
                          onEdit={() => setDgModal({ goal })}
                          onDelete={() => setDgToDelete(goal)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}

      {tab === 'individual' && (
        <>
          <ErrorBanner message={employeesFetch.error} />
          {employeesFetch.loading && !employeesFetch.data ? (
            <Spinner />
          ) : people.length === 0 ? (
            <div className="card">
              <EmptyState
                title="No team members"
                message="Individual goals are set for the people in your team."
              />
            </div>
          ) : (
            <div className="goals-people-layout">
              <div className="card goals-person-list">
                {people.map((p) => (
                  <button
                    key={p.employeeId}
                    className={
                      p.employeeId === selectedPersonId
                        ? 'goals-person-item active'
                        : 'goals-person-item'
                    }
                    onClick={() => setPickedPersonId(p.employeeId)}
                  >
                    <Avatar name={p.name} size={28} />
                    <span>
                      <span className="person-name" style={{ display: 'block' }}>
                        {p.name}
                      </span>
                      <span className="person-designation" style={{ display: 'block' }}>
                        {p.designation}
                      </span>
                    </span>
                  </button>
                ))}
              </div>

              <div>
                {!selectedPerson ? (
                  <div className="card">
                    <EmptyState title="Select a person" message="Pick someone to see their goals." />
                  </div>
                ) : (
                  <>
                    <ErrorBanner message={effFetch.error} />
                    {effFetch.loading && !effFetch.data ? (
                      <Spinner />
                    ) : effFetch.data ? (
                      <>
                        <div className="goal-section">
                          <div className="goal-section-head">
                            <span className="goal-section-title">
                              <Layers size={15} />
                              Common goals · {selectedPerson.designation}
                            </span>
                            <span className="goal-section-note">
                              Applies to all {selectedPerson.designation}s — not just{' '}
                              {firstName(selectedPerson.name)}.
                            </span>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => jumpToDesignation(selectedPerson.designation)}
                            >
                              Manage
                            </button>
                          </div>
                          {effFetch.data.designationGoals.length === 0 ? (
                            <div className="card">
                              <EmptyState
                                title={`No ${selectedPerson.designation} goals yet`}
                                message="Define common goals in the Designation goals tab."
                              />
                            </div>
                          ) : (
                            <div className="goal-grid">
                              {effFetch.data.designationGoals.map((goal) => (
                                <DesignationGoalCard key={goal.id} goal={goal} />
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="goal-section">
                          <div className="goal-section-head">
                            <span className="goal-section-title">
                              <Target size={15} />
                              Individual goals · {firstName(selectedPerson.name)}
                            </span>
                            <span className="goal-section-note">
                              Layered on top of the common goals above.
                            </span>
                          </div>
                          {sortedIndividualGoals.length === 0 ? (
                            <div className="card">
                              <EmptyState
                                title={`No individual goals for ${firstName(selectedPerson.name)} yet`}
                                message="Add a personal goal on top of the shared designation goals."
                              />
                            </div>
                          ) : (
                            <div className="goal-grid">
                              {sortedIndividualGoals.map((goal) => (
                                <IndividualGoalCard
                                  key={goal.id}
                                  goal={goal}
                                  cycling={cyclingId === goal.id}
                                  onCycle={() => void cycleStatus(goal)}
                                  onEdit={() => setIgModal({ goal })}
                                  onDelete={() => setIgToDelete(goal)}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}

      <datalist id="goal-category-options">
        {categorySuggestions.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      {dgModal && selectedDesignation && (
        <DesignationGoalModal
          initial={dgModal.goal}
          designations={designations}
          defaultDesignation={selectedDesignation}
          onClose={() => setDgModal(null)}
          onSaved={(goal) => {
            setDgModal(null);
            setPickedDesignation(goal.designation);
            dgFetch.reload();
            designationsFetch.reload();
            effFetch.reload();
          }}
        />
      )}

      {igModal && selectedPerson && (
        <IndividualGoalModal
          initial={igModal.goal}
          person={selectedPerson}
          onClose={() => setIgModal(null)}
          onSaved={() => {
            setIgModal(null);
            effFetch.reload();
          }}
        />
      )}

      <ConfirmDialog
        open={dgToDelete !== null}
        title="Delete designation goal"
        message={
          dgToDelete
            ? `Delete "${dgToDelete.title}"? It applies to every ${dgToDelete.designation} and will be removed for all of them.`
            : ''
        }
        confirmLabel="Delete"
        danger
        busy={deleteBusy}
        onConfirm={() => void confirmDeleteDesignationGoal()}
        onCancel={() => setDgToDelete(null)}
      />

      <ConfirmDialog
        open={igToDelete !== null}
        title="Delete individual goal"
        message={
          igToDelete
            ? `Remove "${igToDelete.title}" from ${selectedPerson ? selectedPerson.name : 'this person'}'s goals?`
            : ''
        }
        confirmLabel="Delete"
        danger
        busy={deleteBusy}
        onConfirm={() => void confirmDeleteIndividualGoal()}
        onCancel={() => setIgToDelete(null)}
      />
    </div>
  );
}
