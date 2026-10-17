function Spinner({ fullPage = false, label = 'Cargando…' }) {
  return (
    <div className={fullPage ? 'spinner-page' : 'spinner-inline'} role="status">
      <span className="spinner" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export default Spinner;
