import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Globe,
  Lock,
  Trash2,
  Plus,
  Loader2,
  Library,
  Pencil,
  Search,
  Film,
  Image as ImageIcon,
  LayoutGrid,
  Columns3,
  FolderHeart,
  Hash,
  X,
} from 'lucide-react';
import {
  memedeckApi,
  type UserMediaItem,
  type CollectionItem,
} from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { MediaDetailModal, type SelectedMediaContext } from './MediaDetailModal';
import { MediaThumbnail } from './MediaThumbnail';

interface LibraryViewProps {
  onRequireAuth: () => void;
  onOpenUpload: () => void;
}

type SortKey = 'added' | 'title' | 'likes';
type ViewMode = 'tiles' | 'mosaic';

const VIEW_MODE_KEY = 'memedeck.library.viewMode';
const MAX_SIDEBAR_TAGS = 12;

function readViewMode(): ViewMode {
  try {
    return localStorage.getItem(VIEW_MODE_KEY) === 'mosaic' ? 'mosaic' : 'tiles';
  } catch {
    return 'tiles';
  }
}

function titleOf(item: UserMediaItem): string {
  return item.custom_title || item.media?.original_title || 'Untitled Meme';
}

function isVideoItem(item: UserMediaItem): boolean {
  return item.media?.file_type.startsWith('video/') ?? false;
}

