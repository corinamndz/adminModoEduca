import Icon from './Icon';

/** `variant`: success | warning | danger | info | neutral | primary */
export function Badge({ variant = 'neutral', children }) {
  return <span className={`badge badge--${variant}`}>{children}</span>;
}

export function Card({ title, subtitle, actions, children, className = '', flush = false }) {
  return (
    <section className={`card ${flush ? 'card--flush' : ''} ${className}`}>
      {(title || actions) && (
        <header className="card__header">
          <div>
            {title && <h3 className="card__title">{title}</h3>}
            {subtitle && <p className="card__subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="card__actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, actions, back }) {
  return (
    <div className="page-header">
      <div>
        {back}
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </div>
  );
}

const ALERT_ICONS = { success: 'checkCircle', warning: 'alertTriangle', danger: 'alertCircle', info: 'info' };

export function Alert({ variant = 'info', title, children }) {
  return (
    <div className={`alert alert--${variant}`} role={variant === 'danger' ? 'alert' : 'status'}>
      <Icon name={ALERT_ICONS[variant]} size={18} />
      <div>
        {title && <strong className="alert__title">{title}</strong>}
        {children && <div>{children}</div>}
      </div>
    </div>
  );
}

/** Etiqueta + control + ayuda/error. El control va como `children`. */
export function Field({ label, htmlFor, hint, error, required, full, children }) {
  return (
    <div className={`field ${full ? 'field--full' : ''}`}>
      {label && (
        <label className="field__label" htmlFor={htmlFor}>
          {label}
          {required && <span className="field__required" aria-hidden="true"> *</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="field-error" role="alert">{error}</p>
      ) : (
        hint && <p className="field__hint">{hint}</p>
      )}
    </div>
  );
}

export function StatCard({ label, value, icon, footer, tone = 'primary', loading }) {
  return (
    <div className={`stat-card stat-card--${tone}`}>
      <div className="stat-card__top">
        <span className="stat-card__label">{label}</span>
        {icon && (
          <span className="stat-card__icon">
            <Icon name={icon} size={20} />
          </span>
        )}
      </div>
      {loading ? <div className="stat-skeleton" /> : <div className="stat-card__value">{value}</div>}
      {footer && <div className="stat-card__footer">{footer}</div>}
    </div>
  );
}

export function EmptyState({ icon = 'building', title, children }) {
  return (
    <div className="empty-state">
      <span className="empty-state__icon">
        <Icon name={icon} size={26} />
      </span>
      <h4>{title}</h4>
      {children && <p>{children}</p>}
    </div>
  );
}
