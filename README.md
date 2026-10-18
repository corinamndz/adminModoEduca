# MoDo Educa · Tenant Manager (Superadmin)

Panel central para crear, supervisar y activar o desactivar los colegios (tenants) de la plataforma.
Es un **repositorio independiente** del sistema escolar (`../sistema-escolar`): no comparte archivos con él,
solo la **misma base de datos PostgreSQL**.

```
admin-modo-educa/
├── backend/                     API Express (puerto 4000)
│   ├── migrations/              SQL del esquema `platform` (no toca las migraciones del colegio)
│   ├── scripts/                 migrate.js · create-superadmin.js
│   └── src/
│       ├── config/              env.js · database.js (knex + RLS)
│       ├── middlewares/         auth (JWT superadmin) · tenantResolver (/:tenantSlug)
│       ├── modules/
│       │   ├── auth/            login del superadmin
│       │   ├── tenants/         listado, alta automatizada, ficha, estado, reenvío de credenciales
│       │   └── stats/           métricas por colegio y globales
│       ├── services/email/      SMTP (nodemailer) + correo de bienvenida
│       └── utils/               slug, contraseña temporal, auditoría, errores
├── frontend/                    React + Vite (puerto 5174)
│   └── src/
│       ├── features/dashboard/  Panel global
│       ├── features/tenants/    Lista, modal de alta, ficha /:tenantSlug
│       └── components/ui/       Mismo sistema de diseño que el colegio
└── docs/db-role.sql             Rol de BD recomendado (BYPASSRLS)
```

## Cómo encaja con el sistema escolar

El sistema escolar aísla a los colegios con **esquema compartido + `tenant_id` + Row Level Security**:
cada request fija `app.tenant_id` y las políticas RLS filtran las filas. El Tenant Manager respeta ese modelo:

| Esquema | Dueño | Qué contiene |
|---|---|---|
| `public` | sistema escolar | `tenants` (tabla maestra), `users`, `roles`, `students`, `staff`, `guardians`… |
| `platform` | Tenant Manager | `superadmins`, `tenant_accounts` (ficha comercial), `credential_deliveries`, `audit_logs` |

- **Alta de un colegio** (`POST /api/tenants`), en una sola transacción: `tenants` → `tenant_settings` →
  roles base (Administrador, Docente, Representante) y sus permisos → usuario admin con contraseña temporal
  y `must_change_password = true` → ficha en `platform.tenant_accounts` → auditoría. **Después del COMMIT**
  se envía el correo SMTP. Si el correo falla, el colegio queda creado igual y la respuesta muestra la clave
  temporal una sola vez para entregarla por otro medio. Siempre se puede usar «Reenviar credenciales».
- El **usuario del admin es su correo** (en minúsculas), igual que en el portal del colegio.
- El correo y los botones del panel enlazan a `SCHOOL_APP_URL/<slug>/login`: el colegio va en la ruta y su sesión se guarda aparte de la de otros colegios.
- **Desactivar** un colegio pone `tenants.status = 'suspended'`: el login escolar ya rechaza colegios que no
  estén `active`.

### Enrutamiento por URL (`/nombre-del-colegio`)

- **Backend**: `src/middlewares/tenantResolver.middleware.js` toma `:tenantSlug` de la ruta, lo busca en
  `public.tenants` (caché de 30 s), abre una transacción con `app.tenant_id` fijado y deja `req.tenant` y
  `req.db`. Se usa en `/api/tenants/:tenantSlug/*`. Solo depende de `db`, `ApiError` y las reglas de slug,
  así que se puede llevar al sistema escolar cuando se quiera servir `/:slug/...` allá.
- **Frontend**: `localhost:5174/<slug>` abre la ficha del colegio. Las rutas fijas (`/tenants`, `/login`)
  tienen prioridad, y los slugs reservados (`api`, `login`, `admin`…) no se pueden registrar
  (`backend/src/utils/slug.js` ↔ `frontend/src/lib/slug.js`).

## Puesta en marcha

Requisitos: Node 18+, la base del sistema escolar con sus migraciones **y su seed** aplicados
(el seed llena la tabla `modules`, necesaria para crear roles).

