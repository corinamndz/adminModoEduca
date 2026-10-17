-- =====================================================================
-- Rol de base de datos para el Tenant Manager (opcional, recomendado)
--
-- El sistema escolar aísla a los colegios con Row Level Security. El panel
-- superadmin necesita leer métricas de TODOS los colegios: con BYPASSRLS lo
-- hace en una sola consulta. Sin este rol, el backend lo detecta al arrancar y
-- calcula las métricas colegio por colegio (más lento, pero correcto).
--
-- Ejecutar como superusuario. Cambia la contraseña.
-- =====================================================================

CREATE ROLE modo_platform LOGIN PASSWORD 'cambia-esto' BYPASSRLS;

GRANT CONNECT ON DATABASE school_saas TO modo_platform;
GRANT USAGE ON SCHEMA public TO modo_platform;

-- Lectura de todo el esquema escolar (métricas).
GRANT SELECT ON ALL TABLES IN SCHEMA public TO modo_platform;

-- Escritura solo en lo necesario para dar de alta un colegio y su admin.
GRANT INSERT, UPDATE ON public.tenants, public.tenant_settings, public.users TO modo_platform;
GRANT INSERT ON public.roles, public.role_permissions, public.user_roles TO modo_platform;

-- Esquema propio de la plataforma (lo crea `npm run migrate`; si lo corre
-- otro rol, otórgale después estos permisos).
CREATE SCHEMA IF NOT EXISTS platform AUTHORIZATION modo_platform;
