import { useState } from 'react';
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
} from 'lucide-react';
import { memedeckApi, type MediaItem, type UserMediaItem, type CollectionItem } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { MediaThumbnail } from './MediaThumbnail';

export interface SelectedMediaContext {
  media: MediaItem;
  userMedia?: UserMediaItem;
  isOwner?: boolean;
}

interface MediaDetailModalProps {
  selected: SelectedMediaContext | null;
  collections?: CollectionItem[];
  onClose: () => void;
  onRequireAuth?: () => void;
  onForked?: (mediaId: string) => void;
  onPrivacyChanged?: (userMediaId: string, isPublic: boolean) => void;
  onDeleted?: (userMediaId: string) => void;
}

export function MediaDetailModal({
  selected,
  collections = [],
  onClose,
  onRequireAuth,
  onForked,
  onPrivacyChanged,
  onDeleted,
}: MediaDetailModalProps) {
  const { user } = useAuth();
  const [forking, setForking] = useState(false);
  const [forked, setForked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const [colAddedMsg, setColAddedMsg] = useState(false);

  if (!selected) return null;

  const { media, userMedia, isOwner } = selected;
  const isVideo = media.file_type.startsWith('video/');

  const handleFork = async () => {
    if (!user) {
      onClose();
      onRequireAuth?.();
      return;
    }

    if (media.id.startsWith('demo-')) {
      setForked(true);
      onForked?.(media.id);
      return;
    }

    setForking(true);
    try {
      await memedeckApi.forkMedia(media.id);
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
          <div className="detail-header-meta">
            <span className="file-type-badge large">
              {isVideo ? <Film size={14} /> : <ImageIcon size={14} />}
              {media.file_type.split('/')[1]?.toUpperCase() || 'MEDIA'}
            </span>

            {userMedia && (
              <button
                className={`privacy-pill ${userMedia.is_public ? 'public' : 'private'}`}
                onClick={handleTogglePrivacy}
                title="Click to toggle Public / Private"
              >
                {userMedia.is_public ? <Globe size={13} /> : <Lock size={13} />}
                <span>{userMedia.is_public ? 'Public in Library' : 'Private in Library'}</span>
              </button>
            )}
          </div>

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
          </div>

          <div className="detail-actions">
            {/* If in Discover & not owned */}
            {!userMedia && (
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
            )}

            {/* If user owns or has it in library */}
            {userMedia && (
              <>
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
        </div>
      </div>
    </div>
  );
}

