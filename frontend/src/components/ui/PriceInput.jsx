/**
 * Campo de monto en USD con prefijo "$". Guarda el texto tal cual se escribe
 * (acepta "1,50" o "1.50"); `parsePrice` lo convierte al enviar.
 */
function PriceInput({ id, value, onChange, invalid, ...props }) {
  return (
    <div className="input-group input-group--prefix">
      <span className="input-group__prefix">$</span>
      <input
        id={id}
        className={`input input--money ${invalid ? 'input--error' : ''}`}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''))}
        aria-invalid={invalid || undefined}
        {...props}
      />
    </div>
  );
}

/** "1,50" → 1.5 · "" o inválido → null */
export function parsePrice(text) {
  const normalized = String(text ?? '').trim().replace(',', '.');
  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) return null;
  return Number(normalized);
}

/** Mensaje de validación local (el backend valida igual). */
export function priceProblem(text) {
  if (String(text ?? '').trim() === '') return 'Indica el valor por alumno.';
  const n = parsePrice(text);
  if (n === null) return 'Monto inválido: usa números con hasta 2 decimales (ej.: 1,50).';
  if (n > 10000) return 'No puede superar $10.000.';
  return null;
}

export default PriceInput;
