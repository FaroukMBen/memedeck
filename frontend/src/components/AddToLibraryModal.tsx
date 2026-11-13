import { useState, useEffect, type KeyboardEvent } from 'react';
import { BookmarkPlus, X, Tag, Check, Loader2, Globe, ShieldAlert } from 'lucide-react';
import { memedeckApi, type MediaItem } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { MediaThumbnail } from './MediaThumbnail';

interface AddToLibraryModalProps {
  media: MediaItem | null;
  isOpen: boolean;
  onClose: () => void;
  onAdded: (mediaId: string) => void;
  onRequireAuth: () => void;
}

export function AddToLibraryModal({
  media,
  isOpen,
  onClose,
  onAdded,
  onRequireAuth,
}: AddToLibraryModalProps) {
  const { user } = useAuth();

  const [title, setTitle] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [isNsfw, setIsNsfw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [addedSuccess, setAddedSuccess] = useState(false);

  // Sync state whenever modal opens for a given media
  useEffect(() => {
    if (media && isOpen) {
      setTitle(media.original_title || '');
      // Pre-fill with the meme's permanent tags from upload
      setTags(media.tags && media.tags.length > 0 ? [...media.tags] : []);
      setTagInput('');
      setIsPublic(true);
      setIsNsfw(false);
      setSubmitting(false);
      setAddedSuccess(false);
    }
  }, [media, isOpen]);

  if (!isOpen || !media) return null;

  const handleAddTag = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const clean = tagInput.trim().toLowerCase().replace(/^#/, '');
      if (clean && !tags.includes(clean)) {
        setTags([...tags, clean]);
      }
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleSubmit = async () => {
    if (!user) {
      onClose();
      onRequireAuth();
      return;
    }

    setSubmitting(true);
    try {
      await memedeckApi.addToLibrary(media.id, {
        custom_title: title.trim() || undefined,
        tags: tags.length > 0 ? tags : undefined,
        import_tags: tags.length === 0,
        is_public: isPublic,
        is_nsfw: isNsfw,
      });

      setAddedSuccess(true);
      onAdded(media.id);
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err: any) {
      alert(err.message ?? 'Failed to add meme to your library');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-content add-library-modal-box"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close-corner" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>

        <div className="modal-header-section">
          <div className="modal-header-icon-pill">
            <BookmarkPlus size={20} />
          </div>
          <div>
            <h2 className="modal-title">Add to My Library</h2>
            <p className="modal-subtitle">
              Customize title, tags, and privacy before saving this meme to your deck.
            </p>
          </div>
        </div>

        {/* Media snippet preview */}
        <div className="add-library-media-snippet">
          <div className="snippet-thumb">
            <MediaThumbnail url={media.file_url} fileType={media.file_type} />
          </div>
          <div className="snippet-info">
            <span className="snippet-orig-title">
              {media.original_title || 'Untitled Meme'}
            </span>
            <span className="snippet-type-badge">
              {media.file_type.split('/')[1]?.toUpperCase()}
            </span>
          </div>
        </div>

        <div className="modal-body-form">
          {/* Custom title */}
          <div className="form-group">
            <label className="form-label" htmlFor="custom-meme-title">
              Title in Your Library
            </label>
            <input
              id="custom-meme-title"
              type="text"
              className="form-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={media.original_title || 'Give it a custom title...'}
              maxLength={120}
              autoFocus
            />
            <span className="form-hint">
              Leave blank to keep original or rename it for quick searching in your games.
            </span>
          </div>

          {/* Interactive Tag Chips */}
          <div className="form-group">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
              <label className="form-label" style={{ margin: 0 }}>Tags</label>
              {media.tags && media.tags.length > 0 && (
                <div style={{ display: 'flex', gap: '0.6rem', fontSize: '0.75rem' }}>
                  <button
                    type="button"
                    onClick={() => setTags([...media.tags!])}
                    title="Reset to the meme's original permanent tags"
                    style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    Restore original
                  </button>
                  {tags.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setTags([])}
                      title="Remove all tags"
                      style={{ color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      Clear all
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="tags-input-container">
              <Tag size={14} className="tags-icon" />
              <div className="tags-chip-list">
                {tags.map((t) => (
                  <span key={t} className="tag-chip">
                    #{t}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(t)}
                      className="remove-tag-btn"
                      title={`Remove tag #${t}`}
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  placeholder={tags.length === 0 ? 'Type a tag & press Enter...' : 'Add tag...'}
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleAddTag}
                  className="tag-bare-input"
                />
              </div>
            </div>
            <span className="form-hint">
              {media.tags && media.tags.length > 0
                ? "Pre-filled with the meme's original tags. Keep them, click × to remove, or type new tags."
                : "Press Enter or comma to create tags. Click × on a tag to remove it."}
            </span>
          </div>

          {/* Checkbox Options */}
          <div className="options-row" style={{ marginTop: '0.4rem' }}>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
              />
              <span>
                <strong>
                  <Globe size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: -1 }} />
                  Public in Library
                </strong>
                <small>Allows others to see it in your public profile deck</small>
              </span>
            </label>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={isNsfw}
                onChange={(e) => setIsNsfw(e.target.checked)}
              />
              <span>
                <strong>
                  <ShieldAlert size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: -1 }} />
                  NSFW / Sensitive
                </strong>
                <small>Flag meme with an adult content warning</small>
              </span>
            </label>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="modal-footer-actions">
          <button
            type="button"
            className="small-action-btn outline"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>

          <button
            type="button"
            className={`submit-btn ${addedSuccess ? 'success' : ''}`}
            onClick={handleSubmit}
            disabled={submitting || addedSuccess}
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="spin" />
                <span>Adding to Library...</span>
              </>
            ) : addedSuccess ? (
              <>
                <Check size={16} />
                <span>Added to Library!</span>
              </>
            ) : (
              <>
                <BookmarkPlus size={16} />
                <span>Add to Library</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
