const numberFmt = new Intl.NumberFormat('es-VE');
const dateFmt = new Intl.DateTimeFormat('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('es-VE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const formatNumber = (n) => numberFmt.format(Number(n) || 0);

/** $1.234 (sin decimales si el monto es entero; si no, 2). */
export function formatMoney(n, currency = 'USD') {
  const value = Number(n) || 0;
  const decimals = Number.isInteger(value) ? 0 : 2;
  return new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** Tarifas: siempre con 2 decimales ($1,00 · $2,50). */
export function formatPrice(n, currency = 'USD') {
  return new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n) || 0);
}

/** Eje Y compacto: $0, $500, $1,5 mil… */
export function formatMoneyCompact(n, currency = 'USD') {
  return new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number(n) || 0);
}

const monthShortFmt = new Intl.DateTimeFormat('es-VE', { month: 'short', timeZone: 'UTC' });
const monthLongFmt = new Intl.DateTimeFormat('es-VE', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthDate = (ym) => new Date(`${ym}-01T00:00:00Z`);

/** '2026-10' → 'oct' */
export const formatMonthShort = (ym) => monthShortFmt.format(monthDate(ym)).replace('.', '');
/** '2026-10' → 'Octubre de 2026' */
export const formatMonthLong = (ym) => {
  const text = monthLongFmt.format(monthDate(ym));
  return text.charAt(0).toUpperCase() + text.slice(1);
};
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
