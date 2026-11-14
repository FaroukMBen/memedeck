import { useState } from 'react';
import { ImageOff, Film, Image as ImageIcon } from 'lucide-react';

interface MediaThumbnailProps {
  url: string;
  fileType: string;
  /** Original format when the file was converted on upload ('gif' for a GIF stored as MP4) */
  sourceFormat?: string | null;
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
  sourceFormat,
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
  // A GIF stored as video should still behave like a GIF: silent, looping, no controls
  const isGif = sourceFormat === 'gif';

  if (hasError) {
    return (
      <div className={`media-fallback-box ${isDetailView ? 'detail-fallback' : ''}`}>
        <ImageOff size={isDetailView ? 44 : 26} className="media-fallback-icon" />
        <span className="media-fallback-title">Media unavailable</span>
        <span className="media-fallback-sub">Broken link or file missing</span>
      </div>
    );
  }

  const badgeLabel = isGif ? 'GIF' : fileType.split('/')[1]?.toUpperCase() || 'FILE';

  return (
    <div className={`media-thumb-container ${className}`}>
      {isVideo ? (
        <video
          src={url}
          controls={controls && !isGif}
          autoPlay={autoPlay || isGif}
          loop={loop || isGif}
          muted={muted || isGif}
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
          {isVideo && !isGif ? <Film size={12} /> : <ImageIcon size={12} />}
          {badgeLabel}
        </span>
      )}
    </div>
  );
}
