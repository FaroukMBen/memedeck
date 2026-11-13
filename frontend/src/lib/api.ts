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

export interface CurrentUserProfile {
  id: string;
  email: string;
  username: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  allow_friends_see_private: boolean;
  allow_profile_comments: boolean;
  is_library_public: boolean;
}

export interface UserProfile {
  id: string;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  allow_friends_see_private: boolean;
  allow_profile_comments: boolean;
  is_library_public: boolean;
  created_at?: string | null;
  stats: {
    published_count: number;
    library_count: number;
    total_likes: number;
    total_dislikes: number;
  };
  friendship_status: 'none' | 'pending_sent' | 'pending_received' | 'friends' | 'self';
  is_own_profile: boolean;
}

export interface PublicationItem {
  id: string;
  user_media_id?: string | null;
  file_url: string;
  file_type: string;
  original_title?: string | null;
  custom_title?: string | null;
  tags: string[];
  is_nsfw: boolean;
  is_public: boolean;
  likes_count: number;
  dislikes_count: number;
  created_at: string;
}

export interface ProfileComment {
  id: string;
  profile_user_id: string;
  author_id: string;
  author_username: string | null;
  author_avatar_url: string | null;
  content: string;
  created_at: string;
  can_delete: boolean;
}

export interface ProfileCommentsResponse {
  comments: ProfileComment[];
  total: number;
  page: number;
  total_pages: number;
}

export interface MediaItem {
  id: string;
  file_url: string;
  file_type: string;
  original_title: string | null;
  tags?: string[];
  original_uploader_id: string | null;
  likes_count: number;
  dislikes_count: number;
  user_reaction: 1 | -1 | null;
  created_at: string;
}

export interface UserMediaItem {
  id: string;
  user_id: string;
  media_id: string;
  custom_title: string | null;
  tags: string[];
  is_nsfw: boolean;
  is_public: boolean;
  added_at: string;
  media?: MediaItem;
}

export interface ReactionResponse {
  media_id: string;
  likes_count: number;
  dislikes_count: number;
  user_reaction: 1 | -1 | null;
}

export interface CollectionItem {
  id: string;
  user_id: string;
  title: string;
  is_public: boolean;
  item_count?: number;
  previews?: { file_url: string; file_type: string }[];
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
  getPublicMedias: (fileType?: string, tag?: string) => {
    const params = new URLSearchParams();
    if (fileType) params.set('file_type', fileType);
    if (tag) params.set('tag', tag);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return apiFetch<{ items: MediaItem[] }>(`/api/v1/medias${qs}`);
  },
  reactToMedia: (mediaId: string, reactionType: 1 | -1 | 0) =>
    apiFetch<ReactionResponse>(`/api/v1/medias/${mediaId}/reactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reaction_type: reactionType }),
    }),
  forkMedia: (
    mediaId: string,
    options: {
      custom_title?: string;
      tags?: string[];
      import_tags?: boolean;
      is_public?: boolean;
      is_nsfw?: boolean;
    } = {}
  ) =>
    apiFetch<UserMediaItem>(`/api/v1/medias/${mediaId}/fork`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    }),
  addToLibrary: (
    mediaId: string,
    options: {
      custom_title?: string;
      tags?: string[];
      import_tags?: boolean;
      is_public?: boolean;
      is_nsfw?: boolean;
    } = {}
  ) =>
    apiFetch<UserMediaItem>(`/api/v1/medias/${mediaId}/fork`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    }),
  getUserLibrary: (userId: string) =>
    apiFetch<{ items: UserMediaItem[] }>(`/api/v1/users/${userId}/library`),
  updateUserMedia: (
    userMediaId: string,
    data: {
      custom_title?: string;
      tags?: string[];
      is_public?: boolean;
      is_nsfw?: boolean;
    }
  ) =>
    apiFetch<UserMediaItem>(`/api/v1/user-medias/${userMediaId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
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
  uploadMedia: async (options: {
    file: File;
    title?: string;
    tags?: string[];
    isPublic?: boolean;
    isNsfw?: boolean;
  }): Promise<{ media: MediaItem; user_media: UserMediaItem }> => {
    const { file, title, tags, isPublic = true, isNsfw = false } = options;
    const formData = new FormData();
    formData.append('file', file);

    const query = new URLSearchParams({
      is_public: String(isPublic),
      is_nsfw: String(isNsfw),
    });
    if (title?.trim()) query.set('title', title.trim());
    if (tags && tags.length > 0) query.set('tags', tags.join(','));

    const authHeaders = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/api/v1/medias/upload?${query.toString()}`, {
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

  // Profile & User endpoints
  getUserProfile: (userId: string) =>
    apiFetch<UserProfile>(`/api/v1/users/${userId}/profile`),
  getUserPublications: (userId: string) =>
    apiFetch<{ items: PublicationItem[] }>(`/api/v1/users/${userId}/publications`),
  updateCurrentUserProfile: (payload: {
    username?: string;
    avatar_url?: string | null;
    bio?: string | null;
    allow_friends_see_private?: boolean;
    allow_profile_comments?: boolean;
    is_library_public?: boolean;
  }) =>
    apiFetch<CurrentUserProfile>('/api/v1/users/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  uploadAvatar: async (file: File): Promise<{ avatar_url: string }> => {
    const formData = new FormData();
    formData.append('file', file);

    const authHeaders = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/api/v1/users/me/avatar`, {
      method: 'POST',
      headers: {
        ...authHeaders,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(errorBody.message ?? `Avatar upload failed (${response.status})`);
    }

    return response.json();
  },

  // Profile Comments
  getProfileComments: (userId: string, page = 1, limit = 10) =>
    apiFetch<ProfileCommentsResponse>(
      `/api/v1/users/${userId}/comments?page=${page}&limit=${limit}`
    ),
  postProfileComment: (userId: string, content: string) =>
    apiFetch<ProfileComment>(`/api/v1/users/${userId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    }),
  deleteProfileComment: (userId: string, commentId: string) =>
    apiFetch<null>(`/api/v1/users/${userId}/comments/${commentId}`, {
      method: 'DELETE',
    }),

  // Friendships
  sendFriendRequest: (userId: string) =>
    apiFetch<{ status: 'pending_sent' | 'friends'; message: string }>(
      `/api/v1/users/${userId}/friend-request`,
      { method: 'POST' }
    ),
  acceptFriendRequest: (userId: string) =>
    apiFetch<{ success: boolean; message: string }>(
      `/api/v1/users/${userId}/friend-accept`,
      { method: 'POST' }
    ),
  removeFriendship: (userId: string) =>
    apiFetch<null>(`/api/v1/users/${userId}/friendship`, {
      method: 'DELETE',
    }),
};

