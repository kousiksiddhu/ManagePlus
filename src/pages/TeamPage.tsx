// Module A — Team list: tree/flat views, dynamic columns, person CRUD, Excel export.
// Contract: docs/CONTRACTS.md §A
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Columns3,
  Download,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { api, downloadFile, useFetch } from '../api/client';
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
} from '../components/ui';
import type { ColumnDef, EmployeeOut, TreeNode } from '../../shared/types';
import { DEFAULT_DESIGNATIONS, GROWTH_STATUSES } from '../../shared/types';
import '../styles/team.css';

const COLUMN_TYPES: ReadonlyArray<ColumnDef['type']> = ['text', 'number', 'date', 'tags', 'select'];

// ---------- helpers ----------

function str(v: unknown): string {
  return v == null ? '' : String(v);
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong';
}

function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function matchesQuery(e: EmployeeOut, q: string): boolean {
  const s = q.toLowerCase();
  return [e.name, e.email, e.skills].some((v) => str(v).toLowerCase().includes(s));
}

/** Keep tree nodes that match the query or have a matching descendant. */
function pruneTree(node: TreeNode, q: string): TreeNode | null {
  const children = node.children
    .map((c) => pruneTree(c, q))
    .filter((n): n is TreeNode => n !== null);
  if (matchesQuery(node.employee, q) || children.length) {
    return { employee: node.employee, children };
  }
  return null;
}

interface TreeRow {
  employee: EmployeeOut;
  depth: number;
  childCount: number;
}

function flattenTree(roots: TreeNode[], collapsed: Set<string>, ignoreCollapsed: boolean): TreeRow[] {
  const rows: TreeRow[] = [];
  const walk = (node: TreeNode, depth: number) => {
    rows.push({ employee: node.employee, depth, childCount: node.children.length });
    if (ignoreCollapsed || !collapsed.has(node.employee.employeeId)) {
      for (const child of node.children) walk(child, depth + 1);
    }
  };
  for (const root of roots) walk(root, 0);
  return rows;
}

/** All descendants of rootId within `people` (client-side mirror of subtreeIds). */
function descendantIds(rootId: string, people: EmployeeOut[]): Set<string> {
  const byMentor = new Map<string, string[]>();
  for (const p of people) {
    const m = str(p.mentorId);
    const list = byMentor.get(m);
    if (list) list.push(p.employeeId);
    else byMentor.set(m, [p.employeeId]);
  }
  const out = new Set<string>();
  const queue = [...(byMentor.get(rootId) ?? [])];
  while (queue.length) {
    const id = queue.shift()!;
    out.add(id);
    queue.push(...(byMentor.get(id) ?? []));
  }
  return out;
}

