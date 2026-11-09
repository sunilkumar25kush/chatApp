import { useCallback, useEffect, useState } from 'react';
import { Eye, Lock, RefreshCw, RotateCcw, ShieldOff, Trash2, UserRoundCog } from 'lucide-react';
import adminApi, { getApiErrorMessage } from '../api/adminApi';
import { useAdminAuth } from '../context/AdminAuthContext';
import {
  Badge, ConfirmDialog, EmptyState, ErrorState, Field, Modal, PageHeader, Pagination,
  SearchInput, TableSkeleton
} from '../components/ui';
import { adminToast } from '../components/AdminToaster';
import { formatDate, formatNumber } from '../utils/format';

const ROOM_ACTIONS = {
  suspend: { title: 'Suspend room', label: 'Suspend room', tone: 'danger', reason: true, endpoint: 'suspend' },
  restore: { title: 'Restore room', label: 'Restore room', tone: 'primary', reason: false, endpoint: 'restore' },
  delete: { title: 'Delete room', label: 'Delete room', tone: 'danger', reason: true, confirm: 'DELETE', endpoint: '' },
  transfer: { title: 'Transfer ownership', label: 'Transfer ownership', tone: 'primary', reason: true, endpoint: 'transfer', transfer: true }
};

export default function RoomsPage() {
  const { hasPermission } = useAdminAuth();
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('active');
  const [visibility, setVisibility] = useState('');
  const [category, setCategory] = useState('');

  const [detail, setDetail] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reasonPrompt, setReasonPrompt] = useState('');
  const [reasonTarget, setReasonTarget] = useState(null);

  const [action, setAction] = useState(null);
  const [actionReason, setActionReason] = useState('');
  const [newOwnerId, setNewOwnerId] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [actionBusy, setActionBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await adminApi.get('/admin/rooms', {
        params: {
          page,
          limit: 20,
          search: search || undefined,
          status,
          visibility: visibility || undefined,
          category: category || undefined
        }
      });
      setRows(response.data.data);
      setPagination(response.data.pagination);
    } catch (requestError) {
      const message = getApiErrorMessage(requestError, 'Unable to load rooms');
      setError(message);
      adminToast.error(message);
    } finally {
      setLoading(false);
    }
  }, [page, search, status, visibility, category]);

  useEffect(() => {
    document.title = 'Rooms · ChatRoom Admin';
    load();
  }, [load]);

  const fetchDetail = async (room, reason = '') => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetail(null);
    try {
      const response = await adminApi.get(`/admin/rooms/${room._id}`, { params: reason ? { reason } : undefined });
      setDetail(response.data.data);
    } catch (requestError) {
      adminToast.error(getApiErrorMessage(requestError, 'Unable to load room'));
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const openDetail = (room) => {
    if (room.isPrivate && hasPermission('rooms.private.investigate')) {
      setReasonTarget(room);
      setReasonPrompt('');
      return;
    }
    fetchDetail(room);
  };

  const confirmReason = () => {
    if (reasonPrompt.trim().length < 3) {
      adminToast.warning('A reason is required to inspect private room details');
      return;
    }
    const room = reasonTarget;
    setReasonTarget(null);
    fetchDetail(room, reasonPrompt.trim());
  };

  const openAction = (type, room) => {
    setAction({ type, room });
    setActionReason('');
    setNewOwnerId('');
    setConfirmText('');
  };

  const submitAction = async () => {
    if (!action) return;
    const config = ROOM_ACTIONS[action.type];
    if (config.reason && actionReason.trim().length < 3) {
      adminToast.warning('Please provide a reason (at least 3 characters)');
      return;
    }
    if (config.confirm && confirmText !== config.confirm) {
      adminToast.warning(`Type ${config.confirm} to confirm`);
      return;
    }
    if (config.transfer && !newOwnerId.trim()) {
      adminToast.warning('Enter the new owner user ID');
      return;
    }
    setActionBusy(true);
    try {
      const payload = {
        reason: actionReason.trim() || undefined,
        newOwnerId: config.transfer ? newOwnerId.trim() : undefined,
        confirmation: config.confirm ? confirmText : undefined
      };
      if (action.type === 'delete') {
        await adminApi.delete(`/admin/rooms/${action.room._id}`, { data: payload });
      } else {
        await adminApi.post(`/admin/rooms/${action.room._id}/${config.endpoint}`, payload);
      }
      adminToast.success(`${config.title} completed`);
      setAction(null);
      load();
    } catch (requestError) {
      adminToast.error(getApiErrorMessage(requestError, 'Action failed'));
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Rooms"
        description="Inspect room metadata and moderate public or private communities. Private investigation is permission-gated and audited."
        actions={<button type="button" className="admin-btn" onClick={load} disabled={loading}><RefreshCw /> Refresh</button>}
      />

      <div className="admin-card">
        <div className="admin-filter-bar">
          <SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Search room name or code…" />
          <select className="admin-select" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="deleted">Deleted</option>
            <option value="all">All</option>
          </select>
          <select className="admin-select" value={visibility} onChange={(event) => { setVisibility(event.target.value); setPage(1); }}>
            <option value="">All visibility</option>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
          <select className="admin-select" value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }}>
            <option value="">All categories</option>
            {['General', 'Tech', 'Gaming', 'Music', 'Random', 'Custom'].map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>

        {loading ? <TableSkeleton rows={8} columns={6} /> : error ? <ErrorState message={error} onRetry={load} /> : !rows.length ? (
          <EmptyState title="No rooms found" description="Try adjusting the filters." />
        ) : (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>Room</th><th>Visibility</th><th>Owner</th><th>Members</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
                <tbody>
                  {rows.map((room) => (
                    <tr key={room._id}>
                      <td>
                        <div className="admin-table__primary">
                          <div><strong>{room.name}</strong><span>{room.code} · {room.category || 'General'}</span></div>
                        </div>
                      </td>
                      <td>
                        <Badge tone={room.visibility === 'private' ? 'warning' : 'primary'}>
                          {room.visibility === 'private' ? 'Private' : 'Public'}
                        </Badge>
                      </td>
                      <td className="admin-table__muted">{room.owner?.username || '—'}</td>
                      <td>{formatNumber(room.memberCount)} / {formatNumber(room.maxMembers)}</td>
                      <td><Badge>{room.isDeleted ? 'deleted' : room.isSuspended ? 'suspended' : 'active'}</Badge></td>
                      <td className="admin-table__muted">{formatDate(room.createdAt, { hour: undefined, minute: undefined })}</td>
                      <td>
                        <div className="admin-table__actions">
                          <button type="button" className="admin-btn admin-btn--sm" onClick={() => openDetail(room)}><Eye /> View</button>
                          {hasPermission('rooms.suspend') && !room.isSuspended && !room.isDeleted ? (
                            <button type="button" className="admin-btn admin-btn--sm" onClick={() => openAction('suspend', room)}><ShieldOff /></button>
                          ) : null}
                          {hasPermission('rooms.suspend') && room.isSuspended ? (
                            <button type="button" className="admin-btn admin-btn--sm" onClick={() => openAction('restore', room)}><RotateCcw /></button>
                          ) : null}
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
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={detail?.name || 'Room details'}
        description={detail?.code ? `${detail.code} · ${detail.visibility || 'public'}` : undefined}
        size="lg"
        footer={detail ? (
          <div className="admin-row" style={{ width: '100%' }}>
            {hasPermission('rooms.suspend') && !detail.isSuspended && !detail.isDeleted ? (
              <button type="button" className="admin-btn admin-btn--danger admin-btn--sm" onClick={() => openAction('suspend', detail)}><ShieldOff /> Suspend</button>
            ) : null}
            {hasPermission('rooms.suspend') && detail.isSuspended ? (
              <button type="button" className="admin-btn admin-btn--primary admin-btn--sm" onClick={() => openAction('restore', detail)}><RotateCcw /> Restore</button>
            ) : null}
            {hasPermission('rooms.transfer') && !detail.isDeleted ? (
              <button type="button" className="admin-btn admin-btn--sm" onClick={() => openAction('transfer', detail)}><UserRoundCog /> Transfer</button>
            ) : null}
            {hasPermission('rooms.delete') && !detail.isDeleted ? (
              <button type="button" className="admin-btn admin-btn--sm admin-text-danger" onClick={() => openAction('delete', detail)}><Trash2 /> Delete</button>
            ) : null}
          </div>
        ) : null}
      >
        {detailLoading ? <TableSkeleton rows={6} columns={2} /> : detail ? (
          <div className="admin-stack">
            {detail.restricted ? (
              <div className="admin-alert admin-alert--warning"><Lock size={16} /> Private room metadata is restricted for your role.</div>
            ) : null}
            <div className="admin-row" style={{ gap: 10 }}>
              <Badge tone={detail.visibility === 'private' ? 'warning' : 'primary'}>{detail.visibility === 'private' ? 'Private' : 'Public'}</Badge>
              <Badge>{detail.isDeleted ? 'deleted' : detail.isSuspended ? 'suspended' : 'active'}</Badge>
              <span className="admin-text-muted">{detail.category || 'General'}</span>
            </div>
            {detail.isSuspended ? (
              <div className="admin-alert admin-alert--warning"><div><strong>Room is suspended</strong><div>{detail.suspendedReason || 'No reason recorded'}</div></div></div>
            ) : null}
            <div className="admin-grid admin-grid--3">
              {[
                ['Members', detail.memberCount],
                ['Admins', detail.adminCount],
                ['Messages', detail.messageCount],
                ['Pending joins', detail.pendingJoinRequests],
                ['Open reports', detail.openReports],
                ['Max members', detail.maxMembers]
              ].map(([label, value]) => (
                <div key={label} style={{ padding: 12, border: '1px solid var(--a-border)', borderRadius: 10, background: 'var(--a-surface-2)' }}>
                  <div className="admin-text-muted" style={{ fontSize: 11 }}>{label}</div>
                  <strong style={{ fontSize: 19 }}>{formatNumber(value)}</strong>
                </div>
              ))}
            </div>
            <dl className="admin-kv">
              <dt>Owner</dt><dd>{detail.owner?.username || '—'} {detail.owner?.email ? `· ${detail.owner.email}` : ''}</dd>
              <dt>Created by</dt><dd>{detail.createdBy?.username || '—'}</dd>
              <dt>Created</dt><dd>{formatDate(detail.createdAt)}</dd>
              <dt>Updated</dt><dd>{formatDate(detail.updatedAt)}</dd>
              <dt>Description</dt><dd>{detail.description || '—'}</dd>
              <dt>Room ID</dt><dd className="admin-mono">{detail._id}</dd>
            </dl>
            <div>
              <h4 style={{ marginBottom: 8, fontSize: 13 }}>Members ({detail.members?.length || 0})</h4>
              {detail.members?.length ? (
                <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                  {detail.members.map((member) => (
                    <div className="admin-health-row" key={member._id}>
                      <div>
                        <strong>{member.username || 'Unknown'}</strong>
                        <div className="admin-table__muted">{member.publicId || member.email || ''}</div>
                      </div>
                      <Badge>{member.accountStatus || 'active'}</Badge>
                    </div>
                  ))}
                </div>
              ) : <p className="admin-text-muted">No members.</p>}
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(reasonTarget)}
        onClose={() => setReasonTarget(null)}
        title="Inspect private room"
        description="Access to private room details is audited. Provide a specific, policy-compliant reason."
        footer={(
          <>
            <button type="button" className="admin-btn" onClick={() => setReasonTarget(null)}>Cancel</button>
            <button type="button" className="admin-btn admin-btn--primary" onClick={confirmReason}>Continue</button>
          </>
        )}
      >
        <Field label="Investigation reason" hint="Minimum 3 characters. This is written to the audit log.">
          <textarea className="admin-textarea" value={reasonPrompt} onChange={(event) => setReasonPrompt(event.target.value)} placeholder="e.g. Investigating report #…" />
        </Field>
      </Modal>

      <ConfirmDialog
        open={Boolean(action)}
        onClose={() => setAction(null)}
        title={action ? ROOM_ACTIONS[action.type].title : ''}
        description={action ? `This action affects “${action.room.name}” and is recorded in the audit log.` : ''}
        confirmLabel={action ? ROOM_ACTIONS[action.type].label : 'Confirm'}
        tone={action ? ROOM_ACTIONS[action.type].tone : 'danger'}
        busy={actionBusy}
        onConfirm={submitAction}
      >
        {action ? (
          <div className="admin-stack">
            {ROOM_ACTIONS[action.type].transfer ? (
              <Field label="New owner user ID" hint="The recipient must be an existing, active user.">
                <input className="admin-input" value={newOwnerId} onChange={(event) => setNewOwnerId(event.target.value)} placeholder="MongoDB user ID" />
              </Field>
            ) : null}
            {ROOM_ACTIONS[action.type].reason ? (
              <Field label="Reason" hint="Required and recorded in the audit trail.">
                <textarea className="admin-textarea" value={actionReason} onChange={(event) => setActionReason(event.target.value)} placeholder="Explain the moderation decision…" />
              </Field>
            ) : null}
            {ROOM_ACTIONS[action.type].confirm ? (
              <Field label={`Type ${ROOM_ACTIONS[action.type].confirm} to confirm`}>
                <input className="admin-input" value={confirmText} onChange={(event) => setConfirmText(event.target.value)} placeholder={ROOM_ACTIONS[action.type].confirm} />
              </Field>
            ) : null}
          </div>
        ) : null}
      </ConfirmDialog>
    </>
  );
}
