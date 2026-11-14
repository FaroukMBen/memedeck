import type { ActivityItem } from '../lib/api';
import { MediaThumbnail } from './MediaThumbnail';

interface ActivityListProps {
  items: ActivityItem[];
  onNavigateToUser?: (userId: string) => void;
}

function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function describe(item: ActivityItem): string {
  const title = item.media?.title ? `"${item.media.title}"` : 'a meme';
  switch (item.type) {
    case 'upload':
      return `uploaded ${title}`;
    case 'fork':
      return `added ${title} to their library`;
    case 'like':
      return `liked ${title}`;
    case 'collection':
      return `created the deck "${item.collection?.title ?? 'Untitled'}"`;
  }
}

/** A vertical list of activity entries: who did what, when, with a thumbnail. */
export function ActivityList({ items, onNavigateToUser }: ActivityListProps) {
  return (
    <ul className="activity-list">
      {items.map((item) => (
        <li key={item.id} className="activity-item">
          {item.actor.avatar_url ? (
            <img src={item.actor.avatar_url} alt="" className="pf-avatar pf-avatar-sm" />
          ) : (
            <span className="pf-avatar pf-avatar-fallback pf-avatar-sm" aria-hidden="true">
              {(item.actor.username || '?').charAt(0).toUpperCase()}
            </span>
          )}

          <p className="activity-text">
            <button className="activity-actor" onClick={() => onNavigateToUser?.(item.actor.id)}>
              {item.actor.username || 'Someone'}
            </button>{' '}
            {describe(item)}
            <time dateTime={item.created_at}>{timeAgo(item.created_at)}</time>
          </p>

          {item.media && (
            <div className="activity-thumb">
              <MediaThumbnail
                url={item.media.file_url}
                fileType={item.media.file_type}
                sourceFormat={item.media.source_format}
                showBadge={false}
              />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
