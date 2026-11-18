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
    followers_count: number;
  };
  friendship_status: 'none' | 'pending_sent' | 'pending_received' | 'friends' | 'self';
  is_own_profile: boolean;
  is_following: boolean;
  showcase_media_ids: string[];
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
  source_format?: string | null;
  in_library?: boolean;
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

export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
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
  /** Original format when the stored file was converted, e.g. 'gif' for a GIF transcoded to MP4 */
  source_format?: string | null;
  /** True when the signed-in user already has this media in their library */
  in_library?: boolean;
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

export interface CollectionRule {
  tags?: string[];
  type?: 'image' | 'video';
  min_likes?: number;
}

export interface ActivityItem {
  id: string;
  type: 'upload' | 'fork' | 'collection' | 'like';
  created_at: string;
  actor: { id: string; username: string | null; avatar_url: string | null };
  media: {
    id: string;
    file_url: string;
    file_type: string;
    source_format: string | null;
    title: string | null;
  } | null;
  collection: { id: string; title: string } | null;
}

export interface CollectionItem {
  id: string;
  user_id: string;
  title: string;
  is_public: boolean;
  /** Set on dynamic collections: content is computed from this rule */
  rule?: CollectionRule | null;
  owner_username?: string | null;
  item_count?: number;
  previews?: { file_url: string; file_type: string }[];
}

export interface CollectionMediaItem {
  user_media_id: string;
  media_id: string;
  file_url: string;
  file_type: string;
  source_format?: string | null;
  added_at: string;
}

export interface CollectionDetails {
  collection: CollectionItem;
  items: CollectionMediaItem[];
  owner_username: string | null;
  is_subscribed: boolean;
}

export const memedeckApi = {
  health: () => apiFetch<HealthResponse>('/health'),
  getMe: () => apiFetch<UserProfile>('/api/v1/users/me'),
  getPublicMedias: (
    options: {
      fileType?: string;
      tag?: string;
      sort?: 'new' | 'top';
      q?: string;
      limit?: number;
      offset?: number;
    } = {}
  ) => {
    const params = new URLSearchParams();
    if (options.fileType) params.set('file_type', options.fileType);
    if (options.tag) params.set('tag', options.tag);
    if (options.sort) params.set('sort', options.sort);
    if (options.q?.trim()) params.set('q', options.q.trim());
    if (options.limit) params.set('limit', String(options.limit));
    if (options.offset) params.set('offset', String(options.offset));
    const qs = params.toString() ? `?${params.toString()}` : '';
    return apiFetch<{ items: MediaItem[]; has_more: boolean }>(`/api/v1/medias${qs}`);
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
  createCollection: (title: string, isPublic = false, rule?: CollectionRule) =>
    apiFetch<CollectionItem>('/api/v1/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, is_public: isPublic, rule }),
    }),
  getSubscribedCollections: () =>
    apiFetch<{ items: CollectionItem[] }>('/api/v1/collections?subscribed=true'),
  subscribeToCollection: (collectionId: string) =>
    apiFetch<{ subscribed: boolean }>(`/api/v1/collections/${collectionId}/subscribe`, {
      method: 'POST',
    }),
  unsubscribeFromCollection: (collectionId: string) =>
    apiFetch<{ subscribed: boolean }>(`/api/v1/collections/${collectionId}/subscribe`, {
      method: 'DELETE',
    }),
  forkCollection: (collectionId: string) =>
    apiFetch<{ collection: CollectionItem; copied_count: number }>(
      `/api/v1/collections/${collectionId}/fork`,
      { method: 'POST' }
    ),

  // Follows and activity
  followUser: (userId: string) =>
    apiFetch<{ following: boolean }>(`/api/v1/users/${userId}/follow`, { method: 'POST' }),
  unfollowUser: (userId: string) =>
    apiFetch<{ following: boolean }>(`/api/v1/users/${userId}/follow`, { method: 'DELETE' }),
  getUserActivity: (userId: string, limit = 20) =>
    apiFetch<{ items: ActivityItem[] }>(`/api/v1/users/${userId}/activity?limit=${limit}`),
  getFeed: (limit = 12) => apiFetch<{ items: ActivityItem[] }>(`/api/v1/feed?limit=${limit}`),
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
  uploadMedia: (options: {
    file: File;
    title?: string;
    tags?: string[];
    isPublic?: boolean;
    isNsfw?: boolean;
    onProgress?: (progress: UploadProgress) => void;
  }): Promise<{ media: MediaItem; user_media: UserMediaItem }> => {
    return new Promise(async (resolve, reject) => {
      try {
        const { file, title, tags, isPublic = true, isNsfw = false, onProgress } = options;
        const formData = new FormData();
        formData.append('file', file);

        const query = new URLSearchParams({
          is_public: String(isPublic),
          is_nsfw: String(isNsfw),
        });
        if (title?.trim()) query.set('title', title.trim());
        if (tags && tags.length > 0) query.set('tags', tags.join(','));

        const authHeaders = await getAuthHeaders();
        const xhr = new XMLHttpRequest();

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && onProgress) {
            const percent = Math.min(100, Math.max(0, Math.round((event.loaded / event.total) * 100)));
            onProgress({
              loaded: event.loaded,
              total: event.total,
              percent,
            });
          }
        };

        xhr.onload = () => {
          try {
            const json = JSON.parse(xhr.responseText || '{}');
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(json);
            } else {
              reject(new Error(json.message ?? `Upload failed (${xhr.status})`));
            }
          } catch {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve({} as any);
            } else {
              reject(new Error(`Upload failed (${xhr.status})`));
            }
          }
        };

        xhr.onerror = () => {
          reject(new Error('Network error during media upload. Check your connection.'));
        };

        xhr.open('POST', `${API_BASE}/api/v1/medias/upload?${query.toString()}`);
        for (const [header, val] of Object.entries(authHeaders)) {
          xhr.setRequestHeader(header, val);
        }
        xhr.send(formData);
      } catch (err) {
        reject(err);
      }
    });
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
    showcase_media_ids?: string[];
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

