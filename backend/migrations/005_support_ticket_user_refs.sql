-- =====================================================================
-- 005 · Soporte: el usuario que reporta no es una llave foránea
--
-- Con un esquema por colegio (003), los usuarios de cada colegio viven en
-- SU esquema (demo.users, colegio_x.users…), no en public.users: una FK
-- global a public.users rechaza los tickets de esos colegios. El vínculo con
-- el usuario queda como referencia (uuid) y el ticket guarda además su nombre
-- y correo tal como eran al reportar (reporter_name / reporter_email).
-- =====================================================================

ALTER TABLE platform.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_reported_by_fkey;
ALTER TABLE platform.support_ticket_messages DROP CONSTRAINT IF EXISTS support_ticket_messages_author_user_id_fkey;

COMMENT ON COLUMN platform.support_tickets.reported_by IS 'id del usuario en el esquema de su colegio (sin FK: los usuarios viven en cada esquema).';
COMMENT ON COLUMN platform.support_ticket_messages.author_user_id IS 'id del usuario en el esquema de su colegio (sin FK).';
