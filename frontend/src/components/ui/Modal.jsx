import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';

/**
 * Ventana modal. Cierra con Esc o clic en el fondo (salvo `busy`, para no
 * perder un envío en curso). `footer` va abajo a la derecha.
 */
function Modal({ open, title, subtitle, onClose, size = 'md', busy = false, footer, children }) {
  const dialogRef = useRef(null);
  // En refs: así el efecto no se re-ejecuta (ni roba el foco) en cada render del padre.
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  closeRef.current = onClose;
  busyRef.current = busy;

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !busyRef.current) closeRef.current?.();
    };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    dialogRef.current?.querySelector('.modal__body input, .modal__body select, .modal__body textarea')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose?.()}>
      <div className={`modal modal--${size}`} role="dialog" aria-modal="true" aria-labelledby="modal-title" ref={dialogRef}>
        <header className="modal__header">
          <div>
            <h3 id="modal-title">{title}</h3>
            {subtitle && <p className="modal__subtitle">{subtitle}</p>}
          </div>
          <button type="button" className="btn btn--ghost btn--icon" onClick={onClose} disabled={busy} aria-label="Cerrar">
            <Icon name="x" />
          </button>
        </header>
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__footer">{footer}</footer>}
      </div>
    </div>,
    document.body
  );
}

export default Modal;
