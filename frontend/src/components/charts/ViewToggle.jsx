/** Alterna gráfico ↔ tabla: la tabla es el equivalente accesible de cada gráfico. */
function ViewToggle({ value, onChange, label }) {
  return (
    <div className="segmented segmented--sm" role="group" aria-label={`Vista de ${label}`}>
      {[
        ['chart', 'Gráfico'],
        ['table', 'Tabla'],
      ].map(([key, text]) => (
        <button
          key={key}
          type="button"
          className={`segmented__item ${value === key ? 'segmented__item--active' : ''}`}
          aria-pressed={value === key}
          onClick={() => onChange(key)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

export default ViewToggle;
