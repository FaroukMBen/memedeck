export interface UserRecord {
  id: string;
  email: string;
  username: string | null;
  is_library_public: boolean;
}

export interface MediaRecord {
  id: string;
  file_url: string;
  file_type: string;
  original_title: string | null;
  original_uploader_id: string | null;
  likes_count: number;
  dislikes_count: number;
  created_at: string;
}

export interface UserMediaRecord {
  id: string;
  user_id: string;
  media_id: string;
  custom_title: string | null;
  tags: string[];
  is_nsfw: boolean;
  is_public: boolean;
  added_at: string;
}

export interface MediaReactionRecord {
  user_id: string;
  media_id: string;
  reaction_type: 1 | -1;
  created_at: string;
}

export interface CollectionRecord {
  id: string;
  user_id: string;
  title: string;
  is_public: boolean;
}

export interface CollectionItemRecord {
  collection_id: string;
  user_media_id: string;
}

