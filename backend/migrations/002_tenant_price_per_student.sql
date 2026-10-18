-- =====================================================================
-- 002 · Tarifa mensual por alumno, por colegio
--
-- Va en platform.tenant_accounts (ficha comercial del colegio en la
-- plataforma), no en public.tenants: es un dato del contrato con MoDo Educa,
-- no del sistema escolar. Los colegios existentes quedan en $1.00.
-- El ingreso mensual estimado de cada colegio = alumnos registrados × tarifa.
-- =====================================================================

ALTER TABLE platform.tenant_accounts
  ADD COLUMN price_per_student NUMERIC(10,2) NOT NULL DEFAULT 1.00
    CONSTRAINT ck_tenant_accounts_price_per_student CHECK (price_per_student >= 0 AND price_per_student <= 10000);

COMMENT ON COLUMN platform.tenant_accounts.price_per_student IS
  'Tarifa mensual en USD por alumno registrado (ficha activa). Ingreso estimado = alumnos × tarifa.';
