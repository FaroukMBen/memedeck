import { useState, type KeyboardEvent } from 'react';
import {
  X,
  GitFork,
  Check,
  Globe,
  Lock,
  Trash2,
  Calendar,
  Film,
  Image as ImageIcon,
  Copy,
  ExternalLink,
  Loader2,
  FolderPlus,
  ThumbsUp,
  ThumbsDown,
  Tag,
  ShieldAlert,
  Pencil,
  Save,
  User,
} from 'lucide-react';
import { memedeckApi, type MediaItem, type UserMediaItem, type CollectionItem } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { MediaThumbnail } from './MediaThumbnail';

export interface SelectedMediaContext {
  media: MediaItem;
  userMedia?: UserMediaItem;
  isOwner?: boolean;
  initialEditMode?: boolean;
}

interface MediaDetailModalProps {
  selected: SelectedMediaContext | null;
  collections?: CollectionItem[];
  onClose: () => void;
  onRequireAuth?: () => void;
  onForked?: (mediaId: string) => void;
  onPrivacyChanged?: (userMediaId: string, isPublic: boolean) => void;
  onDeleted?: (userMediaId: string) => void;
  onReactionUpdated?: (mediaId: string, likes: number, dislikes: number, reaction: 1 | -1 | null) => void;
  onUserMediaUpdated?: (updated: UserMediaItem) => void;
  onNavigateToUser?: (userId: string) => void;
}

