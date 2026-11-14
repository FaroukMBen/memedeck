import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import {
  BookmarkPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  Plus,
  Compass,
  Search,
  ThumbsUp,
  ThumbsDown,
  X,
} from 'lucide-react';
import { memedeckApi, type ActivityItem, type MediaItem } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useFeedback } from '../context/FeedbackContext';
import { hueFromString } from '../lib/hue';
import { MediaDetailModal, type SelectedMediaContext } from './MediaDetailModal';
import { AddToLibraryModal } from './AddToLibraryModal';
import { MediaThumbnail } from './MediaThumbnail';
import { ActivityList } from './ActivityList';

interface DiscoverViewProps {
  onRequireAuth: () => void;
  onOpenUpload: () => void;
  onNavigateToUser?: (userId: string) => void;
}

type FeedTab = 'new' | 'top';
type TypeFilter = 'all' | 'image' | 'video';

const PAGE_SIZE = 24;
const FEATURED_COUNT = 5;
const FEATURED_ROTATE_MS = 6000;
const MAX_TAG_TILES = 8;
const SEARCH_DEBOUNCE_MS = 350;

function score(item: MediaItem): number {
  return item.likes_count - item.dislikes_count;
}

function titleOf(item: MediaItem): string {
  return item.original_title || 'Untitled Meme';
}

