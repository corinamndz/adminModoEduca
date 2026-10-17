import Icon from './Icon';

/**
 * `variant`: primary | secondary | danger | ghost. `size`: 'sm'.
 * `loading` deshabilita el botón y muestra un spinner (evita doble envío).
 */
function Button({ variant = 'primary', size, icon, loading, loadingText = 'Guardando…', children, className = '', type = 'button', ...props }) {
  const classes = ['btn', `btn--${variant}`, size ? `btn--${size}` : '', className].filter(Boolean).join(' ');
  return (
    <button type={type} className={classes} disabled={loading || props.disabled} aria-busy={loading || undefined} {...props}>
      {loading ? (
        <>
          <span className="btn__spinner" aria-hidden="true" />
          {loadingText}
        </>
      ) : (
        <>
          {icon && <Icon name={icon} size={size === 'sm' ? 15 : 17} />}
          {children}
        </>
      )}
    </button>
  );
}

export default Button;
