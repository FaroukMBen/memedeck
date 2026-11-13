import { useState } from 'react';
import { ImageOff, Film, Image as ImageIcon } from 'lucide-react';

interface MediaThumbnailProps {
  url: string;
  fileType: string;
  alt?: string;
  className?: string;
  controls?: boolean;
  autoPlay?: boolean;
  loop?: boolean;
  muted?: boolean;
  showBadge?: boolean;
  isDetailView?: boolean;
}

export function MediaThumbnail({
  url,
  fileType,
  alt = 'Media asset',
  className = '',
  controls = false,
  autoPlay = false,
  loop = false,
  muted = false,
  showBadge = true,
  isDetailView = false,
}: MediaThumbnailProps) {
  const [hasError, setHasError] = useState(false);
  const isVideo = fileType.startsWith('video/');

  if (hasError) {
    return (
      <div className={`media-fallback-box ${isDetailView ? 'detail-fallback' : ''}`}>
        <ImageOff size={isDetailView ? 44 : 26} className="media-fallback-icon" />
        <span className="media-fallback-title">Media unavailable</span>
        <span className="media-fallback-sub">Broken link or file missing</span>
      </div>
    );
  }

  return (
    <div className={`media-thumb-container ${className}`}>
      {isVideo ? (
        <video
          src={url}
          controls={controls}
          autoPlay={autoPlay}
          loop={loop}
          muted={muted}
          playsInline
          preload="metadata"
          onError={() => setHasError(true)}
          className={isDetailView ? 'detail-media-player' : 'media-thumb-element'}
        />
      ) : (
        <img
          src={url}
          alt={alt}
          loading="lazy"
          onError={() => setHasError(true)}
          className={isDetailView ? 'detail-media-image' : 'media-thumb-element'}
        />
      )}

      {showBadge && !hasError && (
        <span className="file-type-badge">
          {isVideo ? <Film size={12} /> : <ImageIcon size={12} />}
          {fileType.split('/')[1]?.toUpperCase() || 'FILE'}
        </span>
      )}
    </div>
  );
}