export function LibraryView({ onRequireAuth, onOpenUpload }: LibraryViewProps) {
  const { user } = useAuth();
  const [items, setItems] = useState<UserMediaItem[]>([]);
  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMedia, setSelectedMedia] = useState<SelectedMediaContext | null>(null);

  // Sidebar filter: 'all' | 'image' | 'video' | 'public' | 'private' | 'col:<id>' | 'tag:<tag>'
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('added');
  const [viewMode, setViewMode] = useState<ViewMode>(readViewMode);

  // Members of the collection currently selected in the sidebar
  const [colMembers, setColMembers] = useState<Set<string> | null>(null);
  const [colLoading, setColLoading] = useState(false);

  const refreshCollections = async () => {
    try {
      const res = await memedeckApi.getCollections(true);
      setCollections(res.items);
    } catch {
      /* keep the previous list */
    }
  };

  const fetchLibrary = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [libRes] = await Promise.allSettled([
        memedeckApi.getUserLibrary(user.id),
        refreshCollections(),
      ]);
      if (libRes.status === 'fulfilled') {
        setItems(libRes.value.items);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLibrary();
  }, [user]);

  useEffect(() => {
    if (!filter.startsWith('col:')) {
      setColMembers(null);
      return;
    }
    let cancelled = false;
    setColLoading(true);
    setColMembers(null);
    memedeckApi
      .getCollectionDetails(filter.slice(4))
      .then((res) => {
        if (!cancelled) setColMembers(new Set(res.items.map((i) => i.user_media_id)));
      })
      .catch(() => {
        if (!cancelled) setColMembers(new Set());
      })
      .finally(() => {
        if (!cancelled) setColLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filter]);

  const changeViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode);
    } catch {
      /* preference just won't persist */
    }
  };

  const handleTogglePrivacy = async (item: UserMediaItem) => {
    try {
      const updated = await memedeckApi.updateUserMediaPrivacy(item.id, !item.is_public);
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, is_public: updated.is_public } : i))
      );
    } catch (err: any) {
      alert(err.message ?? 'Failed to update privacy');
    }
  };

  const handleDelete = async (userMediaId: string) => {
    if (
      !confirm(
        'Remove this media from your library? If no other user possesses it, it will be automatically cleaned up from storage.'
      )
    ) {
      return;
    }

    try {
      await memedeckApi.deleteUserMedia(userMediaId);
      setItems((prev) => prev.filter((i) => i.id !== userMediaId));
    } catch (err: any) {
      alert(err.message ?? 'Failed to remove item');
    }
  };

  const validItems = useMemo(() => items.filter((i) => i.media), [items]);

  const counts = useMemo(
    () => ({
      all: validItems.length,
      image: validItems.filter((i) => !isVideoItem(i)).length,
      video: validItems.filter(isVideoItem).length,
      public: validItems.filter((i) => i.is_public).length,
      private: validItems.filter((i) => !i.is_public).length,
    }),
    [validItems]
  );

  const topTags = useMemo(() => {
    const tagCounts = new Map<string, number>();
    for (const item of validItems) {
      for (const tag of item.tags ?? []) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
    }
    return [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, MAX_SIDEBAR_TAGS);
  }, [validItems]);

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase().replace(/^#/, '');
    const list = validItems.filter((item) => {
      if (filter === 'image' && isVideoItem(item)) return false;
      if (filter === 'video' && !isVideoItem(item)) return false;
      if (filter === 'public' && !item.is_public) return false;
      if (filter === 'private' && item.is_public) return false;
      if (filter.startsWith('col:') && !colMembers?.has(item.id)) return false;
      if (filter.startsWith('tag:') && !item.tags?.includes(filter.slice(4))) return false;
      if (!q) return true;
      return (
        titleOf(item).toLowerCase().includes(q) ||
        (item.tags ?? []).some((t) => t.toLowerCase().includes(q))
      );
    });

    return list.sort((a, b) => {
      if (sortKey === 'title') return titleOf(a).localeCompare(titleOf(b));
      if (sortKey === 'likes') {
        return (b.media?.likes_count ?? 0) - (a.media?.likes_count ?? 0);
      }
      return new Date(b.added_at).getTime() - new Date(a.added_at).getTime();
    });
  }, [validItems, filter, colMembers, search, sortKey]);

  const filterLabel = (() => {
    if (filter === 'image') return 'Images';
    if (filter === 'video') return 'Videos & GIFs';
    if (filter === 'public') return 'Public';
    if (filter === 'private') return 'Private';
    if (filter.startsWith('tag:')) return `#${filter.slice(4)}`;
    if (filter.startsWith('col:')) {
      return collections.find((c) => c.id === filter.slice(4))?.title ?? 'Collection';
    }
    return 'All Media';
  })();

  if (!user) {
    return (
      <div className="view-container">
        <div className="empty-state-card">
          <Library size={40} className="empty-icon" />
          <h2>My Library</h2>
          <p>Connect your account to access your curated library, forked memes, and decks.</p>
          <button className="submit-btn" style={{ maxWidth: 220 }} onClick={onRequireAuth}>
            Connect or Sign Up
          </button>
        </div>
      </div>
    );
  }

  const navItem = (key: string, icon: ReactNode, label: string, count?: number) => (
    <button
      key={key}
      className={`lib-nav-item ${filter === key ? 'active' : ''}`}
      onClick={() => setFilter(key)}
      title={label}
    >
      {icon}
      <span className="lib-nav-label">{label}</span>
      {count !== undefined && <span className="lib-nav-count">{count}</span>}
    </button>
  );

  return (
    <div className="library-layout">
      <aside className="library-sidebar">
        <div className="lib-search">
          <Search size={15} />
          <input
            type="search"
            placeholder="Search title or tag"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search your library"
          />
        </div>

        <div className="lib-nav-section">
          <span className="lib-nav-heading">My Library</span>
          {navItem('all', <Library size={15} />, 'All Media', counts.all)}
          {navItem('image', <ImageIcon size={15} />, 'Images', counts.image)}
          {navItem('video', <Film size={15} />, 'Videos & GIFs', counts.video)}
          {navItem('public', <Globe size={15} />, 'Public', counts.public)}
          {navItem('private', <Lock size={15} />, 'Private', counts.private)}
        </div>

        <div className="lib-nav-section">
          <span className="lib-nav-heading">Collections ({collections.length})</span>
          {collections.length === 0 ? (
            <span className="lib-nav-empty">No collections yet</span>
          ) : (
            collections.map((col) =>
              navItem(`col:${col.id}`, <FolderHeart size={15} />, col.title, col.item_count)
            )
          )}
        </div>

        {topTags.length > 0 && (
          <div className="lib-nav-section">
            <span className="lib-nav-heading">Top Tags</span>
            {topTags.map(([tag, count]) => navItem(`tag:${tag}`, <Hash size={15} />, tag, count))}
          </div>
        )}
      </aside>

      <section className="library-main">
        <div className="lib-toolbar">
          <h2 className="lib-toolbar-title">
            {filterLabel}
            <span className="lib-toolbar-count">
              ({visibleItems.length}/{counts.all})
            </span>
            {filter !== 'all' && (
              <button
                className="icon-btn"
                onClick={() => setFilter('all')}
                title="Clear filter"
                aria-label="Clear filter"
              >
                <X size={15} />
              </button>
            )}
          </h2>

          <div className="lib-toolbar-actions">
            <label className="lib-sort">
              <span>Sort by</span>
              <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
                <option value="added">Date added</option>
                <option value="title">Title</option>
                <option value="likes">Most liked</option>
              </select>
            </label>

            <div className="filter-pill-group" role="group" aria-label="Layout">
              <button
                className={`filter-pill icon-only ${viewMode === 'tiles' ? 'active' : ''}`}
                onClick={() => changeViewMode('tiles')}
                title="Tile grid"
                aria-label="Tile grid"
              >
                <LayoutGrid size={15} />
              </button>
              <button
                className={`filter-pill icon-only ${viewMode === 'mosaic' ? 'active' : ''}`}
                onClick={() => changeViewMode('mosaic')}
                title="Uncropped mosaic"
                aria-label="Uncropped mosaic"
              >
                <Columns3 size={15} />
              </button>
            </div>

            <button className="add-media-btn" onClick={onOpenUpload}>
              <Plus size={16} />
              <span>Upload</span>
            </button>
          </div>
        </div>

        {loading || colLoading ? (
          <div className="loading-state">
            <Loader2 size={32} className="spin" />
            <p>Loading your library...</p>
          </div>
        ) : counts.all === 0 ? (
          <div className="empty-state-card">
            <Library size={40} className="empty-icon" />
            <h3>Your library is empty</h3>
            <p>
              Upload your own images and videos or browse the Discover feed to fork memes you like!
            </p>
            <button className="add-media-btn" onClick={onOpenUpload}>
              <Plus size={16} />
              <span>Upload Media</span>
            </button>
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="empty-state-card">
            <Search size={36} className="empty-icon" />
            <h3>Nothing matches</h3>
            <p>No media in &quot;{filterLabel}&quot;{search.trim() ? ` for "${search.trim()}"` : ''}.</p>
            <button
              className="small-action-btn"
              onClick={() => {
                setFilter('all');
                setSearch('');
              }}
            >
              Show all media
            </button>
          </div>
        ) : (
          <div className={`lib-grid ${viewMode}`}>
            {visibleItems.map((item) => {
              const media = item.media!;
              const title = titleOf(item);
              const open = (initialEditMode = false) =>
                setSelectedMedia({ media, userMedia: item, isOwner: true, initialEditMode });

              return (
                <div
                  key={item.id}
                  className="lib-tile"
                  role="button"
                  tabIndex={0}
                  onClick={() => open()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.target === e.currentTarget) open();
                  }}
                >
                  <MediaThumbnail url={media.file_url} fileType={media.file_type} showBadge={false} />

                  <div className="lib-tile-flags">
                    {isVideoItem(item) && (
                      <span className="lib-tile-flag" title="Video">
                        <Film size={12} />
                      </span>
                    )}
                    {!item.is_public && (
                      <span className="lib-tile-flag private" title="Private">
                        <Lock size={12} />
                      </span>
                    )}
                  </div>

                  <div className="lib-tile-quick">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTogglePrivacy(item);
                      }}
                      title={item.is_public ? 'Public — click to make private' : 'Private — click to make public'}
                    >
                      {item.is_public ? <Globe size={14} /> : <Lock size={14} />}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        open(true);
                      }}
                      title="Edit title, tags and privacy"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      className="danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(item.id);
                      }}
                      title="Remove from library"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div className="lib-tile-info">
                    <h4 title={title}>{title}</h4>
                    <div className="lib-tile-sub">
                      <span>
                        {new Date(item.added_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                      {item.tags?.slice(0, 2).map((t) => (
                        <span key={t} className="lib-tile-tag">
                          #{t}
                        </span>
                      ))}
                    </div>
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
        collections={collections}
        onClose={() => {
          setSelectedMedia(null);
          // Collection counts may have changed from inside the modal
          refreshCollections();
        }}
        onUserMediaUpdated={(updated) => {
          setItems((prev) =>
            prev.map((i) =>
              i.id === updated.id
                ? {
                    ...i,
                    custom_title: updated.custom_title,
                    tags: updated.tags,
                    is_public: updated.is_public,
                    is_nsfw: updated.is_nsfw,
                  }
                : i
            )
          );
          if (selectedMedia?.userMedia?.id === updated.id) {
            setSelectedMedia((prev) =>
              prev && prev.userMedia
                ? {
                    ...prev,
                    userMedia: {
                      ...prev.userMedia,
                      custom_title: updated.custom_title,
                      tags: updated.tags,
                      is_public: updated.is_public,
                      is_nsfw: updated.is_nsfw,
                    },
                  }
                : null
            );
          }
        }}
        onPrivacyChanged={(userMediaId, isPublic) => {
          setItems((prev) =>
            prev.map((i) => (i.id === userMediaId ? { ...i, is_public: isPublic } : i))
          );
          if (selectedMedia?.userMedia?.id === userMediaId) {
            setSelectedMedia((prev) =>
              prev && prev.userMedia
                ? { ...prev, userMedia: { ...prev.userMedia, is_public: isPublic } }
                : null
            );
          }
        }}
        onDeleted={(userMediaId) => {
          setItems((prev) => prev.filter((i) => i.id !== userMediaId));
          setSelectedMedia(null);
        }}
      />
    </div>
  );
}