export function DiscoverView({ onRequireAuth, onOpenUpload, onNavigateToUser }: DiscoverViewProps) {
  const { user } = useAuth();
  const { notify } = useFeedback();

  // Feed (sorted, searched and paginated by the server)
  const [medias, setMedias] = useState<MediaItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState<TypeFilter>('all');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [feedTab, setFeedTab] = useState<FeedTab>('new');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const requestId = useRef(0);

  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [selectedMedia, setSelectedMedia] = useState<SelectedMediaContext | null>(null);
  const [mediaToAddToLibrary, setMediaToAddToLibrary] = useState<MediaItem | null>(null);

  // Home shelves, loaded once: featured carousel, tag tiles, friends activity
  const [featured, setFeatured] = useState<MediaItem[]>([]);
  const [tagTiles, setTagTiles] = useState<[string, number][]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [featuredPaused, setFeaturedPaused] = useState(false);

  const isInLibrary = (item: MediaItem) => item.in_library || addedIds.has(item.id);

  // Debounce typing before it becomes a server query
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchPage = async (offset: number) => {
    const id = ++requestId.current;
    if (offset === 0) setLoading(true);
    else setLoadingMore(true);

    try {
      const res = await memedeckApi.getPublicMedias({
        fileType: filter === 'all' ? undefined : filter,
        tag: activeTag ?? undefined,
        sort: feedTab,
        q: query || undefined,
        limit: PAGE_SIZE,
        offset,
      });
      // A newer request (filters changed meanwhile) supersedes this one
      if (id !== requestId.current) return;
      setMedias((prev) => (offset === 0 ? res.items : [...prev, ...res.items]));
      setHasMore(res.has_more);
    } catch (err: any) {
      if (id !== requestId.current) return;
      if (offset === 0) setMedias([]);
      setHasMore(false);
      notify(err.message ?? 'Failed to load memes', 'error');
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  };

  useEffect(() => {
    fetchPage(0);
  }, [filter, activeTag, feedTab, query, user?.id]);

  const fetchShelves = async () => {
    try {
      const res = await memedeckApi.getPublicMedias({ sort: 'top', limit: 60 });
      setFeatured(res.items.slice(0, FEATURED_COUNT));

      const tagCounts = new Map<string, number>();
      for (const item of res.items) {
        for (const tag of item.tags ?? []) {
          tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
        }
      }
      setTagTiles(
        [...tagCounts.entries()]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, MAX_TAG_TILES)
      );
    } catch {
      setFeatured([]);
    }
  };

  useEffect(() => {
    fetchShelves();
  }, [user?.id]);

  useEffect(() => {
    if (!user) {
      setActivity([]);
      return;
    }
    memedeckApi
      .getFeed(8)
      .then((res) => setActivity(res.items))
      .catch(() => setActivity([]));
  }, [user?.id]);

  const isBrowsing = activeTag !== null || query !== '';
  const showFeatured = !isBrowsing && featured.length >= 3;
  const featuredItem = featured[featuredIndex % Math.max(featured.length, 1)];

  useEffect(() => {
    if (!showFeatured || featuredPaused || selectedMedia || mediaToAddToLibrary) return;
    const timer = setInterval(
      () => setFeaturedIndex((i) => (i + 1) % featured.length),
      FEATURED_ROTATE_MS
    );
    return () => clearInterval(timer);
  }, [showFeatured, featuredPaused, featured.length, selectedMedia, mediaToAddToLibrary]);

  const applyReaction = (
    mediaId: string,
    likes: number,
    dislikes: number,
    reaction: 1 | -1 | null
  ) => {
    const patch = (m: MediaItem) =>
      m.id === mediaId
        ? { ...m, likes_count: likes, dislikes_count: dislikes, user_reaction: reaction }
        : m;
    setMedias((prev) => prev.map(patch));
    setFeatured((prev) => prev.map(patch));
  };

  const requestAdd = (e: MouseEvent, item: MediaItem) => {
    e.stopPropagation();
    if (!user) {
      onRequireAuth();
      return;
    }
    if (!isInLibrary(item)) {
      setMediaToAddToLibrary(item);
    }
  };

  const handleReaction = async (
    e: MouseEvent,
    mediaId: string,
    currentReaction: 1 | -1 | null,
    targetType: 1 | -1
  ) => {
    e.stopPropagation();
    if (!user) {
      onRequireAuth();
      return;
    }

    const nextType = currentReaction === targetType ? 0 : targetType;
    try {
      const res = await memedeckApi.reactToMedia(mediaId, nextType);
      applyReaction(mediaId, res.likes_count, res.dislikes_count, res.user_reaction);
    } catch (err: any) {
      notify(err.message ?? 'Failed to vote', 'error');
    }
  };

  const addButton = (item: MediaItem) => {
    const owned = isInLibrary(item);
    return (
      <button
        className={`fork-btn ${owned ? 'forked' : ''}`}
        onClick={(e) => requestAdd(e, item)}
        disabled={owned}
        title={owned ? 'This meme is already in your library' : 'Add to your library'}
      >
        {owned ? (
          <>
            <Check size={14} />
            <span>Already in your library</span>
          </>
        ) : (
          <>
            <BookmarkPlus size={14} />
            <span>Add to Library</span>
          </>
        )}
      </button>
    );
  };

  const openDetail = (item: MediaItem) =>
    setSelectedMedia({ media: { ...item, in_library: isInLibrary(item) } });

  return (
    <div className="view-container">
      <div className="view-header">
        <div>
          <h2>Discover</h2>
          <p className="view-subtitle">
            Public memes shared by the community. Add any of them to your library without
            duplicating cloud storage.
          </p>
        </div>

        <div className="view-header-actions">
          <div className="lib-search discover-search">
            <Search size={15} />
            <input
              type="search"
              placeholder="Search all public memes"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search public memes"
            />
          </div>
          <button
            className="icon-btn"
            onClick={() => {
              fetchPage(0);
              fetchShelves();
            }}
            title="Refresh feed"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Featured carousel */}
      {showFeatured && featuredItem && (
        <section className="shelf">
          <h3 className="shelf-title">Featured &amp; Popular</h3>
          <div
            className="featured-stage"
            onMouseEnter={() => setFeaturedPaused(true)}
            onMouseLeave={() => setFeaturedPaused(false)}
          >
            <button
              className="featured-arrow"
              onClick={() =>
                setFeaturedIndex((i) => (i - 1 + featured.length) % featured.length)
              }
              aria-label="Previous featured meme"
            >
              <ChevronLeft size={22} />
            </button>

            <div className="featured-card" key={featuredItem.id} onClick={() => openDetail(featuredItem)}>
              <div className="featured-media">
                <MediaThumbnail
                  url={featuredItem.file_url}
                  fileType={featuredItem.file_type}
                  sourceFormat={featuredItem.source_format}
                  autoPlay
                  loop
                  muted
                />
              </div>

              <div className="featured-side">
                <span className="featured-kicker">
                  {score(featuredItem) > 0 ? 'Popular with the community' : 'Fresh upload'}
                </span>
                <h3 title={titleOf(featuredItem)}>{titleOf(featuredItem)}</h3>

                {featuredItem.tags && featuredItem.tags.length > 0 && (
                  <div className="card-tag-chips">
                    {featuredItem.tags.slice(0, 5).map((t) => (
                      <span key={t} className="card-tag-pill">
                        #{t}
                      </span>
                    ))}
                  </div>
                )}

                <div className="featured-stats">
                  <span>
                    <ThumbsUp size={14} /> {featuredItem.likes_count}
                  </span>
                  <span>
                    <ThumbsDown size={14} /> {featuredItem.dislikes_count}
                  </span>
                  <span>
                    {new Date(featuredItem.created_at).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </div>

                {addButton(featuredItem)}
              </div>
            </div>

            <button
              className="featured-arrow"
              onClick={() => setFeaturedIndex((i) => (i + 1) % featured.length)}
              aria-label="Next featured meme"
            >
              <ChevronRight size={22} />
            </button>
          </div>

          <div className="featured-dots">
            {featured.map((item, idx) => (
              <button
                key={item.id}
                className={idx === featuredIndex % featured.length ? 'active' : ''}
                onClick={() => setFeaturedIndex(idx)}
                aria-label={`Show featured meme ${idx + 1}`}
              />
            ))}
          </div>
        </section>
      )}

      {/* Friends and following */}
      {!isBrowsing && activity.length > 0 && (
        <section className="shelf">
          <h3 className="shelf-title">From your circle</h3>
          <ActivityList items={activity} onNavigateToUser={onNavigateToUser} />
        </section>
      )}

      {/* Browse by tag */}
      {tagTiles.length > 0 && (
        <section className="shelf">
          <h3 className="shelf-title">Browse by Tag</h3>
          <div className="tag-tile-row">
            {tagTiles.map(([tag, count]) => (
              <button
                key={tag}
                className={`tag-tile ${activeTag === tag ? 'active' : ''}`}
                style={{ '--tile-hue': hueFromString(tag) } as CSSProperties}
                onClick={() => setActiveTag(activeTag === tag ? null : tag)}
              >
                <span className="tag-tile-name">#{tag}</span>
                <span className="tag-tile-count">
                  {count} meme{count > 1 ? 's' : ''}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Feed */}
      <section className="shelf">
        <div className="feed-bar">
          <div className="feed-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={feedTab === 'new'}
              className={`feed-tab ${feedTab === 'new' ? 'active' : ''}`}
              onClick={() => setFeedTab('new')}
            >
              New Releases
            </button>
            <button
              role="tab"
              aria-selected={feedTab === 'top'}
              className={`feed-tab ${feedTab === 'top' ? 'active' : ''}`}
              onClick={() => setFeedTab('top')}
            >
              Top Rated
            </button>

            {activeTag && (
              <button
                className="active-tag-chip"
                onClick={() => setActiveTag(null)}
                title="Clear tag filter"
              >
                #{activeTag}
                <X size={13} />
              </button>
            )}
          </div>

          <div className="filter-pill-group">
            <button
              className={`filter-pill ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
            >
              All
            </button>
            <button
              className={`filter-pill ${filter === 'image' ? 'active' : ''}`}
              onClick={() => setFilter('image')}
            >
              Images
            </button>
            <button
              className={`filter-pill ${filter === 'video' ? 'active' : ''}`}
              onClick={() => setFilter('video')}
            >
              Videos & GIFs
            </button>
          </div>
        </div>

        {loading ? (
          <div className="loading-state">
            <Loader2 size={32} className="spin" />
            <p>Loading community media...</p>
          </div>
        ) : medias.length === 0 && !isBrowsing && filter === 'all' ? (
          <div className="empty-state-card">
            <Compass size={40} className="empty-icon" />
            <h3>No public memes yet</h3>
            <p>Be the first to upload and share a meme with the community!</p>
            <button className="add-media-btn" onClick={onOpenUpload}>
              <Plus size={16} />
              <span>Upload the First Meme</span>
            </button>
          </div>
        ) : medias.length === 0 ? (
          <div className="empty-state-card">
            <Search size={36} className="empty-icon" />
            <h3>Nothing matches</h3>
            <p>Try another tag, type or search term.</p>
            <button
              className="small-action-btn"
              onClick={() => {
                setActiveTag(null);
                setSearch('');
                setFilter('all');
              }}
            >
              Clear filters
            </button>
          </div>
        ) : (
          <>
            <div className="media-grid">
              {medias.map((item) => {
                const title = titleOf(item);

                return (
                  <div key={item.id} className="media-card" onClick={() => openDetail(item)}>
                    <div className="media-card-thumb">
                      <MediaThumbnail
                        url={item.file_url}
                        fileType={item.file_type}
                        sourceFormat={item.source_format}
                      />
                    </div>

                    <div className="media-card-body">
                      <h4 className="card-meme-title" title={title}>
                        {title}
                      </h4>

                      <div className="media-card-meta">
                        <span className="media-date">
                          {new Date(item.created_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>

                        {/* Like / Dislike reactions */}
                        <div className="card-reactions-bar">
                          <button
                            className={`mini-vote-btn like ${item.user_reaction === 1 ? 'active' : ''}`}
                            onClick={(e) => handleReaction(e, item.id, item.user_reaction, 1)}
                            title="Like"
                          >
                            <ThumbsUp size={12} />
                            <span>{item.likes_count}</span>
                          </button>

                          <button
                            className={`mini-vote-btn dislike ${item.user_reaction === -1 ? 'active' : ''}`}
                            onClick={(e) => handleReaction(e, item.id, item.user_reaction, -1)}
                            title="Dislike"
                          >
                            <ThumbsDown size={12} />
                            <span>{item.dislikes_count}</span>
                          </button>
                        </div>
                      </div>

                      {item.tags && item.tags.length > 0 && (
                        <div className="card-tag-chips">
                          {item.tags.slice(0, 3).map((t) => (
                            <button
                              key={t}
                              className="card-tag-pill clickable"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveTag(t);
                              }}
                              title={`Browse #${t}`}
                            >
                              #{t}
                            </button>
                          ))}
                          {item.tags.length > 3 && (
                            <span className="card-tag-more">+{item.tags.length - 3}</span>
                          )}
                        </div>
                      )}

                      {addButton(item)}
                    </div>
                  </div>
                );
              })}
            </div>

            {hasMore && (
              <button
                className="small-action-btn load-more-btn"
                onClick={() => fetchPage(medias.length)}
                disabled={loadingMore}
              >
                {loadingMore ? <Loader2 size={15} className="spin" /> : <Plus size={15} />}
                <span>{loadingMore ? 'Loading...' : 'Load more'}</span>
              </button>
            )}
          </>
        )}
      </section>

      {/* Media Detail Inspection Modal */}
      <MediaDetailModal
        selected={selectedMedia}
        onClose={() => setSelectedMedia(null)}
        onRequireAuth={onRequireAuth}
        onNavigateToUser={onNavigateToUser}
        onForked={(id) => setAddedIds((prev) => new Set(prev).add(id))}
        onReactionUpdated={applyReaction}
      />

      {/* Separate Dedicated Add to Library Dialog Window */}
      <AddToLibraryModal
        media={mediaToAddToLibrary}
        isOpen={!!mediaToAddToLibrary}
        onClose={() => setMediaToAddToLibrary(null)}
        onAdded={(id) => {
          setAddedIds((prev) => new Set(prev).add(id));
        }}
        onRequireAuth={onRequireAuth}
      />
    </div>
  );
}
