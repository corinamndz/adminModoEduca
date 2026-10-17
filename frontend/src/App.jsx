import { Navigate, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import AppLayout from './components/layout/AppLayout';
import Spinner from './components/ui/Spinner';
import LoginPage from './features/auth/LoginPage';
import DashboardPage from './features/dashboard/DashboardPage';
import TenantsPage from './features/tenants/TenantsPage';
import TenantDetailPage from './features/tenants/TenantDetailPage';
import NotFoundPage from './features/dashboard/NotFoundPage';
import { isValidSlug, isReservedSlug } from './lib/slug';

function ProtectedRoute() {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner fullPage />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}

/**
 * `/:tenantSlug` → ficha del colegio. Las rutas fijas (/tenants, /login…)
 * tienen prioridad en React Router; aquí además se descartan slugs con formato
 * inválido o reservados, para que un enlace roto muestre 404 y no una
 * consulta al API.
 */
function TenantSlugRoute() {
  const { tenantSlug } = useParams();
  if (!isValidSlug(tenantSlug) || isReservedSlug(tenantSlug)) return <NotFoundPage />;
  return <TenantDetailPage key={tenantSlug} slug={tenantSlug.toLowerCase()} />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="tenants" element={<TenantsPage />} />
          {/* localhost:5174/nombre-del-colegio */}
          <Route path=":tenantSlug" element={<TenantSlugRoute />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
