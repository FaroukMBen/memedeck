import { useEffect, useState, type CSSProperties } from 'react';
import { Server, Zap, ChevronLeft, ChevronRight, Plus } from 'lucide-react';

/**
 * Hook that detects if a request is taking longer than expected
 * (typically when Render is waking up from its 15-min cold sleep).
 */
export function useServerWakeup(loading: boolean, thresholdMs = 2200): boolean {
  const [isWakingUp, setIsWakingUp] = useState(false);

  useEffect(() => {
    if (!loading) {
      setIsWakingUp(false);
      return;
    }

    const timer = setTimeout(() => {
      setIsWakingUp(true);
    }, thresholdMs);

    return () => clearTimeout(timer);
  }, [loading, thresholdMs]);

  return isWakingUp;
}

interface SkeletonProps {
  className?: string;
  style?: CSSProperties;
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
}

export function Skeleton({ className = '', style = {}, width, height, borderRadius }: SkeletonProps) {
  return (
    <div
      className={`skeleton-box ${className}`}
      style={{
        width,
        height,
        borderRadius,
        ...style,
      }}
    />
  );
}

/**
 * Server wakeup notification banner with animated pulsing indicators.
 */
export function ServerWakeupBanner() {
  const [dots, setDots] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="server-wakeup-banner" role="status" aria-live="polite">
      <div className="server-wakeup-glow" />
      <div className="server-wakeup-icon-box">
        <span className="server-wakeup-radar" />
        <Server size={18} className="server-wakeup-icon" />
      </div>
      <div className="server-wakeup-content">
        <div className="server-wakeup-title">
          <Zap size={14} className="server-wakeup-bolt" />
          <span>Waking up API server{dots}</span>
          <span className="server-wakeup-pill">Render spin-up</span>
        </div>
        <p className="server-wakeup-desc">
          The free backend instance is starting up from sleep mode (~30s). Content will appear automatically as soon as it's ready!
        </p>
      </div>
    </div>
  );
}

/**
 * Skeleton card matching .media-card in Discover feed with randomized masonry heights.
 */
