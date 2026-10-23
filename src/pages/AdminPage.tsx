// Admin user management over ALL employees. Contract: docs/CONTRACTS.md §E.
// Uses module A's employee endpoints (flat scope=all + POST/PATCH/DELETE).
import { useMemo, useState } from 'react';
import { Briefcase, Pencil, Plus, ShieldCheck, Trash2, UserCog, Users } from 'lucide-react';
import type { EmployeeOut, Role } from '../../shared/types';
import { DEFAULT_DESIGNATIONS, GROWTH_STATUSES } from '../../shared/types';
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
  type BadgeTone,
} from '../components/ui';
import '../styles/dashboard.css';

interface PersonForm {
  name: string;
  email: string;
  designation: string;
  mentorId: string;
  currentProject: string;
  growthStatus: string;
  joinDate: string;
}

const emptyForm = (): PersonForm => ({
  name: '',
  email: '',
  designation: DEFAULT_DESIGNATIONS[0],
  mentorId: '',
  currentProject: '',
  growthStatus: GROWTH_STATUSES[0],
  joinDate: new Date().toISOString().slice(0, 10),
});

const formFor = (e: EmployeeOut): PersonForm => ({
  name: e.name,
  email: e.email,
  designation: e.designation,
  mentorId: e.mentorId,
  currentProject: e.currentProject,
  growthStatus: e.growthStatus,
  joinDate: e.joinDate,
});

function roleTone(role: Role): BadgeTone {
  if (role === 'admin') return 'accent';
  if (role === 'manager') return 'success';
  return 'neutral';
}

