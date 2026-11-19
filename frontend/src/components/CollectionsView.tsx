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
  Zap,
  Bell,
  BellOff,
  Copy,
} from 'lucide-react';
import {
  memedeckApi,
  type CollectionItem,
  type CollectionDetails,
  type CollectionMediaItem,
  type CollectionRule,
} from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useFeedback } from '../context/FeedbackContext';
import { MediaThumbnail } from './MediaThumbnail';
import { Select, type SelectOption } from './Select';
import { DeckGridSkeleton, useServerWakeup } from './Skeleton';

type CollectionScope = 'mine' | 'subscribed';
type RuleTypeChoice = 'any' | 'image' | 'video';

const RULE_TYPE_OPTIONS: SelectOption<RuleTypeChoice>[] = [
  { value: 'any', label: 'Images and videos' },
  { value: 'image', label: 'Images only' },
  { value: 'video', label: 'Videos & GIFs only' },
];

/** Human-readable summary of a dynamic collection's rule. */
function describeRule(rule: CollectionRule): string {
  const parts: string[] = [];
  if (rule.tags?.length) parts.push(rule.tags.map((t) => `#${t}`).join(' or '));
  if (rule.type) parts.push(rule.type === 'image' ? 'images only' : 'videos & GIFs only');
  if (rule.min_likes !== undefined) parts.push(`at least ${rule.min_likes} likes`);
  return parts.join(' · ');
}

interface CollectionsViewProps {
  onRequireAuth: () => void;
}

