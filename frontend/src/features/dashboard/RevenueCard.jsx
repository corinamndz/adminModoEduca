import { Card } from '../../components/ui/primitives';
import Icon from '../../components/ui/Icon';
import { formatMoney, formatNumber, formatPrice } from '../../lib/format';

/**
 * Cifra principal del panel: ingreso mensual estimado (alumnos registrados ×
 * tarifa) de los colegios facturables. Un número destacado, no un gráfico.
 */
function RevenueCard({ revenue }) {
  const { monthlyTotal, averagePricePerStudent, billableStudents, billableTenants, trialPotential, trend, currency } = revenue;
  const previous = trend.length > 1 ? trend[trend.length - 2].revenue : 0;
  const delta = monthlyTotal - previous;

  return (
    <Card className="revenue-card">
      <div className="revenue-card__label">
        <span className="revenue-card__icon">
          <Icon name="trendingUp" size={18} />
        </span>
        Ingreso mensual estimado
      </div>

      <div className="revenue-card__value">{formatMoney(monthlyTotal, currency)}</div>
      <p className="revenue-card__formula">
        {formatNumber(billableStudents)} alumnos registrados × la tarifa de cada colegio
      </p>

      <dl className="revenue-card__facts">
        <div>
          <dt>Variación vs. mes anterior</dt>
          <dd className={delta > 0 ? 'is-up' : undefined}>
            {delta > 0 ? '+' : ''}
            {formatMoney(delta, currency)}
          </dd>
        </div>
        <div>
          <dt>Tarifa promedio por alumno</dt>
          <dd>{averagePricePerStudent === null ? '—' : formatPrice(averagePricePerStudent, currency)}</dd>
        </div>
        <div>
          <dt>Colegios facturables</dt>
          <dd>{formatNumber(billableTenants)}</dd>
        </div>
        <div>
          <dt>Proyección anual</dt>
          <dd>{formatMoney(monthlyTotal * 12, currency)}</dd>
        </div>
        {trialPotential > 0 && (
          <div>
            <dt>Potencial en colegios de prueba</dt>
            <dd>+{formatMoney(trialPotential, currency)} / mes</dd>
          </div>
        )}
      </dl>
    </Card>
  );
}

export default RevenueCard;
