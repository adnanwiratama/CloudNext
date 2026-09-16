import axios from 'axios';
import { useAuthStore } from '../store/authStore';

// Strip trailing /api from VITE_API_URL to avoid double /api prefix
// All page endpoints already include /api/ prefix (e.g. /api/auth/login)
const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:4100').replace(/\/api$/, '');

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor - inject auth token
api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token;
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle auth errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Generic API helpers
export const apiGet = <T>(url: string, params?: any) =>
  api.get<{ success: boolean; data: T }>(url, { params }).then(r => r.data.data);

export const apiPost = <T>(url: string, data?: any) =>
  api.post<{ success: boolean; data: T; message?: string }>(url, data).then(r => r.data);

export const apiPut = <T>(url: string, data?: any) =>
  api.put<{ success: boolean; data: T }>(url, data).then(r => r.data.data);

export const apiDelete = (url: string) =>
  api.delete<{ success: boolean; message: string }>(url).then(r => r.data);

export default api;
