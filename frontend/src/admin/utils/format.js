export const formatNumber = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  return new Intl.NumberFormat(undefined, { notation: number >= 100000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(number);
};

export const formatDate = (value, options = {}) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    ...options
  });
};

export const formatDay = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export const relativeTime = (value) => {
  if (!value) return '—';
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return '—';
  const seconds = Math.round((time - Date.now()) / 1000);
  const ranges = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
    ['second', 1]
  ];
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  for (const [unit, secondsInUnit] of ranges) {
    if (Math.abs(seconds) >= secondsInUnit || unit === 'second') {
      return formatter.format(Math.round(seconds / secondsInUnit), unit);
    }
  }
  return '—';
};

export const titleCase = (value) => String(value || '')
  .replace(/[_-]+/g, ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

export const roleLabel = (role) => ({
  super_admin: 'Super Admin',
  admin: 'Admin',
  moderator: 'Moderator',
  support: 'Support Agent'
}[role] || titleCase(role));

export const statusTone = (status) => {
  const value = String(status || '').toLowerCase();
  if (['active', 'resolved', 'sent', 'success', 'accepted', 'online'].includes(value)) return 'success';
  if (['pending', 'under_review', 'scheduled', 'sending', 'ringing', 'draft', 'warning'].includes(value)) return 'warning';
  if (['suspended', 'banned', 'rejected', 'failed', 'cancelled', 'deleted', 'escalated', 'ended', 'offline'].includes(value)) return 'danger';
  if (['inactive', 'info'].includes(value)) return 'info';
  return 'primary';
};

export const initials = (value) => String(value || '?')
  .split(' ')
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0])
  .join('')
  .toUpperCase();

export const durationLabel = (seconds) => {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
};
