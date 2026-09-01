/* Lapisan komunikasi dengan REST API backend. */

const BASE = '/api';
const TOKEN_KEY = 'kgm.token';
const USER_KEY = 'kgm.user';

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details || null;
  }
}

export const auth = {
  get token() { return localStorage.getItem(TOKEN_KEY); },
  get user() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
  },
  save(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
  get isAdmin() { return this.user?.role === 'admin'; },
};

async function request(method, path, body, opts = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`;

  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Tidak dapat terhubung ke server. Pastikan server backend berjalan.');
  }

  // Sesi habis: bersihkan dan kembalikan ke halaman login.
  if (res.status === 401 && !opts.skipAuthRedirect) {
    auth.clear();
    if (!location.pathname.endsWith('/index.html') && location.pathname !== '/') {
      location.href = '/index.html?expired=1';
    }
  }

  if (opts.blob) {
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new ApiError(res.status, j.error || 'Gagal mengunduh berkas.', j.details);
    }
    return res.blob();
  }

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, json?.error || `Permintaan gagal (HTTP ${res.status}).`, json?.details);
  }
  return json;
}

export const api = {
  get: (p, o) => request('GET', p, undefined, o),
  post: (p, b, o) => request('POST', p, b ?? {}, o),
  put: (p, b, o) => request('PUT', p, b ?? {}, o),
  patch: (p, b, o) => request('PATCH', p, b ?? {}, o),
  del: (p, o) => request('DELETE', p, undefined, o),

  /** Bangun query string, melewati nilai kosong. */
  qs(params) {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') u.set(k, v);
    }
    const s = u.toString();
    return s ? `?${s}` : '';
  },

  /** Ambil berkas terlindungi (PDF/CSV) sebagai blob beserta token. */
  async file(path) {
    const res = await fetch(BASE + path, {
      headers: auth.token ? { Authorization: `Bearer ${auth.token}` } : {},
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new ApiError(res.status, j.error || 'Gagal mengambil berkas.');
    }
    return res.blob();
  },
};
