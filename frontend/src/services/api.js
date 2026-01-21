import axios from 'axios';

const API_BASE_URL = '/api';

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
  getById: (id) => api.get(`/corporations/${id}`)
};

// Region API
export const regionApi = {
  getAll: () => api.get('/regions'),
  getByCorporation: (corporationId) => api.get(`/regions/by-corporation/${corporationId}`)
};

// Circle API
export const circleApi = {
  getAll: () => api.get('/circles'),
  getByRegion: (regionId) => api.get(`/circles/by-region/${regionId}`)
};

// KRA API
export const kraApi = {
  getAll: () => api.get('/kras'),
  getById: (id) => api.get(`/kras/${id}`)
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
  checkDuplicate: (data) => api.post('/kra-entries/check-duplicate', data)
};

// Auth API
export const authApi = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  me: () => api.get('/auth/me')
};

export default api;
