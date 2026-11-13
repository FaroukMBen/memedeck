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
  original_uploader_id: string | null;
  created_at: string;
}

export interface UserMediaRecord {
  id: string;
  user_id: string;
  media_id: string;
  is_public: boolean;
  added_at: string;
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