function splitOptions(options: string): string[] {
  return options
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---------- cell rendering ----------

function CellValue({ col, emp, mentorName }: { col: ColumnDef; emp: EmployeeOut; mentorName: string }) {
  if (col.key === 'mentorId') {
    return mentorName ? <>{mentorName}</> : <span className="muted">—</span>;
  }
  const value = str(emp[col.key]);
  if (col.key === 'growthStatus') {
    return value ? <Badge tone={growthTone(value)}>{value}</Badge> : <span className="muted">—</span>;
  }
  if (col.type === 'tags') return <TagList value={value} />;
  if (col.type === 'date') return <>{formatDate(value || null)}</>;
  if (!value) return <span className="muted">—</span>;
  if (col.type === 'number') return <span className="mono">{value}</span>;
  return <>{value}</>;
}

// ---------- add / edit person modal ----------

const CORE_FORM_KEYS = [
  'name',
  'email',
  'designation',
  'mentorId',
  'currentProject',
  'growthStatus',
  'skills',
  'projectHistory',
  'joinDate',
] as const;

function PersonFormModal({
  open,
  onClose,
  employee,
  columns,
  people,
  me,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** null = create a new person */
  employee: EmployeeOut | null;
  columns: ColumnDef[];
  /** the people visible to the actor — mentor choices come from here */
  people: EmployeeOut[];
  me: EmployeeOut;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isAdmin = me.role === 'admin';
  const customCols = useMemo(() => columns.filter((c) => !c.core), [columns]);

  useEffect(() => {
    if (!open) return;
    const next: Record<string, string> = {};
    for (const key of [...CORE_FORM_KEYS, ...customCols.map((c) => c.key)]) {
      next[key] = employee ? str(employee[key]) : '';
    }
    if (!employee) {
      next.growthStatus = 'On Track';
      next.joinDate = todayIso();
      next.mentorId = isAdmin ? '' : me.employeeId;
    }
    setValues(next);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, employee]);

  // Mentor choices: visible people, minus the person themself and their
  // descendants when editing (those would create a reporting cycle).
  const mentorOptions = useMemo(() => {
    if (!employee) return people;
    const excluded = descendantIds(employee.employeeId, people);
    excluded.add(employee.employeeId);
    return people.filter((p) => !excluded.has(p.employeeId));
  }, [employee, people]);

  const designationCol = columns.find((c) => c.key === 'designation');
  const designationBase = designationCol ? splitOptions(designationCol.options) : [];
  const designationOptions = designationBase.length ? designationBase : [...DEFAULT_DESIGNATIONS];
  const designation = values.designation ?? '';
  if (designation && !designationOptions.includes(designation)) designationOptions.unshift(designation);

  const growthCol = columns.find((c) => c.key === 'growthStatus');
  const growthBase = growthCol ? splitOptions(growthCol.options) : [];
  const growthOptions = growthBase.length ? growthBase : [...GROWTH_STATUSES];
  const growth = values.growthStatus ?? '';
  if (growth && !growthOptions.includes(growth)) growthOptions.unshift(growth);

  const set = (key: string, value: string) => setValues((v) => ({ ...v, [key]: value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (employee) {
        await api(`/api/employees/${employee.employeeId}`, { method: 'PATCH', body: values });
      } else {
        await api('/api/employees', { method: 'POST', body: values });
      }
      onSaved();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={employee ? `Edit ${employee.name}` : 'Add person'}
      width={600}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary" type="submit" form="person-form" disabled={busy}>
            {busy ? 'Saving…' : employee ? 'Save changes' : 'Add person'}
          </button>
        </>
      }
    >
      <form id="person-form" onSubmit={(e) => void submit(e)}>
        <ErrorBanner message={error} />
        <div className="form-row">
          <Field label="Name">
            <input
              className="input"
              value={values.name ?? ''}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Full name"
              required
              autoFocus
            />
          </Field>
          <Field label="Email">
            <input
              className="input"
              type="email"
              value={values.email ?? ''}
              onChange={(e) => set('email', e.target.value)}
              placeholder="name@presidio.com"
              required
            />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Designation">
            <select
              className="select"
              value={values.designation ?? ''}
              onChange={(e) => set('designation', e.target.value)}
              required
            >
              <option value="" disabled>
                Select…
              </option>
              {designationOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Mentor" hint={isAdmin ? undefined : 'Someone in your team'}>
            <select
              className="select"
              value={values.mentorId ?? ''}
              onChange={(e) => set('mentorId', e.target.value)}
            >
              {isAdmin ? (
                <option value="">No mentor (top level)</option>
              ) : (
                !values.mentorId && (
                  <option value="" disabled>
                    Select…
                  </option>
                )
              )}
              {mentorOptions.map((p) => (
                <option key={p.employeeId} value={p.employeeId}>
                  {p.name} · {p.designation}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="form-row">
          <Field label="Current project">
            <input
              className="input"
              value={values.currentProject ?? ''}
              onChange={(e) => set('currentProject', e.target.value)}
            />
          </Field>
          <Field label="Growth status">
            <select
              className="select"
              value={values.growthStatus ?? ''}
              onChange={(e) => set('growthStatus', e.target.value)}
            >
              {growthOptions.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Skills" hint="Comma separated">
          <input
            className="input"
            value={values.skills ?? ''}
            onChange={(e) => set('skills', e.target.value)}
            placeholder="React, TypeScript, …"
          />
        </Field>
        <Field label="Project history" hint="Separate with “;”, most recent first">
          <input
            className="input"
            value={values.projectHistory ?? ''}
            onChange={(e) => set('projectHistory', e.target.value)}
          />
        </Field>
        <div className="form-row">
          <Field label="Join date">
            <input
              className="input"
              type="date"
              value={values.joinDate ?? ''}
              onChange={(e) => set('joinDate', e.target.value)}
            />
          </Field>
          <div style={{ flex: 1 }} />
        </div>
        {customCols.map((col) => (
          <Field key={col.key} label={col.label} hint={col.type === 'tags' ? 'Comma separated' : undefined}>
            {col.type === 'select' ? (
              <select
                className="select"
                value={values[col.key] ?? ''}
                onChange={(e) => set(col.key, e.target.value)}
              >
                <option value="">—</option>
                {splitOptions(col.options).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="input"
                type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text'}
                value={values[col.key] ?? ''}
                onChange={(e) => set(col.key, e.target.value)}
              />
            )}
          </Field>
        ))}
        {!employee && (
          <p className="small text-secondary">
            New teammates can sign in with the default password “welcome123”.
          </p>
        )}
      </form>
    </Modal>
  );
}

// ---------- columns modal ----------

function ColumnsModal({
  open,
  onClose,
  columns,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  columns: ColumnDef[];
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState<ColumnDef['type']>('text');
  const [newOptions, setNewOptions] = useState('');
  const [deletingCol, setDeletingCol] = useState<ColumnDef | null>(null);

  const sorted = [...columns].sort((a, b) => a.order - b.order);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  const move = (index: number, dir: -1 | 1) => {
    const a = sorted[index];
    const b = sorted[index + dir];
    if (!a || !b) return;
    void run(async () => {
      await api(`/api/columns/${a.key}`, { method: 'PATCH', body: { order: b.order } });
      await api(`/api/columns/${b.key}`, { method: 'PATCH', body: { order: a.order } });
    });
  };

  const startRename = (c: ColumnDef) => {
    setEditingKey(c.key);
    setEditingLabel(c.label);
  };

  const saveRename = () => {
    const key = editingKey;
    const label = editingLabel.trim();
    if (!key || !label) return;
    void run(async () => {
      await api(`/api/columns/${key}`, { method: 'PATCH', body: { label } });
      setEditingKey(null);
    });
  };

  const addColumn = () => {
    const label = newLabel.trim();
    if (!label) return;
    void run(async () => {
      await api('/api/columns', {
        method: 'POST',
        body: { label, type: newType, options: newType === 'select' ? newOptions : '' },
      });
      setNewLabel('');
      setNewType('text');
      setNewOptions('');
    });
  };

  const confirmDeleteCol = () => {
    const col = deletingCol;
    if (!col) return;
    void run(async () => {
      await api(`/api/columns/${col.key}`, { method: 'DELETE' });
      setDeletingCol(null);
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Manage columns"
      width={560}
      footer={
        <button className="btn" onClick={onClose}>
          Done
        </button>
      }
    >
      <ErrorBanner message={error} />
      <div className="col-list">
        {sorted.map((c, i) => (
          <div key={c.key} className={`col-row${c.visible ? '' : ' col-hidden'}`}>
            <button
              className="icon-btn"
              disabled={busy || i === 0}
              onClick={() => move(i, -1)}
              aria-label={`Move ${c.label} up`}
            >
              <ArrowUp size={14} />
            </button>
            <button
              className="icon-btn"
              disabled={busy || i === sorted.length - 1}
              onClick={() => move(i, 1)}
              aria-label={`Move ${c.label} down`}
            >
              <ArrowDown size={14} />
            </button>
            <div className="col-label">
              {editingKey === c.key ? (
                <>
                  <input
                    className="input"
                    value={editingLabel}
                    autoFocus
                    onChange={(e) => setEditingLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        saveRename();
                      }
                      if (e.key === 'Escape') setEditingKey(null);
                    }}
                  />
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={saveRename}
                    disabled={busy || !editingLabel.trim()}
                  >
                    Save
                  </button>
                  <button className="btn btn-sm btn-ghost" onClick={() => setEditingKey(null)} disabled={busy}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <span>{c.label}</span>
                  <span className="col-type">{c.type}</span>
                  {c.core && <span className="badge badge-neutral">core</span>}
                </>
              )}
            </div>
            {editingKey !== c.key && (
              <button className="icon-btn" onClick={() => startRename(c)} disabled={busy} aria-label={`Rename ${c.label}`}>
                <Pencil size={14} />
              </button>
            )}
            <button
              className="icon-btn"
              onClick={() =>
                void run(() => api(`/api/columns/${c.key}`, { method: 'PATCH', body: { visible: !c.visible } }))
              }
              disabled={busy}
              aria-label={c.visible ? `Hide ${c.label}` : `Show ${c.label}`}
            >
              {c.visible ? <Eye size={14} /> : <EyeOff size={14} />}
            </button>
            {c.core ? (
              <span className="col-actions-spacer" />
            ) : (
              <button
                className="icon-btn danger"
                onClick={() => setDeletingCol(c)}
                disabled={busy}
                aria-label={`Delete ${c.label}`}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="card-title">Add custom column</div>
      <div className="form-row">
        <Field label="Label">
          <input
            className="input"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="e.g. Location"
          />
        </Field>
        <Field label="Type">
          <select
            className="select"
            value={newType}
            onChange={(e) => setNewType(e.target.value as ColumnDef['type'])}
          >
            {COLUMN_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {newType === 'select' && (
        <Field label="Options" hint="Comma separated choices">
          <input
            className="input"
            value={newOptions}
            onChange={(e) => setNewOptions(e.target.value)}
            placeholder="Remote, Hybrid, On-site"
          />
        </Field>
      )}
      <button className="btn" onClick={addColumn} disabled={busy || !newLabel.trim()}>
        <Plus size={15} /> Add column
      </button>

      <ConfirmDialog
        open={deletingCol !== null}
        title="Delete column"
        message={
          deletingCol
            ? `Delete the “${deletingCol.label}” column? Its values will be removed from every employee.`
            : ''
        }
        confirmLabel="Delete"
        danger
        busy={busy}
        onConfirm={confirmDeleteCol}
        onCancel={() => setDeletingCol(null)}
      />
    </Modal>
  );
}

// ---------- export modal ----------

function ExportModal({
  open,
  onClose,
  columns,
  selectedIds,
}: {
  open: boolean;
  onClose: () => void;
  columns: ColumnDef[];
  selectedIds: Set<string>;
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [onlySelected, setOnlySelected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setChecked(new Set(columns.filter((c) => c.visible).map((c) => c.key)));
    setOnlySelected(selectedIds.size > 0);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const sorted = [...columns].sort((a, b) => a.order - b.order);

  const toggle = (key: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  async function doExport() {
    const columnKeys = sorted.filter((c) => checked.has(c.key)).map((c) => c.key);
    if (!columnKeys.length) {
      setError('Select at least one column');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body: { columnKeys: string[]; employeeIds?: string[] } = { columnKeys };
      if (onlySelected && selectedIds.size) body.employeeIds = [...selectedIds];
      await downloadFile('/api/export', body, 'manageplus-export.xlsx');
      onClose();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Export to Excel"
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => void doExport()}
            disabled={busy || checked.size === 0}
          >
            <Download size={15} /> {busy ? 'Exporting…' : 'Export'}
          </button>
        </>
      }
    >
      <ErrorBanner message={error} />
      <p className="small text-secondary" style={{ marginBottom: 10 }}>
        Choose the columns to include in the workbook.
      </p>
      <div className="export-grid">
        {sorted.map((c) => (
          <label key={c.key} className="checkbox-row">
            <input type="checkbox" checked={checked.has(c.key)} onChange={() => toggle(c.key)} />
            {c.label}
          </label>
        ))}
      </div>
      {selectedIds.size > 0 && (
        <>
          <hr className="divider" />
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={onlySelected}
              onChange={(e) => setOnlySelected(e.target.checked)}
            />
            Only export the {selectedIds.size} selected {selectedIds.size === 1 ? 'row' : 'rows'}
          </label>
        </>
      )}
    </Modal>
  );
}

// ---------- page ----------

export default function TeamPage() {
  const { me } = useAuth();
  const navigate = useNavigate();
  const meId = me?.employeeId ?? '';
  const isAdmin = me?.role === 'admin';
  const canManage = me?.role === 'manager' || isAdmin;

  const [view, setView] = useState<'tree' | 'flat'>('tree');
  const [scope, setScope] = useState<'mine' | 'all'>(isAdmin ? 'all' : 'mine');
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [personModal, setPersonModal] = useState<{ employee: EmployeeOut | null } | null>(null);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [deleting, setDeleting] = useState<EmployeeOut | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const colsFetch = useFetch<{ columns: ColumnDef[] }>('/api/columns');
  const flatFetch = useFetch<{ employees: EmployeeOut[] }>(`/api/employees?view=flat&scope=${scope}`);
  const treeFetch = useFetch<{ roots: TreeNode[] }>(
    view === 'tree' ? `/api/employees?view=tree&scope=${scope}` : null,
  );

  // Selections don't carry across scopes.
  useEffect(() => {
    setSelected(new Set());
  }, [scope]);

  const columns = useMemo(() => colsFetch.data?.columns ?? [], [colsFetch.data]);
  const visibleColumns = useMemo(() => columns.filter((c) => c.visible), [columns]);
  const employees = useMemo(() => flatFetch.data?.employees ?? [], [flatFetch.data]);
  const nameById = useMemo(
    () => new Map(employees.map((e) => [e.employeeId, e.name])),
    [employees],
  );

  const searching = query.trim().length > 0;

  const treeRows = useMemo(() => {
    const roots = treeFetch.data?.roots ?? [];
    const q = query.trim();
    const pruned = q
      ? roots.map((r) => pruneTree(r, q)).filter((r): r is TreeNode => r !== null)
      : roots;
    return flattenTree(pruned, collapsed, q.length > 0);
  }, [treeFetch.data, query, collapsed]);

  const flatRows = useMemo(() => {
    const q = query.trim();
    return q ? employees.filter((e) => matchesQuery(e, q)) : employees;
  }, [employees, query]);

  const loading = colsFetch.loading || flatFetch.loading || (view === 'tree' && treeFetch.loading);
  const fetchError = colsFetch.error ?? flatFetch.error ?? (view === 'tree' ? treeFetch.error : null);

  const dataColumns = view === 'tree' ? visibleColumns.filter((c) => c.key !== 'name') : visibleColumns;
  const nameLabel = columns.find((c) => c.key === 'name')?.label ?? 'Name';

  const mentorNameOf = (emp: EmployeeOut) => {
    const mid = str(emp.mentorId);
    return mid ? nameById.get(mid) ?? mid : '';
  };

  const canManageRow = (emp: EmployeeOut) => isAdmin || (canManage && emp.employeeId !== meId);

  const toggleCollapsed = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const displayedIds =
    view === 'tree' ? treeRows.map((r) => r.employee.employeeId) : flatRows.map((e) => e.employeeId);
  const allSelected = displayedIds.length > 0 && displayedIds.every((id) => selected.has(id));

  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) displayedIds.forEach((id) => next.delete(id));
      else displayedIds.forEach((id) => next.add(id));
      return next;
    });

  const reloadEmployees = () => {
    flatFetch.reload();
    treeFetch.reload();
  };

  const handlePersonSaved = () => {
    setPersonModal(null);
    reloadEmployees();
  };

  async function confirmDelete() {
    if (!deleting) return;
    const target = deleting;
    setDeleteBusy(true);
    try {
      await api(`/api/employees/${target.employeeId}`, { method: 'DELETE' });
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(target.employeeId);
        return next;
      });
      setActionError(null);
      reloadEmployees();
    } catch (err) {
      setActionError(errMsg(err));
    } finally {
      setDeleteBusy(false);
      setDeleting(null);
    }
  }

  if (!me) return null;

  const shownCount = view === 'tree' ? treeRows.length : flatRows.length;
  const countText = `${shownCount} ${shownCount === 1 ? 'person' : 'people'}${selected.size ? ` · ${selected.size} selected` : ''
    }`;
  const subtitle =
    scope === 'all'
      ? `${employees.length} people across the organization`
      : `${employees.length} ${employees.length === 1 ? 'person' : 'people'} in your reporting tree`;

  const checkCell = (emp: EmployeeOut) => (
    <td className="check-cell" onClick={(e) => e.stopPropagation()}>
      <input
        type="checkbox"
        checked={selected.has(emp.employeeId)}
        onChange={() => toggleSelected(emp.employeeId)}
        aria-label={`Select ${emp.name}`}
      />
    </td>
  );

  const actionsCell = (emp: EmployeeOut) => (
    <td className="actions-cell" onClick={(e) => e.stopPropagation()}>
      {canManageRow(emp) && (
        <span className="row-actions">
          <button
            className="icon-btn"
            onClick={() => setPersonModal({ employee: emp })}
            aria-label={`Edit ${emp.name}`}
          >
            <Pencil size={15} />
          </button>
          <button className="icon-btn danger" onClick={() => setDeleting(emp)} aria-label={`Delete ${emp.name}`}>
            <Trash2 size={15} />
          </button>
        </span>
      )}
    </td>
  );

  return (
    <div className="page">
      <PageHeader
        title="Team"
        subtitle={subtitle}
        actions={
          canManage ? (
            <>
              <button className="btn" onClick={() => setColumnsOpen(true)}>
                <Columns3 size={15} /> Columns
              </button>
              <button className="btn" onClick={() => setExportOpen(true)}>
                <Download size={15} /> Export
              </button>
              <button className="btn btn-primary" onClick={() => setPersonModal({ employee: null })}>
                <Plus size={15} /> Add person
              </button>
            </>
          ) : undefined
        }
      />

      <div className="team-toolbar">
        <div className="segmented">
          <button className={view === 'tree' ? 'active' : ''} onClick={() => setView('tree')}>
            Tree
          </button>
          <button className={view === 'flat' ? 'active' : ''} onClick={() => setView('flat')}>
            Flat
          </button>
        </div>
        {isAdmin && (
          <div className="segmented">
            <button className={scope === 'mine' ? 'active' : ''} onClick={() => setScope('mine')}>
              My tree
            </button>
            <button className={scope === 'all' ? 'active' : ''} onClick={() => setScope('all')}>
              Everyone
            </button>
          </div>
        )}
        <div className="team-search">
          <Search size={14} className="search-icon" />
          <input
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email or skill…"
            aria-label="Search team"
          />
        </div>
        {!loading && <span className="team-count">{countText}</span>}
      </div>

      <ErrorBanner message={fetchError ?? actionError} />

      {loading ? (
        <Spinner />
      ) : shownCount === 0 ? (
        searching ? (
          <EmptyState title="No matches" message={`Nobody matches “${query.trim()}”.`} />
        ) : (
          <EmptyState title="No team members" message="Add your first team member to get started." />
        )
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {canManage && (
                  <th className="check-cell">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all rows" />
                  </th>
                )}
                {view === 'tree' && <th>{nameLabel}</th>}
                {dataColumns.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
                {canManage && <th className="actions-cell" />}
              </tr>
            </thead>
            <tbody>
              {view === 'tree'
                ? treeRows.map(({ employee: emp, depth, childCount }) => {
                  const isCollapsed = !searching && collapsed.has(emp.employeeId);
                  return (
                    <tr
                      key={emp.employeeId}
                      className="clickable"
                      onClick={() => navigate(`/people/${emp.employeeId}`)}
                    >
                      {canManage && checkCell(emp)}
                      <td>
                        <div className="person-cell" style={{ paddingLeft: depth * 22 }}>
                          {childCount > 0 ? (
                            <button
                              className="tree-toggle"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleCollapsed(emp.employeeId);
                              }}
                              aria-label={isCollapsed ? `Expand ${emp.name}` : `Collapse ${emp.name}`}
                            >
                              {isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                            </button>
                          ) : (
                            <span className="tree-spacer" />
                          )}
                          <Avatar name={emp.name} size={28} />
                          <span>{emp.name}</span>
                          {isCollapsed && <span className="badge badge-neutral">{childCount}</span>}
                        </div>
                      </td>
                      {dataColumns.map((c) => (
                        <td key={c.key} className={c.type === 'tags' ? 'tags-cell' : undefined}>
                          <CellValue col={c} emp={emp} mentorName={mentorNameOf(emp)} />
                        </td>
                      ))}
                      {canManage && actionsCell(emp)}
                    </tr>
                  );
                })
                : flatRows.map((emp) => (
                  <tr
                    key={emp.employeeId}
                    className="clickable"
                    onClick={() => navigate(`/people/${emp.employeeId}`)}
                  >
                    {canManage && checkCell(emp)}
                    {dataColumns.map((c) => (
                      <td key={c.key}>
                        {c.key === 'name' ? (
                          <div className="person-cell">
                            <Avatar name={emp.name} size={28} />
                            <span>{emp.name}</span>
                          </div>
                        ) : (
                          <CellValue col={c} emp={emp} mentorName={mentorNameOf(emp)} />
                        )}
                      </td>
                    ))}
                    {canManage && actionsCell(emp)}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {canManage && (
        <>
          <PersonFormModal
            open={personModal !== null}
            onClose={() => setPersonModal(null)}
            employee={personModal?.employee ?? null}
            columns={columns}
            people={employees}
            me={me}
            onSaved={handlePersonSaved}
          />
          <ColumnsModal
            open={columnsOpen}
            onClose={() => setColumnsOpen(false)}
            columns={columns}
            onChanged={() => colsFetch.reload()}
          />
          <ExportModal
            open={exportOpen}
            onClose={() => setExportOpen(false)}
            columns={columns}
            selectedIds={selected}
          />
          <ConfirmDialog
            open={deleting !== null}
            title="Delete person"
            message={
              deleting
                ? `Remove ${deleting.name} from the team? Their mentees will be re-assigned to their mentor, and their goals, reviews and feedback will be deleted. This cannot be undone.`
                : ''
            }
            confirmLabel="Delete"
            danger
            busy={deleteBusy}
            onConfirm={() => void confirmDelete()}
            onCancel={() => setDeleting(null)}
          />
        </>
      )}
    </div>
  );
}
