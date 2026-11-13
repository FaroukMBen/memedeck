import { useState, useRef, type FormEvent, type ChangeEvent, type DragEvent, type KeyboardEvent } from 'react';
import { UploadCloud, X, CheckCircle2, Film, Image as ImageIcon, Zap, Tag, ShieldAlert } from 'lucide-react';
import { memedeckApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { compressImageClientSide, type CompressionResult } from '../lib/compression';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploaded?: () => void;
  onRequireAuth?: () => void;
}

export function UploadModal({ isOpen, onClose, onUploaded, onRequireAuth }: UploadModalProps) {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [isNsfw, setIsNsfw] = useState(false);
  const [compressionInfo, setCompressionInfo] = useState<CompressionResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleSelectFile = async (selected: File) => {
    setError(null);
    setSuccess(false);
    setCompressionInfo(null);

    if (!selected.type.startsWith('image/') && !selected.type.startsWith('video/')) {
      setError('Only image and video files are supported (e.g. PNG, JPG, GIF, MP4, WebM).');
      return;
    }

    if (selected.size > 50 * 1024 * 1024) {
      setError('File is too large (max 50 MB).');
      return;
    }

    // Default title from file name if user hasn't typed one
    const defaultName = selected.name.replace(/\.[^/.]+$/, '').trim();
    if (!title) {
      setTitle(defaultName);
    }

    // Client-side image compression for static images
    if (selected.type.startsWith('image/') && selected.type !== 'image/gif') {
      setCompressing(true);
      try {
        const result = await compressImageClientSide(selected);
        setCompressionInfo(result);
        setFile(result.file);
        const url = URL.createObjectURL(result.file);
        setPreviewUrl(url);
      } catch {
        setFile(selected);
        setPreviewUrl(URL.createObjectURL(selected));
      } finally {
        setCompressing(false);
      }
    } else {
      setFile(selected);
      const url = URL.createObjectURL(selected);
      setPreviewUrl(url);
    }
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleSelectFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleSelectFile(e.dataTransfer.files[0]);
    }
  };

  const clearSelection = () => {
    setFile(null);
    setTitle('');
    setTags([]);
    setTagInput('');
    setCompressionInfo(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) {
      onClose();
      onRequireAuth?.();
      return;
    }

    if (!file) {
      setError('Please select a media file to upload.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await memedeckApi.uploadMedia({
        file,
        title: title.trim() || undefined,
        tags,
        isPublic,
        isNsfw,
      });
      setSuccess(true);
      setTimeout(() => {
        clearSelection();
        setSuccess(false);
        onClose();
        onUploaded?.();
      }, 1200);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to upload media');
    } finally {
      setLoading(false);
    }
  };

  const handleModalClose = () => {
    clearSelection();
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={handleModalClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add Media to Library</h2>
          <button className="icon-btn" onClick={handleModalClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        {!user ? (
          <div className="auth-required-box">
            <p>You need to be connected to upload media to your library.</p>
            <button
              className="submit-btn"
              onClick={() => {
                onClose();
                onRequireAuth?.();
              }}
            >
              Connect or Create Account
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="modal-form">
            {error && <div className="modal-alert error">{error}</div>}
            {success && (
              <div className="modal-alert success">
                <CheckCircle2 size={16} /> Media uploaded successfully to your library!
              </div>
            )}

            {!file ? (
              <div
                className={`dropzone ${isDragging ? 'dragging' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  style={{ display: 'none' }}
                  onChange={handleFileInputChange}
                />
                <UploadCloud size={40} className="dropzone-icon" />
                <p className="dropzone-title">Click to upload or drag & drop</p>
                <p className="dropzone-subtitle">Images, GIFs, or Videos up to 50 MB</p>
              </div>
            ) : (
              <div className="preview-container">
                <div className="preview-media-wrapper">
                  {file.type.startsWith('video/') ? (
                    <video src={previewUrl!} controls className="preview-media" />
                  ) : (
                    <img src={previewUrl!} alt="Upload preview" className="preview-media" />
                  )}
                  <button
                    type="button"
                    className="remove-preview-btn"
                    onClick={clearSelection}
                    title="Remove file"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="preview-info">
                  <span className="file-name">
                    {file.type.startsWith('video/') ? <Film size={14} /> : <ImageIcon size={14} />}
                    {file.name}
                  </span>
                  <span className="file-size">{(file.size / (1024 * 1024)).toFixed(2)} MB</span>
                </div>

                {compressionInfo && compressionInfo.savingsPercent > 0 && (
                  <div className="compression-badge">
                    <Zap size={14} />
                    <span>
                      Client-compressed to WebP: {(compressionInfo.originalSize / (1024 * 1024)).toFixed(2)} MB →{' '}
                      {(compressionInfo.compressedSize / 1024).toFixed(0)} KB ({compressionInfo.savingsPercent}% data saved)
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Title field */}
            <label className="form-group">
              <span>Title (optional, defaults to filename)</span>
              <input
                type="text"
                placeholder={file ? file.name.replace(/\.[^/.]+$/, '').trim() : 'e.g. Surprised Pikachu'}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
              />
            </label>

            {/* Tags input */}
            <div className="form-group">
              <span>Tags (personal to your library)</span>
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
                      >
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    placeholder={tags.length === 0 ? 'Type tag and press Enter...' : 'Add another...'}
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleAddTag}
                    className="tag-bare-input"
                  />
                </div>
              </div>
            </div>

            <div className="options-row">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                />
                <span>
                  <strong>Public in library</strong>
                  <small>Visible in Discover and can be forked by others.</small>
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
                    <ShieldAlert size={13} style={{ display: 'inline', verticalAlign: '-1px' }} /> NSFW / Sensitive
                  </strong>
                  <small>Allows party games to filter adult content.</small>
                </span>
              </label>
            </div>

            <button
              type="submit"
              className="submit-btn"
              disabled={loading || compressing || !file || success}
            >
              {compressing
                ? 'Optimizing media...'
                : loading
                ? 'Uploading...'
                : 'Upload to Library'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
