-- =====================================================================
-- 003 · Un esquema de PostgreSQL por colegio
--
-- Registro maestro: public.tenants.schema_name dice en qué esquema viven los
-- datos de cada colegio. El sistema escolar lo lee al abrir cada transacción
-- y fija `search_path = "<schema_name>", public`:
--   - las tablas del colegio (students, users, roles…) se resuelven en SU esquema;
--   - las globales (tenants, modules, currencies, education_levels) y las
--     funciones de los triggers siguen en public.
--
-- NULL = colegio creado antes de este cambio: sus datos siguen en public
-- (modelo compartido con tenant_id + RLS), sin cambios para él.
-- =====================================================================

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS schema_name VARCHAR(63);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_tenants_schema_name') THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT ck_tenants_schema_name CHECK (
        schema_name IS NULL OR (
          schema_name ~ '^[a-z][a-z0-9_]{0,62}$'
          AND schema_name NOT IN ('public', 'platform', 'information_schema')
          AND schema_name !~ '^pg_'
        )
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_tenants_schema_name ON public.tenants (schema_name) WHERE schema_name IS NOT NULL;

COMMENT ON COLUMN public.tenants.schema_name IS
  'Esquema de PostgreSQL con los datos del colegio (NULL = datos en public). Lo asigna el Tenant Manager al crear el colegio.';

-- El admin principal y los envíos de credenciales apuntan a un usuario que
-- ahora puede vivir en el esquema del colegio, no en public.users: la FK
-- fija a public.users se quita (la columna queda como referencia lógica).
ALTER TABLE platform.tenant_accounts DROP CONSTRAINT IF EXISTS tenant_accounts_primary_admin_user_id_fkey;
ALTER TABLE platform.credential_deliveries DROP CONSTRAINT IF EXISTS credential_deliveries_user_id_fkey;
