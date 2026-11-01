/**
 * Roles base con los que nace todo colegio.
 *
 * ⚠ Copia de ROLE_TEMPLATES en sistema-escolar/backend/seeders/002_demo_tenant.js
 *   y de las `extraActions` de sistema-escolar/backend/src/config/modules.js.
 *   Si el sistema escolar agrega un módulo o cambia un rol base, actualizar
 *   aquí también (los repos son independientes a propósito).
 *
 * Los módulos se leen de la tabla `public.modules` en el momento del alta, así
 * que un módulo nuevo en la base le llega al Administrador sin tocar este
 * archivo; solo sus acciones especiales dependen de EXTRA_ACTIONS.
 */
const EXTRA_ACTIONS = {
  grading: ['view_all_sections'],
  payments: ['approve_payment', 'export'],
};

const ADMIN_ROLE = 'Administrador';

// Jerarquía (roles.hierarchy_level, migración 047 del sistema escolar):
// Director (Administrador) > Coordinador > Docente.
const ROLE_TEMPLATES = {
  [ADMIN_ROLE]: {
    hierarchyLevel: 1,
    allModules: { can_create: true, can_read: true, can_update: true, can_delete: true },
    extraActionsAllTrue: true,
  },
  Coordinador: {
    hierarchyLevel: 2,
    // Gestiona a los docentes de su etapa (Personal) y supervisa en consulta el resto.
    byModule: {
      dashboard: { can_read: true },
      staff: { can_create: true, can_read: true, can_update: true, can_delete: true },
      students: { can_read: true },
      guardians: { can_read: true },
      academics: { can_read: true },
      evaluation_plans: { can_read: true },
      grading: { can_read: true, extra_actions: { view_all_sections: true } },
      schedules: { can_read: true },
      discipline: { can_read: true },
      clubs: { can_read: true },
      events: { can_read: true },
      appointments: { can_read: true },
    },
  },
  Docente: {
    hierarchyLevel: 3,
    byModule: {
      dashboard: { can_read: true },
      students: { can_read: true },
      academics: { can_read: true },
      evaluation_plans: { can_create: true, can_read: true, can_update: true, can_delete: true },
      grading: { can_read: true, can_update: true },
      discipline: { can_read: true },
      clubs: { can_read: true },
      events: { can_read: true },
    },
  },
  // Personal de cobranza: solo Pagos (migración 053 del sistema escolar). Fuera de la jerarquía.
  Finanzas: {
    byModule: {
      payments: { can_create: true, can_read: true, can_update: true, can_delete: true, extra_actions: { approve_payment: true, export: true } },
    },
  },
  Representante: {
    // Solo el panel: el portal de padres filtra por el usuario autenticado.
    byModule: {
      dashboard: { can_read: true },
    },
  },
};

module.exports = { ROLE_TEMPLATES, EXTRA_ACTIONS, ADMIN_ROLE };
