import { X, Inbox, Search } from 'lucide-react';
import { useEffect } from 'react';
import { initials, statusTone, titleCase } from '../utils/format';

export function PageHeader({ title, description, actions }) {
  return (
    <div className="admin-page-head">
      <div>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="admin-page-actions">{actions}</div> : null}
    </div>
  );
}

export function Badge({ children, tone, dot = false }) {
  const resolvedTone = tone || statusTone(children);
  return (
    <span className={`admin-badge admin-badge--${resolvedTone}`}>
      {dot ? <span className="admin-dot" /> : null}
      {children ? titleCase(children) : '—'}
    </span>
  );
}

export function Avatar({ name, size = 34 }) {
  return (
    <span className="admin-avatar" style={{ width: size, height: size, flexBasis: size, fontSize: size * 0.34 }}>
      {initials(name)}
    </span>
  );
}

export function Spinner({ label }) {
  return (
    <span className="admin-row" role="status" aria-live="polite">
      <span className="admin-spinner" />
      {label ? <span className="admin-text-muted">{label}</span> : null}
    </span>
  );
}

export function Skeleton({ width = '100%', height = 14, style }) {
  return <span className="admin-skeleton" style={{ display: 'block', width, height, ...style }} />;
}

export function StatsSkeleton({ count = 4 }) {
  return (
    <div className="admin-stat-grid">
      {Array.from({ length: count }).map((_, index) => (
        <div className="admin-stat" key={index}>
          <Skeleton width="42%" height={11} />
          <div style={{ marginTop: 14 }}><Skeleton width="58%" height={28} /></div>
          <div style={{ marginTop: 8 }}><Skeleton width="34%" height={10} /></div>
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 6, columns = 5 }) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>{Array.from({ length: columns }).map((_, index) => <th key={index}><Skeleton width="60%" height={9} /></th>)}</tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, row) => (
            <tr key={row}>
              {Array.from({ length: columns }).map((__, column) => (
                <td key={column}><Skeleton width={column === 0 ? '82%' : '58%'} height={12} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EmptyState({ title = 'Nothing here yet', description, action, icon: Icon = Inbox }) {
  return (
    <div className="admin-empty">
      <span className="admin-empty__icon"><Icon /></span>
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="admin-empty">
      <span className="admin-empty__icon" style={{ color: 'var(--a-danger)', background: 'var(--a-danger-soft)' }}>
        <X />
      </span>
      <strong>Could not load this data</strong>
      <p>{message || 'The server did not return a response. Please try again.'}</p>
      {onRetry ? <button type="button" className="admin-btn" onClick={onRetry}>Try again</button> : null}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…' }) {
  return (
    <div className="admin-search">
      <Search />
      <input
        className="admin-input"
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export function Pagination({ pagination, onPageChange }) {
  if (!pagination) return null;
  const { page = 1, pages = 1, total = 0 } = pagination;
  return (
    <div className="admin-pagination">
      <span>{total.toLocaleString()} result{total === 1 ? '' : 's'} · Page {page} of {Math.max(pages, 1)}</span>
      <div className="admin-pagination__buttons">
        <button type="button" className="admin-btn admin-btn--sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</button>
        <button type="button" className="admin-btn admin-btn--sm" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>Next</button>
      </div>
    </div>
  );
}

export function Modal({ open, onClose, title, description, size = '', children, footer }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <div className={`admin-modal ${size ? `admin-modal--${size}` : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="admin-modal__head">
          <div>
            <h3>{title}</h3>
            {description ? <p>{description}</p> : null}
          </div>
          <button type="button" className="admin-icon-btn" onClick={onClose} aria-label="Close dialog"><X /></button>
        </div>
        <div className="admin-modal__body">{children}</div>
        {footer ? <div className="admin-modal__foot">{footer}</div> : null}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, description, confirmLabel = 'Confirm', tone = 'danger', busy, onConfirm, onClose, children }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={(
        <>
          <button type="button" className="admin-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className={`admin-btn ${tone === 'danger' ? 'admin-btn--danger' : 'admin-btn--primary'}`} onClick={onConfirm} disabled={busy}>
            {busy ? <span className="admin-spinner" /> : null}
            {confirmLabel}
          </button>
        </>
      )}
    >
      {children}
    </Modal>
  );
}

export function Field({ label, hint, children, full = false }) {
  return (
    <div className={`admin-field ${full ? 'admin-field--full' : ''}`}>
      {label ? <label>{label}</label> : null}
      {children}
      {hint ? <span className="admin-field__hint">{hint}</span> : null}
    </div>
  );
}

export function Switch({ checked, onChange, label, description, disabled }) {
  return (
    <label className="admin-switch" style={disabled ? { opacity: 0.6 } : undefined}>
      <input type="checkbox" checked={Boolean(checked)} onChange={(event) => onChange?.(event.target.checked)} disabled={disabled} />
      <span className="admin-switch__track" />
      <span>
        <strong style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>{label}</strong>
        {description ? <span className="admin-text-muted" style={{ fontSize: 11.5 }}>{description}</span> : null}
      </span>
    </label>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="admin-tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={value === tab.value}
          className={`admin-tab ${value === tab.value ? 'active' : ''}`}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// Export React Bits components from the design system
export { SpotlightCard, CountUp, GlassSurface, BlurText, AuroraBackground, FadeContent } from './reactbits';
