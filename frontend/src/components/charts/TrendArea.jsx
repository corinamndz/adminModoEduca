import { useState } from 'react';
import useElementWidth from './useElementWidth';

const HEIGHT = 220; // alto del área de trazado
const AXIS_BAND = 28; // banda del eje X (incluida en el alto del SVG: nunca se recorta)
const PAD = { top: 16, right: 56, left: 52 };

/**
 * Eje Y "limpio": paso de 1, 2, 2.5 o 5 × 10ⁿ (≈ 4 divisiones) y el máximo en el
 * primer múltiplo del paso que cubre el dato (sin media gráfica vacía arriba).
 */
function niceScale(maxValue, targetTicks = 4) {
  const top = Math.max(maxValue, 1);
  const raw = top / targetTicks;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw));
  const count = Math.max(1, Math.ceil(top / step));
  return { max: step * count, ticks: Array.from({ length: count + 1 }, (_, i) => i * step) };
}

/**
 * Área de una sola serie en el tiempo (sin leyenda: el título dice qué es).
 *
 *   points: [{ key, label, longLabel, value, detail? }]
 *   formatValue / formatTick: textos del valor y del eje Y
 *
 * Línea de 2 px, relleno al 10 %, punto final con anillo de 2 px y su valor
 * escrito; retícula de líneas finas sólidas. La línea vertical (crosshair) busca
 * el mes más cercano al puntero, y con el teclado se recorre con ← →.
 */
function TrendArea({ points, formatValue, formatTick, ariaLabel }) {
  const [ref, width] = useElementWidth();
  const [index, setIndex] = useState(null);

  const innerW = Math.max(width - PAD.left - PAD.right, 10);
  const scale = niceScale(Math.max(...points.map((p) => p.value)));
  const x = (i) => PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v) => PAD.top + HEIGHT - (v / scale.max) * HEIGHT;
  const baseline = y(0);

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${baseline} L${x(0).toFixed(1)},${baseline} Z`;
  const last = points.length - 1;
  // Con poco ancho, se rotula un mes de cada dos.
  const labelEvery = innerW / points.length < 44 ? 2 : 1;

  const nearest = (clientX, rect) => {
    const px = clientX - rect.left - PAD.left;
    return Math.min(last, Math.max(0, Math.round((px / innerW) * last)));
  };

  const onKeyDown = (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    setIndex((current) => {
      const i = current ?? last;
      if (e.key === 'Home') return 0;
      if (e.key === 'End') return last;
      return Math.min(last, Math.max(0, i + (e.key === 'ArrowRight' ? 1 : -1)));
    });
  };

  const active = index !== null ? points[index] : null;
  const tooltipLeft = active ? Math.min(Math.max(x(index), 90), width - 90) : 0;

  return (
    <div className="trend" ref={ref}>
      <svg
        width={width}
        height={PAD.top + HEIGHT + AXIS_BAND}
        role="img"
        aria-label={ariaLabel}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onFocus={() => setIndex((i) => i ?? last)}
        onBlur={() => setIndex(null)}
        onPointerMove={(e) => setIndex(nearest(e.clientX, e.currentTarget.getBoundingClientRect()))}
        onPointerLeave={() => setIndex(null)}
        className="trend__svg"
      >
        {/* Retícula y eje Y */}
        {scale.ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={PAD.left + innerW} y1={y(t)} y2={y(t)} className={t === 0 ? 'trend__baseline' : 'trend__grid'} />
            <text x={PAD.left - 10} y={y(t)} className="trend__tick" textAnchor="end" dominantBaseline="middle">
              {formatTick(t)}
            </text>
          </g>
        ))}

        {/* Eje X */}
        {points.map((p, i) =>
          i % labelEvery === (last % labelEvery) ? (
            <text key={p.key} x={x(i)} y={PAD.top + HEIGHT + 20} className="trend__tick" textAnchor="middle">
              {p.label}
            </text>
          ) : null
        )}

        <path d={area} className="trend__area" />
        <path d={line} className="trend__line" />

        {/* Valor final: el único rotulado directamente */}
        <circle cx={x(last)} cy={y(points[last].value)} r={4} className="trend__dot" />
        <text x={x(last) + 10} y={y(points[last].value)} className="trend__end-label" dominantBaseline="middle">
          {formatValue(points[last].value)}
        </text>

        {/* Crosshair */}
        {active && (
          <g>
            <line x1={x(index)} x2={x(index)} y1={PAD.top} y2={baseline} className="trend__crosshair" />
            <circle cx={x(index)} cy={y(active.value)} r={5} className="trend__dot" />
          </g>
        )}
      </svg>

      {active && (
        <div className="chart-tooltip trend__tooltip" style={{ left: tooltipLeft }} role="status">
          <span className="chart-tooltip__title">{active.longLabel}</span>
          <span className="chart-tooltip__row">
            <i className="chart-tooltip__key" aria-hidden="true" />
            <strong>{formatValue(active.value)}</strong>
          </span>
          {active.detail && <span className="chart-tooltip__note">{active.detail}</span>}
        </div>
      )}
    </div>
  );
}

export default TrendArea;
