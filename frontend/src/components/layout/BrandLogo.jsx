import { Link } from 'react-router-dom';
import logoLight from '../../assets/modo-educa-logo.png';
import logoDark from '../../assets/modo-educa-logo-dark.png';

/**
 * Logotipo oficial de MoDo Educa, enlazado al panel global.
 *
 * `variant`:
 *   'dark'  → sobre fondo oscuro (sidebar): modo-educa-logo-dark.png, derivado
 *             del original con "Educa" y el lema en claro y el cuerpo opaco
 *             (el original se exportó para fondo blanco y se apaga sobre oscuro).
 *   'light' → sobre fondo claro (barra superior en móvil): el original.
 */
function BrandLogo({ variant = 'dark', onClick }) {
  return (
    <Link to="/" className={`brand-logo brand-logo--${variant}`} onClick={onClick} title="Ir al panel global">
      {/* width/height reales: el navegador reserva el espacio y el logo no "salta" al cargar */}
      <img
        src={variant === 'dark' ? logoDark : logoLight}
        alt="MoDo Educa · Ir al panel global"
        width="1400"
        height="410"
        decoding="async"
      />
    </Link>
  );
}

export default BrandLogo;
