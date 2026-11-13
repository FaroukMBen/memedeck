import { useEffect, useState } from 'react';
import { BookmarkPlus, Check, Loader2, RefreshCw, Plus, Compass, ThumbsUp, ThumbsDown } from 'lucide-react';
import { memedeckApi, type MediaItem } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { MediaDetailModal, type SelectedMediaContext } from './MediaDetailModal';
import { AddToLibraryModal } from './AddToLibraryModal';
import { MediaThumbnail } from './MediaThumbnail';

interface DiscoverViewProps {
  onRequireAuth: () => void;
  onOpenUpload: () => void;
  onNavigateToUser?: (userId: string) => void;
}

export function DiscoverView({ onRequireAuth, onOpenUpload, onNavigateToUser }: DiscoverViewProps) {
  const { user } = useAuth();
  const [medias, setMedias] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'image' | 'video'>('all');
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [selectedMedia, setSelectedMedia] = useState<SelectedMediaContext | null>(null);
  const [mediaToAddToLibrary, setMediaToAddToLibrary] = useState<MediaItem | null>(null);

  const fetchMedias = async () => {
    setLoading(true);
    try {
      const typeParam = filter === 'all' ? undefined : filter;
      const res = await memedeckApi.getPublicMedias(typeParam);
      setMedias(res.items);
    } catch {
      setMedias([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMedias();
  }, [filter]);

  const handleReaction = async (e: React.MouseEvent, mediaId: string, currentReaction: 1 | -1 | null, targetType: 1 | -1) => {
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

  return (
    <div className="view-container">
      <div className="view-header">
        <div>
          <h2>Discover Community Memes</h2>
          <p className="view-subtitle">
            Browse public media assets shared by the community. Click &quot;Fork&quot; to add any meme to
            your library without duplicating cloud storage.
          </p>
        </div>

        <div className="view-header-actions">
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

          <button className="icon-btn" onClick={fetchMedias} title="Refresh feed">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading-state">
          <Loader2 size={32} className="spin" />
          <p>Loading community media...</p>
        </div>
      ) : medias.length === 0 ? (
        <div className="empty-state-card">
          <Compass size={40} className="empty-icon" />
          <h3>No public memes yet</h3>
          <p>Be the first to upload and share a meme with the community!</p>
          <button className="add-media-btn" onClick={onOpenUpload}>
            <Plus size={16} />
            <span>Upload the First Meme</span>
          </button>
        </div>
      ) : (
        <div className="media-grid">
          {medias.map((item) => {
            const isAdded = addedIds.has(item.id);
            const title = item.original_title || 'Untitled Meme';

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

                    <button
                      className={`fork-btn ${isAdded ? 'forked' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!user) {
                          onRequireAuth();
                          return;
                        }
                        if (!isAdded) {
                          setMediaToAddToLibrary(item);
                        }
                      }}
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
                  </div>
                </div>
              );
            })}
        </div>
      )}

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
