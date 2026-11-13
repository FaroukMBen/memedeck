export interface UserRecord {
  id: string;
  email: string;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  allow_friends_see_private: boolean;
  allow_profile_comments: boolean;
  is_library_public: boolean;
  created_at?: string;
}

export interface ProfileCommentRecord {
  id: string;
  profile_user_id: string;
  author_id: string;
  content: string;
  created_at: string;
}

export interface FriendshipRecord {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  updated_at: string;
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

