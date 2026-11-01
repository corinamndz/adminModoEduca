import client from './client';

export const authApi = {
  login: (credentials) => client.post('/auth/login', credentials).then((r) => r.data),
  me: () => client.get('/auth/me').then((r) => r.data),
};

export const tenantsApi = {
  list: (params) => client.get('/tenants', { params }).then((r) => r.data),
  checkSlug: (slug) => client.get('/tenants/slug-availability', { params: { slug } }).then((r) => r.data),
  create: (payload) => client.post('/tenants', payload).then((r) => r.data),
  get: (slug) => client.get(`/tenants/${encodeURIComponent(slug)}`).then((r) => r.data),
  update: (slug, patch) => client.patch(`/tenants/${encodeURIComponent(slug)}`, patch).then((r) => r.data),
  setStatus: (slug, status) => client.patch(`/tenants/${encodeURIComponent(slug)}/status`, { status }).then((r) => r.data),
  resendCredentials: (slug, email) =>
    client.post(`/tenants/${encodeURIComponent(slug)}/resend-credentials`, { email }).then((r) => r.data),
};

export const statsApi = {
  overview: () => client.get('/stats/overview').then((r) => r.data),
};

/** Soporte técnico: tickets de todos los colegios. */
export const supportApi = {
  options: () => client.get('/support/options').then((r) => r.data),
  /** { status: 'active'|'open'|'in_progress'|'resolved'|'closed'|'', tenantId, category, priority, q } → { items, summary } */
  list: (params) => client.get('/support/tickets', { params }).then((r) => r.data),
  get: (id) => client.get(`/support/tickets/${id}`).then((r) => r.data),
  /** { body?, status?, priority?, assignToMe? } → el ticket actualizado */
  update: (id, patch) => client.patch(`/support/tickets/${id}`, patch).then((r) => r.data),
  attachmentBlob: (id) => client.get(`/support/tickets/${id}/attachment`, { responseType: 'blob' }).then((r) => r.data),
};
