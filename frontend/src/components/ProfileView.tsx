import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import {
  UserPlus,
  UserCheck,
  Clock,
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
  Send,
  AlertCircle,
  Camera,
  CalendarDays,
  Film,
  Images,
  Trophy,
  Hash,
  Users,
  Pin,
  PinOff,
  Rss,
  Activity,
} from 'lucide-react';
import {
  memedeckApi,
  type UserProfile,
  type PublicationItem,
  type ProfileComment,
  type CollectionItem,
  type ActivityItem,
} from '../lib/api';
import { compressImageClientSide } from '../lib/compression';
import { hueFromString } from '../lib/hue';
import { useAuth } from '../context/AuthContext';
import { useFeedback } from '../context/FeedbackContext';
import { MediaThumbnail } from './MediaThumbnail';
import { ActivityList } from './ActivityList';
import { Select, type SelectOption } from './Select';
import { MediaDetailModal, type SelectedMediaContext } from './MediaDetailModal';

interface ProfileViewProps {
  userId: string;
  onRequireAuth: () => void;
  onNavigateToUser?: (userId: string) => void;
}

type ProfileTab = 'publications' | 'activity' | 'comments';
type PubSort = 'recent' | 'likes';
type PubFilter = 'all' | 'image' | 'video';

const PUB_SORT_OPTIONS: SelectOption<PubSort>[] = [
  { value: 'recent', label: 'Most recent' },
  { value: 'likes', label: 'Most liked' },
];

const BEST_OF_COUNT = 3;
const MAX_SHOWCASE = 6;
const MAX_TOP_TAGS = 10;

function pubTitle(pub: PublicationItem): string {
  return pub.custom_title || pub.original_title || 'Untitled Meme';
}

function isVideoPub(pub: PublicationItem): boolean {
  return pub.file_type.startsWith('video/');
}

