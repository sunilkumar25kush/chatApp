import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyRound, Pencil, Plus, RefreshCw, ShieldCheck, UserCog } from 'lucide-react';
import adminApi, { getApiErrorMessage } from '../api/adminApi';
import { useAdminAuth } from '../context/AdminAuthContext';
import {
  Badge, ConfirmDialog, EmptyState, ErrorState, Field, Modal, PageHeader, Pagination,
  SearchInput, TableSkeleton
} from '../components/ui';
import { adminToast } from '../components/AdminToaster';
import { formatDate, formatNumber, relativeTime, roleLabel } from '../utils/format';

const EMPTY_FORM = { username: '', email: '', password: '', role: 'support', permissions: [], notes: '' };

export default function RolesPage() {
  const { admin: currentAdmin, hasPermission } = useAdminAuth();
  const [roles, setRoles] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  const [statusTarget, setStatusTarget] = useState(null);
  const [statusReason, setStatusReason] = useState('');
  const [resetTarget, setResetTarget] = useState(null);
  const [newPassword, setNewPassword] = useState('');

  const canManage = currentAdmin?.role === 'super_admin' && hasPermission('roles.manage');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [rolesResponse, adminsResponse] = await Promise.all([
        adminApi.get('/admin/roles'),
        adminApi.get('/admin/roles/admins', { params: { page, limit: 20, role: role || undefined, status: status || undefined, search: search || undefined } })
      ]);
      setRoles(rolesResponse.data.data.roles || []);
      setCatalog(rolesResponse.data.data.permissions || []);
      setAdmins(adminsResponse.data.data);
      setPagination(adminsResponse.data.pagination);
    } catch (requestError) {
      const message = getApiErrorMessage(requestError, 'Unable to load roles');
      setError(message);
      adminToast.error(message);
    } finally {
      setLoading(false);
    }
  }, [page, role, status, search]);

  useEffect(() => {
    document.title = 'Roles & permissions · ChatRoom Admin';
    load();
  }, [load]);

  const permissionsByGroup = useMemo(() => {
    const map = new Map();
    catalog.forEach((item) => {
      if (!map.has(item.group)) map.set(item.group, []);
      map.get(item.group).push(item);
    });
    return Array.from(map.entries());
  }, [catalog]);

  const roleDefaults = useMemo(() => {
    const selectedRole = roles.find((item) => item.key === form.role);
    return selectedRole?.defaultPermissions || [];
  }, [roles, form.role]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (admin) => {
    setEditing(admin);
    setForm({
      username: admin.username || '',
      email: admin.email || '',
      password: '',
      role: admin.role,
      permissions: admin.permissions || [],
      notes: admin.notes || ''
    });
    setFormOpen(true);
  };

  const togglePermission = (key) => {
    setForm((current) => ({
      ...current,
      permissions: current.permissions.includes(key)
        ? current.permissions.filter((item) => item !== key)
        : [...current.permissions, key]
    }));
  };

  const save = async () => {
    if (!form.username.trim() || !form.email.trim()) {
      adminToast.warning('Username and email are required');
      return;
    }
    if (!editing && form.password.length < 12) {
      adminToast.warning('Initial password must be at least 12 characters');
      return;
    }
    setBusy(true);
    try {
      const extras = form.permissions.filter((permission) => !roleDefaults.includes(permission));
      if (editing) {
        await adminApi.patch(`/admin/roles/admins/${editing._id}`, {
          role: form.role,
          permissions: extras,
          notes: form.notes
        });
        adminToast.success('Administrator updated');
      } else {
        await adminApi.post('/admin/roles/admins', {
          username: form.username.trim(),
          email: form.email.trim(),
          password: form.password,
          role: form.role,
          permissions: extras,
          notes: form.notes
        });
        adminToast.success('Administrator created');
      }
      setFormOpen(false);
      load();
    } catch (requestError) {
      adminToast.error(getApiErrorMessage(requestError, 'Unable to save administrator'));
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async () => {
    if (!statusTarget) return;
    setBusy(true);
    try {
      const nextStatus = statusTarget.status === 'active' ? 'suspended' : 'active';
      await adminApi.post(`/admin/roles/admins/${statusTarget._id}/status`, { status: nextStatus, reason: statusReason.trim() || undefined });
      adminToast.success(`Administrator ${nextStatus === 'suspended' ? 'suspended' : 'restored'}`);
      setStatusTarget(null);
      setStatusReason('');
      load();
    } catch (requestError) {
      adminToast.error(getApiErrorMessage(requestError, 'Unable to update administrator'));
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    if (!resetTarget) return;
    if (newPassword.length < 12) {
      adminToast.warning('Password must be at least 12 characters');
      return;
    }
    setBusy(true);
    try {
      await adminApi.post(`/admin/roles/admins/${resetTarget._id}/reset-password`, { password: newPassword });
      adminToast.success('Password reset and sessions revoked');
      setResetTarget(null);
      setNewPassword('');
    } catch (requestError) {
      adminToast.error(getApiErrorMessage(requestError, 'Unable to reset password'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Admin roles & permissions"
        description="Server-enforced RBAC. Role defaults plus explicit grants determine effective permissions. Only Super Admins can change administrators."
        actions={(
          <>
            <button type="button" className="admin-btn" onClick={load} disabled={loading}><RefreshCw /> Refresh</button>
            {canManage ? <button type="button" className="admin-btn admin-btn--primary" onClick={openCreate}><Plus /> New administrator</button> : null}
          </>
        )}
      />

      <div className="admin-grid admin-grid--2" style={{ marginBottom: 16 }}>
        {roles.map((item) => (
          <div className="admin-card" key={item.key}>
            <div className="admin-card__head">
              <div className="admin-row" style={{ gap: 10 }}>
                <span className="admin-stat__icon" style={{ width: 38, height: 38 }}><ShieldCheck /></span>
                <div>
                  <h3>{item.label || roleLabel(item.key)}</h3>
                  <p>{item.description}</p>
                </div>
              </div>
              <Badge tone={item.key === 'super_admin' ? 'primary' : 'info'}>{item.counts?.active || 0} active</Badge>
            </div>
            <div className="admin-card__body">
              <div className="admin-row" style={{ gap: 18, marginBottom: 10 }}>
                <span className="admin-text-muted">Total: <strong>{formatNumber(item.counts?.total)}</strong></span>
                <span className="admin-text-muted">Suspended: <strong>{formatNumber(item.counts?.suspended)}</strong></span>
                <span className="admin-text-muted">Permissions: <strong>{item.defaultPermissions?.length || 0}</strong> + grants</span>
              </div>
              <div className="admin-row" style={{ gap: 5 }}>
                {(item.defaultPermissions || []).slice(0, 8).map((permission) => (
                  <span className="admin-badge" key={permission}>{permission}</span>
                ))}
                {(item.defaultPermissions || []).length > 8 ? <span className="admin-badge">+{item.defaultPermissions.length - 8}</span> : null}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="admin-card">
        <div className="admin-filter-bar">
          <SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Search administrators…" />
          <select className="admin-select" value={role} onChange={(event) => { setRole(event.target.value); setPage(1); }}>
            <option value="">All roles</option>
            {roles.map((item) => <option key={item.key} value={item.key}>{item.label || roleLabel(item.key)}</option>)}
          </select>
          <select className="admin-select" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>

        {loading ? <TableSkeleton rows={6} columns={6} /> : error ? <ErrorState message={error} onRetry={load} /> : !admins.length ? (
          <EmptyState title="No administrators found" description="Adjust filters or create a new administrator." icon={UserCog} />
        ) : (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>Administrator</th><th>Role</th><th>Status</th><th>MFA</th><th>Last login</th><th>Extra grants</th><th>Actions</th></tr></thead>
                <tbody>
                  {admins.map((admin) => (
                    <tr key={admin._id}>
                      <td>
                        <div className="admin-table__primary">
                          <span className="admin-avatar">{String(admin.username || '?').slice(0, 2)}</span>
                          <div><strong>{admin.username}</strong><span>{admin.email}</span></div>
                        </div>
                      </td>
                      <td><Badge tone={admin.role === 'super_admin' ? 'primary' : 'info'}>{roleLabel(admin.role)}</Badge></td>
                      <td><Badge>{admin.status}</Badge></td>
                      <td><Badge tone={admin.mfaEnabled ? 'success' : 'warning'}>{admin.mfaEnabled ? 'enabled' : 'not enabled'}</Badge></td>
                      <td className="admin-table__muted">{admin.lastLoginAt ? relativeTime(admin.lastLoginAt) : 'Never'}</td>
                      <td className="admin-table__muted">{admin.permissions?.length || 0}</td>
                      <td>
                        <div className="admin-table__actions">
                          {canManage ? (
                            <>
                              <button type="button" className="admin-btn admin-btn--sm" onClick={() => openEdit(admin)}><Pencil /></button>
                              <button type="button" className="admin-btn admin-btn--sm" onClick={() => { setResetTarget(admin); setNewPassword(''); }}><KeyRound /></button>
                              {admin._id !== currentAdmin?._id ? (
                                <button type="button" className="admin-btn admin-btn--sm" onClick={() => { setStatusTarget(admin); setStatusReason(''); }}>
                                  {admin.status === 'active' ? 'Suspend' : 'Restore'}
                                </button>
                              ) : null}
                            </>
                          ) : <span className="admin-table__muted">View only</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination pagination={pagination} onPageChange={setPage} />
          </>
        )}
      </div>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit ${editing.username}` : 'New administrator'}
        description="Admins inherit role defaults. Extra grants are added on top and can never exceed the server-side catalog."
        size="xl"
        footer={(
          <>
            <button type="button" className="admin-btn" onClick={() => setFormOpen(false)} disabled={busy}>Cancel</button>
            <button type="button" className="admin-btn admin-btn--primary" onClick={save} disabled={busy}>
              {busy ? <span className="admin-spinner" /> : null}
              {editing ? 'Save changes' : 'Create administrator'}
            </button>
          </>
        )}
      >
        <div className="admin-form-grid">
          <Field label="Username">
            <input className="admin-input" value={form.username} disabled={Boolean(editing)} onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))} />
          </Field>
          <Field label="Email">
            <input className="admin-input" type="email" value={form.email} disabled={Boolean(editing)} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
          </Field>
          {!editing ? (
            <Field label="Initial password" hint="Minimum 12 characters, including mixed case and a number or symbol.">
              <input className="admin-input" type="password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} />
            </Field>
          ) : null}
          <Field label="Role">
            <select className="admin-select" value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value, permissions: [] }))}>
              {roles.map((item) => <option key={item.key} value={item.key}>{item.label || roleLabel(item.key)}</option>)}
            </select>
          </Field>
          <Field label="Notes" full>
            <textarea className="admin-textarea" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Optional internal notes" />
          </Field>
        </div>

        <div className="admin-divider" />
        <p className="admin-field__hint" style={{ marginBottom: 12 }}>
          Checked items reflect effective permissions. Items checked by the role are fixed defaults; extra checks are granted explicitly.
        </p>
        <div className="admin-permission-grid">
          {permissionsByGroup.map(([group, items]) => (
            <div className="admin-permission-group" key={group}>
              <h4>{group}</h4>
              {items.map((item) => {
                const isDefault = roleDefaults.includes(item.key);
                const isChecked = isDefault || form.permissions.includes(item.key);
                return (
                  <label className="admin-check" key={item.key} title={item.description}>
                    <input type="checkbox" checked={isChecked} disabled={isDefault || !canManage} onChange={() => togglePermission(item.key)} />
                    <span>{item.label}<span className="admin-text-muted"> · {item.key}</span></span>
                  </label>
                );
              })}
            </div>
          ))}
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(statusTarget)}
        onClose={() => setStatusTarget(null)}
        title={statusTarget?.status === 'active' ? 'Suspend administrator' : 'Restore administrator'}
        description={statusTarget ? `${statusTarget.username} will ${statusTarget.status === 'active' ? 'lose access immediately and all sessions will be revoked' : 'regain access to the admin panel'}.` : ''}
        confirmLabel={statusTarget?.status === 'active' ? 'Suspend' : 'Restore'}
        tone={statusTarget?.status === 'active' ? 'danger' : 'primary'}
        busy={busy}
        onConfirm={changeStatus}
      >
        {statusTarget?.status === 'active' ? (
          <Field label="Reason" hint="Recorded in the audit log.">
            <textarea className="admin-textarea" value={statusReason} onChange={(event) => setStatusReason(event.target.value)} />
          </Field>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(resetTarget)}
        onClose={() => setResetTarget(null)}
        title="Reset administrator password"
        description={`Set a new password for ${resetTarget?.username}. All their sessions are revoked immediately.`}
        confirmLabel="Reset password"
        tone="danger"
        busy={busy}
        onConfirm={resetPassword}
      >
        <Field label="New password" hint="Minimum 12 characters with mixed case and a number or symbol.">
          <input className="admin-input" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
        </Field>
      </ConfirmDialog>
    </>
  );
}
