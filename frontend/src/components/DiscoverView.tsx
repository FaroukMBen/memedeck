import { useEffect, useMemo, useState, type CSSProperties, type MouseEvent } from 'react';
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
import { memedeckApi, type MediaItem } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { hueFromString } from '../lib/hue';
import { MediaDetailModal, type SelectedMediaContext } from './MediaDetailModal';
import { AddToLibraryModal } from './AddToLibraryModal';
import { MediaThumbnail } from './MediaThumbnail';

interface DiscoverViewProps {
  onRequireAuth: () => void;
  onOpenUpload: () => void;
  onNavigateToUser?: (userId: string) => void;
}

type FeedTab = 'new' | 'top';

const FEATURED_COUNT = 5;
const FEATURED_ROTATE_MS = 6000;
const MAX_TAG_TILES = 8;

function score(item: MediaItem): number {
  return item.likes_count - item.dislikes_count;
}

function titleOf(item: MediaItem): string {
  return item.original_title || 'Untitled Meme';
}

export function DiscoverView({ onRequireAuth, onOpenUpload, onNavigateToUser }: DiscoverViewProps) {
  const { user } = useAuth();
  const [medias, setMedias] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'image' | 'video'>('all');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [feedTab, setFeedTab] = useState<FeedTab>('new');
  const [search, setSearch] = useState('');
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [selectedMedia, setSelectedMedia] = useState<SelectedMediaContext | null>(null);
  const [mediaToAddToLibrary, setMediaToAddToLibrary] = useState<MediaItem | null>(null);

  // Tag tiles come from the unfiltered feed so they don't vanish once a tag is picked
  const [tagTiles, setTagTiles] = useState<[string, number][]>([]);

  // Featured carousel
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [featuredPaused, setFeaturedPaused] = useState(false);

  const fetchMedias = async () => {
    setLoading(true);
    try {
      const typeParam = filter === 'all' ? undefined : filter;
      const res = await memedeckApi.getPublicMedias(typeParam, activeTag ?? undefined);
      setMedias(res.items);

      if (!activeTag) {
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
      }
    } catch {
      setMedias([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMedias();
  }, [filter, activeTag]);

  const isBrowsing = activeTag !== null || search.trim() !== '';

  const featured = useMemo(
    () =>
      [...medias]
        .sort(
          (a, b) =>
            score(b) - score(a) ||
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
        .slice(0, FEATURED_COUNT),
    [medias]
  );
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

  const feedItems = useMemo(() => {
    const q = search.trim().toLowerCase().replace(/^#/, '');
    const list = q
      ? medias.filter(
          (m) =>
            titleOf(m).toLowerCase().includes(q) ||
            (m.tags ?? []).some((t) => t.toLowerCase().includes(q))
        )
      : [...medias];

    if (feedTab === 'top') {
      list.sort((a, b) => score(b) - score(a));
    }
    return list;
  }, [medias, search, feedTab]);

  const requestAdd = (e: MouseEvent, item: MediaItem) => {
    e.stopPropagation();
    if (!user) {
      onRequireAuth();
      return;
    }
    if (!addedIds.has(item.id)) {
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
      setMedias((prev) =>
        prev.map((m) =>
          m.id === mediaId
            ? {
                ...m,
                likes_count: res.likes_count,
                dislikes_count: res.dislikes_count,
                user_reaction: res.user_reaction,
              }
            : m
        )
      );
    } catch (err: any) {
      alert(err.message ?? 'Failed to vote');
    }
  };

  const addButton = (item: MediaItem) => {
    const isAdded = addedIds.has(item.id);
    return (
      <button
        className={`fork-btn ${isAdded ? 'forked' : ''}`}
        onClick={(e) => requestAdd(e, item)}
        title={isAdded ? 'In your library' : 'Add to your library'}
      >
        {isAdded ? (
          <>
            <Check size={14} />
            <span>In Library</span>
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
              placeholder="Search title or tag"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search public memes"
            />
          </div>
          <button className="icon-btn" onClick={fetchMedias} title="Refresh feed">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Featured carousel */}
      {!loading && showFeatured && featuredItem && (
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

            <div
              className="featured-card"
              key={featuredItem.id}
              onClick={() => setSelectedMedia({ media: featuredItem })}
            >
              <div className="featured-media">
                <MediaThumbnail
                  url={featuredItem.file_url}
                  fileType={featuredItem.file_type}
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
        ) : medias.length === 0 && !isBrowsing ? (
          <div className="empty-state-card">
            <Compass size={40} className="empty-icon" />
            <h3>No public memes yet</h3>
            <p>Be the first to upload and share a meme with the community!</p>
            <button className="add-media-btn" onClick={onOpenUpload}>
              <Plus size={16} />
              <span>Upload the First Meme</span>
            </button>
          </div>
        ) : feedItems.length === 0 ? (
          <div className="empty-state-card">
            <Search size={36} className="empty-icon" />
            <h3>Nothing matches</h3>
            <p>Try another tag or search term.</p>
            <button
              className="small-action-btn"
              onClick={() => {
                setActiveTag(null);
                setSearch('');
              }}
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="media-grid">
            {feedItems.map((item) => {
              const title = titleOf(item);

              return (
                <div
                  key={item.id}
                  className="media-card"
                  onClick={() => setSelectedMedia({ media: item })}
                >
                  <div className="media-card-thumb">
                    <MediaThumbnail url={item.file_url} fileType={item.file_type} />
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
        )}
      </section>

      {/* Media Detail Inspection Modal */}
      <MediaDetailModal
        selected={selectedMedia}
        onClose={() => setSelectedMedia(null)}
        onRequireAuth={onRequireAuth}
        onNavigateToUser={onNavigateToUser}
        onForked={(id) => setAddedIds((prev) => new Set(prev).add(id))}
        onReactionUpdated={(id, likes, dislikes, reaction) => {
          setMedias((prev) =>
            prev.map((m) =>
              m.id === id
                ? {
                    ...m,
                    likes_count: likes,
                    dislikes_count: dislikes,
                    user_reaction: reaction,
                  }
                : m
            )
          );
        }}
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
