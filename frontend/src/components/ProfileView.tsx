import { useEffect, useState, type FormEvent } from 'react';
import {
  UserPlus,
  UserCheck,
  UserX,
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  Lock,
  Pencil,
  Save,
  X,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Library,
  UploadCloud,
  Send,
  AlertCircle,
  Camera,
} from 'lucide-react';
import {
  memedeckApi,
  type UserProfile,
  type PublicationItem,
  type ProfileComment,
  type CollectionItem,
} from '../lib/api';
import { compressImageClientSide } from '../lib/compression';
import { useAuth } from '../context/AuthContext';
import { MediaThumbnail } from './MediaThumbnail';
import { MediaDetailModal, type SelectedMediaContext } from './MediaDetailModal';

interface ProfileViewProps {
  userId: string;
  onRequireAuth: () => void;
  onNavigateToUser?: (userId: string) => void;
}

export function ProfileView({ userId, onRequireAuth, onNavigateToUser }: ProfileViewProps) {
  const { user: currentUser } = useAuth();

  // Profile data state
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [publications, setPublications] = useState<PublicationItem[]>([]);
  const [comments, setComments] = useState<ProfileComment[]>([]);
  const [collections, setCollections] = useState<CollectionItem[]>([]);

  // Loading states
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingPubs, setLoadingPubs] = useState(true);
  const [loadingComments, setLoadingComments] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Active section tab
  const [activeTab, setActiveTab] = useState<'publications' | 'comments'>('publications');

  // Selected media modal state
  const [selectedMedia, setSelectedMedia] = useState<SelectedMediaContext | null>(null);

  // Edit Profile modal state
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editUsername, setEditUsername] = useState('');
  const [selectedAvatarFile, setSelectedAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [editBio, setEditBio] = useState('');
  const [editAllowFriendsPrivate, setEditAllowFriendsPrivate] = useState(false);
  const [editAllowComments, setEditAllowComments] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);

  // Friend request action loading
  const [friendActionLoading, setFriendActionLoading] = useState(false);

  // Comments state & pagination
  const [commentPage, setCommentPage] = useState(1);
  const [totalCommentPages, setTotalCommentPages] = useState(1);
  const [totalComments, setTotalComments] = useState(0);
  const [newCommentText, setNewCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  // 1. Fetch Profile Info
  const fetchProfile = async () => {
    setLoadingProfile(true);
    setProfileError(null);
    try {
      const data = await memedeckApi.getUserProfile(userId);
      setProfile(data);
      setEditUsername(data.username || '');
      setAvatarPreview(data.avatar_url || null);
      setSelectedAvatarFile(null);
      setEditBio(data.bio || '');
      setEditAllowFriendsPrivate(data.allow_friends_see_private);
      setEditAllowComments(data.allow_profile_comments);
    } catch (err: any) {
      setProfileError(err.message ?? 'Failed to load profile');
    } finally {
      setLoadingProfile(false);
    }
  };

  const handleAvatarFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const result = await compressImageClientSide(file, 512, 512, 0.85);
      setSelectedAvatarFile(result.file);
      setAvatarPreview(URL.createObjectURL(result.file));
    } catch {
      setSelectedAvatarFile(file);
      setAvatarPreview(URL.createObjectURL(file));
    }
  };

  // 2. Fetch User Publications
  const fetchPublications = async () => {
    setLoadingPubs(true);
    try {
      const res = await memedeckApi.getUserPublications(userId);
      setPublications(res.items);
    } catch {
      setPublications([]);
    } finally {
      setLoadingPubs(false);
    }
  };

  // 3. Fetch Profile Comments
  const fetchComments = async (page = 1) => {
    setLoadingComments(true);
    try {
      const res = await memedeckApi.getProfileComments(userId, page, 8);
      setComments(res.comments);
      setTotalCommentPages(res.total_pages);
      setTotalComments(res.total);
      setCommentPage(res.page);
    } catch {
      setComments([]);
    } finally {
      setLoadingComments(false);
    }
  };

  // Fetch collections if logged in for adding media to collections
  useEffect(() => {
    if (currentUser) {
      memedeckApi.getCollections(true).then((res) => setCollections(res.items)).catch(() => {});
    }
  }, [currentUser]);

  useEffect(() => {
    fetchProfile();
    fetchPublications();
    fetchComments(1);
  }, [userId, currentUser?.id]);

  // Handle Edit Profile submission
  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSavingProfile(true);

    try {
      let finalAvatarUrl: string | null = profile.avatar_url;

      if (selectedAvatarFile) {
        const uploadRes = await memedeckApi.uploadAvatar(selectedAvatarFile);
        finalAvatarUrl = uploadRes.avatar_url;
      } else if (!avatarPreview) {
        finalAvatarUrl = null;
      }

      await memedeckApi.updateCurrentUserProfile({
        username: editUsername.trim() || undefined,
        avatar_url: finalAvatarUrl,
        bio: editBio.trim() || null,
        allow_friends_see_private: editAllowFriendsPrivate,
        allow_profile_comments: editAllowComments,
      });

      setProfile((prev) =>
        prev
          ? {
              ...prev,
              username: editUsername.trim() || prev.username,
              avatar_url: finalAvatarUrl,
              bio: editBio.trim() || null,
              allow_friends_see_private: editAllowFriendsPrivate,
              allow_profile_comments: editAllowComments,
            }
          : null
      );
      setSelectedAvatarFile(null);
      setIsEditingProfile(false);
      // Re-fetch publications in case privacy toggle affected what's visible
      fetchPublications();
    } catch (err: any) {
      alert(err.message ?? 'Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  // Handle Friendship Actions
  const handleFriendAction = async () => {
    if (!currentUser) {
      onRequireAuth();
      return;
    }
    if (!profile) return;

    setFriendActionLoading(true);
    try {
      if (profile.friendship_status === 'none') {
        const res = await memedeckApi.sendFriendRequest(userId);
        setProfile((prev) => (prev ? { ...prev, friendship_status: res.status } : null));
      } else if (profile.friendship_status === 'pending_received') {
        await memedeckApi.acceptFriendRequest(userId);
        setProfile((prev) => (prev ? { ...prev, friendship_status: 'friends' } : null));
        fetchPublications();
      } else if (profile.friendship_status === 'friends' || profile.friendship_status === 'pending_sent') {
        const confirmMsg =
          profile.friendship_status === 'friends'
            ? 'Remove this user from your friends?'
            : 'Cancel this friend request?';
        if (confirm(confirmMsg)) {
          await memedeckApi.removeFriendship(userId);
          setProfile((prev) => (prev ? { ...prev, friendship_status: 'none' } : null));
          fetchPublications();
        }
      }
    } catch (err: any) {
      alert(err.message ?? 'Friendship action failed');
    } finally {
      setFriendActionLoading(false);
    }
  };

  // Post a comment
  const handlePostComment = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      onRequireAuth();
      return;
    }
    if (!newCommentText.trim()) return;

    setSubmittingComment(true);
    try {
      const created = await memedeckApi.postProfileComment(userId, newCommentText.trim());
      setComments((prev) => [created, ...prev]);
      setTotalComments((prev) => prev + 1);
      setNewCommentText('');
    } catch (err: any) {
      alert(err.message ?? 'Failed to post comment');
    } finally {
      setSubmittingComment(false);
    }
  };

  // Delete a comment
  const handleDeleteComment = async (commentId: string) => {
    if (!confirm('Delete this comment?')) return;
    try {
      await memedeckApi.deleteProfileComment(userId, commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      setTotalComments((prev) => Math.max(0, prev - 1));
    } catch (err: any) {
      alert(err.message ?? 'Failed to delete comment');
    }
  };

  if (loadingProfile) {
    return (
      <div className="view-container">
        <div className="loading-state">
          <Loader2 size={36} className="spin" />
          <p>Loading creator profile...</p>
        </div>
      </div>
    );
  }

  if (profileError || !profile) {
    return (
      <div className="view-container">
        <div className="empty-state-card">
          <AlertCircle size={40} className="empty-icon" />
          <h3>Profile Not Found</h3>
          <p>{profileError ?? 'This user profile does not exist or has been removed.'}</p>
        </div>
      </div>
    );
  }

  const isOwnProfile = profile.is_own_profile;
  const initial = profile.username ? profile.username.charAt(0).toUpperCase() : '?';

  return (
    <div className="view-container profile-container">
      {/* Profile Header Card */}
      <div className="profile-hero-card">
        <div className="profile-hero-main">
          {/* Avatar */}
          <div className="profile-avatar-wrapper">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.username || 'User avatar'}
                className="profile-avatar-img"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <div className="profile-avatar-fallback">
                <span>{initial}</span>
              </div>
            )}
          </div>

          {/* User Details */}
          <div className="profile-meta-details">
            <div className="profile-title-row">
              <h2 className="profile-username">
                {profile.username || 'Anonymous Meme Creator'}
              </h2>

              {isOwnProfile ? (
                <button
                  className="profile-action-btn edit"
                  onClick={() => setIsEditingProfile(true)}
                >
                  <Pencil size={15} />
                  <span>Edit Profile</span>
                </button>
              ) : (
                <button
                  className={`profile-action-btn friend ${profile.friendship_status}`}
                  onClick={handleFriendAction}
                  disabled={friendActionLoading}
                >
                  {friendActionLoading ? (
                    <Loader2 size={15} className="spin" />
                  ) : profile.friendship_status === 'friends' ? (
                    <>
                      <UserCheck size={15} />
                      <span>Friends</span>
                    </>
                  ) : profile.friendship_status === 'pending_sent' ? (
                    <>
                      <UserX size={15} />
                      <span>Request Sent</span>
                    </>
                  ) : profile.friendship_status === 'pending_received' ? (
                    <>
                      <UserPlus size={15} />
                      <span>Accept Request</span>
                    </>
                  ) : (
                    <>
                      <UserPlus size={15} />
                      <span>Add Friend</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {profile.bio ? (
              <p className="profile-bio-text">{profile.bio}</p>
            ) : (
              <p className="profile-bio-placeholder">
                {isOwnProfile
                  ? 'No bio yet. Click Edit Profile to tell the community about your memes!'
                  : 'No bio provided.'}
              </p>
            )}

            {/* Privacy Badges info */}
            <div className="profile-badges-row">
              {profile.allow_friends_see_private && (
                <span className="profile-badge-pill" title="Friends can see private publications">
                  <Lock size={12} />
                  <span>Private shared with friends</span>
                </span>
              )}
              {profile.allow_profile_comments && (
                <span className="profile-badge-pill" title="Comments are open on this profile">
                  <MessageSquare size={12} />
                  <span>Guestbook open</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Profile Statistics Badges */}
        <div className="profile-stats-grid">
          <div className="stat-card">
            <div className="stat-icon-wrapper blue">
              <UploadCloud size={20} />
            </div>
            <div className="stat-card-text">
              <span className="stat-number">{profile.stats.published_count}</span>
              <span className="stat-label">Published</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon-wrapper green">
              <ThumbsUp size={20} />
            </div>
            <div className="stat-card-text">
              <span className="stat-number">{profile.stats.total_likes}</span>
              <span className="stat-label">Total Likes</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon-wrapper red">
              <ThumbsDown size={20} />
            </div>
            <div className="stat-card-text">
              <span className="stat-number">{profile.stats.total_dislikes}</span>
              <span className="stat-label">Total Dislikes</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon-wrapper purple">
              <Library size={20} />
            </div>
            <div className="stat-card-text">
              <span className="stat-number">{profile.stats.library_count}</span>
              <span className="stat-label">In Library</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs navigation */}
      <div className="profile-tabs-nav">
        <button
          className={`profile-tab-item ${activeTab === 'publications' ? 'active' : ''}`}
          onClick={() => setActiveTab('publications')}
        >
          <UploadCloud size={16} />
          <span>Publications ({publications.length})</span>
        </button>

        <button
          className={`profile-tab-item ${activeTab === 'comments' ? 'active' : ''}`}
          onClick={() => setActiveTab('comments')}
        >
          <MessageSquare size={16} />
          <span>Guestbook & Comments ({totalComments})</span>
        </button>
      </div>

      {/* Tab 1: Publications */}
      {activeTab === 'publications' && (
        <div className="profile-tab-content">
          {loadingPubs ? (
            <div className="loading-state">
              <Loader2 size={28} className="spin" />
              <p>Loading published media...</p>
            </div>
          ) : publications.length === 0 ? (
            <div className="empty-state-card">
              <UploadCloud size={40} className="empty-icon" />
              <h3>No publications found</h3>
              <p>
                {isOwnProfile
                  ? 'You have not uploaded any media creations yet.'
                  : 'This user has not published any public memes yet.'}
              </p>
            </div>
          ) : (
            <div className="media-grid">
              {publications.map((pub) => {
                const title = pub.custom_title || pub.original_title || 'Untitled Meme';

                return (
                  <div
                    key={pub.id}
                    className="media-card"
                    onClick={() =>
                      setSelectedMedia({
                        media: {
                          id: pub.id,
                          file_url: pub.file_url,
                          file_type: pub.file_type,
                          original_title: pub.original_title || null,
                          original_uploader_id: userId,
                          likes_count: pub.likes_count,
                          dislikes_count: pub.dislikes_count,
                          user_reaction: null,
                          created_at: pub.created_at,
                        },
                        isOwner: isOwnProfile,
                      })
                    }
                  >
                    <div className="media-card-thumb">
                      <MediaThumbnail url={pub.file_url} fileType={pub.file_type} />
                    </div>

                    <div className="media-card-body">
                      <div className="card-top-title-row">
                        <h4 className="card-meme-title" title={title}>
                          {title}
                        </h4>
                        {!pub.is_public && (
                          <span className="card-lock-badge" title="Private publication (visible to friends)">
                            <Lock size={12} />
                          </span>
                        )}
                      </div>

                      {pub.tags && pub.tags.length > 0 && (
                        <div className="card-tags-row">
                          {pub.tags.slice(0, 3).map((t) => (
                            <span key={t} className="card-mini-tag">
                              #{t}
                            </span>
                          ))}
                          {pub.tags.length > 3 && (
                            <span className="card-more-tags">+{pub.tags.length - 3}</span>
                          )}
                        </div>
                      )}

                      <div className="card-reactions-bar">
                        <span className="reaction-stat-badge like">
                          <ThumbsUp size={12} />
                          <span>{pub.likes_count}</span>
                        </span>
                        <span className="reaction-stat-badge dislike">
                          <ThumbsDown size={12} />
                          <span>{pub.dislikes_count}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Profile Comments */}
      {activeTab === 'comments' && (
        <div className="profile-tab-content">
          {!profile.allow_profile_comments ? (
            <div className="comments-disabled-banner">
              <Lock size={20} />
              <p>Comments are disabled by the owner of this profile.</p>
            </div>
          ) : (
            <div className="profile-comments-container">
              {/* Comment submission form */}
              <form className="comment-post-box" onSubmit={handlePostComment}>
                <textarea
                  className="comment-textarea"
                  placeholder={
                    currentUser
                      ? `Leave a comment on @${profile.username || 'this user'}'s wall...`
                      : 'Connect your account to leave a comment on this profile.'
                  }
                  value={newCommentText}
                  onChange={(e) => setNewCommentText(e.target.value)}
                  disabled={!currentUser || submittingComment}
                  rows={3}
                  maxLength={1000}
                />

                <div className="comment-post-footer">
                  <span className="char-count">{newCommentText.length} / 1000</span>
                  <button
                    type="submit"
                    className="submit-comment-btn"
                    disabled={!currentUser || !newCommentText.trim() || submittingComment}
                  >
                    {submittingComment ? (
                      <Loader2 size={15} className="spin" />
                    ) : (
                      <>
                        <Send size={14} />
                        <span>Post Comment</span>
                      </>
                    )}
                  </button>
                </div>
              </form>

              {/* Comments list */}
              {loadingComments ? (
                <div className="loading-state">
                  <Loader2 size={24} className="spin" />
                  <p>Loading guestbook comments...</p>
                </div>
              ) : comments.length === 0 ? (
                <div className="empty-state-card" style={{ padding: '32px 16px' }}>
                  <MessageSquare size={32} className="empty-icon" />
                  <p>No comments on this profile yet. Be the first to leave one!</p>
                </div>
              ) : (
                <div className="comments-stream">
                  {comments.map((comment) => (
                    <div key={comment.id} className="comment-card-item">
                      <div className="comment-author-avatar">
                        {comment.author_avatar_url ? (
                          <img
                            src={comment.author_avatar_url}
                            alt={comment.author_username || 'Author'}
                            className="comment-avatar-img"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="comment-avatar-fallback">
                            {(comment.author_username || 'U').charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>

                      <div className="comment-content-body">
                        <div className="comment-header-row">
                          <button
                            className="comment-author-name-btn"
                            onClick={() => onNavigateToUser?.(comment.author_id)}
                          >
                            @{comment.author_username || 'Anonymous'}
                          </button>
                          <span className="comment-timestamp">
                            {new Date(comment.created_at).toLocaleDateString(undefined, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>

                          {comment.can_delete && (
                            <button
                              className="comment-delete-btn"
                              onClick={() => handleDeleteComment(comment.id)}
                              title="Delete comment"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>

                        <p className="comment-text-paragraph">{comment.content}</p>
                      </div>
                    </div>
                  ))}

                  {/* Pagination Controls */}
                  {totalCommentPages > 1 && (
                    <div className="comments-pagination-bar">
                      <button
                        className="pagination-btn"
                        onClick={() => fetchComments(commentPage - 1)}
                        disabled={commentPage <= 1 || loadingComments}
                      >
                        <ChevronLeft size={16} />
                        <span>Previous</span>
                      </button>

                      <span className="page-indicator">
                        Page {commentPage} of {totalCommentPages}
                      </span>

                      <button
                        className="pagination-btn"
                        onClick={() => fetchComments(commentPage + 1)}
                        disabled={commentPage >= totalCommentPages || loadingComments}
                      >
                        <span>Next</span>
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Edit Profile Modal */}
      {isEditingProfile && (
        <div className="modal-backdrop" onClick={() => setIsEditingProfile(false)}>
          <div className="modal-content profile-edit-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit Profile Settings</h3>
              <button
                className="icon-btn"
                onClick={() => setIsEditingProfile(false)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="profile-edit-form">
              <div className="form-group">
                <label className="form-label">Username</label>
                <input
                  type="text"
                  className="form-input"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  placeholder="Your display username"
                  minLength={3}
                  maxLength={30}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Profile Picture (PFP)</label>
                <div className="avatar-upload-box">
                  <div className="avatar-edit-preview">
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="Preview" className="avatar-edit-img" />
                    ) : (
                      <div className="avatar-edit-placeholder">
                        {(editUsername || 'U').charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>

                  <div className="avatar-edit-actions">
                    <label className="small-action-btn accent avatar-pick-btn">
                      <Camera size={15} />
                      <span>{selectedAvatarFile ? 'Change Picture' : 'Upload Picture'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={handleAvatarFileSelect}
                      />
                    </label>

                    {avatarPreview && (
                      <button
                        type="button"
                        className="small-action-btn danger"
                        onClick={() => {
                          setSelectedAvatarFile(null);
                          setAvatarPreview(null);
                        }}
                      >
                        <Trash2 size={14} />
                        <span>Remove Picture</span>
                      </button>
                    )}

                    <span className="form-hint">
                      Supports PNG, JPG, WebP. Converted automatically to lightweight WebP.
                    </span>
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Bio / Description</label>
                <textarea
                  className="form-textarea"
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  placeholder="A short description about yourself or your humor style..."
                  rows={3}
                  maxLength={500}
                />
                <span className="form-hint">{editBio.length} / 500 characters</span>
              </div>

              <div className="form-checkbox-group">
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={editAllowFriendsPrivate}
                    onChange={(e) => setEditAllowFriendsPrivate(e.target.checked)}
                  />
                  <span>Allow friends to see my private publications</span>
                </label>
                <span className="checkbox-subtext">
                  By default disabled. When turned on, accepted friends can see your private uploads on your profile.
                </span>
              </div>

              <div className="form-checkbox-group">
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={editAllowComments}
                    onChange={(e) => setEditAllowComments(e.target.checked)}
                  />
                  <span>Enable guestbook comments on my profile</span>
                </label>
                <span className="checkbox-subtext">
                  Allows other community members to write messages on your profile wall.
                </span>
              </div>

              <div className="modal-actions-footer">
                <button
                  type="button"
                  className="cancel-btn"
                  onClick={() => setIsEditingProfile(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="submit-btn" disabled={savingProfile}>
                  {savingProfile ? (
                    <Loader2 size={16} className="spin" />
                  ) : (
                    <>
                      <Save size={16} />
                      <span>Save Changes</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inspection Modal for Publications */}
      <MediaDetailModal
        selected={selectedMedia}
        collections={collections}
        onClose={() => setSelectedMedia(null)}
        onReactionUpdated={(mediaId, likes, dislikes) => {
          setPublications((prev) =>
            prev.map((p) =>
              p.id === mediaId ? { ...p, likes_count: likes, dislikes_count: dislikes } : p
            )
          );
        }}
      />
    </div>
  );
}
