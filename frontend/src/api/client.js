import axios from 'axios';

const TOKEN_KEY = 'tm.accessToken';

export const tokenStore = {
  get() {
    try {
      return sessionStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token) {
    try {
      sessionStorage.setItem(TOKEN_KEY, token);
    } catch {
      // almacenamiento bloqueado: la sesión dura lo que la pestaña
    }
  },
  clear() {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      // idem
    }
  },
};

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api',
  headers: { 'Content-Type': 'application/json' },
});

client.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let onUnauthorized = () => {};
export const setOnUnauthorized = (fn) => {
  onUnauthorized = fn;
};

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && error.config?.url !== '/auth/login') {
      tokenStore.clear();
      onUnauthorized();
    }
    return Promise.reject(error);
  }
);

/** Mensaje legible de un error del API. */
export function errorMessage(error, fallback = 'Ocurrió un error inesperado.') {
  if (!error?.response) return 'No hay conexión con el servidor.';
  return error.response.data?.error?.message || fallback;
}

/** { campo: mensaje } a partir de `details` del API (para mostrar bajo cada input). */
export function fieldErrors(error) {
  const details = error?.response?.data?.error?.details || [];
  return details.reduce((acc, d) => (d.path && !acc[d.path] ? { ...acc, [d.path]: d.message } : acc), {});
}

export default client;