export function MediaDetailModal({
  selected,
  collections = [],
  onClose,
  onRequireAuth,
  onForked,
  onPrivacyChanged,
  onDeleted,
  onReactionUpdated,
  onUserMediaUpdated,
  onNavigateToUser,
}: MediaDetailModalProps) {
  const { user } = useAuth();
  const [forking, setForking] = useState(false);
  const [forked, setForked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const [colAddedMsg, setColAddedMsg] = useState(false);

  // Fork customizations
  const [forkTitle, setForkTitle] = useState('');
  const [importTags, setImportTags] = useState(true);

  // Edit Mode state
  const [isEditing, setIsEditing] = useState(selected?.initialEditMode ?? false);
  const [editTitle, setEditTitle] = useState(selected?.userMedia?.custom_title || selected?.media.original_title || '');
  const [editTags, setEditTags] = useState<string[]>(selected?.userMedia?.tags ?? []);
  const [editTagInput, setEditTagInput] = useState('');
  const [editIsPublic, setEditIsPublic] = useState(selected?.userMedia?.is_public ?? true);
  const [editIsNsfw, setEditIsNsfw] = useState(selected?.userMedia?.is_nsfw ?? false);
  const [savingEdit, setSavingEdit] = useState(false);

  // Local reaction state
  const [likesCount, setLikesCount] = useState(selected?.media.likes_count ?? 0);
  const [dislikesCount, setDislikesCount] = useState(selected?.media.dislikes_count ?? 0);
  const [userReaction, setUserReaction] = useState<1 | -1 | null>(
    selected?.media.user_reaction ?? null
  );
  const [reacting, setReacting] = useState(false);

  if (!selected) return null;

  const { media, userMedia, isOwner } = selected;
  const isVideo = media.file_type.startsWith('video/');
  const displayTitle = userMedia?.custom_title || media.original_title || 'Untitled Meme';

  const handleReaction = async (targetType: 1 | -1) => {
    if (!user) {
      onRequireAuth?.();
      return;
    }

    setReacting(true);
    const newReactionType = userReaction === targetType ? 0 : targetType;

    try {
      const res = await memedeckApi.reactToMedia(media.id, newReactionType);
      setLikesCount(res.likes_count);
      setDislikesCount(res.dislikes_count);
      setUserReaction(res.user_reaction);
      onReactionUpdated?.(media.id, res.likes_count, res.dislikes_count, res.user_reaction);
    } catch (err: any) {
      alert(err.message ?? 'Failed to update reaction');
    } finally {
      setReacting(false);
    }
  };

  const handleFork = async () => {
    if (!user) {
      onClose();
      onRequireAuth?.();
      return;
    }

    setForking(true);
    try {
      await memedeckApi.forkMedia(media.id, {
        custom_title: forkTitle.trim() || undefined,
        import_tags: importTags,
      });
      setForked(true);
      onForked?.(media.id);
    } catch (err: any) {
      alert(err.message ?? 'Failed to fork media');
    } finally {
      setForking(false);
    }
  };

  const handleTogglePrivacy = async () => {
    if (!userMedia) return;
    try {
      const updated = await memedeckApi.updateUserMediaPrivacy(
        userMedia.id,
        !userMedia.is_public
      );
      onPrivacyChanged?.(userMedia.id, updated.is_public);
    } catch (err: any) {
      alert(err.message ?? 'Failed to update privacy');
    }
  };

  const handleDelete = async () => {
    if (!userMedia) return;
    if (
      !confirm(
        'Remove this media from your library? If no other user possesses it, it will be automatically cleaned up from storage.'
      )
    ) {
      return;
    }

    try {
      await memedeckApi.deleteUserMedia(userMedia.id);
      onDeleted?.(userMedia.id);
      onClose();
    } catch (err: any) {
      alert(err.message ?? 'Failed to remove media');
    }
  };

  const handleAddToCollection = async (colId: string) => {
    if (!userMedia) return;
    try {
      await memedeckApi.addMediaToCollection(colId, userMedia.id);
      setColAddedMsg(true);
      setColMenuOpen(false);
      setTimeout(() => setColAddedMsg(false), 2000);
    } catch (err: any) {
      alert(err.message ?? 'Failed to add to collection');
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(media.file_url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAddEditTag = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const clean = editTagInput.trim().toLowerCase().replace(/^#/, '');
      if (clean && !editTags.includes(clean)) {
        setEditTags([...editTags, clean]);
      }
      setEditTagInput('');
    }
  };

  const handleRemoveEditTag = (tagToRemove: string) => {
    setEditTags(editTags.filter((t) => t !== tagToRemove));
  };

  const handleSaveEdit = async () => {
    if (!userMedia) return;
    setSavingEdit(true);

    try {
      const updated = await memedeckApi.updateUserMedia(userMedia.id, {
        custom_title: editTitle.trim() || undefined,
        tags: editTags,
        is_public: editIsPublic,
        is_nsfw: editIsNsfw,
      });

      userMedia.custom_title = updated.custom_title;
      userMedia.tags = updated.tags;
      userMedia.is_public = updated.is_public;
      userMedia.is_nsfw = updated.is_nsfw;

      onUserMediaUpdated?.(updated);
      setIsEditing(false);
    } catch (err: any) {
      alert(err.message ?? 'Failed to update media');
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-content media-detail-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="modal-close-corner"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={20} />
        </button>

        <div className="detail-media-stage">
          <MediaThumbnail
            url={media.file_url}
            fileType={media.file_type}
            isDetailView={true}
            controls={true}
            autoPlay={true}
            loop={true}
            showBadge={false}
          />
        </div>

        <div className="detail-sidebar">
          {/* If Editing Mode */}
          {isEditing && userMedia ? (
            <div className="edit-details-form">
              <div className="edit-form-header">
                <h3>Edit Media Details</h3>
                <button
                  className="icon-btn"
                  onClick={() => setIsEditing(false)}
                  title="Cancel edit"
                >
                  <X size={16} />
                </button>
              </div>

              <label className="form-group">
                <span>Title</span>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="e.g. Surprised Face"
                  maxLength={120}
                />
              </label>

              <div className="form-group">
                <span>Tags</span>
                <div className="tags-input-container">
                  <Tag size={13} className="tags-icon" />
                  <div className="tags-chip-list">
                    {editTags.map((t) => (
                      <span key={t} className="tag-chip">
                        #{t}
                        <button
                          type="button"
                          onClick={() => handleRemoveEditTag(t)}
                          className="remove-tag-btn"
                        >
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                    <input
                      type="text"
                      placeholder="Add tag + Enter..."
                      value={editTagInput}
                      onChange={(e) => setEditTagInput(e.target.value)}
                      onKeyDown={handleAddEditTag}
                      className="tag-bare-input"
                    />
                  </div>
                </div>
              </div>

              <div className="options-row">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={editIsPublic}
                    onChange={(e) => setEditIsPublic(e.target.checked)}
                  />
                  <span>
                    <strong>Public in library</strong>
                    <small>Visible in Discover</small>
                  </span>
                </label>

                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={editIsNsfw}
                    onChange={(e) => setEditIsNsfw(e.target.checked)}
                  />
                  <span>
                    <strong>NSFW / Sensitive</strong>
                    <small>Adult content warning</small>
                  </span>
                </label>
              </div>

              <div className="edit-form-actions">
                <button
                  className="submit-btn"
                  onClick={handleSaveEdit}
                  disabled={savingEdit}
                >
                  {savingEdit ? (
                    <>
                      <Loader2 size={15} className="spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save size={15} />
                      <span>Save Changes</span>
                    </>
                  )}
                </button>
                <button
                  className="small-action-btn outline"
                  onClick={() => setIsEditing(false)}
                  disabled={savingEdit}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="detail-header-meta">
                <div className="title-with-edit">
                  <h2 className="detail-media-title">{displayTitle}</h2>
                  {userMedia && (
                    <button
                      className="icon-btn edit-title-btn"
                      onClick={() => setIsEditing(true)}
                      title="Edit media details (title, tags, privacy, nsfw)"
                    >
                      <Pencil size={15} />
                    </button>
                  )}
                </div>

                <div className="detail-pill-row">
                  <span className="file-type-badge large">
                    {isVideo ? <Film size={14} /> : <ImageIcon size={14} />}
                    {media.file_type.split('/')[1]?.toUpperCase() || 'MEDIA'}
                  </span>

                  {userMedia?.is_nsfw && (
                    <span className="nsfw-badge">
                      <ShieldAlert size={12} /> NSFW
                    </span>
                  )}

                  {userMedia && (
                    <button
                      className={`privacy-pill ${userMedia.is_public ? 'public' : 'private'}`}
                      onClick={handleTogglePrivacy}
                      title="Click to toggle Public / Private"
                    >
                      {userMedia.is_public ? <Globe size={13} /> : <Lock size={13} />}
                      <span>{userMedia.is_public ? 'Public' : 'Private'}</span>
                    </button>
                  )}
                </div>

                {/* Likes / Dislikes row */}
                <div className="reaction-vote-bar">
                  <button
                    className={`vote-btn like ${userReaction === 1 ? 'active' : ''}`}
                    onClick={() => handleReaction(1)}
                    disabled={reacting}
                    title="Like this meme"
                  >
                    <ThumbsUp size={15} />
                    <span>{likesCount}</span>
                  </button>

                  <button
                    className={`vote-btn dislike ${userReaction === -1 ? 'active' : ''}`}
                    onClick={() => handleReaction(-1)}
                    disabled={reacting}
                    title="Dislike this meme"
                  >
                    <ThumbsDown size={15} />
                    <span>{dislikesCount}</span>
                  </button>
                </div>
              </div>

              {/* User's tags display */}
              {userMedia?.tags && userMedia.tags.length > 0 && (
                <div className="detail-tags-box">
                  <span className="tags-label">
                    <Tag size={13} /> Your tags:
                  </span>
                  <div className="detail-tags-list">
                    {userMedia.tags.map((t) => (
                      <span key={t} className="detail-tag-chip">
                        #{t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="detail-meta-list">
                <div className="meta-item">
                  <Calendar size={14} />
                  <span>
                    Added {new Date(media.created_at).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </div>

                <div className="meta-item">
                  <ExternalLink size={14} />
                  <button className="copy-link-btn" onClick={handleCopyLink}>
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                    <span>{copied ? 'Link copied!' : 'Copy asset URL'}</span>
                  </button>
                </div>

                {media.original_uploader_id && onNavigateToUser && (
                  <div className="meta-item" style={{ marginTop: '0.2rem' }}>
                    <button
                      className="creator-profile-link-btn"
                      onClick={() => {
                        onClose();
                        onNavigateToUser(media.original_uploader_id!);
                      }}
                    >
                      <User size={13} />
                      <span>View Creator Profile</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="detail-actions">
                {/* If in Discover & not owned */}
                {!userMedia && (
                  <div className="fork-options-box">
                    <input
                      type="text"
                      placeholder={media.original_title || 'Custom title in your library...'}
                      value={forkTitle}
                      onChange={(e) => setForkTitle(e.target.value)}
                      className="fork-title-input"
                    />

                    <label className="checkbox-label" style={{ padding: '0.2rem 0' }}>
                      <input
                        type="checkbox"
                        checked={importTags}
                        onChange={(e) => setImportTags(e.target.checked)}
                      />
                      <span>
                        <small>Import original tags into your library</small>
                      </span>
                    </label>

                    <button
                      className={`submit-btn ${forked ? 'forked' : ''}`}
                      onClick={handleFork}
                      disabled={forking || forked}
                    >
                      {forking ? (
                        <>
                          <Loader2 size={16} className="spin" />
                          <span>Forking to Library...</span>
                        </>
                      ) : forked ? (
                        <>
                          <Check size={16} />
                          <span>Forked to Library!</span>
                        </>
                      ) : (
                        <>
                          <GitFork size={16} />
                          <span>Fork to My Library</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* If user owns or has it in library */}
                {userMedia && (
                  <>
                    <button
                      className="small-action-btn outline full-width"
                      onClick={() => setIsEditing(true)}
                    >
                      <Pencil size={14} />
                      <span>Edit Media Details</span>
                    </button>

                    {colAddedMsg ? (
                      <div className="modal-alert success">
                        <Check size={14} /> Added to deck!
                      </div>
                    ) : colMenuOpen ? (
                      <div className="collection-dropdown">
                        <span className="dropdown-label">Select deck:</span>
                        {collections.length === 0 ? (
                          <span className="no-cols">No collections yet</span>
                        ) : (
                          collections.map((col) => (
                            <button
                              key={col.id}
                              className="col-select-item"
                              onClick={() => handleAddToCollection(col.id)}
                            >
                              {col.title}
                            </button>
                          ))
                        )}
                        <button
                          className="cancel-link"
                          onClick={() => setColMenuOpen(false)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        className="small-action-btn outline full-width"
                        onClick={() => setColMenuOpen(true)}
                      >
                        <FolderPlus size={15} />
                        <span>Add to Collection</span>
                      </button>
                    )}

                    {isOwner && (
                      <button
                        className="small-action-btn danger full-width"
                        onClick={handleDelete}
                      >
                        <Trash2 size={15} />
                        <span>Remove from Library</span>
                      </button>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
