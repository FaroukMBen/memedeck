import { useState, useEffect, type KeyboardEvent } from 'react';
import {
  X,
  BookmarkPlus,
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
import { useFeedback } from '../context/FeedbackContext';
import { MediaThumbnail } from './MediaThumbnail';
import { AddToLibraryModal } from './AddToLibraryModal';

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
  const { confirm, notify } = useFeedback();
  const [copied, setCopied] = useState(false);
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const [colAddedMsg, setColAddedMsg] = useState(false);

  // Add to Library state
  const [addedToLib, setAddedToLib] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

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

  // Synchronize state whenever a media card is clicked/selected
  useEffect(() => {
    if (selected) {
      setLikesCount(selected.media.likes_count ?? 0);
      setDislikesCount(selected.media.dislikes_count ?? 0);
      setUserReaction(selected.media.user_reaction ?? null);
      setAddedToLib(false);
      setIsAddModalOpen(false);
      setIsEditing(selected.initialEditMode ?? false);
      setEditTitle(selected.userMedia?.custom_title || selected.media.original_title || '');
      setEditTags(selected.userMedia?.tags ?? []);
      setEditIsPublic(selected.userMedia?.is_public ?? true);
      setEditIsNsfw(selected.userMedia?.is_nsfw ?? false);
    }
  }, [selected]);

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
      notify(err.message ?? 'Failed to update reaction', 'error');
    } finally {
      setReacting(false);
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
      notify(err.message ?? 'Failed to update privacy', 'error');
    }
  };

  const handleDelete = async () => {
    if (!userMedia) return;
    const confirmed = await confirm({
      title: 'Remove from your library?',
      message:
        'If no other user has this media in their library, the file is also deleted from storage.',
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (!confirmed) return;

    try {
      await memedeckApi.deleteUserMedia(userMedia.id);
      onDeleted?.(userMedia.id);
      onClose();
    } catch (err: any) {
      notify(err.message ?? 'Failed to remove media', 'error');
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
      notify(err.message ?? 'Failed to add to collection', 'error');
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
      notify(err.message ?? 'Failed to update media', 'error');
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

              {/* Tags display (User's tags or original meme tags) */}
              {userMedia?.tags && userMedia.tags.length > 0 ? (
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
              ) : media.tags && media.tags.length > 0 ? (
                <div className="detail-tags-box">
                  <span className="tags-label">
                    <Tag size={13} /> Tags:
                  </span>
                  <div className="detail-tags-list">
                    {media.tags.map((t) => (
                      <span key={t} className="detail-tag-chip">
                        #{t}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

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
                  <button
                    className={`submit-btn ${addedToLib ? 'success' : ''}`}
                    onClick={() => {
                      if (!user) {
                        onRequireAuth?.();
                        return;
                      }
                      setIsAddModalOpen(true);
                    }}
                    disabled={addedToLib}
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    {addedToLib ? (
                      <>
                        <Check size={16} />
                        <span>In Your Library</span>
                      </>
                    ) : (
                      <>
                        <BookmarkPlus size={16} />
                        <span>Add to Library</span>
                      </>
                    )}
                  </button>
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

      {/* Separate Dedicated Add to Library Dialog Window */}
      <AddToLibraryModal
        media={media}
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAdded={(id) => {
          setAddedToLib(true);
          onForked?.(id);
        }}
        onRequireAuth={() => onRequireAuth?.()}
      />
    </div>
  );
}
