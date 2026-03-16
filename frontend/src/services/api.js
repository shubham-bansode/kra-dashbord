import axios from 'axios';

// Allow overriding API base URL via env for deployments where frontend and backend are on different hosts.
// In local development, default to backend on port 5000 so API calls work even without a proxy.
// Examples:
// - VITE_API_URL=http://localhost:5000/api
// - VITE_API_URL=https://your-domain.com/api
function normalizeApiBaseUrl(rawUrl) {
  const fallback = import.meta.env.DEV ? 'http://localhost:5000/api' : '/api';
  if (!rawUrl) return fallback;

  const trimmed = String(rawUrl).trim().replace(/\/+$/, '');
  // Accept both forms: https://host and https://host/api
  if (trimmed.endsWith('/api')) return trimmed;
  return `${trimmed}/api`;
}

const API_BASE_URL = normalizeApiBaseUrl(import.meta.env.VITE_API_URL);

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor to attach auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for error handling
api.interceptors.response.use(
  response => response,
  error => {
    const message = error.response?.data?.message || 'An error occurred';
    console.error('API Error:', message);
    return Promise.reject(error);
  }
);

// Corporation API
export const corporationApi = {
  getAll: () => api.get('/corporations'),
  getById: (id) => api.get(`/corporations/${id}`),
  update: (id, data) => api.put(`/corporations/${id}`, data)
};

// Region API
export const regionApi = {
  getAll: () => api.get('/regions'),
  getByCorporation: (corporationId) => api.get(`/regions/by-corporation/${corporationId}`)
};

// Circle API
export const circleApi = {
  getAll: () => api.get('/circles'),
  getById: (id) => api.get(`/circles/${id}`),
  getByRegion: (regionId) => api.get(`/circles/by-region/${regionId}`)
};

// Division API
export const divisionApi = {
  getAll: () => api.get('/divisions'),
  getById: (id) => api.get(`/divisions/${id}`),
  getByCircle: (circleId) => api.get(`/divisions/by-circle/${circleId}`)
};

// KRA API
export const kraApi = {
  getAll: () => api.get('/kras'),
  getById: (id) => api.get(`/kras/${id}`),
  create: (data) => api.post('/kras', data),
  update: (id, data) => api.put(`/kras/${id}`, data),
  delete: (id) => api.delete(`/kras/${id}`)
};

// KRA Entry API
export const kraEntryApi = {
  getAll: (filters = {}) => {
    const params = new URLSearchParams(filters).toString();
    return api.get(`/kra-entries${params ? `?${params}` : ''}`);
  },
  getById: (id) => api.get(`/kra-entries/${id}`),
  create: (data) => api.post('/kra-entries', data),
  update: (id, data) => api.put(`/kra-entries/${id}`, data),
  delete: (id) => api.delete(`/kra-entries/${id}`),
  checkDuplicate: (data) => api.post('/kra-entries/check-duplicate', data),
  // NEW: Bulk submission with upsert logic
  bulkCreate: (entries) => api.post('/kra-entries/bulk', { entries })
};

// Auth API
export const authApi = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  me: () => api.get('/auth/me')
};

// Dashboard API
export const dashboardApi = {
  getSummary: (filters = {}) => {
    const params = new URLSearchParams(filters).toString();
    return api.get(`/dashboard/summary${params ? `?${params}` : ''}`);
  },
  getByCorporation: (filters = {}) => {
    const params = new URLSearchParams(filters).toString();
    return api.get(`/dashboard/by-corporation${params ? `?${params}` : ''}`);
  },
  getByKra: (filters = {}) => {
    const params = new URLSearchParams(filters).toString();
    return api.get(`/dashboard/by-kra${params ? `?${params}` : ''}`);
  },
  getMonthlyTrend: (filters = {}) => {
    const params = new URLSearchParams(filters).toString();
    return api.get(`/dashboard/monthly-trend${params ? `?${params}` : ''}`);
  },
  getPeriods: (filters = {}) => {
    const params = new URLSearchParams(filters).toString();
    return api.get(`/dashboard/periods${params ? `?${params}` : ''}`);
  },
  getAchievementBar: (filters = {}) => {
    const params = new URLSearchParams(filters).toString();
    return api.get(`/dashboard/achievement-bar${params ? `?${params}` : ''}`);
  },
  getImprovementRequired: (filters = {}) => {
    const params = new URLSearchParams(filters).toString();
    return api.get(`/dashboard/improvement-required${params ? `?${params}` : ''}`);
  },
  getWeightageDistribution: (filters = {}) => {
    const params = new URLSearchParams(filters).toString();
    return api.get(`/dashboard/weightage-distribution${params ? `?${params}` : ''}`);
  },
  getRankTable: (filters = {}) => {
    const params = new URLSearchParams(filters).toString();
    return api.get(`/dashboard/rank-table${params ? `?${params}` : ''}`);
  },
  getCorpKraPerformance: (filters = {}) => {
    const params = new URLSearchParams(filters).toString();
    return api.get(`/dashboard/corp-kra-performance${params ? `?${params}` : ''}`);
  },
  exportExcel: (filters = {}) => {
    const params = new URLSearchParams(filters).toString();
    return api.get(`/dashboard/export/excel${params ? `?${params}` : ''}`, {
      responseType: 'blob'
    });
  },
  exportPdf: (filters = {}) => {
    const params = new URLSearchParams(filters).toString();
    return api.get(`/dashboard/export/pdf${params ? `?${params}` : ''}` , {
      responseType: 'blob'
    });
  }
};

// Admin API
export const adminApi = {
  // Statistics
  getStats: () => api.get('/admin/stats'),
  getDropdownData: () => api.get('/admin/dropdown-data'),

  // Financial Years
  getFinancialYears: () => api.get('/admin/financial-years'),
  getActiveFinancialYear: () => api.get('/admin/financial-years/active'),
  createFinancialYear: (data) => api.post('/admin/financial-years', data),
  updateFinancialYear: (id, data) => api.put(`/admin/financial-years/${id}`, data),
  deleteFinancialYear: (id) => api.delete(`/admin/financial-years/${id}`),

  // Entries Management
  getEntries: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return api.get(`/admin/entries${queryString ? `?${queryString}` : ''}`);
  },
  getEntry: (id) => api.get(`/admin/entries/${id}`),
  createEntry: (data) => api.post('/admin/entries', data),
  updateEntry: (id, data) => api.put(`/admin/entries/${id}`, data),
  deleteEntry: (id) => api.delete(`/admin/entries/${id}`),
  bulkDeleteEntries: (ids) => api.delete('/admin/entries', { data: { ids } }),

  // User Management
  getUsers: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return api.get(`/admin/users${queryString ? `?${queryString}` : ''}`);
  },
  createUser: (data) => api.post('/admin/users', data),
  updateUser: (id, data) => api.put(`/admin/users/${id}`, data),
  deleteUser: (id) => api.delete(`/admin/users/${id}`),
  updateUserRole: (id, role) => api.put(`/admin/users/${id}/role`, { role }),
  toggleUserStatus: (id) => api.put(`/admin/users/${id}/status`),

  // Corporation Management
  getCorporations: () => api.get('/admin/corporations'),
  updateCorporation: (id, data) => api.put(`/admin/corporations/${id}`, data)
};

// Financial Year API (public endpoint for regular users)
export const financialYearApi = {
  getActive: () => api.get('/admin/financial-years/active')
};

export default api;
