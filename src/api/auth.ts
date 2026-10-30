import { request } from './client';

export interface AuthUser {
  id: number;
  email: string;
  username: string | null;
}

export const authApi = {
  me: () => request<{ user: AuthUser }>('/auth/me'),
  register: (email: string, password: string, name?: string) =>
    request<{ user: AuthUser }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    }),
  login: (email: string, password: string) =>
    request<{ user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<{ message: string }>('/auth/logout', { method: 'POST' }),
};
