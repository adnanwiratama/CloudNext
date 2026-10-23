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

// Fetch a file (download/preview) as a blob through the authenticated axios
// instance. Plain <a href> links can't carry the Bearer token, so file endpoints
// (which require auth) 401; this sends the token and returns a blob URL.
export async function fetchFileBlobUrl(path: string): Promise<string> {
  const res = await api.get(path, { responseType: 'blob' });
  const type = (res.headers['content-type'] as string) || 'application/octet-stream';
  return URL.createObjectURL(new Blob([res.data], { type }));
}

// Download a file by id with its original filename.
export async function downloadFile(id: string, filename?: string): Promise<void> {
  const url = await fetchFileBlobUrl(`/api/files/${id}/download`);
  const a = document.createElement('a');
  a.href = url;
  if (filename) a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Open a file inline (preview) in a new tab.
export async function previewFile(id: string): Promise<void> {
  const url = await fetchFileBlobUrl(`/api/files/${id}/preview`);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

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