export function MediaCardSkeleton({ index = 0 }: { index?: number }) {
  // Pre-determined heights to prevent layout shifts while keeping natural masonry variations
  const heights = [220, 310, 190, 270, 240, 340, 200, 280];
  const thumbHeight = heights[index % heights.length];

  return (
    <div className="media-card skeleton-card">
      <div className="media-card-thumb" style={{ height: thumbHeight }}>
        <Skeleton height="100%" borderRadius={0} />
      </div>
      <div className="media-card-body">
        <Skeleton height="14px" width={`${65 + ((index * 13) % 30)}%`} style={{ marginBottom: '8px' }} />
        <div className="media-card-meta">
          <Skeleton height="12px" width="55px" />
          <div className="card-reactions-bar">
            <Skeleton height="22px" width="40px" borderRadius="12px" />
            <Skeleton height="22px" width="40px" borderRadius="12px" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton grid matching .media-grid.
 */
export function MediaGridSkeleton({ count = 8, isWakingUp = false }: { count?: number; isWakingUp?: boolean }) {
  return (
    <div className="skeleton-grid-wrapper">
      {isWakingUp && <ServerWakeupBanner />}
      <div className="media-grid">
        {Array.from({ length: count }).map((_, idx) => (
          <MediaCardSkeleton key={idx} index={idx} />
        ))}
      </div>
    </div>
  );
}

/**
 * Full faithful skeleton for Discover's Featured & Popular carousel shelf.
 */
export function FeaturedHeroSkeleton() {
  return (
    <section className="shelf skeleton-shelf">
      <h3 className="shelf-title">Featured &amp; Popular</h3>
      <div className="featured-stage">
        <button className="featured-arrow" disabled style={{ opacity: 0.4, cursor: 'default' }}>
          <ChevronLeft size={22} />
        </button>

        <div className="featured-card skeleton-featured-card" style={{ cursor: 'default' }}>
          <div className="featured-media">
            <Skeleton height="100%" width="100%" borderRadius={0} />
          </div>

          <div className="featured-side">
            <Skeleton height="12px" width="90px" borderRadius="var(--radius-pill)" />
            <Skeleton height="24px" width="85%" style={{ marginTop: '0.35rem' }} />
            <Skeleton height="18px" width="55%" style={{ marginTop: '0.15rem' }} />

            <div className="card-tag-chips" style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem' }}>
              <Skeleton height="20px" width="55px" borderRadius="var(--radius-pill)" />
              <Skeleton height="20px" width="68px" borderRadius="var(--radius-pill)" />
              <Skeleton height="20px" width="50px" borderRadius="var(--radius-pill)" />
            </div>

            <div className="featured-stats" style={{ display: 'flex', gap: '1rem', marginTop: '0.4rem' }}>
              <Skeleton height="13px" width="45px" />
              <Skeleton height="13px" width="45px" />
              <Skeleton height="13px" width="60px" />
            </div>

            <Skeleton
              height="36px"
              width="140px"
              borderRadius="var(--radius)"
              style={{ marginTop: 'auto' }}
            />
          </div>
        </div>

        <button className="featured-arrow" disabled style={{ opacity: 0.4, cursor: 'default' }}>
          <ChevronRight size={22} />
        </button>
      </div>

      <div className="featured-dots">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={`featured-dot-skeleton ${i === 0 ? 'active' : ''}`}
            style={{
              display: 'inline-block',
              width: i === 0 ? '22px' : '8px',
              height: '8px',
              borderRadius: '4px',
              background: i === 0 ? 'var(--accent)' : 'var(--border)',
              transition: 'all 0.2s ease',
            }}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * Full faithful skeleton for Browse by Tag shelf.
 */
export function BrowseByTagSkeleton() {
  const dummyTags = [
    { name: 'gaming', count: '14 memes' },
    { name: 'reaction', count: '28 memes' },
    { name: 'wholesome', count: '9 memes' },
    { name: 'cats', count: '17 memes' },
    { name: 'dank', count: '31 memes' },
    { name: 'relatable', count: '12 memes' },
    { name: 'classic', count: '8 memes' },
  ];

  return (
    <section className="shelf skeleton-shelf">
      <h3 className="shelf-title">Browse by Tag</h3>
      <div className="tag-tile-row">
        {dummyTags.map((_, idx) => (
          <div
            key={idx}
            className="tag-tile skeleton-tag-tile"
            style={{ pointerEvents: 'none', cursor: 'default' }}
          >
            <Skeleton height="14px" width="65px" style={{ marginBottom: '4px' }} />
            <Skeleton height="11px" width="40px" />
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Complete, faithful skeleton for the entire Discover view layout:
 * 1) Featured Carousel shelf
 * 2) Browse by Tag shelf
 * 3) Community Feed shelf with tabs and masonry grid
 */
export function DiscoverSectionsSkeleton({
  isWakingUp = false,
  feedTab = 'new',
  filter = 'all',
}: {
  isWakingUp?: boolean;
  feedTab?: 'new' | 'top';
  filter?: string;
}) {
  return (
    <div className="skeleton-grid-wrapper">
      {isWakingUp && <ServerWakeupBanner />}

      {/* 1. Featured & Popular */}
      <FeaturedHeroSkeleton />

      {/* 2. Browse by Tag */}
      <BrowseByTagSkeleton />

      {/* 3. Community Feed */}
      <section className="shelf">
        <div className="feed-bar">
          <div className="feed-tabs" role="tablist">
            <button className={`feed-tab ${feedTab === 'new' ? 'active' : ''}`} disabled>
              New Releases
            </button>
            <button className={`feed-tab ${feedTab === 'top' ? 'active' : ''}`} disabled>
              Top Rated
            </button>
          </div>

          <div className="filter-pill-group">
            <button className={`filter-pill ${filter === 'all' ? 'active' : ''}`} disabled>
              All
            </button>
            <button className={`filter-pill ${filter === 'image' ? 'active' : ''}`} disabled>
              Images
            </button>
            <button className={`filter-pill ${filter === 'video' ? 'active' : ''}`} disabled>
              Videos &amp; GIFs
            </button>
          </div>
        </div>

        <div className="media-grid">
          {Array.from({ length: 8 }).map((_, idx) => (
            <MediaCardSkeleton key={idx} index={idx} />
          ))}
        </div>
      </section>
    </div>
  );
}

/**
 * Skeleton grid for Library view.
 */
export function LibraryGridSkeleton({
  count = 12,
  viewMode = 'tiles',
  isWakingUp = false,
}: {
  count?: number;
  viewMode?: 'tiles' | 'mosaic';
  isWakingUp?: boolean;
}) {
  return (
    <div className="skeleton-grid-wrapper">
      {isWakingUp && <ServerWakeupBanner />}
      <div className={`lib-grid ${viewMode}`}>
        {Array.from({ length: count }).map((_, idx) => (
          <div key={idx} className="lib-tile skeleton-tile">
            <Skeleton
              height={viewMode === 'tiles' ? '100%' : `${160 + ((idx * 25) % 120)}px`}
              borderRadius="var(--radius)"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Full faithful skeleton grid for Modular Collections:
 * - Shows the "+ Create a new collection" tile
 * - Followed by 5-7 deck cards with real 2x2 rotated mosaic layout and labels
 */
export function DeckGridSkeleton({
  count = 5,
  isWakingUp = false,
  onCreateClick,
}: {
  count?: number;
  isWakingUp?: boolean;
  onCreateClick?: () => void;
}) {
  return (
    <div className="skeleton-grid-wrapper">
      {isWakingUp && <ServerWakeupBanner />}
      <div className="deck-grid">
        <button
          className="deck-tile deck-create"
          onClick={onCreateClick}
          type="button"
        >
          <Plus size={30} />
          <span>Create a new collection</span>
        </button>

        {Array.from({ length: count }).map((_, idx) => (
          <div
            key={idx}
            className="deck-tile skeleton-deck-tile"
            style={{ pointerEvents: 'none', cursor: 'default' }}
          >
            <div className="deck-mosaic">
              <Skeleton height="100%" borderRadius={0} />
              <Skeleton height="100%" borderRadius={0} />
              <Skeleton height="100%" borderRadius={0} />
              <Skeleton height="100%" borderRadius={0} />
            </div>
            <div className="deck-shade" />
            <div className="deck-label">
              <Skeleton height="15px" width="70%" style={{ marginBottom: '6px' }} />
              <Skeleton height="11px" width="38%" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Skeleton for user profile page.
 */
export function ProfileSkeleton({ isWakingUp = false }: { isWakingUp?: boolean }) {
  return (
    <div className="skeleton-grid-wrapper" style={{ maxWidth: '960px', margin: '0 auto', width: '100%' }}>
      {isWakingUp && <ServerWakeupBanner />}
      <div className="profile-hero" style={{ display: 'flex', gap: '1.5rem', marginBottom: '2rem', alignItems: 'center' }}>
        <Skeleton width="96px" height="96px" borderRadius="var(--radius-pill)" />
        <div style={{ flex: 1 }}>
          <Skeleton height="24px" width="220px" style={{ marginBottom: '10px' }} />
          <Skeleton height="14px" width="320px" style={{ marginBottom: '8px' }} />
          <div style={{ display: 'flex', gap: '1.5rem', marginTop: '12px' }}>
            <Skeleton height="16px" width="70px" />
            <Skeleton height="16px" width="70px" />
            <Skeleton height="16px" width="70px" />
          </div>
        </div>
      </div>
      <div className="lib-grid tiles">
        {Array.from({ length: 6 }).map((_, idx) => (
          <div key={idx} className="lib-tile skeleton-tile">
            <Skeleton height="100%" borderRadius="var(--radius)" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Faithful skeleton for the Community & Friends view (activity list or user cards grid).
 */
export function CommunitySkeleton({
  mode = 'feed',
  isWakingUp = false,
}: {
  mode?: 'feed' | 'users';
  isWakingUp?: boolean;
}) {
  return (
    <div className="skeleton-grid-wrapper">
      {isWakingUp && <ServerWakeupBanner />}
      {mode === 'feed' ? (
        <ul className="activity-list" style={{ pointerEvents: 'none' }}>
          {Array.from({ length: 6 }).map((_, idx) => (
            <li key={idx} className="activity-item">
              <Skeleton width="38px" height="38px" borderRadius="var(--radius-round)" />
              <div style={{ flex: 1 }}>
                <Skeleton height="14px" width={`${55 + ((idx * 17) % 30)}%`} style={{ marginBottom: '6px' }} />
                <Skeleton height="11px" width="80px" />
              </div>
              <Skeleton width="52px" height="52px" borderRadius="3px" />
            </li>
          ))}
        </ul>
      ) : (
        <div className="community-user-grid">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="community-user-card" style={{ pointerEvents: 'none' }}>
              <div className="community-user-head">
                <Skeleton width="48px" height="48px" borderRadius="var(--radius-round)" />
                <div style={{ flex: 1 }}>
                  <Skeleton height="16px" width="130px" style={{ marginBottom: '6px' }} />
                  <Skeleton height="12px" width="90px" />
                </div>
              </div>
              <Skeleton height="13px" width="90%" style={{ margin: '0.6rem 0' }} />
              <div className="community-user-actions" style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
                <Skeleton height="32px" width="110px" borderRadius="var(--radius)" />
                <Skeleton height="32px" width="85px" borderRadius="var(--radius)" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


