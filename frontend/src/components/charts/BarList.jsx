import { useState } from 'react';

/**
 * Barras horizontales de una sola serie, ordenadas de mayor a menor.
 *
 *   rows: [{ key, label, value, valueLabel?, muted?, tooltip: [[etiqueta, valor], …] }]
 *   valueLabel (o formatValue(value)) → texto en la punta de la barra
 *
 * Especificación (guía de visualización): barra de 20 px (≤ 24), extremo de dato
 * redondeado 4 px y recto en la línea base, un solo color para la serie y gris
 * para "Otros". Cada fila es enfocable y muestra el mismo tooltip con hover o
 * teclado; el valor también va escrito en la punta (el tooltip nunca es la única vía).
 */
function BarList({ rows, formatValue = String, ariaLabel }) {
  const [hovered, setHovered] = useState(null);
  const max = Math.max(1, ...rows.map((r) => r.value));

  return (
    <ul className="bar-list" aria-label={ariaLabel}>
      {rows.map((row) => {
        const pct = (row.value / max) * 100;
        const active = hovered === row.key;
        return (
          <li
            key={row.key}
            className={`bar-list__row ${active ? 'bar-list__row--active' : ''}`}
            tabIndex={0}
            aria-label={`${row.label}: ${row.tooltip.map(([k, v]) => `${k} ${v}`).join(', ')}`}
            onPointerEnter={() => setHovered(row.key)}
            onPointerLeave={() => setHovered(null)}
            onFocus={() => setHovered(row.key)}
            onBlur={() => setHovered(null)}
          >
            <span className="bar-list__label" title={row.label}>
              {row.label}
            </span>
            <span className="bar-list__track">
              {/* Proporcional al espacio libre tras reservar el rótulo; mínimo 2 px para que un 0 siga visible */}
              <span
                className={`bar-list__bar ${row.muted ? 'bar-list__bar--muted' : ''}`}
                style={{ width: `max(calc((100% - var(--label-room)) * ${(pct / 100).toFixed(4)}), 2px)` }}
              />
              <span className="bar-list__value">{row.valueLabel ?? formatValue(row.value)}</span>
            </span>

            {active && (
              <span className="chart-tooltip bar-list__tooltip" role="presentation">
                <span className="chart-tooltip__title">{row.label}</span>
                {row.tooltip.map(([k, v]) => (
                  <span key={k} className="chart-tooltip__row">
                    <strong>{v}</strong>
                    <span>{k}</span>
                  </span>
                ))}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default BarList;