/** Round avatar that falls back to the user's initial when there is no usable image. */
function Avatar({
  url,
  name,
  className = '',
}: {
  url?: string | null;
  name?: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [url]);

  if (url && !failed) {
    return (
      <img
        src={url}
        alt={name ? `${name}'s avatar` : 'User avatar'}
        className={`pf-avatar ${className}`}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span className={`pf-avatar pf-avatar-fallback ${className}`} aria-hidden="true">
      {(name || '?').charAt(0).toUpperCase()}
    </span>
  );
}

export function ProfileView({ userId, onRequireAuth, onNavigateToUser }: ProfileViewProps) {
  const { user: currentUser, username: currentUsername } = useAuth();
  const { confirm, notify } = useFeedback();

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

  // Section tab and publication browsing
  const [activeTab, setActiveTab] = useState<ProfileTab>('publications');
  const [pubSort, setPubSort] = useState<PubSort>('recent');
  const [pubFilter, setPubFilter] = useState<PubFilter>('all');

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
  const [followBusy, setFollowBusy] = useState(false);
  const [activity, setActivity] = useState<ActivityItem[]>([]);

  // Comments state & pagination
  const [commentPage, setCommentPage] = useState(1);
  const [totalCommentPages, setTotalCommentPages] = useState(1);
  const [totalComments, setTotalComments] = useState(0);
  const [newCommentText, setNewCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  const resetEditForm = (data: UserProfile) => {
    setEditUsername(data.username || '');
    setAvatarPreview(data.avatar_url || null);
    setSelectedAvatarFile(null);
    setEditBio(data.bio || '');
    setEditAllowFriendsPrivate(data.allow_friends_see_private);
    setEditAllowComments(data.allow_profile_comments);
  };

  // 1. Fetch Profile Info
  const fetchProfile = async () => {
    setLoadingProfile(true);
    setProfileError(null);
    try {
      const data = await memedeckApi.getUserProfile(userId);
      setProfile(data);
      resetEditForm(data);
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
    setActiveTab('publications');
    setPubFilter('all');
    fetchProfile();
    fetchPublications();
    fetchComments(1);
    memedeckApi
      .getUserActivity(userId)
      .then((res) => setActivity(res.items))
      .catch(() => setActivity([]));
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
      notify('Profile updated', 'success');
      // Re-fetch publications in case privacy toggle affected what's visible
      fetchPublications();
    } catch (err: any) {
      notify(err.message ?? 'Failed to update profile', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const closeEditModal = () => {
    setIsEditingProfile(false);
    if (profile) resetEditForm(profile);
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
        const isFriend = profile.friendship_status === 'friends';
        const confirmed = await confirm({
          title: isFriend ? 'Remove this friend?' : 'Cancel this friend request?',
          message: isFriend
            ? 'You will no longer see each other’s friends-only content.'
            : undefined,
          confirmLabel: isFriend ? 'Remove friend' : 'Cancel request',
          cancelLabel: 'Keep',
          tone: 'danger',
        });
        if (confirmed) {
          await memedeckApi.removeFriendship(userId);
          setProfile((prev) => (prev ? { ...prev, friendship_status: 'none' } : null));
          fetchPublications();
        }
      }
    } catch (err: any) {
      notify(err.message ?? 'Friendship action failed', 'error');
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
      notify(err.message ?? 'Failed to post comment', 'error');
    } finally {
      setSubmittingComment(false);
    }
  };

  // Delete a comment
  const handleDeleteComment = async (commentId: string) => {
    const confirmed = await confirm({
      title: 'Delete this comment?',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await memedeckApi.deleteProfileComment(userId, commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      setTotalComments((prev) => Math.max(0, prev - 1));
    } catch (err: any) {
      notify(err.message ?? 'Failed to delete comment', 'error');
    }
  };

  // The most liked publications, shown as a podium above the grid
  const bestOf = useMemo(() => {
    if (publications.length <= BEST_OF_COUNT) return [];
    return [...publications]
      .filter((p) => p.likes_count > 0)
      .sort((a, b) => b.likes_count - a.likes_count)
      .slice(0, BEST_OF_COUNT);
  }, [publications]);

  const topTags = useMemo(() => {
    const tagCounts = new Map<string, number>();
    for (const pub of publications) {
      for (const tag of pub.tags ?? []) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
    }
    return [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, MAX_TOP_TAGS);
  }, [publications]);

  const visiblePubs = useMemo(() => {
    const list = publications.filter((p) => {
      if (pubFilter === 'image') return !isVideoPub(p);
      if (pubFilter === 'video') return isVideoPub(p);
      return true;
    });
    if (pubSort === 'likes') {
      list.sort((a, b) => b.likes_count - a.likes_count);
    }
    return list;
  }, [publications, pubFilter, pubSort]);

  if (loadingProfile) {
    return (
      <div className="view-container">
        <div className="loading-state">
          <Loader2 size={36} className="spin" />
          <p>Loading profile...</p>
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
  const displayName = profile.username || 'Anonymous';
  const { published_count, library_count, total_likes, total_dislikes, followers_count } =
    profile.stats;
  const totalVotes = total_likes + total_dislikes;
  const approval = totalVotes > 0 ? Math.round((total_likes / totalVotes) * 100) : null;
  const memberSince = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : null;

  const openPublication = (pub: PublicationItem) =>
    setSelectedMedia({
      media: {
        id: pub.id,
        file_url: pub.file_url,
        file_type: pub.file_type,
        source_format: pub.source_format,
        in_library: pub.in_library,
        original_title: pub.original_title || null,
        original_uploader_id: userId,
        likes_count: pub.likes_count,
        dislikes_count: pub.dislikes_count,
        user_reaction: null,
        created_at: pub.created_at,
      },
      isOwner: isOwnProfile,
    });

  // Pinned publications, in the order they were pinned
  const showcase = profile.showcase_media_ids
    .map((id) => publications.find((p) => p.id === id))
    .filter((p): p is PublicationItem => !!p);

  const handleToggleFollow = async () => {
    if (!currentUser) {
      onRequireAuth();
      return;
    }
    setFollowBusy(true);
    try {
      const res = profile.is_following
        ? await memedeckApi.unfollowUser(userId)
        : await memedeckApi.followUser(userId);
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              is_following: res.following,
              stats: {
                ...prev.stats,
                followers_count: Math.max(
                  0,
                  prev.stats.followers_count + (res.following ? 1 : -1)
                ),
              },
            }
          : null
      );
    } catch (err: any) {
      notify(err.message ?? 'Failed to update follow', 'error');
    } finally {
      setFollowBusy(false);
    }
  };

  const handleTogglePin = async (mediaId: string) => {
    const current = profile.showcase_media_ids;
    const isPinned = current.includes(mediaId);
    if (!isPinned && current.length >= MAX_SHOWCASE) {
      notify(`Your showcase is full (${MAX_SHOWCASE} memes). Unpin one first.`, 'info');
      return;
    }
    const next = isPinned ? current.filter((id) => id !== mediaId) : [...current, mediaId];
    try {
      await memedeckApi.updateCurrentUserProfile({ showcase_media_ids: next });
      setProfile((prev) => (prev ? { ...prev, showcase_media_ids: next } : null));
    } catch (err: any) {
      notify(err.message ?? 'Failed to update your showcase', 'error');
    }
  };

  const publicationTile = (pub: PublicationItem, rank?: number) => {
    const title = pubTitle(pub);
    const isPinned = profile.showcase_media_ids.includes(pub.id);
    return (
      <div
        key={pub.id}
        className="lib-tile"
        role="button"
        tabIndex={0}
        onClick={() => openPublication(pub)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') openPublication(pub);
        }}
      >
        <MediaThumbnail
          url={pub.file_url}
          fileType={pub.file_type}
          sourceFormat={pub.source_format}
          showBadge={false}
        />

        <div className="lib-tile-flags">
          {rank !== undefined && <span className="pf-rank">#{rank}</span>}
          {isVideoPub(pub) && (
            <span className="lib-tile-flag" title="Video">
              <Film size={12} />
            </span>
          )}
          {!pub.is_public && (
            <span className="lib-tile-flag private" title="Private (visible to friends)">
              <Lock size={12} />
            </span>
          )}
        </div>

        {isOwnProfile && (
          <div className="lib-tile-quick">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleTogglePin(pub.id);
              }}
              title={isPinned ? 'Unpin from your showcase' : 'Pin to your showcase'}
              aria-label={isPinned ? 'Unpin from your showcase' : 'Pin to your showcase'}
              aria-pressed={isPinned}
            >
              {isPinned ? <PinOff size={14} /> : <Pin size={14} />}
            </button>
          </div>
        )}

        <div className="lib-tile-info">
          <h4 title={title}>{title}</h4>
          <div className="lib-tile-sub">
            <span className="pf-tile-stat">
              <ThumbsUp size={11} /> {pub.likes_count}
            </span>
            <span className="pf-tile-stat">
              <ThumbsDown size={11} /> {pub.dislikes_count}
            </span>
            {pub.tags?.slice(0, 1).map((t) => (
              <span key={t} className="lib-tile-tag">
                #{t}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const friendButton = () => {
    const status = profile.friendship_status;
    const config =
      status === 'friends'
        ? { icon: <UserCheck size={16} />, label: 'Friends', variant: 'outline' }
        : status === 'pending_sent'
        ? { icon: <Clock size={16} />, label: 'Request sent', variant: 'outline' }
        : status === 'pending_received'
        ? { icon: <UserPlus size={16} />, label: 'Accept request', variant: 'primary' }
        : { icon: <UserPlus size={16} />, label: 'Add friend', variant: 'primary' };

    return (
      <button
        className={`pf-btn ${config.variant}`}
        onClick={handleFriendAction}
        disabled={friendActionLoading}
        title={
          status === 'friends'
            ? 'Click to remove this friend'
            : status === 'pending_sent'
            ? 'Click to cancel your request'
            : undefined
        }
      >
        {friendActionLoading ? <Loader2 size={16} className="spin" /> : config.icon}
        <span>{config.label}</span>
      </button>
    );
  };

  return (
    <div className="pf-page">
      {/* Header: cover, identity, bio, stats */}
      <header className="pf-header">
        <div
          className="pf-cover"
          style={{ '--pf-hue': 195 + (hueFromString(profile.id) % 50) } as CSSProperties}
          aria-hidden="true"
        />

        <div className="pf-identity">
          <Avatar url={profile.avatar_url} name={profile.username} className="pf-avatar-xl" />

          <div className="pf-identity-text">
            <h1 className="pf-name">{displayName}</h1>
            <p className="pf-meta">
              {memberSince && (
                <span>
                  <CalendarDays size={14} /> Member since {memberSince}
                </span>
              )}
              {profile.friendship_status === 'friends' && (
                <span className="pf-meta-friend">
                  <Users size={14} /> Your friend
                </span>
              )}
            </p>
          </div>

          <div className="pf-actions">
            {isOwnProfile ? (
              <button className="pf-btn outline" onClick={() => setIsEditingProfile(true)}>
                <Pencil size={15} />
                <span>Edit profile</span>
              </button>
            ) : (
              <>
                <button
                  className={`pf-btn ${profile.is_following ? 'outline' : 'primary'}`}
                  onClick={handleToggleFollow}
                  disabled={followBusy}
                  aria-pressed={profile.is_following}
                  title={
                    profile.is_following
                      ? 'Stop seeing their uploads in your feed'
                      : 'See their future uploads in your feed'
                  }
                >
                  {followBusy ? <Loader2 size={16} className="spin" /> : <Rss size={16} />}
                  <span>{profile.is_following ? 'Following' : 'Follow'}</span>
                </button>
                {friendButton()}
              </>
            )}
          </div>
        </div>

        {profile.bio ? (
          <p className="pf-bio">{profile.bio}</p>
        ) : (
          <p className="pf-bio empty">
            {isOwnProfile ? 'No bio yet. Tell the community about your sense of humour.' : 'No bio yet.'}
          </p>
        )}

        <dl className="pf-stats">
          <div>
            <dt>Publications</dt>
            <dd>{published_count}</dd>
          </div>
          <div>
            <dt>Likes received</dt>
            <dd>{total_likes}</dd>
          </div>
          <div>
            <dt>Followers</dt>
            <dd>{followers_count}</dd>
          </div>
          <div>
            <dt>Approval</dt>
            <dd>{approval === null ? '–' : `${approval}%`}</dd>
          </div>
        </dl>
      </header>

      <div className="pf-body">
        <main className="pf-main">
          <div className="pf-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={activeTab === 'publications'}
              className={`pf-tab ${activeTab === 'publications' ? 'active' : ''}`}
              onClick={() => setActiveTab('publications')}
            >
              <Images size={16} />
              <span>Publications</span>
              <span className="pf-tab-count">{publications.length}</span>
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'activity'}
              className={`pf-tab ${activeTab === 'activity' ? 'active' : ''}`}
              onClick={() => setActiveTab('activity')}
            >
              <Activity size={16} />
              <span>Activity</span>
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'comments'}
              className={`pf-tab ${activeTab === 'comments' ? 'active' : ''}`}
              onClick={() => setActiveTab('comments')}
            >
              <MessageSquare size={16} />
              <span>Guestbook</span>
              <span className="pf-tab-count">{totalComments}</span>
            </button>
          </div>

          {/* Tab 1: Publications */}
          {activeTab === 'publications' &&
            (loadingPubs ? (
              <div className="loading-state">
                <Loader2 size={28} className="spin" />
                <p>Loading publications...</p>
              </div>
            ) : publications.length === 0 ? (
              <div className="empty-state-card">
                <Images size={40} className="empty-icon" />
                <h3>No publications yet</h3>
                <p>
                  {isOwnProfile
                    ? 'Memes you upload and make public will show up here.'
                    : `${displayName} has not published any public memes yet.`}
                </p>
              </div>
            ) : (
              <>
                {showcase.length > 0 && (
                  <section className="pf-section">
                    <h2 className="pf-section-title">
                      <Pin size={16} /> Showcase
                      {isOwnProfile && (
                        <span className="pf-section-count">
                          {showcase.length}/{MAX_SHOWCASE} pinned
                        </span>
                      )}
                    </h2>
                    <div className="lib-grid tiles pf-best">
                      {showcase.map((pub) => publicationTile(pub))}
                    </div>
                  </section>
                )}

                {showcase.length === 0 && bestOf.length > 0 && (
                  <section className="pf-section">
                    <h2 className="pf-section-title">
                      <Trophy size={16} /> Best of
                    </h2>
                    <div className="lib-grid tiles pf-best">
                      {bestOf.map((pub, idx) => publicationTile(pub, idx + 1))}
                    </div>
                  </section>
                )}

                <section className="pf-section">
                  <div className="pf-section-bar">
                    <h2 className="pf-section-title">
                      All publications
                      <span className="pf-section-count">
                        {visiblePubs.length === publications.length
                          ? publications.length
                          : `${visiblePubs.length}/${publications.length}`}
                      </span>
                    </h2>

                    <div className="pf-section-controls">
                      <div className="filter-pill-group">
                        {(['all', 'image', 'video'] as const).map((f) => (
                          <button
                            key={f}
                            className={`filter-pill ${pubFilter === f ? 'active' : ''}`}
                            onClick={() => setPubFilter(f)}
                          >
                            {f === 'all' ? 'All' : f === 'image' ? 'Images' : 'Videos'}
                          </button>
                        ))}
                      </div>
                      <Select
                        label="Sort publications by"
                        value={pubSort}
                        options={PUB_SORT_OPTIONS}
                        onChange={setPubSort}
                      />
                    </div>
                  </div>

                  {visiblePubs.length === 0 ? (
                    <p className="pf-muted-note">Nothing in this category.</p>
                  ) : (
                    <div className="lib-grid tiles">{visiblePubs.map((pub) => publicationTile(pub))}</div>
                  )}
                </section>
              </>
            ))}

          {/* Tab: recent public activity */}
          {activeTab === 'activity' &&
            (activity.length === 0 ? (
              <p className="pf-muted-note">No recent public activity.</p>
            ) : (
              <ActivityList items={activity} onNavigateToUser={onNavigateToUser} />
            ))}

          {/* Tab 2: Guestbook */}
          {activeTab === 'comments' &&
            (!profile.allow_profile_comments ? (
              <div className="empty-state-card">
                <Lock size={32} className="empty-icon" />
                <h3>Guestbook closed</h3>
                <p>{isOwnProfile ? 'You have' : `${displayName} has`} turned off comments on this profile.</p>
              </div>
            ) : (
              <div className="pf-guestbook">
                <form className="pf-composer" onSubmit={handlePostComment}>
                  <Avatar name={currentUser ? currentUsername : null} className="pf-avatar-sm" />
                  <div className="pf-composer-body">
                    <textarea
                      className="comment-textarea"
                      placeholder={
                        currentUser
                          ? `Write something on ${displayName}'s guestbook...`
                          : 'Connect your account to leave a comment.'
                      }
                      value={newCommentText}
                      onChange={(e) => setNewCommentText(e.target.value)}
                      disabled={!currentUser || submittingComment}
                      rows={2}
                      maxLength={1000}
                      aria-label="Your comment"
                    />
                    <div className="comment-post-footer">
                      <span className="char-count">{newCommentText.length} / 1000</span>
                      {currentUser ? (
                        <button
                          type="submit"
                          className="pf-btn primary small"
                          disabled={!newCommentText.trim() || submittingComment}
                        >
                          {submittingComment ? (
                            <Loader2 size={15} className="spin" />
                          ) : (
                            <Send size={14} />
                          )}
                          <span>Post</span>
                        </button>
                      ) : (
                        <button type="button" className="pf-btn primary small" onClick={onRequireAuth}>
                          Connect
                        </button>
                      )}
                    </div>
                  </div>
                </form>

                {loadingComments ? (
                  <div className="loading-state">
                    <Loader2 size={24} className="spin" />
                    <p>Loading comments...</p>
                  </div>
                ) : comments.length === 0 ? (
                  <p className="pf-muted-note">No comments yet. Be the first to leave one.</p>
                ) : (
                  <ul className="pf-comments">
                    {comments.map((comment) => (
                      <li key={comment.id} className="pf-comment">
                        <Avatar
                          url={comment.author_avatar_url}
                          name={comment.author_username}
                          className="pf-avatar-sm"
                        />
                        <div className="pf-comment-bubble">
                          <div className="pf-comment-head">
                            <button
                              className="pf-comment-author"
                              onClick={() => onNavigateToUser?.(comment.author_id)}
                            >
                              {comment.author_username || 'Anonymous'}
                            </button>
                            <time className="pf-comment-time" dateTime={comment.created_at}>
                              {new Date(comment.created_at).toLocaleDateString(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </time>
                            {comment.can_delete && (
                              <button
                                className="pf-comment-delete"
                                onClick={() => handleDeleteComment(comment.id)}
                                title="Delete comment"
                                aria-label="Delete comment"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                          <p className="pf-comment-text">{comment.content}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {totalCommentPages > 1 && (
                  <div className="comments-pagination-bar">
                    <button
                      className="pf-btn outline small"
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
                      className="pf-btn outline small"
                      onClick={() => fetchComments(commentPage + 1)}
                      disabled={commentPage >= totalCommentPages || loadingComments}
                    >
                      <span>Next</span>
                      <ChevronRight size={16} />
                    </button>
                  </div>
                )}
              </div>
            ))}
        </main>

        <aside className="pf-aside">
          <section className="pf-card">
            <h2 className="pf-card-title">Reputation</h2>
            {approval === null ? (
              <p className="pf-muted-note">No votes on their memes yet.</p>
            ) : (
              <>
                <div className="pf-approval">
                  <strong>{approval}%</strong>
                  <span>positive across {totalVotes} vote{totalVotes > 1 ? 's' : ''}</span>
                </div>
                <div
                  className="pf-approval-bar"
                  role="img"
                  aria-label={`${total_likes} likes, ${total_dislikes} dislikes`}
                >
                  <span style={{ width: `${approval}%` }} />
                </div>
                <div className="pf-approval-legend">
                  <span>
                    <ThumbsUp size={13} /> {total_likes}
                  </span>
                  <span>
                    <ThumbsDown size={13} /> {total_dislikes}
                  </span>
                </div>
              </>
            )}
          </section>

          {topTags.length > 0 && (
            <section className="pf-card">
              <h2 className="pf-card-title">Favourite tags</h2>
              <div className="pf-tags">
                {topTags.map(([tag, count]) => (
                  <span key={tag} className="pf-tag">
                    <Hash size={12} />
                    {tag}
                    <em>{count}</em>
                  </span>
                ))}
              </div>
            </section>
          )}

          <section className="pf-card">
            <h2 className="pf-card-title">About</h2>
            <ul className="pf-about">
              {memberSince && (
                <li>
                  <CalendarDays size={15} />
                  <span>Joined {memberSince}</span>
                </li>
              )}
              <li>
                <Images size={15} />
                <span>
                  {library_count} meme{library_count === 1 ? '' : 's'} in library
                </span>
              </li>
              <li>
                <MessageSquare size={15} />
                <span>Guestbook {profile.allow_profile_comments ? 'open' : 'closed'}</span>
              </li>
              <li>
                <Lock size={15} />
                <span>
                  {profile.allow_friends_see_private
                    ? 'Private memes shared with friends'
                    : 'Private memes hidden from everyone'}
                </span>
              </li>
            </ul>
          </section>
        </aside>
      </div>

      {/* Edit Profile Modal */}
      {isEditingProfile && (
        <div className="modal-backdrop" onClick={closeEditModal}>
          <div className="modal-content profile-edit-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit profile</h2>
              <button className="icon-btn" onClick={closeEditModal} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="profile-edit-form">
              <div className="avatar-upload-box">
                <Avatar url={avatarPreview} name={editUsername} className="pf-avatar-lg" />

                <div className="avatar-edit-actions">
                  <div className="avatar-edit-buttons">
                    <label className="pf-btn primary small avatar-pick-btn">
                      <Camera size={15} />
                      <span>{avatarPreview ? 'Change picture' : 'Upload picture'}</span>
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
                        className="pf-btn outline small"
                        onClick={() => {
                          setSelectedAvatarFile(null);
                          setAvatarPreview(null);
                        }}
                      >
                        <Trash2 size={14} />
                        <span>Remove</span>
                      </button>
                    )}
                  </div>
                  <span className="form-hint">PNG, JPG or WebP. Converted to a lightweight WebP.</span>
                </div>
              </div>

              <label className="pf-field">
                <span className="form-label">Username</span>
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
              </label>

              <label className="pf-field">
                <span className="form-label">
                  Bio
                  <span className="form-hint">{editBio.length} / 500</span>
                </span>
                <textarea
                  className="form-textarea"
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  placeholder="A short description about yourself or your humour style..."
                  rows={3}
                  maxLength={500}
                />
              </label>

              <div className="form-checkbox-group">
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={editAllowFriendsPrivate}
                    onChange={(e) => setEditAllowFriendsPrivate(e.target.checked)}
                  />
                  <span>
                    Share private memes with friends
                    <small>Accepted friends can see your private uploads on your profile.</small>
                  </span>
                </label>

                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={editAllowComments}
                    onChange={(e) => setEditAllowComments(e.target.checked)}
                  />
                  <span>
                    Open my guestbook
                    <small>Other members can leave comments on your profile.</small>
                  </span>
                </label>
              </div>

              <div className="modal-actions-footer">
                <button type="button" className="pf-btn outline" onClick={closeEditModal}>
                  Cancel
                </button>
                <button type="submit" className="pf-btn primary" disabled={savingProfile}>
                  {savingProfile ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
                  <span>Save changes</span>
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
