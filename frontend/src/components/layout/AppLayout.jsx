import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Icon from '../ui/Icon';

const NAV = [
  { to: '/', label: 'Panel global', icon: 'home', end: true },
  { to: '/tenants', label: 'Colegios', icon: 'building' },
];

const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');

function AppLayout() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  // Una ficha de colegio (/:slug) se considera dentro de "Colegios".
  const inTenant = !['/', '/tenants'].includes(location.pathname);

  return (
    <div className={`layout ${menuOpen ? 'layout--menu-open' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar__brand">
          <span className="sidebar__logo">
            <Icon name="shield" size={20} />
          </span>
          <div>
            <strong>MoDo Educa</strong>
            <small>Tenant Manager</small>
          </div>
        </div>

        <nav className="sidebar__nav" aria-label="Principal">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                `sidebar__link ${isActive || (item.to === '/tenants' && inTenant) ? 'sidebar__link--active' : ''}`
              }
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar__footer">
          <div className="sidebar__user">
            <span className="avatar">{initials(user?.fullName)}</span>
            <div>
              <strong>{user?.fullName}</strong>
              <small>{user?.email}</small>
            </div>
          </div>
          <button type="button" className="sidebar__link sidebar__logout" onClick={logout}>
            <Icon name="logout" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      <div className="layout__backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />

      <div className="layout__main">
        <header className="topbar">
          <button type="button" className="btn btn--ghost btn--icon topbar__menu" onClick={() => setMenuOpen(true)} aria-label="Abrir menú">
            <Icon name="menu" />
          </button>
          <span className="topbar__scope">
            <Icon name="shield" size={15} /> Administración de la plataforma
          </span>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default AppLayout;