export function CollectionsView({ onRequireAuth }: CollectionsViewProps) {
  const { user } = useAuth();
  const { confirm, notify } = useFeedback();
  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [scope, setScope] = useState<CollectionScope>('mine');
  const [loading, setLoading] = useState(true);
  const isWakingUp = useServerWakeup(loading);

  // Detail view state
  const [selectedColId, setSelectedColId] = useState<string | null>(null);
  const [details, setDetails] = useState<CollectionDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Create Collection modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newIsPublic, setNewIsPublic] = useState(false);
  const [creating, setCreating] = useState(false);
  // Dynamic rule fields of the create form
  const [newDynamic, setNewDynamic] = useState(false);
  const [ruleTags, setRuleTags] = useState('');
  const [ruleType, setRuleType] = useState<RuleTypeChoice>('any');
  const [ruleMinLikes, setRuleMinLikes] = useState('');
  const [socialBusy, setSocialBusy] = useState(false);

  // Random draw test state
  const [randomDrawResults, setRandomDrawResults] = useState<CollectionMediaItem[] | null>(null);
  const [drawingRandom, setDrawingRandom] = useState(false);

  const fetchCollections = async () => {
    if (!user) {
      setCollections([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res =
        scope === 'subscribed'
          ? await memedeckApi.getSubscribedCollections()
          : await memedeckApi.getCollections(true);
      setCollections(res.items);
    } catch {
      setCollections([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCollections();
  }, [scope, user?.id]);

  const handleOpenCollection = async (col: CollectionItem) => {
    setSelectedColId(col.id);
    setLoadingDetails(true);
    try {
      const res = await memedeckApi.getCollectionDetails(col.id);
      setDetails(res);
    } catch (err: any) {
      notify(err.message ?? 'Failed to load collection details', 'error');
    } finally {
      setLoadingDetails(false);
    }
  };

  const buildRule = (): CollectionRule | undefined => {
    const tags = ruleTags
      .split(',')
      .map((t) => t.trim().toLowerCase().replace(/^#/, ''))
      .filter(Boolean);
    const minLikes = ruleMinLikes.trim() === '' ? undefined : Math.max(0, Number(ruleMinLikes));
    const rule: CollectionRule = {
      ...(tags.length > 0 && { tags }),
      ...(ruleType !== 'any' && { type: ruleType }),
      ...(minLikes !== undefined && Number.isFinite(minLikes) && { min_likes: Math.floor(minLikes) }),
    };
    return Object.keys(rule).length > 0 ? rule : undefined;
  };

  const dynamicRuleMissing = newDynamic && !buildRule();

  const handleToggleSubscription = async () => {
    if (!details) return;
    if (!user) {
      onRequireAuth();
      return;
    }
    setSocialBusy(true);
    try {
      const res = details.is_subscribed
        ? await memedeckApi.unsubscribeFromCollection(details.collection.id)
        : await memedeckApi.subscribeToCollection(details.collection.id);
      setDetails((prev) => (prev ? { ...prev, is_subscribed: res.subscribed } : null));
      notify(res.subscribed ? 'Subscribed to this deck' : 'Unsubscribed', 'success');
    } catch (err: any) {
      notify(err.message ?? 'Failed to update subscription', 'error');
    } finally {
      setSocialBusy(false);
    }
  };

  const handleCopyCollection = async () => {
    if (!details) return;
    if (!user) {
      onRequireAuth();
      return;
    }
    setSocialBusy(true);
    try {
      const res = await memedeckApi.forkCollection(details.collection.id);
      notify(
        `Copied "${res.collection.title}" to your decks with ${res.copied_count} meme${
          res.copied_count === 1 ? '' : 's'
        }`,
        'success'
      );
    } catch (err: any) {
      notify(err.message ?? 'Failed to copy this deck', 'error');
    } finally {
      setSocialBusy(false);
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
      await memedeckApi.createCollection(title, newIsPublic, newDynamic ? buildRule() : undefined);
      setNewDynamic(false);
      setRuleTags('');
      setRuleType('any');
      setRuleMinLikes('');
      setNewTitle('');
      setIsCreateOpen(false);
      fetchCollections();
    } catch (err: any) {
      notify(err.message ?? 'Failed to create collection', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteCollection = async (colId: string) => {
    const confirmed = await confirm({
      title: 'Delete this collection?',
      message: 'The deck is deleted. The memes inside stay in your library.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!confirmed) return;

    try {
      await memedeckApi.deleteCollection(colId);
      setSelectedColId(null);
      setDetails(null);
      fetchCollections();
    } catch (err: any) {
      notify(err.message ?? 'Failed to delete collection', 'error');
    }
  };

  const handleDrawRandom = async () => {
    if (!selectedColId) return;

    setDrawingRandom(true);
    try {
      const res = await memedeckApi.getRandomFromCollection(selectedColId, 5);
      setRandomDrawResults(res.items);
    } catch (err: any) {
      notify(err.message ?? 'Failed to draw random items', 'error');
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
      notify(err.message ?? 'Failed to remove item from collection', 'error');
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
                {details.collection.rule && (
                  <span className="count-pill dynamic" title="Content is computed from this rule">
                    <Zap size={12} /> {describeRule(details.collection.rule)}
                  </span>
                )}
                {!isOwner && details.owner_username && (
                  <span className="count-pill">by {details.owner_username}</span>
                )}
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

            {!isOwner && (
              <>
                <button
                  className="small-action-btn"
                  onClick={handleToggleSubscription}
                  disabled={socialBusy}
                  aria-pressed={details.is_subscribed}
                >
                  {details.is_subscribed ? <BellOff size={15} /> : <Bell size={15} />}
                  <span>{details.is_subscribed ? 'Unsubscribe' : 'Subscribe'}</span>
                </button>
                <button
                  className="small-action-btn"
                  onClick={handleCopyCollection}
                  disabled={socialBusy || details.items.length === 0}
                  title="Copy this deck and its memes into your own library"
                >
                  <Copy size={15} />
                  <span>Copy to my decks</span>
                </button>
              </>
            )}

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
                  <MediaThumbnail url={item.file_url} fileType={item.file_type} sourceFormat={item.source_format} showBadge={false} />
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
                <MediaThumbnail url={item.file_url} fileType={item.file_type} sourceFormat={item.source_format} />
                {isOwner && !details.collection.rule && (
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

  if (!user) {
    return (
      <div className="view-container">
        <div className="empty-state-card">
          <FolderHeart size={40} className="empty-icon" />
          <h2>My Collections</h2>
          <p>
            Connect your account to access and organize your personal meme collections and decks.
          </p>
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
          <h2>My Collections</h2>
          <p className="view-subtitle">
            Your personal packs and decks curated for specific party games or themes.
          </p>
        </div>

        <div className="view-header-actions">
          <div className="filter-pill-group">
            <button
              className={`filter-pill ${scope === 'mine' ? 'active' : ''}`}
              onClick={() => setScope('mine')}
            >
              My Decks
            </button>
            <button
              className={`filter-pill ${scope === 'subscribed' ? 'active' : ''}`}
              onClick={() => setScope('subscribed')}
            >
              Subscribed
            </button>
          </div>

          <button
            className="add-media-btn"
            onClick={() => setIsCreateOpen(true)}
          >
            <Plus size={16} />
            <span>New Collection</span>
          </button>
        </div>
      </div>

      {loading ? (
        <DeckGridSkeleton
          count={5}
          isWakingUp={isWakingUp}
          onCreateClick={() => {
            if (!user) onRequireAuth();
            else setIsCreateOpen(true);
          }}
        />
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
                  {col.rule && (
                    <span className="deck-dynamic" title={`Dynamic: ${describeRule(col.rule)}`}>
                      <Zap size={13} />
                    </span>
                  )}
                  <div className="deck-label">
                    <h3>{col.title}</h3>
                    <span>( {col.item_count ?? 0} )</span>
                    {col.user_id !== user?.id && col.owner_username && (
                      <small>by {col.owner_username}</small>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {collections.length === 0 && (
            <p className="deck-empty-hint">
              <FolderHeart size={16} />
              {scope === 'mine'
                ? 'You have not created any collections yet.'
                : scope === 'subscribed'
                ? 'You have not subscribed to any deck yet. Open a public deck and hit Subscribe.'
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

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={newDynamic}
                  onChange={(e) => setNewDynamic(e.target.checked)}
                />
                <span>
                  <strong>
                    <Zap size={13} /> Dynamic collection
                  </strong>
                  <small>Fills itself from your library using a rule, instead of by hand.</small>
                </span>
              </label>

              {newDynamic && (
                <div className="rule-box">
                  <label className="form-group">
                    <span>Has any of these tags (comma separated)</span>
                    <input
                      type="text"
                      placeholder="reaction, cat"
                      value={ruleTags}
                      onChange={(e) => setRuleTags(e.target.value)}
                    />
                  </label>

                  <div className="rule-row">
                    <div className="form-group">
                      <span>Type</span>
                      <Select
                        label="Media type"
                        value={ruleType}
                        options={RULE_TYPE_OPTIONS}
                        onChange={setRuleType}
                      />
                    </div>
                    <label className="form-group">
                      <span>Minimum likes</span>
                      <input
                        type="number"
                        min={0}
                        placeholder="0"
                        value={ruleMinLikes}
                        onChange={(e) => setRuleMinLikes(e.target.value)}
                      />
                    </label>
                  </div>

                  {dynamicRuleMissing && (
                    <small className="rule-hint">Set at least one condition.</small>
                  )}
                </div>
              )}

              <button
                type="submit"
                className="submit-btn"
                disabled={creating || !newTitle.trim() || dynamicRuleMissing}
              >
                {creating ? 'Creating...' : 'Create Collection'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
