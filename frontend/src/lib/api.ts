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

export interface UserProfile {
  id: string;
  email: string;
  username: string | null;
  is_library_public: boolean;
}

export interface MediaItem {
  id: string;
  file_url: string;
  file_type: string;
  original_uploader_id: string | null;
  created_at: string;
}

export interface UserMediaItem {
  id: string;
  user_id: string;
  media_id: string;
  is_public: boolean;
  added_at: string;
  media?: MediaItem;
}

export interface CollectionItem {
  id: string;
  user_id: string;
  title: string;
  is_public: boolean;
}

export interface CollectionMediaItem {
  user_media_id: string;
  media_id: string;
  file_url: string;
  file_type: string;
  added_at: string;
}

export interface CollectionDetails {
  collection: CollectionItem;
  items: CollectionMediaItem[];
}

export const memedeckApi = {
  health: () => apiFetch<HealthResponse>('/health'),
  getMe: () => apiFetch<UserProfile>('/api/v1/users/me'),
  getPublicMedias: (fileType?: string) =>
    apiFetch<{ items: MediaItem[] }>(`/api/v1/medias${fileType ? `?file_type=${fileType}` : ''}`),
  forkMedia: (mediaId: string, isPublic = true) =>
    apiFetch<UserMediaItem>(`/api/v1/medias/${mediaId}/fork`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_public: isPublic }),
    }),
  getUserLibrary: (userId: string) =>
    apiFetch<{ items: UserMediaItem[] }>(`/api/v1/users/${userId}/library`),
  updateUserMediaPrivacy: (userMediaId: string, isPublic: boolean) =>
    apiFetch<UserMediaItem>(`/api/v1/user-medias/${userMediaId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_public: isPublic }),
    }),
  deleteUserMedia: (userMediaId: string) =>
    apiFetch<null>(`/api/v1/user-medias/${userMediaId}`, {
      method: 'DELETE',
    }),
  getCollections: (mine = false) =>
    apiFetch<{ items: CollectionItem[] }>(`/api/v1/collections${mine ? '?mine=true' : ''}`),
  getCollectionDetails: (collectionId: string) =>
    apiFetch<CollectionDetails>(`/api/v1/collections/${collectionId}`),
  getRandomFromCollection: (collectionId: string, count = 10) =>
    apiFetch<{ collection_id: string; items: CollectionMediaItem[] }>(
      `/api/v1/collections/${collectionId}/random?count=${count}`
    ),
  createCollection: (title: string, isPublic = false) =>
    apiFetch<CollectionItem>('/api/v1/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, is_public: isPublic }),
    }),
  deleteCollection: (collectionId: string) =>
    apiFetch<null>(`/api/v1/collections/${collectionId}`, {
      method: 'DELETE',
    }),
  addMediaToCollection: (collectionId: string, userMediaId: string) =>
    apiFetch<{ collection_id: string; user_media_id: string }>(
      `/api/v1/collections/${collectionId}/items`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_media_id: userMediaId }),
      }
    ),
  removeMediaFromCollection: (collectionId: string, userMediaId: string) =>
    apiFetch<null>(`/api/v1/collections/${collectionId}/items/${userMediaId}`, {
      method: 'DELETE',
    }),
  uploadMedia: async (file: File, isPublic = true): Promise<{ media: MediaItem; user_media: UserMediaItem }> => {
    const formData = new FormData();
    formData.append('file', file);

    const authHeaders = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/api/v1/medias/upload?is_public=${isPublic}`, {
      method: 'POST',
      headers: {
        ...authHeaders,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(errorBody.message ?? `Upload failed (${response.status})`);
    }

    return response.json();
  },
};

