import { supabase } from './supabase';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return {};
  }

  return {
    Authorization: `Bearer ${session.access_token}`,
  };
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const authHeaders = await getAuthHeaders();
  const headers = new Headers(init.headers);

  for (const [key, value] of Object.entries(authHeaders)) {
    if (!headers.has(key)) {
      headers.set(key, value);
    }
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.message ?? `API error (${response.status})`);
  }

  if (response.status === 204) {
    return null as T;
  }

  return response.json() as Promise<T>;
}

export interface HealthResponse {
  status: 'ok';
  timestamp: string;
}

export const memedeckApi = {
  health: () => apiFetch<HealthResponse>('/health'),
};

