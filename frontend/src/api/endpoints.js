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
  setStatus: (slug, status) => client.patch(`/tenants/${encodeURIComponent(slug)}/status`, { status }).then((r) => r.data),
  resendCredentials: (slug, email) =>
    client.post(`/tenants/${encodeURIComponent(slug)}/resend-credentials`, { email }).then((r) => r.data),
};

export const statsApi = {
  overview: () => client.get('/stats/overview').then((r) => r.data),
};
