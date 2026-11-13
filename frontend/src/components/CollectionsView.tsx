import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { hueFromString } from '../lib/hue';
import {
  FolderHeart,
  Plus,
  Lock,
  Globe,
  Trash2,
  Dice5,
  ArrowLeft,
  Loader2,
  X,
  Layers,
} from 'lucide-react';
import {
  memedeckApi,
  type CollectionItem,
  type CollectionDetails,
  type CollectionMediaItem,
} from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { MediaThumbnail } from './MediaThumbnail';

interface CollectionsViewProps {
  onRequireAuth: () => void;
}

export function CollectionsView({ onRequireAuth }: CollectionsViewProps) {
  const { user } = useAuth();
  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [filterMine, setFilterMine] = useState(false);
  const [loading, setLoading] = useState(true);

  // Detail view state
  const [selectedColId, setSelectedColId] = useState<string | null>(null);
  const [details, setDetails] = useState<CollectionDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Create Collection modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newIsPublic, setNewIsPublic] = useState(true);
  const [creating, setCreating] = useState(false);

  // Random draw test state
  const [randomDrawResults, setRandomDrawResults] = useState<CollectionMediaItem[] | null>(null);
  const [drawingRandom, setDrawingRandom] = useState(false);

  const fetchCollections = async () => {
    setLoading(true);
    try {
      const res = await memedeckApi.getCollections(filterMine);
      setCollections(res.items);
    } catch {
      setCollections([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCollections();
  }, [filterMine]);

  const handleOpenCollection = async (col: CollectionItem) => {
    setSelectedColId(col.id);
    setLoadingDetails(true);
    try {
      const res = await memedeckApi.getCollectionDetails(col.id);
      setDetails(res);
    } catch (err: any) {
      alert(err.message ?? 'Failed to load collection details');
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) {
      setIsCreateOpen(false);
      onRequireAuth();
      return;
    }

    const title = newTitle.trim();
    if (!title) return;

    setCreating(true);
    try {
      await memedeckApi.createCollection(title, newIsPublic);
      setNewTitle('');
      setIsCreateOpen(false);
      fetchCollections();
    } catch (err: any) {
      alert(err.message ?? 'Failed to create collection');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteCollection = async (colId: string) => {
    if (!confirm('Are you sure you want to delete this collection?')) return;

    try {
      await memedeckApi.deleteCollection(colId);
      setSelectedColId(null);
      setDetails(null);
      fetchCollections();
    } catch (err: any) {
      alert(err.message ?? 'Failed to delete collection');
    }
  };

  const handleDrawRandom = async () => {
    if (!selectedColId) return;

    setDrawingRandom(true);
    try {
      const res = await memedeckApi.getRandomFromCollection(selectedColId, 5);
      setRandomDrawResults(res.items);
    } catch (err: any) {
      alert(err.message ?? 'Failed to draw random items');
    } finally {
      setDrawingRandom(false);
    }
  };

  const handleRemoveItem = async (userMediaId: string) => {
    if (!selectedColId) return;

    try {
      await memedeckApi.removeMediaFromCollection(selectedColId, userMediaId);
      setDetails((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.filter((item) => item.user_media_id !== userMediaId),
            }
          : null
      );
    } catch (err: any) {
      alert(err.message ?? 'Failed to remove item from collection');
    }
  };

  // If viewing details of a specific collection
  if (selectedColId && details) {
    const isOwner = user?.id === details.collection.user_id;

    return (
      <div className="view-container">
        <div className="view-header">
          <div className="header-back-title">
            <button
              className="icon-btn"
              onClick={() => {
                setSelectedColId(null);
                setDetails(null);
                setRandomDrawResults(null);
                // Counts and covers may have changed while inside the deck
                fetchCollections();
              }}
              title="Back to Collections"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h2>{details.collection.title}</h2>
              <div className="col-meta-badges">
                <span className={`privacy-pill ${details.collection.is_public ? 'public' : 'private'}`}>
                  {details.collection.is_public ? <Globe size={12} /> : <Lock size={12} />}
                  <span>{details.collection.is_public ? 'Public Deck' : 'Private Deck'}</span>
                </span>
                <span className="count-pill">{details.items.length} items</span>
              </div>
            </div>
          </div>

          <div className="view-header-actions">
            <button
              className="small-action-btn accent"
              onClick={handleDrawRandom}
              disabled={drawingRandom || details.items.length === 0}
            >
              <Dice5 size={16} />
              <span>{drawingRandom ? 'Drawing...' : 'Draw Random Memes'}</span>
            </button>

            {isOwner && (
              <button
                className="icon-btn danger"
                onClick={() => handleDeleteCollection(details.collection.id)}
                title="Delete collection"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Random Draw Results Banner */}
        {randomDrawResults && (
          <div className="random-draw-banner">
            <div className="random-draw-header">
              <h3>
                <Dice5 size={18} /> Party Draw Result ({randomDrawResults.length} random items drawn)
              </h3>
              <button
                className="icon-btn"
                onClick={() => setRandomDrawResults(null)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="random-draw-grid">
              {randomDrawResults.map((item, idx) => (
                <div key={idx} className="draw-preview-thumb">
                  <MediaThumbnail url={item.file_url} fileType={item.file_type} showBadge={false} />
                </div>
              ))}
            </div>
          </div>
        )}

        {loadingDetails ? (
          <div className="loading-state">
            <Loader2 size={32} className="spin" />
            <p>Loading collection items...</p>
          </div>
        ) : details.items.length === 0 ? (
          <div className="empty-state-card">
            <Layers size={40} className="empty-icon" />
            <h3>This collection is empty</h3>
            <p>Go to your Library and click &quot;Add to Collection&quot; to build this deck.</p>
          </div>
        ) : (
          <div className="lib-grid tiles">
            {details.items.map((item) => (
              <div key={item.user_media_id} className="lib-tile static">
                <MediaThumbnail url={item.file_url} fileType={item.file_type} />
                {isOwner && (
                  <div className="lib-tile-quick">
                    <button
                      className="danger"
                      onClick={() => handleRemoveItem(item.user_media_id)}
                      title="Remove from deck"
                      aria-label="Remove from deck"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="view-container">
      <div className="view-header">
        <div>
          <h2>Modular Collections</h2>
          <p className="view-subtitle">
            Packs and decks curated for specific party games or themes.
          </p>
        </div>

        <div className="view-header-actions">
          {user && (
            <div className="filter-pill-group">
              <button
                className={`filter-pill ${!filterMine ? 'active' : ''}`}
                onClick={() => setFilterMine(false)}
              >
                Public Decks
              </button>
              <button
                className={`filter-pill ${filterMine ? 'active' : ''}`}
                onClick={() => setFilterMine(true)}
              >
                My Decks
              </button>
            </div>
          )}

          <button
            className="add-media-btn"
            onClick={() => {
              if (!user) {
                onRequireAuth();
              } else {
                setIsCreateOpen(true);
              }
            }}
          >
            <Plus size={16} />
            <span>New Collection</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading-state">
          <Loader2 size={32} className="spin" />
          <p>Loading collections...</p>
        </div>
      ) : (
        <>
          <div className="deck-grid">
            <button
              className="deck-tile deck-create"
              onClick={() => {
                if (!user) onRequireAuth();
                else setIsCreateOpen(true);
              }}
            >
              <Plus size={30} />
              <span>Create a new collection</span>
            </button>

            {collections.map((col) => {
              const previews = col.previews ?? [];
              return (
                <button
                  key={col.id}
                  className="deck-tile"
                  style={{ '--deck-hue': hueFromString(col.id) } as CSSProperties}
                  onClick={() => handleOpenCollection(col)}
                  disabled={loadingDetails}
                >
                  {previews.length > 0 && (
                    <div className="deck-mosaic" aria-hidden="true">
                      {previews.map((p, idx) =>
                        p.file_type.startsWith('video/') ? (
                          <video key={idx} src={p.file_url} preload="metadata" muted playsInline />
                        ) : (
                          <img key={idx} src={p.file_url} alt="" loading="lazy" />
                        )
                      )}
                    </div>
                  )}
                  <div className="deck-shade" />
                  <span className="deck-privacy" title={col.is_public ? 'Public deck' : 'Private deck'}>
                    {col.is_public ? <Globe size={13} /> : <Lock size={13} />}
                  </span>
                  <div className="deck-label">
                    <h3>{col.title}</h3>
                    <span>( {col.item_count ?? 0} )</span>
                  </div>
                </button>
              );
            })}
          </div>

          {collections.length === 0 && (
            <p className="deck-empty-hint">
              <FolderHeart size={16} />
              {filterMine
                ? 'You have not created any collections yet.'
                : 'No public collections have been shared yet.'}
            </p>
          )}
        </>
      )}

      {/* Create Collection Modal */}
      {isCreateOpen && (
        <div className="modal-backdrop" onClick={() => setIsCreateOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create New Collection</h2>
              <button
                className="icon-btn"
                onClick={() => setIsCreateOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="modal-form">
              <label className="form-group">
                <span>Collection Title</span>
                <input
                  type="text"
                  required
                  placeholder="e.g. Reaction Memes"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  maxLength={120}
                />
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={newIsPublic}
                  onChange={(e) => setNewIsPublic(e.target.checked)}
                />
                <span>
                  <strong>Public Collection</strong>
                  <small>Anyone can discover and play with this deck.</small>
                </span>
              </label>

              <button type="submit" className="submit-btn" disabled={creating || !newTitle.trim()}>
                {creating ? 'Creating...' : 'Create Collection'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
