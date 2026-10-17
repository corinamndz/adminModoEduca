-- =====================================================================
-- Tenant Manager (Superadmin) · Esquema de la plataforma
--
-- Vive en la MISMA base PostgreSQL que el sistema escolar, pero en un esquema
-- propio (`platform`) para no mezclar sus migraciones con las del colegio:
--
--   public.*    → sistema escolar (tenants, users, students, staff…), con RLS
--                 por `app.tenant_id`. El Tenant Manager LEE y, al dar de alta
--                 un colegio, ESCRIBE en tenants, tenant_settings, roles,
--                 role_permissions, users y user_roles.
--   platform.*  → solo de la plataforma: superadmins, ficha comercial de cada
--                 colegio, envíos de credenciales y auditoría global.
--
-- Requiere que las migraciones del sistema escolar ya estén aplicadas
-- (en especial 001_init.sql y 040_must_change_password.sql).
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- gen_random_uuid()

CREATE SCHEMA IF NOT EXISTS platform;

-- ---------------------------------------------------------------------
-- 1. Superadministradores de la plataforma (NO son usuarios de un colegio)
-- ---------------------------------------------------------------------
CREATE TABLE platform.superadmins (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          VARCHAR(150) NOT NULL,
  full_name      VARCHAR(150) NOT NULL,
  password_hash  TEXT NOT NULL,
  status         VARCHAR(20) NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'inactive')),
  last_login_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_superadmins_email ON platform.superadmins (lower(email));

-- ---------------------------------------------------------------------
-- 2. Ficha de cada colegio en la plataforma (1:1 con public.tenants)
--    `public.tenants` sigue siendo la tabla maestra (slug, estado); aquí va
--    lo que solo le importa a la plataforma: quién es el admin principal,
--    plan contratado, notas internas y quién lo dio de alta.
-- ---------------------------------------------------------------------
CREATE TABLE platform.tenant_accounts (
  tenant_id              UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  primary_admin_user_id  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  admin_full_name        VARCHAR(150) NOT NULL,
  admin_email            VARCHAR(150) NOT NULL,
  admin_phone            VARCHAR(30),
  plan                   VARCHAR(30) NOT NULL DEFAULT 'standard'
                         CHECK (plan IN ('trial', 'standard', 'premium')),
  notes                  TEXT,
  created_by             UUID REFERENCES platform.superadmins(id) ON DELETE SET NULL,
  status_changed_at      TIMESTAMPTZ,
  status_changed_by      UUID REFERENCES platform.superadmins(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 3. Envíos de credenciales (bienvenida y reenvíos). Nunca guarda la clave.
-- ---------------------------------------------------------------------
CREATE TABLE platform.credential_deliveries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES public.users(id) ON DELETE SET NULL,
  recipient     VARCHAR(150) NOT NULL,
  kind          VARCHAR(20) NOT NULL CHECK (kind IN ('welcome', 'resend')),
  status        VARCHAR(20) NOT NULL CHECK (status IN ('sent', 'failed')),
  error         TEXT,
  sent_by       UUID REFERENCES platform.superadmins(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_credential_deliveries_tenant ON platform.credential_deliveries (tenant_id, created_at DESC);

-- ---------------------------------------------------------------------
-- 4. Auditoría de acciones del superadmin
-- ---------------------------------------------------------------------
CREATE TABLE platform.audit_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  superadmin_id  UUID REFERENCES platform.superadmins(id) ON DELETE SET NULL,
  tenant_id      UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  action         VARCHAR(50) NOT NULL,   -- tenant.create, tenant.status, tenant.resend_credentials, auth.login
  details        JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip             VARCHAR(64),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_platform_audit_tenant ON platform.audit_logs (tenant_id, created_at DESC);
CREATE INDEX idx_platform_audit_created ON platform.audit_logs (created_at DESC);

-- ---------------------------------------------------------------------
-- 5. Ficha para los colegios que ya existían antes del Tenant Manager
--    (ej. "demo"): se toma como admin principal al primer usuario con rol
--    Administrador. El correo queda vacío hasta que se edite.
-- ---------------------------------------------------------------------
INSERT INTO platform.tenant_accounts (tenant_id, primary_admin_user_id, admin_full_name, admin_email, created_at)
SELECT t.id, a.user_id, COALESCE(a.full_name, 'Sin asignar'), COALESCE(a.username, ''), t.created_at
FROM public.tenants t
LEFT JOIN LATERAL (
  SELECT u.id AS user_id, u.full_name, u.username
  FROM public.users u
  JOIN public.user_roles ur ON ur.user_id = u.id
  JOIN public.roles r ON r.id = ur.role_id
  WHERE u.tenant_id = t.id AND r.name = 'Administrador'
  ORDER BY u.created_at
  LIMIT 1
) a ON true
ON CONFLICT (tenant_id) DO NOTHING;

-- Índice útil para el listado (orden por fecha de alta).
CREATE INDEX IF NOT EXISTS idx_tenants_created_at ON public.tenants (created_at DESC);