export default function AdminPage() {
  const { me, refresh } = useAuth();
  const { data, error, loading, reload } = useFetch<{ employees: EmployeeOut[] }>(
    '/api/employees?view=flat&scope=all',
  );

  const [pageError, setPageError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // modal state: add/edit share one form
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<EmployeeOut | null>(null);
  const [form, setForm] = useState<PersonForm>(emptyForm());

  const [deleteTarget, setDeleteTarget] = useState<EmployeeOut | null>(null);
  const [toggleTarget, setToggleTarget] = useState<EmployeeOut | null>(null);

  const employees = useMemo(
    () => [...(data?.employees ?? [])].sort((a, b) => a.employeeId.localeCompare(b.employeeId)),
    [data],
  );
  const nameById = useMemo(
    () => new Map(employees.map((e) => [e.employeeId, e.name])),
    [employees],
  );

  const designations = useMemo(() => {
    const set = new Set<string>(DEFAULT_DESIGNATIONS);
    for (const e of employees) if (e.designation) set.add(e.designation);
    if (form.designation) set.add(form.designation);
    return [...set].sort();
  }, [employees, form.designation]);

  const designationBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of employees) {
      const d = e.designation || 'Unset';
      counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [employees]);

  const managerCount = employees.filter((e) => e.role === 'manager').length;
  const adminCount = employees.filter((e) => e.role === 'admin').length;

  function openAdd() {
    setEditing(null);
    setForm(emptyForm());
    setModalError(null);
    setModalOpen(true);
  }

  function openEdit(e: EmployeeOut) {
    setEditing(e);
    setForm(formFor(e));
    setModalError(null);
    setModalOpen(true);
  }

  const set = (key: keyof PersonForm) => (value: string) => setForm((f) => ({ ...f, [key]: value }));
  const formValid = form.name.trim() !== '' && form.email.trim() !== '' && form.designation.trim() !== '';

  async function savePerson() {
    setBusy(true);
    setModalError(null);
    try {
      const body = {
        name: form.name.trim(),
        email: form.email.trim(),
        designation: form.designation,
        mentorId: form.mentorId,
        currentProject: form.currentProject.trim(),
        growthStatus: form.growthStatus,
        joinDate: form.joinDate,
      };
      if (editing) {
        await api(`/api/employees/${editing.employeeId}`, { method: 'PATCH', body });
      } else {
        await api('/api/employees', { method: 'POST', body });
      }
      setModalOpen(false);
      reload();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    setPageError(null);
    try {
      await api(`/api/employees/${deleteTarget.employeeId}`, { method: 'DELETE' });
      setDeleteTarget(null);
      reload();
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'Delete failed');
      setDeleteTarget(null);
    } finally {
      setBusy(false);
    }
  }

  async function confirmToggle() {
    if (!toggleTarget) return;
    const granting = toggleTarget.isAdmin !== 'yes';
    setBusy(true);
    setPageError(null);
    try {
      await api(`/api/employees/${toggleTarget.employeeId}`, {
        method: 'PATCH',
        body: { isAdmin: granting ? 'yes' : 'no' },
      });
      setToggleTarget(null);
      reload();
      // Changing your own flag changes your role — keep the session in sync.
      if (me && toggleTarget.employeeId === me.employeeId) await refresh();
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'Update failed');
      setToggleTarget(null);
    } finally {
      setBusy(false);
    }
  }

  const togglingSelf = toggleTarget !== null && me !== null && toggleTarget.employeeId === me.employeeId;
  const togglingToAdmin = toggleTarget !== null && toggleTarget.isAdmin !== 'yes';

  return (
    <div className="page">
      <PageHeader
        title="Admin"
        subtitle="User management across the whole organization"
        actions={
          <button className="btn btn-primary" onClick={openAdd}>
            <Plus size={15} />
            Add person
          </button>
        }
      />
      <ErrorBanner message={pageError} />

      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorBanner message={error} />
      ) : employees.length === 0 ? (
        <EmptyState title="No people yet" message="Add the first person to get started." />
      ) : (
        <>
          <div className="stat-row">
            <div className="card stat-tile dash-stat">
              <span className="stat-ico">
                <Users size={18} />
              </span>
              <div>
                <div className="stat-label">Total people</div>
                <div className="stat-value">{employees.length}</div>
              </div>
            </div>
            <div className="card stat-tile dash-stat">
              <span className="stat-ico success">
                <UserCog size={18} />
              </span>
              <div>
                <div className="stat-label">Managers</div>
                <div className="stat-value">{managerCount}</div>
              </div>
            </div>
            <div className="card stat-tile dash-stat">
              <span className="stat-ico warning">
                <ShieldCheck size={18} />
              </span>
              <div>
                <div className="stat-label">Admins</div>
                <div className="stat-value">{adminCount}</div>
              </div>
            </div>
            <div className="card stat-tile dash-stat">
              <span className="stat-ico">
                <Briefcase size={18} />
              </span>
              <div>
                <div className="stat-label">Designations</div>
                <div className="stat-value">{designationBreakdown.length}</div>
              </div>
            </div>
          </div>

          <div className="card admin-section">
            <div className="card-title">Designation breakdown</div>
            <div className="admin-chips">
              {designationBreakdown.map(([designation, count]) => (
                <span key={designation} className="chip">
                  {designation} · {count}
                </span>
              ))}
            </div>
          </div>

          <div className="table-wrap admin-section">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>ID</th>
                  <th>Email</th>
                  <th>Designation</th>
                  <th>Mentor</th>
                  <th>Role</th>
                  <th>Admin</th>
                  <th style={{ width: 72 }} />
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => {
                  const isSelf = me !== null && e.employeeId === me.employeeId;
                  return (
                    <tr key={e.employeeId}>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
                          <Avatar name={e.name} size={28} />
                          <span style={{ fontWeight: 600 }}>
                            {e.name}
                            {isSelf && <span className="muted"> (you)</span>}
                          </span>
                        </span>
                      </td>
                      <td className="mono muted">{e.employeeId}</td>
                      <td className="text-secondary">{e.email}</td>
                      <td>{e.designation}</td>
                      <td className="text-secondary">{nameById.get(e.mentorId) ?? '—'}</td>
                      <td>
                        <Badge tone={roleTone(e.role)}>
                          {e.role === 'admin' && <ShieldCheck size={12} />}
                          {e.role.charAt(0).toUpperCase() + e.role.slice(1)}
                        </Badge>
                      </td>
                      <td>
                        <button
                          className={`switch${e.isAdmin === 'yes' ? ' on' : ''}`}
                          role="switch"
                          aria-checked={e.isAdmin === 'yes'}
                          aria-label={`Toggle admin access for ${e.name}`}
                          disabled={busy}
                          onClick={() => setToggleTarget(e)}
                        />
                      </td>
                      <td>
                        <span style={{ display: 'inline-flex', gap: 2 }}>
                          <button className="icon-btn" aria-label={`Edit ${e.name}`} onClick={() => openEdit(e)}>
                            <Pencil size={15} />
                          </button>
                          {!isSelf && (
                            <button
                              className="icon-btn danger"
                              aria-label={`Delete ${e.name}`}
                              onClick={() => setDeleteTarget(e)}
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'Add person'}
        footer={
          <>
            <button className="btn" onClick={() => setModalOpen(false)} disabled={busy}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={() => void savePerson()}
              disabled={busy || !formValid}
            >
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Add person'}
            </button>
          </>
        }
      >
        <ErrorBanner message={modalError} />
        <Field label="Full name">
          <input
            className="input"
            value={form.name}
            onChange={(e) => set('name')(e.target.value)}
            placeholder="Jordan Rivera"
            autoFocus
          />
        </Field>
        <Field label="Email">
          <input
            className="input"
            type="email"
            value={form.email}
            onChange={(e) => set('email')(e.target.value)}
            placeholder="jrivera@presidio.com"
          />
        </Field>
        <div className="form-row">
          <Field label="Designation">
            <select
              className="select"
              value={form.designation}
              onChange={(e) => set('designation')(e.target.value)}
            >
              {designations.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Mentor">
            <select className="select" value={form.mentorId} onChange={(e) => set('mentorId')(e.target.value)}>
              <option value="">None (top level)</option>
              {employees
                .filter((e) => e.employeeId !== editing?.employeeId)
                .map((e) => (
                  <option key={e.employeeId} value={e.employeeId}>
                    {e.name}
                  </option>
                ))}
            </select>
          </Field>
        </div>
        <div className="form-row">
          <Field label="Growth status">
            <select
              className="select"
              value={form.growthStatus}
              onChange={(e) => set('growthStatus')(e.target.value)}
            >
              {GROWTH_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Join date">
            <input
              className="input"
              type="date"
              value={form.joinDate}
              onChange={(e) => set('joinDate')(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Current project" hint={editing ? undefined : 'New accounts sign in with the default password "welcome123".'}>
          <input
            className="input"
            value={form.currentProject}
            onChange={(e) => set('currentProject')(e.target.value)}
            placeholder="MatchDay Platform"
          />
        </Field>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete person"
        message={
          deleteTarget
            ? `Delete ${deleteTarget.name} (${deleteTarget.employeeId})? Their mentees will be re-parented to their mentor, and their goals, reviews, and feedback will be removed. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        danger
        busy={busy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={toggleTarget !== null}
        title={togglingToAdmin ? 'Grant admin access' : 'Revoke admin access'}
        message={
          toggleTarget
            ? togglingToAdmin
              ? `${toggleTarget.name} will be able to see and manage everyone in the organization.`
              : togglingSelf
                ? 'You are removing YOUR OWN admin access. You will lose access to this page immediately.'
                : `${toggleTarget.name} will lose organization-wide access and revert to their mentee-based role.`
            : ''
        }
        confirmLabel={togglingToAdmin ? 'Grant admin' : 'Revoke admin'}
        danger={!togglingToAdmin}
        busy={busy}
        onConfirm={() => void confirmToggle()}
        onCancel={() => setToggleTarget(null)}
      />
    </div>
  );
}
