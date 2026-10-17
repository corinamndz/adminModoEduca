const numberFmt = new Intl.NumberFormat('es-VE');
const dateFmt = new Intl.DateTimeFormat('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('es-VE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const formatNumber = (n) => numberFmt.format(Number(n) || 0);
export const formatDate = (value) => (value ? dateFmt.format(new Date(value)) : '—');
export const formatDateTime = (value) => (value ? dateTimeFmt.format(new Date(value)) : '—');

/** "hace 3 días" (o la fecha si pasó más de un mes). */
export function timeAgo(value) {
  if (!value) return 'Nunca';
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'Ahora';
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `Hace ${days} ${days === 1 ? 'día' : 'días'}`;
  return formatDate(value);
}

export const STATUS_LABELS = {
  active: { label: 'Activo', variant: 'success' },
  suspended: { label: 'Inactivo', variant: 'danger' },
  trial: { label: 'Prueba', variant: 'warning' },
};

export const PLAN_LABELS = { trial: 'Prueba', standard: 'Estándar', premium: 'Premium' };
