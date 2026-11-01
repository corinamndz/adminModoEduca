-- =====================================================================
-- 004 · Soporte técnico: tickets de los colegios
--
-- Tabla GLOBAL de la plataforma (esquema `platform`): los colegios no tienen
-- copia propia. El Administrador de cada colegio la usa desde el sistema
-- escolar (siempre acotado a SU tenant_id, lo aplica su backend) y el
-- superadmin la gestiona entera desde este panel.
--
--   platform.support_tickets           el reporte (tickets_soporte)
--     tenant_id        colegio que reporta
--     reported_by      usuario del colegio que lo envió (usuario_id)
--     category         bug | access | payments | academic | notifications | data | suggestion | other
--     priority         low | normal | high | urgent (la propone el colegio; el superadmin la ajusta)
--     subject          asunto · description  descripción
--     status           open (Abierto) | in_progress (En progreso) | resolved (Resuelto) | closed (Cerrado)
--     page_url         pantalla donde ocurrió (opcional) · user_agent  navegador
--     attachment_*     captura o archivo adjunto: se guarda en la base (bytea) para que ambos
--                      sistemas la lean sin compartir archivos del servidor (máx. 5 MB, PNG/JPG/PDF)
--   platform.support_ticket_messages   conversación: respuestas del superadmin y del colegio
--
-- Los números de ticket (code) son correlativos globales: SOP-000123.
-- =====================================================================

CREATE SEQUENCE IF NOT EXISTS platform.support_ticket_seq;

CREATE TABLE IF NOT EXISTS platform.support_tickets (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number               INTEGER NOT NULL UNIQUE DEFAULT nextval('platform.support_ticket_seq'),
  tenant_id            UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  reported_by          UUID, -- usuario del colegio (sin FK: los usuarios viven en el esquema de cada colegio, ver 005)
  reporter_name        VARCHAR(150) NOT NULL,
  reporter_email       VARCHAR(150),
  category             VARCHAR(20) NOT NULL
                         CHECK (category IN ('bug', 'access', 'payments', 'academic', 'notifications', 'data', 'suggestion', 'other')),
  priority             VARCHAR(10) NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  subject              VARCHAR(150) NOT NULL CHECK (length(trim(subject)) > 0),
  description          TEXT NOT NULL CHECK (length(trim(description)) > 0),
  status               VARCHAR(12) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  page_url             VARCHAR(300),
  user_agent           VARCHAR(300),
  attachment_name      VARCHAR(255),
  attachment_mime      VARCHAR(100),
  attachment_size      INTEGER CHECK (attachment_size IS NULL OR attachment_size <= 5242880),
  attachment_data      BYTEA,
  assigned_to          UUID REFERENCES platform.superadmins(id) ON DELETE SET NULL,
  resolved_at          TIMESTAMPTZ,
  last_activity_at     TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS idx_support_tickets_tenant ON platform.support_tickets (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON platform.support_tickets (status, last_activity_at DESC);

CREATE TABLE IF NOT EXISTS platform.support_ticket_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       UUID NOT NULL REFERENCES platform.support_tickets(id) ON DELETE CASCADE,
  author_type     VARCHAR(10) NOT NULL CHECK (author_type IN ('school', 'platform')),
  author_user_id  UUID, -- usuario del colegio (sin FK, ver 005)
  author_superadmin_id UUID REFERENCES platform.superadmins(id) ON DELETE SET NULL,
  author_name     VARCHAR(150) NOT NULL,
  body            TEXT NOT NULL CHECK (length(trim(body)) > 0),
  -- Cambio de estado que acompañó al mensaje (para mostrarlo en la conversación).
  status_change   VARCHAR(12) CHECK (status_change IS NULL OR status_change IN ('open', 'in_progress', 'resolved', 'closed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket ON platform.support_ticket_messages (ticket_id, created_at);
