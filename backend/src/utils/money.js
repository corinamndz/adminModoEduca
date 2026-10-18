/** Montos en USD con 2 decimales (NUMERIC llega de pg como texto). */
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const DEFAULT_PRICE_PER_STUDENT = 1;
const CURRENCY = 'USD';

/** Tarifa de la ficha del colegio; si no hay ficha, la tarifa por defecto. */
const priceOf = (value) => (value === null || value === undefined ? DEFAULT_PRICE_PER_STUDENT : round2(value));

module.exports = { round2, priceOf, DEFAULT_PRICE_PER_STUDENT, CURRENCY };
