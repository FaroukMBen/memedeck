import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Bell,
  Check,
  Clock,
  Loader2,
  RefreshCw,
  Rss,
  Search,
  Sparkles,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  memedeckApi,
  type ActivityItem,
  type CommunityUser,
} from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useFeedback } from '../context/FeedbackContext';
import { ActivityList } from './ActivityList';
import { CommunitySkeleton, useServerWakeup } from './Skeleton';

interface CommunityViewProps {
  onRequireAuth: () => void;
  onNavigateToUser: (userId: string) => void;
}

type CommunityTab = 'feed' | 'friends' | 'discover';
type ActivityFilter = 'all' | 'upload' | 'fork' | 'collection' | 'like';

function UserAvatar({
  url,
  username,
}: {
  url: string | null;
  username: string | null;
}) {
  const [failed, setFailed] = useState(false);

  if (url && !failed) {
    return (
      <img
        src={url}
        alt={username ?? 'User'}
        className="pf-avatar pf-avatar-md"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span className="pf-avatar pf-avatar-fallback pf-avatar-md" aria-hidden="true">
      {(username || '?').charAt(0).toUpperCase()}
    </span>
  );
}

export function CommunityView({
  onRequireAuth,
  onNavigateToUser,
}: CommunityViewProps) {
  const { user } = useAuth();
  const { notify, confirm } = useFeedback();

  const [subTab, setSubTab] = useState<CommunityTab>(user ? 'feed' : 'discover');
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');

  // Feed state
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(false);

  // Friends overview state
  const [friends, setFriends] = useState<CommunityUser[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<CommunityUser[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<CommunityUser[]>([]);
  const [following, setFollowing] = useState<CommunityUser[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);

  // Discover / Search users state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [discoveredUsers, setDiscoveredUsers] = useState<CommunityUser[]>([]);
  const [loadingDiscover, setLoadingDiscover] = useState(false);

  // Busy states per user ID
  const [busyUserIds, setBusyUserIds] = useState<Set<string>>(new Set());

  const isAnyLoading =
    (subTab === 'feed' && loadingFeed) ||
    (subTab === 'friends' && loadingFriends) ||
    (subTab === 'discover' && loadingDiscover);
  const isWakingUp = useServerWakeup(isAnyLoading);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchFeed = async () => {
    if (!user) {
      setActivities([]);
      return;
    }
    setLoadingFeed(true);
    try {
      const res = await memedeckApi.getFeed(35);
      setActivities(res.items);
    } catch (err: any) {
      notify(err.message ?? 'Failed to load activity feed', 'error');
    } finally {
      setLoadingFeed(false);
    }
  };

  const fetchFriendsOverview = async () => {
    if (!user) {
      setFriends([]);
      setIncomingRequests([]);
      setOutgoingRequests([]);
      setFollowing([]);
      return;
    }
    setLoadingFriends(true);
    try {
      const res = await memedeckApi.getFriendsOverview();
      setFriends(res.friends);
      setIncomingRequests(res.incoming_requests);
      setOutgoingRequests(res.outgoing_requests);
      setFollowing(res.following);
    } catch (err: any) {
      notify(err.message ?? 'Failed to load friends list', 'error');
    } finally {
      setLoadingFriends(false);
    }
  };

  const fetchDiscoverUsers = async (q: string) => {
    setLoadingDiscover(true);
    try {
      const res = await memedeckApi.searchUsers(q, 30);
      setDiscoveredUsers(res.items);
    } catch (err: any) {
      notify(err.message ?? 'Failed to search users', 'error');
    } finally {
      setLoadingDiscover(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchFeed();
      fetchFriendsOverview();
    } else if (subTab !== 'discover') {
      setSubTab('discover');
    }
  }, [user?.id]);

  useEffect(() => {
    fetchDiscoverUsers(debouncedQuery);
  }, [debouncedQuery, user?.id]);

  const setBusy = (targetId: string, busy: boolean) => {
    setBusyUserIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(targetId);
      else next.delete(targetId);
      return next;
    });
  };

  const syncUserState = (
    targetId: string,
    patch: Partial<Pick<CommunityUser, 'friendship_status' | 'is_following'>>
  ) => {
    const apply = (list: CommunityUser[]) =>
      list.map((u) => (u.id === targetId ? { ...u, ...patch } : u));
    setDiscoveredUsers(apply);
    setFriends(apply);
    setIncomingRequests(apply);
    setOutgoingRequests(apply);
    setFollowing(apply);
  };

  const handleAddFriend = async (target: CommunityUser) => {
    if (!user) {
      onRequireAuth();
      return;
    }
    setBusy(target.id, true);
    try {
      const res = await memedeckApi.sendFriendRequest(target.id);
      syncUserState(target.id, { friendship_status: res.status });
      notify(
        res.status === 'friends'
          ? `You and ${target.username ?? 'user'} are now friends!`
          : `Friend request sent to ${target.username ?? 'user'}`,
        'success'
      );
      fetchFriendsOverview();
    } catch (err: any) {
      notify(err.message ?? 'Could not send friend request', 'error');
    } finally {
      setBusy(target.id, false);
    }
  };

  const handleAcceptRequest = async (target: CommunityUser) => {
    if (!user) return;
    setBusy(target.id, true);
    try {
      await memedeckApi.acceptFriendRequest(target.id);
      syncUserState(target.id, { friendship_status: 'friends' });
      notify(`You are now friends with ${target.username ?? 'user'}!`, 'success');
      fetchFriendsOverview();
      fetchFeed();
    } catch (err: any) {
      notify(err.message ?? 'Could not accept friend request', 'error');
    } finally {
      setBusy(target.id, false);
    }
  };

  const handleRemoveOrCancelFriend = async (
    target: CommunityUser,
    mode: 'remove' | 'cancel' | 'decline'
  ) => {
    if (!user) return;

    if (mode === 'remove') {
      const ok = await confirm({
        title: `Remove ${target.username ?? 'this user'} from friends?`,
        message: 'You can always send a new friend request later.',
        confirmLabel: 'Remove Friend',
        tone: 'danger',
      });
      if (!ok) return;
    }

    setBusy(target.id, true);
    try {
      await memedeckApi.removeFriendship(target.id);
      syncUserState(target.id, { friendship_status: 'none' });
      notify(
        mode === 'remove'
          ? 'Friend removed'
          : mode === 'decline'
          ? 'Friend request declined'
          : 'Friend request cancelled',
        'info'
      );
      fetchFriendsOverview();
    } catch (err: any) {
      notify(err.message ?? 'Action failed', 'error');
    } finally {
      setBusy(target.id, false);
    }
  };

  const handleToggleFollow = async (target: CommunityUser) => {
    if (!user) {
      onRequireAuth();
      return;
    }
    setBusy(target.id, true);
    try {
      if (target.is_following) {
        await memedeckApi.unfollowUser(target.id);
        syncUserState(target.id, { is_following: false });
        notify(`Unfollowed ${target.username ?? 'user'}`, 'info');
      } else {
        await memedeckApi.followUser(target.id);
        syncUserState(target.id, { is_following: true });
        notify(`Following ${target.username ?? 'user'}!`, 'success');
      }
      fetchFriendsOverview();
      fetchFeed();
    } catch (err: any) {
      notify(err.message ?? 'Could not update follow status', 'error');
    } finally {
      setBusy(target.id, false);
    }
  };

  const filteredActivities = useMemo(() => {
    if (activityFilter === 'all') return activities;
    return activities.filter((a) => a.type === activityFilter);
  }, [activities, activityFilter]);

  const handleRefreshAll = () => {
    if (user) {
      fetchFeed();
      fetchFriendsOverview();
    }
    fetchDiscoverUsers(debouncedQuery);
  };

  const renderUserCard = (member: CommunityUser) => {
    const isBusy = busyUserIds.has(member.id);
    const isSelf = member.friendship_status === 'self' || member.id === user?.id;

    return (
      <div key={member.id} className="community-user-card">
        <div
          className="community-user-head"
          onClick={() => onNavigateToUser(member.id)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onNavigateToUser(member.id);
          }}
        >
          <UserAvatar url={member.avatar_url} username={member.username} />
          <div className="community-user-identity">
            <h4 className="community-username">
              {member.username || 'Anonymous Member'}
              {isSelf && <span className="community-self-pill">You</span>}
            </h4>
            {member.created_at && (
              <span className="community-joined">
                Joined{' '}
                {new Date(member.created_at).toLocaleDateString(undefined, {
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
            )}
          </div>
        </div>

        <p className="community-user-bio">
          {member.bio?.trim() || 'Meme curator & deck builder on MemeDeck.'}
        </p>

        {!isSelf && (
          <div className="community-user-actions">
            {member.friendship_status === 'friends' ? (
              <button
                type="button"
                className="community-action-btn friends"
                onClick={() => handleRemoveOrCancelFriend(member, 'remove')}
                disabled={isBusy}
                title="Click to remove friend"
              >
                {isBusy ? <Loader2 size={14} className="spin" /> : <UserCheck size={14} />}
                <span>Friends</span>
              </button>
            ) : member.friendship_status === 'pending_received' ? (
              <div className="community-request-pair">
                <button
                  type="button"
                  className="community-action-btn accept"
                  onClick={() => handleAcceptRequest(member)}
                  disabled={isBusy}
                >
                  {isBusy ? <Loader2 size={14} className="spin" /> : <Check size={14} />}
                  <span>Accept</span>
                </button>
                <button
                  type="button"
                  className="community-action-btn decline"
                  onClick={() => handleRemoveOrCancelFriend(member, 'decline')}
                  disabled={isBusy}
                  title="Decline request"
                >
                  <X size={14} />
                </button>
              </div>
            ) : member.friendship_status === 'pending_sent' ? (
              <button
                type="button"
                className="community-action-btn pending"
                onClick={() => handleRemoveOrCancelFriend(member, 'cancel')}
                disabled={isBusy}
                title="Click to cancel friend request"
              >
                {isBusy ? <Loader2 size={14} className="spin" /> : <Clock size={14} />}
                <span>Requested</span>
              </button>
            ) : (
              <button
                type="button"
                className="community-action-btn primary"
                onClick={() => handleAddFriend(member)}
                disabled={isBusy}
              >
                {isBusy ? <Loader2 size={14} className="spin" /> : <UserPlus size={14} />}
                <span>Add Friend</span>
              </button>
            )}

            <button
              type="button"
              className={`community-action-btn follow ${member.is_following ? 'active' : ''}`}
              onClick={() => handleToggleFollow(member)}
              disabled={isBusy}
            >
              <Rss size={14} />
              <span>{member.is_following ? 'Following' : 'Follow'}</span>
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="view-container">
      <div className="view-header">
        <div>
          <h2>Community &amp; Friends</h2>
          <p className="view-subtitle">
            Follow your favorite creators, manage your friends, and track live notifications.
          </p>
        </div>

        <div className="view-header-actions">
          <div className="filter-pill-group">
            <button
              className={`filter-pill ${subTab === 'feed' ? 'active' : ''}`}
              onClick={() => setSubTab('feed')}
            >
              <Activity size={14} />
              <span>Activity Feed</span>
            </button>

            <button
              className={`filter-pill ${subTab === 'friends' ? 'active' : ''}`}
              onClick={() => setSubTab('friends')}
            >
              <Users size={14} />
              <span>Friends</span>
              {incomingRequests.length > 0 && (
                <span className="community-badge-dot">{incomingRequests.length}</span>
              )}
            </button>

            <button
              className={`filter-pill ${subTab === 'discover' ? 'active' : ''}`}
              onClick={() => setSubTab('discover')}
            >
              <Search size={14} />
              <span>Find Members</span>
            </button>
          </div>

          <button
            className="icon-btn"
            onClick={handleRefreshAll}
            title="Refresh community data"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Incoming Friend Requests Alert Banner (shown on Feed tab if pending) */}
      {user && subTab === 'feed' && incomingRequests.length > 0 && (
        <div className="community-requests-alert">
          <div className="community-requests-alert-info">
            <Bell size={18} className="community-bell-icon" />
            <span>
              You have <strong>{incomingRequests.length}</strong> pending friend request
              {incomingRequests.length > 1 ? 's' : ''}!
            </span>
          </div>
          <button
            type="button"
            className="small-action-btn"
            onClick={() => setSubTab('friends')}
          >
            View &amp; Respond
          </button>
        </div>
      )}

      {/* TAB 1: ACTIVITY FEED */}
      {subTab === 'feed' && (
        <section className="shelf">
          {!user ? (
            <div className="empty-state-card">
              <Activity size={40} className="empty-icon" />
              <h3>Track Your Circle&apos;s Activity</h3>
              <p>
                Sign in to follow creators, add friends, and get notified when they upload memes,
                build decks, or like your posts.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button className="submit-btn" style={{ maxWidth: 200 }} onClick={onRequireAuth}>
                  Connect Account
                </button>
                <button className="small-action-btn" onClick={() => setSubTab('discover')}>
                  Browse Members
                </button>
              </div>
            </div>
          ) : loadingFeed && activities.length === 0 ? (
            <CommunitySkeleton mode="feed" isWakingUp={isWakingUp} />
          ) : (
            <>
              <div className="feed-bar" style={{ marginBottom: '1rem' }}>
                <div className="filter-pill-group">
                  <button
                    className={`filter-pill ${activityFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setActivityFilter('all')}
                  >
                    All Activity
                  </button>
                  <button
                    className={`filter-pill ${activityFilter === 'upload' ? 'active' : ''}`}
                    onClick={() => setActivityFilter('upload')}
                  >
                    Uploads
                  </button>
                  <button
                    className={`filter-pill ${activityFilter === 'fork' ? 'active' : ''}`}
                    onClick={() => setActivityFilter('fork')}
                  >
                    Forks
                  </button>
                  <button
                    className={`filter-pill ${activityFilter === 'collection' ? 'active' : ''}`}
                    onClick={() => setActivityFilter('collection')}
                  >
                    New Decks
                  </button>
                  <button
                    className={`filter-pill ${activityFilter === 'like' ? 'active' : ''}`}
                    onClick={() => setActivityFilter('like')}
                  >
                    Likes on Yours
                  </button>
                </div>
              </div>

              {filteredActivities.length === 0 ? (
                <div className="empty-state-card">
                  <Sparkles size={38} className="empty-icon" />
                  <h3>No activity to show yet</h3>
                  <p>
                    {activityFilter === 'all'
                      ? 'Follow creators or add friends to see their uploads, decks, and reactions right here!'
                      : `No recent "${activityFilter}" activity in your feed.`}
                  </p>
                  <button className="add-media-btn" onClick={() => setSubTab('discover')}>
                    <UserPlus size={16} />
                    <span>Find Friends &amp; Creators</span>
                  </button>
                </div>
              ) : (
                <ActivityList
                  items={filteredActivities}
                  onNavigateToUser={onNavigateToUser}
                />
              )}
            </>
          )}
        </section>
      )}

      {/* TAB 2: MY FRIENDS & REQUESTS */}
      {subTab === 'friends' && (
        <div className="community-friends-sections">
          {!user ? (
            <div className="empty-state-card">
              <Users size={40} className="empty-icon" />
              <h3>Manage Your Friends</h3>
              <p>Connect your account to add friends, share private decks, and collaborate.</p>
              <button className="submit-btn" style={{ maxWidth: 200 }} onClick={onRequireAuth}>
                Connect Account
              </button>
            </div>
          ) : loadingFriends &&
            friends.length === 0 &&
            incomingRequests.length === 0 &&
            following.length === 0 ? (
            <CommunitySkeleton mode="users" isWakingUp={isWakingUp} />
          ) : (
            <>
              {/* 1. Incoming Requests */}
              {incomingRequests.length > 0 && (
                <section className="shelf">
                  <h3 className="shelf-title">
                    Incoming Friend Requests ({incomingRequests.length})
                  </h3>
                  <div className="community-user-grid">
                    {incomingRequests.map(renderUserCard)}
                  </div>
                </section>
              )}

              {/* 2. Accepted Friends */}
              <section className="shelf">
                <div className="community-section-head">
                  <h3 className="shelf-title">My Friends ({friends.length})</h3>
                  <button
                    type="button"
                    className="small-action-btn"
                    onClick={() => setSubTab('discover')}
                  >
                    <UserPlus size={14} />
                    <span>Find More Friends</span>
                  </button>
                </div>

                {friends.length === 0 ? (
                  <div className="empty-state-card">
                    <Users size={36} className="empty-icon" />
                    <h3>No friends added yet</h3>
                    <p>Search for your friends on MemeDeck and send them a friend request!</p>
                    <button className="add-media-btn" onClick={() => setSubTab('discover')}>
                      <Search size={16} />
                      <span>Search Members</span>
                    </button>
                  </div>
                ) : (
                  <div className="community-user-grid">{friends.map(renderUserCard)}</div>
                )}
              </section>

              {/* 3. Following */}
              {following.length > 0 && (
                <section className="shelf">
                  <h3 className="shelf-title">Creators You Follow ({following.length})</h3>
                  <div className="community-user-grid">{following.map(renderUserCard)}</div>
                </section>
              )}

              {/* 4. Sent Requests */}
              {outgoingRequests.length > 0 && (
                <section className="shelf">
                  <h3 className="shelf-title">
                    Pending Sent Requests ({outgoingRequests.length})
                  </h3>
                  <div className="community-user-grid">
                    {outgoingRequests.map(renderUserCard)}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      )}

      {/* TAB 3: FIND MEMBERS / SEARCH */}
      {subTab === 'discover' && (
        <section className="shelf">
          <div className="community-search-bar">
            <Search size={18} className="community-search-icon" />
            <input
              type="search"
              placeholder="Search members by username..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search members by username"
            />
            {searchQuery && (
              <button
                type="button"
                className="icon-btn"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
              >
                <X size={15} />
              </button>
            )}
          </div>

          {loadingDiscover ? (
            <CommunitySkeleton mode="users" isWakingUp={isWakingUp} />
          ) : discoveredUsers.length === 0 ? (
            <div className="empty-state-card">
              <UserMinus size={38} className="empty-icon" />
              <h3>No members found</h3>
              <p>
                {debouncedQuery
                  ? `No user matches "${debouncedQuery}". Try a different username.`
                  : 'No community members registered yet.'}
              </p>
            </div>
          ) : (
            <div className="community-user-grid">
              {discoveredUsers.map(renderUserCard)}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
