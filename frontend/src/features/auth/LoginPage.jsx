import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { errorMessage } from '../../api/client';
import Button from '../../components/ui/Button';
import Icon from '../../components/ui/Icon';
import { Alert, Field } from '../../components/ui/primitives';

function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated) return <Navigate to="/" replace />;

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(form);
      navigate(location.state?.from?.pathname || '/', { replace: true });
    } catch (err) {
      setError(errorMessage(err, 'No se pudo iniciar sesión.'));
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={onSubmit} noValidate>
        <div className="auth-card__brand">
          <span className="sidebar__logo">
            <Icon name="shield" size={22} />
          </span>
          <div>
            <h1>Tenant Manager</h1>
            <p>Administración central de MoDo Educa</p>
          </div>
        </div>

        {error && <Alert variant="danger">{error}</Alert>}

        <Field label="Correo" htmlFor="email">
          <input id="email" name="email" type="email" className="input" autoComplete="username" value={form.email} onChange={onChange} required />
        </Field>
        <Field label="Contraseña" htmlFor="password">
          <input
            id="password"
            name="password"
            type="password"
            className="input"
            autoComplete="current-password"
            value={form.password}
            onChange={onChange}
            required
          />
        </Field>

        <Button type="submit" className="btn--block" loading={submitting} loadingText="Ingresando…" disabled={!form.email || !form.password}>
          Iniciar sesión
        </Button>
        <p className="auth-card__note">
          <Icon name="lock" size={14} /> Acceso exclusivo para superadministradores.
        </p>
      </form>
    </div>
  );
}

export default LoginPage;
