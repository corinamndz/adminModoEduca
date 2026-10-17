import { Link } from 'react-router-dom';
import { EmptyState } from '../../components/ui/primitives';

function NotFoundPage({ title = 'Página no encontrada', message = 'La dirección no corresponde a ninguna sección ni colegio.' }) {
  return (
    <div className="card">
      <EmptyState icon="alertCircle" title={title}>
        {message} <Link to="/tenants">Ver colegios</Link>
      </EmptyState>
    </div>
  );
}

export default NotFoundPage;
