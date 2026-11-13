import { useEffect, useState } from 'react';
import {
  Globe,
  Lock,
  Trash2,
  Plus,
  Loader2,
  FolderPlus,
  Library,
  Pencil,
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

export function LibraryView({ onRequireAuth, onOpenUpload }: LibraryViewProps) {
  const { user } = useAuth();
  const [items, setItems] = useState<UserMediaItem[]>([]);
  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeAddToColId, setActiveAddToColId] = useState<string | null>(null);
  const [colAddSuccess, setColAddSuccess] = useState<string | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<SelectedMediaContext | null>(null);

  const fetchLibrary = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [libRes, colRes] = await Promise.allSettled([
        memedeckApi.getUserLibrary(user.id),
        memedeckApi.getCollections(true),
      ]);

      if (libRes.status === 'fulfilled') {
        setItems(libRes.value.items);
      }
      if (colRes.status === 'fulfilled') {
        setCollections(colRes.value.items);
      }
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLibrary();
  }, [user]);

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

  const handleAddToCollection = async (userMediaId: string, colId: string) => {
    try {
      await memedeckApi.addMediaToCollection(colId, userMediaId);
      setColAddSuccess(userMediaId);
      setActiveAddToColId(null);
      setTimeout(() => setColAddSuccess(null), 2000);
    } catch (err: any) {
      alert(err.message ?? 'Failed to add item to collection');
    }
  };

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

  return (
    <div className="view-container">
      <div className="view-header">
        <div>
          <h2>My Media Library</h2>
          <p className="view-subtitle">
            All original uploads and smart-forked assets curated in your personal account.
          </p>
        </div>

        <button className="add-media-btn" onClick={onOpenUpload}>
          <Plus size={16} />
          <span>Upload Media</span>
        </button>
      </div>

      {loading ? (
        <div className="loading-state">
          <Loader2 size={32} className="spin" />
          <p>Loading your library...</p>
        </div>
      ) : items.length === 0 ? (
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
      ) : (
        <div className="media-grid">
          {items.map((item) => {
            const media = item.media;
            if (!media) return null;
            const title = item.custom_title || media.original_title || 'Untitled Meme';

            return (
              <div
                key={item.id}
                className="media-card"
                onClick={() =>
                  setSelectedMedia({
                    media,
                    userMedia: item,
                    isOwner: true,
                  })
                }
              >
                <div className="media-card-thumb">
                  <MediaThumbnail url={media.file_url} fileType={media.file_type} />
                </div>

                <div className="media-card-body">
                  <h4 className="card-meme-title" title={title}>
                    {title}
                  </h4>

                  {item.tags && item.tags.length > 0 && (
                    <div className="card-tags-row">
                      {item.tags.slice(0, 3).map((t) => (
                        <span key={t} className="card-mini-tag">
                          #{t}
                        </span>
                      ))}
                      {item.tags.length > 3 && (
                        <span className="card-more-tags">+{item.tags.length - 3}</span>
                      )}
                    </div>
                  )}

                  <div className="media-card-meta">
                    <button
                      className={`privacy-pill ${item.is_public ? 'public' : 'private'}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTogglePrivacy(item);
                      }}
                      title="Click to toggle Public / Private"
                    >
                      {item.is_public ? <Globe size={12} /> : <Lock size={12} />}
                      <span>{item.is_public ? 'Public' : 'Private'}</span>
                    </button>

                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="icon-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedMedia({
                            media,
                            userMedia: item,
                            isOwner: true,
                            initialEditMode: true,
                          });
                        }}
                        title="Edit title, tags and privacy"
                      >
                        <Pencil size={14} />
                      </button>

                      <button
                        className="icon-btn danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(item.id);
                        }}
                        title="Remove from library"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Add to collection button & menu */}
                  <div className="collection-add-wrapper" onClick={(e) => e.stopPropagation()}>
                    {colAddSuccess === item.id ? (
                      <span className="success-tag">Added to collection!</span>
                    ) : activeAddToColId === item.id ? (
                      <div className="collection-dropdown">
                        <span className="dropdown-label">Select deck:</span>
                        {collections.length === 0 ? (
                          <span className="no-cols">No collections created yet</span>
                        ) : (
                          collections.map((col) => (
                            <button
                              key={col.id}
                              className="col-select-item"
                              onClick={() => handleAddToCollection(item.id, col.id)}
                            >
                              {col.title}
                            </button>
                          ))
                        )}
                        <button
                          className="cancel-link"
                          onClick={() => setActiveAddToColId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        className="small-action-btn outline full-width"
                        onClick={() => setActiveAddToColId(item.id)}
                      >
                        <FolderPlus size={13} />
                        <span>Add to Collection</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Media Detail Inspection Modal */}
      <MediaDetailModal
        selected={selectedMedia}
        collections={collections}
        onClose={() => setSelectedMedia(null)}
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