```bash
# 1. (Recomendado) rol de BD propio: ver docs/db-role.sql

# 2. Backend
cd backend
cp .env.example .env          # completa DB_*, SUPERADMIN_JWT_SECRET, SMTP_*, SCHOOL_APP_URL
npm install
npm run migrate               # crea el esquema `platform`
npm run superadmin:create -- --email tu@correo.com --name "Corina Méndez" --password "UnaClaveLarga123!"
npm run dev                   # http://localhost:4000

# 3. Frontend
cd ../frontend
npm install
npm run dev                   # http://localhost:5174
```

Sin `SMTP_HOST` (solo en desarrollo), los correos se imprimen en la consola del backend.

### Rol de base de datos y estadísticas

Las métricas globales leen tablas con RLS de todos los colegios. Al arrancar, el backend detecta si su rol
puede saltar RLS (superusuario, `BYPASSRLS`, o dueño de las tablas):

- **Sí** → una sola consulta agregada para todos los colegios.
- **No** → la misma consulta colegio por colegio, cada una dentro de su transacción con `app.tenant_id`.
  Es más lento con muchos colegios, pero el resultado es el mismo.

## API

Todas las rutas, salvo `/api/auth/login`, exigen `Authorization: Bearer <token de superadmin>`. El token se firma
con `SUPERADMIN_JWT_SECRET`, distinto del secreto del colegio.

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/login` | `{ email, password }` → `{ accessToken, user }` |
| GET | `/api/auth/me` | Perfil del superadmin |
| GET | `/api/stats/overview` | Colegios por estado, totales, ingresos estimados (por colegio y tendencia de 12 meses), altas recientes |
| GET | `/api/tenants?search=&status=` | Lista con métricas, tarifa e ingreso estimado por colegio |
| GET | `/api/tenants/slug-availability?slug=` | Valida formato, palabras reservadas y disponibilidad |
| POST | `/api/tenants` | Alta: `{ name, slug, plan?, pricePerStudent? (1.00), contactPhone?, notes?, admin: { fullName, email, phone? } }` |
| GET | `/api/tenants/:tenantSlug` | Ficha: admin, contacto, contrato (tarifa e ingreso estimado), métricas, últimos envíos |
| PATCH | `/api/tenants/:tenantSlug` | Edita `{ name?, plan?, pricePerStudent?, notes? }` (solo lo enviado; queda en auditoría) |
| PATCH | `/api/tenants/:tenantSlug/status` | `{ status: 'active' \| 'suspended' }` |
| POST | `/api/tenants/:tenantSlug/resend-credentials` | `{ email? }`: nueva clave temporal y correo |

### Métricas

| Métrica | Definición |
|---|---|
| Alumnos matriculados | Alumnos distintos con inscripción `active` en un año escolar `is_active` |
| Alumnos con ficha activa | `students.status = 'active'` |
| Representantes | Filas de `guardians` |
| Personal | `staff.status = 'active'` (y de ellos, `staff_type = 'teaching'` = docentes) |

Los totales del panel global suman **solo colegios activos**.

### Monetización

- Cada colegio tiene su **tarifa mensual por alumno** en `platform.tenant_accounts.price_per_student`
  (USD, `NUMERIC(10,2)`, por defecto `1.00`, entre 0 y 10.000). Se fija en el alta y se edita en la ficha.
- **Ingreso mensual estimado del colegio** = alumnos con ficha activa × su tarifa.
- **Total de la plataforma** = suma de los colegios **facturables** (activos y con plan distinto de «Prueba»);
  los de prueba se muestran aparte como ingreso potencial.
- La tendencia de 12 meses reconstruye cada mes con los alumnos activos de hoy según su fecha de registro y la
  tarifa **actual** de cada colegio (no hay historial de bajas ni de tarifas).

## Puntos a mantener sincronizados con el sistema escolar

- `backend/src/modules/tenants/roleTemplates.js` copia los roles base de
  `sistema-escolar/backend/seeders/002_demo_tenant.js` y las `extraActions` de `src/config/modules.js`.
  Los módulos se leen de la tabla `modules` en cada alta; solo las acciones especiales están copiadas en el código.
- Si una migración escolar agrega columnas `NOT NULL` sin valor por defecto en `tenants`, `tenant_settings`,
  `roles` o `users`, hay que actualizar `provisioning.service.js`.
